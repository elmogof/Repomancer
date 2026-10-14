// Inicio de sesión con una cuenta de GitHub (github.com o GitHub Enterprise).
// - Token personal: se verifica y se guarda como cuenta.
// - OAuth "device flow": no necesita secreto ni URL de retorno, ideal para una app local. La app pide un
//   código, el usuario lo escribe en github.com/login/device y la app recibe el token. Requiere registrar
//   una OAuth App con "Enable Device Flow" activado; solo se usa su Client ID.
// La cuenta queda marcada como "login": es la sesión de la app cuando no hay sesión de GitLab.
import crypto from 'node:crypto';
import { load, update } from './config.js';
import { accountForHost, publicAccount, verifyToken } from './accounts.js';

export const GITHUB_SCOPES = 'repo read:user read:org';
const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });
const cleanUrl = (url) => (url || 'https://github.com').trim().replace(/\/+$/, '');
const hostOf = (url) => { try { return new URL(url).host.toLowerCase(); } catch { return null; } };

// Guarda (o reemplaza) la cuenta de GitHub de ese host y la marca como sesión de la app.
export async function saveGithubLogin(url, token, authType) {
  const clean = cleanUrl(url);
  if (!/^https?:\/\/[^/\s]+/.test(clean)) throw bad('URL inválida');
  const user = await verifyToken('github', clean, token);
  const existing = accountForHost(hostOf(clean), 'github');
  const account = { id: existing?.id || crypto.randomUUID(), provider: 'github', url: clean, token, user, authType, login: true, addedAt: new Date().toISOString() };
  update((c) => { c.accounts = [...(c.accounts || []).filter((a) => a.id !== account.id), account]; });
  return publicAccount(account);
}

// Peticiones de device flow en curso: el device_code nunca sale del servidor.
const pending = new Map();

async function postForm(url, form) {
  let res;
  try {
    res = await fetch(url, { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(form) });
  } catch (e) { throw bad(`No se pudo conectar con ${new URL(url).host}: ${e.message}`); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok && !data.error) throw bad(`${new URL(url).host} respondió ${res.status}`);
  return data;
}

export async function startDevice(url, clientId) {
  const base = cleanUrl(url);
  if (!clientId?.trim()) throw bad('Falta el Client ID de la OAuth App');
  const d = await postForm(`${base}/login/device/code`, { client_id: clientId.trim(), scope: GITHUB_SCOPES });
  if (d.error) {
    throw bad(d.error === 'device_flow_disabled'
      ? 'La OAuth App no tiene activado "Enable Device Flow". Actívalo en su configuración.'
      : d.error === 'unauthorized_client' || d.error === 'incorrect_client_credentials' ? 'Client ID no válido' : (d.error_description || d.error));
  }
  update((c) => { c.github = { ...(c.github || {}), oauthClientId: clientId.trim(), url: base }; });
  const id = crypto.randomUUID();
  pending.set(id, { base, clientId: clientId.trim(), deviceCode: d.device_code, expiresAt: Date.now() + d.expires_in * 1000 });
  return { id, userCode: d.user_code, verificationUri: d.verification_uri, interval: d.interval || 5, expiresIn: d.expires_in };
}

// Una consulta: { pending, interval } mientras el usuario no confirma, o { account } al terminar.
export async function pollDevice(id) {
  const p = pending.get(id);
  if (!p) throw bad('La solicitud ya no existe. Empieza de nuevo.');
  if (Date.now() > p.expiresAt) { pending.delete(id); throw bad('El código caducó. Empieza de nuevo.'); }
  const d = await postForm(`${p.base}/login/oauth/access_token`, {
    client_id: p.clientId, device_code: p.deviceCode, grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
  });
  if (d.error === 'authorization_pending') return { pending: true };
  if (d.error === 'slow_down') return { pending: true, interval: d.interval };
  pending.delete(id);
  if (d.error === 'access_denied') throw bad('Cancelaste la autorización en GitHub');
  if (d.error === 'expired_token') throw bad('El código caducó. Empieza de nuevo.');
  if (d.error || !d.access_token) throw bad(d.error_description || d.error || 'GitHub no devolvió un token');
  return { account: await saveGithubLogin(p.base, d.access_token, 'oauth') };
}

export function githubLogin() {
  const a = (load().accounts || []).find((x) => x.provider === 'github' && x.login);
  return a ? publicAccount(a) : null;
}

export function logoutGithub() {
  update((c) => { c.accounts = (c.accounts || []).filter((a) => !a.login); });
}
