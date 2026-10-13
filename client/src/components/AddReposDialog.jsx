import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, InputAdornment,
  LinearProgress, List, ListItem, ListItemButton, ListItemIcon, ListItemText, Paper, Stack, TextField, Typography,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import GitIcon from '@mui/icons-material/AccountTree';
import RadarIcon from '@mui/icons-material/TravelExplore';
import { api } from '../api/client.js';
import PathField from './FolderPicker.jsx';

// Busca todos los repositorios git dentro de una carpeta y permite añadirlos en bloque.
export default function AddReposDialog({ open, onClose, onAdded }) {
  const [root, setRoot] = useState('');
  const [scan, setScan] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => { if (open) { setScan(null); setSelected(new Set()); setFilter(''); setError(null); } }, [open]);

  const search = async () => {
    setBusy('scan'); setError(null); setScan(null);
    try {
      const d = await api.post('/repos/scan', { path: root });
      setScan(d);
      setSelected(new Set(d.repos.filter((r) => !r.added).map((r) => r.path)));
    } catch (e) { setError(e.message); }
    finally { setBusy(null); }
  };

  const add = async () => {
    setBusy('add'); setError(null);
    try {
      const d = await api.post('/repos/add-many', { paths: [...selected] });
      if (d.failed.length) setError(d.failed.map((f) => `${f.path}: ${f.error}`).join('\n'));
      onAdded(d);
    } catch (e) { setError(e.message); }
    finally { setBusy(null); }
  };

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return (scan?.repos || []).filter((r) => !q || r.relative.toLowerCase().includes(q));
  }, [scan, filter]);
  const selectable = visible.filter((r) => !r.added);
  const allChecked = selectable.length > 0 && selectable.every((r) => selected.has(r.path));
  const someChecked = selectable.some((r) => selected.has(r.path));

  const toggle = (p) => setSelected((s) => { const n = new Set(s); n.has(p) ? n.delete(p) : n.add(p); return n; });
  const toggleAll = () => setSelected((s) => {
    const n = new Set(s);
    selectable.forEach((r) => (allChecked ? n.delete(r.path) : n.add(r.path)));
    return n;
  });

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="md">
      <DialogTitle>Añadir repositorios existentes</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Elige una carpeta y se buscarán todos los repositorios git válidos que contenga, a cualquier profundidad (incluidos repos anidados). Se ignoran los repositorios vacíos sin commits ni remoto.
        </Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'flex-start' }}>
          <PathField autoFocus fullWidth margin="dense" label="Carpeta" placeholder="C:\\proyectos" value={root} onChange={setRoot}
            onKeyDown={(e) => e.key === 'Enter' && root && search()} pickerTitle="Carpeta donde buscar repositorios" />
          <Button variant="contained" startIcon={<RadarIcon />} onClick={search} disabled={!root || !!busy} sx={{ mt: { sm: '8px !important' }, height: 56, flexShrink: 0 }}>Buscar</Button>
        </Stack>

        {busy && <LinearProgress sx={{ mt: 2 }} />}
        {error && <Alert severity="error" sx={{ mt: 2, whiteSpace: 'pre-wrap' }} onClose={() => setError(null)}>{error}</Alert>}

        {scan && (
          <Box sx={{ mt: 2 }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
              <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>
                {scan.repos.length} {scan.repos.length === 1 ? 'repositorio encontrado' : 'repositorios encontrados'}
                <Typography component="span" variant="body2" color="text.secondary">
                  {' '}· {scan.scanned.toLocaleString()} carpetas revisadas en {(scan.ms / 1000).toFixed(1)} s
                  {scan.truncated && ' (búsqueda detenida por límite: elige una carpeta más concreta)'}
                </Typography>
              </Typography>
              {scan.repos.length > 5 && (
                <TextField size="small" placeholder="Filtrar…" value={filter} onChange={(e) => setFilter(e.target.value)}
                  InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }} />
              )}
            </Stack>
            {scan.repos.length === 0 ? (
              <Alert severity="info">No se encontraron repositorios git en esa carpeta. Prueba con más profundidad.</Alert>
            ) : (
              <Paper variant="outlined" sx={{ maxHeight: 360, overflow: 'auto' }}>
                <List dense disablePadding>
                  <ListItem divider sx={{ position: 'sticky', top: 0, zIndex: 1, bgcolor: 'background.paper' }}>
                    <ListItemIcon sx={{ minWidth: 38 }}>
                      <Checkbox edge="start" size="small" checked={allChecked} indeterminate={!allChecked && someChecked} disabled={!selectable.length} onChange={toggleAll} />
                    </ListItemIcon>
                    <ListItemText primary="Seleccionar todos" primaryTypographyProps={{ fontWeight: 600, fontSize: 14 }} />
                  </ListItem>
                  {visible.map((r) => (
                    <ListItemButton key={r.path} disabled={r.added} onClick={() => toggle(r.path)} sx={{ py: 0.25 }}>
                      <ListItemIcon sx={{ minWidth: 38 }}>
                        <Checkbox edge="start" size="small" checked={r.added || selected.has(r.path)} tabIndex={-1} disableRipple />
                      </ListItemIcon>
                      <ListItemIcon sx={{ minWidth: 30 }}><GitIcon fontSize="small" color="primary" /></ListItemIcon>
                      <ListItemText primary={r.name} secondary={`${r.relative === '.' ? r.path : r.relative}${r.remote ? `  ·  ${r.remote}` : '  ·  sin remoto'}`}
                        primaryTypographyProps={{ fontSize: 14, fontWeight: 500 }}
                        secondaryTypographyProps={{ fontSize: 12, sx: { fontFamily: (t) => t.typography.fontFamilyCode } }} />
                      {r.branch && <Chip size="small" variant="outlined" color="primary" label={r.branch} sx={{ mr: 1, maxWidth: 220 }} />}
                      {r.added && <Chip size="small" variant="outlined" label="Ya añadido" />}
                    </ListItemButton>
                  ))}
                </List>
              </Paper>
            )}
            {scan.ignored.length > 0 && (
              <Alert severity="warning" sx={{ mt: 1.5 }}>
                {scan.ignored.length === 1 ? 'Se ignoró 1 carpeta .git no válida:' : `Se ignoraron ${scan.ignored.length} carpetas .git no válidas:`}
                <Box component="ul" sx={{ m: 0, pl: 2.5, maxHeight: 100, overflow: 'auto' }}>
                  {scan.ignored.map((x) => <li key={x.path}><code>{x.path}</code> — {x.reason}</li>)}
                </Box>
              </Alert>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={!!busy}>Cancelar</Button>
        <Button variant="contained" onClick={add} disabled={!selected.size || !!busy}>
          Añadir {selected.size || ''} {selected.size === 1 ? 'repositorio' : 'repositorios'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
