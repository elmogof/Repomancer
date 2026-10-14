// Búsqueda en varios repositorios a la vez: texto dentro de los archivos (git grep) o nombres de archivo
// (git ls-files). Incluye archivos sin seguimiento que no estén ignorados. Solo lectura.
import { Router } from 'express';
import fs from 'node:fs';
import { load } from '../config.js';
import * as git from '../git.js';

const r = Router();
const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });

const CONCURRENCY = 6;
const PER_REPO = 200; // coincidencias como máximo por repositorio
const TOTAL = 2000; // y en total
const MAX_TEXT = 300; // caracteres de cada línea encontrada

async function pool(items, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); }
  }));
  return out;
}

// Repositorios donde buscar: todos, los de un grupo (scope=group:<id>) o una lista (scope=ids:a,b).
function targets(scope) {
  const repos = load().repos.filter((x) => fs.existsSync(x.path));
  if (!scope || scope === 'all') return repos;
  if (scope.startsWith('group:')) {
    const g = (load().workspaces || []).find((x) => x.id === scope.slice(6));
    if (!g) throw bad('Grupo no encontrado', 404);
    return repos.filter((x) => g.repos.includes(x.id));
  }
  if (scope.startsWith('ids:')) { const ids = new Set(scope.slice(4).split(',')); return repos.filter((x) => ids.has(x.id)); }
  throw bad('Ámbito inválido');
}

const norm = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

async function grep(repo, { q, caseSensitive, wholeWord, regex, glob }) {
  const args = ['grep', '-I', '-n', '-z', '--no-color', '--untracked', '--full-name', regex ? '-E' : '-F'];
  if (!caseSensitive) args.push('-i');
  if (wholeWord) args.push('-w');
  args.push('-e', q, '--');
  if (glob) args.push(...glob.split(/[\s,]+/).filter(Boolean));
  try {
    const { stdout } = await git.run(repo.path, args, { timeout: 60 * 1000 });
    const lines = stdout.split('\n').filter(Boolean);
    const matches = lines.slice(0, PER_REPO).map((l) => {
      const [path, line, ...rest] = l.split('\0');
      const text = rest.join('\0');
      return { path, line: Number(line), text: text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}…` : text };
    });
    return { matches, more: lines.length > PER_REPO };
  } catch (e) {
    // git grep sale con código 1 cuando no hay coincidencias.
    if (e.code === 1 && !/^(error|fatal):/m.test(e.message)) return { matches: [] };
    if (/Invalid (regular expression|preceding)|Unmatched|regcomp/i.test(e.message)) throw bad(`Expresión regular inválida: ${e.message.split('\n')[0]}`);
    return { matches: [], error: e.message.split('\n')[0] };
  }
}

// Mismas opciones que en el cliente: sin opciones, varias palabras sin distinguir mayúsculas ni tildes;
// con caseSensitive, wholeWord o regex, como en VS Code.
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function nameMatcher({ q, caseSensitive, wholeWord, regex }) {
  const fold = !caseSensitive && !regex;
  const parts = regex ? [q] : (fold ? norm(q) : q).split(/\s+/).filter(Boolean).map(escape);
  let res;
  try {
    res = parts.map((p) => new RegExp(wholeWord ? `(?<![\\p{L}\\p{N}_])(?:${p})(?![\\p{L}\\p{N}_])` : p, `${regex && !caseSensitive ? 'i' : ''}${wholeWord ? 'u' : ''}`));
  } catch (e) { throw bad(`Expresión regular inválida: ${e.message}`); }
  return (path) => { const s = fold ? norm(path) : path; return res.every((re) => re.test(s)); };
}

async function files(repo, opts) {
  const test = nameMatcher(opts);
  const { stdout } = await git.run(repo.path, ['ls-files', '--cached', '--others', '--exclude-standard', '-z']);
  const all = [...new Set(stdout.split('\0').filter(Boolean))].filter(test);
  return { matches: all.slice(0, PER_REPO).map((path) => ({ path })), more: all.length > PER_REPO };
}

// GET /api/search?q=texto&mode=text|files&scope=all|group:<id>|ids:a,b&case=1&word=1&regex=1&glob=*.js
r.get('/', async (req, res) => {
  const q = String(req.query.q || '');
  if (q.trim().length < 2) throw bad('Escribe al menos 2 caracteres');
  const mode = req.query.mode === 'files' ? 'files' : 'text';
  const opts = { q, caseSensitive: req.query.case === '1', wholeWord: req.query.word === '1', regex: req.query.regex === '1', glob: String(req.query.glob || '').trim() };
  if (mode === 'files') nameMatcher(opts); // valida la expresión antes de recorrer los repositorios
  const repos = targets(String(req.query.scope || 'all'));
  const started = Date.now();
  const found = await pool(repos, async (repo) => {
    try { return { repoId: repo.id, name: repo.name, ...(await (mode === 'files' ? files(repo, opts) : grep(repo, opts))) }; } catch (e) {
      if (e.status === 400) throw e;
      return { repoId: repo.id, name: repo.name, matches: [], error: e.message.split('\n')[0] };
    }
  });
  // Tope total para no saturar el navegador.
  let left = TOTAL;
  const results = found.filter((x) => x.matches.length || x.error).map((x) => {
    const take = x.matches.slice(0, Math.max(left, 0));
    left -= take.length;
    return { ...x, matches: take, more: x.more || take.length < x.matches.length };
  });
  res.json({ results, searched: repos.length, total: results.reduce((n, x) => n + x.matches.length, 0), truncated: left < 0 || results.some((x) => x.more), ms: Date.now() - started });
});

export default r;
