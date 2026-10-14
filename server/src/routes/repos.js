import { Router } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { CONFIG_DIR, load, update } from '../config.js';
import * as git from '../git.js';
import { api } from '../gitlab.js';
import { currentBranch, findRepos } from '../scan.js';
import { TARGETS, openIn, webUrl } from '../open.js';
import { lastFetch, markFetched } from '../autofetch.js';
import { accountForHost, gitlabInstances } from '../accounts.js';
import { gh, ownerRepo, pickPull } from '../github.js';
import { suggest } from '../commitmsg.js';
import * as commitSettings from '../commitSettings.js';

const r = Router();

const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });

function getRepo(id) {
  const repo = load().repos.find((x) => x.id === id);
  if (!repo) throw bad('Repositorio no encontrado', 404);
  if (!fs.existsSync(repo.path)) throw bad(`La carpeta ya no existe: ${repo.path}`, 404);
  return repo;
}

// Las rutas de archivo vienen del cliente: se pasan tras "--" para que git nunca las
// interprete como opciones, y se valida que no salgan del repositorio.
function safePaths(repo, files) {
  const list = Array.isArray(files) ? files : [files];
  for (const f of list) {
    const abs = path.resolve(repo.path, f);
    const root = path.resolve(repo.path);
    if (abs !== root && !abs.startsWith(root + path.sep)) throw bad(`Ruta inválida: ${f}`);
  }
  return list;
}

