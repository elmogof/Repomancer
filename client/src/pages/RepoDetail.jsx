import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert, Box, Button, ButtonGroup, Checkbox, Chip, CircularProgress, Divider,
  FormControlLabel, IconButton, LinearProgress, List, ListItemButton, ListItemIcon, ListItemText, ListSubheader, Menu, MenuItem, Paper,
  Radio, Stack, Tab, Tabs, TextField, Tooltip, Typography,
} from '@mui/material';
import PullIcon from '@mui/icons-material/Download';
import PushIcon from '@mui/icons-material/Upload';
import FetchIcon from '@mui/icons-material/Sync';
import MergeIcon from '@mui/icons-material/CallMerge';
import WebIcon from '@mui/icons-material/OpenInNew';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import UndoIcon from '@mui/icons-material/Undo';
import BackIcon from '@mui/icons-material/ArrowBack';
import CommitIcon from '@mui/icons-material/Commit';
import StashIcon from '@mui/icons-material/Inventory2Outlined';
import DropIcon from '@mui/icons-material/ArrowDropDown';
import ConflictIcon from '@mui/icons-material/ReportProblemOutlined';
import FileHistoryIcon from '@mui/icons-material/ManageHistory';
import { api, qs } from '../api/client.js';
import { useNotify } from '../components/Notify.jsx';
import DiffView from '../components/DiffView.jsx';
import CreateMRDialog from '../components/CreateMRDialog.jsx';
import ConflictResolver from '../components/ConflictResolver.jsx';
import { ConfirmDialog, StashDialog, TagDialog, nextVersion } from '../components/GitDialogs.jsx';
import { describePull, getPullPrefs, setPullPrefs } from '../pullPrefs.js';
import Branches from './Branches.jsx';
import History from './History.jsx';
import Stashes from './Stashes.jsx';
import Compare from './Compare.jsx';
import FileHistory from './FileHistory.jsx';
import Tags from './Tags.jsx';

const STATUS_LABEL = { M: 'Modificado', A: 'Añadido', D: 'Eliminado', R: 'Renombrado', C: 'Copiado', U: 'Conflicto', '?': 'Nuevo', T: 'Tipo' };
const STATUS_COLOR = { M: 'warning', A: 'success', D: 'error', R: 'info', U: 'error', '?': 'success' };
const OP_LABEL = { merge: 'Merge en curso', rebase: 'Rebase en curso', 'cherry-pick': 'Cherry-pick en curso', revert: 'Revert en curso' };
const OP_CONTINUE = { merge: 'Crear commit de merge', rebase: 'Continuar rebase', 'cherry-pick': 'Continuar cherry-pick', revert: 'Continuar revert' };

const DONE = { fetch: 'Fetch completado', pull: 'Pull completado', push: 'Push completado', revert: 'Revert completado', 'cherry-pick': 'Cherry-pick completado', operation: 'Operación completada' };
const FAIL = {
  fetch: 'Fetch falló', pull: 'Pull falló', push: 'Push falló', commit: 'No se pudo crear el commit', stage: 'No se pudo actualizar el área de preparación',
  abort: 'No se pudo abortar', checkout: 'No se pudo cambiar de rama', merge: 'Merge falló', stash: 'Operación de stash fallida', tag: 'Operación de tag fallida',
  revert: 'Revert falló', 'cherry-pick': 'Cherry-pick falló', operation: 'No se pudo continuar', undo: 'No se pudo deshacer el commit',
};
const LOCAL_CHANGES_RE = /would be overwritten by (merge|checkout)|untracked working tree files would be|cannot pull with rebase: You have unstaged changes|Please commit or stash them/i;

