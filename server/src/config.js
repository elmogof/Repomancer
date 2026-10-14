// Configuración local: se guarda FUERA del proyecto, en ~/.git-manager/config.json
// (permisos 600). Aquí viven el token de GitLab y la lista de repositorios.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const CONFIG_DIR = process.env.GIT_MANAGER_HOME || path.join(os.homedir(), '.git-manager');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

const defaults = {
  gitlab: {
    url: 'https://gitlab.com',
    authType: null, // 'pat' | 'oauth'
    token: null,
    refreshToken: null,
    expiresAt: null,
    user: null,
    oauthClientId: '',
  },
  repos: [], // { id, name, path, gitlabProjectId? }
  defaultCloneDir: path.join(os.homedir(), 'repos'),
};

let cache = null;

export function load() {
  if (cache) return cache;
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    cache = { ...defaults, ...raw, gitlab: { ...defaults.gitlab, ...(raw.gitlab || {}) } };
  } catch {
    cache = structuredClone(defaults);
  }
  return cache;
}

export function save() {
  fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cache, null, 2), { mode: 0o600 });
}

export function update(fn) {
  const cfg = load();
  fn(cfg);
  save();
  return cfg;
}
