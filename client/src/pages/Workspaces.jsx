import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Alert, Autocomplete, Box, Button, Checkbox, Chip, CircularProgress, Collapse, Dialog, DialogActions, DialogContent, DialogContentText,
  DialogTitle, Divider, FormControlLabel, IconButton, LinearProgress, Menu, MenuItem, Paper, Radio, RadioGroup, Select, Skeleton,
  Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import ExpandIcon from '@mui/icons-material/ExpandMore';
import UnfoldLessIcon from '@mui/icons-material/UnfoldLess';
import UnfoldMoreIcon from '@mui/icons-material/UnfoldMore';
import EditIcon from '@mui/icons-material/EditOutlined';
import UndoIcon from '@mui/icons-material/Undo';
import RefreshIcon from '@mui/icons-material/Refresh';
import DeleteIcon from '@mui/icons-material/DeleteOutline';
import CheckIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/ErrorOutline';
import WarningIcon from '@mui/icons-material/WarningAmber';
import SkipIcon from '@mui/icons-material/RemoveCircleOutline';
import CloudIcon from '@mui/icons-material/CloudOutlined';
import BranchIcon from '@mui/icons-material/CallSplit';
import WorkspacesIcon from '@mui/icons-material/Workspaces';
import FetchIcon from '@mui/icons-material/Sync';
import PullIcon from '@mui/icons-material/Download';
import PushIcon from '@mui/icons-material/Upload';
import DragIcon from '@mui/icons-material/DragIndicator';
import { api } from '../api/client.js';
import { useNotify } from '../components/Notify.jsx';
import { useCommands } from '../components/Commands.jsx';
import { getSwitchPrefs as prefs, setSwitchPrefs as savePrefs } from '../workspacePrefs.js';

// Última lista cargada: al volver a la página se muestra al instante mientras se actualiza.
let lastData = null;

// Grupos contraídos (se recuerdan en este navegador).
const COLLAPSED_KEY = 'gm-ws-collapsed';
const storedCollapsed = () => { try { return new Set(JSON.parse(localStorage.getItem(COLLAPSED_KEY) || '[]')); } catch { return new Set(); } };
const saveCollapsed = (set) => { try { localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...set])); } catch { /* sin almacenamiento */ } };

// Reordenar arrastrando (drag and drop del navegador) con vista previa en vivo: la lista se reordena
// mientras se arrastra y, al soltar, onCommit recibe los ids en el nuevo orden. Esc cancela.
// source(id) va en lo que se agarra y target(id) en cada elemento sobre el que se puede soltar.
function useDragOrder(items, onCommit, axis = 'y') {
  const [drag, setDrag] = useState(null); // { id, order, start }
  const dropped = useRef(false); // se soltó dentro de la lista (si no, p. ej. con Esc, se deshace)
  const order = drag ? drag.order : items.map((x) => x.id);
  const ordered = order.map((id) => items.find((x) => x.id === id)).filter(Boolean);
  const source = (id, image) => ({
    draggable: true,
    onDragStart: (e) => {
      e.stopPropagation();
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', id); } catch { /* algunos navegadores lo exigen */ }
      const el = image?.current;
      if (el) { const r = el.getBoundingClientRect(); e.dataTransfer.setDragImage(el, e.clientX - r.left, e.clientY - r.top); }
      const ids = items.map((x) => x.id);
      dropped.current = false;
      setDrag({ id, order: ids, start: ids });
    },
    onDragEnd: () => {
      const changed = drag && drag.order.join() !== drag.start.join();
      if (changed && dropped.current) onCommit(drag.order);
      setDrag(null);
    },
  });
  const target = (id) => ({
    onDragOver: (e) => {
      if (!drag) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (id === drag.id) return;
      const r = e.currentTarget.getBoundingClientRect();
      const after = axis === 'y' ? e.clientY > r.top + r.height / 2 : e.clientX > r.left + r.width / 2;
      const from = drag.order.indexOf(drag.id);
      const to = drag.order.indexOf(id);
      // Solo se mueve al pasar la mitad del otro elemento, para que no salte de un lado a otro.
      if ((from < to && !after) || (from > to && after)) return;
      const next = drag.order.filter((x) => x !== drag.id);
      next.splice(next.indexOf(id) + (after ? 1 : 0), 0, drag.id);
      setDrag({ ...drag, order: next });
    },
    onDrop: (e) => { if (drag) { e.preventDefault(); dropped.current = true; } },
  });
  // El contenedor también acepta soltar en los huecos entre elementos (si no, el navegador lo daría por cancelado).
  const area = {
    onDragOver: (e) => { if (drag) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; } },
    onDrop: (e) => { if (drag) { e.preventDefault(); dropped.current = true; } },
  };
  return { ordered, source, target, area, dragging: drag?.id };
}

// Estado de cada entorno respecto a las ramas actuales: activo (todo coincide) o con N repos distintos.
function envState(env, current) {
  const ids = Object.keys(env.branches);
  const diff = ids.filter((id) => current[id] !== env.branches[id]).length;
  return { diff, total: ids.length, active: ids.length > 0 && diff === 0 };
}

const BranchText = ({ name, muted }) => (name
  ? <Box component="span" sx={{ fontFamily: (t) => t.typography.fontFamilyCode, fontSize: 12.5, color: muted ? 'text.secondary' : 'text.primary' }}>{name}</Box>
  : <Typography component="span" variant="body2" color="text.disabled">—</Typography>);

