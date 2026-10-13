import { useEffect, useMemo, useState } from 'react';
import {
  Autocomplete, Box, Button, Chip, InputAdornment, LinearProgress, Paper, Stack, TextField, ToggleButton, ToggleButtonGroup,
  Tooltip, Typography,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import FileIcon from '@mui/icons-material/InsertDriveFileOutlined';
import HistoryIcon from '@mui/icons-material/History';
import BlameIcon from '@mui/icons-material/PersonSearchOutlined';
import { api, qs } from '../api/client.js';
import CommitDialog, { fmtDate } from '../components/CommitDialog.jsx';

const STATUS = { A: ['Añadido', 'success'], M: ['Modificado', 'warning'], D: ['Eliminado', 'error'], R: ['Renombrado', 'info'], C: ['Copiado', 'info'] };
const MAX_LINES = 8000;

// Tiempo relativo corto: «hace 3 días», «hace 2 meses»…
function ago(t) {
  const s = (Date.now() - t) / 1000;
  const units = [[31536000, 'año', 'años'], [2592000, 'mes', 'meses'], [604800, 'semana', 'semanas'], [86400, 'día', 'días'], [3600, 'hora', 'horas'], [60, 'minuto', 'minutos']];
  for (const [n, one, many] of units) if (s >= n) { const v = Math.floor(s / n); return `hace ${v} ${v === 1 ? one : many}`; }
  return 'hace un momento';
}

// Historial de un archivo (siguiendo renombrados) y blame línea a línea.
export default function FileHistory({ repoId, file: initialFile, version, notify }) {
  const theme = useTheme();
  const [files, setFiles] = useState(null);
  const [file, setFile] = useState(initialFile || null);
  const [view, setView] = useState('log');
  const [log, setLog] = useState(null);
  const [blame, setBlame] = useState(null);
  const [rev, setRev] = useState(null); // { hash, short } para blame en una versión anterior
  const [detail, setDetail] = useState(null);

  useEffect(() => { if (initialFile) { setFile(initialFile); setRev(null); } }, [initialFile]);
  useEffect(() => { api.get(`/repos/${repoId}/files`).then((r) => setFiles(r.files)).catch(() => setFiles([])); }, [repoId, version]);

  useEffect(() => {
    if (!file || view !== 'log') return;
    setLog(null);
    api.get(`/repos/${repoId}/file-log${qs({ file })}`).then(setLog).catch((e) => { notify(e.message, 'error'); setLog([]); });
  }, [repoId, file, view, version]);

  useEffect(() => {
    if (!file || view !== 'blame') return;
    setBlame(null);
    api.get(`/repos/${repoId}/blame${qs({ file: rev?.path || file, rev: rev?.hash })}`).then(setBlame).catch((e) => setBlame({ error: e.message }));
  }, [repoId, file, view, rev, version]);

  // Antigüedad de cada commit en [0, 1] para colorear la barra lateral (más reciente = más intenso).
  const age = useMemo(() => {
    if (!blame?.commits) return {};
    const times = Object.values(blame.commits).map((c) => c.time).filter(Boolean);
    const min = Math.min(...times), max = Math.max(...times);
    return Object.fromEntries(Object.values(blame.commits).map((c) => [c.hash, c.uncommitted ? 1 : max > min ? (c.time - min) / (max - min) : 1]));
  }, [blame]);

  const picker = (
    <Autocomplete size="small" options={files || []} loading={!files} value={file} sx={{ flex: 1, minWidth: 260 }}
      onChange={(e, v) => { setFile(v); setRev(null); }}
      filterOptions={(opts, { inputValue }) => { const t = inputValue.toLowerCase(); return (t ? opts.filter((o) => o.toLowerCase().includes(t)) : opts).slice(0, 200); }}
      renderInput={(p) => <TextField {...p} label="Archivo" placeholder="Busca un archivo del repositorio"
        InputProps={{ ...p.InputProps, startAdornment: <><InputAdornment position="start"><FileIcon fontSize="small" /></InputAdornment>{p.InputProps.startAdornment}</> }} />}
      ListboxProps={{ sx: { fontFamily: theme.typography.fontFamilyCode, fontSize: 12.5 } }} />
  );

  const blameView = () => {
    if (!blame) return <LinearProgress />;
    if (blame.error) return <Typography color="error">{blame.error}</Typography>;
    const shown = blame.lines.slice(0, MAX_LINES);
    const primary = theme.palette.primary.main;
    return (
      <Paper variant="outlined" sx={{ overflow: 'auto', maxHeight: { md: 'calc(100vh - 330px)' } }}>
        <Box sx={{ minWidth: 'fit-content', fontFamily: theme.typography.fontFamilyCode, fontSize: 12.5, lineHeight: '20px' }}>
          {shown.map((l, i) => {
            const c = blame.commits[l.hash];
            const first = i === 0 || shown[i - 1].hash !== l.hash;
            return (
              <Box key={i} sx={{ display: 'flex', borderTop: first && i ? 1 : 0, borderColor: 'divider' }}>
                <Tooltip placement="right" enterDelay={400} title={first ? <><b>{c.summary}</b><br />{c.author} · {c.time ? fmtDate(c.time) : ''}<br />{c.short}</> : ''}>
                  <Box onClick={() => !c.uncommitted && setDetail({ hash: c.hash, short: c.short, subject: c.summary })}
                    sx={{
                      width: 300, flexShrink: 0, display: 'flex', gap: 1, px: 1, cursor: c.uncommitted ? 'default' : 'pointer',
                      borderLeft: 3, borderLeftColor: alpha(primary, 0.15 + 0.85 * (age[l.hash] ?? 0)),
                      bgcolor: alpha(primary, 0.02 + 0.08 * (age[l.hash] ?? 0)), borderRight: 1, borderRightColor: 'divider',
                      fontFamily: theme.typography.fontFamily, fontSize: 12, color: 'text.secondary', '&:hover': { color: 'text.primary' },
                    }}>
                    {first && <>
                      <Box component="span" sx={{ color: c.uncommitted ? 'warning.main' : 'primary.main', fontFamily: theme.typography.fontFamilyCode, flexShrink: 0 }}>{c.short}</Box>
                      <Box component="span" sx={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.author}</Box>
                      <Box component="span" sx={{ flexShrink: 0 }}>{c.time ? ago(c.time) : ''}</Box>
                    </>}
                  </Box>
                </Tooltip>
                <Box component="span" sx={{ width: 52, flexShrink: 0, textAlign: 'right', pr: 1, color: 'text.disabled', userSelect: 'none', borderRight: 1, borderColor: 'divider' }}>{i + 1}</Box>
                <Box component="span" sx={{ whiteSpace: 'pre', pl: 1.5, pr: 2 }}>{l.text || ' '}</Box>
              </Box>
            );
          })}
        </Box>
        {blame.lines.length > MAX_LINES && <Typography variant="caption" color="text.secondary" sx={{ p: 1, display: 'block' }}>Se muestran las primeras {MAX_LINES} líneas de {blame.lines.length}.</Typography>}
      </Paper>
    );
  };

  const logView = () => {
    if (!log) return <LinearProgress />;
    if (!log.length) return <Typography color="text.secondary">No hay commits para este archivo.</Typography>;
    return (
      <Paper variant="outlined">
        {log.map((c) => {
          const [label, color] = STATUS[c.status] || STATUS.M;
          return (
            <Stack key={c.hash} direction="row" alignItems="center" spacing={1.5} onClick={() => setDetail(c)}
              sx={{ px: 2, py: 1, cursor: 'pointer', borderBottom: 1, borderColor: 'divider', '&:last-of-type': { borderBottom: 0 }, '&:hover': { bgcolor: 'action.hover' } }}>
              <Chip size="small" color={color} variant="outlined" label={label} sx={{ minWidth: 96 }} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography noWrap fontSize={14}>
                  <Box component="span" sx={{ fontFamily: theme.typography.fontFamilyCode, color: 'primary.main', mr: 1 }}>{c.short}</Box>{c.subject}
                </Typography>
                <Typography variant="caption" color="text.secondary" component="div" noWrap>
                  {c.author} · {fmtDate(c.date)}
                  {c.path !== file && <> · como <Box component="span" sx={{ fontFamily: theme.typography.fontFamilyCode }}>{c.path}</Box></>}
                  {c.from && <> · antes <Box component="span" sx={{ fontFamily: theme.typography.fontFamilyCode }}>{c.from}</Box></>}
                </Typography>
              </Box>
              {c.status !== 'D' && (
                <Tooltip title="Ver quién escribió cada línea en esta versión">
                  <Button size="small" onClick={(e) => { e.stopPropagation(); setRev({ hash: c.hash, short: c.short, path: c.path }); setView('blame'); }}>Blame aquí</Button>
                </Tooltip>
              )}
            </Stack>
          );
        })}
      </Paper>
    );
  };

  return (
    <Box>
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
        {picker}
        <ToggleButtonGroup size="small" exclusive value={view} onChange={(e, v) => v && setView(v)} sx={{ '& .MuiToggleButton-root': { gap: 0.75, px: 1.5, textTransform: 'none' } }}>
          <ToggleButton value="log"><HistoryIcon fontSize="small" />Historial</ToggleButton>
          <ToggleButton value="blame"><BlameIcon fontSize="small" />Blame</ToggleButton>
        </ToggleButtonGroup>
      </Stack>
      {view === 'blame' && rev && (
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
          <Chip size="small" color="primary" variant="outlined" label={`Versión ${rev.short}`} onDelete={() => setRev(null)} />
          <Typography variant="caption" color="text.secondary">Quita la versión para ver el blame del archivo actual.</Typography>
        </Stack>
      )}
      {!file ? (
        <Typography color="text.secondary">Elige un archivo para ver su historial (incluidos los renombrados) o quién escribió cada línea.</Typography>
      ) : view === 'log' ? logView() : blameView()}
      <CommitDialog repoId={repoId} commit={detail} file={detail?.path || (detail ? (rev?.path || file) : undefined)} from={detail?.from || undefined} onClose={() => setDetail(null)} />
    </Box>
  );
}
