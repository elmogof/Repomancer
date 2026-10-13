import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, LinearProgress,
  Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/CreateNewFolder';
import CloneIcon from '@mui/icons-material/CloudDownload';
import RemoveIcon from '@mui/icons-material/RemoveCircleOutline';
import RefreshIcon from '@mui/icons-material/Refresh';
import { api } from '../api/client.js';
import { useNotify } from '../components/Notify.jsx';
import CloneDialog from '../components/CloneDialog.jsx';

export default function Repos() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [cloneOpen, setCloneOpen] = useState(false);
  const [path, setPath] = useState('');
  const notify = useNotify();
  const navigate = useNavigate();

  const load = useCallback(() => {
    setLoading(true);
    api.get('/repos').then(setData).catch((e) => notify(e.message, 'error')).finally(() => setLoading(false));
  }, [notify]);
  useEffect(load, [load]);

  const add = async () => {
    try { const repo = await api.post('/repos/add', { path }); setAddOpen(false); setPath(''); navigate(`/repos/${repo.id}`); }
    catch (e) { notify(e.message, 'error'); }
  };

  const remove = async (repo, e) => {
    e.stopPropagation();
    if (!confirm(`¿Quitar "${repo.name}" de la lista? Los archivos en disco NO se borran.`)) return;
    await api.del(`/repos/${repo.id}`);
    load();
  };

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
        <Typography variant="h5" sx={{ flexGrow: 1 }}>Repositorios locales</Typography>
        <Tooltip title="Actualizar"><IconButton onClick={load}><RefreshIcon /></IconButton></Tooltip>
        <Button startIcon={<AddIcon />} variant="outlined" onClick={() => setAddOpen(true)}>Añadir carpeta</Button>
        <Button startIcon={<CloneIcon />} variant="contained" onClick={() => setCloneOpen(true)}>Clonar</Button>
      </Stack>
      {loading && <LinearProgress />}
      {data && data.repos.length === 0 && (
        <Alert severity="info">Aún no hay repositorios. Añade una carpeta que ya tengas, clona por URL o ve a <b>Proyectos GitLab</b> para clonar uno de tus proyectos.</Alert>
      )}
      {data && data.repos.length > 0 && (
        <Paper variant="outlined">
          <Table>
            <TableHead>
              <TableRow><TableCell>Nombre</TableCell><TableCell>Rama</TableCell><TableCell>Estado</TableCell><TableCell>Ruta</TableCell><TableCell /></TableRow>
            </TableHead>
            <TableBody>
              {data.repos.map((r) => (
                <TableRow key={r.id} hover sx={{ cursor: r.missing ? 'default' : 'pointer' }} onClick={() => !r.missing && navigate(`/repos/${r.id}`)}>
                  <TableCell><b>{r.name}</b></TableCell>
                  <TableCell>{r.branch && <Chip size="small" label={r.branch} />}</TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={0.5}>
                      {r.missing && <Chip size="small" color="error" label="Carpeta no encontrada" />}
                      {r.error && <Chip size="small" color="error" label="Error" title={r.error} />}
                      {r.changes > 0 && <Chip size="small" color="warning" label={`${r.changes} cambios`} />}
                      {r.ahead > 0 && <Chip size="small" color="info" label={`↑ ${r.ahead}`} />}
                      {r.behind > 0 && <Chip size="small" color="secondary" label={`↓ ${r.behind}`} />}
                      {!r.missing && !r.error && !r.changes && !r.ahead && !r.behind && <Chip size="small" color="success" variant="outlined" label="Al día" />}
                    </Stack>
                  </TableCell>
                  <TableCell sx={{ color: 'text.secondary', fontFamily: 'monospace', fontSize: 12 }}>{r.path}</TableCell>
                  <TableCell align="right"><Tooltip title="Quitar de la lista"><IconButton size="small" onClick={(e) => remove(r, e)}><RemoveIcon /></IconButton></Tooltip></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}

      <Dialog open={addOpen} onClose={() => setAddOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Añadir repositorio existente</DialogTitle>
        <DialogContent>
          <TextField autoFocus fullWidth margin="dense" label="Ruta de la carpeta" placeholder="C:\\proyectos\\mi-repo  o  /home/yo/proyectos/mi-repo" value={path} onChange={(e) => setPath(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        </DialogContent>
        <DialogActions><Button onClick={() => setAddOpen(false)}>Cancelar</Button><Button variant="contained" onClick={add} disabled={!path}>Añadir</Button></DialogActions>
      </Dialog>
      <CloneDialog open={cloneOpen} onClose={() => setCloneOpen(false)} onCloned={(repo) => { setCloneOpen(false); notify('Repositorio clonado'); navigate(`/repos/${repo.id}`); }} />
    </Box>
  );
}
