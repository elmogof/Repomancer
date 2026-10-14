// Entornos de trabajo: grupos de repositorios que forman una misma aplicación y, para cada grupo,
// varios "entornos" (Producción, QA, una funcionalidad…) que guardan la rama de cada repositorio.
// Cambiar de entorno pone cada repositorio en su rama, guarda los cambios sin commit en un stash
// propio (que se recupera al volver a esa rama) y actualiza con pull --ff-only.
//
// config.workspaces = [{ id, name, repos: [repoId], envs: [{ id, name, branches: { repoId: rama } }],
//                        lastEnv, previous: { at, envId, branches } }]
// Un repositorio sin rama en un entorno se deja como esté ("no cambiar").
import { Router } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { load, update } from '../config.js';
import * as git from '../git.js';
import { currentBranch } from '../scan.js';
import { markFetched } from '../autofetch.js';
import { record } from '../oplog.js';

const r = Router();
const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });

const BRANCH_RE = /^(?!-)(?!origin\/)[^\s~^:?*\[\\]+$/;
const STASH_TAG = 'gm-auto:'; // mensaje de los stash automáticos: gm-auto:<rama en la que se guardó>
const CONCURRENCY = 4;

const cleanName = (s, what) => {
  const name = String(s || '').trim().slice(0, 80);
  if (!name) throw bad(`Falta el nombre del ${what}`);
  return name;
};

// Solo repositorios que siguen en la lista; ramas válidas de repositorios del grupo.
function sanitize(group) {
  const known = new Set(load().repos.map((x) => x.id));
  const repos = [...new Set((group.repos || []).filter((id) => known.has(id)))];
  const envs = (group.envs || []).map((e) => {
    const branches = {};
    for (const [id, b] of Object.entries(e.branches || {})) {
      if (!repos.includes(id) || !b) continue;
      if (!BRANCH_RE.test(b)) throw bad(`Nombre de rama inválido: ${b}`);
      branches[id] = b;
    }
    return { id: e.id || crypto.randomUUID(), name: cleanName(e.name, 'entorno'), branches };
  });
  return { ...group, name: cleanName(group.name, 'grupo'), repos, envs };
}

const groups = () => (load().workspaces || []).map((g) => {
  const known = new Set(load().repos.map((x) => x.id));
  return { ...g, repos: g.repos.filter((id) => known.has(id)) };
});

function getGroup(id) {
  const g = groups().find((x) => x.id === id);
  if (!g) throw bad('Grupo no encontrado', 404);
  return g;
}

function saveGroup(g) {
  update((c) => { c.workspaces = [...(c.workspaces || []).filter((x) => x.id !== g.id), g]; });
}

async function pool(items, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); }
  }));
  return out;
}

const firstLine = (e) => String(e?.message || e).split('\n').find((l) => l.trim())?.replace(/^(error|fatal):\s*/i, '') || 'Error';

