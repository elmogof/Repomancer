import { useEffect, useState } from 'react';
import {
  Alert, Autocomplete, Box, Chip, IconButton, LinearProgress, List, ListItemButton, ListItemText, ListSubheader, Paper, Stack,
  TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import SwapIcon from '@mui/icons-material/SwapHoriz';
import CommitIcon from '@mui/icons-material/Commit';
import { api, qs } from '../api/client.js';
import DiffView from '../components/DiffView.jsx';
import CommitDialog, { fmtDate } from '../components/CommitDialog.jsx';

const STATUS_COLOR = { M: 'warning', A: 'success', D: 'error', R: 'info', C: 'info', T: 'default' };
const STATUS_LABEL = { M: 'Modificado', A: 'Añadido', D: 'Eliminado', R: 'Renombrado', C: 'Copiado', T: 'Tipo' };

// Compara dos ramas, tags o commits: commits de diferencia, archivos cambiados y diff de cada archivo.
export default function Compare({ repoId, initial, version, notify }) {
  const theme = useTheme();
  const [refs, setRefs] = useState([]);
  const [base, setBase] = useState(initial?.base || '');
  const [head, setHead] = useState(initial?.head || '');
  const [mode, setMode] = useState('three');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState(null);
  const [diff, setDiff] = useState(null);
  const [detail, setDetail] = useState(null);

  useEffect(() => { if (initial) { setBase(initial.base || ''); setHead(initial.head || ''); } }, [initial]);

  // Ramas locales, remotas y tags para los selectores (también se puede escribir un hash).
  useEffect(() => {
    Promise.all([api.get(`/repos/${repoId}/branches`).catch(() => []), api.get(`/repos/${repoId}/tags`).catch(() => [])]).then(([b, t]) => {
      setRefs([
        ...b.filter((x) => !x.remote).map((x) => ({ name: x.name, group: 'Ramas locales', current: x.current })),
        ...b.filter((x) => x.remote).map((x) => ({ name: x.name, group: 'Ramas remotas' })),
        ...t.map((x) => ({ name: x.name, group: 'Tags' })),
      ]);
      if (!initial) {
        const cur = b.find((x) => x.current)?.name;
        const main = ['main', 'master', 'develop', 'origin/main', 'origin/master'].find((n) => b.some((x) => x.name === n && n !== cur));
        if (cur && !head) setHead(cur);
        if (main && !base) setBase(main);
      }
    });
  }, [repoId, version]);

  useEffect(() => {
    setFile(null); setDiff(null);
    if (!base || !head) { setResult(null); return; }
    setLoading(true);
    api.get(`/repos/${repoId}/compare${qs({ base, head, mode })}`)
      .then(setResult).catch((e) => setResult({ error: e.message })).finally(() => setLoading(false));
  }, [repoId, base, head, mode, version]);

  useEffect(() => {
    if (!file) { setDiff(null); return; }
    setDiff(null);
    api.get(`/repos/${repoId}/compare/diff${qs({ base, head, mode, file: file.path, from: file.from })}`)
      .then((d) => setDiff(d.diff)).catch((e) => notify(e.message, 'error'));
  }, [file]);

  const picker = (label, value, onChange) => (
    <Autocomplete size="small" freeSolo options={refs} groupBy={(o) => o.group} sx={{ flex: 1, minWidth: 220 }}
      getOptionLabel={(o) => (typeof o === 'string' ? o : o.name)} value={value || null}
      onChange={(e, v) => onChange(typeof v === 'string' ? v.trim() : v?.name || '')}
      onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== value) onChange(v); }}
      renderOption={({ key, ...p }, o) => <li key={key} {...p}>{o.name}{o.current && <Chip size="small" label="actual" color="primary" sx={{ ml: 1, height: 18 }} />}</li>}
      renderInput={(p) => <TextField {...p} label={label} placeholder="rama, tag o hash" />} />
  );

  return (
    <Box>
      <Paper variant="outlined" sx={{ p: 1.5, mb: 2 }}>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          {picker('Base (A)', base, setBase)}
          <Tooltip title="Intercambiar A y B"><IconButton onClick={() => { setBase(head); setHead(base); }}><SwapIcon /></IconButton></Tooltip>
          {picker('Comparar (B)', head, setHead)}
          <ToggleButtonGroup size="small" exclusive value={mode} onChange={(e, v) => v && setMode(v)} sx={{ '& .MuiToggleButton-root': { textTransform: 'none', px: 1.5 } }}>
            <Tooltip title="Solo lo que cambió en B desde que se separó de A (lo que traería un merge de B en A)"><ToggleButton value="three">Cambios de B (A...B)</ToggleButton></Tooltip>
            <Tooltip title="Diferencia directa entre el contenido de A y el de B"><ToggleButton value="two">Diferencia directa (A..B)</ToggleButton></Tooltip>
          </ToggleButtonGroup>
        </Stack>
      </Paper>

      {loading && <LinearProgress sx={{ mb: 1 }} />}
      {!base || !head ? <Typography color="text.secondary">Elige dos ramas, tags o commits para compararlos.</Typography>
        : result?.error ? <Alert severity="error">{result.error}</Alert>
        : result && (
          <>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
              <Chip color="primary" variant="outlined" label={`${result.ahead} ${result.ahead === 1 ? 'commit' : 'commits'} en B que A no tiene`} />
              <Chip variant="outlined" label={`${result.behind} en A que B no tiene`} />
              <Chip variant="outlined" label={`${result.files.length} ${result.files.length === 1 ? 'archivo' : 'archivos'}`} />
              {result.mergeBase ? <Typography variant="caption" color="text.secondary">Ancestro común: <Box component="span" sx={{ fontFamily: theme.typography.fontFamilyCode }}>{result.mergeBase}</Box></Typography>
                : <Typography variant="caption" color="warning.main">Sin historia en común</Typography>}
            </Stack>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '340px 1fr' }, gap: 2, alignItems: 'start' }}>
              <Stack spacing={2}>
                <Paper variant="outlined" sx={{ maxHeight: 320, overflow: 'auto' }}>
                  <List dense disablePadding>
                    <ListSubheader>Commits de B que A no tiene ({result.commits.length}{result.commits.length >= 300 ? '+' : ''})</ListSubheader>
                    {result.commits.length === 0 && <Typography variant="body2" color="text.secondary" sx={{ px: 2, pb: 1.5 }}>Ninguno: B no tiene commits nuevos respecto a A.</Typography>}
                    {result.commits.map((c) => (
                      <ListItemButton key={c.hash} dense onClick={() => setDetail(c)} sx={{ alignItems: 'flex-start' }}>
                        <CommitIcon fontSize="small" color="primary" sx={{ mr: 1, mt: 0.25 }} />
                        <ListItemText primary={c.subject} secondary={<><Box component="span" sx={{ fontFamily: theme.typography.fontFamilyCode, color: 'primary.main' }}>{c.short}</Box> · {c.author} · {fmtDate(c.date)}</>}
                          primaryTypographyProps={{ noWrap: true, fontSize: 14, title: c.subject }} secondaryTypographyProps={{ fontSize: 11 }} />
                      </ListItemButton>
                    ))}
                  </List>
                </Paper>
                <Paper variant="outlined" sx={{ maxHeight: { md: 'calc(100vh - 640px)' }, minHeight: 160, overflow: 'auto' }}>
                  <List dense disablePadding>
                    <ListSubheader>Archivos ({result.files.length})</ListSubheader>
                    {result.files.length === 0 && <Typography variant="body2" color="text.secondary" sx={{ px: 2, pb: 1.5 }}>No hay diferencias de contenido.</Typography>}
                    {result.files.map((f) => (
                      <ListItemButton key={f.path} dense selected={file?.path === f.path} onClick={() => setFile(f)}>
                        <Chip size="small" label={f.status} color={STATUS_COLOR[f.status] || 'default'} title={STATUS_LABEL[f.status]} sx={{ mr: 1, minWidth: 28, fontFamily: 'monospace' }} />
                        <ListItemText primary={f.path.split('/').pop()}
                          secondary={f.from ? `desde ${f.from}` : f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/')) : null}
                          primaryTypographyProps={{ noWrap: true, fontSize: 14 }} secondaryTypographyProps={{ noWrap: true, fontSize: 11 }} />
                        {f.additions != null && (
                          <Typography variant="caption" sx={{ ml: 1, whiteSpace: 'nowrap' }}>
                            <Box component="span" sx={{ color: 'success.main' }}>+{f.additions}</Box> <Box component="span" sx={{ color: 'error.main' }}>−{f.deletions}</Box>
                          </Typography>
                        )}
                      </ListItemButton>
                    ))}
                  </List>
                </Paper>
              </Stack>
              <Box sx={{ minWidth: 0 }}>
                {file ? (
                  <>
                    <Typography variant="subtitle2" sx={{ mb: 1, fontFamily: theme.typography.fontFamilyCode }}>{file.from ? `${file.from} → ` : ''}{file.path}</Typography>
                    {diff == null ? <LinearProgress /> : <DiffView diff={diff} />}
                  </>
                ) : result.files.length > 0 && <Typography color="text.secondary">Selecciona un archivo para ver sus diferencias.</Typography>}
              </Box>
            </Box>
          </>
        )}
      <CommitDialog repoId={repoId} commit={detail} onClose={() => setDetail(null)} />
    </Box>
  );
}
