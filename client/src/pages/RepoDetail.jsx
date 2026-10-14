import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert, Box, Button, ButtonGroup, Checkbox, Chip, CircularProgress, Divider,
  FormControlLabel, IconButton, LinearProgress, List, ListItemButton, ListItemIcon, ListItemText, ListSubheader, Menu, MenuItem, Paper,
  Radio, Stack, Tab, Tabs, Tooltip, Typography, useMediaQuery,
} from '@mui/material';
import PullIcon from '@mui/icons-material/Download';
import PushIcon from '@mui/icons-material/Upload';
import PublishIcon from '@mui/icons-material/CloudUploadOutlined';
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
import ListIcon from '@mui/icons-material/FormatListBulleted';
import { api, qs } from '../api/client.js';
import { useNotify } from '../components/Notify.jsx';
import DiffView from '../components/DiffView.jsx';
import CreateMRDialog from '../components/CreateMRDialog.jsx';
import CreatePRDialog from '../components/CreatePRDialog.jsx';
import CommitBox from '../components/CommitBox.jsx';
import { useCommands } from '../components/Commands.jsx';
import { setInstance } from '../gitlabInstance.js';
import ConflictResolver from '../components/ConflictResolver.jsx';
import { ConfirmDialog, StashDialog, TagDialog, nextVersion } from '../components/GitDialogs.jsx';
import { describePull, getPullPrefs, setPullPrefs } from '../pullPrefs.js';
import Branches from './Branches.jsx';
import History from './History.jsx';
import Stashes from './Stashes.jsx';
import Compare from './Compare.jsx';
import FileHistory from './FileHistory.jsx';
import Tags from './Tags.jsx';
import RepoQuickActions from '../components/RepoQuickActions.jsx';

const STATUS_LABEL = { M: 'Modificado', A: 'Añadido', D: 'Eliminado', R: 'Renombrado', C: 'Copiado', U: 'Conflicto', '?': 'Nuevo', T: 'Tipo' };
const STATUS_COLOR = { M: 'warning', A: 'success', D: 'error', R: 'info', U: 'error', '?': 'success' };
const OP_LABEL = { merge: 'Merge en curso', rebase: 'Rebase en curso', 'cherry-pick': 'Cherry-pick en curso', revert: 'Revert en curso' };
const OP_CONTINUE = { merge: 'Crear commit de merge', rebase: 'Continuar rebase', 'cherry-pick': 'Continuar cherry-pick', revert: 'Continuar revert' };

