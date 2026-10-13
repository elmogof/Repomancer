import { useEffect, useState } from 'react';
import {
  Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Grid,
  IconButton, List, ListItem, ListItemText, ListSubheader, Paper, Stack, TextField, Tooltip,
} from '@mui/material';
import CheckoutIcon from '@mui/icons-material/Login';
import MergeIcon from '@mui/icons-material/CallMerge';
import AddIcon from '@mui/icons-material/Add';
import { api } from '../api/client.js';

export default function Branches({ repoId, onChanged, act }) {
  const [branches, setBranches] = useState([]);
  const [newOpen, setNewOpen] = useState(false);
  const [name, setName] = useState('');
  const [mergeTarget, setMergeTarget] = useState(null);
  const [noFf, setNoFf] = useState(false);

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
              <Tooltip title={`Fusionar en ${current?.name}`}><IconButton size="small" onClick={() => setMergeTarget(b.name)}><MergeIcon fontSize="small" /></IconButton></Tooltip>
            </Stack>
          )}>
            <ListItemText
              primary={<Stack direction="row" spacing={1} alignItems="center"><span>{b.name}</span>{b.current && <Chip size="small" color="primary" label="actual" />}</Stack>}
              secondary={`${b.subject || ''} · ${b.date ? new Date(b.date).toLocaleDateString('es-CR') : ''}`}
              secondaryTypographyProps={{ noWrap: true }} sx={{ pr: 8 }} />
          </ListItem>
        ))}
      </List>
    </Paper>
  );

  return (
    <Box>
      <Button startIcon={<AddIcon />} variant="outlined" sx={{ mb: 2 }} onClick={() => setNewOpen(true)}>Nueva rama desde {current?.name}</Button>
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
    </Box>
  );
}
