import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Autocomplete, Box, Button, Checkbox, Chip, Divider, FormControlLabel, IconButton, InputAdornment, LinearProgress, ListItemIcon,
  ListItemText, Menu, MenuItem, Paper, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import MoreIcon from '@mui/icons-material/MoreVert';
import CherryIcon from '@mui/icons-material/CallSplit';
import RevertIcon from '@mui/icons-material/SettingsBackupRestore';
import TagIcon from '@mui/icons-material/LocalOffer';
import UndoIcon from '@mui/icons-material/Undo';
import CopyIcon from '@mui/icons-material/ContentCopy';
import CompareIcon from '@mui/icons-material/CompareArrows';
import SearchIcon from '@mui/icons-material/Search';
import PersonIcon from '@mui/icons-material/PersonOutline';
import FileIcon from '@mui/icons-material/InsertDriveFileOutlined';
import ClearIcon from '@mui/icons-material/FilterAltOff';
import { api, qs } from '../api/client.js';
import CommitDialog, { fmtDate } from '../components/CommitDialog.jsx';
import { ConfirmDialog } from '../components/GitDialogs.jsx';
import { computeGraph, laneColor } from '../graph.js';

const PAGE = 150;
const ROW = 52;   // alto fijo de fila: el gráfico se dibuja por filas
const LANE = 14;  // separación entre carriles
const MAX_LANES = 14;
const isHead = (c) => c.refs.some((r) => r === 'HEAD' || r.startsWith('HEAD -> '));
const EMPTY = { q: '', author: '', file: '', since: '', until: '' };

// Celda del gráfico de una fila: líneas que llegan desde arriba, el punto del commit y las que salen hacia sus padres.
function GraphCell({ row, width, theme }) {
  const x = (i) => 9 + i * LANE;
  const mid = ROW / 2;
  const curve = (x1, y1, x2, y2) => `M${x1} ${y1} C${x1} ${(y1 + y2) / 2} ${x2} ${(y1 + y2) / 2} ${x2} ${y2}`;
  const paths = [];
  row.before.forEach((h, i) => {
    if (!h) return;
    if (i === row.col || row.joins.includes(i)) paths.push([curve(x(i), 0, x(row.col), mid), laneColor(i)]);
    else paths.push([`M${x(i)} 0 L${x(i)} ${mid}`, laneColor(i)]);
  });
  row.after.forEach((h, i) => {
    if (!h) return;
    if (i === row.col) paths.push([`M${x(i)} ${mid} L${x(i)} ${ROW}`, laneColor(i)]);
    else {
      if (row.forks.includes(i)) paths.push([curve(x(row.col), mid, x(i), ROW), laneColor(i)]);
      if (row.before[i] === h) paths.push([`M${x(i)} ${mid} L${x(i)} ${ROW}`, laneColor(i)]);
    }
  });
  const color = laneColor(row.col);
  return (
    <svg width={width} height={ROW} style={{ flexShrink: 0, display: 'block', overflow: 'hidden' }} aria-hidden>
      {paths.map(([d, c], k) => <path key={k} d={d} stroke={c} strokeWidth={2} fill="none" strokeLinecap="round" />)}
      <circle cx={x(row.col)} cy={mid} r={row.merge ? 4 : 5} fill={row.merge ? theme.palette.background.default : color} stroke={color} strokeWidth={row.merge ? 2.5 : 2} />
    </svg>
  );
}

