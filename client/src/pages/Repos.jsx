import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert, Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider, IconButton, LinearProgress,
  InputAdornment, Paper, Stack, Table, TableSortLabel, TableBody, TableCell, TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import AddIcon from '@mui/icons-material/CreateNewFolder';
import CloneIcon from '@mui/icons-material/CloudDownload';
import RemoveIcon from '@mui/icons-material/RemoveCircleOutline';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import BranchIcon from '@mui/icons-material/CallSplit';
import StarIcon from '@mui/icons-material/Star';
import StarOutlineIcon from '@mui/icons-material/StarBorder';
import LabelIcon from '@mui/icons-material/LabelOutlined';
import PullIcon from '@mui/icons-material/Download';
import FetchIcon from '@mui/icons-material/Sync';
import { api } from '../api/client.js';
import { useNotify } from '../components/Notify.jsx';
import CloneDialog from '../components/CloneDialog.jsx';
import AddReposDialog from '../components/AddReposDialog.jsx';
import RepoActions, { syncRepo } from '../components/RepoActions.jsx';
import LabelsDialog, { labelColor } from '../components/LabelsDialog.jsx';
import { REPOS_REFRESH } from '../components/AutoFetch.jsx';

// Filtros rápidos por estado (excluyentes entre sí).
const STATUS_FILTERS = [
  { key: 'all', label: 'Todos', test: () => true },
  { key: 'changes', label: 'Con cambios', test: (r) => r.changes > 0 },
  { key: 'behind', label: 'Por bajar', test: (r) => r.behind > 0 },
  { key: 'ahead', label: 'Por subir', test: (r) => r.ahead > 0 },
  { key: 'unpublished', label: 'Sin publicar', test: (r) => !r.missing && !r.error && r.branch && r.branch !== '(detached)' && !r.upstream },
];

const stored = (key, fallback) => { try { return { ...fallback, ...JSON.parse(localStorage.getItem(key) || '{}') }; } catch { return fallback; } };
const store = (key, v) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* sin almacenamiento */ } };

function ago(iso) {
  if (!iso) return '';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });
  for (const [n, u] of [[31536000, 'year'], [2592000, 'month'], [604800, 'week'], [86400, 'day'], [3600, 'hour'], [60, 'minute']]) {
    if (s >= n) return rtf.format(-Math.floor(s / n), u);
  }
  return 'hace un momento';
}

