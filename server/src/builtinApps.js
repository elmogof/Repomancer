// Aplicaciones OAuth incluidas con la app (oauth-apps.json en la raíz del proyecto): si tienen Client ID,
// quien use gitlab.com o github.com inicia sesión sin registrar su propia aplicación. Estos IDs son
// públicos por diseño (OAuth con PKCE y device flow no usan secreto). Se pueden sobrescribir con
// GIT_MANAGER_GITLAB_CLIENT_ID y GIT_MANAGER_GITHUB_CLIENT_ID.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../oauth-apps.json');
// Acepta también direcciones sin esquema ("gitlab.com").
const hostOf = (url) => { try { return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).host.toLowerCase(); } catch { return null; } };

function read() {
  let f = {};
  try { f = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { /* sin archivo: sin apps incluidas */ }
  // "gitlab" puede ser un objeto o una lista de servidores (gitlab.com y, por ejemplo, el GitLab de tu empresa).
  const gitlab = (Array.isArray(f.gitlab) ? f.gitlab : [f.gitlab || { url: 'https://gitlab.com' }])
    .filter((a) => a?.url).map((a) => ({ url: a.url.replace(/\/+$/, ''), clientId: a.clientId || '' }));
  if (process.env.GIT_MANAGER_GITLAB_CLIENT_ID) {
    const com = gitlab.find((a) => hostOf(a.url) === 'gitlab.com');
    if (com) com.clientId = process.env.GIT_MANAGER_GITLAB_CLIENT_ID; else gitlab.unshift({ url: 'https://gitlab.com', clientId: process.env.GIT_MANAGER_GITLAB_CLIENT_ID });
  }
  return {
    gitlab,
    github: { url: f.github?.url || 'https://github.com', clientId: process.env.GIT_MANAGER_GITHUB_CLIENT_ID || f.github?.clientId || '' },
  };
}

export const builtinApps = () => read();

// Client ID incluido para ese servidor (solo si coincide el host), o '' si no hay.
export function builtinClientId(provider, url) {
  const apps = [read()[provider]].flat();
  return apps.find((a) => a.clientId && hostOf(a.url) === hostOf(url))?.clientId || '';
}