export default function RepoDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const notify = useNotify();
  const [st, setSt] = useState(null);
  const [tab, setTab] = useState(0);
  const [busy, setBusy] = useState(null);
  const [selected, setSelected] = useState(null); // { path, staged, untracked }
  const [conflictSel, setConflictSel] = useState(null); // ruta del archivo en conflicto abierto
  const [diff, setDiff] = useState('');
  const [message, setMessage] = useState('');
  const [amend, setAmend] = useState(false);
  const [mrOpen, setMrOpen] = useState(false);
  const [project, setProject] = useState(null);
  const [outgoing, setOutgoing] = useState(null);
  const [commitSel, setCommitSel] = useState(null); // detalle del commit pendiente seleccionado
  const [version, setVersion] = useState(0); // se incrementa tras cada operación para refrescar las pestañas
  const [pullPrefs, setPullPrefsState] = useState(getPullPrefs);
  const [pullMenu, setPullMenu] = useState(null);
  const [stashOpen, setStashOpen] = useState(false);
  const [tagDlg, setTagDlg] = useState(null); // { target?, suggestion }
  const [confirm, setConfirm] = useState(null);
  const [compareInit, setCompareInit] = useState(null); // { base, head } al abrir Comparar desde otra pestaña
  const [fileInit, setFileInit] = useState(null); // archivo a abrir en la pestaña Archivos

  const load = useCallback(() => api.get(`/repos/${id}/status`).then(setSt).catch((e) => notify(e.message, 'error')), [id, notify]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [load]);

  // Commits pendientes de push: se recargan cada vez que cambia el estado del repo.
  useEffect(() => {
    if (!st) return;
    api.get(`/repos/${id}/outgoing`).then(setOutgoing).catch(() => setOutgoing(null));
  }, [id, st]);

  // Si el archivo en conflicto abierto ya se resolvió, se pasa al siguiente.
  useEffect(() => {
    if (!st || !conflictSel) return;
    const pending = st.files.filter((f) => f.conflict).map((f) => f.path);
    if (!pending.includes(conflictSel)) setConflictSel(pending[0] || null);
  }, [st, conflictSel]);

  const openCommit = (c) => {
    setSelected(null); setConflictSel(null);
    setCommitSel({ ...c, loading: true });
    api.get(`/repos/${id}/commit/${c.hash}`).then((d) => setCommitSel({ ...c, ...d })).catch((e) => setCommitSel({ ...c, diff: '', message: `Error: ${e.message}` }));
  };

  useEffect(() => {
    if (!selected) { setDiff(''); return; }
    api.get(`/repos/${id}/diff${qs({ file: selected.path, staged: selected.staged, untracked: selected.untracked })}`)
      .then((d) => setDiff(d.diff)).catch((e) => setDiff(`Error: ${e.message}`));
  }, [id, selected, st]);

  const pull = (opts = pullPrefs) => act('pull', () => api.post(`/repos/${id}/pull`, opts), 'Pull');

  const act = async (name, fn, okMsg) => {
    setBusy(name);
    try {
      const r = await fn();
      if (r?.output) {
        const lines = r.output.split('\n').map((l) => l.trim()).filter(Boolean);
        notify(lines[lines.length - 1] || 'Completado', 'success', { title: DONE[name] || okMsg, details: lines.length > 1 ? r.output.trim() : null });
      }
      else if (okMsg) notify(okMsg);
      return r;
    } catch (e) {
      if (e.data?.conflicts) {
        notify(e.message, 'warning', { title: OP_LABEL[e.data.operation] ? `${OP_LABEL[e.data.operation]} con conflictos` : 'Conflictos', files: e.data.conflicts, details: e.data.details || null, duration: 15000 });
        setTab(0); setSelected(null); setCommitSel(null); setConflictSel(e.data.conflicts[0]);
      } else if (name === 'pull' && LOCAL_CHANGES_RE.test(e.message)) {
        notify(e.message, 'error', { title: FAIL.pull, action: { label: 'Reintentar con autostash', onClick: () => pull({ ...pullPrefs, autostash: true }) } });
      } else notify(e.message, 'error', { title: FAIL[name] });
    } finally {
      setBusy(null);
      setVersion((v) => v + 1);
      await load();
    }
  };

  const stage = (files) => act('stage', () => api.post(`/repos/${id}/stage`, { files }));
  const unstage = (files) => act('stage', () => api.post(`/repos/${id}/unstage`, { files }));
  const discard = (f) => setConfirm({
    title: 'Descartar cambios', confirm: 'Descartar', color: 'error',
    body: <>Se perderán los cambios de <b>{f.path}</b>. No se puede deshacer.</>,
    run: () => { act('stage', () => api.post(`/repos/${id}/discard`, { files: [f.path], untracked: !!f.untracked })); setSelected(null); },
  });

  // Aplica las líneas o bloques elegidos en el diff.
  const applyPatch = (patch, mode) => {
    const go = () => act('stage', () => api.post(`/repos/${id}/apply-patch`, { patch, mode }));
    if (mode !== 'discard') return go();
    setConfirm({ title: 'Descartar líneas', confirm: 'Descartar', color: 'error', body: 'Las líneas elegidas volverán a su versión anterior en el archivo. No se puede deshacer.', run: go });
  };

  const commit = async (andPush) => {
    const r = await act('commit', () => api.post(`/repos/${id}/commit`, { message, amend }), 'Commit creado');
    if (r) {
      setMessage(''); setAmend(false); setSelected(null);
      if (andPush) await act('push', () => api.post(`/repos/${id}/push`), 'Push completado');
    }
  };

  // Deshace el último commit (reset suave). Si ya estaba publicado, pide confirmación aparte.
  const undoCommit = async (force = false) => {
    setBusy('undo');
    try {
      const r = await api.post(`/repos/${id}/undo-commit`, { force });
      notify(r.output, 'success', { title: 'Commit deshecho' });
      if (r.message && !message.trim()) setMessage(r.message);
      setTab(0);
    } catch (e) {
      if (e.data?.pushed) {
        setConfirm({
          title: 'El commit ya está publicado', confirm: 'Deshacer de todos modos', color: 'warning', body: e.message,
          run: () => undoCommit(true),
        });
      } else notify(e.message, 'error', { title: FAIL.undo });
    } finally { setBusy(null); setVersion((v) => v + 1); await load(); }
  };

  const saveStash = (opts) => { setStashOpen(false); act('stash', () => api.post(`/repos/${id}/stash`, opts), 'Cambios guardados en el stash'); setSelected(null); };

  const newTag = async (target) => {
    const tags = await api.get(`/repos/${id}/tags`).catch(() => []);
    setTagDlg({ target, suggestion: nextVersion(tags) });
  };
  const saveTag = (body) => { setTagDlg(null); act('tag', () => api.post(`/repos/${id}/tags`, body), `Tag ${body.name} creado`); };

  const TAB = { changes: 0, history: 1, branches: 2, compare: 3, files: 4, stash: 5, tags: 6 };
  const openCompare = (base, head) => { setCompareInit({ base, head }); setTab(TAB.compare); };
  const openFile = (path) => { setFileInit(path); setTab(TAB.files); };

  const changePull = (p) => { setPullPrefsState(p); setPullPrefs(p); };

  const openMR = async () => {
    try { setProject(await api.get(`/repos/${id}/gitlab-project`)); setMrOpen(true); }
    catch (e) { notify(e.message, 'error'); }
  };

  if (!st) return <CircularProgress />;
  const conflicts = st.files.filter((f) => f.conflict);
  const staged = st.files.filter((f) => f.staged && !f.conflict);
  const unstaged = st.files.filter((f) => f.unstaged && !f.conflict);

  const fileRow = (f, isStaged) => {
    const code = isStaged ? f.index : (f.untracked ? '?' : f.worktree);
    const sel = !conflictSel && selected?.path === f.path && selected?.staged === isStaged;
    return (
      <ListItemButton key={(isStaged ? 's:' : 'u:') + f.path} dense selected={sel}
        onClick={() => { setCommitSel(null); setConflictSel(null); setSelected({ path: f.path, staged: isStaged, untracked: !isStaged && f.untracked }); }}
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

  // Acciones del diff según el lado: en «Cambios» se puede preparar o descartar; en «Preparados», quitar del stage.
  const diffSelect = selected && !selected.untracked && (selected.staged
    ? { actions: [{ mode: 'unstage', label: 'Quitar' }], onApply: applyPatch }
    : { actions: [{ mode: 'stage', label: 'Preparar' }, { mode: 'discard', label: 'Descartar', color: 'error' }], onApply: applyPatch });

  return (
    // Cabecera fija; solo el contenido de las pestañas se desplaza (en pantallas md+).
    <Box sx={{ display: 'flex', flexDirection: 'column', height: { md: 'calc(100vh - 112px)' }, minHeight: 0 }}>
      <Box sx={{ flexShrink: 0, position: 'relative' }}>
        {/* Barra de progreso pegada bajo la barra superior, superpuesta para no alterar la altura. */}
        {busy && <LinearProgress sx={{ position: 'absolute', top: -24, left: -24, right: -24, height: 2, borderRadius: 0, bgcolor: 'transparent', zIndex: 1 }} />}
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }} flexWrap="wrap" useFlexGap>
          <IconButton onClick={() => navigate('/repos')}><BackIcon /></IconButton>
          <Typography variant="h5">{st.name}</Typography>
          <Chip label={st.branch} color="primary" variant="outlined" />
          {st.upstream ? <Typography variant="body2" color="text.secondary">→ {st.upstream} {st.ahead > 0 && `↑${st.ahead}`} {st.behind > 0 && `↓${st.behind}`}</Typography>
            : <Chip size="small" label="Sin publicar" />}
          <Box sx={{ flexGrow: 1 }} />
          <ButtonGroup variant="outlined">
            <Button startIcon={<FetchIcon />} disabled={!!busy} onClick={() => act('fetch', () => api.post(`/repos/${id}/fetch`), 'Fetch')}>Fetch</Button>
            <Tooltip title={`Pull con ${describePull(pullPrefs)}`}>
              <Button startIcon={<PullIcon />} disabled={!!busy} onClick={() => pull()}>Pull{st.behind ? ` (${st.behind})` : ''}</Button>
            </Tooltip>
            <Tooltip title="Opciones de pull">
              <Button size="small" disabled={!!busy} onClick={(e) => setPullMenu(e.currentTarget)} sx={{ px: 0.5, minWidth: 0 }} aria-label="Opciones de pull"><DropIcon /></Button>
            </Tooltip>
            <Button startIcon={<PushIcon />} disabled={!!busy} onClick={() => act('push', () => api.post(`/repos/${id}/push`), 'Push')}>Push{st.ahead ? ` (${st.ahead})` : ''}</Button>
          </ButtonGroup>
          {st.remote?.provider === 'github' ? (
            <Tooltip title={`Abre GitHub para crear un pull request desde «${st.branch}»`}>
              <Button variant="contained" startIcon={<MergeIcon />} endIcon={<WebIcon fontSize="small" />}
                href={`${st.remote.web}/compare/${encodeURIComponent(st.branch)}?expand=1`} target="_blank" rel="noopener">Pull request</Button>
            </Tooltip>
          ) : (
            <Tooltip title={st.remote?.provider === 'gitlab' ? '' : st.remote
              ? `El remoto (${st.remote.host}) no está en tu GitLab (${st.remote.gitlabHost || 'sin configurar'}); no se pueden crear merge requests desde aquí`
              : 'El repositorio no tiene remoto origin'}>
              <span>
                <Button variant="contained" startIcon={<MergeIcon />} onClick={openMR} disabled={st.remote?.provider !== 'gitlab'}>Merge request</Button>
              </span>
            </Tooltip>
          )}
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'monospace', mb: 1, ml: 6 }}>{st.path}</Typography>
        {(st.operation || conflicts.length > 0) && (
          <Alert severity={conflicts.length ? 'error' : 'warning'} sx={{ mb: 1 }} action={
            <Stack direction="row" spacing={1}>
              {st.operation && (
                <Tooltip title={conflicts.length ? 'Resuelve primero todos los archivos en conflicto' : ''}>
                  <span><Button color="inherit" disabled={!!busy || conflicts.length > 0} onClick={() => act('operation', () => api.post(`/repos/${id}/operation`, { action: 'continue' }), OP_CONTINUE[st.operation])}>{OP_CONTINUE[st.operation]}</Button></span>
                </Tooltip>
              )}
              {st.operation && <Button color="inherit" disabled={!!busy} onClick={() => setConfirm({
                title: `Abortar ${st.operation}`, confirm: 'Abortar', color: 'error',
                body: 'El repositorio volverá al estado anterior a la operación. Se perderán las resoluciones de conflictos que hayas hecho.',
                run: () => act('abort', () => api.post(`/repos/${id}/operation`, { action: 'abort' }), `${st.operation} abortado`),
              })}>Abortar</Button>}
            </Stack>
          }>
            <b>{OP_LABEL[st.operation] || 'Conflictos'}.</b>{' '}
            {conflicts.length
              ? `Hay ${conflicts.length} ${conflicts.length === 1 ? 'archivo' : 'archivos'} en conflicto: ábrelos en la lista para resolverlos.`
              : 'Todos los conflictos están resueltos; ya puedes continuar.'}
          </Alert>
        )}

        <Box sx={{ mb: 2 }}>
          <Tabs value={tab} onChange={(e, v) => setTab(v)} variant="scrollable" allowScrollButtonsMobile sx={{ borderBottom: 1, borderColor: 'divider' }}>
            <Tab label={`Cambios (${st.files.length})`} />
            <Tab label="Historial" />
            <Tab label="Ramas" />
            <Tab label="Comparar" />
            <Tab label="Archivos" />
            <Tab label={st.stashes ? `Stash (${st.stashes})` : 'Stash'} />
            <Tab label="Tags" />
          </Tabs>
        </Box>
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, overflow: { md: tab === 0 ? 'hidden' : 'auto' } }}>
        {tab === 0 && (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '340px 1fr' }, gap: 2, height: { md: '100%' } }}>
            <Stack spacing={2} sx={{ minHeight: 0, overflow: { md: 'auto' } }}>
              <Paper variant="outlined" sx={{ p: 2, flexShrink: 0 }}>
                <TextField fullWidth multiline minRows={3} label="Mensaje del commit" placeholder={'Resumen corto (primera línea)\n\nDescripción opcional'} value={message} onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && staged.length) commit(false); }}
                  helperText={message ? `${message.split('\n')[0].length} caracteres en el resumen · Ctrl+Enter para commit` : 'Ctrl+Enter para commit'} />
                <FormControlLabel control={<Checkbox checked={amend} onChange={(e) => setAmend(e.target.checked)} size="small" />} label="Corregir último commit (amend)" />
                <Stack direction="row" spacing={1}>
                  <Button fullWidth variant="contained" disabled={!!busy || (!staged.length && !amend) || (!message.trim() && !amend)} onClick={() => commit(false)}>Commit ({staged.length})</Button>
                  <Button fullWidth variant="outlined" disabled={!!busy || (!staged.length && !amend) || (!message.trim() && !amend)} onClick={() => commit(true)}>Commit y push</Button>
                </Stack>
                <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                  <Tooltip title="Aparta los cambios sin hacer commit y deja el árbol limpio">
                    <span style={{ flex: 1 }}><Button fullWidth size="small" startIcon={<StashIcon fontSize="small" />} disabled={!!busy || !st.files.length || conflicts.length > 0} onClick={() => setStashOpen(true)}>Stash</Button></span>
                  </Tooltip>
                  <Tooltip title="Reset suave: quita el último commit y deja sus cambios preparados">
                    <span style={{ flex: 1 }}><Button fullWidth size="small" startIcon={<UndoIcon fontSize="small" />} disabled={!!busy || !!st.operation} onClick={() => undoCommit()}>Deshacer commit</Button></span>
                  </Tooltip>
                </Stack>
              </Paper>
              {outgoing && outgoing.commits.length > 0 && (
                <Paper variant="outlined" sx={{ maxHeight: '30vh', overflow: 'auto', flexShrink: 0 }}>
                  <List dense disablePadding>
                    <ListSubheader sx={{ display: 'flex', alignItems: 'center' }}>
                      <Tooltip title={outgoing.upstream ? `Commits locales que aún no están en ${outgoing.upstream}` : 'La rama no está publicada: estos commits no existen en ningún remoto'}>
                        <Box sx={{ flexGrow: 1 }}>Pendientes de push ({outgoing.commits.length}{outgoing.commits.length >= 200 ? '+' : ''})</Box>
                      </Tooltip>
                      <Button size="small" startIcon={<PushIcon fontSize="small" />} disabled={!!busy} onClick={() => act('push', () => api.post(`/repos/${id}/push`), 'Push')}>
                        {outgoing.upstream ? 'Push' : 'Publicar'}
                      </Button>
                    </ListSubheader>
                    {outgoing.commits.map((c) => (
                      <ListItemButton key={c.hash} dense selected={commitSel?.hash === c.hash} onClick={() => openCommit(c)} sx={{ alignItems: 'flex-start' }}>
                        <CommitIcon fontSize="small" color="primary" sx={{ mr: 1, mt: 0.25 }} />
                        <ListItemText
                          primary={c.subject}
                          secondary={<>
                            <Box component="span" sx={{ fontFamily: (t) => t.typography.fontFamilyCode, color: 'primary.main' }}>{c.short}</Box>
                            {` · ${new Date(c.date).toLocaleString('es-CR', { dateStyle: 'short', timeStyle: 'short' })} · ${c.files} ${c.files === 1 ? 'archivo' : 'archivos'} `}
                            <Box component="span" sx={{ color: 'success.main' }}>+{c.insertions}</Box>{' '}
                            <Box component="span" sx={{ color: 'error.main' }}>−{c.deletions}</Box>
                          </>}
                          primaryTypographyProps={{ noWrap: true, fontSize: 14, title: c.subject }} secondaryTypographyProps={{ fontSize: 11 }} />
                      </ListItemButton>
                    ))}
                  </List>
                </Paper>
              )}
              <Paper variant="outlined" sx={{ flex: { md: 1 }, minHeight: { md: 160 }, overflow: 'auto' }}>
                <List dense disablePadding>
                  {conflicts.length > 0 && (
                    <>
                      <ListSubheader sx={{ color: 'error.main' }}>En conflicto ({conflicts.length})</ListSubheader>
                      {conflicts.map((f) => (
                        <ListItemButton key={`c:${f.path}`} dense selected={conflictSel === f.path}
                          onClick={() => { setCommitSel(null); setSelected(null); setConflictSel(f.path); }}>
                          <ConflictIcon fontSize="small" color="error" sx={{ mr: 1 }} />
                          <ListItemText primary={f.path.split('/').pop()} secondary={f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/')) : null}
                            primaryTypographyProps={{ noWrap: true, fontSize: 14 }} secondaryTypographyProps={{ noWrap: true, fontSize: 11 }} />
                        </ListItemButton>
                      ))}
                    </>
                  )}
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
            </Stack>
            <Box sx={{ minWidth: 0, minHeight: 0, overflow: { md: 'auto' } }}>
              {conflictSel ? (
                <ConflictResolver repoId={id} file={conflictSel} notify={notify} onResolved={() => { setVersion((v) => v + 1); load(); }} />
              ) : commitSel ? (
                <>
                  <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }} flexWrap="wrap" useFlexGap>
                    <Chip size="small" color="primary" variant="outlined" icon={<CommitIcon />} label={commitSel.short} />
                    <Typography variant="subtitle2">{commitSel.subject}</Typography>
                    <Chip size="small" variant="outlined" label="Pendiente de push" />
                  </Stack>
                  <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 1 }}>
                    {commitSel.author} · {new Date(commitSel.date).toLocaleString('es-CR', { dateStyle: 'medium', timeStyle: 'short' })}
                  </Typography>
                  {commitSel.loading ? <LinearProgress /> : (
                    <>
                      {commitSel.message?.includes('\n') && <Box component="pre" sx={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 14, mt: 0 }}>{commitSel.message}</Box>}
                      <DiffView diff={commitSel.diff} />
                    </>
                  )}
                </>
              ) : selected ? (
                <>
                  <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                    <Typography variant="subtitle2" sx={{ fontFamily: 'monospace', flexGrow: 1, minWidth: 0 }} noWrap>{selected.path} {selected.staged ? '(preparado)' : ''}</Typography>
                    {!selected.untracked && (
                      <Tooltip title="Ver el historial del archivo y quién escribió cada línea">
                        <Button size="small" startIcon={<FileHistoryIcon fontSize="small" />} onClick={() => openFile(selected.path)}>Historial y blame</Button>
                      </Tooltip>
                    )}
                  </Stack>
                  <DiffView diff={diff} select={diffSelect || undefined} />
                </>
              ) : <Typography color="text.secondary">Selecciona un archivo para ver sus cambios.</Typography>}
            </Box>
          </Box>
        )}
        {tab === TAB.history && <History repoId={id} branch={st.branch} act={act} notify={notify} version={version} onUndo={() => undoCommit()} onTag={(c) => newTag(c)} onCompare={openCompare} />}
        {tab === TAB.branches && <Branches repoId={id} onChanged={load} act={act} notify={notify} onCompare={openCompare} />}
        {tab === TAB.compare && <Compare repoId={id} initial={compareInit} version={version} notify={notify} />}
        {tab === TAB.files && <FileHistory repoId={id} file={fileInit} version={version} notify={notify} />}
        {tab === TAB.stash && <Stashes repoId={id} act={act} version={version} onNew={() => setStashOpen(true)} />}
        {tab === TAB.tags && <Tags repoId={id} act={act} version={version} hasRemote={!!st.remote} onNew={() => newTag()} />}
      </Box>

      <Menu anchorEl={pullMenu} open={!!pullMenu} onClose={() => setPullMenu(null)} slotProps={{ paper: { sx: { width: 320 } } }}>
        <ListSubheader sx={{ lineHeight: 2.5 }}>Cómo integrar los cambios del remoto</ListSubheader>
        {[[false, 'Merge', 'Crea un commit de merge si tu rama y el remoto divergieron.'], [true, 'Rebase', 'Reaplica tus commits locales encima del remoto: historial lineal.']].map(([rebase, label, desc]) => (
          <MenuItem key={label} onClick={() => changePull({ ...pullPrefs, rebase })} sx={{ alignItems: 'flex-start', whiteSpace: 'normal' }}>
            <ListItemIcon sx={{ mt: -0.5 }}><Radio size="small" checked={pullPrefs.rebase === rebase} /></ListItemIcon>
            <ListItemText primary={label} secondary={desc} secondaryTypographyProps={{ fontSize: 12 }} />
          </MenuItem>
        ))}
        <Divider />
        <MenuItem onClick={() => changePull({ ...pullPrefs, autostash: !pullPrefs.autostash })} sx={{ alignItems: 'flex-start', whiteSpace: 'normal' }}>
          <ListItemIcon sx={{ mt: -0.5 }}><Checkbox size="small" checked={pullPrefs.autostash} /></ListItemIcon>
          <ListItemText primary="Autostash" secondary="Guarda tus cambios locales antes del pull y los restaura al terminar." secondaryTypographyProps={{ fontSize: 12 }} />
        </MenuItem>
        <Divider />
        <MenuItem onClick={() => { setPullMenu(null); pull(); }} disabled={!!busy}>
          <ListItemIcon><PullIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary={`Pull ahora (${describePull(pullPrefs)})`} secondary="La elección se recuerda para los próximos pull" secondaryTypographyProps={{ fontSize: 12 }} />
        </MenuItem>
      </Menu>

      <StashDialog open={stashOpen} onClose={() => setStashOpen(false)} onSave={saveStash} />
      <TagDialog open={!!tagDlg} target={tagDlg?.target} suggestion={tagDlg?.suggestion} canPush={!!st.remote} onClose={() => setTagDlg(null)} onSave={saveTag} />
      <ConfirmDialog open={confirm} title={confirm?.title} body={confirm?.body} confirm={confirm?.confirm} color={confirm?.color}
        onClose={() => setConfirm(null)} onConfirm={() => { const c = confirm; setConfirm(null); c.run(); }} />

      <CreateMRDialog open={mrOpen} onClose={() => setMrOpen(false)} project={project} sourceBranch={st.branch}
        onCreated={(mr) => { setMrOpen(false); notify(`Merge request !${mr.iid} creado`); navigate(`/projects/${mr.project_id}/merge-requests/${mr.iid}`); }} />
    </Box>
  );
}
