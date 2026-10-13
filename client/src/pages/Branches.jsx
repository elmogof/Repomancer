import { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Checkbox, Chip, Collapse, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Grid,
  IconButton, LinearProgress, List, ListItem, ListItemButton, ListItemIcon, ListItemText, ListSubheader, Paper, Stack, Switch, TextField, Tooltip, Typography,
} from '@mui/material';
import CheckoutIcon from '@mui/icons-material/Login';
import MergeIcon from '@mui/icons-material/CallMerge';
import AddIcon from '@mui/icons-material/Add';
import CompareIcon from '@mui/icons-material/CompareArrows';
import CleanIcon from '@mui/icons-material/CleaningServicesOutlined';
import RefreshIcon from '@mui/icons-material/Sync';
import ExpandIcon from '@mui/icons-material/ExpandMore';
import { api } from '../api/client.js';
import { ConfirmDialog } from '../components/GitDialogs.jsx';

const fmtDay = (d) => (d ? new Date(d).toLocaleDateString('es-CR', { dateStyle: 'medium' }) : '');

// Limpieza de ramas: locales fusionadas o cuyo remoto desapareció, y (solo si se eligen) ramas remotas fusionadas.
function CleanupDialog({ open, repoId, onClose, act, onDone, notify }) {
  const [data, setData] = useState(null);
  const [sel, setSel] = useState(new Set());
  const [selRemote, setSelRemote] = useState(new Set());
  const [showProtected, setShowProtected] = useState(false);
  const [remoteOpen, setRemoteOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = () => {
    setData(null);
    api.get(`/repos/${repoId}/branches/cleanup`).then((d) => {
      setData(d);
      // Por defecto: las fusionadas y no protegidas. Las no fusionadas (solo «remoto eliminado») se dejan sin marcar.
      setSel(new Set(d.local.filter((b) => b.merged && !b.protected).map((b) => b.name)));
      setSelRemote(new Set());
    }).catch((e) => setData({ error: e.message }));
  };
  useEffect(() => { if (open) { setShowProtected(false); setRemoteOpen(false); load(); } }, [open]);

  const toggle = (setFn, name) => setFn((s) => { const n = new Set(s); n.has(name) ? n.delete(name) : n.add(name); return n; });
  const prune = async () => { await act('fetch', () => api.post(`/repos/${repoId}/fetch`), 'Fetch'); load(); };

  const local = data?.local?.filter((b) => showProtected || !b.protected) || [];
  const remote = data?.remote?.filter((b) => showProtected || !b.protected) || [];
  const chosenLocal = local.filter((b) => sel.has(b.name));
  const chosenRemote = remote.filter((b) => selRemote.has(b.name));
  const total = chosenLocal.length + chosenRemote.length;

  const run = async () => {
    setConfirm(false); setBusy(true);
    try {
      const r = await api.post(`/repos/${repoId}/branches/delete`, {
        local: chosenLocal.map((b) => b.name),
        // Ya se comprobó que están fusionadas en la base (o se aceptó forzar): -D evita que git las rechace
        // por no estar fusionadas en la rama actual cuando esta no es la base.
        force: chosenLocal.map((b) => b.name),
        remote: chosenRemote.map((b) => b.name),
        allowProtected: showProtected,
      });
      const failed = r.results.filter((x) => !x.ok);
      notify(failed.length ? `${r.deleted} eliminadas, ${failed.length} con error` : `${r.deleted} ${r.deleted === 1 ? 'rama eliminada' : 'ramas eliminadas'}`,
        failed.length ? 'warning' : 'success',
        { title: 'Limpieza de ramas', details: failed.length ? failed.map((x) => `${x.name}: ${x.error}`).join('\n') : null });
      onDone();
      load();
    } catch (e) { notify(e.message, 'error', { title: 'No se pudo limpiar' }); }
    finally { setBusy(false); }
  };

  const reason = (b) => (
    <Stack direction="row" spacing={0.5} component="span" sx={{ display: 'inline-flex', ml: 1 }}>
      {b.merged && <Chip component="span" size="small" color="success" variant="outlined" label={`fusionada en ${data.base}`} sx={{ height: 20, fontSize: 11 }} />}
      {b.gone && <Chip component="span" size="small" color="warning" variant="outlined" label="remoto eliminado" sx={{ height: 20, fontSize: 11 }} />}
      {b.gone && !b.merged && <Chip component="span" size="small" color="error" variant="outlined" label="sin fusionar: se forzará" sx={{ height: 20, fontSize: 11 }} />}
      {b.protected && <Chip component="span" size="small" label="protegida" sx={{ height: 20, fontSize: 11 }} />}
    </Stack>
  );

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Box sx={{ flexGrow: 1 }}>Limpiar ramas</Box>
        <Tooltip title="Actualiza las ramas remotas (fetch --prune) para detectar las que ya se borraron en el servidor">
          <Button size="small" startIcon={<RefreshIcon />} onClick={prune} disabled={!data || busy}>Fetch y reanalizar</Button>
        </Tooltip>
      </DialogTitle>
      <DialogContent dividers>
        {!data ? <LinearProgress /> : data.error ? <Alert severity="error">{data.error}</Alert> : (
          <>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Ramas locales ya fusionadas en <b>{data.base}</b> o cuyo remoto ya no existe. La rama actual nunca se muestra.
            </Typography>
            <FormControlLabel sx={{ mb: 1 }} control={<Switch size="small" checked={showProtected} onChange={(e) => setShowProtected(e.target.checked)} />}
              label="Incluir ramas protegidas (main, master, develop…)" />
            <Paper variant="outlined">
              <List dense disablePadding>
                <ListSubheader sx={{ display: 'flex', alignItems: 'center' }}>
                  <Box sx={{ flexGrow: 1 }}>Ramas locales ({local.length})</Box>
                  {local.length > 0 && <Button size="small" onClick={() => setSel(chosenLocal.length === local.length ? new Set() : new Set(local.map((b) => b.name)))}>
                    {chosenLocal.length === local.length ? 'Ninguna' : 'Todas'}
                  </Button>}
                </ListSubheader>
                {local.length === 0 && <Typography variant="body2" color="text.secondary" sx={{ px: 2, pb: 1.5 }}>No hay ramas locales para limpiar.</Typography>}
                {local.map((b) => (
                  <ListItemButton key={b.name} dense onClick={() => toggle(setSel, b.name)}>
                    <ListItemIcon sx={{ minWidth: 36 }}><Checkbox edge="start" size="small" checked={sel.has(b.name)} tabIndex={-1} /></ListItemIcon>
                    <ListItemText primary={<>{b.name}{reason(b)}</>} secondary={`${b.subject || ''} · ${fmtDay(b.date)}${b.upstream ? ` · ${b.upstream}` : ''}`}
                      primaryTypographyProps={{ fontSize: 14, component: 'div' }} secondaryTypographyProps={{ noWrap: true, fontSize: 11.5 }} />
                  </ListItemButton>
                ))}
              </List>
            </Paper>
            <Box sx={{ mt: 2 }}>
              <Button size="small" onClick={() => setRemoteOpen((o) => !o)} endIcon={<ExpandIcon sx={{ transform: remoteOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />}>
                Ramas remotas fusionadas en origin ({remote.length}){chosenRemote.length ? ` · ${chosenRemote.length} elegidas` : ''}
              </Button>
              <Collapse in={remoteOpen}>
                <Alert severity="warning" sx={{ my: 1 }}>
                  Borrar una rama remota la elimina en el servidor para todo el equipo. Solo se borran las que marques aquí.
                </Alert>
                <Paper variant="outlined">
                  <List dense disablePadding>
                    {remote.length === 0 && <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>No hay ramas remotas fusionadas.</Typography>}
                    {remote.map((b) => (
                      <ListItemButton key={b.name} dense onClick={() => toggle(setSelRemote, b.name)}>
                        <ListItemIcon sx={{ minWidth: 36 }}><Checkbox edge="start" size="small" color="error" checked={selRemote.has(b.name)} tabIndex={-1} /></ListItemIcon>
                        <ListItemText primary={<>{b.name}{b.protected && <Chip size="small" label="protegida" sx={{ ml: 1, height: 20, fontSize: 11 }} />}</>} primaryTypographyProps={{ fontSize: 14, component: 'div' }} />
                      </ListItemButton>
                    ))}
                  </List>
                </Paper>
              </Collapse>
            </Box>
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cerrar</Button>
        <Button variant="contained" color="error" disabled={!total || busy} onClick={() => setConfirm(true)}>
          Eliminar {total} {total === 1 ? 'rama' : 'ramas'}
        </Button>
      </DialogActions>
      <ConfirmDialog open={confirm} title="Confirmar limpieza" color="error" confirm="Eliminar" onClose={() => setConfirm(false)} onConfirm={run}
        body={<>
          {chosenLocal.length > 0 && <Box sx={{ mb: 1 }}>Locales: <b>{chosenLocal.map((b) => b.name).join(', ')}</b></Box>}
          {chosenLocal.some((b) => b.needsForce) && <Box sx={{ mb: 1, color: 'error.main' }}>Algunas no están fusionadas: sus commits solo seguirán accesibles por su hash.</Box>}
          {chosenRemote.length > 0 && <Box sx={{ color: 'warning.main' }}>En origin (para todo el equipo): <b>{chosenRemote.map((b) => b.name).join(', ')}</b></Box>}
        </>} />
    </Dialog>
  );
}

export default function Branches({ repoId, onChanged, act, onCompare, notify }) {
  const [branches, setBranches] = useState([]);
  const [newOpen, setNewOpen] = useState(false);
  const [name, setName] = useState('');
  const [mergeTarget, setMergeTarget] = useState(null);
  const [noFf, setNoFf] = useState(false);
  const [cleanOpen, setCleanOpen] = useState(false);

  const load = () => api.get(`/repos/${repoId}/branches`).then(setBranches).catch(() => {});
  useEffect(() => { load(); }, [repoId]);

  const current = branches.find((b) => b.current);
  const done = async (r) => { await load(); onChanged(); return r; };
  const checkout = (branch) => act('checkout', () => api.post(`/repos/${repoId}/checkout`, { branch }), `Cambiado a ${branch}`).then(done);
  const create = () => act('checkout', () => api.post(`/repos/${repoId}/checkout`, { branch: name, create: true }), `Rama ${name} creada`).then((r) => { setNewOpen(false); setName(''); return done(r); });
  const merge = () => { const b = mergeTarget; setMergeTarget(null); act('merge', () => api.post(`/repos/${repoId}/merge`, { branch: b, noFf }), `Merge de ${b}`).then(done); };

  const section = (title, list) => (
    <Paper variant="outlined">
      <List dense subheader={<ListSubheader>{title}</ListSubheader>}>
        {list.map((b) => (
          <ListItem key={b.name} divider secondaryAction={!b.current && (
            <Stack direction="row">
              <Tooltip title="Cambiar a esta rama (checkout)"><IconButton size="small" onClick={() => checkout(b.name)}><CheckoutIcon fontSize="small" /></IconButton></Tooltip>
              <Tooltip title={`Comparar con ${current?.name}`}><IconButton size="small" onClick={() => onCompare(current?.name, b.name)}><CompareIcon fontSize="small" /></IconButton></Tooltip>
              <Tooltip title={`Fusionar en ${current?.name}`}><IconButton size="small" onClick={() => setMergeTarget(b.name)}><MergeIcon fontSize="small" /></IconButton></Tooltip>
            </Stack>
          )}>
            <ListItemText
              primary={<Stack direction="row" spacing={1} alignItems="center"><span>{b.name}</span>{b.current && <Chip size="small" color="primary" label="actual" />}</Stack>}
              secondary={`${b.subject || ''} · ${b.date ? new Date(b.date).toLocaleDateString('es-CR') : ''}`}
              secondaryTypographyProps={{ noWrap: true }} sx={{ pr: 12 }} />
          </ListItem>
        ))}
      </List>
    </Paper>
  );

  return (
    <Box>
      <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
        <Button startIcon={<AddIcon />} variant="outlined" onClick={() => setNewOpen(true)}>Nueva rama desde {current?.name}</Button>
        <Tooltip title="Detecta ramas ya fusionadas o cuyo remoto se borró y elimínalas en lote">
          <Button startIcon={<CleanIcon />} onClick={() => setCleanOpen(true)}>Limpiar ramas</Button>
        </Tooltip>
      </Stack>
      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>{section('Locales', branches.filter((b) => !b.remote))}</Grid>
        <Grid item xs={12} md={6}>{section('Remotas', branches.filter((b) => b.remote))}</Grid>
      </Grid>
      <Dialog open={newOpen} onClose={() => setNewOpen(false)}>
        <DialogTitle>Nueva rama</DialogTitle>
        <DialogContent><TextField autoFocus fullWidth margin="dense" label="Nombre" placeholder="feature/mi-cambio" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && name && create()} /></DialogContent>
        <DialogActions><Button onClick={() => setNewOpen(false)}>Cancelar</Button><Button variant="contained" disabled={!name} onClick={create}>Crear y cambiar</Button></DialogActions>
      </Dialog>
      <Dialog open={!!mergeTarget} onClose={() => setMergeTarget(null)}>
        <DialogTitle>Fusionar «{mergeTarget}» en «{current?.name}»</DialogTitle>
        <DialogContent><FormControlLabel control={<Checkbox checked={noFf} onChange={(e) => setNoFf(e.target.checked)} />} label="Crear siempre commit de merge (--no-ff)" /></DialogContent>
        <DialogActions><Button onClick={() => setMergeTarget(null)}>Cancelar</Button><Button variant="contained" onClick={merge}>Fusionar</Button></DialogActions>
      </Dialog>
      <CleanupDialog open={cleanOpen} repoId={repoId} act={act} notify={notify} onClose={() => setCleanOpen(false)} onDone={() => { load(); onChanged(); }} />
    </Box>
  );
}
