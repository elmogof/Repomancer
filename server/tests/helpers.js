// Utilidades de las pruebas: repositorios desechables con su remoto y un servidor aislado
// (puerto propio y GIT_MANAGER_HOME temporal), para no tocar nunca la configuración real.
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function tmpDir(prefix = 'gm-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export function rm(dir) {
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

// git sin depender de la configuración global del equipo.
export function git(cwd, ...args) {
  return execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'init.defaultBranch=main', '-c', 'core.autocrlf=false', ...args], {
    cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

export function write(dir, file, text) {
  fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
  fs.writeFileSync(path.join(dir, file), text);
}

export function commit(dir, file, text, msg = `edit ${file}`) {
  write(dir, file, text);
  git(dir, 'add', '--', file);
  git(dir, 'commit', '-q', '-m', msg);
}

// Crea <root>/<name>.git (remoto) y <root>/<name> (clon) con main y las ramas indicadas publicadas en origin.
// branches: { nombre: { local: true|false } } — local:false deja la rama solo en origin.
export function makeRepo(root, name, branches = {}) {
  const bare = path.join(root, `${name}.git`);
  const work = path.join(root, name);
  git(root, 'init', '-q', '--bare', bare);
  git(root, 'clone', '-q', bare, work);
  git(work, 'checkout', '-q', '-b', 'main');
  commit(work, 'README.md', `# ${name}\n`, 'init');
  git(work, 'push', '-q', '-u', 'origin', 'main');
  for (const [b, { local = true } = {}] of Object.entries(branches)) {
    git(work, 'checkout', '-q', '-b', b, 'main');
    commit(work, `${b.replace(/\//g, '-')}.txt`, `${b}\n`, `on ${b}`);
    git(work, 'push', '-q', '-u', 'origin', b);
    git(work, 'checkout', '-q', 'main');
    if (!local) git(work, 'branch', '-q', '-D', b);
  }
  return { bare, work, name };
}

// Otro clon del mismo remoto, para simular commits de un compañero.
export function otherClone(root, repo, name = `${repo.name}-other`) {
  const dir = path.join(root, name);
  git(root, 'clone', '-q', repo.bare, dir);
  return dir;
}

export const branchOf = (dir) => git(dir, 'rev-parse', '--abbrev-ref', 'HEAD');

// Arranca el servidor real en un puerto libre con una configuración vacía y temporal.
export async function startServer() {
  const home = tmpDir('gm-home-');
  const port = 41000 + Math.floor(Math.random() * 2000);
  const child = spawn(process.execPath, ['src/index.js'], {
    cwd: SERVER_DIR, // Identidad fija: el stash automático necesita autor aunque el equipo no tenga git configurado.
    env: {
      ...process.env, PORT: String(port), GIT_MANAGER_HOME: home,
      GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.com', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.com',
    }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`El servidor no arrancó:\n${output}`)), 15000);
    const onData = (d) => { output += d; if (output.includes(`localhost:${port}`)) { clearTimeout(timer); resolve(); } };
    child.stdout.on('data', onData);
    child.stderr.on('data', (d) => { output += d; });
    child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`El servidor terminó (${code}):\n${output}`)); });
  });
  const call = async (method, url, body) => {
    const res = await fetch(`http://127.0.0.1:${port}/api${url}`, {
      method, headers: { 'X-Git-Manager': '1', ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  };
  // Como call, pero falla la prueba si la respuesta no es 2xx.
  const ok = async (method, url, body) => {
    const r = await call(method, url, body);
    if (r.status >= 300) throw new Error(`${method} ${url} → ${r.status}: ${JSON.stringify(r.data)}`);
    return r.data;
  };
  return {
    port, home, call, ok,
    async stop() {
      child.removeAllListeners('exit');
      child.kill();
      await new Promise((r) => { child.once('exit', r); setTimeout(r, 2000); });
      rm(home);
    },
  };
}
