import { Router } from 'express';
import { load } from '../config.js';
import * as gl from '../gitlab.js';

const r = Router();
const CLIENT_URL = process.env.CLIENT_URL || (process.argv.includes('--prod') ? `http://localhost:${gl.PORT}` : 'http://localhost:5173');

r.get('/status', (req, res) => {
  const g = load().gitlab;
  res.json({
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
  if (error) return res.redirect(`${CLIENT_URL}/login?error=${encodeURIComponent(error_description || error)}`);
  try {
    await gl.finishOAuth(code, state);
    res.redirect(`${CLIENT_URL}/`);
  } catch (e) {
    res.redirect(`${CLIENT_URL}/login?error=${encodeURIComponent(e.message)}`);
  }
});

r.post('/logout', (req, res) => {
  gl.logout();
  res.json({ ok: true });
});

export default r;
