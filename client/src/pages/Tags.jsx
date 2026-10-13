import { useEffect, useState } from 'react';
import {
  Box, Button, Chip, IconButton, LinearProgress, ListItemIcon, ListItemText, Menu, MenuItem, Paper, Stack, Table, TableBody,
  TableCell, TableHead, TableRow, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/LocalOffer';
import PushIcon from '@mui/icons-material/Upload';
import MoreIcon from '@mui/icons-material/MoreVert';
import DeleteIcon from '@mui/icons-material/DeleteOutline';
import CloudOffIcon from '@mui/icons-material/CloudOff';
import { api } from '../api/client.js';
import { ConfirmDialog } from '../components/GitDialogs.jsx';

const fmt = (d) => (d ? new Date(d).toLocaleDateString('es-CR', { dateStyle: 'medium' }) : '');

// Tags locales, con su estado en origin (publicado o solo local).
export default function Tags({ repoId, act, onNew, hasRemote, version }) {
  const [tags, setTags] = useState(null);
  const [remote, setRemote] = useState(undefined); // undefined = comprobando · null = sin remoto o error
  const [menu, setMenu] = useState(null);
  const [toDelete, setToDelete] = useState(null);

  const load = () => {
    api.get(`/repos/${repoId}/tags`).then(setTags).catch(() => setTags([]));
    if (!hasRemote) { setRemote(null); return; }
    setRemote(undefined);
    api.get(`/repos/${repoId}/tags/remote`).then((r) => setRemote(r.names ? new Set(r.names) : null)).catch(() => setRemote(null));
  };
  useEffect(() => { load(); }, [repoId, version, hasRemote]);

  const run = async (fn, msg) => { await act('tag', fn, msg); load(); };
  const push = (name) => run(() => api.post(`/repos/${repoId}/tags/push`, { name }), name ? `Tag ${name} publicado` : 'Tags publicados');
  const del = async () => {
    const { name, remote: alsoRemote } = toDelete; setToDelete(null);
    run(() => api.post(`/repos/${repoId}/tags/delete`, { name, remote: alsoRemote }), `Tag ${name} eliminado`);
  };

  if (!tags) return <LinearProgress />;
  const unpublished = remote ? tags.filter((t) => !remote.has(t.name)).length : 0;
  const status = (t) => {
    if (!hasRemote) return null;
    if (remote === undefined) return <Chip size="small" variant="outlined" label="Comprobando…" />;
    if (remote === null) return <Chip size="small" variant="outlined" label="Desconocido" />;
    return remote.has(t.name)
      ? <Chip size="small" color="success" variant="outlined" label="Publicado" />
      : <Chip size="small" color="warning" variant="outlined" icon={<CloudOffIcon />} label="Solo local" />;
  };

  return (
    <Box>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
        <Button variant="outlined" startIcon={<AddIcon />} onClick={() => onNew()}>Nuevo tag</Button>
        {hasRemote && unpublished > 0 && (
          <Button startIcon={<PushIcon />} onClick={() => push()}>Publicar {unpublished === 1 ? 'el tag pendiente' : `los ${unpublished} tags pendientes`}</Button>
        )}
      </Stack>
      {tags.length === 0 ? (
        <Typography color="text.secondary">No hay tags. Crea uno para marcar una versión (por ejemplo, v1.0.0).</Typography>
      ) : (
        <Paper variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow><TableCell>Tag</TableCell><TableCell sx={{ width: '100%' }}>Commit</TableCell><TableCell>Fecha</TableCell><TableCell>Remoto</TableCell><TableCell /></TableRow>
            </TableHead>
            <TableBody>
              {tags.map((t) => (
                <TableRow key={t.name} hover>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Typography fontWeight={700} fontSize={14}>{t.name}</Typography>
                      <Tooltip title={t.annotated ? `Tag anotado${t.tagger ? ` por ${t.tagger}` : ''}` : 'Tag ligero (solo apunta al commit)'}>
                        <Chip size="small" variant="outlined" label={t.annotated ? 'anotado' : 'ligero'} sx={{ height: 20, fontSize: 11 }} />
                      </Tooltip>
                    </Stack>
                    {t.message && <Typography variant="caption" color="text.secondary">{t.message}</Typography>}
                  </TableCell>
                  <TableCell sx={{ maxWidth: 0 }}>
                    <Typography noWrap fontSize={13}>
                      <Box component="span" sx={{ fontFamily: (th) => th.typography.fontFamilyCode, color: 'primary.main', mr: 1 }}>{t.commit}</Box>
                      {t.subject}
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{fmt(t.date)}</TableCell>
                  <TableCell>{status(t)}</TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                    {remote && !remote.has(t.name) && (
                      <Tooltip title="Publicar en origin"><IconButton size="small" onClick={() => push(t.name)}><PushIcon fontSize="small" /></IconButton></Tooltip>
                    )}
                    <IconButton size="small" onClick={(e) => setMenu({ el: e.currentTarget, tag: t })}><MoreIcon fontSize="small" /></IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}
      <Menu anchorEl={menu?.el} open={!!menu} onClose={() => setMenu(null)}>
        <MenuItem onClick={() => { setToDelete({ name: menu.tag.name, remote: false }); setMenu(null); }}>
          <ListItemIcon><DeleteIcon fontSize="small" /></ListItemIcon><ListItemText>Eliminar tag local</ListItemText>
        </MenuItem>
        {hasRemote && remote?.has(menu?.tag.name) && (
          <MenuItem onClick={() => { setToDelete({ name: menu.tag.name, remote: true }); setMenu(null); }} sx={{ color: 'error.main' }}>
            <ListItemIcon><DeleteIcon fontSize="small" color="error" /></ListItemIcon><ListItemText>Eliminar local y en origin</ListItemText>
          </MenuItem>
        )}
      </Menu>
      <ConfirmDialog open={toDelete} title={`Eliminar ${toDelete?.name}`} color="error" confirm="Eliminar"
        body={toDelete?.remote ? 'Se eliminará el tag en tu equipo y en origin. Quienes ya lo descargaron lo conservarán.' : 'Se eliminará solo en tu equipo; si está publicado, seguirá existiendo en origin.'}
        onClose={() => setToDelete(null)} onConfirm={del} />
    </Box>
  );
}
