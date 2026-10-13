import { useCallback, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  AppBar, Avatar, Box, CircularProgress, Drawer, IconButton, List, ListItemButton, ListItemIcon,
  ListItemText, Menu, MenuItem, Toolbar, Tooltip, Typography,
} from '@mui/material';
import FolderIcon from '@mui/icons-material/FolderCopy';
import CloudIcon from '@mui/icons-material/Cloud';
import MergeIcon from '@mui/icons-material/CallMerge';
import TreeIcon from '@mui/icons-material/AccountTree';
import DarkIcon from '@mui/icons-material/DarkMode';
import LightIcon from '@mui/icons-material/LightMode';
import MenuIcon from '@mui/icons-material/Menu';
import CollapseIcon from '@mui/icons-material/KeyboardDoubleArrowLeft';
import ExpandIcon from '@mui/icons-material/KeyboardDoubleArrowRight';
import { api } from './api/client.js';
import Login from './pages/Login.jsx';
import RepoSearch from './components/RepoSearch.jsx';
import { AutoFetchButton, AutoFetchWatcher } from './components/AutoFetch.jsx';
import Repos from './pages/Repos.jsx';
import RepoDetail from './pages/RepoDetail.jsx';
import Projects from './pages/Projects.jsx';
import MergeRequests from './pages/MergeRequests.jsx';
import MergeRequestDetail from './pages/MergeRequestDetail.jsx';

const DRAWER = 250;
const DRAWER_MINI = 68;

// Remonta el detalle al cambiar de repositorio (p. ej. desde el buscador) para no arrastrar estado.
function RepoDetailKeyed() {
  const { id } = useParams();
  return <RepoDetail key={id} />;
}
const nav = [
  { to: '/repos', label: 'Repositorios locales', icon: <FolderIcon /> },
  { to: '/projects', label: 'Proyectos GitLab', icon: <CloudIcon /> },
  { to: '/merge-requests', label: 'Merge requests', icon: <MergeIcon /> },
];

export default function App({ mode, onToggleMode }) {
  const [auth, setAuth] = useState(null);
  const [menu, setMenu] = useState(null);
  // Menú lateral plegable: se recuerda la preferencia en este navegador.
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem('gm-nav-collapsed') === '1'; } catch { return false; } });
  const toggleNav = () => setCollapsed((c) => { try { localStorage.setItem('gm-nav-collapsed', c ? '0' : '1'); } catch { /* sin almacenamiento */ } return !c; });
  const loc = useLocation();
  const navigate = useNavigate();

  const refresh = useCallback(() => api.get('/auth/status').then(setAuth).catch(() => setAuth({})), []);
  useEffect(() => { refresh(); }, [refresh]);

  if (!auth) return <Box sx={{ display: 'grid', placeItems: 'center', height: '100vh' }}><CircularProgress /></Box>;
  if (!auth.user) return <Login auth={auth} onLoggedIn={refresh} />;

  const logout = async () => { setMenu(null); await api.post('/auth/logout'); navigate('/'); refresh(); };

  return (
    <Box sx={{ display: 'flex' }}>
      <AppBar position="fixed" sx={{ zIndex: (t) => t.zIndex.drawer + 1 }}>
        <Toolbar>
          <Tooltip title={collapsed ? 'Expandir menú' : 'Contraer menú'}>
            <IconButton edge="start" onClick={toggleNav} sx={{ mr: 1 }} aria-label="Alternar menú lateral"><MenuIcon /></IconButton>
          </Tooltip>
          <Box sx={{ width: 32, height: 32, mr: 1.5, borderRadius: 2, display: 'grid', placeItems: 'center', color: '#fff', background: 'linear-gradient(135deg, #3399FF 0%, #0059B2 100%)', boxShadow: '0 2px 8px rgba(0, 114, 229, 0.4)' }}>
            <TreeIcon fontSize="small" />
          </Box>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>Git Manager</Typography>
          <RepoSearch />
          <AutoFetchWatcher />
          <AutoFetchButton />
          <Typography variant="body2" color="text.secondary" sx={{ mr: 2, px: 1.5, py: 0.5, borderRadius: 2, border: 1, borderColor: 'divider', bgcolor: 'action.hover', display: { xs: 'none', lg: 'block' } }}>{auth.url}</Typography>
          <Tooltip title="Cambiar tema"><IconButton onClick={onToggleMode}>{mode === 'dark' ? <LightIcon /> : <DarkIcon />}</IconButton></Tooltip>
          <IconButton onClick={(e) => setMenu(e.currentTarget)}><Avatar src={auth.user.avatar_url} sx={{ width: 32, height: 32 }} /></IconButton>
          <Menu anchorEl={menu} open={!!menu} onClose={() => setMenu(null)}>
            <MenuItem disabled>{auth.user.name} (@{auth.user.username}) · {auth.authType === 'oauth' ? 'OAuth' : 'Token personal'}</MenuItem>
            <MenuItem onClick={logout}>Cerrar sesión</MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>
      <Drawer variant="permanent" sx={(t) => {
        const width = collapsed ? DRAWER_MINI : DRAWER;
        const transition = t.transitions.create('width', { duration: t.transitions.duration.shorter });
        return { width, flexShrink: 0, transition, '& .MuiDrawer-paper': { width, boxSizing: 'border-box', overflowX: 'hidden', transition } };
      }}>
        <Toolbar />
        <List sx={{ px: 1.5, py: 2, flexGrow: 1 }}>
          <Typography variant="overline" color="text.secondary" noWrap component="div"
            sx={{ px: 1.5, fontSize: '0.7rem', height: 32, opacity: collapsed ? 0 : 1, transition: 'opacity .15s' }}>Navegación</Typography>
          {nav.map((n) => (
            <Tooltip key={n.to} title={collapsed ? n.label : ''} placement="right" arrow>
              <ListItemButton sx={{ mb: 0.5, px: 1.5, minHeight: 44 }} selected={loc.pathname.startsWith(n.to)} onClick={() => navigate(n.to)}>
                <ListItemIcon>{n.icon}</ListItemIcon>
                <ListItemText primary={n.label} primaryTypographyProps={{ fontSize: 14, fontWeight: 500, noWrap: true }}
                  sx={{ opacity: collapsed ? 0 : 1, transition: 'opacity .15s' }} />
              </ListItemButton>
            </Tooltip>
          ))}
        </List>
        <Box sx={{ p: 1.5, borderTop: 1, borderColor: 'divider', display: 'flex', justifyContent: collapsed ? 'center' : 'flex-end' }}>
          <Tooltip title={collapsed ? 'Expandir menú' : 'Contraer menú'} placement="right">
            <IconButton size="small" onClick={toggleNav}>{collapsed ? <ExpandIcon fontSize="small" /> : <CollapseIcon fontSize="small" />}</IconButton>
          </Tooltip>
        </Box>
      </Drawer>
      <Box component="main" sx={{ flexGrow: 1, p: 3, minWidth: 0 }}>
        <Toolbar />
        <Routes>
          <Route path="/repos" element={<Repos />} />
          <Route path="/repos/:id" element={<RepoDetailKeyed />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/merge-requests" element={<MergeRequests />} />
          <Route path="/projects/:pid/merge-requests/:iid" element={<MergeRequestDetail />} />
          <Route path="*" element={<Navigate to="/repos" replace />} />
        </Routes>
      </Box>
    </Box>
  );
}
