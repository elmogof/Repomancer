import { useEffect, useState } from 'react';
import {
  Box, Button, Chip, IconButton, LinearProgress, List, ListItemButton, ListItemText, ListSubheader, Paper, Stack, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Inventory2Outlined';
import ApplyIcon from '@mui/icons-material/Unarchive';
import DeleteIcon from '@mui/icons-material/DeleteOutline';
import { api } from '../api/client.js';
import DiffView from '../components/DiffView.jsx';
import { ConfirmDialog } from '../components/GitDialogs.jsx';

const fmt = (d) => new Date(d).toLocaleString('es-CR', { dateStyle: 'medium', timeStyle: 'short' });

// Lista de stashes con su diff; aplicar, aplicar y eliminar (pop) o eliminar.
export default function Stashes({ repoId, act, onNew, version }) {
  const [list, setList] = useState(null);
  const [sel, setSel] = useState(null);
  const [diff, setDiff] = useState(null);
  const [toDrop, setToDrop] = useState(null);

  const load = () => api.get(`/repos/${repoId}/stashes`).then((l) => {
    setList(l);
    setSel((s) => (s && l.find((x) => x.hash === s.hash)) || l[0] || null);
  }).catch(() => setList([]));
  useEffect(() => { load(); }, [repoId, version]);

  useEffect(() => {
    if (!sel) { setDiff(null); return; }
    setDiff(null);
    api.get(`/repos/${repoId}/stash/${sel.index}`).then((d) => setDiff(d.diff)).catch((e) => setDiff(`Error: ${e.message}`));
  }, [repoId, sel]);

  const apply = async (s, pop) => {
    await act('stash', () => api.post(`/repos/${repoId}/stash/${s.index}/apply`, { pop }), pop ? 'Stash aplicado y eliminado' : 'Stash aplicado');
    load();
  };
  const drop = async () => {
    const s = toDrop; setToDrop(null);
    await act('stash', () => api.post(`/repos/${repoId}/stash/${s.index}/drop`), 'Stash eliminado');
    load();
  };

  if (!list) return <LinearProgress />;
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '340px 1fr' }, gap: 2, alignItems: 'start' }}>
      <Paper variant="outlined">
        <List dense disablePadding>
          <ListSubheader sx={{ display: 'flex', alignItems: 'center' }}>
            <Box sx={{ flexGrow: 1 }}>Stashes ({list.length})</Box>
            <Button size="small" startIcon={<AddIcon fontSize="small" />} onClick={onNew}>Guardar cambios</Button>
          </ListSubheader>
          {list.length === 0 && (
            <Typography color="text.secondary" variant="body2" sx={{ p: 2 }}>
              No hay stashes. Usa «Guardar cambios» para apartar tus cambios sin hacer commit.
            </Typography>
          )}
          {list.map((s) => (
            <ListItemButton key={s.hash} dense selected={sel?.hash === s.hash} onClick={() => setSel(s)} sx={{ alignItems: 'flex-start', '& .actions': { opacity: 0.4 }, '&:hover .actions, &.Mui-selected .actions': { opacity: 1 } }}>
              <ListItemText
                primary={s.auto ? <Box component="span" sx={{ color: 'text.secondary', fontStyle: 'italic' }}>Sin descripción · {s.message}</Box> : s.message}
                secondary={<>{s.ref} · {s.branch && <Chip component="span" size="small" variant="outlined" label={s.branch} sx={{ height: 18, fontSize: 10.5, mx: 0.25 }} />} · {fmt(s.date)}</>}
                primaryTypographyProps={{ fontSize: 14, noWrap: true, title: s.message }} secondaryTypographyProps={{ fontSize: 11, component: 'div' }} />
              <Stack direction="row" className="actions" onClick={(e) => e.stopPropagation()}>
                <Tooltip title="Aplicar y eliminar de la lista (pop)"><IconButton size="small" onClick={() => apply(s, true)}><ApplyIcon fontSize="small" /></IconButton></Tooltip>
                <Tooltip title="Eliminar stash"><IconButton size="small" onClick={() => setToDrop(s)}><DeleteIcon fontSize="small" /></IconButton></Tooltip>
              </Stack>
            </ListItemButton>
          ))}
        </List>
      </Paper>
      <Box sx={{ minWidth: 0 }}>
        {sel ? (
          <>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }} flexWrap="wrap" useFlexGap>
              <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>{sel.auto ? sel.ref : sel.message}</Typography>
              <Button size="small" variant="contained" onClick={() => apply(sel, true)}>Aplicar y eliminar</Button>
              <Tooltip title="Aplica los cambios y conserva el stash en la lista"><Button size="small" variant="outlined" onClick={() => apply(sel, false)}>Solo aplicar</Button></Tooltip>
              <Button size="small" color="error" onClick={() => setToDrop(sel)}>Eliminar</Button>
            </Stack>
            {diff == null ? <LinearProgress /> : <DiffView diff={diff} />}
          </>
        ) : list.length > 0 && <Typography color="text.secondary">Selecciona un stash para ver sus cambios.</Typography>}
      </Box>
      <ConfirmDialog open={toDrop} title="Eliminar stash" color="error" confirm="Eliminar"
        body={<>Se eliminará «{toDrop?.auto ? toDrop?.ref : toDrop?.message}». Sus cambios se perderán si no los has aplicado.</>}
        onClose={() => setToDrop(null)} onConfirm={drop} />
    </Box>
  );
}
