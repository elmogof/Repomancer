import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert, Box, Button, ButtonGroup, Checkbox, Chip, CircularProgress, Dialog, DialogContent, DialogTitle,
  FormControlLabel, IconButton, LinearProgress, List, ListItemButton, ListItemText, ListSubheader, Paper,
  Stack, Tab, Tabs, TextField, Tooltip, Typography,
} from '@mui/material';
import PullIcon from '@mui/icons-material/Download';
import PushIcon from '@mui/icons-material/Upload';
import FetchIcon from '@mui/icons-material/Sync';
import MergeIcon from '@mui/icons-material/CallMerge';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import UndoIcon from '@mui/icons-material/Undo';
import BackIcon from '@mui/icons-material/ArrowBack';
import { api, qs } from '../api/client.js';
import { useNotify } from '../components/Notify.jsx';
import DiffView from '../components/DiffView.jsx';
import CreateMRDialog from '../components/CreateMRDialog.jsx';
import Branches from './Branches.jsx';
import History from './History.jsx';

const STATUS_LABEL = { M: 'Modificado', A: 'Añadido', D: 'Eliminado', R: 'Renombrado', C: 'Copiado', U: 'Conflicto', '?': 'Nuevo', T: 'Tipo' };
const STATUS_COLOR = { M: 'warning', A: 'success', D: 'error', R: 'info', U: 'error', '?': 'success' };

