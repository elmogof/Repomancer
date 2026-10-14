import { Router } from 'express';
import { load } from '../config.js';
import * as gl from '../gitlab.js';
import { GITHUB_SCOPES, githubLogin, logoutGithub, pollDevice, saveGithubLogin, startDevice } from '../githubAuth.js';

const r = Router();
const CLIENT_URL = process.env.CLIENT_URL || (process.argv.includes('--prod') ? `http://localhost:${gl.PORT}` : 'http://localhost:5173');

r.get('/status', (req, res) => {
  const c = load();
  const g = c.gitlab;
  res.json({
    // Sesión de GitHub con la que se entró a la app (si la hay); la app se abre con GitLab o con GitHub.
    github: githubLogin(),
    githubClientId: c.github?.oauthClientId || '',
    githubUrl: c.github?.url || 'https://github.com',
    githubScopes: GITHUB_SCOPES,
    url: g.url,
    authType: g.authType,
    user: g.user,
    oauthClientId: g.oauthClientId,
    oauthRedirect: gl.OAUTH_REDIRECT,
    oauthScopes: gl.OAUTH_SCOPES,
  });
});

r.post('/pat', async (req, res) => {
  const { url, token } = req.body || {};
  if (!url || !token) return res.status(400).json({ error: 'Faltan la URL o el token' });
  res.json({ user: await gl.loginWithPat(url, token.trim()) });
});

r.post('/oauth/start', (req, res) => {
  const { url, clientId } = req.body || {};
  if (!url || !clientId) return res.status(400).json({ error: 'Faltan la URL o el Application ID' });
  res.json({ authorizeUrl: gl.startOAuth(url, clientId.trim()) });
});

// GitLab redirige aquí tras el inicio de sesión (con Microsoft u otro proveedor).
r.get('/oauth/callback', async (req, res) => {
  const { code, state, error, error_description } = req.query;
  if (error) return res.redirect(`${CLIENT_URL}/login?error=${encodeURIComponent(error_description || error)}`); // también sirve si ya hay sesión de GitHub: /login muestra la conexión de GitLab
  try {
    await gl.finishOAuth(code, state);
    res.redirect(`${CLIENT_URL}/`);
  } catch (e) {
    res.redirect(`${CLIENT_URL}/login?error=${encodeURIComponent(e.message)}`);
  }
});

// GitHub con token personal.
r.post('/github/pat', async (req, res) => {
  const { url, token } = req.body || {};
  if (!token?.trim()) return res.status(400).json({ error: 'Falta el token' });
  res.json({ account: await saveGithubLogin(url, token.trim(), 'pat') });
});

// GitHub con OAuth (device flow): se pide un código y luego se consulta hasta que el usuario lo confirma.
r.post('/github/device/start', async (req, res) => res.json(await startDevice(req.body?.url, req.body?.clientId)));
r.post('/github/device/poll', async (req, res) => res.json(await pollDevice(req.body?.id)));

// Cierra la sesión de la app: GitLab principal y la cuenta de GitHub con la que se entró.
// Las cuentas añadidas desde «Cuentas» se conservan.
r.post('/logout', (req, res) => {
  gl.logout();
  logoutGithub();
  res.json({ ok: true });
});

export default r;
