import { Router } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { load, update } from '../config.js';
import * as git from '../git.js';
import { api } from '../gitlab.js';

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

function addRepo(dir, extra = {}) {
  const abs = path.resolve(dir);
  const existing = load().repos.find((x) => path.resolve(x.path) === abs);
  if (existing) return existing;
  const repo = { id: crypto.randomUUID(), name: path.basename(abs), path: abs, ...extra };
  update((c) => c.repos.push(repo));
  return repo;
}

// ---------- lista ----------
r.get('/', async (req, res) => {
  const repos = await Promise.all(load().repos.map(async (repo) => {
    if (!fs.existsSync(repo.path)) return { ...repo, missing: true };
    try {
      const s = await git.status(repo.path);
      return { ...repo, branch: s.branch, ahead: s.ahead, behind: s.behind, changes: s.files.length };
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

r.post('/clone', async (req, res) => {
  const { url, dir, gitlabProjectId } = req.body || {};
  if (!url || !/^(https?:\/\/|git@|ssh:\/\/)/.test(url)) throw bad('URL de clonado inválida');
  const parent = dir || load().defaultCloneDir;
  const name = url.replace(/\.git$/, '').split(/[/:]/).pop();
  const dest = path.resolve(parent, name);
  if (fs.existsSync(dest) && fs.readdirSync(dest).length) throw bad(`La carpeta destino ya existe y no está vacía: ${dest}`);
  await git.clone(url, dest);
  res.json(addRepo(dest, gitlabProjectId ? { gitlabProjectId } : {}));
});

r.put('/settings', (req, res) => {
  const { defaultCloneDir } = req.body || {};
  if (defaultCloneDir) update((c) => { c.defaultCloneDir = path.resolve(defaultCloneDir); });
  res.json({ defaultCloneDir: load().defaultCloneDir });
});

r.delete('/:id', (req, res) => {
  // Solo se quita de la lista; nunca se borran archivos del disco.
  update((c) => { c.repos = c.repos.filter((x) => x.id !== req.params.id); });
  res.json({ ok: true });
});

// ---------- estado y cambios ----------
r.get('/:id/status', async (req, res) => {
  const repo = getRepo(req.params.id);
  res.json({ ...repo, ...(await git.status(repo.path)) });
});

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

// ---------- remoto ----------
r.post('/:id/fetch', async (req, res) => {
  const repo = getRepo(req.params.id);
  const { stderr, stdout } = await git.runRemote(repo.path, ['fetch', '--all', '--prune']);
  res.json({ output: (stdout + stderr).trim() || 'Fetch completado' });
});

r.post('/:id/pull', async (req, res) => {
  const repo = getRepo(req.params.id);
  const { rebase } = req.body || {};
  const { stderr, stdout } = await git.runRemote(repo.path, ['pull', rebase ? '--rebase' : '--no-rebase']);
  res.json({ output: (stdout + stderr).trim() });
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

r.post('/:id/checkout', async (req, res) => {
  const repo = getRepo(req.params.id);
  const { branch, create, from } = req.body || {};
  safeRef(branch);
  if (create) await git.run(repo.path, ['switch', '-c', branch, ...(from ? [safeRef(from)] : [])]);
  else if (branch.startsWith('origin/')) {
    // rama remota → crea la local que la sigue
    await git.run(repo.path, ['switch', '--track', branch]);
  } else await git.run(repo.path, ['switch', branch]);
  res.json({ ok: true });
});

r.post('/:id/merge', async (req, res) => {
  const repo = getRepo(req.params.id);
  const { branch, noFf } = req.body || {};
  safeRef(branch);
  try {
    const { stdout } = await git.run(repo.path, ['merge', ...(noFf ? ['--no-ff'] : []), '--no-edit', branch]);
    res.json({ output: stdout });
  } catch (e) {
    const s = await git.status(repo.path);
    const conflicts = s.files.filter((f) => f.conflict).map((f) => f.path);
    if (conflicts.length) return res.status(409).json({ error: 'Merge con conflictos. Resuélvelos, añade los archivos y haz commit, o aborta el merge.', conflicts });
    throw e;
  }
});

r.post('/:id/merge/abort', async (req, res) => {
  const repo = getRepo(req.params.id);
  await git.run(repo.path, ['merge', '--abort']);
  res.json({ ok: true });
});

// ---------- historial ----------
r.get('/:id/log', async (req, res) => {
  const repo = getRepo(req.params.id);
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  try {
    const { stdout } = await git.run(repo.path, [
      'log', `-n${limit}`, '--format=%H%x00%h%x00%an%x00%ae%x00%aI%x00%D%x00%s%x1e', ...(req.query.all === 'true' ? ['--all'] : []),
    ]);
    res.json(stdout.split('\x1e').map((s) => s.trim()).filter(Boolean).map((l) => {
      const [hash, short, author, email, date, refs, subject] = l.split('\0');
      return { hash, short, author, email, date, refs: refs ? refs.split(', ') : [], subject };
    }));
  } catch (e) {
    if (/does not have any commits/.test(e.message)) return res.json([]);
    throw e;
  }
});

r.get('/:id/commit/:hash', async (req, res) => {
  const repo = getRepo(req.params.id);
  if (!/^[0-9a-f]{4,40}$/i.test(req.params.hash)) throw bad('Hash inválido');
  const { stdout } = await git.run(repo.path, ['show', '--no-color', '--format=%H%n%an <%ae>%n%aI%n%B%x00', req.params.hash]);
  const [header, diff] = stdout.split('\0');
  const [hash, author, date, ...body] = header.split('\n');
  res.json({ hash, author, date, message: body.join('\n').trim(), diff: diff.replace(/^\n/, '') });
});

// ---------- vínculo con GitLab ----------
// Deduce el proyecto de GitLab a partir del remoto "origin".
r.get('/:id/gitlab-project', async (req, res) => {
  const repo = getRepo(req.params.id);
  if (repo.gitlabProjectId) {
    return res.json((await api(`/projects/${repo.gitlabProjectId}`)).data);
  }
  const url = await git.remoteUrl(repo.path);
  if (!url) throw bad('El repositorio no tiene remoto "origin"', 404);
  const glHost = new URL(load().gitlab.url).host;
  const m = url.match(/^(?:https?:\/\/(?:[^@/]+@)?([^/]+)\/|git@([^:]+):|ssh:\/\/(?:[^@/]+@)?([^/:]+)(?::\d+)?\/)(.+?)(?:\.git)?\/?$/);
  if (!m || (m[1] || m[2] || m[3]) !== glHost) throw bad('El remoto no pertenece a la instancia de GitLab configurada', 404);
  const { data } = await api(`/projects/${encodeURIComponent(m[4])}`);
  update((c) => { const x = c.repos.find((y) => y.id === repo.id); if (x) x.gitlabProjectId = data.id; });
  res.json(data);
});

export default r;