const DONE = { fetch: 'Fetch completado', pull: 'Pull completado', push: 'Push completado', revert: 'Revert completado', 'cherry-pick': 'Cherry-pick completado', operation: 'Operación completada' };
const FAIL = {
  fetch: 'Fetch falló', pull: 'Pull falló', push: 'Push falló', commit: 'No se pudo crear el commit', stage: 'No se pudo actualizar el área de preparación',
  abort: 'No se pudo abortar', checkout: 'No se pudo cambiar de rama', merge: 'Merge falló', stash: 'Operación de stash fallida', tag: 'Operación de tag fallida',
  revert: 'Revert falló', 'cherry-pick': 'Cherry-pick falló', operation: 'No se pudo continuar', undo: 'No se pudo deshacer el commit',
  publish: 'No se pudo publicar la rama', 'branch-delete': 'No se pudo eliminar la rama',
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
  const [github, setGithub] = useState(null); // datos del repo en GitHub (si hay cuenta)
  const [prOpen, setPrOpen] = useState(false);
  const messageRef = useRef(null);
  const mobile = useMediaQuery((t) => t.breakpoints.down('md'));
  const compact = useMediaQuery((t) => t.breakpoints.down('sm'));

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

  const ghAccount = st?.remote?.provider === 'github' && st.remote.account;
  const loadGithub = useCallback(() => api.get(`/repos/${id}/github`).then(setGithub).catch(() => setGithub(null)), [id]);
  useEffect(() => { if (ghAccount) loadGithub(); else setGithub(null); }, [ghAccount, st?.branch, loadGithub]);

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

  const goTab = (t) => { setTab(t); };
  const canStash = !!st && st.files.length > 0 && !st.files.some((f) => f.conflict);

  // Comandos de la paleta y atajos de teclado (solo fuera de campos de texto).
  useCommands('repo-detail', () => (st ? [
    { id: 'fetch', group: `Repositorio · ${st.name}`, title: 'Fetch', keys: 'f', icon: <FetchIcon fontSize="small" />, disabled: !!busy, run: () => act('fetch', () => api.post(`/repos/${id}/fetch`), 'Fetch') },
    { id: 'pull', group: `Repositorio · ${st.name}`, title: `Pull (${describePull(pullPrefs)})`, keys: 'p', icon: <PullIcon fontSize="small" />, disabled: !!busy, run: () => pull() },
    { id: 'pull-rebase', group: `Repositorio · ${st.name}`, title: 'Pull con rebase', disabled: !!busy, run: () => pull({ ...pullPrefs, rebase: true }) },
    { id: 'push', group: `Repositorio · ${st.name}`, title: 'Push', keys: 'shift+p', icon: <PushIcon fontSize="small" />, disabled: !!busy, run: () => act('push', () => api.post(`/repos/${id}/push`), 'Push') },
    { id: 'commit-msg', group: `Repositorio · ${st.name}`, title: 'Escribir mensaje de commit', keys: 'c', icon: <CommitIcon fontSize="small" />, run: () => { setTab(0); setTimeout(() => messageRef.current?.focus(), 50); } },
    { id: 'stage-all', group: `Repositorio · ${st.name}`, title: 'Añadir todos los cambios al stage', keys: 'a', disabled: !!busy, run: () => act('stage', () => api.post(`/repos/${id}/stage`, { all: true })) },
    { id: 'stash', group: `Repositorio · ${st.name}`, title: 'Guardar cambios en stash', keys: 's', icon: <StashIcon fontSize="small" />, disabled: !!busy || !canStash, run: () => setStashOpen(true) },
    { id: 'undo', group: `Repositorio · ${st.name}`, title: 'Deshacer último commit', disabled: !!busy || !!st.operation, run: () => undoCommit() },
    { id: 'tag', group: `Repositorio · ${st.name}`, title: 'Nuevo tag', keys: 't', run: () => newTag() },
    { id: 'mr', group: `Repositorio · ${st.name}`, title: st.remote?.provider === 'github' ? 'Crear pull request' : 'Crear merge request', keys: 'm',
      disabled: !(st.remote?.provider === 'gitlab' || ghAccount), run: () => (st.remote?.provider === 'github' ? setPrOpen(true) : openMR()) },
    { id: 'refresh', group: `Repositorio · ${st.name}`, title: 'Actualizar estado', keys: 'r', run: () => load() },
    { id: 'open-folder', group: `Repositorio · ${st.name}`, title: 'Abrir carpeta en el explorador', run: () => api.post(`/repos/${id}/open`, { target: 'folder' }).catch((e) => notify(e.message, 'error')) },
    { id: 'open-code', group: `Repositorio · ${st.name}`, title: 'Abrir en VS Code', run: () => api.post(`/repos/${id}/open`, { target: 'vscode' }).catch((e) => notify(e.message, 'error')) },
    { id: 'open-term', group: `Repositorio · ${st.name}`, title: 'Abrir terminal en la carpeta', run: () => api.post(`/repos/${id}/open`, { target: 'terminal' }).catch((e) => notify(e.message, 'error')) },
    { id: 'back', group: `Repositorio · ${st.name}`, title: 'Volver a la lista de repositorios', keys: 'backspace', icon: <BackIcon fontSize="small" />, run: () => navigate('/repos') },
    ...['Cambios', 'Historial', 'Ramas', 'Comparar', 'Archivos', 'Stash', 'Tags'].map((t, i) => ({ id: `tab:${i}`, group: 'Pestañas', title: `Ir a ${t}`, keys: String(i + 1), run: () => goTab(i) })),
  ] : []), [st, busy, pullPrefs, canStash, ghAccount]);

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
        {busy && <LinearProgress sx={{ position: 'absolute', top: { xs: -12, sm: -16, md: -24 }, left: { xs: -12, sm: -16, md: -24 }, right: { xs: -12, sm: -16, md: -24 }, height: 2, borderRadius: 0, bgcolor: 'transparent', zIndex: 1 }} />}
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }} flexWrap="wrap" useFlexGap>
          <Tooltip title="Volver a la lista (Retroceso)"><IconButton onClick={() => navigate('/repos')} sx={{ ml: { xs: -1, sm: 0 } }}><BackIcon /></IconButton></Tooltip>
          <Typography variant="h5" sx={{ fontSize: { xs: 20, sm: 24 }, wordBreak: 'break-word', minWidth: 0 }}>{st.name}</Typography>
          <Chip label={st.branch} color="primary" variant="outlined" sx={{ maxWidth: { xs: '100%', sm: 360 } }} />
          {st.upstream ? <Typography variant="body2" color="text.secondary">→ {st.upstream} {st.ahead > 0 && `↑${st.ahead}`} {st.behind > 0 && `↓${st.behind}`}</Typography>
            : st.branch && st.branch !== '(detached)' ? (
              <Tooltip title={`La rama no existe en origin. Publicarla: push -u origin ${st.branch}`}>
                <Button size="small" variant="outlined" color="warning" startIcon={<PublishIcon />} disabled={!!busy}
                  onClick={() => act('publish', () => api.post(`/repos/${id}/publish`, { branch: st.branch }), `Rama ${st.branch} publicada en origin`)}>
                  Publicar rama
                </Button>
              </Tooltip>
            ) : <Chip size="small" label="Sin publicar" />}
          <Box sx={{ flexGrow: 1 }} />
          <ButtonGroup variant="outlined" size={compact ? 'small' : 'medium'} sx={{ '& .MuiButton-startIcon': compact ? { mr: 0.5 } : {} }}>
            <Tooltip title="Fetch (F)">
              <Button startIcon={<FetchIcon />} disabled={!!busy} onClick={() => act('fetch', () => api.post(`/repos/${id}/fetch`), 'Fetch')}>{compact ? '' : 'Fetch'}</Button>
            </Tooltip>
            <Tooltip title={`Pull con ${describePull(pullPrefs)} (P)`}>
              <Button startIcon={<PullIcon />} disabled={!!busy} onClick={() => pull()}>{compact ? (st.behind || '') : `Pull${st.behind ? ` (${st.behind})` : ''}`}</Button>
            </Tooltip>
            <Tooltip title="Opciones de pull">
              <Button size="small" disabled={!!busy} onClick={(e) => setPullMenu(e.currentTarget)} sx={{ px: 0.5, minWidth: 0 }} aria-label="Opciones de pull"><DropIcon /></Button>
            </Tooltip>
            <Tooltip title="Push (Mayús+P)">
              <Button startIcon={<PushIcon />} disabled={!!busy} onClick={() => act('push', () => api.post(`/repos/${id}/push`), 'Push')}>{compact ? (st.ahead || '') : `Push${st.ahead ? ` (${st.ahead})` : ''}`}</Button>
            </Tooltip>
          </ButtonGroup>
          {st.remote?.provider === 'github' ? (
            ghAccount && github?.pulls?.length ? (
              <Tooltip title={`Pull request abierto: ${github.pulls[0].title}`}>
                <Button variant="contained" size={compact ? 'small' : 'medium'} startIcon={<MergeIcon />} endIcon={<WebIcon fontSize="small" />} href={github.pulls[0].html_url} target="_blank" rel="noopener">
                  PR #{github.pulls[0].number}
                </Button>
              </Tooltip>
            ) : ghAccount ? (
              <Tooltip title={`Crear un pull request desde «${st.branch}» (M)`}>
                <span><Button variant="contained" size={compact ? 'small' : 'medium'} startIcon={<MergeIcon />} disabled={!github} onClick={() => setPrOpen(true)}>Pull request</Button></span>
              </Tooltip>
            ) : (
              <Tooltip title={`Abre GitHub para crear un pull request desde «${st.branch}». Añade una cuenta de GitHub en Cuentas para crearlo desde aquí.`}>
                <Button variant="contained" size={compact ? 'small' : 'medium'} startIcon={<MergeIcon />} endIcon={<WebIcon fontSize="small" />}
                  href={`${st.remote.web}/compare/${encodeURIComponent(st.branch)}?expand=1`} target="_blank" rel="noopener">Pull request</Button>
              </Tooltip>
            )
          ) : (
            <Tooltip title={st.remote?.provider === 'gitlab' ? 'Crear merge request (M)' : st.remote
              ? `El remoto (${st.remote.host}) no está en ninguna instancia de GitLab configurada; añádela en Cuentas para crear merge requests desde aquí`
              : 'El repositorio no tiene remoto origin'}>
              <span>
                <Button variant="contained" size={compact ? 'small' : 'medium'} startIcon={<MergeIcon />} onClick={openMR} disabled={st.remote?.provider !== 'gitlab'}>{compact ? 'MR' : 'Merge request'}</Button>
              </span>
            </Tooltip>
          )}
        </Stack>
        <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ xs: 'flex-start', sm: 'center' }} spacing={1} sx={{ mb: 1, ml: { xs: 0, sm: 6 } }}>
          <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'monospace', fontSize: { xs: 11.5, sm: 14 }, wordBreak: 'break-all', flexGrow: 1, minWidth: 0 }}>{st.path}</Typography>
          <RepoQuickActions repo={st} onChanged={load} onRemoved={() => navigate('/repos')} />
        </Stack>
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
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: '340px minmax(0, 1fr)' }, gap: 2, height: { md: '100%' } }}>
            <Stack spacing={2} sx={{ minHeight: 0, overflow: { md: 'auto' }, display: mobile && (conflictSel || commitSel || selected) ? 'none' : 'flex' }}>
              <CommitBox repoId={id} message={message} setMessage={setMessage} amend={amend} setAmend={setAmend} staged={staged.length} busy={busy}
                onCommit={commit} onStash={() => setStashOpen(true)} onUndo={() => undoCommit()} canStash={canStash} canUndo={!st.operation}
                notify={notify} inputRef={messageRef} />
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
            <Box sx={{ minWidth: 0, minHeight: 0, overflow: { md: 'auto' }, display: mobile && !(conflictSel || commitSel || selected) ? 'none' : 'block' }}>
              {mobile && (
                <Button size="small" startIcon={<ListIcon />} sx={{ mb: 1 }} onClick={() => { setSelected(null); setCommitSel(null); setConflictSel(null); }}>Volver a los cambios</Button>
              )}
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
        onCreated={(mr) => {
          setMrOpen(false); notify(`Merge request !${mr.iid} creado`);
          setInstance(project?.instance || 'main'); // el detalle del MR se consulta en la instancia del proyecto
          navigate(`/projects/${mr.project_id}/merge-requests/${mr.iid}`);
        }} />
      <CreatePRDialog open={prOpen} onClose={() => setPrOpen(false)} repoId={id} github={github}
        onCreated={(pr) => {
          setPrOpen(false); loadGithub();
          notify(`Pull request #${pr.number} creado`, 'success', { action: { label: 'Abrir en GitHub', onClick: () => window.open(pr.html_url, '_blank', 'noopener') } });
        }} />
    </Box>
  );
}