const BRANCH_RE = /^(?!-)[^\s~^:?*\[\\]+$/;
function safeRef(name) {
  if (!name || !BRANCH_RE.test(name)) throw bad(`Nombre de rama inválido: ${name}`);
  return name;
}

const HASH_RE = /^[0-9a-f]{4,40}$/i;
function safeHash(h) {
  if (!h || !HASH_RE.test(h)) throw bad('Hash inválido');
  return h;
}

// stash@{n}: solo se acepta el índice numérico que envía el cliente.
function stashRef(index) {
  const n = Number(index);
  if (!Number.isInteger(n) || n < 0) throw bad('Stash inválido');
  return `stash@{${n}}`;
}

async function conflictFiles(repo) {
  const s = await git.status(repo.path);
  return s.files.filter((f) => f.conflict).map((f) => f.path);
}

// Ejecuta una operación que puede dejar conflictos (merge, pull, stash apply, revert, cherry-pick…).
// Si los deja, responde 409 con la lista de archivos para que el cliente ofrezca resolverlos.
async function withConflicts(repo, res, fn, msg) {
  try {
    const { stdout = '', stderr = '' } = await fn();
    res.json({ output: (stdout + stderr).trim() });
  } catch (e) {
    const conflicts = await conflictFiles(repo);
    if (conflicts.length) {
      return res.status(409).json({ error: msg || 'La operación dejó conflictos. Resuélvelos y continúa, o abórtala.', conflicts, operation: await git.operation(repo.path), details: e.message });
    }
    throw e;
  }
}

function addRepo(dir, extra = {}) {
  const abs = path.resolve(dir);
  const existing = load().repos.find((x) => path.resolve(x.path) === abs);
  if (existing) return existing;
  const repo = { id: crypto.randomUUID(), name: path.basename(abs), path: abs, ...extra };
  update((c) => c.repos.push(repo));
  return repo;
}

// ---------- lista ----------
// Índice ligero para el buscador global: nombre, ruta y rama sin ejecutar git.
r.get('/index', async (req, res) => {
  const repos = await Promise.all(load().repos.map(async (repo) => {
    const missing = !fs.existsSync(repo.path);
    return { id: repo.id, name: repo.name, path: repo.path, missing, branch: missing ? null : await currentBranch(repo.path) };
  }));
  res.json(repos);
});

r.get('/', async (req, res) => {
  const repos = await Promise.all(load().repos.map(async (repo) => {
    if (!fs.existsSync(repo.path)) return { ...repo, missing: true };
    try {
      const [s, last] = await Promise.all([
        git.status(repo.path),
        git.run(repo.path, ['log', '-1', '--format=%aI%x00%an%x00%s']).then(({ stdout }) => {
          const [date, author, subject] = stdout.trim().split('\0');
          return date ? { date, author, subject } : null;
        }).catch(() => null), // repositorio sin commits
      ]);
      return {
        ...repo, branch: s.branch, upstream: s.upstream, ahead: s.ahead, behind: s.behind, changes: s.files.length,
        lastCommit: last, fetchedAt: lastFetch(repo.id),
      };
    } catch (e) {
      return { ...repo, error: e.message };
    }
  }));
  res.json({ repos, defaultCloneDir: load().defaultCloneDir });
});

r.post('/add', async (req, res) => {
  const dir = req.body?.path;
  if (!dir || !fs.existsSync(dir)) throw bad('La carpeta no existe');
  if (!(await git.isRepo(dir))) throw bad('La carpeta no es un repositorio git');
  const { stdout } = await git.run(dir, ['rev-parse', '--show-toplevel']);
  res.json(addRepo(stdout.trim()));
});

// ---------- búsqueda de repositorios dentro de una carpeta ----------
r.post('/scan', async (req, res) => {
  const dir = req.body?.path;
  if (!dir || !fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) throw bad('La carpeta no existe');
  const root = path.resolve(dir);
  const known = new Set(load().repos.map((x) => path.resolve(x.path).toLowerCase()));
  const result = await findRepos(root);
  const repos = result.repos.map((x) => ({
    ...x,
    name: path.basename(x.path),
    relative: path.relative(root, x.path) || '.',
    added: known.has(x.path.toLowerCase()),
  }));
  res.json({ root, ...result, repos });
});

r.post('/add-many', async (req, res) => {
  const paths = Array.isArray(req.body?.paths) ? req.body.paths : [];
  const added = [], failed = [];
  for (const p of paths) {
    try {
      if (!fs.existsSync(p) || !(await git.isRepo(p))) throw new Error('No es un repositorio git');
      const { stdout } = await git.run(p, ['rev-parse', '--show-toplevel']);
      added.push(addRepo(stdout.trim()));
    } catch (e) { failed.push({ path: p, error: e.message }); }
  }
  res.json({ added, failed });
});

r.post('/clone', async (req, res) => {
  const { url, dir, gitlabProjectId, gitlabInstance } = req.body || {};
  if (!url || !/^(https?:\/\/|git@|ssh:\/\/)/.test(url)) throw bad('URL de clonado inválida');
  const parent = dir || load().defaultCloneDir;
  const name = url.replace(/\.git$/, '').split(/[/:]/).pop();
  const dest = path.resolve(parent, name);
  if (fs.existsSync(dest) && fs.readdirSync(dest).length) throw bad(`La carpeta destino ya existe y no está vacía: ${dest}`);
  await git.clone(url, dest);
  const instance = gitlabInstance && gitlabInstance !== 'main' && gitlabInstances().some((i) => i.id === gitlabInstance) ? gitlabInstance : undefined;
  res.json(addRepo(dest, gitlabProjectId ? { gitlabProjectId, ...(instance ? { gitlabInstance: instance } : {}) } : {}));
});

// Ajustes generales del servidor (pantalla Configuración): carpeta de clonado y dónde se guardan los datos.
r.get('/settings', (req, res) => res.json({ defaultCloneDir: load().defaultCloneDir, configDir: CONFIG_DIR }));

// Convenciones de commit: generales y por repositorio (own = null usa las generales).
r.get('/commit-settings', (req, res) => res.json({ global: commitSettings.globalSettings(), defaults: commitSettings.DEFAULTS }));
r.put('/commit-settings', (req, res) => res.json({ global: commitSettings.saveGlobal(req.body?.global || {}) }));

r.put('/settings', (req, res) => {
  const { defaultCloneDir } = req.body || {};
  if (defaultCloneDir) update((c) => { c.defaultCloneDir = path.resolve(defaultCloneDir); });
  res.json({ defaultCloneDir: load().defaultCloneDir, configDir: CONFIG_DIR });
});

r.post('/remove-many', (req, res) => {
  // Solo se quitan de la lista; nunca se borran archivos del disco.
  const ids = new Set(Array.isArray(req.body?.ids) ? req.body.ids : []);
  let removed = 0;
  update((c) => { const before = c.repos.length; c.repos = c.repos.filter((x) => !ids.has(x.id)); removed = before - c.repos.length; });
  res.json({ removed });
});

// ---------- favoritos y etiquetas ----------
const cleanLabels = (list) => [...new Set((Array.isArray(list) ? list : []).map((l) => String(l).trim().slice(0, 30)).filter(Boolean))].slice(0, 20);

// Todas las etiquetas en uso (para sugerirlas al etiquetar desde el detalle de un repositorio).
r.get('/labels', (req, res) => {
  res.json([...new Set(load().repos.flatMap((x) => x.labels || []))].sort((a, b) => a.localeCompare(b, 'es')));
});

r.put('/:id/meta', (req, res) => {
  const { favorite, labels } = req.body || {};
  let out = null;
  update((c) => {
    const x = c.repos.find((y) => y.id === req.params.id);
    if (!x) return;
    if (typeof favorite === 'boolean') x.favorite = favorite;
    if (labels !== undefined) x.labels = cleanLabels(labels);
    out = { id: x.id, favorite: !!x.favorite, labels: x.labels || [] };
  });
  if (!out) throw bad('Repositorio no encontrado', 404);
  res.json(out);
});

// En lote: añade y/o quita etiquetas, o marca/desmarca favoritos en varios repos.
r.post('/meta-many', (req, res) => {
  const { ids, add, remove, favorite } = req.body || {};
  const set = new Set(Array.isArray(ids) ? ids : []);
  const addL = cleanLabels(add), removeL = new Set(cleanLabels(remove));
  let changed = 0;
  update((c) => {
    for (const x of c.repos) {
      if (!set.has(x.id)) continue;
      if (typeof favorite === 'boolean') x.favorite = favorite;
      x.labels = cleanLabels([...(x.labels || []).filter((l) => !removeL.has(l)), ...addL]);
      changed++;
    }
  });
  res.json({ changed });
});

r.delete('/:id', (req, res) => {
  // Solo se quita de la lista; nunca se borran archivos del disco.
  update((c) => { c.repos = c.repos.filter((x) => x.id !== req.params.id); });
  res.json({ ok: true });
});

// ---------- estado y cambios ----------
r.get('/:id/status', async (req, res) => {
  const repo = getRepo(req.params.id);
  const [st, url, operation, stashes] = await Promise.all([
    git.status(repo.path), git.remoteUrl(repo.path).catch(() => null), git.operation(repo.path),
    git.run(repo.path, ['stash', 'list', '--format=%gd']).then(({ stdout }) => stdout.split('\n').filter(Boolean).length).catch(() => 0),
  ]);
  res.json({ ...repo, ...st, remote: remoteInfo(url, repo), operation, stashes });
});

// Describe el remoto origin: dirección web, host y si pertenece a la instancia de GitLab configurada.
function remoteInfo(url, repo) {
  const web = webUrl(url);
  if (!web) return null;
  const host = new URL(web).host;
  let glHost = null;
  try { glHost = new URL(load().gitlab?.url).host; } catch { /* sin GitLab configurado */ }
  const extraGl = accountForHost(host, 'gitlab');
  const ghAcc = accountForHost(host, 'github');
  const isGithub = !!ghAcc || /(^|\.)github\.com$/i.test(host);
  const provider = host === glHost || repo.gitlabProjectId || extraGl ? 'gitlab' : isGithub ? 'github' : 'other';
  return {
    web, host, provider, gitlabHost: glHost,
    instance: provider === 'gitlab' ? (extraGl ? extraGl.id : 'main') : null,
    account: provider === 'github' ? (ghAcc ? { id: ghAcc.id, user: ghAcc.user?.username } : null) : null,
  };
}

r.get('/:id/diff', async (req, res) => {
  const repo = getRepo(req.params.id);
  const { file, staged, untracked } = req.query;
  if (!file) throw bad('Falta el archivo');
  safePaths(repo, file);
  if (untracked === 'true') {
    // Archivo nuevo: muestra todo su contenido como añadido.
    const abs = path.join(repo.path, file);
    const content = fs.statSync(abs).size > 2_000_000 ? '(archivo demasiado grande)\n' : fs.readFileSync(abs, 'utf8');
    const lines = content.split('\n');
    return res.json({ diff: `--- /dev/null\n+++ b/${file}\n@@ -0,0 +1,${lines.length} @@\n${lines.map((l) => '+' + l).join('\n')}` });
  }
  const args = ['diff', '--no-color', '--no-ext-diff'];
  if (staged === 'true') args.push('--cached');
  const { stdout } = await git.run(repo.path, [...args, '--', file]);
  res.json({ diff: stdout });
});

r.post('/:id/stage', async (req, res) => {
  const repo = getRepo(req.params.id);
  const { files, all } = req.body || {};
  await git.run(repo.path, all ? ['add', '-A'] : ['add', '--', ...safePaths(repo, files)]);
  res.json({ ok: true });
});

r.post('/:id/unstage', async (req, res) => {
  const repo = getRepo(req.params.id);
  const { files, all } = req.body || {};
  // "restore --staged" falla en repos sin commits; en ese caso se usa "rm --cached".
  try {
    await git.run(repo.path, all ? ['restore', '--staged', ':/'] : ['restore', '--staged', '--', ...safePaths(repo, files)]);
  } catch {
    await git.run(repo.path, all ? ['rm', '-r', '--cached', '-q', '.'] : ['rm', '--cached', '-q', '--', ...safePaths(repo, files)]);
  }
  res.json({ ok: true });
});

r.post('/:id/discard', async (req, res) => {
  const repo = getRepo(req.params.id);
  const { files, untracked } = req.body || {};
  const list = safePaths(repo, files);
  if (untracked) await git.run(repo.path, ['clean', '-f', '--', ...list]);
  else await git.run(repo.path, ['restore', '--worktree', '--', ...list]);
  res.json({ ok: true });
});

// Aplica un parche parcial (líneas o bloques elegidos en el diff).
// stage: al índice · unstage: lo quita del índice · discard: lo revierte en el árbol de trabajo.
r.post('/:id/apply-patch', async (req, res) => {
  const repo = getRepo(req.params.id);
  const { patch, mode } = req.body || {};
  if (typeof patch !== 'string' || !patch.startsWith('diff --git ')) throw bad('Parche inválido');
  const MODES = { stage: ['--cached'], unstage: ['--cached', '--reverse'], discard: ['--reverse'] };
  if (!MODES[mode]) throw bad('Modo inválido');
  // git apply rechaza rutas fuera del repositorio; --recount recalcula las cabeceras de cada bloque.
  await git.run(repo.path, ['apply', ...MODES[mode], '--recount', '--whitespace=nowarn', '-'], { input: patch });
  res.json({ ok: true });
});

r.post('/:id/commit', async (req, res) => {
  const repo = getRepo(req.params.id);
  const { message, amend, stageAll } = req.body || {};
  if (!message?.trim() && !amend) throw bad('El mensaje del commit es obligatorio');
  if (stageAll) await git.run(repo.path, ['add', '-A']);
  const args = ['commit'];
  if (amend) args.push('--amend');
  if (message?.trim()) args.push('-m', message);
  else args.push('--no-edit');
  const { stdout } = await git.run(repo.path, args);
  res.json({ output: stdout });
});

// Deshace el último commit con reset suave: sus cambios vuelven a quedar preparados.
r.post('/:id/undo-commit', async (req, res) => {
  const repo = getRepo(req.params.id);
  const { stdout: head } = await git.run(repo.path, ['log', '-1', '--format=%h%x00%B']);
  const [short, message = ''] = head.split('\0');
  try { await git.run(repo.path, ['rev-parse', '--verify', '--quiet', 'HEAD~1']); }
  catch { throw bad('Es el primer commit del repositorio; no se puede deshacer con un reset suave'); }
  const { stdout: remotes } = await git.run(repo.path, ['branch', '-r', '--contains', 'HEAD']);
  const pushed = remotes.split('\n').map((l) => l.trim()).filter(Boolean);
  if (pushed.length && !req.body?.force) {
    return res.status(409).json({ error: `El commit ${short} ya está en ${pushed.join(', ')}. Si lo deshaces, tendrás que hacer push --force.`, pushed });
  }
  await git.run(repo.path, ['reset', '--soft', 'HEAD~1']);
  res.json({ output: `Commit ${short} deshecho; sus cambios quedan preparados`, message: message.trim() });
});

// Si el commit no aporta cambios a la rama actual, git deja el revert/cherry-pick a medias: se cancela y se explica.
const emptyGuard = (repo, op) => async (e) => {
  if (/nothing to commit|is now empty|nothing added to commit/i.test(e.message)) {
    await git.run(repo.path, [op, '--abort']).catch(() => {});
    throw bad(op === 'revert' ? 'Los cambios de ese commit ya no están en la rama actual; no hay nada que revertir' : 'Los cambios de ese commit ya están en la rama actual; no hay nada que aplicar');
  }
  throw e;
};

// En un commit de merge hay que indicar el padre principal (-m 1).
async function mainlineArgs(repo, hash) {
  const { stdout } = await git.run(repo.path, ['rev-list', '--parents', '-n1', hash]);
  return stdout.trim().split(' ').length > 2 ? ['-m', '1'] : [];
}

r.post('/:id/revert', async (req, res) => {
  const repo = getRepo(req.params.id);
  const hash = safeHash(req.body?.hash);
  const m = await mainlineArgs(repo, hash);
  await withConflicts(repo, res, () => git.run(repo.path, ['revert', '--no-edit', ...m, hash]).catch(emptyGuard(repo, 'revert')), 'El revert tiene conflictos. Resuélvelos y continúa, o abórtalo.');
});

r.post('/:id/cherry-pick', async (req, res) => {
  const repo = getRepo(req.params.id);
  const hash = safeHash(req.body?.hash);
  const m = await mainlineArgs(repo, hash);
  await withConflicts(repo, res, () => git.run(repo.path, ['cherry-pick', ...m, hash]).catch(emptyGuard(repo, 'cherry-pick')), 'El cherry-pick tiene conflictos. Resuélvelos y continúa, o abórtalo.');
});

// ---------- stash ----------
r.get('/:id/stashes', async (req, res) => {
  const repo = getRepo(req.params.id);
  const { stdout } = await git.run(repo.path, ['stash', 'list', '--format=%gd%x00%H%x00%gs%x00%aI']);
  res.json(stdout.split('\n').filter(Boolean).map((l, index) => {
    const [ref, hash, subject, date] = l.split('\0');
    const m = subject.match(/^(?:WIP on|On) ([^:]+): (.*)$/);
    return { index, ref, hash, date, branch: m?.[1] || null, message: m?.[2] || subject, auto: subject.startsWith('WIP on') };
  }));
});

r.get('/:id/stash/:index', async (req, res) => {
  const repo = getRepo(req.params.id);
  const ref = stashRef(req.params.index);
  const { stdout } = await git.run(repo.path, ['stash', 'show', '-p', '--no-color', '--include-untracked', ref]);
  res.json({ diff: stdout });
});

r.post('/:id/stash', async (req, res) => {
  const repo = getRepo(req.params.id);
  const { message, includeUntracked = true, keepIndex } = req.body || {};
  const args = ['stash', 'push', ...(includeUntracked ? ['--include-untracked'] : []), ...(keepIndex ? ['--keep-index'] : [])];
  if (message?.trim()) args.push('-m', message.trim());
  const { stdout, stderr } = await git.run(repo.path, args);
  const output = (stdout + stderr).trim();
  if (/No local changes to save/i.test(output)) throw bad('No hay cambios que guardar en el stash');
  res.json({ output });
});

r.post('/:id/stash/:index/apply', async (req, res) => {
  const repo = getRepo(req.params.id);
  const ref = stashRef(req.params.index);
  const pop = !!req.body?.pop;
  await withConflicts(repo, res, () => git.run(repo.path, ['stash', pop ? 'pop' : 'apply', ref]),
    `El stash se aplicó con conflictos.${pop ? ' Se conserva en la lista hasta que lo descartes.' : ''} Resuélvelos y marca los archivos como resueltos.`);
});

r.post('/:id/stash/:index/drop', async (req, res) => {
  const repo = getRepo(req.params.id);
  const { stdout } = await git.run(repo.path, ['stash', 'drop', stashRef(req.params.index)]);
  res.json({ output: stdout.trim() });
});

// ---------- conflictos ----------
async function conflictStages(repo, file) {
  const { stdout } = await git.run(repo.path, ['ls-files', '-u', '--', file]);
  return stdout.split('\n').filter(Boolean).map((l) => Number(l.split(/\s+/)[2]));
}

r.get('/:id/conflict', async (req, res) => {
  const repo = getRepo(req.params.id);
  const file = req.query.file;
  if (!file) throw bad('Falta el archivo');
  safePaths(repo, file);
  const abs = path.join(repo.path, file);
  const exists = fs.existsSync(abs);
  if (exists && fs.statSync(abs).size > 2_000_000) throw bad('El archivo es demasiado grande para resolverlo aquí');
  // Si una de las partes eliminó el archivo, git no deja marcadores: se informa para elegir una versión completa.
  const stages = await conflictStages(repo, file);
  res.json({ file, exists, content: exists ? fs.readFileSync(abs, 'utf8') : '', ours: stages.includes(2), theirs: stages.includes(3), operation: await git.operation(repo.path) });
});

// Resuelve un archivo: con "side" toma una versión completa (ours/theirs); con "content" guarda el texto editado.
r.post('/:id/conflict/resolve', async (req, res) => {
  const repo = getRepo(req.params.id);
  const { file, side, content } = req.body || {};
  if (!file) throw bad('Falta el archivo');
  safePaths(repo, file);
  if (side === 'ours' || side === 'theirs') {
    if (!(await conflictStages(repo, file)).includes(side === 'ours' ? 2 : 3)) {
      await git.run(repo.path, ['rm', '-q', '--', file]); // esa versión eliminó el archivo
      return res.json({ ok: true });
    }
    await git.run(repo.path, ['checkout', `--${side}`, '--', file]);
  } else if (typeof content === 'string') {
    if (/^(<{7}|>{7})( |$)/m.test(content)) throw bad('El archivo todavía tiene marcadores de conflicto (<<<<<<< o >>>>>>>)');
    fs.writeFileSync(path.join(repo.path, file), content, 'utf8');
  } else throw bad('Indica la versión o el contenido resuelto');
  await git.run(repo.path, ['add', '--', file]);
  res.json({ ok: true });
});

// Continúa o aborta la operación en curso (merge, rebase, cherry-pick o revert).
r.post('/:id/operation', async (req, res) => {
  const repo = getRepo(req.params.id);
  const action = req.body?.action;
  const op = await git.operation(repo.path);
  if (!op) throw bad('No hay ninguna operación en curso');
  if (action === 'abort') {
    await git.run(repo.path, [op, '--abort']);
    return res.json({ output: `${op} abortado` });
  }
  if (action !== 'continue') throw bad('Acción inválida');
  const pending = await conflictFiles(repo);
  if (pending.length) return res.status(409).json({ error: 'Aún quedan archivos en conflicto', conflicts: pending, operation: op });
  const args = op === 'merge' ? ['commit', '--no-edit'] : [op, '--continue'];
  await withConflicts(repo, res, () => git.run(repo.path, args, { env: git.noEditorEnv() }), 'El siguiente paso también tiene conflictos. Resuélvelos y continúa.');
});

// ---------- tags ----------
r.get('/:id/tags', async (req, res) => {
  const repo = getRepo(req.params.id);
  const { stdout } = await git.run(repo.path, ['for-each-ref', 'refs/tags', '--sort=-creatordate',
    '--format=%(refname:short)%00%(objecttype)%00%(objectname:short)%00%(*objectname:short)%00%(creatordate:iso8601-strict)%00%(contents:subject)%00%(*subject)%00%(taggername)']);
  res.json(stdout.split('\n').filter(Boolean).map((l) => {
    const [name, type, obj, target, date, subject, commitSubject, tagger] = l.split('\0');
    const annotated = type === 'tag';
    return { name, annotated, commit: annotated ? target : obj, date, message: annotated ? subject : '', subject: annotated ? commitSubject : subject, tagger: annotated ? tagger : null };
  }));
});

// Tags del remoto origin (consulta de red): para saber cuáles faltan por publicar.
r.get('/:id/tags/remote', async (req, res) => {
  const repo = getRepo(req.params.id);
  if (!(await git.remoteUrl(repo.path))) return res.json({ names: null });
  const { stdout } = await git.runRemote(repo.path, ['ls-remote', '--tags', '--refs', 'origin']);
  res.json({ names: stdout.split('\n').filter(Boolean).map((l) => l.split('\t')[1]?.replace(/^refs\/tags\//, '')).filter(Boolean) });
});

async function safeTag(repo, name) {
  if (!name || name.startsWith('-')) throw bad(`Nombre de tag inválido: ${name}`);
  try { await git.run(repo.path, ['check-ref-format', `refs/tags/${name}`]); } catch { throw bad(`Nombre de tag inválido: ${name}`); }
  return name;
}

r.post('/:id/tags', async (req, res) => {
  const repo = getRepo(req.params.id);
  const { name, ref, message, push } = req.body || {};
  await safeTag(repo, name);
  const target = ref ? safeHash(ref) : 'HEAD';
  await git.run(repo.path, ['tag', ...(message?.trim() ? ['-a', '-m', message.trim()] : []), name, target]);
  if (push) await git.runRemote(repo.path, ['push', 'origin', `refs/tags/${name}`]);
  res.json({ output: `Tag ${name} creado${push ? ' y publicado' : ''}` });
});

r.post('/:id/tags/push', async (req, res) => {
  const repo = getRepo(req.params.id);
  const { name } = req.body || {};
  const args = name ? ['push', 'origin', `refs/tags/${await safeTag(repo, name)}`] : ['push', 'origin', '--tags'];
  const { stdout, stderr } = await git.runRemote(repo.path, args);
  res.json({ output: (stdout + stderr).trim() || 'Tags publicados' });
});

r.post('/:id/tags/delete', async (req, res) => {
  const repo = getRepo(req.params.id);
  const { name, remote } = req.body || {};
  await safeTag(repo, name);
  if (remote) await git.runRemote(repo.path, ['push', 'origin', '--delete', `refs/tags/${name}`]);
  await git.run(repo.path, ['tag', '-d', name]).catch((e) => { if (!remote) throw e; });
  res.json({ output: `Tag ${name} eliminado${remote ? ' (local y remoto)' : ''}` });
});

// ---------- remoto ----------
r.post('/:id/fetch', async (req, res) => {
  const repo = getRepo(req.params.id);
  const { stderr, stdout } = await git.runRemote(repo.path, ['fetch', '--all', '--prune']);
  markFetched(repo.id);
  res.json({ output: (stdout + stderr).trim() || 'Fetch completado' });
});

r.post('/:id/pull', async (req, res) => {
  const repo = getRepo(req.params.id);
  const { rebase, autostash } = req.body || {};
  const args = ['pull', rebase ? '--rebase' : '--no-rebase', ...(autostash ? ['--autostash'] : [])];
  await withConflicts(repo, res, () => git.runRemote(repo.path, args),
    rebase ? 'El rebase se detuvo por conflictos. Resuélvelos y continúa, o abórtalo.' : 'El pull dejó conflictos de fusión. Resuélvelos y haz commit, o aborta el merge.');
});

r.post('/:id/push', async (req, res) => {
  const repo = getRepo(req.params.id);
  const s = await git.status(repo.path);
  if (!s.branch || s.branch === '(detached)') throw bad('No estás en una rama');
  const args = ['push'];
  if (!s.upstream) args.push('-u', 'origin', s.branch);
  if (req.body?.force) args.splice(1, 0, '--force-with-lease');
  const { stderr, stdout } = await git.runRemote(repo.path, args);
  res.json({ output: (stdout + stderr).trim() });
});

// Publica una rama local en origin (aunque no sea la actual) y la deja siguiendo a origin/<rama>.
r.post('/:id/publish', async (req, res) => {
  const repo = getRepo(req.params.id);
  const branch = safeRef(req.body?.branch);
  if (branch.startsWith('origin/')) throw bad('Esa ya es una rama remota');
  const { stderr, stdout } = await git.runRemote(repo.path, ['push', '-u', 'origin', `refs/heads/${branch}:refs/heads/${branch}`]);
  res.json({ output: (stdout + stderr).trim() });
});

// ---------- abrir en el sistema ----------
r.post('/:id/open', async (req, res) => {
  const repo = getRepo(req.params.id);
  const target = req.body?.target;
  if (!TARGETS.includes(target)) throw bad('Destino no soportado');
  // Archivo y línea (desde la búsqueda): solo rutas dentro del repositorio.
  const { file, line } = req.body || {};
  if (file && target !== 'vscode') throw bad('Solo se puede abrir un archivo en VS Code');
  // En Windows VS Code se lanza a través de cmd.exe: se rechazan nombres con caracteres especiales de cmd.
  if (file && /[&|<>^%"!]/.test(file)) throw bad('Ese nombre de archivo no se puede abrir desde aquí');
  const opts = file ? { file: path.resolve(repo.path, safePaths(repo, file)[0]), line: Number.isInteger(line) && line > 0 ? line : undefined } : {};
  await openIn(target, repo.path, opts);
  res.json({ ok: true });
});

r.get('/:id/web-url', async (req, res) => {
  const repo = getRepo(req.params.id);
  const url = webUrl(await git.remoteUrl(repo.path));
  if (!url) throw bad('El repositorio no tiene un remoto web (origin)');
  res.json({ url });
});

// ---------- ramas ----------
r.get('/:id/branches', async (req, res) => {
  const repo = getRepo(req.params.id);
  const { stdout } = await git.run(repo.path, [
    'for-each-ref', '--format=%(refname)%00%(refname:short)%00%(HEAD)%00%(upstream:short)%00%(committerdate:iso8601)%00%(subject)',
    'refs/heads', 'refs/remotes',
  ]);
  const branches = stdout.split('\n').filter(Boolean).map((l) => {
    const [ref, name, head, upstream, date, subject] = l.split('\0');
    return { name, remote: ref.startsWith('refs/remotes/'), current: head === '*', upstream, date, subject };
  }).filter((b) => !b.name.endsWith('/HEAD') && b.name !== 'origin');
  res.json(branches);
});

// Rama base para decidir qué está fusionado: la rama por defecto del remoto (origin/HEAD) o main/master/develop.
const PROTECTED = ['main', 'master', 'develop', 'development', 'dev', 'staging', 'production'];
async function defaultBase(repo) {
  try {
    const { stdout } = await git.run(repo.path, ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD']);
    if (stdout.trim()) return stdout.trim();
  } catch { /* sin origin/HEAD */ }
  for (const b of ['main', 'master', 'develop', 'origin/main', 'origin/master']) {
    try { await git.run(repo.path, ['rev-parse', '--verify', '--quiet', `${b}^{commit}`]); return b; } catch { /* siguiente */ }
  }
  return 'HEAD';
}

// Candidatas a limpiar: ramas locales ya fusionadas en la base o cuyo remoto ya no existe,
// y ramas remotas fusionadas (estas solo se borran si se eligen expresamente).
r.get('/:id/branches/cleanup', async (req, res) => {
  const repo = getRepo(req.params.id);
  const base = req.query.base ? await safeCommitish(repo, req.query.base) : await defaultBase(repo);
  const baseShort = base.replace(/^origin\//, '');
  const [{ stdout: refs }, { stdout: merged }, { stdout: mergedRemote }] = await Promise.all([
    git.run(repo.path, ['for-each-ref', '--format=%(refname:short)%00%(HEAD)%00%(upstream:short)%00%(upstream:track)%00%(committerdate:iso8601-strict)%00%(subject)', 'refs/heads']),
    git.run(repo.path, ['branch', '--format=%(refname:short)', '--merged', base]),
    git.run(repo.path, ['branch', '-r', '--format=%(refname:short)', '--merged', base]),
  ]);
  const mergedSet = new Set(merged.split('\n').map((x) => x.trim()).filter(Boolean));
  const local = refs.split('\n').filter(Boolean).map((l) => {
    const [name, head, upstream, track, date, subject] = l.split('\0');
    const isMerged = mergedSet.has(name);
    const gone = /\bgone\b/.test(track);
    return {
      name, current: head === '*', upstream: upstream || null, gone, merged: isMerged, date, subject,
      protected: PROTECTED.includes(name) || name === baseShort,
      // -d basta si está fusionada; si solo su remoto desapareció y no está fusionada, haría falta forzar (-D).
      needsForce: !isMerged,
    };
  }).filter((b) => !b.current && (b.merged || b.gone));
  const remote = mergedRemote.split('\n').map((x) => x.trim()).filter((n) => n.startsWith('origin/') && n !== 'origin/HEAD' && n !== 'origin' && n !== base)
    .map((name) => ({ name, branch: name.slice(7), protected: PROTECTED.includes(name.slice(7)) || name.slice(7) === baseShort }));
  res.json({ base, local, remote });
});

// Borra ramas en lote. La rama actual nunca se borra; las protegidas solo con allowProtected;
// las remotas solo si vienen en "remote" (lista explícita).
r.post('/:id/branches/delete', async (req, res) => {
  const repo = getRepo(req.params.id);
  const { local = [], remote = [], force = [], allowProtected } = req.body || {};
  if (!Array.isArray(local) || !Array.isArray(remote) || !Array.isArray(force)) throw bad('Datos inválidos');
  const s = await git.status(repo.path);
  const results = [];
  for (const name of local) {
    try {
      safeRef(name);
      if (name === s.branch) throw new Error('Es la rama actual');
      if (PROTECTED.includes(name) && !allowProtected) throw new Error('Rama protegida');
      await git.run(repo.path, ['branch', force.includes(name) ? '-D' : '-d', name]);
      results.push({ name, ok: true });
    } catch (e) { results.push({ name, ok: false, error: e.message.split('\n')[0] }); }
  }
  for (const full of remote) {
    try {
      safeRef(full);
      if (!full.startsWith('origin/')) throw new Error('Solo se borran ramas de origin');
      const name = full.slice(7);
      if (PROTECTED.includes(name) && !allowProtected) throw new Error('Rama protegida');
      await git.runRemote(repo.path, ['push', 'origin', '--delete', name]);
      results.push({ name: full, ok: true, remote: true });
    } catch (e) { results.push({ name: full, ok: false, remote: true, error: e.message.split('\n')[0] }); }
  }
  res.json({ results, deleted: results.filter((r2) => r2.ok).length, failed: results.filter((r2) => !r2.ok).length });
});

r.post('/:id/checkout', async (req, res) => {
  const repo = getRepo(req.params.id);
  const { branch, create, from, switchTo = true } = req.body || {};
  safeRef(branch);
  if (create) {
    // --no-track: una rama nueva creada desde origin/x no debe seguir a origin/x; al publicarla tendrá su propio remoto.
    const base = from ? [safeRef(from)] : [];
    if (switchTo) await git.run(repo.path, ['switch', '--no-track', '-c', branch, ...base]);
    else await git.run(repo.path, ['branch', '--no-track', branch, ...base]);
  } else if (branch.startsWith('origin/')) {
    // rama remota → crea la local que la sigue
    await git.run(repo.path, ['switch', '--track', branch]);
  } else await git.run(repo.path, ['switch', branch]);
  res.json({ ok: true });
});

r.post('/:id/merge', async (req, res) => {
  const repo = getRepo(req.params.id);
  const { branch, noFf } = req.body || {};
  safeRef(branch);
  await withConflicts(repo, res, () => git.run(repo.path, ['merge', ...(noFf ? ['--no-ff'] : []), '--no-edit', branch]),
    'Merge con conflictos. Resuélvelos y haz commit, o aborta el merge.');
});

r.post('/:id/merge/abort', async (req, res) => {
  const repo = getRepo(req.params.id);
  await git.run(repo.path, ['merge', '--abort']);
  res.json({ ok: true });
});

// ---------- historial ----------
const LOG_FORMAT = '--format=%H%x00%h%x00%an%x00%ae%x00%aI%x00%D%x00%s%x00%P%x1e';
const parseLog = (stdout) => stdout.split('\x1e').map((x) => x.trim()).filter(Boolean).map((l) => {
  const [hash, short, author, email, date, refs, subject, parents = ''] = l.split('\0');
  return { hash, short, author, email, date, refs: refs ? refs.split(', ') : [], subject, parents: parents.split(' ').filter(Boolean) };
});
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Historial con filtros: q (mensaje), author, file, since/until (AAAA-MM-DD), all (todas las ramas) y paginación (skip).
// Opciones de la búsqueda en mensajes, como en VS Code: qCase (distinguir mayúsculas), qWord (palabra completa)
// y qRegex (expresión regular). Git aplica el tipo de patrón y -i también al autor.
// Sin filtros se usa orden topológico para que el gráfico de ramas sea coherente.
r.get('/:id/log', async (req, res) => {
  const repo = getRepo(req.params.id);
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const skip = Math.max(Number(req.query.skip) || 0, 0);
  const { q, author, file, since, until } = req.query;
  const args = ['log', `-n${limit + 1}`, `--skip=${skip}`, LOG_FORMAT];
  const filtered = !!(q || author || file || since || until);
  args.push(filtered ? '--date-order' : '--topo-order');
  if (req.query.all === 'true') args.push('--all');
  const ere = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const useEre = !!q && (req.query.qWord === '1' || req.query.qRegex === '1');
  if ((q && req.query.qCase !== '1') || (!q && author)) args.push('-i');
  args.push(useEre ? '-E' : '--fixed-strings');
  if (q) {
    const pattern = req.query.qRegex === '1' ? q : (useEre ? ere(q) : q);
    args.push(`--grep=${req.query.qWord === '1' ? `\\b(${pattern})\\b` : pattern}`);
  }
  if (author) args.push(`--author=${useEre ? ere(author) : author}`);
  if (since) { if (!DATE_RE.test(since)) throw bad('Fecha inválida'); args.push(`--since=${since} 00:00`); }
  if (until) { if (!DATE_RE.test(until)) throw bad('Fecha inválida'); args.push(`--until=${until} 23:59:59`); }
  if (file) { safePaths(repo, file); args.push('--', file); }
  try {
    const commits = parseLog((await git.run(repo.path, args)).stdout);
    res.json({ commits: commits.slice(0, limit), more: commits.length > limit, filtered });
  } catch (e) {
    if (/does not have any commits|bad default revision/.test(e.message)) return res.json({ commits: [], more: false, filtered });
    throw e;
  }
});

// Archivos versionados (para el selector de archivo).
r.get('/:id/files', async (req, res) => {
  const repo = getRepo(req.params.id);
  const { stdout } = await git.run(repo.path, ['ls-files', '-z']);
  const files = stdout.split('\0').filter(Boolean);
  res.json({ files: files.slice(0, 50000), truncated: files.length > 50000 });
});

// Historial de un archivo siguiendo renombrados: cada commit trae la ruta que tenía el archivo en ese momento.
r.get('/:id/file-log', async (req, res) => {
  const repo = getRepo(req.params.id);
  const { file } = req.query;
  if (!file) throw bad('Falta el archivo');
  safePaths(repo, file);
  const limit = Math.min(Number(req.query.limit) || 200, 1000);
  const { stdout } = await git.run(repo.path, ['log', `-n${limit}`, '--follow', '--name-status', '--format=%x1e%H%x00%h%x00%an%x00%ae%x00%aI%x00%D%x00%s%x00%P', '--', file]);
  const commits = stdout.split('\x1e').filter((x) => x.trim()).map((block) => {
    const [head, ...rest] = block.split('\n');
    const [hash, short, author, email, date, refs, subject, parents = ''] = head.split('\0');
    const st = rest.map((l) => l.trim()).find(Boolean)?.split('\t') || [];
    return {
      hash, short, author, email, date, refs: refs ? refs.split(', ') : [], subject, parents: parents.split(' ').filter(Boolean),
      status: st[0]?.[0] || 'M', path: st[st.length - 1] || file, from: st.length > 2 ? st[1] : null,
    };
  });
  res.json(commits);
});

// Blame de un archivo (opcionalmente en un commit): autor, fecha y commit de cada línea.
r.get('/:id/blame', async (req, res) => {
  const repo = getRepo(req.params.id);
  const { file, rev } = req.query;
  if (!file) throw bad('Falta el archivo');
  safePaths(repo, file);
  const args = ['blame', '--porcelain', ...(rev ? [safeHash(rev)] : []), '--', file];
  let stdout;
  try { ({ stdout } = await git.run(repo.path, args)); }
  catch (e) {
    if (/no such path|no such file/i.test(e.message)) throw bad('El archivo no existe en esa versión', 404);
    throw e;
  }
  const commits = {}, lines = [];
  const rows = stdout.split('\n');
  let cur = null;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const head = row.match(/^([0-9a-f]{40}) (\d+) (\d+)/);
    if (head) {
      cur = head[1];
      if (!commits[cur]) commits[cur] = { hash: cur, short: cur.slice(0, 7) };
      continue;
    }
    if (!cur) continue;
    if (row.startsWith('\t')) { lines.push({ hash: cur, text: row.slice(1).replace(/\r$/, '') }); continue; }
    const sp = row.indexOf(' ');
    const key = sp < 0 ? row : row.slice(0, sp), val = sp < 0 ? '' : row.slice(sp + 1);
    const c = commits[cur];
    if (key === 'author') c.author = val;
    else if (key === 'author-mail') c.email = val.replace(/[<>]/g, '');
    else if (key === 'author-time') c.time = Number(val) * 1000;
    else if (key === 'summary') c.summary = val;
    else if (key === 'boundary') c.boundary = true;
  }
  // Commit "0000…": líneas aún sin commit.
  if (commits['0'.repeat(40)]) Object.assign(commits['0'.repeat(40)], { uncommitted: true, short: 'local', author: 'Sin commit', summary: 'Cambios sin commit' });
  res.json({ file, rev: rev || null, commits, lines });
});

// ---------- comparar ramas o commits ----------
// Acepta ramas, tags, ramas remotas o hashes; git confirma que apunta a un commit.
async function safeCommitish(repo, ref) {
  if (!ref || ref.startsWith('-') || /[\s~^:?*\[\\]|\.\./.test(ref)) throw bad(`Referencia inválida: ${ref}`);
  try { await git.run(repo.path, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]); }
  catch { throw bad(`No existe la rama, tag o commit «${ref}»`); }
  return ref;
}

// mode=three (A...B): cambios de B desde que se separó de A · mode=two (A..B): diferencia directa entre ambos.
r.get('/:id/compare', async (req, res) => {
  const repo = getRepo(req.params.id);
  const base = await safeCommitish(repo, req.query.base);
  const head = await safeCommitish(repo, req.query.head);
  const range = req.query.mode === 'two' ? `${base}..${head}` : `${base}...${head}`;
  const [{ stdout: ns }, { stdout: num }, { stdout: counts }, { stdout: log }] = await Promise.all([
    git.run(repo.path, ['diff', '--name-status', '-z', '-M', range]),
    git.run(repo.path, ['diff', '--numstat', '-z', '-M', range]),
    git.run(repo.path, ['rev-list', '--left-right', '--count', `${base}...${head}`]),
    git.run(repo.path, ['log', '-n300', LOG_FORMAT, `${base}..${head}`]),
  ]);
  const files = [];
  const t = ns.split('\0');
  for (let i = 0; i < t.length - 1;) {
    const status = t[i++];
    if (!status) continue;
    if (/^[RC]/.test(status)) { const from = t[i++]; files.push({ status: status[0], from, path: t[i++] }); }
    else files.push({ status: status[0], path: t[i++] });
  }
  // numstat -z: "add\tdel\tpath\0" o, con renombrado, "add\tdel\t\0from\0to\0".
  const stats = {};
  const u = num.split('\0');
  for (let i = 0; i < u.length;) {
    const rec = u[i++];
    if (!rec) continue;
    const [a, d, p] = rec.split('\t');
    const key = p || (i++, u[i++]);
    stats[key] = { additions: a === '-' ? null : Number(a), deletions: d === '-' ? null : Number(d) };
  }
  const [behind, ahead] = counts.trim().split(/\s+/).map(Number);
  let mergeBase = null;
  try { mergeBase = (await git.run(repo.path, ['merge-base', base, head])).stdout.trim().slice(0, 7); } catch { /* historias sin relación */ }
  res.json({ base, head, mode: req.query.mode === 'two' ? 'two' : 'three', ahead, behind, mergeBase, commits: parseLog(log), files: files.map((f) => ({ ...f, ...(stats[f.path] || {}) })) });
});

r.get('/:id/compare/diff', async (req, res) => {
  const repo = getRepo(req.params.id);
  const base = await safeCommitish(repo, req.query.base);
  const head = await safeCommitish(repo, req.query.head);
  const { file, from } = req.query;
  if (!file) throw bad('Falta el archivo');
  safePaths(repo, file);
  if (from) safePaths(repo, from);
  const range = req.query.mode === 'two' ? `${base}..${head}` : `${base}...${head}`;
  const { stdout } = await git.run(repo.path, ['diff', '--no-color', '-M', range, '--', ...(from ? [from] : []), file]);
  res.json({ diff: stdout });
});

// Commits locales que aún no están en el remoto (los que subiría un push).
// Con upstream: <upstream>..HEAD. Sin upstream (rama nueva): los que no están en ningún remoto.
r.get('/:id/outgoing', async (req, res) => {
  const repo = getRepo(req.params.id);
  const s = await git.status(repo.path);
  const range = s.upstream ? [`${s.upstream}..HEAD`] : ['HEAD', '--not', '--remotes'];
  let stdout = '';
  try {
    ({ stdout } = await git.run(repo.path, [
      'log', '-n200', '--format=%x1e%H%x00%h%x00%an%x00%aI%x00%s', '--shortstat', ...range,
    ]));
  } catch { /* repositorio sin commits */ }
  const commits = stdout.split('\x1e').map((b) => b.trim()).filter(Boolean).map((block) => {
    const [head, stat = ''] = block.split('\n').filter(Boolean).reduce((acc, l, i) => (i === 0 ? [l] : [acc[0], `${acc[1] || ''}${l}`]), []);
    const [hash, short, author, date, subject] = head.split('\0');
    const n = (re) => Number(stat.match(re)?.[1] || 0);
    return { hash, short, author, date, subject, files: n(/(\d+) files? changed/), insertions: n(/(\d+) insertions?/), deletions: n(/(\d+) deletions?/) };
  });
  res.json({ branch: s.branch, upstream: s.upstream, commits });
});

r.get('/:id/commit/:hash', async (req, res) => {
  const repo = getRepo(req.params.id);
  safeHash(req.params.hash);
  const { file, from } = req.query;
  if (file) safePaths(repo, file);
  if (from) safePaths(repo, from);
  const { stdout } = await git.run(repo.path, ['show', '--no-color', '-m', '--first-parent', '-M', '--format=%H%n%P%n%an <%ae>%n%aI%n%B%x00', req.params.hash, ...(file ? ['--', ...(from ? [from] : []), file] : [])]);
  const [header, diff = ''] = stdout.split('\0');
  const [hash, parents, author, date, ...body] = header.split('\n');
  res.json({ hash, parents: parents.split(' ').filter(Boolean), author, date, message: body.join('\n').trim(), diff: diff.replace(/^\n+/, '') });
});

// ---------- mensaje de commit sugerido (local, sin servicios externos) ----------
r.get('/:id/commit-settings', (req, res) => { getRepo(req.params.id); res.json(commitSettings.forRepo(req.params.id)); });
r.put('/:id/commit-settings', (req, res) => { getRepo(req.params.id); res.json(commitSettings.saveRepo(req.params.id, req.body?.own || null)); });

r.post('/:id/suggest-message', async (req, res) => {
  const repo = getRepo(req.params.id);
  res.json(await suggest(repo.path));
});

// ---------- GitHub ----------
// Datos del repo en GitHub y pull requests de la rama actual (requiere una cuenta de GitHub para ese host).
async function githubCtx(repo) {
  const web = webUrl(await git.remoteUrl(repo.path));
  const host = web ? new URL(web).host : null;
  const account = accountForHost(host, 'github');
  if (!account) throw bad(`Añade una cuenta de GitHub para ${host || 'este remoto'} en Cuentas para gestionar pull requests desde aquí`, 404);
  const or = ownerRepo(web);
  if (!or) throw bad('No se pudo identificar el repositorio de GitHub');
  return { account, ...or };
}

r.get('/:id/github', async (req, res) => {
  const repo = getRepo(req.params.id);
  const { account, owner, repo: name } = await githubCtx(repo);
  const s = await git.status(repo.path);
  const [info, pulls, branches] = await Promise.all([
    gh(account, `/repos/${owner}/${name}`),
    gh(account, `/repos/${owner}/${name}/pulls`, { query: { state: 'open', head: s.branch ? `${owner}:${s.branch}` : undefined, per_page: 20 } }),
    gh(account, `/repos/${owner}/${name}/branches`, { query: { per_page: 100 } }),
  ]);
  res.json({
    owner, repo: name, full_name: info.full_name, default_branch: info.default_branch, html_url: info.html_url,
    branch: s.branch, pulls: pulls.map(pickPull), branches: branches.map((b) => b.name), user: account.user?.username,
  });
});

r.post('/:id/github/pulls', async (req, res) => {
  const repo = getRepo(req.params.id);
  const { account, owner, repo: name } = await githubCtx(repo);
  const { title, body, head, base, draft } = req.body || {};
  if (!title?.trim() || !head || !base) throw bad('Faltan el título o las ramas');
  const pr = await gh(account, `/repos/${owner}/${name}/pulls`, { method: 'POST', body: { title: title.trim(), body, head: safeRef(head), base: safeRef(base), draft: !!draft } });
  res.json({ ...pickPull(pr), output: `Pull request #${pr.number} creado` });
});

// ---------- vínculo con GitLab ----------
// Deduce el proyecto de GitLab a partir del remoto "origin".
r.get('/:id/gitlab-project', async (req, res) => {
  const repo = getRepo(req.params.id);
  if (repo.gitlabProjectId) {
    const instance = repo.gitlabInstance || 'main';
    return res.json({ ...(await api(`/projects/${repo.gitlabProjectId}`, { instance })).data, instance });
  }
  const url = await git.remoteUrl(repo.path);
  if (!url) throw bad('El repositorio no tiene remoto "origin"', 404);
  const m = url.match(/^(?:https?:\/\/(?:[^@/]+@)?([^/]+)\/|git@([^:]+):|ssh:\/\/(?:[^@/]+@)?([^/:]+)(?::\d+)?\/)(.+?)(?:\.git)?\/?$/);
  const host = m ? (m[1] || m[2] || m[3]).toLowerCase() : null;
  const inst = gitlabInstances().find((i) => { try { return new URL(i.url).host.toLowerCase() === host; } catch { return false; } });
  if (!inst) throw bad(`El remoto origin (${host || url}) no está en ninguna instancia de GitLab configurada. Añádela en Cuentas.`, 404);
  const { data } = await api(`/projects/${encodeURIComponent(m[4])}`, { instance: inst.id });
  update((c) => { const x = c.repos.find((y) => y.id === repo.id); if (x) { x.gitlabProjectId = data.id; x.gitlabInstance = inst.id; } });
  res.json({ ...data, instance: inst.id });
});

export default r;