// ---------- grupo: nombre y repositorios ----------
function GroupDialog({ open, group, repos, initialRepos, onClose, onSaved, onDelete }) {
  const [name, setName] = useState('');
  const [members, setMembers] = useState([]);
  const [busy, setBusy] = useState(false);
  const notify = useNotify();
  useEffect(() => {
    if (!open) return;
    setName(group?.name || '');
    setMembers((group?.repos || initialRepos || []).map((id) => repos.find((r) => r.id === id)).filter(Boolean));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    setBusy(true);
    try {
      const body = { name, repos: members.map((r) => r.id) };
      const g = group ? await api.put(`/workspaces/${group.id}`, body) : await api.post('/workspaces', body);
      onSaved(g, !group);
    } catch (e) { notify(e.message, 'error'); } finally { setBusy(false); }
  };

  return (
    <Dialog open={!!open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{group ? `Editar ${group.name}` : 'Nuevo grupo'}</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>
          Un grupo reúne los repositorios que forman una misma aplicación. Después le añades entornos de trabajo (Producción, QA, una funcionalidad…) con la rama de cada repositorio.
        </DialogContentText>
        <Stack spacing={2}>
          <TextField label="Nombre del grupo" autoFocus fullWidth value={name} onChange={(e) => setName(e.target.value)} placeholder="Portal Clientes" />
          {/* El buscador queda arriba y los elegidos se listan debajo (no dentro del campo). */}
          <Autocomplete multiple disableCloseOnSelect options={repos.filter((r) => !r.missing)} value={members} onChange={(e, v) => setMembers(v)}
            getOptionLabel={(r) => r.name} isOptionEqualToValue={(a, b) => a.id === b.id} renderTags={() => null}
            renderOption={(p, r, { selected }) => <li {...p} key={r.id}><Checkbox size="small" checked={selected} sx={{ mr: 1, p: 0.5 }} />{r.name}</li>}
            renderInput={(p) => <TextField {...p} label="Añadir repositorios" placeholder="Busca por nombre y elige" />} />
          <Box>
            <Typography variant="caption" color="text.secondary">
              {members.length ? `${members.length} ${members.length === 1 ? 'repositorio' : 'repositorios'} en el grupo` : 'Aún no hay repositorios en el grupo'}
            </Typography>
            {members.length > 0 && (
              <Paper variant="outlined" sx={{ mt: 0.5, maxHeight: 280, overflow: 'auto' }}>
                {members.map((r, i) => (
                  <Stack key={r.id} direction="row" alignItems="center" sx={{ pl: 1.5, pr: 0.5, py: 0.25, borderTop: i ? 1 : 0, borderColor: 'divider' }}>
                    <Typography variant="body2" sx={{ flexGrow: 1, minWidth: 0, wordBreak: 'break-word' }}>{r.name}</Typography>
                    <Tooltip title="Quitar del grupo">
                      <IconButton size="small" onClick={() => setMembers((m) => m.filter((x) => x.id !== r.id))}><CloseIcon fontSize="small" /></IconButton>
                    </Tooltip>
                  </Stack>
                ))}
              </Paper>
            )}
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        {group && <Button color="error" startIcon={<DeleteIcon />} onClick={onDelete} sx={{ mr: 'auto' }}>Eliminar grupo</Button>}
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="contained" onClick={save} disabled={busy || !name.trim() || !members.length}>{group ? 'Guardar' : 'Crear grupo'}</Button>
      </DialogActions>
    </Dialog>
  );
}

// ---------- entorno: rama de cada repositorio ----------
function EnvDialog({ open, group, env, seed, repoName, current, onClose, onSaved }) {
  const [name, setName] = useState('');
  const [branches, setBranches] = useState({});
  const [options, setOptions] = useState({});
  const [busy, setBusy] = useState(false);
  const notify = useNotify();

  useEffect(() => {
    if (!open || !group) return;
    setName(env?.name || seed?.name || '');
    setBranches({ ...(env?.branches || seed?.branches || {}) });
    setOptions({});
    // Ramas de cada repositorio (locales y de origin, sin repetir) para elegir.
    group.repos.forEach((id) => api.get(`/repos/${id}/branches`).then((list) => {
      const names = [...new Set(list.map((b) => (b.remote ? b.name.replace(/^origin\//, '') : b.name)).filter((n) => !n.includes('/HEAD')))];
      setOptions((o) => ({ ...o, [id]: names.sort((a, b) => a.localeCompare(b)) }));
    }).catch(() => setOptions((o) => ({ ...o, [id]: [] }))));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (id, b) => setBranches((x) => ({ ...x, [id]: (b || '').trim().replace(/^origin\//, '') }));
  const useCurrent = () => setBranches(Object.fromEntries(group.repos.map((id) => [id, current[id] && !current[id].startsWith('(') ? current[id] : ''])));

  const save = async (remove) => {
    setBusy(true);
    try {
      const clean = Object.fromEntries(Object.entries(branches).filter(([, b]) => b));
      const envs = remove
        ? group.envs.filter((e) => e.id !== env.id)
        : env ? group.envs.map((e) => (e.id === env.id ? { ...e, name, branches: clean } : e)) : [...group.envs, { name, branches: clean }];
      onSaved(await api.put(`/workspaces/${group.id}`, { envs }));
    } catch (e) { notify(e.message, 'error'); } finally { setBusy(false); }
  };

  return (
    <Dialog open={!!open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{env ? `Entorno ${env.name}` : `Nuevo entorno en ${group?.name}`}</DialogTitle>
      <DialogContent>
        <TextField label="Nombre del entorno" autoFocus={!env} fullWidth value={name} onChange={(e) => setName(e.target.value)} placeholder="Producción, QA, Feature pagos…" sx={{ mt: 1, mb: 2 }} />
        <Stack direction="row" alignItems="center" sx={{ mb: 1 }}>
          <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>Rama de cada repositorio</Typography>
          <Button size="small" onClick={useCurrent}>Usar ramas actuales</Button>
        </Stack>
        <Stack spacing={1.25}>
          {group?.repos.map((id) => (
            <Stack key={id} direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'center' }} spacing={{ xs: 0.5, sm: 1.5 }}>
              <Typography variant="body2" fontWeight={600} sx={{ width: { sm: 300 }, flexShrink: 0, wordBreak: 'break-word' }}>{repoName(id)}</Typography>
              <Autocomplete freeSolo fullWidth size="small" options={options[id] || []} loading={!options[id]} value={branches[id] || ''}
                onChange={(e, v) => set(id, v)} onInputChange={(e, v, reason) => reason === 'input' && set(id, v)}
                renderInput={(p) => <TextField {...p} placeholder="No cambiar" InputProps={{ ...p.InputProps, sx: { fontFamily: (t) => t.typography.fontFamilyCode, fontSize: 13 } }} />} />
            </Stack>
          ))}
        </Stack>
        <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1.5 }}>
          Deja vacío un repositorio para no cambiarlo al activar este entorno (se queda en la rama que tenga).
        </Typography>
      </DialogContent>
      <DialogActions>
        {env && <Button color="error" startIcon={<DeleteIcon />} disabled={busy} onClick={() => save(true)} sx={{ mr: 'auto' }}>Eliminar entorno</Button>}
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="contained" onClick={() => save(false)} disabled={busy || !name.trim()}>{env ? 'Guardar' : 'Crear entorno'}</Button>
      </DialogActions>
    </Dialog>
  );
}

// ---------- cambio de entorno: vista previa → resultado ----------
const STATES = {
  same: { label: 'Ya está en la rama', color: 'success' },
  ready: { label: 'Lista', color: 'primary' },
  remote: { label: 'Solo en origin', color: 'info', icon: <CloudIcon /> },
  missing: { label: 'No existe', color: 'error' },
  keep: { label: 'No cambia', color: 'default' },
  error: { label: 'Error', color: 'error' },
};
const RESULTS = {
  ok: { icon: <CheckIcon color="success" fontSize="small" />, label: 'Hecho' },
  unchanged: { icon: <CheckIcon color="success" fontSize="small" />, label: 'Sin cambios' },
  warning: { icon: <WarningIcon color="warning" fontSize="small" />, label: 'Hecho con avisos' },
  skipped: { icon: <SkipIcon color="action" fontSize="small" />, label: 'Omitido' },
  failed: { icon: <ErrorIcon color="error" fontSize="small" />, label: 'Error' },
  kept: { icon: <SkipIcon color="disabled" fontSize="small" />, label: 'No cambia' },
};

// Resultado por repositorio de un cambio de entorno o de una acción en lote.
function ResultsList({ results }) {
  return (
    <Stack divider={<Divider />} sx={{ border: 1, borderColor: 'divider', borderRadius: 1 }}>
      {results.map((x) => {
        const rs = RESULTS[x.status] || RESULTS.failed;
        return (
          <Stack key={x.repoId} direction="row" spacing={1.5} sx={{ p: 1.5, opacity: x.status === 'kept' ? 0.6 : 1 }}>
            <Box sx={{ pt: 0.25 }}>{rs.icon}</Box>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                <Typography variant="body2" fontWeight={600}>{x.name}</Typography>
                {x.target && <><BranchIcon sx={{ fontSize: 16, color: 'text.secondary' }} /><BranchText name={x.target} /></>}
                <Typography variant="caption" color="text.secondary">· {rs.label}</Typography>
              </Stack>
              {(x.steps || []).map((t) => <Typography key={t} variant="caption" color="text.secondary" component="div">{t}</Typography>)}
              {(x.warnings || []).map((t) => <Typography key={t} variant="caption" color="warning.main" component="div">{t}</Typography>)}
              {x.error && <Typography variant="caption" color="error" component="div">{x.error}</Typography>}
            </Box>
          </Stack>
        );
      })}
    </Stack>
  );
}

// ---------- fetch / pull / push de todo el grupo ----------
const OPS = {
  fetch: { label: 'Fetch', Icon: FetchIcon, title: 'Buscar novedades en origin en todos los repositorios' },
  pull: { label: 'Pull', Icon: PullIcon, title: 'Actualizar todos los repositorios (solo avance rápido: nunca crea un merge)' },
  push: { label: 'Push', Icon: PushIcon, title: 'Subir los commits pendientes de todos los repositorios (solo ramas ya publicadas)' },
};

function RunDialog({ target, onClose, onDone }) {
  const { group, op } = target || {};
  const [results, setResults] = useState(null);
  const notify = useNotify();
  useEffect(() => {
    if (!target) return;
    setResults(null);
    api.post(`/workspaces/${group.id}/run`, { op }).then((d) => {
      setResults(d.results);
      const failed = d.results.filter((x) => x.status === 'failed').length;
      notify(failed ? `${OPS[op].label} en ${group.name}: ${failed} con errores` : `${OPS[op].label} completado en ${group.name}`, failed ? 'error' : 'success');
      onDone();
    }).catch((e) => { notify(e.message, 'error'); onClose(); });
  }, [target]); // eslint-disable-line react-hooks/exhaustive-deps
  const Icon = op && OPS[op].Icon;
  return (
    <Dialog open={!!target} onClose={results ? onClose : undefined} fullWidth maxWidth="sm">
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>{Icon && <Icon color="primary" />}{op && `${OPS[op].label} · ${group.name}`}</DialogTitle>
      <DialogContent>
        {!results ? (
          <Stack alignItems="center" spacing={1.5} sx={{ py: 3 }}>
            <CircularProgress size={28} />
            <Typography variant="body2" color="text.secondary">{op && OPS[op].label} en {group?.repos.length} repositorios…</Typography>
          </Stack>
        ) : <ResultsList results={results} />}
      </DialogContent>
      <DialogActions><Button variant="contained" disabled={!results} onClick={onClose}>Cerrar</Button></DialogActions>
    </Dialog>
  );
}

function SwitchDialog({ target, onClose, onDone }) {
  const { group, env, restore } = target || {};
  const [opts, setOpts] = useState(prefs);
  const [items, setItems] = useState(null);
  const [loading, setLoading] = useState(false);
  const [overrides, setOverrides] = useState({});
  const [saveOverrides, setSaveOverrides] = useState(true);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState(null);
  const [options, setOptions] = useState({});
  const notify = useNotify();
  const setOpt = (k, v) => setOpts((o) => { const n = { ...o, [k]: v }; savePrefs(n); return n; });

  const body = useCallback((extra) => ({ ...(restore ? { restore: true } : { envId: env.id }), ...extra }), [restore, env]);
  const preview = useCallback((fetch) => {
    setLoading(true);
    api.post(`/workspaces/${group.id}/preview`, body({ fetch }))
      .then((d) => setItems(d.items)).catch((e) => notify(e.message, 'error')).finally(() => setLoading(false));
  }, [group, body, notify]);

  useEffect(() => {
    if (!target) return;
    setItems(null); setResults(null); setOverrides({}); setSaveOverrides(true);
    preview(prefs().fetch);
  }, [target]); // eslint-disable-line react-hooks/exhaustive-deps

  // Para las ramas que no existen se ofrece elegir otra de ese repositorio.
  const missing = (items || []).filter((x) => x.state === 'missing');
  useEffect(() => {
    missing.forEach((x) => options[x.repoId] || api.get(`/repos/${x.repoId}/branches`).then((list) => {
      setOptions((o) => ({ ...o, [x.repoId]: [...new Set(list.map((b) => b.name.replace(/^origin\//, '')).filter((n) => !n.includes('HEAD')))].sort() }));
    }).catch(() => {}));
  }, [items]); // eslint-disable-line react-hooks/exhaustive-deps

  const changing = (items || []).filter((x) => ['ready', 'remote'].includes(x.state) || (x.state === 'missing' && overrides[x.repoId]));
  const dirty = changing.filter((x) => x.changes > 0);
  const blocked = (items || []).some((x) => x.state === 'missing' && overrides[x.repoId] == null);
  const picked = Object.values(overrides).some(Boolean);

  const run = async () => {
    setRunning(true);
    try {
      const branches = Object.fromEntries(missing.map((x) => [x.repoId, overrides[x.repoId] || null]));
      const d = await api.post(`/workspaces/${group.id}/switch`, body({ dirty: opts.dirty, pull: opts.pull, branches, saveOverrides: picked && saveOverrides }));
      setResults(d.results);
      onDone(d.group);
      const failed = d.results.filter((x) => x.status === 'failed').length;
      if (!failed) notify(restore ? `${group.name}: ramas restauradas` : `${group.name} → ${env.name}`, 'success');
    } catch (e) { notify(e.message, 'error'); } finally { setRunning(false); }
  };

  const title = restore ? `Volver al estado anterior · ${group?.name}` : `${group?.name} → ${env?.name}`;
  return (
    <Dialog open={!!target} onClose={running ? undefined : onClose} fullWidth maxWidth="md">
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><WorkspacesIcon color="primary" />{title}</DialogTitle>
      <DialogContent>
        <Box sx={{ height: 4, mb: 1 }}>{(loading || running) && <LinearProgress />}</Box>
        {!results ? (
          <>
            <Paper variant="outlined" sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead><TableRow><TableCell>Repositorio</TableCell><TableCell>Rama actual</TableCell><TableCell>Cambia a</TableCell><TableCell>Estado</TableCell></TableRow></TableHead>
                <TableBody>
                  {!items && group?.repos.map((id) => (
                    <TableRow key={id}>{[30, 25, 25, 15].map((w, i) => <TableCell key={i}><Skeleton width={`${w + 40}%`} /></TableCell>)}</TableRow>
                  ))}
                  {items?.map((x) => {
                    const st = STATES[x.state];
                    return (
                      <TableRow key={x.repoId} sx={{ opacity: x.state === 'keep' ? 0.6 : 1 }}>
                        <TableCell sx={{ fontWeight: 600 }}>{x.name}</TableCell>
                        <TableCell><BranchText name={x.current} muted /></TableCell>
                        <TableCell sx={{ minWidth: 200 }}>
                          {x.state === 'missing' ? (
                            <Autocomplete size="small" options={['', ...(options[x.repoId] || [])]} value={overrides[x.repoId] ?? null}
                              getOptionLabel={(o) => (o === '' ? 'Omitir este repositorio' : o)} onChange={(e, v) => setOverrides((o) => ({ ...o, [x.repoId]: v }))}
                              renderInput={(p) => <TextField {...p} placeholder={`${x.target} no existe: elige otra`} />} />
                          ) : <BranchText name={x.target} />}
                        </TableCell>
                        <TableCell>
                          <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap" useFlexGap>
                            <Chip size="small" variant="outlined" color={st.color} icon={st.icon} label={st.label} />
                            {x.changes > 0 && x.state !== 'keep' && <Chip size="small" variant="outlined" color="warning" label={`${x.changes} sin commit`} />}
                            {x.fetchError && <Tooltip title={x.fetchError}><Chip size="small" variant="outlined" label="Fetch falló" /></Tooltip>}
                          </Stack>
                          {x.error && <Typography variant="caption" color="error" component="div">{x.error}</Typography>}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Paper>
            <Stack spacing={0.5} sx={{ mt: 2 }}>
              <FormControlLabel control={<Checkbox size="small" checked={opts.fetch} onChange={(e) => { setOpt('fetch', e.target.checked); if (e.target.checked) preview(true); }} />}
                label="Buscar novedades en origin antes (fetch)" />
              <FormControlLabel control={<Checkbox size="small" checked={opts.pull} onChange={(e) => setOpt('pull', e.target.checked)} />}
                label="Actualizar cada rama después de cambiar (pull sin merge: solo avance rápido)" />
              {picked && !restore && (
                <FormControlLabel control={<Checkbox size="small" checked={saveOverrides} onChange={(e) => setSaveOverrides(e.target.checked)} />}
                  label={`Guardar las ramas elegidas en el entorno ${env.name}`} />
              )}
            </Stack>
            {dirty.length > 0 && (
              <Alert severity="warning" sx={{ mt: 1.5 }}>
                <Typography variant="body2" sx={{ mb: 0.5 }}>
                  {dirty.length === 1 ? `${dirty[0].name} tiene cambios sin commit.` : `${dirty.length} repositorios tienen cambios sin commit (${dirty.map((x) => x.name).join(', ')}).`} ¿Qué hago con ellos?
                </Typography>
                <RadioGroup value={opts.dirty} onChange={(e) => setOpt('dirty', e.target.value)}>
                  <FormControlLabel value="stash" control={<Radio size="small" />} label="Guardarlos y recuperarlos al volver a su rama (recomendado)" />
                  <FormControlLabel value="skip" control={<Radio size="small" />} label="No cambiar esos repositorios" />
                  <FormControlLabel value="carry" control={<Radio size="small" />} label="Llevarlos a la nueva rama (falla si chocan)" />
                </RadioGroup>
              </Alert>
            )}
          </>
        ) : (
          <ResultsList results={results} />
        )}
      </DialogContent>
      <DialogActions>
        {results ? <Button variant="contained" onClick={onClose}>Cerrar</Button> : (
          <>
            <Button onClick={onClose} disabled={running}>Cancelar</Button>
            <Button variant="contained" onClick={run} disabled={!items || loading || running || blocked}
              startIcon={running ? <CircularProgress size={16} color="inherit" /> : <WorkspacesIcon />}>
              {restore ? 'Restaurar ramas' : 'Cambiar entorno'}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}

// ---------- tarjeta de un grupo ----------
function GroupCard({ group, current, state = {}, repoName, onOpenRepo, onRun, open, onToggle, onEditGroup, onEditEnv, onNewEnv, onSwitch, onRestore, onReorderEnvs, cardRef, handle, dropTarget, dragging, onMove }) {
  const [newMenu, setNewMenu] = useState(null);
  const envDrag = useDragOrder(group.envs, (ids) => onReorderEnvs(ids.map((id) => group.envs.find((e) => e.id === id))), 'x');
  const states = group.envs.map((e) => envState(e, current));
  // Si varios entornos coinciden con las ramas actuales, se marca el último usado.
  const activeIdx = (() => {
    const matches = states.map((s, i) => (s.active ? i : -1)).filter((i) => i >= 0);
    return matches.find((i) => group.envs[i].id === group.lastEnv) ?? matches[0] ?? -1;
  })();
  const last = group.envs.findIndex((e) => e.id === group.lastEnv);
  const partial = activeIdx < 0 && last >= 0 ? { env: group.envs[last], diff: states[last].diff } : null;
  // Entorno que muestra la tabla: el elegido en su cabecera, o el activo, o el último usado, o el primero.
  const [viewId, setViewId] = useState(null);
  const fallbackIdx = activeIdx >= 0 ? activeIdx : last >= 0 ? last : 0;
  const picked = group.envs.findIndex((e) => e.id === viewId);
  const viewedIdx = picked >= 0 ? picked : fallbackIdx;
  const viewed = group.envs[viewedIdx];
  // Al cambiar de entorno la tabla vuelve a mostrar el activo.
  useEffect(() => { setViewId(null); }, [group.lastEnv]);

  // Estado del grupo de un vistazo (cambios sin commit, commits por subir o bajar) y ramas de entornos que ya no existen.
  const st = (id) => state[id] || {};
  const count = (fn) => group.repos.filter((id) => fn(st(id))).length;
  const summary = [
    { key: 'changes', n: count((x) => x.changes > 0), text: 'con cambios', color: 'warning' },
    { key: 'ahead', n: count((x) => x.ahead > 0), text: 'por subir', color: 'info' },
    { key: 'behind', n: count((x) => x.behind > 0), text: 'por bajar', color: 'info' },
    { key: 'error', n: count((x) => x.missing || x.error), text: 'con error', color: 'error' },
  ].filter((x) => x.n);
  const known = group.repos.some((id) => state[id]);
  const gone = (env, id) => { const b = env.branches[id]; const list = st(id).branches; return !!(b && list && !list.includes(b)); };
  const missingIn = (env) => group.repos.filter((id) => gone(env, id));

  return (
    <Paper ref={cardRef} variant="outlined" {...dropTarget}
      sx={{ p: { xs: 1, sm: 1.25 }, pl: { xs: 0.5, sm: 0.75 }, transition: 'opacity .15s', '&:hover .gm-actions, &:focus-within .gm-actions': { opacity: 1 }, ...(dragging && { opacity: 0.45, borderStyle: 'dashed', borderColor: 'primary.main' }) }}>
      {/* Una sola fila: nombre y estado a la izquierda, entornos en el centro y acciones a la derecha
          (en pantallas estrechas los entornos bajan a su propia línea). */}
      <Stack direction="row" alignItems="center" flexWrap="wrap" useFlexGap sx={{ columnGap: 0.75, rowGap: 1 }}>
        {/* Asa para arrastrar el grupo (o moverlo con las flechas arriba y abajo cuando tiene el foco). */}
        <Tooltip title="Arrastra para ordenar (o usa ↑ ↓)">
          <Box {...handle} tabIndex={0} role="button" aria-label={`Mover el grupo ${group.name}`}
            onKeyDown={(e) => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); onMove(e.key === 'ArrowUp' ? -1 : 1); } }}
            sx={{ display: 'grid', placeItems: 'center', alignSelf: 'stretch', px: 0.25, mr: -0.5, borderRadius: 1, cursor: 'grab', color: 'text.disabled', '&:hover, &:focus-visible': { color: 'text.secondary', bgcolor: 'action.hover', outline: 'none' }, '&:active': { cursor: 'grabbing' } }}>
            <DragIcon fontSize="small" />
          </Box>
        </Tooltip>
        <Tooltip title={open ? 'Contraer' : 'Expandir'}>
          <IconButton size="small" onClick={onToggle} aria-expanded={open} aria-label={open ? 'Contraer grupo' : 'Expandir grupo'}>
            <ExpandIcon sx={{ transition: 'transform .2s', transform: open ? 'none' : 'rotate(-90deg)' }} />
          </IconButton>
        </Tooltip>
        <Box sx={{ minWidth: 0, maxWidth: { md: 340 }, flexShrink: 1, cursor: 'pointer', pr: 0.5 }} onClick={onToggle}>
          {/* Nombre del grupo y, a su derecha, el estado de un vistazo. El entorno activo se ve en su botón (relleno). */}
          <Stack direction="row" alignItems="center" spacing={1} sx={{ minWidth: 0 }}>
            <Typography variant="h6" noWrap sx={{ minWidth: 0, fontSize: '1.05rem', lineHeight: 1.3 }}>{group.name}</Typography>
            {known && (summary.length
              ? summary.map((x) => <Chip key={x.key} size="small" variant="outlined" color={x.color} label={`${x.n} ${x.text}`} sx={{ height: 20, fontSize: 11.5, flexShrink: 0 }} />)
              : <Chip size="small" variant="outlined" color="success" icon={<CheckIcon />} label="Al día" sx={{ height: 20, fontSize: 11.5, flexShrink: 0 }} />)}
          </Stack>
          <Typography variant="caption" color="text.secondary" noWrap component="div">
            {group.repos.length} {group.repos.length === 1 ? 'repositorio' : 'repositorios'}
            {partial && <> · {partial.env.name} parcial: {partial.diff} {partial.diff === 1 ? 'repo en otra rama' : 'repos en otra rama'}</>}
          </Typography>
        </Box>

        <Stack {...envDrag.area} direction="row" alignItems="center" flexWrap="wrap" useFlexGap
          sx={{ gap: 0.75, flexGrow: 1, flexBasis: { xs: '100%', md: 0 }, minWidth: 0, order: { xs: 5, md: 0 }, pl: { xs: 1, md: 1.5 }, ml: { md: 0.5 }, borderLeft: { md: 1 }, borderColor: { md: 'divider' } }}>
          {envDrag.ordered.map((e) => {
            const i = group.envs.indexOf(e);
            const on = i === activeIdx;
            const lost = missingIn(e);
            const tip = lost.length
              ? <>Ramas que ya no existen (ni en local ni en origin):{lost.map((id) => <div key={id}>· {repoName(id)}: {e.branches[id]}</div>)}</>
              : on ? 'Entorno activo' : `Cambiar a ${e.name}`;
            return (
              <Tooltip key={e.id} title={envDrag.dragging ? '' : tip}>
                <Chip {...envDrag.source(e.id)} {...envDrag.target(e.id)} size="small" clickable color={on ? 'primary' : lost.length ? 'warning' : 'default'} variant={on ? 'filled' : 'outlined'} icon={on ? <CheckIcon /> : lost.length ? <WarningIcon /> : undefined}
                  label={e.name} onClick={() => onSwitch(e)} onDelete={() => onEditEnv(e)} deleteIcon={<EditIcon titleAccess="Editar entorno" />}
                  sx={{ height: 28, px: 0.25, fontWeight: 600, '& .MuiChip-deleteIcon': { fontSize: 15, opacity: 0.7 }, ...(partial?.env.id === e.id && { borderStyle: 'dashed', borderColor: 'primary.main' }), ...(envDrag.dragging === e.id && { opacity: 0.45 }) }} />
              </Tooltip>
            );
          })}
          <Tooltip title="Nuevo entorno">
            <Chip size="small" clickable variant="outlined" icon={<AddIcon />} label="Entorno" onClick={(ev) => setNewMenu(ev.currentTarget)}
              sx={{ height: 28, borderStyle: 'dashed', color: 'text.secondary', bgcolor: 'transparent' }} />
          </Tooltip>
          <Menu anchorEl={newMenu} open={!!newMenu} onClose={() => setNewMenu(null)}>
            <MenuItem onClick={() => { setNewMenu(null); onNewEnv({ branches: Object.fromEntries(group.repos.map((id) => [id, current[id] && !current[id].startsWith('(') ? current[id] : ''])) }); }}>
              Con las ramas actuales
            </MenuItem>
            <MenuItem onClick={() => { setNewMenu(null); onNewEnv({}); }}>Vacío</MenuItem>
            {group.envs.length > 0 && <Divider />}
            {group.envs.map((e) => <MenuItem key={e.id} onClick={() => { setNewMenu(null); onNewEnv({ name: `${e.name} (copia)`, branches: e.branches }); }}>Duplicar {e.name}</MenuItem>)}
          </Menu>
        </Stack>

        {/* Acciones del grupo: discretas hasta pasar el ratón por la tarjeta. */}
        <Stack className="gm-actions" direction="row" alignItems="center" sx={{ ml: 'auto', opacity: { xs: 1, md: 0.55 }, transition: 'opacity .15s' }}>
          {group.previous && (
            <Tooltip title="Volver al estado anterior: pone cada repositorio en la rama que tenía antes del último cambio de entorno">
              <IconButton size="small" color="primary" onClick={onRestore} aria-label="Volver al estado anterior"><UndoIcon fontSize="small" /></IconButton>
            </Tooltip>
          )}
          {Object.entries(OPS).map(([op, o]) => (
            <Tooltip key={op} title={o.title}><IconButton size="small" onClick={() => onRun(op)} aria-label={`${o.label} del grupo`}><o.Icon fontSize="small" /></IconButton></Tooltip>
          ))}
          <Tooltip title="Editar grupo"><IconButton size="small" onClick={onEditGroup} aria-label="Editar grupo"><EditIcon fontSize="small" /></IconButton></Tooltip>
        </Stack>
      </Stack>

      {/* Tabla de 3 columnas: repositorio, rama actual y el entorno activo (o el que se elija en la cabecera para consultarlo).
          Así no crece a lo ancho aunque haya muchos entornos; las ramas que no coinciden se resaltan. */}
      <Collapse in={open} unmountOnExit>
      <Box sx={{ ml: 1, mt: 1.25, overflowX: 'auto', border: 1, borderColor: 'divider', borderRadius: 1 }}>
        <Table size="small" sx={{ tableLayout: 'fixed', minWidth: 560, '& td, & th': { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: '30%' }}>Repositorio</TableCell>
              <TableCell sx={{ width: '35%' }}>Rama actual</TableCell>
              <TableCell sx={(t) => ({ width: '35%', fontWeight: 700, bgcolor: alpha(t.palette.primary.main, 0.06), color: viewedIdx === activeIdx ? 'primary.main' : 'text.primary' })}>
                {!viewed ? 'Entorno' : group.envs.length === 1 ? viewed.name : (
                  <Select variant="standard" disableUnderline size="small" value={viewed.id} onChange={(e) => setViewId(e.target.value)}
                    sx={{ fontSize: 'inherit', fontWeight: 'inherit', color: 'inherit', '& .MuiSelect-select': { py: 0 } }}
                    renderValue={(v) => { const i = group.envs.findIndex((e) => e.id === v); return `${group.envs[i]?.name}${i === activeIdx ? ' (activo)' : ''}`; }}>
                    {group.envs.map((e, i) => <MenuItem key={e.id} value={e.id}>{e.name}{i === activeIdx ? ' (activo)' : ''}</MenuItem>)}
                  </Select>
                )}
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {group.repos.map((id) => {
              const b = viewed?.branches[id];
              const off = b && current[id] !== b;
              const lost = viewed && gone(viewed, id);
              return (
                // Un clic en la fila abre el detalle del repositorio.
                <TableRow key={id} hover onClick={() => onOpenRepo(id)}
                  sx={{ cursor: 'pointer', '&:hover .repo-name': { color: 'primary.main', textDecoration: 'underline' } }}>
                  <TableCell className="repo-name" sx={{ fontWeight: 600 }} title={`Abrir ${repoName(id)}`}>{repoName(id)}</TableCell>
                  <TableCell title={current[id] || ''}>
                    <Stack direction="row" spacing={0.75} alignItems="center" sx={{ minWidth: 0 }}>
                      <Box sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}><BranchText name={current[id]} /></Box>
                      {st(id).changes > 0 && <Box component="span" title={`${st(id).changes} cambio(s) sin commit`} sx={{ color: 'warning.main', fontSize: 12, flexShrink: 0 }}>●{st(id).changes}</Box>}
                      {st(id).ahead > 0 && <Box component="span" title={`${st(id).ahead} commit(s) por subir`} sx={{ color: 'info.main', fontSize: 12, flexShrink: 0 }}>↑{st(id).ahead}</Box>}
                      {st(id).behind > 0 && <Box component="span" title={`${st(id).behind} commit(s) por bajar`} sx={{ color: 'info.main', fontSize: 12, flexShrink: 0 }}>↓{st(id).behind}</Box>}
                    </Stack>
                  </TableCell>
                  <TableCell sx={(t) => ({ bgcolor: alpha(t.palette.primary.main, 0.06) })}
                    title={!b ? 'Este entorno no cambia este repositorio' : lost ? `La rama ${b} ya no existe en local ni en origin` : off ? `Está en ${current[id] || '?'}; este entorno usa ${b}` : b}>
                    {!b ? <Typography component="span" variant="body2" color="text.disabled">— no cambia</Typography> : (
                      <Stack direction="row" spacing={0.5} alignItems="center" sx={{ minWidth: 0 }}>
                        {(off || lost) && <WarningIcon color={lost ? 'error' : 'warning'} sx={{ fontSize: 16, flexShrink: 0 }} />}
                        <Box component="span" sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: (t) => t.typography.fontFamilyCode, fontSize: 12.5, color: lost ? 'error.main' : off ? 'warning.main' : 'text.primary', textDecoration: lost ? 'line-through' : 'none' }}>{b}</Box>
                        {lost && <Typography component="span" variant="caption" color="error" sx={{ flexShrink: 0 }}>no existe</Typography>}
                      </Stack>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Box>
      </Collapse>
    </Paper>
  );
}

export default function Workspaces() {
  const [data, setDataState] = useState(lastData);
  const setData = (d) => setDataState((lastData = d));
  const [loading, setLoading] = useState(false);
  const [groupDlg, setGroupDlg] = useState(null); // { group? , repos? }
  const [envDlg, setEnvDlg] = useState(null); // { group, env?, seed? }
  const [switchTo, setSwitchTo] = useState(null); // { group, env?, restore? }
  const [running, setRunning] = useState(null); // { group, op }
  const [toDelete, setToDelete] = useState(null);
  const [collapsed, setCollapsedState] = useState(storedCollapsed);
  const setCollapsed = (fn) => setCollapsedState((c) => { const n = fn(c); saveCollapsed(n); return n; });
  const toggle = (id) => setCollapsed((c) => { const n = new Set(c); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const [params, setParams] = useSearchParams();
  const notify = useNotify();
  const navigate = useNavigate();

  const load = useCallback(() => {
    setLoading(true);
    return api.get('/workspaces').then((d) => { setData(d); return d; }).catch((e) => notify(e.message, 'error')).finally(() => setLoading(false));
  }, [notify]);
  useEffect(() => { load(); }, [load]);

  // Enlaces desde otras pantallas: ?new=id1,id2 (crear grupo con esos repos) y ?switch=grupo:entorno (paleta de comandos).
  useEffect(() => {
    if (!data) return;
    const nu = params.get('new');
    const sw = params.get('switch');
    if (nu) setGroupDlg({ repos: nu.split(',') });
    if (sw) {
      const [gid, eid] = sw.split(':');
      const group = data.groups.find((g) => g.id === gid);
      const env = group?.envs.find((e) => e.id === eid);
      if (env) setSwitchTo({ group, env });
    }
    if (nu || sw) setParams({}, { replace: true });
  }, [data, params]); // eslint-disable-line react-hooks/exhaustive-deps

  const repoName = useMemo(() => {
    const m = new Map((data?.repos || []).map((r) => [r.id, r.name]));
    return (id) => m.get(id) || '(quitado)';
  }, [data]);
  // El servidor devuelve los grupos en el orden guardado (por nombre hasta que se reordenen).
  const groups = data?.groups || [];
  const openRepo = (id) => {
    if (data?.repos.find((r) => r.id === id)?.missing) notify('La carpeta de este repositorio ya no existe', 'warning');
    else navigate(`/repos/${id}`, { state: { from: '/workspaces' } });
  };
  // Reemplaza el grupo en su sitio; uno nuevo va al final.
  const replaceGroup = (g) => {
    const d = lastData || data;
    setData({ ...d, groups: d.groups.some((x) => x.id === g.id) ? d.groups.map((x) => (x.id === g.id ? g : x)) : [...d.groups, g] });
  };
  const saveOrder = (ids) => {
    const prev = lastData;
    setData({ ...prev, groups: ids.map((id) => prev.groups.find((g) => g.id === id)) });
    api.post('/workspaces/order', { ids }).catch((e) => { setData(prev); notify(e.message, 'error'); });
  };
  const groupDrag = useDragOrder(groups, saveOrder);
  const cardRefs = useRef({});
  const moveGroup = (id, delta) => {
    const ids = groups.map((g) => g.id);
    const i = ids.indexOf(id);
    const j = i + delta;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    saveOrder(ids);
    // Mantiene el foco en el asa del grupo movido, para seguir moviéndolo con las flechas.
    setTimeout(() => cardRefs.current[id]?.querySelector('[role="button"][tabindex="0"]')?.focus(), 0);
  };
  const saveEnvOrder = (g, envs) => {
    replaceGroup({ ...g, envs });
    api.put(`/workspaces/${g.id}`, { envs }).then(replaceGroup).catch((e) => { replaceGroup(g); notify(e.message, 'error'); });
  };

  useCommands('workspaces', () => [
    { id: 'ws:new', group: 'Entornos de trabajo', title: 'Nuevo grupo', run: () => setGroupDlg({}) },
    { id: 'ws:refresh', group: 'Entornos de trabajo', title: 'Actualizar', keys: 'r', run: load },
    { id: 'ws:collapse', group: 'Entornos de trabajo', title: 'Contraer todos los grupos', run: () => setCollapsed(() => new Set((lastData?.groups || []).map((g) => g.id))) },
    { id: 'ws:expand', group: 'Entornos de trabajo', title: 'Expandir todos los grupos', run: () => setCollapsed(() => new Set()) },
  ], [load]);

  const remove = async () => {
    try {
      await api.del(`/workspaces/${toDelete.id}`);
      setData({ ...data, groups: data.groups.filter((g) => g.id !== toDelete.id) });
      notify(`Grupo ${toDelete.name} eliminado`);
    } catch (e) { notify(e.message, 'error'); }
    setToDelete(null); setGroupDlg(null);
  };

  return (
    <Box>
      <Stack direction="row" alignItems="center" flexWrap="wrap" useFlexGap sx={{ gap: 1, mb: 2 }}>
        <Typography variant="h5" sx={{ flexGrow: 1 }}>Entornos de trabajo</Typography>
        {groups.length > 1 && (() => {
          const allCollapsed = groups.every((g) => collapsed.has(g.id));
          return (
            <Tooltip title={allCollapsed ? 'Expandir todos' : 'Contraer todos'}>
              <IconButton onClick={() => setCollapsed(() => (allCollapsed ? new Set() : new Set(groups.map((g) => g.id))))}>
                {allCollapsed ? <UnfoldMoreIcon /> : <UnfoldLessIcon />}
              </IconButton>
            </Tooltip>
          );
        })()}
        <Tooltip title="Actualizar"><IconButton onClick={load}><RefreshIcon /></IconButton></Tooltip>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setGroupDlg({})}>Nuevo grupo</Button>
      </Stack>
      <Box sx={{ height: 4, mb: 1 }}>{loading && data && <LinearProgress />}</Box>

      {!data && <Stack spacing={2}>{[0, 1].map((i) => <Skeleton key={i} variant="rounded" height={180} />)}</Stack>}
      {data && groups.length === 0 && (
        <Alert severity="info" action={<Button color="inherit" size="small" onClick={() => setGroupDlg({})}>Crear grupo</Button>}>
          Agrupa los repositorios que forman una misma aplicación y guarda sus ramas en entornos de trabajo (Producción, QA, una funcionalidad…).
          Luego cambias todos los repositorios de rama con un clic. También puedes crear un grupo desde <b>Repositorios locales</b> seleccionando varios.
        </Alert>
      )}
      <Stack spacing={1.5} {...groupDrag.area}>
        {groupDrag.ordered.map((g) => (
          <GroupCard key={g.id} group={g}
            cardRef={(el) => { cardRefs.current[g.id] = el; }} handle={groupDrag.source(g.id, { get current() { return cardRefs.current[g.id]; } })}
            dropTarget={groupDrag.target(g.id)} dragging={groupDrag.dragging === g.id} onMove={(d) => moveGroup(g.id, d)}
            onReorderEnvs={(envs) => saveEnvOrder(g, envs)} current={data.current} state={data.state} repoName={repoName} onOpenRepo={openRepo} onRun={(op) => setRunning({ group: g, op })} open={!collapsed.has(g.id)} onToggle={() => toggle(g.id)}
            onEditGroup={() => setGroupDlg({ group: g })}
            onEditEnv={(env) => setEnvDlg({ group: g, env })}
            onNewEnv={(seed) => setEnvDlg({ group: g, seed })}
            onSwitch={(env) => setSwitchTo({ group: g, env })}
            onRestore={() => setSwitchTo({ group: g, restore: true })} />
        ))}
      </Stack>

      <GroupDialog open={!!groupDlg} group={groupDlg?.group} initialRepos={groupDlg?.repos} repos={data?.repos || []}
        onClose={() => setGroupDlg(null)} onDelete={() => setToDelete(groupDlg.group)}
        onSaved={(g, created) => {
          replaceGroup(g); setGroupDlg(null);
          // Un grupo nuevo empieza con un entorno con las ramas actuales, listo para nombrarlo.
          if (created) setEnvDlg({ group: g, seed: { branches: Object.fromEntries(g.repos.map((id) => [id, data.current[id] && !data.current[id].startsWith('(') ? data.current[id] : ''])) } });
        }} />
      <EnvDialog open={!!envDlg} group={envDlg?.group} env={envDlg?.env} seed={envDlg?.seed} repoName={repoName} current={data?.current || {}}
        onClose={() => setEnvDlg(null)} onSaved={(g) => { replaceGroup(g); setEnvDlg(null); }} />
      <RunDialog target={running} onClose={() => setRunning(null)} onDone={load} />
      <SwitchDialog target={switchTo} onClose={() => { setSwitchTo(null); load(); }} onDone={(g) => replaceGroup(g)} />

      <Dialog open={!!toDelete} onClose={() => setToDelete(null)}>
        <DialogTitle>¿Eliminar el grupo {toDelete?.name}?</DialogTitle>
        <DialogContent><DialogContentText>Se borran el grupo y sus entornos. Los repositorios y sus ramas no se tocan.</DialogContentText></DialogContent>
        <DialogActions>
          <Button onClick={() => setToDelete(null)}>Cancelar</Button>
          <Button color="error" variant="contained" onClick={remove}>Eliminar</Button>
        </DialogActions>
      </Dialog>
      {data && groups.length > 0 && (
        <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 2 }}>
          Cada cambio queda en el <Box component="span" sx={{ color: 'primary.main', cursor: 'pointer' }} onClick={() => navigate('/oplog')}>registro de operaciones</Box>.
          Los cambios sin commit se guardan en un stash propio y vuelven al regresar a su rama.
        </Typography>
      )}
    </Box>
  );
}
