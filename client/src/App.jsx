import { useCallback, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  AppBar, Avatar, Box, CircularProgress, Drawer, IconButton, List, ListItemButton, ListItemIcon,
  ListItemText, Menu, MenuItem, Toolbar, Tooltip, Typography, useMediaQuery,
} from '@mui/material';
import FolderIcon from '@mui/icons-material/FolderCopy';
import CloudIcon from '@mui/icons-material/Cloud';
import MergeIcon from '@mui/icons-material/CallMerge';
import GitHubIcon from '@mui/icons-material/GitHub';
import LogIcon from '@mui/icons-material/ReceiptLong';
import AccountsIcon from '@mui/icons-material/ManageAccounts';
import DarkIcon from '@mui/icons-material/DarkMode';
import LightIcon from '@mui/icons-material/LightMode';
import MenuIcon from '@mui/icons-material/Menu';
import CollapseIcon from '@mui/icons-material/KeyboardDoubleArrowLeft';
import ExpandIcon from '@mui/icons-material/KeyboardDoubleArrowRight';
import CommandIcon from '@mui/icons-material/KeyboardCommandKey';
import WorkspacesIcon from '@mui/icons-material/Workspaces';
import SearchCodeIcon from '@mui/icons-material/ManageSearch';
import SettingsIcon from '@mui/icons-material/Settings';
import { api } from './api/client.js';
import Login from './pages/Login.jsx';
import RepoSearch from './components/RepoSearch.jsx';
import { AutoFetchButton, AutoFetchWatcher, AUTOFETCH_RUN } from './components/AutoFetch.jsx';
import { CommandsProvider, OPEN_PALETTE, useCommands } from './components/Commands.jsx';
import Repos from './pages/Repos.jsx';
import RepoDetail from './pages/RepoDetail.jsx';
import Projects from './pages/Projects.jsx';
import MergeRequests from './pages/MergeRequests.jsx';
import MergeRequestDetail from './pages/MergeRequestDetail.jsx';
import PullRequests from './pages/PullRequests.jsx';
import OpLog from './pages/OpLog.jsx';
import Accounts from './pages/Accounts.jsx';
import Workspaces from './pages/Workspaces.jsx';
import Search from './pages/Search.jsx';
import Settings from './pages/Settings.jsx';

const DRAWER = 250;
const DRAWER_MINI = 68;

// Remonta el detalle al cambiar de repositorio (p. ej. desde el buscador) para no arrastrar estado.
function ConnectProvider({ auth, onLoggedIn }) {
  const { provider } = useParams();
  return <Login key={provider} auth={auth} onLoggedIn={onLoggedIn} embedded only={provider === 'github' ? 'github' : 'gitlab'} />;
}

function RepoDetailKeyed() {
  const { id } = useParams();
  return <RepoDetail key={id} />;
}
const nav = [
  { to: '/repos', label: 'Repositorios locales', icon: <FolderIcon /> },
  { to: '/workspaces', label: 'Entornos de trabajo', icon: <WorkspacesIcon /> },
  { to: '/search', label: 'Buscar en repositorios', icon: <SearchCodeIcon /> },
  { to: '/projects', label: 'Proyectos GitLab', icon: <CloudIcon /> },
  { to: '/merge-requests', label: 'Merge requests', icon: <MergeIcon /> },
  { to: '/pull-requests', label: 'Pull requests (GitHub)', icon: <GitHubIcon /> },
  { to: '/oplog', label: 'Registro de operaciones', icon: <LogIcon /> },
  { to: '/accounts', label: 'Cuentas', icon: <AccountsIcon /> },
  { to: '/settings', label: 'Configuración', icon: <SettingsIcon /> },
];

// Comandos globales de la paleta y sus atajos.
function GlobalCommands({ onToggleMode, toggleNav }) {
  const navigate = useNavigate();
  useCommands('global', () => [
    ...nav.map((n, i) => ({ id: `nav:${n.to}`, group: 'Ir a', title: n.label, keys: `alt+${i + 1}`, icon: n.icon, run: () => navigate(n.to) })),
    { id: 'search-code', group: 'General', title: 'Buscar texto o archivos en todos los repositorios', keys: 'ctrl+shift+f', run: () => navigate('/search') },
    { id: 'search', group: 'General', title: 'Buscar repositorio', keys: 'ctrl+k', passive: true, run: () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true })) },
    { id: 'autofetch', group: 'General', title: 'Buscar novedades en los remotos (fetch de todos)', run: () => window.dispatchEvent(new Event(AUTOFETCH_RUN)) },
    { id: 'theme', group: 'General', title: 'Cambiar tema claro / oscuro', keys: 'alt+t', run: onToggleMode },
    { id: 'nav', group: 'General', title: 'Mostrar u ocultar el menú lateral', keys: 'alt+m', run: toggleNav },
  ], []);
  return null;
}

