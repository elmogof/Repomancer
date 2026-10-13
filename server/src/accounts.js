// Cuentas adicionales: otras instancias de GitLab y GitHub (github.com o GitHub Enterprise),
// cada una con su token personal. La sesión principal de GitLab sigue en config.gitlab.
// Los tokens se guardan en ~/.git-manager/config.json (permisos 600) y nunca se devuelven al cliente.
import crypto from 'node:crypto';
import { load, update } from './config.js';

const hostOf = (url) => { try { return new URL(url).host.toLowerCase(); } catch { return null; } };
const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });

export const githubApiBase = (url) => (hostOf(url) === 'github.com' ? 'https://api.github.com' : `${url.replace(/\/+$/, '')}/api/v3`);

export function accounts() { return load().accounts || []; }
export const publicAccount = ({ token, ...a }) => a;

// Instancias de GitLab: la principal ("main") y las adicionales.
export function gitlabInstances() {
  const g = load().gitlab;
  return [
    { id: 'main', url: g.url, user: g.user, main: true },
    ...accounts().filter((a) => a.provider === 'gitlab').map(publicAccount),
  ];
}

export function getAccount(id) {
  const a = accounts().find((x) => x.id === id);
  if (!a) throw bad('La cuenta ya no existe', 404);
  return a;
}

// Cuenta que corresponde al host de un remoto (para credenciales de git y para la API).
export function accountForHost(host, provider) {
  if (!host) return null;
  const h = host.toLowerCase();
  return accounts().find((a) => (!provider || a.provider === provider) && hostOf(a.url) === h) || null;
}

async function verify(provider, url, token) {
  const endpoint = provider === 'github' ? `${githubApiBase(url)}/user` : `${url.replace(/\/+$/, '')}/api/v4/user`;
  const headers = provider === 'github'
    ? { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }
    : { Authorization: `Bearer ${token}` };
  let res;
  try { res = await fetch(endpoint, { headers }); } catch (e) { throw bad(`No se pudo conectar con ${url}: ${e.message}`); }
  if (res.status === 401 || res.status === 403) throw bad('El token no es válido o no tiene permisos suficientes');
  if (!res.ok) throw bad(`${url} respondió ${res.status}`);
  const u = await res.json();
  return { id: u.id, username: u.login || u.username, name: u.name || u.login || u.username, avatar_url: u.avatar_url };
}

export async function addAccount({ provider, url, token }) {
  if (!['gitlab', 'github'].includes(provider)) throw bad('Proveedor no soportado');
  const clean = (url || (provider === 'github' ? 'https://github.com' : '')).trim().replace(/\/+$/, '');
  if (!/^https?:\/\/[^/\s]+/.test(clean)) throw bad('URL inválida');
  if (!token?.trim()) throw bad('Falta el token');
  const host = hostOf(clean);
  if (provider === 'gitlab' && host === hostOf(load().gitlab.url)) throw bad('Esa es tu instancia principal de GitLab: ya tiene sesión');
  if (accountForHost(host, provider)) throw bad(`Ya hay una cuenta de ${host}. Quítala antes de añadir otra.`);
  const user = await verify(provider, clean, token.trim());
  const account = { id: crypto.randomUUID(), provider, url: clean, token: token.trim(), user, addedAt: new Date().toISOString() };
  update((c) => { c.accounts = [...(c.accounts || []), account]; });
  return publicAccount(account);
}

export function removeAccount(id) {
  update((c) => { c.accounts = (c.accounts || []).filter((a) => a.id !== id); });
}
