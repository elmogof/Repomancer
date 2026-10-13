import { useState } from 'react';
import {
  Alert, Box, Button, Card, CardContent, Divider, Link, Stack, Tab, Tabs, TextField, Typography,
} from '@mui/material';
import KeyIcon from '@mui/icons-material/Key';
import { api } from '../api/client.js';

const MicrosoftLogo = () => (
  <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden="true">
    <rect x="1" y="1" width="9" height="9" fill="#f25022" /><rect x="11" y="1" width="9" height="9" fill="#7fba00" />
    <rect x="1" y="11" width="9" height="9" fill="#00a4ef" /><rect x="11" y="11" width="9" height="9" fill="#ffb900" />
  </svg>
);

export default function Login({ auth, onLoggedIn }) {
  const [tab, setTab] = useState(0);
  const [url, setUrl] = useState(auth.url || 'https://gitlab.sysco.cr');
  const [token, setToken] = useState('');
  const [clientId, setClientId] = useState(auth.oauthClientId || '');
  const [error, setError] = useState(new URLSearchParams(location.search).get('error'));
  const [busy, setBusy] = useState(false);

  const loginPat = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try { await api.post('/auth/pat', { url, token }); history.replaceState(null, '', '/'); onLoggedIn(); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  const loginOAuth = async () => {
    setBusy(true); setError(null);
    try { const { authorizeUrl } = await api.post('/auth/oauth/start', { url, clientId }); window.location.href = authorizeUrl; }
    catch (err) { setError(err.message); setBusy(false); }
  };

  const base = url.replace(/\/+$/, '');

  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', p: 2 }}>
      <Card sx={{ width: '100%', maxWidth: 520 }} variant="outlined">
        <CardContent>
          <Typography variant="h5" gutterBottom>Git Manager</Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>Conéctate a tu instancia de GitLab.</Typography>
          <TextField label="URL de GitLab" fullWidth value={url} onChange={(e) => setUrl(e.target.value)} sx={{ mb: 2 }} />
          <Tabs value={tab} onChange={(e, v) => setTab(v)} sx={{ mb: 2 }} variant="fullWidth">
            <Tab icon={<KeyIcon />} iconPosition="start" label="Token personal" />
            <Tab icon={<MicrosoftLogo />} iconPosition="start" label="Microsoft (OAuth)" />
          </Tabs>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

          {tab === 0 && (
            <form onSubmit={loginPat}>
              <TextField label="Personal Access Token" type="password" fullWidth value={token} onChange={(e) => setToken(e.target.value)} autoFocus sx={{ mb: 1 }} />
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Créalo en <Link href={`${base}/-/user_settings/personal_access_tokens`} target="_blank" rel="noreferrer">Preferencias → Access tokens</Link> con los permisos <b>api</b>, <b>read_repository</b> y <b>write_repository</b>. Se guarda solo en tu equipo.
              </Typography>
              <Button type="submit" variant="contained" fullWidth size="large" disabled={busy || !token}>Entrar con token</Button>
            </form>
          )}

          {tab === 1 && (
            <Stack spacing={2}>
              <Typography variant="body2" color="text.secondary">
                Te llevará a la página de inicio de sesión de GitLab, donde eliges <b>Microsoft</b> con tu cuenta de empresa. Esta app nunca ve tu contraseña.
              </Typography>
              <TextField label="Application ID de GitLab" fullWidth value={clientId} onChange={(e) => setClientId(e.target.value)} helperText="Se obtiene al registrar la aplicación (ver abajo)." />
              <Button variant="contained" size="large" startIcon={<MicrosoftLogo />} onClick={loginOAuth} disabled={busy || !clientId}>Iniciar sesión con Microsoft</Button>
              <Divider />
              <Typography variant="subtitle2">Registro único de la aplicación en GitLab</Typography>
              <Typography variant="body2" component="div" color="text.secondary">
                <ol style={{ margin: 0, paddingLeft: 18 }}>
                  <li>Abre <Link href={`${base}/-/user_settings/applications`} target="_blank" rel="noreferrer">Preferencias → Applications</Link>.</li>
                  <li>Nombre: <code>Git Manager local</code>.</li>
                  <li>Redirect URI: <code>{auth.oauthRedirect}</code></li>
                  <li>Desmarca <b>Confidential</b>.</li>
                  <li>Scopes: <code>{auth.oauthScopes}</code>.</li>
                  <li>Guarda y copia el <b>Application ID</b> aquí.</li>
                </ol>
              </Typography>
            </Stack>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
