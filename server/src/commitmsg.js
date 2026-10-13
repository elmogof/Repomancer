// Propone un mensaje de commit (Conventional Commits) a partir del diff, con reglas locales:
// no se envía código a ningún servicio externo.
import path from 'node:path';
import * as git from './git.js';

const DOC_RE = /(^|\/)(docs?\/|readme|changelog|license|contributing)|\.(md|mdx|txt|rst|adoc)$/i;
const TEST_RE = /(^|\/)(tests?|__tests__|spec|e2e|cypress)\/|\.(test|spec)\.[jt]sx?$/i;
const CI_RE = /(^|\/)(\.github\/workflows\/|\.gitlab-ci\.yml$|jenkinsfile$|azure-pipelines\.yml$|\.circleci\/)/i;
const BUILD_RE = /(^|\/)(package(-lock)?\.json|yarn\.lock|pnpm-lock\.yaml|vite\.config\.[jt]s|webpack\.config\.[jt]s|tsconfig.*\.json|babel\.config\.\w+|dockerfile|docker-compose\.ya?ml|\.npmrc|pom\.xml|build\.gradle|requirements\.txt|go\.mod|go\.sum|cargo\.toml)$/i;
const DEPS_RE = /(^|\/)(package(-lock)?\.json|yarn\.lock|pnpm-lock\.yaml|requirements\.txt|go\.(mod|sum)|cargo\.lock)$/i;
const GENERIC_DIRS = new Set(['src', 'lib', 'app', 'apps', 'packages', 'components', 'pages', 'routes', 'utils', 'source']);

const VERB = { A: 'agrega', D: 'elimina', R: 'renombra', M: 'actualiza', C: 'copia', T: 'actualiza' };

// Ámbito: la carpeta común más significativa (p. ej. "client", "server", "auth").
function scopeOf(paths) {
  const dirs = paths.map((p) => path.posix.dirname(p).split('/').filter((d) => d && d !== '.'));
  if (!dirs.length || dirs.some((d) => !d.length)) return '';
  const common = [];
  for (let i = 0; dirs.every((d) => d[i] && d[i] === dirs[0][i]); i++) common.push(dirs[0][i]);
  const meaningful = common.filter((d) => !GENERIC_DIRS.has(d.toLowerCase()));
  // Un solo nivel con sentido (client/server/api…) o el último específico si es más concreto.
  return (meaningful[meaningful.length - 1] || common[0] || '').toLowerCase().replace(/[^a-z0-9._-]/g, '');
}

const joinEs = (list) => (list.length <= 1 ? list[0] || '' : `${list.slice(0, -1).join(', ')} y ${list[list.length - 1]}`);