export default function Repos() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [cloneOpen, setCloneOpen] = useState(false);
  const [filter, setFilter] = useState('');
  // Orden y filtros se recuerdan en el navegador.
  const [sort, setSort] = useState(() => stored('gm-repos-sort', { by: 'name', dir: (() => { try { return localStorage.getItem('gm-repos-order') || 'asc'; } catch { return 'asc'; } })() }));
  const [view, setView] = useState(() => stored('gm-repos-filters', { status: 'all', favorites: false, labels: [] }));
  useEffect(() => store('gm-repos-sort', sort), [sort]);
  useEffect(() => store('gm-repos-filters', view), [view]);
  const [selected, setSelected] = useState(new Set());
  const [toRemove, setToRemove] = useState(null);
  const [labelsFor, setLabelsFor] = useState(null); // repos a etiquetar
  const [bulk, setBulk] = useState(null);
  const notify = useNotify();
  const navigate = useNavigate();

  const load = useCallback(() => {
    setLoading(true);
    api.get('/repos').then(setData).catch((e) => notify(e.message, 'error')).finally(() => setLoading(false));
  }, [notify]);
  useEffect(load, [load]);
  // El fetch automático avisa al terminar: se recarga la lista para mostrar los «↓ por bajar» al día.
  useEffect(() => { window.addEventListener(REPOS_REFRESH, load); return () => window.removeEventListener(REPOS_REFRESH, load); }, [load]);

  const repos = data?.repos || [];
  const allLabels = useMemo(() => [...new Set(repos.flatMap((r) => r.labels || []))].sort((a, b) => a.localeCompare(b, 'es')), [repos]);
  // Si una etiqueta filtrada ya no existe, se quita del filtro.
  useEffect(() => { if (data && view.labels.some((l) => !allLabels.includes(l))) setView((v) => ({ ...v, labels: v.labels.filter((l) => allLabels.includes(l)) })); }, [allLabels]);

  // Conteos de cada filtro de estado sobre lo que ya filtran nombre, favoritos y etiquetas.
  const base = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return repos.filter((r) => (!q || r.name.toLowerCase().includes(q))
      && (!view.favorites || r.favorite)
      && (!view.labels.length || view.labels.some((l) => r.labels?.includes(l))));
  }, [repos, filter, view.favorites, view.labels]);
  const counts = useMemo(() => Object.fromEntries(STATUS_FILTERS.map((f) => [f.key, base.filter(f.test).length])), [base]);

  const shown = useMemo(() => {
    const test = (STATUS_FILTERS.find((f) => f.key === view.status) || STATUS_FILTERS[0]).test;
    const dir = sort.dir === 'asc' ? 1 : -1;
    const byName = (a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base', numeric: true });
    const byDate = (a, b) => (new Date(a.lastCommit?.date || 0) - new Date(b.lastCommit?.date || 0)) || byName(a, b);
    // Los favoritos siempre van primero; dentro de cada grupo se aplica el orden elegido.
    return base.filter(test).sort((a, b) => (!!b.favorite - !!a.favorite) || dir * (sort.by === 'date' ? byDate(a, b) : byName(a, b)));
  }, [base, view.status, sort]);

  // Descarta de la selección los repos que ya no existen en la lista.
  useEffect(() => {
    if (!data) return;
    const ids = new Set(data.repos.map((r) => r.id));
    setSelected((s) => new Set([...s].filter((id) => ids.has(id))));
  }, [data]);

  const allShown = shown.length > 0 && shown.every((r) => selected.has(r.id));
  const someShown = shown.some((r) => selected.has(r.id));
  const toggle = (id) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSelected((s) => {
    const n = new Set(s);
    shown.forEach((r) => (allShown ? n.delete(r.id) : n.add(r.id)));
    return n;
  });

  const patchRows = (ids, fn) => setData((d) => d && ({ ...d, repos: d.repos.map((r) => (ids.includes(r.id) ? { ...r, ...fn(r) } : r)) }));

  // Actualiza solo una fila tras una acción, sin recargar el estado de todos los repos.
  const refreshRow = useCallback(async (id) => {
    try {
      const s = await api.get(`/repos/${id}/status`);
      setData((d) => d && ({ ...d, repos: d.repos.map((r) => (r.id === id
        ? { ...r, branch: s.branch, upstream: s.upstream, ahead: s.ahead, behind: s.behind, changes: s.files.length, error: undefined } : r)) }));
    } catch { /* la fila conserva su estado anterior */ }
  }, []);

  const setFavorite = async (r, favorite = !r.favorite) => {
    patchRows([r.id], () => ({ favorite }));
    try { await api.put(`/repos/${r.id}/meta`, { favorite }); }
    catch (e) { patchRows([r.id], () => ({ favorite: !favorite })); notify(e.message, 'error'); }
  };
  const bulkFavorite = async (favorite) => {
    const ids = [...selected];
    try { await api.post('/repos/meta-many', { ids, favorite }); patchRows(ids, () => ({ favorite })); }
    catch (e) { notify(e.message, 'error'); }
  };
  const saveLabels = async (body) => {
    const target = labelsFor; setLabelsFor(null);
    try {
      if (target.length === 1) {
        const r = await api.put(`/repos/${target[0].id}/meta`, { labels: body.labels });
        patchRows([r.id], () => ({ labels: r.labels }));
      } else {
        await api.post('/repos/meta-many', { ids: target.map((r) => r.id), add: body.add, remove: body.remove });
        load();
      }
    } catch (e) { notify(e.message, 'error'); }
  };

  // Fetch/pull en bloque sobre la selección, 4 repos a la vez.
  const bulkSync = async (op) => {
    const targets = data.repos.filter((r) => selected.has(r.id) && !r.missing);
    let done = 0;
    const failed = [];
    setBulk({ op, done, total: targets.length });
    const queue = [...targets];
    await Promise.all(Array.from({ length: Math.min(4, queue.length) }, async () => {
      while (queue.length) {
        const r = queue.shift();
        try { await syncRepo(r.id, op); } catch (e) { failed.push(`${r.name}: ${e.message}`); }
        setBulk({ op, done: ++done, total: targets.length });
        refreshRow(r.id);
      }
    }));
    setBulk(null);
    if (failed.length) notify(`${op === 'pull' ? 'Pull' : 'Fetch'} con errores en ${failed.length} de ${targets.length}:\n${failed.join('\n')}`, 'error');
    else notify(`${op === 'pull' ? 'Pull' : 'Fetch'} completado en ${targets.length} ${targets.length === 1 ? 'repositorio' : 'repositorios'}`);
  };

  const confirmRemove = async () => {
    try {
      const { removed } = await api.post('/repos/remove-many', { ids: toRemove.map((r) => r.id) });
      notify(removed === 1 ? 'Repositorio quitado de la lista' : `${removed} repositorios quitados de la lista`);
      setSelected((s) => { const n = new Set(s); toRemove.forEach((r) => n.delete(r.id)); return n; });
    } catch (e) { notify(e.message, 'error'); }
    setToRemove(null);
    load();
  };

  const sortBy = (by) => setSort((s) => (s.by === by ? { by, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { by, dir: by === 'date' ? 'desc' : 'asc' }));
  const anyFilter = view.status !== 'all' || view.favorites || view.labels.length || filter.trim();
  const selectedRepos = repos.filter((r) => selected.has(r.id));
  const favCount = repos.filter((r) => r.favorite).length;

  const chipSx = (active, color) => ({
    height: 26, fontWeight: 600,
    ...(color && { borderColor: alpha(color, active ? 1 : 0.5), color, bgcolor: active ? alpha(color, 0.16) : 'transparent', '&:hover': { bgcolor: alpha(color, 0.22) } }),
  });

  return (
    <Box>
      {/* La barra de selección se superpone a la cabecera (misma altura) para que la tabla no se desplace al seleccionar. */}
      <Box sx={{ position: 'relative', mb: 2 }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Typography variant="h5" sx={{ flexGrow: 1 }}>Repositorios locales</Typography>
          {repos.length > 0 && (
            <TextField size="small" placeholder="Filtrar por nombre…" value={filter} onChange={(e) => setFilter(e.target.value)} sx={{ width: 260 }}
              InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }} />
          )}
          <Tooltip title="Actualizar"><IconButton onClick={load}><RefreshIcon /></IconButton></Tooltip>
          <Button startIcon={<AddIcon />} variant="outlined" onClick={() => setAddOpen(true)}>Añadir repositorios</Button>
          <Button startIcon={<CloneIcon />} variant="contained" onClick={() => setCloneOpen(true)}>Clonar</Button>
        </Stack>
        {selected.size > 0 && (
          <Paper variant="outlined" sx={{
            position: 'absolute', inset: 0, zIndex: 1, px: 2, display: 'flex', alignItems: 'center', gap: 1.5, borderColor: 'primary.main',
            bgcolor: 'background.default', backgroundImage: (t) => `linear-gradient(${t.palette.primary.main}1f, ${t.palette.primary.main}1f)`,
          }}>
            <Typography variant="body2" fontWeight={600} sx={{ flexGrow: 1 }}>
              {selected.size === 1 ? '1 repositorio seleccionado' : `${selected.size} repositorios seleccionados`}
            </Typography>
            {bulk && <Typography variant="body2" color="text.secondary">{bulk.op === 'pull' ? 'Pull' : 'Fetch'} {bulk.done}/{bulk.total}…</Typography>}
            <Button size="small" variant="outlined" startIcon={<FetchIcon />} disabled={!!bulk} onClick={() => bulkSync('fetch')}>Fetch</Button>
            <Button size="small" variant="outlined" startIcon={<PullIcon />} disabled={!!bulk} onClick={() => bulkSync('pull')}>Pull</Button>
            <Tooltip title={selectedRepos.every((r) => r.favorite) ? 'Quitar de favoritos' : 'Marcar como favoritos'}>
              <Button size="small" variant="outlined" startIcon={selectedRepos.every((r) => r.favorite) ? <StarIcon /> : <StarOutlineIcon />}
                onClick={() => bulkFavorite(!selectedRepos.every((r) => r.favorite))}>Favorito</Button>
            </Tooltip>
            <Button size="small" variant="outlined" startIcon={<LabelIcon />} onClick={() => setLabelsFor(selectedRepos)}>Etiquetas</Button>
            <Button size="small" color="error" variant="outlined" disabled={!!bulk} startIcon={<RemoveIcon />}
              onClick={() => setToRemove(selectedRepos)}>Quitar de la lista</Button>
            <Tooltip title="Limpiar selección"><IconButton size="small" onClick={() => setSelected(new Set())}><CloseIcon fontSize="small" /></IconButton></Tooltip>
          </Paper>
        )}
      </Box>

      {repos.length > 0 && (
        <Stack direction="row" alignItems="center" flexWrap="wrap" useFlexGap sx={{ gap: 1, mb: 1.5 }}>
          {STATUS_FILTERS.map((f) => (
            <Chip key={f.key} clickable variant={view.status === f.key ? 'filled' : 'outlined'} color={view.status === f.key ? 'primary' : 'default'}
              label={`${f.label} ${counts[f.key]}`} onClick={() => setView((v) => ({ ...v, status: f.key }))} sx={{ height: 26, fontWeight: 600 }} />
          ))}
          <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
          <Tooltip title="Solo los favoritos (siempre aparecen primero en la lista)">
            <Chip clickable variant="outlined" icon={view.favorites ? <StarIcon /> : <StarOutlineIcon />} label={`Favoritos ${favCount}`}
              onClick={() => setView((v) => ({ ...v, favorites: !v.favorites }))} sx={{ ...chipSx(view.favorites, '#F1A20D'), '& .MuiChip-icon': { color: 'inherit' } }} />
          </Tooltip>
          {allLabels.map((l) => {
            const on = view.labels.includes(l);
            return (
              <Chip key={l} clickable variant="outlined" icon={<LabelIcon />} label={`${l} ${repos.filter((r) => r.labels?.includes(l)).length}`}
                onClick={() => setView((v) => ({ ...v, labels: on ? v.labels.filter((x) => x !== l) : [...v.labels, l] }))}
                sx={{ ...chipSx(on, labelColor(l)), '& .MuiChip-icon': { color: 'inherit' } }} />
            );
          })}
          {anyFilter && <Button size="small" onClick={() => { setFilter(''); setView({ status: 'all', favorites: false, labels: [] }); }}>Quitar filtros</Button>}
        </Stack>
      )}

      <Box sx={{ height: 4, mb: 1 }}>{loading && <LinearProgress />}</Box>
      {data && repos.length === 0 && (
        <Alert severity="info">Aún no hay repositorios. Añade una carpeta que ya tengas, clona por URL o ve a <b>Proyectos GitLab</b> para clonar uno de tus proyectos.</Alert>
      )}
      {data && repos.length > 0 && (
        <Paper variant="outlined">
          <Table>
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox"><Checkbox size="small" checked={allShown} indeterminate={!allShown && someShown} disabled={!shown.length} onChange={toggleAll} inputProps={{ 'aria-label': 'Seleccionar todos' }} /></TableCell>
                <TableCell sx={{ width: '100%' }} sortDirection={sort.by === 'name' ? sort.dir : false}>
                  <Tooltip title="Ordenar por nombre · los favoritos siempre van primero">
                    <TableSortLabel active={sort.by === 'name'} direction={sort.by === 'name' ? sort.dir : 'asc'} onClick={() => sortBy('name')}>Repositorio</TableSortLabel>
                  </Tooltip>
                </TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap', display: { xs: 'none', md: 'table-cell' } }} sortDirection={sort.by === 'date' ? sort.dir : false}>
                  <Tooltip title="Ordenar por fecha del último commit">
                    <TableSortLabel active={sort.by === 'date'} direction={sort.by === 'date' ? sort.dir : 'desc'} onClick={() => sortBy('date')}>Último commit</TableSortLabel>
                  </Tooltip>
                </TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>Estado</TableCell><TableCell align="right">Acciones</TableCell></TableRow>
            </TableHead>
            <TableBody>
              {shown.map((r) => (
                <TableRow key={r.id} hover selected={selected.has(r.id)} sx={{ cursor: r.missing ? 'default' : 'pointer', '& .fav-off': { opacity: 0 }, '&:hover .fav-off': { opacity: 0.6 } }} onClick={() => !r.missing && navigate(`/repos/${r.id}`)}>
                  <TableCell padding="checkbox" onClick={(e) => e.stopPropagation()}><Checkbox size="small" checked={selected.has(r.id)} onChange={() => toggle(r.id)} /></TableCell>
                  <TableCell sx={{ maxWidth: 0 }}>
                    <Stack direction="row" alignItems="center" useFlexGap flexWrap="wrap" sx={{ minWidth: 0, columnGap: 1, rowGap: 0.5 }}>
                      <Tooltip title={r.favorite ? 'Quitar de favoritos' : 'Añadir a favoritos'}>
                        <IconButton size="small" className={r.favorite ? '' : 'fav-off'} onClick={(e) => { e.stopPropagation(); setFavorite(r); }}
                          sx={{ p: 0.25, ml: -0.75, color: r.favorite ? '#F1A20D' : 'text.secondary', transition: 'opacity .15s' }} aria-label="Favorito">
                          {r.favorite ? <StarIcon sx={{ fontSize: 18 }} /> : <StarOutlineIcon sx={{ fontSize: 18 }} />}
                        </IconButton>
                      </Tooltip>
                      <Typography variant="body2" fontWeight={700} sx={{ flexShrink: 0 }}>{r.name}</Typography>
                      {r.branch && (
                        <Tooltip title={r.branch}>
                          <Chip size="small" variant="outlined" color="primary" icon={<BranchIcon sx={{ fontSize: '14px !important' }} />} label={r.branch}
                            sx={{ height: 20, fontSize: 11, maxWidth: { xs: '100%', xl: 560 }, minWidth: 0 }} />
                        </Tooltip>
                      )}
                      {r.labels?.map((l) => (
                        <Chip key={l} size="small" variant="outlined" label={l}
                          onClick={(e) => { e.stopPropagation(); setView((v) => ({ ...v, labels: v.labels.includes(l) ? v.labels : [...v.labels, l] })); }}
                          sx={{ height: 20, fontSize: 11, borderColor: alpha(labelColor(l), 0.6), color: labelColor(l), bgcolor: alpha(labelColor(l), 0.08) }} />
                      ))}
                    </Stack>
                    <Typography variant="caption" color="text.secondary" component="div" sx={{ fontFamily: (t) => t.typography.fontFamilyCode, fontSize: 11.5, wordBreak: 'break-all' }}>{r.path}</Typography>
                  </TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap', width: 1, display: { xs: 'none', md: 'table-cell' } }}>
                    {r.lastCommit ? (
                      <Tooltip title={<>{r.lastCommit.subject}<br />{new Date(r.lastCommit.date).toLocaleString('es-CR', { dateStyle: 'medium', timeStyle: 'short' })}</>}>
                        <Box>
                          <Typography variant="body2" fontSize={13}>{ago(r.lastCommit.date)}</Typography>
                          <Typography variant="caption" color="text.secondary" noWrap component="div" sx={{ maxWidth: 160 }}>{r.lastCommit.author}</Typography>
                        </Box>
                      </Tooltip>
                    ) : !r.missing && !r.error && <Typography variant="caption" color="text.secondary">Sin commits</Typography>}
                  </TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap', width: 1 }}>
                    <Tooltip title={r.fetchedAt ? `Último fetch ${ago(r.fetchedAt)}` : ''}>
                      <Stack direction="row" spacing={0.5}>
                        {r.missing && <Chip size="small" color="error" label="Carpeta no encontrada" />}
                        {r.error && <Chip size="small" color="error" label="Error" title={r.error} />}
                        {r.changes > 0 && <Chip size="small" color="warning" label={`${r.changes} cambios`} />}
                        {r.ahead > 0 && <Chip size="small" color="info" label={`↑ ${r.ahead}`} />}
                        {r.behind > 0 && <Chip size="small" color="secondary" label={`↓ ${r.behind}`} />}
                        {STATUS_FILTERS[4].test(r) && <Chip size="small" variant="outlined" label="Sin publicar" />}
                        {!r.missing && !r.error && !r.changes && !r.ahead && !r.behind && r.upstream && <Chip size="small" color="success" variant="outlined" label="Al día" />}
                      </Stack>
                    </Tooltip>
                  </TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap', width: 1 }}>
                    <RepoActions repo={r} onChanged={refreshRow} onRemove={() => setToRemove([r])} onOpenDetail={() => navigate(`/repos/${r.id}`)}
                      onFavorite={() => setFavorite(r)} onLabels={() => setLabelsFor([r])} />
                  </TableCell>
                </TableRow>
              ))}
              {!shown.length && (
                <TableRow><TableCell colSpan={5} sx={{ textAlign: 'center', color: 'text.secondary', py: 4 }}>
                  Ningún repositorio coincide con los filtros. <Button size="small" onClick={() => { setFilter(''); setView({ status: 'all', favorites: false, labels: [] }); }}>Quitar filtros</Button>
                </TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </Paper>
      )}

      <Dialog open={!!toRemove} onClose={() => setToRemove(null)} fullWidth maxWidth="sm">
        <DialogTitle>{toRemove?.length === 1 ? `¿Quitar «${toRemove[0].name}» de la lista?` : `¿Quitar ${toRemove?.length} repositorios de la lista?`}</DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mb: toRemove?.length > 1 ? 1.5 : 0 }}>Solo se quitan de Git Manager. Los archivos en disco <b>no</b> se borran.</Alert>
          {toRemove?.length > 1 && (
            <Box component="ul" sx={{ m: 0, pl: 2.5, maxHeight: 240, overflow: 'auto', fontSize: 14 }}>
              {toRemove.map((r) => <li key={r.id}><b>{r.name}</b> <Typography component="span" variant="caption" color="text.secondary">{r.path}</Typography></li>)}
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setToRemove(null)}>Cancelar</Button>
          <Button color="error" variant="contained" onClick={confirmRemove}>Quitar {toRemove?.length > 1 ? toRemove.length : ''}</Button>
        </DialogActions>
      </Dialog>
      <LabelsDialog open={!!labelsFor} repos={labelsFor} allLabels={allLabels} onClose={() => setLabelsFor(null)} onSave={saveLabels} />
      <AddReposDialog open={addOpen} onClose={() => setAddOpen(false)} onAdded={(d) => {
        if (!d.failed.length) setAddOpen(false);
        if (d.added.length) notify(d.added.length === 1 ? 'Repositorio añadido' : `${d.added.length} repositorios añadidos`);
        load();
      }} />
      <CloneDialog open={cloneOpen} onClose={() => setCloneOpen(false)} onCloned={(repo) => { setCloneOpen(false); notify('Repositorio clonado'); navigate(`/repos/${repo.id}`); }} />
    </Box>
  );
}