// Historial con búsqueda, gráfico de ramas y acciones por commit.
export default function History({ repoId, branch, act, onUndo, onTag, onCompare, notify, version }) {
  const theme = useTheme();
  const [all, setAll] = useState(true);
  const [form, setForm] = useState(EMPTY);   // lo que escribe el usuario
  const [filters, setFilters] = useState(EMPTY); // lo que se consulta (con retardo para el texto)
  const [data, setData] = useState(null);   // { commits, more, filtered }
  const [loadingMore, setLoadingMore] = useState(false);
  const [files, setFiles] = useState(null);
  const [detail, setDetail] = useState(null);
  const [menu, setMenu] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const timer = useRef();

  const set = (k, v, delay = 0) => {
    setForm((f) => ({ ...f, [k]: v }));
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setFilters((f) => ({ ...f, [k]: v })), delay);
  };
  useEffect(() => () => clearTimeout(timer.current), []);

  const params = (skip) => qs({ limit: PAGE, skip, all: String(all), ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) });
  const load = () => {
    setData(null);
    api.get(`/repos/${repoId}/log${params(0)}`).then(setData).catch((e) => { notify(e.message, 'error'); setData({ commits: [], more: false }); });
  };
  useEffect(load, [repoId, all, filters, version]);

  const more = async () => {
    setLoadingMore(true);
    try {
      const r = await api.get(`/repos/${repoId}/log${params(data.commits.length)}`);
      setData((d) => ({ ...r, commits: [...d.commits, ...r.commits] }));
    } catch (e) { notify(e.message, 'error'); }
    finally { setLoadingMore(false); }
  };

  const loadFiles = () => { if (!files) api.get(`/repos/${repoId}/files`).then((r) => setFiles(r.files)).catch(() => setFiles([])); };

  const graph = useMemo(() => (data && !data.filtered ? computeGraph(data.commits) : null), [data]);
  const graphWidth = graph ? 18 + (Math.min(graph.width, MAX_LANES) - 1) * LANE : 0;
  const hasFilters = Object.values(filters).some(Boolean);

  const run = async () => {
    const { kind, commit: c } = confirm; setConfirm(null); setDetail(null);
    if (kind === 'revert') await act('revert', () => api.post(`/repos/${repoId}/revert`, { hash: c.hash }), `Commit ${c.short} revertido`);
    else await act('cherry-pick', () => api.post(`/repos/${repoId}/cherry-pick`, { hash: c.hash }), `Commit ${c.short} aplicado en ${branch}`);
  };
  const copy = async (c) => {
    try { await navigator.clipboard.writeText(c.hash); notify('Hash copiado al portapapeles'); } catch { notify('No se pudo copiar', 'error'); }
  };

  // Acciones disponibles para un commit (las mismas en el menú ⋮ y en el detalle).
  const actions = (c) => [
    isHead(c) && { key: 'undo', icon: <UndoIcon fontSize="small" />, label: 'Deshacer este commit', desc: 'Reset suave: sus cambios vuelven a quedar preparados', run: () => { setDetail(null); onUndo(); } },
    !isHead(c) && { key: 'cherry', icon: <CherryIcon fontSize="small" />, label: `Cherry-pick en ${branch}`, desc: 'Copia este commit sobre la rama actual', run: () => setConfirm({ kind: 'cherry', commit: c }) },
    { key: 'revert', icon: <RevertIcon fontSize="small" />, label: 'Revertir commit', desc: 'Crea un commit nuevo que deshace sus cambios', run: () => setConfirm({ kind: 'revert', commit: c }) },
    !isHead(c) && { key: 'compare', icon: <CompareIcon fontSize="small" />, label: `Comparar con ${branch}`, desc: 'Archivos y diff entre este commit y la rama actual', run: () => { setDetail(null); onCompare(c.hash, branch); } },
    { key: 'tag', icon: <TagIcon fontSize="small" />, label: 'Crear tag aquí', run: () => { setDetail(null); onTag(c); } },
    { key: 'copy', icon: <CopyIcon fontSize="small" />, label: 'Copiar hash', run: () => copy(c) },
  ].filter(Boolean);

  const refChip = (r, c, col) => {
    const tag = r.startsWith('tag: ');
    const label = r.replace('HEAD -> ', '★ ').replace('tag: ', '');
    const remote = !tag && /^[^/]+\//.test(label) && !label.startsWith('★') && r !== 'HEAD' && label.split('/')[0] === 'origin';
    const color = graph && !tag && !remote ? laneColor(col) : null;
    return (
      <Chip key={r} size="small" variant="outlined" color={tag ? 'warning' : 'default'}
        icon={tag ? <TagIcon sx={{ fontSize: '14px !important' }} /> : undefined} label={label}
        sx={{ height: 20, fontSize: 11.5, maxWidth: 260, ...(color ? { borderColor: color, color, bgcolor: alpha(color, 0.1) } : {}), ...(remote ? { opacity: 0.8 } : {}) }} />
    );
  };

  return (
    <Box>
      <Paper variant="outlined" sx={{ p: 1.5, mb: 2 }}>
        <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))', lg: '2fr 1.2fr 1.6fr 0.9fr 0.9fr' } }}>
          <TextField size="small" label="Buscar en mensajes" value={form.q} onChange={(e) => set('q', e.target.value, 400)}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }} />
          <TextField size="small" label="Autor" placeholder="nombre o correo" value={form.author} onChange={(e) => set('author', e.target.value, 400)}
            InputProps={{ startAdornment: <InputAdornment position="start"><PersonIcon fontSize="small" /></InputAdornment> }} />
          <Autocomplete size="small" options={files || []} loading={!files} onOpen={loadFiles} value={form.file || null}
            onChange={(e, v) => set('file', v || '')} filterOptions={(opts, { inputValue }) => {
              const t = inputValue.toLowerCase();
              return (t ? opts.filter((o) => o.toLowerCase().includes(t)) : opts).slice(0, 200);
            }}
            renderInput={(p) => <TextField {...p} label="Archivo" placeholder="ruta/al/archivo"
              InputProps={{ ...p.InputProps, startAdornment: <><InputAdornment position="start"><FileIcon fontSize="small" /></InputAdornment>{p.InputProps.startAdornment}</> }} />}
            ListboxProps={{ sx: { fontFamily: theme.typography.fontFamilyCode, fontSize: 12.5 } }} />
          <TextField size="small" type="date" label="Desde" value={form.since} onChange={(e) => set('since', e.target.value)} InputLabelProps={{ shrink: true }} />
          <TextField size="small" type="date" label="Hasta" value={form.until} onChange={(e) => set('until', e.target.value)} InputLabelProps={{ shrink: true }} />
        </Box>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 1 }} flexWrap="wrap" useFlexGap>
          <FormControlLabel control={<Checkbox size="small" checked={all} onChange={(e) => setAll(e.target.checked)} />} label="Todas las ramas" />
          {hasFilters && <Button size="small" startIcon={<ClearIcon fontSize="small" />} onClick={() => { clearTimeout(timer.current); setForm(EMPTY); setFilters(EMPTY); }}>Quitar filtros</Button>}
          <Box sx={{ flexGrow: 1 }} />
          {data && (
            <Typography variant="caption" color="text.secondary">
              {data.commits.length}{data.more ? '+' : ''} {data.commits.length === 1 ? 'commit' : 'commits'}
              {hasFilters ? ' encontrados · el gráfico de ramas se oculta mientras hay filtros' : ''}
            </Typography>
          )}
        </Stack>
      </Paper>

      {!data ? <LinearProgress /> : (
        <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
          {data.commits.length === 0 && <Typography color="text.secondary" sx={{ p: 2 }}>{hasFilters ? 'Ningún commit coincide con los filtros.' : 'Todavía no hay commits.'}</Typography>}
          {data.commits.map((c, idx) => {
            const row = graph?.rows[idx];
            return (
              <Box key={c.hash} onClick={() => setDetail(c)}
                sx={{
                  display: 'flex', alignItems: 'center', height: ROW, pr: 1, pl: graph ? 0.5 : 2, cursor: 'pointer',
                  borderBottom: 1, borderColor: 'divider', '&:last-of-type': { borderBottom: 0 },
                  '&:hover': { bgcolor: 'action.hover' }, '& .more': { opacity: 0.5 }, '&:hover .more': { opacity: 1 },
                }}>
                {row && <GraphCell row={row} width={graphWidth} theme={theme} />}
                <Box sx={{ flex: 1, minWidth: 0, pl: 1 }}>
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0, overflow: 'hidden' }}>
                    <Typography component="span" sx={{ fontFamily: theme.typography.fontFamilyCode, fontSize: 13, color: 'primary.main', flexShrink: 0 }}>{c.short}</Typography>
                    {c.refs.map((r) => refChip(r, c, row?.col ?? 0))}
                    <Typography component="span" noWrap sx={{ fontSize: 14, minWidth: 0 }} title={c.subject}>{c.subject}</Typography>
                  </Stack>
                  <Typography variant="caption" color="text.secondary" noWrap component="div">{c.author} · {fmtDate(c.date)}</Typography>
                </Box>
                <IconButton className="more" size="small" onClick={(e) => { e.stopPropagation(); setMenu({ el: e.currentTarget, commit: c }); }} aria-label="Acciones del commit">
                  <MoreIcon fontSize="small" />
                </IconButton>
              </Box>
            );
          })}
          {data.more && (
            <Box sx={{ p: 1, textAlign: 'center', borderTop: 1, borderColor: 'divider' }}>
              <Button size="small" disabled={loadingMore} onClick={more}>{loadingMore ? 'Cargando…' : `Cargar ${PAGE} más`}</Button>
            </Box>
          )}
        </Paper>
      )}

      <Menu anchorEl={menu?.el} open={!!menu} onClose={() => setMenu(null)} slotProps={{ paper: { sx: { minWidth: 260 } } }}>
        {menu && actions(menu.commit).map((a, i) => [
          a.key === 'tag' && i > 0 && <Divider key="d" />,
          <MenuItem key={a.key} onClick={() => { setMenu(null); a.run(); }}>
            <ListItemIcon>{a.icon}</ListItemIcon>
            <ListItemText primary={a.label} secondary={a.desc} secondaryTypographyProps={{ fontSize: 11.5 }} />
          </MenuItem>,
        ])}
      </Menu>
      <CommitDialog repoId={repoId} commit={detail} file={filters.file || undefined} onClose={() => setDetail(null)}
        actions={detail ? actions(detail).filter((a) => a.key !== 'copy') : []} />
      <ConfirmDialog open={confirm} onClose={() => setConfirm(null)} onConfirm={run}
        title={confirm?.kind === 'revert' ? 'Revertir commit' : `Cherry-pick en ${branch}`}
        confirm={confirm?.kind === 'revert' ? 'Revertir' : 'Aplicar commit'}
        body={confirm && <>
          <Box component="span" sx={{ fontFamily: 'monospace', color: 'primary.main' }}>{confirm.commit.short}</Box> {confirm.commit.subject}
          <Box sx={{ mt: 1.5 }}>
            {confirm.kind === 'revert'
              ? 'Se creará un commit nuevo que deshace sus cambios. El historial no se reescribe, así que es seguro aunque el commit ya esté publicado.'
              : `Se creará en ${branch} un commit nuevo con los mismos cambios.`}
            {confirm.commit.parents.length > 1 && ' Es un commit de merge: se tomarán sus cambios respecto al primer padre.'}
          </Box>
        </>} />
    </Box>
  );
}
