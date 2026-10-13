import { useCallback, useEffect, useState } from 'react';
import {
  Alert, Box, Breadcrumbs, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel,
  IconButton, InputAdornment, LinearProgress, Link, List, ListItemButton, ListItemIcon, ListItemText, MenuItem,
  Paper, Stack, Switch, TextField, Tooltip, Typography,
} from '@mui/material';
import FolderIcon from '@mui/icons-material/Folder';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import GitIcon from '@mui/icons-material/AccountTree';
import UpIcon from '@mui/icons-material/ArrowUpward';
import HomeIcon from '@mui/icons-material/Home';
import NewFolderIcon from '@mui/icons-material/CreateNewFolder';
import DriveIcon from '@mui/icons-material/Storage';
import { api, qs } from '../api/client.js';

// Divide una ruta absoluta en sus segmentos para las migas de pan.
function crumbs(p) {
  const win = /^[A-Za-z]:\\/.test(p);
  const parts = p.split(win ? '\\' : '/').filter(Boolean);
  return parts.map((name, i) => {
    const head = parts.slice(0, i + 1);
    return { name, path: win ? (i === 0 ? `${name}\\` : head.join('\\')) : `/${head.join('/')}` };
  });
}

// Explorador de carpetas del equipo local (vía el servidor). Devuelve la ruta elegida con onSelect.
export function FolderPicker({ open, onClose, onSelect, initialPath, title = 'Seleccionar carpeta', requireRepo = false }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [typed, setTyped] = useState('');
  const [newName, setNewName] = useState(null);

  const load = useCallback(async (p) => {
    setLoading(true); setError(null);
    try {
      const d = await api.get('/fs/list' + qs({ path: p, hidden: hidden ? '1' : undefined }));
      setData(d); setTyped(d.path);
    } catch (e) {
      setError(e.message);
      // Si la ruta inicial no existe, abre la carpeta personal.
      if (!data && p) load('');
    } finally { setLoading(false); }
  }, [hidden]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (open) { setNewName(null); load(initialPath || ''); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (open && data) load(data.path); }, [hidden]); // eslint-disable-line react-hooks/exhaustive-deps

  const mkdir = async () => {
    try {
      const { path } = await api.post('/fs/mkdir', { parent: data.path, name: newName.trim() });
      setNewName(null); load(path);
    } catch (e) { setError(e.message); }
  };

  const canSelect = data && (!requireRepo || data.isRepo);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle sx={{ pb: 1 }}>{title}</DialogTitle>
      <DialogContent>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
          <Tooltip title="Subir un nivel"><span><IconButton size="small" disabled={!data?.parent} onClick={() => load(data.parent)}><UpIcon fontSize="small" /></IconButton></span></Tooltip>
          <Tooltip title="Carpeta personal"><span><IconButton size="small" disabled={!data} onClick={() => load(data.home)}><HomeIcon fontSize="small" /></IconButton></span></Tooltip>
          {data?.roots?.length > 1 && (
            <TextField select size="small" value={data.roots.find((r) => data.path.toUpperCase().startsWith(r.toUpperCase())) || ''} onChange={(e) => load(e.target.value)} sx={{ minWidth: 90 }}
              InputProps={{ startAdornment: <InputAdornment position="start"><DriveIcon fontSize="small" /></InputAdornment> }}>
              {data.roots.map((r) => <MenuItem key={r} value={r}>{r.replace('\\', '')}</MenuItem>)}
            </TextField>
          )}
          <TextField size="small" fullWidth value={typed} onChange={(e) => setTyped(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load(typed)}
            placeholder="Escribe una ruta y pulsa Enter" sx={{ '& input': { fontFamily: (t) => t.typography.fontFamilyCode, fontSize: 13 } }} />
        </Stack>

        {data && (
          <Breadcrumbs maxItems={6} sx={{ mb: 1, fontSize: 13 }}>
            {crumbs(data.path).map((c, i, a) => i === a.length - 1
              ? <Typography key={c.path} fontSize={13} fontWeight={600} color="text.primary">{c.name}</Typography>
              : <Link key={c.path} component="button" fontSize={13} onClick={() => load(c.path)}>{c.name}</Link>)}
          </Breadcrumbs>
        )}

        {error && <Alert severity="error" sx={{ mb: 1 }} onClose={() => setError(null)}>{error}</Alert>}

        <Paper variant="outlined" sx={{ height: 380, overflow: 'auto', position: 'relative' }}>
          {loading && <LinearProgress sx={{ position: 'sticky', top: 0, zIndex: 1 }} />}
          <List dense sx={{ p: 1 }}>
            {newName !== null && (
              <Stack direction="row" spacing={1} sx={{ p: 1 }}>
                <TextField size="small" autoFocus fullWidth label="Nombre de la nueva carpeta" value={newName} onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && newName.trim()) mkdir(); if (e.key === 'Escape') setNewName(null); }} />
                <Button variant="contained" disabled={!newName.trim()} onClick={mkdir}>Crear</Button>
                <Button onClick={() => setNewName(null)}>Cancelar</Button>
              </Stack>
            )}
            {data?.entries.map((e) => (
              <ListItemButton key={e.path} onClick={() => load(e.path)} sx={{ py: 0.5 }}>
                <ListItemIcon sx={{ minWidth: 34 }}>
                  {e.isRepo ? <GitIcon fontSize="small" color="primary" /> : <FolderIcon fontSize="small" sx={{ color: 'warning.main', opacity: 0.85 }} />}
                </ListItemIcon>
                <ListItemText primary={e.name} primaryTypographyProps={{ fontSize: 14 }} />
                {e.isRepo && <Chip size="small" color="primary" variant="outlined" label="git" />}
              </ListItemButton>
            ))}
            {data && !data.entries.length && !loading && (
              <Box sx={{ p: 4, textAlign: 'center', color: 'text.secondary' }}>
                <FolderOpenIcon sx={{ fontSize: 40, opacity: 0.5 }} />
                <Typography variant="body2">Esta carpeta no tiene subcarpetas.</Typography>
              </Box>
            )}
          </List>
        </Paper>

        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mt: 1 }}>
          <FormControlLabel control={<Switch size="small" checked={hidden} onChange={(e) => setHidden(e.target.checked)} />} label={<Typography variant="body2">Mostrar ocultas</Typography>} />
          {data && requireRepo && !data.isRepo && <Typography variant="body2" color="warning.main">Esta carpeta no es un repositorio git.</Typography>}
          {data?.isRepo && <Chip size="small" color="success" variant="outlined" icon={<GitIcon />} label="Repositorio git" />}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button startIcon={<NewFolderIcon />} onClick={() => setNewName('')} disabled={!data} sx={{ mr: 'auto' }}>Nueva carpeta</Button>
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="contained" disabled={!canSelect} onClick={() => onSelect(data.path)}>Seleccionar esta carpeta</Button>
      </DialogActions>
    </Dialog>
  );
}

// Campo de texto para rutas locales con un botón que abre el explorador de carpetas.
export default function PathField({ value, onChange, pickerTitle, requireRepo, ...props }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <TextField
        {...props}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        InputProps={{
          ...props.InputProps,
          endAdornment: (
            <InputAdornment position="end">
              <Tooltip title="Examinar carpetas">
                <IconButton edge="end" onClick={() => setOpen(true)}><FolderOpenIcon /></IconButton>
              </Tooltip>
            </InputAdornment>
          ),
        }}
      />
      <FolderPicker open={open} onClose={() => setOpen(false)} initialPath={value} title={pickerTitle} requireRepo={requireRepo}
        onSelect={(p) => { onChange(p); setOpen(false); }} />
    </>
  );
}
