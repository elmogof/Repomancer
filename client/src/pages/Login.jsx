import { useEffect, useRef, useState } from 'react';
import {
  Alert, Box, Button, Card, CardContent, CircularProgress, Collapse, Divider, IconButton, Link, Stack, Tab, Tabs, TextField,
  ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import KeyIcon from '@mui/icons-material/Key';
import GitHubIcon from '@mui/icons-material/GitHub';
import CopyIcon from '@mui/icons-material/ContentCopy';
import OpenIcon from '@mui/icons-material/OpenInNew';
import ExpandIcon from '@mui/icons-material/ExpandMore';
import { api } from '../api/client.js';

// className: las pestañas de MUI le añaden su margen de icono.
export const GitLabLogo = ({ size = 18, className }) => (
  <svg className={className} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#FC6D26" d="m23.6 9.593-.033-.086L20.3.98a.851.851 0 0 0-.336-.405.875.875 0 0 0-1 .054.875.875 0 0 0-.29.44L16.47 7.818H7.537L5.333 1.07a.857.857 0 0 0-.29-.441.875.875 0 0 0-1-.054.859.859 0 0 0-.336.405L.433 9.502l-.032.086a6.066 6.066 0 0 0 2.012 7.01l.01.009.03.021 4.977 3.727 2.462 1.863 1.5 1.132a1.008 1.008 0 0 0 1.22 0l1.499-1.132 2.461-1.863 5.006-3.75.013-.01a6.068 6.068 0 0 0 2.01-7.002z" />
  </svg>
);

const hostOf = (u) => { try { return new URL(/^https?:\/\//i.test(u) ? u : `https://${u}`).host.toLowerCase(); } catch { return ''; } };
// Client ID de la aplicación incluida con Git Manager para ese servidor (gitlab.com / github.com), si existe.
const builtinFor = (auth, provider, url) => {
  const apps = [auth.builtin?.[provider] || []].flat();
  return apps.find((a) => a.clientId && hostOf(a.url) === hostOf(url))?.clientId || '';
};
const GITLAB_COM = 'https://gitlab.com';

const Steps = ({ title, open, onToggle, children }) => (
  <Box>
    <Button size="small" onClick={onToggle} endIcon={<ExpandIcon sx={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />} sx={{ px: 0 }}>{title}</Button>
    <Collapse in={open}>
      <Typography variant="body2" component="div" color="text.secondary" sx={{ mt: 1 }}>
        <ol style={{ margin: 0, paddingLeft: 18 }}>{children}</ol>
      </Typography>
    </Collapse>
  </Box>
);

// ---------- GitLab: cuenta normal (OAuth: usuario y contraseña, Microsoft…) o token personal ----------
function GitLabLogin({ auth, onLoggedIn, setError, busy, setBusy }) {
  const [tab, setTab] = useState(0);
  // Como en GitHub: por defecto gitlab.com; la dirección solo se pide para un GitLab propio (self-managed).
  const [selfHosted, setSelfHosted] = useState(!!auth.url && hostOf(auth.url) !== hostOf(GITLAB_COM));
  const [url, setUrl] = useState(selfHosted ? auth.url : '');
  const [token, setToken] = useState('');
  const base = (selfHosted ? (/^https?:\/\//i.test(url) ? url : `https://${url}`) : GITLAB_COM).replace(/\/+$/, '');
  // Application ID por defecto: el guardado para ese servidor tras iniciar sesión, o el incluido en Git Manager.
  const stored = auth.gitlabClientIds?.[hostOf(base)] || '';
  const builtin = builtinFor(auth, 'gitlab', base);
  const [custom, setCustom] = useState(false);
  const [clientId, setClientId] = useState('');
  const [help, setHelp] = useState(true);
  const useDefault = !!(stored || builtin) && !custom;
  const useBuiltin = useDefault; // nombre usado más abajo

  const loginPat = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try { await api.post('/auth/pat', { url: base, token }); history.replaceState(null, '', '/'); onLoggedIn(); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };
  const loginOAuth = async () => {
    setBusy(true); setError(null);
    try { const { authorizeUrl } = await api.post('/auth/oauth/start', { url: base, clientId: useDefault ? stored : clientId }); window.location.href = authorizeUrl; }
    catch (err) { setError(err.message); setBusy(false); }
  };

  return (
    <>
      {selfHosted
        ? <TextField label="URL de tu GitLab" fullWidth value={url} onChange={(e) => { setUrl(e.target.value); setCustom(false); }} placeholder="https://gitlab.tu-empresa.com" sx={{ mb: 1 }}
            helperText={<Link component="button" type="button" onClick={() => { setSelfHosted(false); setCustom(false); }}>Usar gitlab.com</Link>} />
        : <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Cuenta de <b>gitlab.com</b> · <Link component="button" type="button" onClick={() => { setSelfHosted(true); setCustom(false); }}>¿GitLab propio (self-managed)?</Link>
          </Typography>}
      <Tabs value={tab} onChange={(e, v) => setTab(v)} sx={{ mb: 2 }} variant="fullWidth">
        <Tab icon={<GitLabLogo />} iconPosition="start" label="Cuenta de GitLab" />
        <Tab icon={<KeyIcon />} iconPosition="start" label="Token personal" />
      </Tabs>
      {tab === 0 && (
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary">
            Te llevará a la página de inicio de sesión de GitLab, donde entras con tu <b>usuario y contraseña</b> o con el proveedor que tenga tu GitLab (Google, Microsoft…). Esta app nunca ve tu contraseña.
          </Typography>
          {!useDefault && <TextField label="Application ID de GitLab" fullWidth value={clientId} onChange={(e) => setClientId(e.target.value)} helperText={`Se obtiene una sola vez al registrar la aplicación en ${hostOf(base) || 'tu GitLab'}; se recuerda al iniciar sesión.`} />}
          <Button variant="contained" size="large" startIcon={<GitLabLogo />} onClick={loginOAuth} disabled={busy || (selfHosted && !hostOf(url)) || (!useDefault && !clientId)}>Iniciar sesión con GitLab</Button>
          {(stored || builtin) && (
            <Link component="button" type="button" variant="body2" onClick={() => { setClientId(custom ? '' : stored); setCustom((c) => !c); }} sx={{ alignSelf: 'center' }}>
              {custom ? (stored ? 'Usar el Application ID guardado' : 'Usar la aplicación incluida en Git Manager') : 'Usar otro Application ID'}
            </Link>
          )}
          {!useBuiltin && <Divider />}
          {!useBuiltin && <Steps title="Registro único de la aplicación en GitLab" open={help} onToggle={() => setHelp((h) => !h)}>
            <li>Abre <Link href={`${base}/-/user_settings/applications`} target="_blank" rel="noreferrer">Preferencias → Applications</Link>.</li>
            <li>Nombre: <code>Git Manager local</code>.</li>
            <li>Redirect URI: <code>{auth.oauthRedirect}</code></li>
            <li>Desmarca <b>Confidential</b>.</li>
            <li>Scopes: <code>{auth.oauthScopes}</code>.</li>
            <li>Guarda y copia el <b>Application ID</b> aquí.</li>
          </Steps>}
        </Stack>
      )}
      {tab === 1 && (
        <form onSubmit={loginPat}>
          <TextField label="Personal Access Token" type="password" fullWidth value={token} onChange={(e) => setToken(e.target.value)} autoFocus sx={{ mb: 1 }} />
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Créalo en <Link href={`${base}/-/user_settings/personal_access_tokens`} target="_blank" rel="noreferrer">Preferencias → Access tokens</Link> con los permisos <b>api</b>, <b>read_repository</b> y <b>write_repository</b>. Se guarda solo en tu equipo.
          </Typography>
          <Button type="submit" variant="contained" fullWidth size="large" disabled={busy || !token}>Entrar con token</Button>
        </form>
      )}
    </>
  );
}

// ---------- GitHub: cuenta normal (OAuth device flow) o token personal ----------
function GitHubLogin({ auth, onLoggedIn, setError, busy, setBusy }) {
  const [tab, setTab] = useState(0);
  const [url, setUrl] = useState(auth.githubUrl || 'https://github.com');
  const [enterprise, setEnterprise] = useState(hostOf(auth.githubUrl || 'https://github.com') !== 'github.com');
  const [token, setToken] = useState('');
  const [clientId, setClientId] = useState('');
  const [custom, setCustom] = useState(false);
  const [help, setHelp] = useState(true);
  const [device, setDevice] = useState(null); // { id, userCode, verificationUri, interval }
  const [copied, setCopied] = useState(false);
  const timer = useRef(null);
  const base = (enterprise ? url : 'https://github.com').replace(/\/+$/, '');
  // Client ID por defecto: el propio guardado para ese servidor tras usarlo, o el incluido en Git Manager.
  const stored = auth.githubClientId && hostOf(auth.githubUrl) === hostOf(base) ? auth.githubClientId : '';
  const builtin = builtinFor(auth, 'github', base);
  const useBuiltin = !!(stored || builtin) && !custom;

  useEffect(() => () => clearTimeout(timer.current), []);

  const loginPat = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try { await api.post('/auth/github/pat', { url: base, token }); history.replaceState(null, '', '/'); onLoggedIn(); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  // Consulta a GitHub cada pocos segundos hasta que el usuario confirma el código en el navegador.
  const poll = (d, interval) => {
    timer.current = setTimeout(async () => {
      try {
        const r = await api.post('/auth/github/device/poll', { id: d.id });
        if (r.pending) return poll(d, r.interval || interval);
        setDevice(null); setBusy(false); history.replaceState(null, '', '/'); onLoggedIn();
      } catch (err) { setDevice(null); setBusy(false); setError(err.message); }
    }, interval * 1000);
  };
  const start = async () => {
    setBusy(true); setError(null); setCopied(false);
    try {
      const d = await api.post('/auth/github/device/start', { url: base, clientId: useBuiltin ? stored : clientId });
      setDevice(d);
      try { await navigator.clipboard.writeText(d.userCode); setCopied(true); } catch { /* sin portapapeles */ }
      window.open(d.verificationUri, '_blank', 'noopener');
      poll(d, d.interval);
    } catch (err) { setError(err.message); setBusy(false); }
  };
  const cancel = () => { clearTimeout(timer.current); setDevice(null); setBusy(false); };

  return (
    <>
      {enterprise
        ? <TextField label="URL de GitHub Enterprise" fullWidth value={url} onChange={(e) => { setUrl(e.target.value); setCustom(false); }} sx={{ mb: 1 }}
            helperText={<Link component="button" type="button" onClick={() => { setEnterprise(false); setCustom(false); }}>Usar github.com</Link>} />
        : <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Cuenta de <b>github.com</b> · <Link component="button" type="button" onClick={() => { setEnterprise(true); setCustom(false); if (hostOf(url) === 'github.com') setUrl(''); }}>¿GitHub Enterprise?</Link>
          </Typography>}
      <Tabs value={tab} onChange={(e, v) => { cancel(); setTab(v); }} sx={{ mb: 2 }} variant="fullWidth">
        <Tab icon={<GitHubIcon fontSize="small" />} iconPosition="start" label="Cuenta de GitHub" />
        <Tab icon={<KeyIcon />} iconPosition="start" label="Token personal" />
      </Tabs>
      {tab === 0 && (
        <Stack spacing={2}>
          {device ? (
            <Stack spacing={1.5} alignItems="center" sx={(t) => ({ p: 2.5, borderRadius: 2, border: 1, borderColor: 'divider', bgcolor: alpha(t.palette.primary.main, 0.06) })}>
              <Typography variant="body2" color="text.secondary" textAlign="center">
                Escribe este código en GitHub para autorizar a Git Manager{copied ? ' (ya está copiado)' : ''}:
              </Typography>
              <Stack direction="row" alignItems="center" spacing={1}>
                <Typography sx={{ fontFamily: (t) => t.typography.fontFamilyCode, fontSize: 30, fontWeight: 700, letterSpacing: 4 }}>{device.userCode}</Typography>
                <Tooltip title={copied ? 'Copiado' : 'Copiar código'}>
                  <IconButton onClick={() => navigator.clipboard.writeText(device.userCode).then(() => setCopied(true)).catch(() => {})}><CopyIcon fontSize="small" /></IconButton>
                </Tooltip>
              </Stack>
              <Button variant="outlined" endIcon={<OpenIcon />} href={device.verificationUri} target="_blank" rel="noopener">Abrir {device.verificationUri.replace(/^https?:\/\//, '')}</Button>
              <Stack direction="row" alignItems="center" spacing={1}>
                <CircularProgress size={16} /><Typography variant="body2" color="text.secondary">Esperando la confirmación en GitHub…</Typography>
              </Stack>
              <Button size="small" onClick={cancel}>Cancelar</Button>
            </Stack>
          ) : (
            <>
              <Typography variant="body2" color="text.secondary">
                Inicias sesión en GitHub con tu <b>usuario y contraseña</b> (y tu segundo factor, si lo tienes) y autorizas a Git Manager con un código. Esta app nunca ve tu contraseña.
              </Typography>
              {!useBuiltin && <TextField label="Client ID de la OAuth App" fullWidth value={clientId} onChange={(e) => setClientId(e.target.value)} helperText="Se obtiene una sola vez al registrar la aplicación en GitHub." />}
              <Button variant="contained" size="large" startIcon={<GitHubIcon />} onClick={start} disabled={busy || (!useBuiltin && !clientId)}>Iniciar sesión con GitHub</Button>
              {(stored || builtin) && (
                <Link component="button" type="button" variant="body2" onClick={() => { setClientId(custom ? '' : stored); setCustom((c) => !c); }} sx={{ alignSelf: 'center' }}>
                  {custom ? (stored ? 'Usar el Client ID guardado' : 'Usar la aplicación incluida en Git Manager') : 'Usar otro Client ID'}
                </Link>
              )}
            </>
          )}
          {!useBuiltin && <Divider />}
          {!useBuiltin && <Steps title="Registro único de la aplicación en GitHub" open={help && !device} onToggle={() => setHelp((h) => !h)}>
            <li>Abre <Link href={`${base}/settings/applications/new`} target="_blank" rel="noreferrer">Settings → Developer settings → OAuth Apps → New</Link>.</li>
            <li>Application name: <code>Git Manager local</code>.</li>
            <li>Homepage URL y Authorization callback URL: <code>{location.origin}</code> (no se usan, pero son obligatorias).</li>
            <li>Pulsa <b>Register application</b> y marca <b>Enable Device Flow</b>; guarda.</li>
            <li>Copia el <b>Client ID</b> aquí (no hace falta el secreto).</li>
          </Steps>}
        </Stack>
      )}
      {tab === 1 && (
        <form onSubmit={loginPat}>
          <TextField label="Personal Access Token" type="password" fullWidth value={token} onChange={(e) => setToken(e.target.value)} autoFocus sx={{ mb: 1 }} />
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Créalo en <Link href={`${base}/settings/tokens/new?scopes=repo,read:user,read:org&description=Git%20Manager`} target="_blank" rel="noreferrer">Settings → Developer settings → Tokens</Link> con los permisos <b>repo</b>, <b>read:user</b> y <b>read:org</b>. Se guarda solo en tu equipo.
          </Typography>
          <Button type="submit" variant="contained" fullWidth size="large" disabled={busy || !token}>Entrar con token</Button>
        </form>
      )}
    </>
  );
}

// Pantalla de inicio de sesión con GitLab o GitHub. Con `embedded` se muestra dentro de la app para
// conectar el proveedor que falta (p. ej. GitLab si se entró con GitHub); `only` fija el proveedor.
export default function Login({ auth, onLoggedIn, embedded = false, only }) {
  const [provider, setProvider] = useState(only || 'gitlab');
  const [error, setError] = useState(new URLSearchParams(location.search).get('error'));
  const [busy, setBusy] = useState(false);
  const props = { auth, onLoggedIn, setError, busy, setBusy };

  const card = (
    <Card sx={{ width: '100%', maxWidth: 540 }}>
      <CardContent sx={{ p: { xs: 2.5, sm: 4 } }}>
        {embedded ? (
          <Typography variant="h5" gutterBottom>Conecta tu cuenta de {provider === 'github' ? 'GitHub' : 'GitLab'}</Typography>
        ) : (
          <>
            <Typography variant="h4" gutterBottom><Box component="span" sx={{ color: 'primary.main' }}>Git</Box> Manager</Typography>
            <Typography color="text.secondary" sx={{ mb: 2 }}>Inicia sesión con tu cuenta de GitLab o de GitHub.</Typography>
          </>
        )}
        {!only && (
          <ToggleButtonGroup exclusive fullWidth value={provider} onChange={(e, v) => { if (v) { setProvider(v); setError(null); } }} sx={{ mb: 2.5 }}>
            <ToggleButton value="gitlab" sx={{ gap: 1, py: 1.25 }}><GitLabLogo size={20} /> GitLab</ToggleButton>
            <ToggleButton value="github" sx={{ gap: 1, py: 1.25 }}><GitHubIcon fontSize="small" /> GitHub</ToggleButton>
          </ToggleButtonGroup>
        )}
        {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}
        {provider === 'github' ? <GitHubLogin key="github" {...props} /> : <GitLabLogin key="gitlab" {...props} />}
      </CardContent>
    </Card>
  );

  if (embedded) return <Box sx={{ display: 'flex', justifyContent: 'center', py: { xs: 1, md: 4 } }}>{card}</Box>;
  return <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', p: 2 }}>{card}</Box>;
}