export default function App({ mode, onToggleMode }) {
  const [auth, setAuth] = useState(null);
  const [menu, setMenu] = useState(null);
  // Menú lateral plegable: se recuerda la preferencia en este navegador. En móvil es un panel que se abre encima.
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem('gm-nav-collapsed') === '1'; } catch { return false; } });
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobile = useMediaQuery((t) => t.breakpoints.down('md'));
  const toggleNav = () => {
    if (mobile) { setMobileOpen((o) => !o); return; }
    setCollapsed((c) => { try { localStorage.setItem('gm-nav-collapsed', c ? '0' : '1'); } catch { /* sin almacenamiento */ } return !c; });
  };
  const loc = useLocation();
  const navigate = useNavigate();

  const refresh = useCallback(() => api.get('/auth/status').then(setAuth).catch(() => setAuth({})), []);
  useEffect(() => { refresh(); }, [refresh]);
  // Al volver a la pestaña se relee la sesión (p. ej. tras cambiar la configuración o iniciar sesión en otra pestaña).
  useEffect(() => { window.addEventListener('focus', refresh); return () => window.removeEventListener('focus', refresh); }, [refresh]);
  useEffect(() => { setMobileOpen(false); }, [loc.pathname]);

  if (!auth) return <Box sx={{ display: 'grid', placeItems: 'center', height: '100vh' }}><CircularProgress /></Box>;
  // Se entra con GitLab o con GitHub; la otra cuenta se puede conectar después.
  const me = auth.user || auth.github?.user;
  if (!me) return <Login auth={auth} onLoggedIn={refresh} />;
  // Las pantallas de GitLab piden conectar GitLab si se entró solo con GitHub.
  const needsGitlab = (el) => (auth.user ? el : <Login auth={auth} onLoggedIn={refresh} embedded only="gitlab" />);
  const sessionHost = auth.user ? auth.url : auth.github?.url;

  const logout = async () => { setMenu(null); await api.post('/auth/logout'); navigate('/'); refresh(); };
  const mini = collapsed && !mobile;

  const navList = (
    <>
      <List sx={{ px: 1.5, py: 2, flexGrow: 1 }}>
        <Typography variant="overline" color="text.secondary" noWrap component="div"
          sx={{ px: 1.5, fontSize: '0.7rem', height: 32, opacity: mini ? 0 : 1, transition: 'opacity .15s' }}>Navegación</Typography>
        {nav.map((n, i) => (
          <Tooltip key={n.to} title={mini ? `${n.label} · Alt+${i + 1}` : ''} placement="right" arrow>
            <ListItemButton sx={{ mb: 0.5, px: 1.5, minHeight: 44 }} selected={loc.pathname.startsWith(n.to)} onClick={() => navigate(n.to)}>
              <ListItemIcon>{n.icon}</ListItemIcon>
              <ListItemText primary={n.label} primaryTypographyProps={{ fontSize: 14, fontWeight: 500, noWrap: true }}
                sx={{ opacity: mini ? 0 : 1, transition: 'opacity .15s' }} />
            </ListItemButton>
          </Tooltip>
        ))}
      </List>
      {!mobile && (
        <Box sx={{ p: 1.5, borderTop: 1, borderColor: 'divider', display: 'flex', justifyContent: mini ? 'center' : 'flex-end' }}>
          <Tooltip title={mini ? 'Expandir menú' : 'Contraer menú'} placement="right">
            <IconButton size="small" onClick={toggleNav}>{mini ? <ExpandIcon fontSize="small" /> : <CollapseIcon fontSize="small" />}</IconButton>
          </Tooltip>
        </Box>
      )}
    </>
  );

  return (
    <CommandsProvider>
      <GlobalCommands onToggleMode={onToggleMode} toggleNav={toggleNav} />
      <Box sx={{ display: 'flex' }}>
        <AppBar position="fixed" sx={{ zIndex: (t) => t.zIndex.drawer + 1 }}>
          <Toolbar sx={{ gap: { xs: 0.5, sm: 0 } }}>
            <Tooltip title={mini ? 'Expandir menú' : 'Contraer menú'}>
              <IconButton edge="start" onClick={toggleNav} sx={{ mr: { xs: 0, sm: 1 } }} aria-label="Alternar menú lateral"><MenuIcon /></IconButton>
            </Tooltip>
            <Box component="img" src="/repomancer.svg" alt="" sx={{ width: 34, height: 34, mr: 1.5, display: { xs: 'none', sm: 'block' }, borderRadius: '9px', boxShadow: '0 2px 8px rgba(22, 29, 58, 0.35)' }} />
            <Typography variant="h6" noWrap sx={{ flexGrow: 1, display: { xs: 'none', sm: 'block' } }}>Repomancer</Typography>
            <Box sx={{ flexGrow: 1, display: { xs: 'block', sm: 'none' } }} />
            <RepoSearch />
            <Tooltip title="Paleta de comandos (Ctrl+Mayús+P)">
              <IconButton onClick={() => window.dispatchEvent(new Event(OPEN_PALETTE))} sx={{ display: { xs: 'none', md: 'inline-flex' } }} aria-label="Paleta de comandos"><CommandIcon /></IconButton>
            </Tooltip>
            <AutoFetchWatcher />
            <AutoFetchButton />
            <Typography variant="body2" color="text.secondary" sx={{ mr: 2, px: 1.5, py: 0.5, borderRadius: 2, border: 1, borderColor: 'divider', bgcolor: 'action.hover', display: { xs: 'none', lg: 'block' } }}>{sessionHost}</Typography>
            <Tooltip title="Cambiar tema (Alt+T)"><IconButton onClick={onToggleMode} sx={{ display: { xs: 'none', sm: 'inline-flex' } }}>{mode === 'dark' ? <LightIcon /> : <DarkIcon />}</IconButton></Tooltip>
            <IconButton onClick={(e) => setMenu(e.currentTarget)}><Avatar src={me.avatar_url} sx={{ width: 32, height: 32 }} /></IconButton>
            <Menu anchorEl={menu} open={!!menu} onClose={() => setMenu(null)}>
              {auth.user && <MenuItem disabled>GitLab · {auth.user.name} (@{auth.user.username}) · {auth.authType === 'oauth' ? 'OAuth' : 'Token personal'}</MenuItem>}
              {auth.github && <MenuItem disabled>GitHub · {auth.github.user?.name} (@{auth.github.user?.username}) · {auth.github.authType === 'oauth' ? 'OAuth' : 'Token personal'}</MenuItem>}
              {!auth.user && <MenuItem onClick={() => { setMenu(null); navigate('/connect/gitlab'); }}>Conectar GitLab</MenuItem>}
              {!auth.github && <MenuItem onClick={() => { setMenu(null); navigate('/connect/github'); }}>Conectar GitHub</MenuItem>}
              <MenuItem onClick={() => { setMenu(null); navigate('/accounts'); }}>Cuentas</MenuItem>
              <MenuItem onClick={() => { setMenu(null); navigate('/settings'); }}>Configuración</MenuItem>
              <MenuItem onClick={() => { setMenu(null); onToggleMode(); }} sx={{ display: { sm: 'none' } }}>Cambiar tema</MenuItem>
              <MenuItem onClick={logout}>Cerrar sesión</MenuItem>
            </Menu>
          </Toolbar>
        </AppBar>
        {mobile ? (
          <Drawer variant="temporary" open={mobileOpen} onClose={() => setMobileOpen(false)} ModalProps={{ keepMounted: true }}
            sx={{ '& .MuiDrawer-paper': { width: DRAWER, boxSizing: 'border-box' } }}>
            <Toolbar />
            {navList}
          </Drawer>
        ) : (
          <Drawer variant="permanent" sx={(t) => {
            const width = mini ? DRAWER_MINI : DRAWER;
            const transition = t.transitions.create('width', { duration: t.transitions.duration.shorter });
            return { width, flexShrink: 0, transition, '& .MuiDrawer-paper': { width, boxSizing: 'border-box', overflowX: 'hidden', transition } };
          }}>
            <Toolbar />
            {navList}
          </Drawer>
        )}
        <Box component="main" sx={{ flexGrow: 1, p: { xs: 1.5, sm: 2, md: 3 }, minWidth: 0 }}>
          <Toolbar />
          {/* Cada pantalla entra con una transición corta al navegar. */}
          <Box key={loc.pathname} className="gm-enter">
          <Routes>
            <Route path="/repos" element={<Repos />} />
            <Route path="/repos/:id" element={<RepoDetailKeyed />} />
            <Route path="/workspaces" element={<Workspaces />} />
            <Route path="/search" element={<Search />} />
            <Route path="/settings" element={<Settings mode={mode} onToggleMode={onToggleMode} />} />
            <Route path="/projects" element={needsGitlab(<Projects />)} />
            <Route path="/merge-requests" element={needsGitlab(<MergeRequests />)} />
            <Route path="/projects/:pid/merge-requests/:iid" element={needsGitlab(<MergeRequestDetail />)} />
            {/* Conectar el proveedor que falta. /login recibe también los errores del OAuth de GitLab. */}
            <Route path="/login" element={<Login auth={auth} onLoggedIn={() => { refresh(); navigate('/repos'); }} embedded only="gitlab" />} />
            <Route path="/connect/:provider" element={<ConnectProvider auth={auth} onLoggedIn={() => { refresh(); navigate('/repos'); }} />} />
            <Route path="/pull-requests" element={<PullRequests />} />
            <Route path="/oplog" element={<OpLog />} />
            <Route path="/accounts" element={<Accounts />} />
            <Route path="*" element={<Navigate to="/repos" replace />} />
          </Routes>
          </Box>
        </Box>
      </Box>
    </CommandsProvider>
  );
}
