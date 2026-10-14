import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Autocomplete, Box, Button, Checkbox, Chip, Collapse, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Grid,
  IconButton, InputAdornment, LinearProgress, List, ListItem, ListItemButton, ListItemIcon, ListItemText, ListSubheader, Paper, Stack, Switch, TextField, Tooltip, Typography,
} from '@mui/material';
import CheckoutIcon from '@mui/icons-material/Login';
import MergeIcon from '@mui/icons-material/CallMerge';
import AddIcon from '@mui/icons-material/Add';
import CompareIcon from '@mui/icons-material/CompareArrows';
import CleanIcon from '@mui/icons-material/CleaningServicesOutlined';
import RefreshIcon from '@mui/icons-material/Sync';
import ExpandIcon from '@mui/icons-material/ExpandMore';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Close';
import BranchFromIcon from '@mui/icons-material/AltRoute';
import PublishIcon from '@mui/icons-material/CloudUploadOutlined';
import DeleteIcon from '@mui/icons-material/DeleteOutline';
import { api } from '../api/client.js';
import { ConfirmDialog } from '../components/GitDialogs.jsx';
import { SearchToggles, makeMatcher, searchOptionKeys, useSearchOptions } from '../components/searchText.jsx';

const fmtDay = (d) => (d ? new Date(d).toLocaleDateString('es', { dateStyle: 'medium' }) : '');

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

const PUBLISH_KEY = 'gm-new-branch-publish';
const storedPublish = () => { try { return localStorage.getItem(PUBLISH_KEY) === '1'; } catch { return false; } };

