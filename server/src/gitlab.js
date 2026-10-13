// Cliente de la API REST v4 de GitLab + flujo OAuth2 (authorization code + PKCE).
import crypto from 'node:crypto';
import { load, update } from './config.js';
import { getAccount } from './accounts.js';

export const PORT = Number(process.env.PORT || 4000);
export const OAUTH_REDIRECT = `http://localhost:${PORT}/api/auth/oauth/callback`;
export const OAUTH_SCOPES = 'api read_user read_repository write_repository';

const base = () => load().gitlab.url.replace(/\/+$/, '');

// Devuelve un token vigente; si es OAuth y está por expirar, lo renueva.
export async function getValidToken() {
  const gl = load().gitlab;
  if (!gl.token) return null;
  if (gl.authType === 'oauth' && gl.expiresAt && Date.now() > gl.expiresAt - 60_000 && gl.refreshToken) {
    await refreshOAuth();
  }
  return load().gitlab.token;
}

// instance: id de una cuenta adicional de GitLab; sin ella (o "main") se usa la sesión principal.
export async function api(pathname, { method = 'GET', body, query, token, instance } = {}) {
  const extra = instance && instance !== 'main' ? getAccount(instance) : null;
  if (extra && extra.provider !== 'gitlab') throw Object.assign(new Error('La cuenta no es de GitLab'), { status: 400 });
  const t = token || extra?.token || (await getValidToken());
  if (!t) {
    const e = new Error('No has iniciado sesión en GitLab');
    e.status = 401;
    throw e;
  }
  const url = new URL(`${extra ? extra.url : base()}/api/v4${pathname}`);
  for (const [k, v] of Object.entries(query || {})) if (v !== undefined && v !== '') url.searchParams.set(k, v);
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${t}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const msg = data?.message ? (typeof data.message === 'string' ? data.message : JSON.stringify(data.message)) : data?.error_description || data?.error || res.statusText;
    const e = new Error(`GitLab: ${msg}`);
    e.status = res.status;
    throw e;
  }
  return { data, headers: res.headers };
}

// ---- PAT ----
export async function loginWithPat(url, token) {
  update((c) => { c.gitlab.url = url.replace(/\/+$/, ''); });
  const { data: user } = await api('/user', { token });
  update((c) => {
    Object.assign(c.gitlab, { authType: 'pat', token, refreshToken: null, expiresAt: null, user: pickUser(user) });
  });
  return pickUser(user);
}

// ---- OAuth2 + PKCE ----
const pending = new Map(); // state -> { verifier, created }

export function startOAuth(url, clientId) {
  update((c) => { c.gitlab.url = url.replace(/\/+$/, ''); c.gitlab.oauthClientId = clientId; });
  const verifier = crypto.randomBytes(48).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const state = crypto.randomBytes(16).toString('hex');
  pending.set(state, { verifier, created: Date.now() });
  const auth = new URL(`${base()}/oauth/authorize`);
  auth.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: OAUTH_REDIRECT,
    response_type: 'code',
    state,
    scope: OAUTH_SCOPES,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  }).toString();
  return auth.toString();
}

async function tokenRequest(params) {
  const res = await fetch(`${base()}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error(`GitLab OAuth: ${data.error_description || data.error || res.statusText}`);
    e.status = 400;
    throw e;
  }
  return data;
}

function storeOAuth(data) {
  update((c) => {
    Object.assign(c.gitlab, {
      authType: 'oauth',
      token: data.access_token,
      refreshToken: data.refresh_token || null,
      expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : null,
    });
  });
}

export async function finishOAuth(code, state) {
  const p = pending.get(state);
  pending.delete(state);
  if (!p || Date.now() - p.created > 10 * 60_000) {
    const e = new Error('Estado OAuth inválido o expirado. Vuelve a intentarlo.');
    e.status = 400;
    throw e;
  }
  const data = await tokenRequest({
    client_id: load().gitlab.oauthClientId,
    code,
    grant_type: 'authorization_code',
    redirect_uri: OAUTH_REDIRECT,
    code_verifier: p.verifier,
  });
  storeOAuth(data);
  const { data: user } = await api('/user');
  update((c) => { c.gitlab.user = pickUser(user); });
}

let refreshing = null;
async function refreshOAuth() {
  if (!refreshing) {
    refreshing = tokenRequest({
      client_id: load().gitlab.oauthClientId,
      refresh_token: load().gitlab.refreshToken,
      grant_type: 'refresh_token',
      redirect_uri: OAUTH_REDIRECT,
    }).then(storeOAuth).finally(() => { refreshing = null; });
  }
  return refreshing;
}

export function logout() {
  update((c) => Object.assign(c.gitlab, { authType: null, token: null, refreshToken: null, expiresAt: null, user: null }));
}

function pickUser(u) {
  return { id: u.id, username: u.username, name: u.name, avatar_url: u.avatar_url, email: u.email || u.public_email };
}