// Nombres de funciones, componentes o rutas que aparecen en las líneas añadidas (para enriquecer el resumen).
function symbols(diff) {
  const found = new Set();
  for (const l of diff.split('\n')) {
    if (!l.startsWith('+') || l.startsWith('+++')) continue;
    const m = l.match(/^\+\s*(?:export\s+(?:default\s+)?)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/)
      || l.match(/^\+\s*(?:export\s+)?class\s+([A-Za-z_$][\w$]*)/)
      || l.match(/^\+\s*(?:export\s+)?const\s+([A-Z][\w$]*)\s*=\s*(?:\(|function|React\.|memo|forwardRef)/)
      || l.match(/^\+\s*(?:def|class)\s+([A-Za-z_]\w*)/);
    if (m) found.add(m[1]);
    const route = l.match(/^\+\s*\w+\.(get|post|put|patch|delete)\(\s*['"`]([^'"`]+)/);
    if (route) found.add(`${route[1].toUpperCase()} ${route[2]}`);
    if (found.size >= 6) break;
  }
  return [...found];
}

export async function suggest(cwd) {
  // Se usa lo preparado; si no hay nada preparado, todos los cambios del árbol.
  let cached = true;
  let { stdout: ns } = await git.run(cwd, ['diff', '--cached', '--name-status', '-M', '-z']);
  if (!ns.trim()) {
    cached = false;
    ({ stdout: ns } = await git.run(cwd, ['diff', '--name-status', '-M', '-z']));
  }
  const files = [];
  const t = ns.split('\0');
  for (let i = 0; i < t.length - 1;) {
    const st = t[i++];
    if (!st) continue;
    if (/^[RC]/.test(st)) { const from = t[i++]; files.push({ status: st[0], from, path: t[i++] }); }
    else files.push({ status: st[0], path: t[i++] });
  }
  if (!cached) {
    const { stdout: untracked } = await git.run(cwd, ['ls-files', '--others', '--exclude-standard', '-z']);
    untracked.split('\0').filter(Boolean).forEach((p) => files.push({ status: 'A', path: p }));
  }
  if (!files.length) {
    const e = new Error('No hay cambios para describir');
    e.status = 400;
    throw e;
  }
  const flag = cached ? ['--cached'] : [];
  const [{ stdout: num }, { stdout: diff }, { stdout: ws }] = await Promise.all([
    git.run(cwd, ['diff', ...flag, '--numstat', '-M']),
    git.run(cwd, ['diff', ...flag, '--no-color', '-M', '-U0']),
    git.run(cwd, ['diff', ...flag, '-w', '--ignore-blank-lines', '--numstat', '-M']),
  ]);
  const stats = {};
  for (const l of num.split('\n').filter(Boolean)) {
    const [a, d, ...p] = l.split('\t');
    const key = p.join('\t').replace(/^(.*)\{.* => (.*)\}(.*)$/, '$1$2$3').replace(/^.* => /, '');
    stats[key] = { add: Number(a) || 0, del: Number(d) || 0 };
  }
  files.forEach((f) => Object.assign(f, stats[f.path] || { add: 0, del: 0 }));
  const paths = files.map((f) => f.path);
  const adds = files.reduce((s, f) => s + f.add, 0), dels = files.reduce((s, f) => s + f.del, 0);
  const every = (re) => paths.every((p) => re.test(p));
  const count = (s) => files.filter((f) => f.status === s).length;

  // Tipo según reglas en orden de prioridad.
  let type;
  if (every(DOC_RE)) type = 'docs';
  else if (every(TEST_RE)) type = 'test';
  else if (every(CI_RE)) type = 'ci';
  else if (every(BUILD_RE)) type = 'build';
  else if (cached && !ws.trim() && count('M') === files.length) type = 'style'; // solo espacios o formato
  else if (count('R') === files.length) type = 'refactor';
  else if (count('D') === files.length) type = 'chore';
  else if (count('A') > 0 && count('A') >= files.length / 2) type = 'feat';
  else if (adds + dels <= 20 && files.length <= 2) type = 'fix';
  else if (dels > adds * 1.5) type = 'refactor';
  else type = 'feat';

  let scope = every(DEPS_RE) ? 'deps' : scopeOf(paths);
  if (scope === type || (type === 'docs' && scope === 'doc') || (type === 'test' && /^tests?$/.test(scope))) scope = ''; // evita «docs(docs)»
  const names = files.map((f) => path.posix.basename(f.path));
  const sameStatus = files.every((f) => f.status === files[0].status);
  const verb = sameStatus ? VERB[files[0].status] || 'actualiza' : 'actualiza';
  const syms = symbols(diff);

  let subject;
  if (type === 'docs') subject = `${verb} documentación${files.length === 1 ? ` (${names[0]})` : ''}`;
  else if (scope === 'deps') subject = 'actualiza dependencias';
  else if (type === 'style') subject = `aplica formato a ${files.length === 1 ? names[0] : `${files.length} archivos`}`;
  else if (files.length === 1 && files[0].status === 'R') subject = `renombra ${path.posix.basename(files[0].from)} a ${names[0]}`;
  else if (files.length === 1) subject = `${verb} ${names[0]}${syms.length && files[0].status !== 'D' ? ` (${joinEs(syms.slice(0, 2))})` : ''}`;
  else if (files.length <= 3) subject = `${verb} ${joinEs(names)}`;
  else subject = `${verb} ${files.length} archivos${scope ? ` de ${scope}` : ''}`;

  const label = { A: 'nuevo', D: 'eliminado', R: 'renombrado', M: 'modificado', C: 'copiado', T: 'tipo' };
  const body = files.length > 1
    ? files.slice(0, 15).map((f) => `- ${f.path}${f.from ? ` (antes ${f.from})` : ''}: ${label[f.status] || 'modificado'}${f.add || f.del ? ` +${f.add} -${f.del}` : ''}`)
      .concat(files.length > 15 ? [`- … y ${files.length - 15} archivos más`] : []).join('\n')
    : '';
  const header = `${type}${scope ? `(${scope})` : ''}: ${subject}`;
  return { type, scope, subject, body, message: body ? `${header}\n\n${body}` : header, staged: cached, files: files.length, symbols: syms };
}
