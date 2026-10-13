// Registro de operaciones: qué se ejecutó, sobre qué repositorio, cuándo y con qué resultado.
// Se guarda en ~/.git-manager/oplog.json (últimas MAX entradas), fuera del proyecto.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { CONFIG_DIR, load } from './config.js';

const FILE = path.join(CONFIG_DIR, 'oplog.json');
const MAX = 1000;
let entries = null;
let saveTimer = null;

function all() {
  if (!entries) {
    try { entries = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { entries = []; }
  }
  return entries;
}

function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
      fs.writeFileSync(FILE, JSON.stringify(entries), { mode: 0o600 });
    } catch { /* el registro es informativo: un fallo al guardar no debe romper la operación */ }
  }, 500);
}

const clip = (s, n = 4000) => (s && s.length > n ? `${s.slice(0, n)}\n…` : s || null);

export function record({ action, label, repoId, ok, status, ms, summary, details, source = 'usuario' }) {
  const repo = repoId ? load().repos.find((r) => r.id === repoId) : null;
  all().push({
    id: crypto.randomUUID(), at: new Date().toISOString(), action, label: label || action, source,
    repoId: repoId || null, repoName: repo?.name || null, ok, status: status || null, ms: ms ?? null,
    summary: clip(summary, 300), details: clip(details),
  });
  if (entries.length > MAX) entries = entries.slice(-MAX);
  persist();
}

export function list({ repoId, errors, limit = 300 } = {}) {
  return all().filter((e) => (!repoId || e.repoId === repoId) && (!errors || !e.ok)).slice(-limit).reverse();
}

export function clear() {
  entries = [];
  persist();
}

// Nombre legible de cada operación según la ruta de la API.
const LABELS = [
  [/^POST \/api\/repos\/[^/]+\/fetch$/, 'fetch', 'Fetch'],
  [/^POST \/api\/repos\/[^/]+\/pull$/, 'pull', 'Pull'],
  [/^POST \/api\/repos\/[^/]+\/push$/, 'push', 'Push'],
  [/^POST \/api\/repos\/[^/]+\/commit$/, 'commit', 'Commit'],
  [/^POST \/api\/repos\/[^/]+\/undo-commit$/, 'undo-commit', 'Deshacer commit'],
  [/^POST \/api\/repos\/[^/]+\/(stage|unstage|apply-patch)$/, 'stage', 'Cambiar área de preparación'],
  [/^POST \/api\/repos\/[^/]+\/discard$/, 'discard', 'Descartar cambios'],
  [/^POST \/api\/repos\/[^/]+\/checkout$/, 'checkout', 'Cambiar de rama'],
  [/^POST \/api\/repos\/[^/]+\/merge$/, 'merge', 'Merge'],
  [/^POST \/api\/repos\/[^/]+\/(merge\/abort|operation)$/, 'operation', 'Continuar o abortar operación'],
  [/^POST \/api\/repos\/[^/]+\/revert$/, 'revert', 'Revert'],
  [/^POST \/api\/repos\/[^/]+\/cherry-pick$/, 'cherry-pick', 'Cherry-pick'],
  [/^POST \/api\/repos\/[^/]+\/stash/, 'stash', 'Stash'],
  [/^POST \/api\/repos\/[^/]+\/conflict\/resolve$/, 'resolve', 'Resolver conflicto'],
  [/^POST \/api\/repos\/[^/]+\/tags/, 'tag', 'Tags'],
  [/^POST \/api\/repos\/[^/]+\/branches\/delete$/, 'branch-delete', 'Limpiar ramas'],
  [/^POST \/api\/repos\/[^/]+\/open$/, 'open', 'Abrir en el sistema'],
  [/^POST \/api\/repos\/clone$/, 'clone', 'Clonar'],
  [/^POST \/api\/repos\/(add|add-many)$/, 'add', 'Añadir repositorios'],
  [/^(POST \/api\/repos\/remove-many|DELETE \/api\/repos\/[^/]+)$/, 'remove', 'Quitar de la lista'],
  [/^POST \/api\/(gitlab|github)\/.*merge_requests$|^POST \/api\/github\/.*\/pulls$/, 'mr-create', 'Crear merge/pull request'],
  [/^(PUT|POST) \/api\/(gitlab|github)\/.*\/(merge|approve|close|notes)$/, 'mr-action', 'Acción en merge/pull request'],
];
// Rutas que cambian datos pero no merecen registro (preferencias, metadatos, sesión).
// (El fetch automático, también el lanzado a mano, lo registra el propio ciclo.)
const SKIP = /^(POST \/api\/auto-fetch\/run|PUT \/api\/repos\/[^/]+\/meta|POST \/api\/repos\/meta-many|PUT \/api\/auto-fetch|POST \/api\/repos\/[^/]+\/suggest-message|.* \/api\/auth\/|.* \/api\/fs\/|.* \/api\/accounts)/;

// Middleware: registra cada operación que modifica algo, con su resultado y la salida de git.
export function middleware(req, res, next) {
  if (req.method === 'GET') return next();
  const key = `${req.method} ${req.baseUrl}${req.path}`.replace(/\/$/, '');
  if (SKIP.test(key)) return next();
  const match = LABELS.find(([re]) => re.test(key));
  const started = Date.now();
  let body;
  const json = res.json.bind(res);
  res.json = (b) => { body = b; return json(b); };
  res.on('finish', () => {
    const repoId = key.match(/^\w+ \/api\/repos\/([0-9a-f-]{36})/)?.[1];
    const ok = res.statusCode < 400;
    const out = body?.output || body?.error || '';
    const lines = String(out).split('\n').map((l) => l.trim()).filter(Boolean);
    const target = req.body?.branch || req.body?.name || req.body?.hash?.slice?.(0, 7) || req.body?.target || '';
    record({
      action: match?.[1] || 'other', label: `${match?.[2] || key}${target ? ` · ${target}` : ''}`, repoId,
      ok, status: res.statusCode, ms: Date.now() - started,
      summary: ok ? (lines[lines.length - 1] || 'Completado') : (body?.error || `Error ${res.statusCode}`).split('\n')[0],
      details: [body?.output, body?.details, !ok && body?.error, body?.conflicts && `Conflictos:\n${body.conflicts.join('\n')}`].filter(Boolean).join('\n\n') || null,
    });
  });
  next();
}
