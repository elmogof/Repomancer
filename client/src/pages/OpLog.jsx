import { Fragment, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Button, Chip, Collapse, FormControlLabel, IconButton, LinearProgress, MenuItem, Paper, Stack, Switch, Table, TableBody, TableCell,
  TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import ExpandIcon from '@mui/icons-material/ExpandMore';
import RefreshIcon from '@mui/icons-material/Refresh';
import { api, qs } from '../api/client.js';
import { useNotify } from '../components/Notify.jsx';
import { ConfirmDialog } from '../components/GitDialogs.jsx';

const fmt = (d) => new Date(d).toLocaleString('es', { dateStyle: 'short', timeStyle: 'medium' });
const dur = (ms) => (ms == null ? '' : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`);

// Registro de operaciones: qué se ejecutó, sobre qué repo, cuándo y con qué resultado.
export default function OpLog() {
  const theme = useTheme();
  const [items, setItems] = useState(null);
  const [repos, setRepos] = useState([]);
  const [repo, setRepo] = useState('');
  const [errors, setErrors] = useState(false);
  const [open, setOpen] = useState(null);
  const [confirm, setConfirm] = useState(false);
  const notify = useNotify();
  const navigate = useNavigate();

  const load = () => { setItems(null); api.get(`/oplog${qs({ repo, errors: errors ? 'true' : undefined })}`).then(setItems).catch((e) => notify(e.message, 'error')); };
  useEffect(load, [repo, errors]);
  useEffect(() => { api.get('/repos/index').then(setRepos).catch(() => {}); }, []);

  const clear = async () => { setConfirm(false); await api.del('/oplog'); load(); };

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
        <Typography variant="h5" sx={{ flexGrow: 1 }}>Registro de operaciones</Typography>
        <TextField select size="small" label="Repositorio" value={repo} onChange={(e) => setRepo(e.target.value)} sx={{ minWidth: 240 }}>
          <MenuItem value="">Todos</MenuItem>
          {repos.map((r) => <MenuItem key={r.id} value={r.id}>{r.name}</MenuItem>)}
        </TextField>
        <FormControlLabel control={<Switch checked={errors} onChange={(e) => setErrors(e.target.checked)} />} label="Solo errores" />
        <Tooltip title="Actualizar"><IconButton onClick={load}><RefreshIcon /></IconButton></Tooltip>
        <Button color="error" onClick={() => setConfirm(true)}>Vaciar</Button>
      </Stack>
      {!items ? <LinearProgress /> : !items.length ? (
        <Typography color="text.secondary">No hay operaciones registradas{errors ? ' con error' : ''}.</Typography>
      ) : (
        <Paper variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow><TableCell /><TableCell>Fecha</TableCell><TableCell>Repositorio</TableCell><TableCell>Operación</TableCell><TableCell sx={{ width: '100%' }}>Resultado</TableCell><TableCell align="right">Duración</TableCell></TableRow>
            </TableHead>
            <TableBody>
              {items.map((e) => (
                <Fragment key={e.id}>
                  <TableRow hover sx={{ cursor: e.details ? 'pointer' : 'default', '& > td': { borderBottom: open === e.id ? 0 : undefined } }} onClick={() => e.details && setOpen(open === e.id ? null : e.id)}>
                    <TableCell padding="checkbox">{e.details && <ExpandIcon fontSize="small" sx={{ transition: 'transform .2s', transform: open === e.id ? 'rotate(180deg)' : 'none', color: 'text.secondary' }} />}</TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{fmt(e.at)}</TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      {e.repoId ? <Button size="small" sx={{ p: 0, minWidth: 0, textTransform: 'none' }} onClick={(ev) => { ev.stopPropagation(); navigate(`/repos/${e.repoId}`); }}>{e.repoName || 'repo'}</Button>
                        : <Typography variant="body2" color="text.secondary">{e.source === 'automático' ? 'Todos' : '—'}</Typography>}
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      {e.label}{e.source === 'automático' && <Chip size="small" variant="outlined" label="auto" sx={{ ml: 1, height: 18, fontSize: 10.5 }} />}
                    </TableCell>
                    <TableCell sx={{ maxWidth: 0 }}>
                      <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
                        <Chip size="small" color={e.ok ? 'success' : 'error'} variant="outlined" label={e.ok ? 'OK' : 'Error'} sx={{ flexShrink: 0 }} />
                        <Typography variant="body2" noWrap title={e.summary}>{e.summary}</Typography>
                      </Stack>
                    </TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap', color: 'text.secondary' }}>{dur(e.ms)}</TableCell>
                  </TableRow>
                  {e.details && (
                    <TableRow>
                      <TableCell colSpan={6} sx={{ py: 0 }}>
                        <Collapse in={open === e.id} unmountOnExit>
                          <Box component="pre" sx={{ m: 0, my: 1, p: 1.5, borderRadius: 1, bgcolor: 'action.hover', fontFamily: theme.typography.fontFamilyCode, fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 300, overflow: 'auto' }}>{e.details}</Box>
                        </Collapse>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}
      <ConfirmDialog open={confirm} title="Vaciar registro" color="error" confirm="Vaciar" onClose={() => setConfirm(false)} onConfirm={clear}
        body="Se borrará todo el historial de operaciones guardado en este equipo." />
    </Box>
  );
}