export default function RepoDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const notify = useNotify();
  const [st, setSt] = useState(null);
  const [tab, setTab] = useState(0);
  const [busy, setBusy] = useState(null);
  const [selected, setSelected] = useState(null); // { path, staged, untracked }
  const [diff, setDiff] = useState('');
  const [message, setMessage] = useState('');
  const [amend, setAmend] = useState(false);
  const [mrOpen, setMrOpen] = useState(false);
  const [project, setProject] = useState(null);
  const [output, setOutput] = useState(null);

  const load = useCallback(() => api.get(`/repos/${id}/status`).then(setSt).catch((e) => notify(e.message, 'error')), [id, notify]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [load]);

  useEffect(() => {
    if (!selected) { setDiff(''); return; }
    api.get(`/repos/${id}/diff${qs({ file: selected.path, staged: selected.staged, untracked: selected.untracked })}`)
      .then((d) => setDiff(d.diff)).catch((e) => setDiff(`Error: ${e.message}`));
  }, [id, selected, st]);

  const act = async (name, fn, okMsg) => {
    setBusy(name);
    try {
      const r = await fn();
      if (r?.output) setOutput({ title: okMsg, text: r.output });
      else if (okMsg) notify(okMsg);
      await load();
      return r;
    } catch (e) {
      if (e.data?.conflicts) setOutput({ title: 'Conflictos', text: `${e.message}\n\n${e.data.conflicts.join('\n')}`, error: true });
      else notify(e.message, 'error');
    } finally { setBusy(null); }
  };

  const stage = (files) => act('stage', () => api.post(`/repos/${id}/stage`, { files }));
  const unstage = (files) => act('stage', () => api.post(`/repos/${id}/unstage`, { files }));
  const discard = (f) => {
    if (!confirm(`¿Descartar los cambios de "${f.path}"? No se puede deshacer.`)) return;
    act('stage', () => api.post(`/repos/${id}/discard`, { files: [f.path], untracked: !!f.untracked }));
    setSelected(null);
  };

  const commit = async (andPush) => {
    const r = await act('commit', () => api.post(`/repos/${id}/commit`, { message, amend }), 'Commit creado');
    if (r) {
      setMessage(''); setAmend(false); setSelected(null);
      if (andPush) await act('push', () => api.post(`/repos/${id}/push`), 'Push completado');
    }
  };

  const openMR = async () => {
    try { setProject(await api.get(`/repos/${id}/gitlab-project`)); setMrOpen(true); }
    catch (e) { notify(e.message, 'error'); }
  };

  if (!st) return <CircularProgress />;
  const staged = st.files.filter((f) => f.staged);
  const unstaged = st.files.filter((f) => f.unstaged);
  const conflicts = st.files.filter((f) => f.conflict);

  const fileRow = (f, isStaged) => {
    const code = isStaged ? f.index : (f.untracked ? '?' : f.worktree);
    const sel = selected?.path === f.path && selected?.staged === isStaged;
    return (
      <ListItemButton key={(isStaged ? 's:' : 'u:') + f.path} dense selected={sel} onClick={() => setSelected({ path: f.path, staged: isStaged, untracked: !isStaged && f.untracked })}
        sx={{ '& .actions': { visibility: 'hidden' }, '&:hover .actions': { visibility: 'visible' } }}>
        <Chip size="small" label={code} color={STATUS_COLOR[code] || 'default'} title={STATUS_LABEL[code]} sx={{ mr: 1, minWidth: 28, fontFamily: 'monospace' }} />
        <ListItemText primary={f.path.split('/').pop()} secondary={f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/')) : null}
          primaryTypographyProps={{ noWrap: true, fontSize: 14 }} secondaryTypographyProps={{ noWrap: true, fontSize: 11 }} />
        <Box className="actions" onClick={(e) => e.stopPropagation()} sx={{ display: 'flex' }}>
          {!isStaged && <Tooltip title="Descartar cambios"><IconButton size="small" onClick={() => discard(f)}><UndoIcon fontSize="small" /></IconButton></Tooltip>}
          {isStaged
            ? <Tooltip title="Quitar del stage"><IconButton size="small" onClick={() => unstage([f.path])}><RemoveIcon fontSize="small" /></IconButton></Tooltip>
            : <Tooltip title="Añadir al stage"><IconButton size="small" onClick={() => stage([f.path])}><AddIcon fontSize="small" /></IconButton></Tooltip>}
        </Box>
      </ListItemButton>
    );
  };

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }} flexWrap="wrap" useFlexGap>
        <IconButton onClick={() => navigate('/repos')}><BackIcon /></IconButton>
        <Typography variant="h5">{st.name}</Typography>
        <Chip label={st.branch} color="primary" variant="outlined" />
        {st.upstream ? <Typography variant="body2" color="text.secondary">→ {st.upstream} {st.ahead > 0 && `↑${st.ahead}`} {st.behind > 0 && `↓${st.behind}`}</Typography>
          : <Chip size="small" label="Sin publicar" />}
        <Box sx={{ flexGrow: 1 }} />
        <ButtonGroup variant="outlined">
          <Button startIcon={<FetchIcon />} disabled={!!busy} onClick={() => act('fetch', () => api.post(`/repos/${id}/fetch`), 'Fetch')}>Fetch</Button>
          <Button startIcon={<PullIcon />} disabled={!!busy} onClick={() => act('pull', () => api.post(`/repos/${id}/pull`), 'Pull')}>Pull{st.behind ? ` (${st.behind})` : ''}</Button>
          <Button startIcon={<PushIcon />} disabled={!!busy} onClick={() => act('push', () => api.post(`/repos/${id}/push`), 'Push')}>Push{st.ahead ? ` (${st.ahead})` : ''}</Button>
        </ButtonGroup>
        <Button variant="contained" startIcon={<MergeIcon />} onClick={openMR}>Merge request</Button>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'monospace', mb: 1, ml: 6 }}>{st.path}</Typography>
      {busy && <LinearProgress sx={{ mb: 1 }} />}
      {conflicts.length > 0 && (
        <Alert severity="error" sx={{ mb: 1 }} action={<Button color="inherit" onClick={() => act('abort', () => api.post(`/repos/${id}/merge/abort`), 'Merge abortado')}>Abortar merge</Button>}>
          Hay {conflicts.length} archivo(s) en conflicto. Edítalos, añádelos al stage y haz commit para terminar el merge.
        </Alert>
      )}

      <Tabs value={tab} onChange={(e, v) => setTab(v)} sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Tab label={`Cambios (${st.files.length})`} />
        <Tab label="Historial" />
        <Tab label="Ramas" />
      </Tabs>

      {tab === 0 && (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '340px 1fr' }, gap: 2 }}>
          <Stack spacing={2}>
            <Paper variant="outlined" sx={{ maxHeight: '55vh', overflow: 'auto' }}>
              <List dense disablePadding>
                <ListSubheader sx={{ display: 'flex', alignItems: 'center' }}>
                  <Box sx={{ flexGrow: 1 }}>Preparados ({staged.length})</Box>
                  {staged.length > 0 && <Button size="small" onClick={() => act('stage', () => api.post(`/repos/${id}/unstage`, { all: true }))}>Quitar todos</Button>}
                </ListSubheader>
                {staged.map((f) => fileRow(f, true))}
                <ListSubheader sx={{ display: 'flex', alignItems: 'center' }}>
                  <Box sx={{ flexGrow: 1 }}>Cambios ({unstaged.length})</Box>
                  {unstaged.length > 0 && <Button size="small" onClick={() => act('stage', () => api.post(`/repos/${id}/stage`, { all: true }))}>Añadir todos</Button>}
                </ListSubheader>
                {unstaged.map((f) => fileRow(f, false))}
                {st.files.length === 0 && <Typography color="text.secondary" sx={{ p: 2 }}>No hay cambios. El árbol de trabajo está limpio.</Typography>}
              </List>
            </Paper>
            <Paper variant="outlined" sx={{ p: 2 }}>
              <TextField fullWidth multiline minRows={3} label="Mensaje del commit" placeholder={'Resumen corto (primera línea)\n\nDescripción opcional'} value={message} onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && staged.length) commit(false); }}
                helperText={message ? `${message.split('\n')[0].length} caracteres en el resumen · Ctrl+Enter para commit` : 'Ctrl+Enter para commit'} />
              <FormControlLabel control={<Checkbox checked={amend} onChange={(e) => setAmend(e.target.checked)} size="small" />} label="Corregir último commit (amend)" />
              <Stack direction="row" spacing={1}>
                <Button fullWidth variant="contained" disabled={!!busy || (!staged.length && !amend) || (!message.trim() && !amend)} onClick={() => commit(false)}>Commit ({staged.length})</Button>
                <Button fullWidth variant="outlined" disabled={!!busy || (!staged.length && !amend) || (!message.trim() && !amend)} onClick={() => commit(true)}>Commit y push</Button>
              </Stack>
            </Paper>
          </Stack>
          <Box sx={{ minWidth: 0 }}>
            {selected ? (
              <>
                <Typography variant="subtitle2" sx={{ mb: 1, fontFamily: 'monospace' }}>{selected.path} {selected.staged ? '(preparado)' : ''}</Typography>
                <DiffView diff={diff} maxHeight="75vh" />
              </>
            ) : <Typography color="text.secondary">Selecciona un archivo para ver sus cambios.</Typography>}
          </Box>
        </Box>
      )}
      {tab === 1 && <History repoId={id} />}
      {tab === 2 && <Branches repoId={id} onChanged={load} act={act} />}

      <CreateMRDialog open={mrOpen} onClose={() => setMrOpen(false)} project={project} sourceBranch={st.branch}
        onCreated={(mr) => { setMrOpen(false); notify(`Merge request !${mr.iid} creado`); navigate(`/projects/${mr.project_id}/merge-requests/${mr.iid}`); }} />

      <Dialog open={!!output} onClose={() => setOutput(null)} fullWidth maxWidth="md">
        <DialogTitle>{output?.title}</DialogTitle>
        <DialogContent>
          <Box component="pre" sx={{ m: 0, p: 2, bgcolor: 'background.default', borderRadius: 1, overflow: 'auto', fontSize: 13, color: output?.error ? 'error.main' : 'text.primary' }}>{output?.text}</Box>
        </DialogContent>
      </Dialog>
    </Box>
  );
}
