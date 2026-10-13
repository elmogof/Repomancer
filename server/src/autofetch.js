// Fetch automático periódico de todos los repositorios de la lista.
// Registra cuándo se hizo el último fetch de cada repo y genera "novedades" cuando
// aumentan los commits por bajar de la rama actual, para que el cliente avise.
import fs from 'node:fs';
import { load, update } from './config.js';
import * as git from './git.js';
import { record } from './oplog.js';

const DEFAULTS = { enabled: true, minutes: 10 };
export const INTERVALS = [5, 10, 15, 30, 60];
const CONCURRENCY = 4;
const FIRST_DELAY = 60 * 1000; // primer ciclo un minuto después de arrancar el servidor

const state = { running: false, lastRun: null, nextRun: null, lastResult: null, seq: 0, events: [] };
const fetchedAt = new Map(); // id de repo → fecha del último fetch correcto (automático o manual)
let timer = null;

export const settings = () => ({ ...DEFAULTS, ...(load().autoFetch || {}) });
export const lastFetch = (id) => fetchedAt.get(id) || null;
export const markFetched = (id) => fetchedAt.set(id, new Date().toISOString());

export function status(after) {
  const since = Number(after);
  return {
    ...settings(), intervals: INTERVALS, running: state.running, lastRun: state.lastRun, nextRun: state.nextRun,
    lastResult: state.lastResult, seq: state.seq,
    events: Number.isFinite(since) ? state.events.filter((e) => e.seq > since) : [],
  };
}

export function configure({ enabled, minutes }) {
  update((c) => {
    const cur = { ...DEFAULTS, ...(c.autoFetch || {}) };
    if (typeof enabled === 'boolean') cur.enabled = enabled;
    if (INTERVALS.includes(Number(minutes))) cur.minutes = Number(minutes);
    c.autoFetch = cur;
  });
  schedule();
  return status();
}

function schedule(delay) {
  clearTimeout(timer);
  timer = null;
  const s = settings();
  if (!s.enabled) { state.nextRun = null; return; }
  const ms = delay ?? s.minutes * 60 * 1000;
  state.nextRun = new Date(Date.now() + ms).toISOString();
  timer = setTimeout(() => { runOnce().catch(() => {}).finally(() => schedule()); }, ms);
  timer.unref?.();
}

export async function runOnce() {
  if (state.running) return state.lastResult;
  state.running = true;
  const started = Date.now();
  const repos = load().repos.filter((r) => fs.existsSync(r.path));
  const updates = [], failed = [];
  const queue = [...repos];
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    while (queue.length) {
      const repo = queue.shift();
      try {
        const before = await git.status(repo.path);
        if (!(await git.remoteUrl(repo.path))) continue; // sin remoto: nada que traer
        await git.runRemote(repo.path, ['fetch', '--all', '--prune', '--quiet']);
        markFetched(repo.id);
        const after = await git.status(repo.path);
        if (after.upstream && after.behind > before.behind) {
          updates.push({ id: repo.id, name: repo.name, branch: after.branch, behind: after.behind, newCommits: after.behind - before.behind });
        }
      } catch (e) {
        failed.push({ id: repo.id, name: repo.name, error: e.message.split('\n')[0] });
      }
    }
  }));
  state.running = false;
  state.lastRun = new Date().toISOString();
  state.lastResult = { repos: repos.length, updated: updates.length, failed, ms: Date.now() - started };
  record({
    action: 'auto-fetch', label: 'Fetch automático', source: 'automático', ok: !failed.length, ms: state.lastResult.ms,
    summary: `${repos.length} repos · ${updates.length ? `${updates.length} con commits nuevos` : 'sin novedades'}${failed.length ? ` · ${failed.length} con error` : ''}`,
    details: [...updates.map((u) => `${u.name} (${u.branch}): +${u.newCommits}, ${u.behind} por bajar`), ...failed.map((f) => `${f.name}: ${f.error}`)].join('\n') || null,
  });
  if (updates.length) {
    state.events.push({ seq: ++state.seq, at: state.lastRun, updates });
    state.events = state.events.slice(-50);
  }
  return state.lastResult;
}

// Arranca el ciclo; si se ejecuta "ahora" a mano, el siguiente se reprograma desde ese momento.
export function start() { schedule(FIRST_DELAY); }
export async function runNow() {
  const r = await runOnce();
  schedule();
  return r;
}
