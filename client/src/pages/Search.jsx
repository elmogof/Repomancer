import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert, Box, Button, Chip, InputAdornment, LinearProgress, MenuItem, Paper, Stack, TextField,
  ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import SearchIcon from '@mui/icons-material/Search';
import FileIcon from '@mui/icons-material/InsertDriveFileOutlined';
import TextIcon from '@mui/icons-material/Notes';
import FolderIcon from '@mui/icons-material/FolderOutlined';
import CodeIcon from '@mui/icons-material/Code';
import { api, qs } from '../api/client.js';
import { useNotify } from '../components/Notify.jsx';
import { useCommands } from '../components/Commands.jsx';
import { Highlight, SearchToggles, makeMatcher, searchOptionKeys } from '../components/searchText.jsx';

// La última búsqueda se conserva al ir a un repositorio y volver.
const KEY = 'gm-search';
const stored = () => { try { return JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch { return null; } };
const DEFAULTS = { q: '', mode: 'text', scope: 'all', caseSensitive: false, wholeWord: false, regex: false, glob: '' };
let lastResult = null;


export default function Search() {
  const theme = useTheme();
  const navigate = useNavigate();
  const notify = useNotify();
  const [form, setForm] = useState(() => ({ ...DEFAULTS, ...(stored()?.form || {}) }));
  const [result, setResult] = useState(lastResult);
  const [busy, setBusy] = useState(false);
  const [groups, setGroups] = useState([]);
  const inputRef = useRef(null);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => { api.get('/workspaces?status=0').then((d) => setGroups(d.groups)).catch(() => {}); }, []);
  useEffect(() => { try { sessionStorage.setItem(KEY, JSON.stringify({ form })); } catch { /* sin almacenamiento */ } }, [form]);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const run = async () => {
    if (form.q.trim().length < 2) { notify('Escribe al menos 2 caracteres', 'warning'); return; }
    setBusy(true);
    try {
      const d = await api.get(`/search${qs({ q: form.q, mode: form.mode, scope: form.scope, case: form.caseSensitive ? '1' : undefined, word: form.wholeWord ? '1' : undefined, regex: form.regex ? '1' : undefined, glob: form.mode === 'text' ? form.glob : undefined })}`);
      lastResult = { ...d, form: { ...form } };
      setResult(lastResult);
    } catch (e) { notify(e.message, 'error'); } finally { setBusy(false); }
  };

  const openFile = async (repoId, file, line) => {
    try { await api.post(`/repos/${repoId}/open`, { target: 'vscode', file, line }); } catch (e) { notify(e.message, 'error'); }
  };

  useCommands('search', () => [
    { id: 'search:focus', group: 'Buscar en repositorios', title: 'Escribir la búsqueda', keys: '/', run: () => inputRef.current?.focus() },
  ], []);

  // Coincidencias de cada repositorio agrupadas por archivo.
  const byFile = (matches) => {
    const m = new Map();
    for (const x of matches) { if (!m.has(x.path)) m.set(x.path, []); m.get(x.path).push(x); }
    return [...m.entries()];
  };
  const shown = result?.form || form;
  // Resaltado: en texto la búsqueda es una sola frase (como git grep); en nombres, varias palabras.
  const shownMatcher = useMemo(() => makeMatcher(shown.q, shown), [shown]);
  const lineMatcher = useMemo(() => (shown.mode === 'text' && !shown.regex
    ? makeMatcher(shown.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), { ...shown, regex: true })
    : shownMatcher), [shown, shownMatcher]);
  const opts = { caseSensitive: form.caseSensitive, wholeWord: form.wholeWord, regex: form.regex };
  const formMatcher = makeMatcher(form.q, opts);

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 2 }}>Buscar en repositorios</Typography>
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Stack spacing={1.5}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
            <TextField inputRef={inputRef} fullWidth placeholder={form.mode === 'text' ? 'Texto a buscar dentro de los archivos…' : 'Parte del nombre o la ruta del archivo…'}
              value={form.q} onChange={(e) => set('q', e.target.value)}
              onKeyDown={(e) => { if (searchOptionKeys(e, opts, (o) => setForm((f) => ({ ...f, ...o })))) return; if (e.key === 'Enter') run(); }}
              error={form.regex && !formMatcher.valid} helperText={form.regex && !formMatcher.valid ? `Expresión regular inválida: ${formMatcher.error}` : undefined}
              InputProps={{
                startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>,
                endAdornment: <InputAdornment position="end"><SearchToggles value={opts} onChange={(o) => setForm((f) => ({ ...f, ...o }))} /></InputAdornment>,
                sx: { fontFamily: form.mode === 'text' ? theme.typography.fontFamilyCode : undefined },
              }} />
            <TextField select label="Dónde" value={form.scope} onChange={(e) => set('scope', e.target.value)} sx={{ minWidth: 240 }}>
              <MenuItem value="all">Todos los repositorios</MenuItem>
              {groups.map((g) => <MenuItem key={g.id} value={`group:${g.id}`}>Grupo {g.name} ({g.repos.length})</MenuItem>)}
            </TextField>
            <Button variant="contained" onClick={run} disabled={busy} startIcon={<SearchIcon />} sx={{ flexShrink: 0, px: 3 }}>Buscar</Button>
          </Stack>
          <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
            <ToggleButtonGroup size="small" exclusive value={form.mode} onChange={(e, v) => v && set('mode', v)} sx={{ '& .MuiToggleButton-root': { gap: 0.75, px: 1.5, textTransform: 'none' } }}>
              <ToggleButton value="text"><TextIcon fontSize="small" />Texto en archivos</ToggleButton>
              <ToggleButton value="files"><FileIcon fontSize="small" />Nombres de archivo</ToggleButton>
            </ToggleButtonGroup>
            {form.mode === 'text' && (
              <TextField size="small" placeholder="Solo en: *.js src/ *.sql (opcional)" value={form.glob} onChange={(e) => set('glob', e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') run(); }} sx={{ minWidth: 300 }}
                InputProps={{ startAdornment: <InputAdornment position="start"><FileIcon fontSize="small" /></InputAdornment> }} />
            )}
          </Stack>
        </Stack>
      </Paper>

      <Box sx={{ height: 4, mb: 1 }}>{busy && <LinearProgress />}</Box>
      {result && (
        <>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            {result.total === 0 ? 'Sin coincidencias' : `${result.total} ${result.total === 1 ? 'coincidencia' : 'coincidencias'} en ${result.results.filter((x) => x.matches.length).length} de ${result.searched} repositorios`}
            {` · ${(result.ms / 1000).toFixed(1)} s`}
          </Typography>
          {result.truncated && <Alert severity="info" sx={{ mb: 1.5 }}>Hay más resultados de los que se muestran. Afina la búsqueda o limítala a un grupo o a ciertos archivos.</Alert>}
          <Stack spacing={1.5}>
            {result.results.map((r) => (
              <Paper key={r.repoId} variant="outlined" sx={{ overflow: 'hidden' }}>
                <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 2, py: 1, bgcolor: 'action.hover', borderBottom: 1, borderColor: 'divider' }}>
                  <FolderIcon fontSize="small" color="primary" />
                  <Typography fontWeight={700} sx={{ flexGrow: 1, cursor: 'pointer', '&:hover': { color: 'primary.main', textDecoration: 'underline' } }}
                    onClick={() => navigate(`/repos/${r.repoId}`)}>{r.name}</Typography>
                  <Chip size="small" label={r.matches.length + (r.more ? '+' : '')} />
                </Stack>
                {r.error && <Typography variant="body2" color="error" sx={{ px: 2, py: 1 }}>{r.error}</Typography>}
                {shown.mode === 'files' ? r.matches.map((m) => (
                  <Stack key={m.path} direction="row" alignItems="center" spacing={1} onClick={() => openFile(r.repoId, m.path)}
                    sx={{ px: 2, py: 0.5, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}>
                    <FileIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                    <Typography sx={{ fontFamily: theme.typography.fontFamilyCode, fontSize: 13 }}><Highlight text={m.path} matcher={shownMatcher} /></Typography>
                  </Stack>
                )) : byFile(r.matches).map(([path, lines]) => (
                  <Box key={path} sx={{ borderTop: 1, borderColor: 'divider', '&:first-of-type': { borderTop: 0 } }}>
                    <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 2, pt: 1, pb: 0.5 }}>
                      <FileIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                      <Typography sx={{ fontFamily: theme.typography.fontFamilyCode, fontSize: 13, fontWeight: 600, flexGrow: 1, wordBreak: 'break-all' }}>{path}</Typography>
                      <Tooltip title="Abrir en VS Code"><Button size="small" startIcon={<CodeIcon />} onClick={() => openFile(r.repoId, path, lines[0].line)}>Abrir</Button></Tooltip>
                    </Stack>
                    <Box sx={{ pb: 0.5, fontFamily: theme.typography.fontFamilyCode, fontSize: 12.5 }}>
                      {lines.map((l) => (
                        <Box key={l.line} onClick={() => openFile(r.repoId, path, l.line)} title="Abrir en VS Code en esta línea"
                          sx={{ display: 'flex', cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}>
                          <Box component="span" sx={{ width: 64, flexShrink: 0, textAlign: 'right', pr: 1.5, color: 'text.disabled', userSelect: 'none' }}>{l.line}</Box>
                          <Box component="span" sx={{ whiteSpace: 'pre', overflow: 'hidden', textOverflow: 'ellipsis', pr: 2 }}>
                            <Highlight text={l.text} matcher={lineMatcher} />
                          </Box>
                        </Box>
                      ))}
                    </Box>
                  </Box>
                ))}
              </Paper>
            ))}
          </Stack>
        </>
      )}
      {!result && !busy && (
        <Typography color="text.secondary">
          Busca un texto en todos tus repositorios a la vez, o en los de un grupo. Incluye archivos sin commit; los ignorados por .gitignore no.
          Haz clic en una línea para abrirla en VS Code.
        </Typography>
      )}
    </Box>
  );
}