// ---------- lista y edición ----------
// Estado de un repositorio de un grupo: cambios sin commit, commits por subir o bajar, y las ramas que existen
// (locales y de origin, sin el prefijo) para avisar de entornos que apuntan a ramas borradas.
async function repoState(repo) {
  if (!fs.existsSync(repo.path)) return { missing: true };
  try {
    const [s, { stdout }] = await Promise.all([
      git.status(repo.path),
      git.run(repo.path, ['for-each-ref', '--format=%(refname)', 'refs/heads', 'refs/remotes/origin']),
    ]);
    const branches = [...new Set(stdout.split('\n').filter(Boolean).map((ref) => ref.replace(/^refs\/(heads|remotes\/origin)\//, '')).filter((b) => b !== 'HEAD'))];
    return { changes: s.files.length, ahead: s.ahead, behind: s.behind, upstream: s.upstream, branches };
  } catch (e) { return { error: firstLine(e) }; }
}

// status=0 devuelve solo las ramas actuales (rápido); por defecto incluye el estado de los repos que están en algún grupo.
r.get('/', async (req, res) => {
  const repos = load().repos;
  const current = {};
  await Promise.all(repos.map(async (x) => { current[x.id] = fs.existsSync(x.path) ? await currentBranch(x.path) : null; }));
  const out = { groups: groups(), current, repos: repos.map((x) => ({ id: x.id, name: x.name, missing: !fs.existsSync(x.path) })) };
  if (req.query.status !== '0') {
    const ids = [...new Set(out.groups.flatMap((g) => g.repos))];
    const states = await pool(ids, (id) => repoState(repos.find((x) => x.id === id)));
    out.state = Object.fromEntries(ids.map((id, i) => [id, states[i]]));
  }
  res.json(out);
});

r.post('/', (req, res) => {
  const g = sanitize({ id: crypto.randomUUID(), name: req.body?.name, repos: req.body?.repos, envs: req.body?.envs || [] });
  saveGroup(g);
  res.json(g);
});

r.put('/:id', (req, res) => {
  const old = getGroup(req.params.id);
  const { name = old.name, repos = old.repos, envs = old.envs } = req.body || {};
  const g = sanitize({ ...old, name, repos, envs });
  if (g.lastEnv && !g.envs.some((e) => e.id === g.lastEnv)) g.lastEnv = null;
  saveGroup(g);
  res.json(g);
});

r.delete('/:id', (req, res) => {
  getGroup(req.params.id);
  update((c) => { c.workspaces = (c.workspaces || []).filter((x) => x.id !== req.params.id); });
  res.json({ ok: true });
});

// ---------- vista previa ----------
// Ramas destino: las del entorno (envId), las del estado anterior (restore) o las indicadas (branches).
function targets(g, { envId, restore, branches }) {
  if (restore) {
    if (!g.previous) throw bad('No hay un estado anterior que restaurar');
    return { env: null, map: g.previous.branches };
  }
  const env = g.envs.find((e) => e.id === envId);
  if (!env) throw bad('Entorno no encontrado', 404);
  return { env, map: { ...env.branches, ...(branches || {}) } };
}

async function inspect(repo, target) {
  const base = { repoId: repo.id, name: repo.name, target: target || null };
  if (!fs.existsSync(repo.path)) return { ...base, state: 'error', error: 'La carpeta ya no existe' };
  try {
    const s = await git.status(repo.path);
    const out = { ...base, current: s.branch, changes: s.files.length, conflicts: s.files.some((f) => f.conflict) };
    const op = await git.operation(repo.path);
    if (op) return { ...out, state: 'error', error: `Hay un ${op} en curso; termínalo o abórtalo primero` };
    if (!target) return { ...out, state: 'keep' };
    if (s.branch === target) return { ...out, state: 'same', upstream: !!s.upstream };
    const { stdout } = await git.run(repo.path, ['for-each-ref', '--format=%(refname)', `refs/heads/${target}`, `refs/remotes/origin/${target}`]);
    const refs = stdout.split('\n').filter(Boolean);
    if (refs.includes(`refs/heads/${target}`)) return { ...out, state: 'ready' };
    if (refs.includes(`refs/remotes/origin/${target}`)) return { ...out, state: 'remote' };
    return { ...out, state: 'missing' };
  } catch (e) { return { ...base, state: 'error', error: firstLine(e) }; }
}

r.post('/:id/preview', async (req, res) => {
  const g = getGroup(req.params.id);
  const { map } = targets(g, req.body || {});
  const repos = g.repos.map((id) => load().repos.find((x) => x.id === id));
  const fetchErrors = {};
  if (req.body?.fetch) {
    await pool(repos.filter((x) => fs.existsSync(x.path)), async (x) => {
      try { await git.runRemote(x.path, ['fetch', '--prune']); markFetched(x.id); } catch (e) { fetchErrors[x.id] = firstLine(e); }
    });
  }
  const items = await pool(repos, (x) => inspect(x, map[x.id]));
  res.json({ items: items.map((it) => (fetchErrors[it.repoId] ? { ...it, fetchError: fetchErrors[it.repoId] } : it)) });
});

// ---------- cambio de entorno ----------
async function popAutoStash(repo, branch) {
  const { stdout } = await git.run(repo.path, ['stash', 'list', '--format=%gd%x00%gs']);
  const hit = stdout.split('\n').filter(Boolean).map((l) => l.split('\0')).find(([, subject]) => subject?.endsWith(`: ${STASH_TAG}${branch}`));
  if (!hit) return null;
  try {
    await git.run(repo.path, ['stash', 'pop', hit[0]]);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: 'Tus cambios guardados chocan con la rama; quedaron en el stash y en conflicto para resolverlos.', details: e.message };
  }
}

// dirty: 'stash' (guardar y recuperar al volver), 'skip' (no tocar ese repo) o 'carry' (llevar los cambios a la nueva rama).
async function switchRepo(repo, target, { dirty, pull }) {
  const steps = [];
  const it = await inspect(repo, target);
  const result = { repoId: repo.id, name: repo.name, from: it.current || null, target: target || null, steps };
  if (it.state === 'keep') return { ...result, status: 'kept' };
  if (it.state === 'error') return { ...result, status: 'failed', error: it.error };
  if (it.state === 'missing') return { ...result, status: 'failed', error: `La rama ${target} no existe en local ni en origin` };

  let stashed = false;
  if (it.state !== 'same') {
    if (it.changes && it.conflicts) return { ...result, status: 'failed', error: 'Tiene archivos en conflicto sin resolver' };
    if (it.changes && dirty === 'skip') return { ...result, status: 'skipped', error: `Tiene ${it.changes} cambio(s) sin commit` };
    if (it.changes && dirty === 'stash') {
      await git.run(repo.path, ['stash', 'push', '--include-untracked', '-m', `${STASH_TAG}${it.current}`]);
      stashed = true;
      steps.push(`Cambios guardados en stash (se recuperan al volver a ${it.current})`);
    }
    try {
      if (it.state === 'remote') { await git.run(repo.path, ['switch', '--track', `origin/${target}`]); steps.push(`Rama ${target} creada desde origin/${target}`); }
      else { await git.run(repo.path, ['switch', target]); steps.push(`Cambiado a ${target}`); }
    } catch (e) {
      // Si no se pudo cambiar, se devuelven los cambios guardados a donde estaban.
      if (stashed) await git.run(repo.path, ['stash', 'pop']).catch(() => {});
      return { ...result, status: 'failed', error: firstLine(e), details: e.message };
    }
  }

  const warnings = [];
  if (pull) {
    const s = await git.status(repo.path);
    if (s.upstream) {
      try {
        const { stdout, stderr } = await git.runRemote(repo.path, ['pull', '--ff-only']);
        if (!/Already up to date|Ya está actualizado/i.test(stdout + stderr)) steps.push('Actualizado con pull');
      } catch (e) {
        warnings.push(/not possible to fast-forward|diverg/i.test(e.message)
          ? 'No se actualizó: la rama local y la remota divergen (haz pull manualmente)'
          : `No se pudo hacer pull: ${firstLine(e)}`);
      }
    }
  }
  if (it.state !== 'same') {
    const popped = await popAutoStash(repo, target);
    if (popped?.ok) steps.push(`Recuperados los cambios que tenías en ${target}`);
    else if (popped) warnings.push(popped.error);
  }
  return { ...result, status: warnings.length ? 'warning' : (it.state === 'same' && !steps.length ? 'unchanged' : 'ok'), warnings };
}

r.post('/:id/switch', async (req, res) => {
  const g = getGroup(req.params.id);
  const { dirty = 'stash', pull = true, saveOverrides } = req.body || {};
  if (!['stash', 'skip', 'carry'].includes(dirty)) throw bad('Opción inválida');
  const { env, map } = targets(g, req.body || {});
  for (const b of Object.values(map)) if (b && !BRANCH_RE.test(b)) throw bad(`Nombre de rama inválido: ${b}`);
  const repos = g.repos.map((id) => load().repos.find((x) => x.id === id));

  // Estado anterior, para poder volver con un clic.
  const before = {};
  await Promise.all(repos.map(async (x) => { if (!fs.existsSync(x.path)) return; const b = await currentBranch(x.path); if (b && !b.startsWith('(')) before[x.id] = b; }));

  const started = Date.now();
  const results = await pool(repos, (x) => switchRepo(x, map[x.id], { dirty, pull: !!pull }).catch((e) => ({
    repoId: x.id, name: x.name, target: map[x.id], status: 'failed', error: firstLine(e), details: e.message, steps: [],
  })));

  const changed = results.some((x) => ['ok', 'warning'].includes(x.status) && x.from !== x.target);
  const label = `Entorno de trabajo · ${g.name} → ${env ? env.name : 'estado anterior'}`;
  for (const x of results) {
    if (x.status === 'kept' || x.status === 'unchanged') continue;
    record({
      action: 'checkout', label, repoId: x.repoId, ok: !['failed'].includes(x.status), ms: Date.now() - started,
      summary: x.error || x.warnings?.[0] || x.steps.at(-1) || 'Sin cambios',
      details: [...x.steps, ...(x.warnings || []), x.details].filter(Boolean).join('\n') || null,
    });
  }

  const fresh = getGroup(g.id);
  if (changed) fresh.previous = { at: new Date().toISOString(), envId: g.lastEnv || null, branches: before };
  fresh.lastEnv = env ? env.id : (g.previous?.envId || null);
  // Ramas elegidas en la vista previa para repos cuya rama no existía: se guardan en el entorno si se pide.
  if (env && saveOverrides && req.body?.branches) {
    fresh.envs = fresh.envs.map((e) => (e.id === env.id ? { ...e, branches: Object.fromEntries(Object.entries({ ...e.branches, ...req.body.branches }).filter(([, b]) => b)) } : e));
  }
  saveGroup(sanitize(fresh));
  res.json({ results, group: getGroup(g.id) });
});

// ---------- acciones en lote sobre el grupo ----------
// fetch: todos; pull: solo avance rápido (nunca crea un merge); push: solo ramas con upstream y commits por subir.
const OPS = {
  fetch: { label: 'Fetch', run: async (repo) => { await git.runRemote(repo.path, ['fetch', '--prune']); markFetched(repo.id); return { status: 'ok', steps: ['Fetch completado'] }; } },
  pull: {
    label: 'Pull',
    run: async (repo) => {
      const s = await git.status(repo.path);
      if (!s.upstream) return { status: 'skipped', error: 'La rama no tiene upstream' };
      try {
        const { stdout, stderr } = await git.runRemote(repo.path, ['pull', '--ff-only']);
        return /Already up to date|Ya está actualizado/i.test(stdout + stderr) ? { status: 'unchanged', steps: ['Ya estaba al día'] } : { status: 'ok', steps: ['Actualizado'] };
      } catch (e) {
        if (/not possible to fast-forward|diverg/i.test(e.message)) return { status: 'warning', warnings: ['La rama local y la remota divergen: haz pull desde el repositorio para elegir merge o rebase'] };
        throw e;
      }
    },
  },
  push: {
    label: 'Push',
    run: async (repo) => {
      const s = await git.status(repo.path);
      if (!s.upstream) return { status: 'skipped', error: 'La rama no está publicada (publícala desde el repositorio)' };
      if (!s.ahead) return { status: 'unchanged', steps: ['No hay commits por subir'] };
      await git.runRemote(repo.path, ['push']);
      return { status: 'ok', steps: [`${s.ahead} commit(s) subidos`] };
    },
  },
};

r.post('/:id/run', async (req, res) => {
  const g = getGroup(req.params.id);
  const op = OPS[req.body?.op];
  if (!op) throw bad('Operación inválida');
  const started = Date.now();
  const repos = g.repos.map((id) => load().repos.find((x) => x.id === id));
  const results = await pool(repos, async (x) => {
    const base = { repoId: x.id, name: x.name, steps: [] };
    if (!fs.existsSync(x.path)) return { ...base, status: 'failed', error: 'La carpeta ya no existe' };
    try { return { ...base, ...(await op.run(x)) }; } catch (e) { return { ...base, status: 'failed', error: firstLine(e), details: e.message }; }
  });
  for (const x of results) {
    if (x.status === 'unchanged' && req.body.op !== 'fetch') continue;
    record({
      action: req.body.op, label: `${op.label} · grupo ${g.name}`, repoId: x.repoId, ok: x.status !== 'failed', ms: Date.now() - started,
      summary: x.error || x.warnings?.[0] || x.steps.at(-1) || 'Completado', details: x.details || null,
    });
  }
  res.json({ results });
});

export default r;
