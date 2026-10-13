import { useCallback, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
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
import { api } from './api/client.js';
import Login from './pages/Login.jsx';
import Repos from './pages/Repos.jsx';
import RepoDetail from './pages/RepoDetail.jsx';
import Projects from './pages/Projects.jsx';
import MergeRequests from './pages/MergeRequests.jsx';
import MergeRequestDetail from './pages/MergeRequestDetail.jsx';

const DRAWER = 250;
const nav = [
  { to: '/repos', label: 'Repositorios locales', icon: <FolderIcon /> },
  { to: '/projects', label: 'Proyectos GitLab', icon: <CloudIcon /> },
  { to: '/merge-requests', label: 'Merge requests', icon: <MergeIcon /> },
];

export default function App({ mode, onToggleMode }) {
  const [auth, setAuth] = useState(null);
  const [menu, setMenu] = useState(null);
  const loc = useLocation();
  const navigate = useNavigate();

  const refresh = useCallback(() => api.get('/auth/status').then(setAuth).catch(() => setAuth({})), []);
  useEffect(() => { refresh(); }, [refresh]);

  if (!auth) return <Box sx={{ display: 'grid', placeItems: 'center', height: '100vh' }}><CircularProgress /></Box>;
  if (!auth.user) return <Login auth={auth} onLoggedIn={refresh} />;

  const logout = async () => { setMenu(null); await api.post('/auth/logout'); navigate('/'); refresh(); };

  return (
    <Box sx={{ display: 'flex' }}>
      <AppBar position="fixed" color="default" elevation={0} sx={{ zIndex: (t) => t.zIndex.drawer + 1, borderBottom: 1, borderColor: 'divider' }}>
        <Toolbar>
          <TreeIcon color="primary" sx={{ mr: 1 }} />
          <Typography variant="h6" sx={{ flexGrow: 1 }}>Git Manager</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mr: 2, display: { xs: 'none', md: 'block' } }}>{auth.url}</Typography>
          <Tooltip title="Cambiar tema"><IconButton onClick={onToggleMode}>{mode === 'dark' ? <LightIcon /> : <DarkIcon />}</IconButton></Tooltip>
          <IconButton onClick={(e) => setMenu(e.currentTarget)}><Avatar src={auth.user.avatar_url} sx={{ width: 32, height: 32 }} /></IconButton>
          <Menu anchorEl={menu} open={!!menu} onClose={() => setMenu(null)}>
            <MenuItem disabled>{auth.user.name} (@{auth.user.username}) · {auth.authType === 'oauth' ? 'OAuth' : 'Token personal'}</MenuItem>
            <MenuItem onClick={logout}>Cerrar sesión</MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>
      <Drawer variant="permanent" sx={{ width: DRAWER, flexShrink: 0, '& .MuiDrawer-paper': { width: DRAWER, boxSizing: 'border-box' } }}>
        <Toolbar />
        <List>
          {nav.map((n) => (
            <ListItemButton key={n.to} selected={loc.pathname.startsWith(n.to)} onClick={() => navigate(n.to)}>
              <ListItemIcon>{n.icon}</ListItemIcon>
              <ListItemText primary={n.label} />
            </ListItemButton>
          ))}
        </List>
      </Drawer>
      <Box component="main" sx={{ flexGrow: 1, p: 3, minWidth: 0 }}>
        <Toolbar />
        <Routes>
          <Route path="/repos" element={<Repos />} />
          <Route path="/repos/:id" element={<RepoDetail />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/merge-requests" element={<MergeRequests />} />
          <Route path="/projects/:pid/merge-requests/:iid" element={<MergeRequestDetail />} />
          <Route path="*" element={<Navigate to="/repos" replace />} />
        </Routes>
      </Box>
    </Box>
  );
}
