import fs from 'node:fs';
import path from 'node:path';

// Carpetas que nunca contienen repositorios propios y que son muy costosas de recorrer.
const SKIP = new Set([
  'node_modules', 'bower_components', 'jspm_packages', 'vendor', '__pycache__', 'venv', '.venv',
  'site-packages', 'dist', 'build', 'out', 'target', 'bin', 'obj', 'coverage', '.next', '.nuxt',
  '.gradle', '.m2', '.cargo', '.rustup', '.npm', '.nvm', '.yarn', '.pnpm-store', '.cache',
  'AppData', 'Application Data', 'Local Settings', 'Program Files', 'Program Files (x86)',
  'ProgramData', 'Windows', '$Recycle.Bin', 'System Volume Information', 'Library',
]);

const MAX_DIRS = 300000;
const MAX_MS = 90000;
const CONCURRENCY = 32;

const read = (f) => fs.promises.readFile(f, 'utf8').catch(() => null);
const exists = (f) => fs.promises.access(f).then(() => true, () => false);

// Comprueba sin lanzar git que <dir>/.git sea un repositorio real y útil:
// estructura válida (HEAD, objects, refs) y al menos un commit o un remoto.
// Así se descartan los "git init" accidentales vacíos.
export async function inspectRepo(dir) {
  const dotGit = path.join(dir, '.git');
  let stat;
  try { stat = await fs.promises.stat(dotGit); } catch { return null; }

  let gitDir = dotGit;
  if (stat.isFile()) {
    // Worktree o submódulo: el archivo .git apunta al directorio real.
    const m = (await read(dotGit))?.match(/^gitdir:\s*(.+)\s*$/m);
    if (!m) return { valid: false, reason: 'Archivo .git inválido' };
    gitDir = path.resolve(dir, m[1].trim());
  } else if (!stat.isDirectory()) return null;

  const head = (await read(path.join(gitDir, 'HEAD')))?.trim();
  if (!head) return { valid: false, reason: 'Falta HEAD' };
  const common = (await read(path.join(gitDir, 'commondir')))?.trim();
  const commonDir = common ? path.resolve(gitDir, common) : gitDir;
  if (!(await exists(path.join(commonDir, 'objects'))) || !(await exists(path.join(commonDir, 'refs')))) {
    return { valid: false, reason: 'Estructura .git incompleta' };
  }

  let hasCommits = /^[0-9a-f]{40,64}$/.test(head);
  let branch = null;
  const ref = head.match(/^ref:\s*(.+)$/)?.[1];
  if (ref) {
    branch = ref.replace(/^refs\/heads\//, '');
    hasCommits = (await exists(path.join(gitDir, ref))) || (await exists(path.join(commonDir, ref)))
      || ((await read(path.join(commonDir, 'packed-refs')))?.split('\n').some((l) => l.endsWith(` ${ref}`)) ?? false);
    if (!hasCommits) {
      // La rama actual puede no existir aún aunque haya otras ramas con commits.
      const heads = await fs.promises.readdir(path.join(commonDir, 'refs', 'heads')).catch(() => []);
      hasCommits = heads.length > 0;
    }
  }
  const config = (await read(path.join(commonDir, 'config'))) || '';
  const remote = config.match(/\[remote\s+"[^"]+"\][^[]*?url\s*=\s*(.+)/)?.[1]?.trim() || null;
  if (/^\s*bare\s*=\s*true/m.test(config)) return { valid: false, reason: 'Repositorio bare' };
  if (!hasCommits && !remote) return { valid: false, reason: 'Vacío: sin commits ni remoto' };
  return { valid: true, branch, remote, hasCommits };
}

// Recorre todo el árbol bajo <root> sin límite de profundidad (en paralelo, sin
// seguir enlaces simbólicos) y sigue buscando dentro de los repositorios para
// encontrar repos anidados. Se detiene por número de carpetas o por tiempo.
export async function findRepos(root) {
  const start = Date.now();
  const repos = [], ignored = [];
  const queue = [root];
  let scanned = 0, truncated = false, active = 0;

  await new Promise((resolve) => {
    const next = () => {
      if (!queue.length && !active) return resolve();
      while (active < CONCURRENCY && queue.length) {
        if (scanned >= MAX_DIRS || Date.now() - start > MAX_MS) { truncated = true; queue.length = 0; break; }
        const dir = queue.pop();
        scanned++; active++;
        visit(dir).finally(() => { active--; next(); });
      }
      if (!queue.length && !active) resolve();
    };
    const visit = async (dir) => {
      let entries;
      try { entries = await fs.promises.readdir(dir, { withFileTypes: true }); } catch { return; }
      if (entries.some((e) => e.name === '.git')) {
        const info = await inspectRepo(dir);
        if (info?.valid) repos.push({ path: dir, ...info });
        else if (info) ignored.push({ path: dir, reason: info.reason });
      }
      for (const e of entries) {
        if (!e.isDirectory() || e.isSymbolicLink()) continue;
        if (e.name === '.git' || SKIP.has(e.name) || e.name.startsWith('$')) continue;
        if (e.name.startsWith('.') && e.name !== '.github') continue;
        queue.push(path.join(dir, e.name));
      }
    };
    next();
  });

  repos.sort((a, b) => a.path.localeCompare(b.path, undefined, { sensitivity: 'base', numeric: true }));
  return { repos, ignored, scanned, truncated, ms: Date.now() - start };
}

// Rama actual leída directamente de .git/HEAD (rápido, sin lanzar git).
export async function currentBranch(dir) {
  let gitDir = path.join(dir, '.git');
  const pointer = (await read(gitDir))?.match(/^gitdir:\s*(.+)\s*$/m);
  if (pointer) gitDir = path.resolve(dir, pointer[1].trim());
  const head = (await read(path.join(gitDir, 'HEAD')))?.trim();
  if (!head) return null;
  const ref = head.match(/^ref:\s*refs\/heads\/(.+)$/)?.[1];
  return ref || (head.length >= 7 ? `(${head.slice(0, 7)})` : null);
}