// Crea una rama desde cualquier rama local o remota; opcionalmente cambia a ella y la publica en origin.
function NewBranchDialog({ open, base: initialBase, branches, onClose, onCreate }) {
  const [name, setName] = useState('');
  const [base, setBase] = useState(initialBase);
  const [switchTo, setSwitchTo] = useState(true);
  const [publish, setPublish] = useState(storedPublish);
  useEffect(() => { if (open) { setName(''); setBase(initialBase); } }, [open, initialBase]);

  const options = useMemo(() => [...branches].sort((a, b) => (a.remote - b.remote) || (b.current - a.current) || a.name.localeCompare(b.name)), [branches]);
  const exists = branches.some((b) => !b.remote && b.name === name);
  const invalid = !!name && /^[-/.]|[/.]$|\.\.|\/\/|@\{|\.lock$/.test(name);
  const canCreate = name && base && !exists && !invalid;
  const submit = () => {
    if (!canCreate) return;
    try { localStorage.setItem(PUBLISH_KEY, publish ? '1' : '0'); } catch { /* sin almacenamiento */ }
    onCreate({ name, from: base, switchTo, publish });
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Nueva rama</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField autoFocus fullWidth label="Nombre" placeholder="feature/mi-cambio" value={name}
            onChange={(e) => setName(e.target.value.replace(/\s+/g, '-').replace(/[~^:?*[\\]/g, ''))}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            error={exists || invalid} helperText={exists ? 'Ya existe una rama local con ese nombre' : invalid ? 'Nombre de rama no válido' : 'Los espacios se convierten en guiones'} />
          <Autocomplete options={options} groupBy={(b) => (b.remote ? 'Remotas' : 'Locales')} getOptionLabel={(b) => b.name}
            value={options.find((b) => b.name === base) || null} onChange={(e, b) => setBase(b?.name || '')}
            isOptionEqualToValue={(a, b) => a.name === b.name} disableClearable
            renderOption={({ key, ...props }, b) => (
              <Box component="li" key={b.name} {...props}>
                <Box sx={{ minWidth: 0 }}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography variant="body2">{b.name}</Typography>{b.current && <Chip size="small" color="primary" label="actual" sx={{ height: 18 }} />}
                  </Stack>
                  <Typography variant="caption" color="text.secondary" noWrap component="div">{b.subject}</Typography>
                </Box>
              </Box>
            )}
            renderInput={(params) => <TextField {...params} label="Crear desde" helperText="Rama local o remota en la que se basa la nueva rama" />} />
          <Box>
            <FormControlLabel control={<Checkbox checked={switchTo} onChange={(e) => setSwitchTo(e.target.checked)} />} label="Cambiar a la nueva rama" />
            <FormControlLabel control={<Checkbox checked={publish} onChange={(e) => setPublish(e.target.checked)} />} label="Publicarla en origin (push -u)" />
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="contained" disabled={!canCreate} onClick={submit}>
          {publish ? (switchTo ? 'Crear, cambiar y publicar' : 'Crear y publicar') : (switchTo ? 'Crear y cambiar' : 'Crear')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default function Branches({ repoId, onChanged, act, onCompare, notify }) {
  const [branches, setBranches] = useState([]);
  const [newFrom, setNewFrom] = useState(null); // rama base del diálogo de nueva rama; null = cerrado
  const [toDelete, setToDelete] = useState(null); // { name, force } rama local a eliminar
  const [mergeTarget, setMergeTarget] = useState(null);
  const [noFf, setNoFf] = useState(false);
  const [cleanOpen, setCleanOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [searchOpts, setSearchOpts] = useSearchOptions('branches');

  const load = () => api.get(`/repos/${repoId}/branches`).then(setBranches).catch(() => {});
  useEffect(() => { load(); }, [repoId]);

  const current = branches.find((b) => b.current);
  const done = async (r) => { await load(); onChanged(); return r; };
  const checkout = (branch) => act('checkout', () => api.post(`/repos/${repoId}/checkout`, { branch }), `Cambiado a ${branch}`).then(done);
  const publish = (branch) => act('publish', () => api.post(`/repos/${repoId}/publish`, { branch }), `Rama ${branch} publicada en origin`).then(done);
  // Borra una rama local con -d; si git avisa de que no está fusionada, se ofrece forzar (-D).
  const remove = async () => {
    const { name, force } = toDelete;
    setToDelete(null);
    const r = await act('branch-delete', () => api.post(`/repos/${repoId}/branches/delete`, { local: [name], force: force ? [name] : [], allowProtected: true }));
    const res = r?.results?.[0];
    if (!res) return;
    if (res.ok) notify(`Rama ${name} eliminada`, 'success');
    else if (/not fully merged|no está fusionada|not merged/i.test(res.error)) setToDelete({ name, force: true });
    else notify(res.error, 'error', { title: `No se pudo eliminar ${name}` });
    done();
  };
  const create = async ({ name, from, switchTo, publish: pub }) => {
    setNewFrom(null);
    const r = await act('checkout', () => api.post(`/repos/${repoId}/checkout`, { branch: name, create: true, from, switchTo }), `Rama ${name} creada desde ${from}`);
    await done(r);
    if (r && pub) await publish(name);
  };
  const merge = () => { const b = mergeTarget; setMergeTarget(null); act('merge', () => api.post(`/repos/${repoId}/merge`, { branch: b, noFf }), `Merge de ${b}`).then(done); };

  // Cada palabra debe aparecer en el nombre de la rama o en el mensaje de su último commit; con las opciones Aa / ab / .*.
  const matcher = makeMatcher(query, searchOpts);
  const matches = (b) => matcher.test(b.name, b.subject || '');

  const section = (title, all) => {
    const list = all.filter(matches);
    return (
    <Paper variant="outlined">
      <List dense subheader={<ListSubheader>{title} ({!matcher.empty ? `${list.length} de ${all.length}` : all.length})</ListSubheader>}>
        {list.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ px: 2, py: 1.5 }}>
            {!matcher.empty ? 'Ninguna rama coincide con la búsqueda.' : 'No hay ramas.'}
          </Typography>
        )}
        {list.map((b) => (
          <ListItem key={b.name} divider secondaryAction={(
            <Stack direction="row">
              {!b.remote && !b.upstream && (
                <Tooltip title="Publicar en origin (push -u)"><IconButton size="small" color="primary" onClick={() => publish(b.name)}><PublishIcon fontSize="small" /></IconButton></Tooltip>
              )}
              <Tooltip title="Nueva rama desde esta"><IconButton size="small" onClick={() => setNewFrom(b.name)}><BranchFromIcon fontSize="small" /></IconButton></Tooltip>
              {!b.current && <>
                <Tooltip title="Cambiar a esta rama (checkout)"><IconButton size="small" onClick={() => checkout(b.name)}><CheckoutIcon fontSize="small" /></IconButton></Tooltip>
                <Tooltip title={`Comparar con ${current?.name}`}><IconButton size="small" onClick={() => onCompare(current?.name, b.name)}><CompareIcon fontSize="small" /></IconButton></Tooltip>
                <Tooltip title={`Fusionar en ${current?.name}`}><IconButton size="small" onClick={() => setMergeTarget(b.name)}><MergeIcon fontSize="small" /></IconButton></Tooltip>
              </>}
              {!b.remote && !b.current && (
                <Tooltip title="Eliminar rama local"><IconButton size="small" color="error" onClick={() => setToDelete({ name: b.name, force: false })}><DeleteIcon fontSize="small" /></IconButton></Tooltip>
              )}
            </Stack>
          )}>
            <ListItemText
              primary={<Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
                <span>{b.name}</span>
                {b.current && <Chip size="small" color="primary" label="actual" />}
                {!b.remote && !b.upstream && <Chip size="small" variant="outlined" label="sin publicar" sx={{ height: 20, fontSize: 11 }} />}
              </Stack>}
              secondary={`${b.subject || ''} · ${b.date ? new Date(b.date).toLocaleDateString('es') : ''}`}
              secondaryTypographyProps={{ noWrap: true }} sx={{ pr: (b.current ? 5 : 17) + (!b.remote && !b.upstream ? 4 : 0) + (!b.remote && !b.current ? 4 : 0) }} />
          </ListItem>
        ))}
      </List>
    </Paper>
    );
  };

  return (
    <Box>
      <Stack direction="row" spacing={1} sx={{ mb: 2 }} flexWrap="wrap" useFlexGap alignItems="center">
        <Tooltip title="En el diálogo puedes elegir otra rama base; también desde el botón de cada rama">
          <Button startIcon={<AddIcon />} variant="outlined" onClick={() => setNewFrom(current?.name || '')}>Nueva rama desde {current?.name}</Button>
        </Tooltip>
        {current && !current.upstream && (
          <Tooltip title={`La rama actual no existe en origin. Publicarla: push -u origin ${current.name}`}>
            <Button variant="outlined" color="warning" startIcon={<PublishIcon />} onClick={() => publish(current.name)}>Publicar {current.name}</Button>
          </Tooltip>
        )}
        <Tooltip title="Detecta ramas ya fusionadas o cuyo remoto se borró y elimínalas en lote">
          <Button startIcon={<CleanIcon />} onClick={() => setCleanOpen(true)}>Limpiar ramas</Button>
        </Tooltip>
        <TextField size="small" placeholder="Buscar ramas…" value={query} onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (!searchOptionKeys(e, searchOpts, setSearchOpts) && e.key === 'Escape') setQuery(''); }}
          error={!matcher.valid} title={matcher.valid ? undefined : `Expresión regular inválida: ${matcher.error}`}
          sx={{ ml: { sm: 'auto' }, width: { xs: '100%', sm: 380 } }}
          InputProps={{
            startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>,
            endAdornment: (
              <InputAdornment position="end">
                <SearchToggles value={searchOpts} onChange={setSearchOpts} size="small" />
                {query && <IconButton size="small" edge="end" aria-label="Limpiar búsqueda" onClick={() => setQuery('')} sx={{ ml: 0.5 }}><ClearIcon fontSize="small" /></IconButton>}
              </InputAdornment>
            ),
          }} />
      </Stack>
      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>{section('Locales', branches.filter((b) => !b.remote))}</Grid>
        <Grid item xs={12} md={6}>{section('Remotas', branches.filter((b) => b.remote))}</Grid>
      </Grid>
      <ConfirmDialog open={!!toDelete} color="error" title={toDelete?.force ? 'La rama no está fusionada' : 'Eliminar rama local'}
        confirm={toDelete?.force ? 'Eliminar de todos modos' : 'Eliminar'}
        body={toDelete?.force
          ? <>«{toDelete?.name}» tiene commits que no están en ninguna otra rama. Si la eliminas, esos commits se perderán (salvo que existan en origin).</>
          : <>Se eliminará la rama local «{toDelete?.name}». {branches.find((b) => b.name === toDelete?.name)?.upstream ? 'La rama en origin no se toca.' : 'No está publicada en origin.'}</>}
        onClose={() => setToDelete(null)} onConfirm={remove} />
      <NewBranchDialog open={newFrom != null} base={newFrom || ''} branches={branches} onClose={() => setNewFrom(null)} onCreate={create} />
      <Dialog open={!!mergeTarget} onClose={() => setMergeTarget(null)}>
        <DialogTitle>Fusionar «{mergeTarget}» en «{current?.name}»</DialogTitle>
        <DialogContent><FormControlLabel control={<Checkbox checked={noFf} onChange={(e) => setNoFf(e.target.checked)} />} label="Crear siempre commit de merge (--no-ff)" /></DialogContent>
        <DialogActions><Button onClick={() => setMergeTarget(null)}>Cancelar</Button><Button variant="contained" onClick={merge}>Fusionar</Button></DialogActions>
      </Dialog>
      <CleanupDialog open={cleanOpen} repoId={repoId} act={act} notify={notify} onClose={() => setCleanOpen(false)} onDone={() => { load(); onChanged(); }} />
    </Box>
  );
}
