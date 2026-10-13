// Envoltorio mínimo sobre el binario git. Usa execFile (sin shell) para evitar inyección.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { load } from './config.js';
import { getValidToken } from './gitlab.js';

function hostOf(url) {
  try { return new URL(url).host; } catch { return null; }
}

// Si el remoto apunta a la instancia de GitLab configurada, inyecta el token como
// cabecera HTTP mediante variables de entorno (GIT_CONFIG_*). Así el token no se
// escribe en .git/config ni aparece en la línea de comandos. Funciona en Windows, macOS y Linux.
async function authEnv(remoteUrl) {
  const cfg = load();
  const env = { ...process.env, GIT_TERMINAL_PROMPT: '0' };
  const glHost = hostOf(cfg.gitlab.url);
  if (remoteUrl && glHost && hostOf(remoteUrl) === glHost) {
    const token = await getValidToken();
    if (token) {
      const basic = Buffer.from(`oauth2:${token}`).toString('base64');
      env.GIT_CONFIG_COUNT = '1';
      env.GIT_CONFIG_KEY_0 = `http.${new URL(cfg.gitlab.url).origin}/.extraHeader`;
      env.GIT_CONFIG_VALUE_0 = `Authorization: Basic ${basic}`;
    }
  }
  return env;
}

export function run(cwd, args, { env, timeout = 5 * 60 * 1000 } = {}) {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd, env: env || process.env, timeout, maxBuffer: 50 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        const e = new Error((stderr || err.message).trim());
        e.status = 400;
        return reject(e);
      }
      resolve({ stdout, stderr });
    });
  });
}

export async function remoteUrl(cwd, remote = 'origin') {
  try {
    const { stdout } = await run(cwd, ['remote', 'get-url', remote]);
    return stdout.trim();
  } catch { return null; }
}

export async function runRemote(cwd, args, remote = 'origin') {
  const url = await remoteUrl(cwd, remote);
  return run(cwd, args, { env: await authEnv(url) });
}

export async function clone(url, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  return run(path.dirname(dest), ['clone', '--progress', url, dest], { env: await authEnv(url) });
}

export async function isRepo(dir) {
  try {
    const { stdout } = await run(dir, ['rev-parse', '--is-inside-work-tree']);
    return stdout.trim() === 'true';
  } catch { return false; }
}

// git status --porcelain=v2 -b  → objeto estructurado
export async function status(cwd) {
  const { stdout } = await run(cwd, ['status', '--porcelain=v2', '--branch', '-z', '--untracked-files=all']);
  const result = { branch: null, upstream: null, ahead: 0, behind: 0, files: [] };
  const parts = stdout.split('\0');
  for (let i = 0; i < parts.length; i++) {
    const line = parts[i];
    if (!line) continue;
    if (line.startsWith('# branch.head ')) result.branch = line.slice(14);
    else if (line.startsWith('# branch.upstream ')) result.upstream = line.slice(18);
    else if (line.startsWith('# branch.ab ')) {
      const m = line.match(/\+(\d+) -(\d+)/);
      if (m) { result.ahead = +m[1]; result.behind = +m[2]; }
    } else if (line[0] === '1') {
      const f = line.split(' ');
      result.files.push(entry(f[1], f.slice(8).join(' ')));
    } else if (line[0] === '2') {
      const f = line.split(' ');
      const orig = parts[++i];
      result.files.push({ ...entry(f[1], f.slice(9).join(' ')), from: orig });
    } else if (line[0] === 'u') {
      const f = line.split(' ');
      result.files.push({ path: f.slice(10).join(' '), staged: false, unstaged: true, index: 'U', worktree: 'U', conflict: true });
    } else if (line[0] === '?') {
      result.files.push({ path: line.slice(2), staged: false, unstaged: true, index: '?', worktree: '?', untracked: true });
    }
  }
  return result;
}

function entry(xy, p) {
  return { path: p, index: xy[0], worktree: xy[1], staged: xy[0] !== '.', unstaged: xy[1] !== '.' };
}
