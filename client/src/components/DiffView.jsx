import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Button, Stack, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import UnifiedIcon from '@mui/icons-material/ViewStream';
import SplitIcon from '@mui/icons-material/VerticalSplit';

const META_RE = /^(diff --git|index |--- |\+\+\+ |new file|deleted file|similarity|rename |old mode|new mode|Binary files)/;
const MODE_KEY = 'gm-diff-mode';
const MODE_EVENT = 'gm-diff-mode';

// Modo de vista compartido por todos los DiffView de la página y recordado en el navegador.
function useDiffMode() {
  const [mode, setMode] = useState(() => { try { return localStorage.getItem(MODE_KEY) || 'unified'; } catch { return 'unified'; } });
  useEffect(() => {
    const sync = (e) => setMode(e.detail);
    window.addEventListener(MODE_EVENT, sync);
    return () => window.removeEventListener(MODE_EVENT, sync);
  }, []);
  const change = (m) => {
    if (!m) return;
    try { localStorage.setItem(MODE_KEY, m); } catch { /* sin almacenamiento */ }
    window.dispatchEvent(new CustomEvent(MODE_EVENT, { detail: m }));
  };
  return [mode, change];
}

// Convierte el diff unificado en líneas tipadas con sus números de línea.
// i: índice de la línea; hunk: índice de la línea de cabecera del bloque al que pertenece.
function parse(diff) {
  let oldN = 0, newN = 0, hunk = -1;
  return diff.replace(/\n$/, '').split('\n').map((raw, i) => {
    if (raw.startsWith('@@')) {
      const m = raw.match(/@@ -(\d+)(?:,\d+)? \+(\d+)/);
      if (m) { oldN = +m[1]; newN = +m[2]; }
      hunk = i;
      return { type: 'hunk', text: raw, raw, i, hunk };
    }
    if (META_RE.test(raw)) { hunk = -1; return { type: 'meta', text: raw, raw, i, hunk }; }
    if (raw.startsWith('\\')) return { type: 'note', text: raw, raw, i, hunk };
    if (raw.startsWith('+')) return { type: 'add', text: raw.slice(1), raw, i, hunk, n: newN++ };
    if (raw.startsWith('-')) return { type: 'del', text: raw.slice(1), raw, i, hunk, o: oldN++ };
    return { type: 'ctx', text: raw.slice(1), raw, i, hunk, o: oldN++, n: newN++ };
  });
}

// Construye un parche con solo las líneas elegidas.
// Directo (stage): los añadidos no elegidos se omiten y las eliminaciones no elegidas pasan a contexto.
// Inverso (unstage/discard, se aplica con --reverse): al revés.
export function buildPatch(lines, chosen, reverse) {
  const header = [];
  for (const l of lines) { if (l.type === 'hunk') break; header.push(l.raw); }
  if (!header[0]?.startsWith('diff --git ')) return null;
  const out = [...header];
  let hunkHead = null, body = [], any = false, lastKept = false;
  const flush = () => { if (hunkHead && any) out.push(hunkHead, ...body); body = []; any = false; };
  for (const l of lines) {
    if (l.type === 'hunk') { flush(); hunkHead = l.raw; lastKept = false; continue; }
    if (!hunkHead || l.type === 'meta') continue;
    const sel = chosen.has(l.i);
    if (l.type === 'ctx') { body.push(l.raw); lastKept = true; }
    else if (l.type === 'note') { if (lastKept) body.push(l.raw); }
    else if (sel) { body.push(l.raw); any = true; lastKept = true; }
    else if ((l.type === 'del') !== reverse) { body.push(` ${l.text}`); lastKept = true; } // pasa a contexto
    else lastKept = false; // se omite
  }
  flush();
  return out.length > header.length ? `${out.join('\n')}\n` : null;
}

// Empareja eliminaciones y añadidos consecutivos para la vista lado a lado.
function toSplit(lines) {
  const rows = [];
  let dels = [], adds = [];
  const flush = () => {
    for (let i = 0; i < Math.max(dels.length, adds.length); i++) rows.push({ left: dels[i] || null, right: adds[i] || null });
    dels = []; adds = [];
  };
  for (const l of lines) {
    if (l.type === 'del') { if (adds.length) flush(); dels.push(l); }
    else if (l.type === 'add') adds.push(l);
    else {
      flush();
      if (l.type === 'ctx') rows.push({ left: l, right: l });
      else rows.push({ full: l });
    }
  }
  flush();
  return rows;
}

const changed = (l) => l && (l.type === 'add' || l.type === 'del');

// select (opcional): { actions: [{ mode, label, color }], onApply(patch, mode) } habilita elegir líneas o bloques.
export default function DiffView({ diff, maxHeight, select }) {
  const theme = useTheme();
  const [mode, setMode] = useDiffMode();
  const lines = useMemo(() => (diff ? parse(diff) : []), [diff]);
  const split = useMemo(() => (mode === 'split' ? toSplit(lines) : null), [lines, mode]);
  const [chosen, setChosen] = useState(() => new Set());
  const anchor = useRef(null);
  useEffect(() => { setChosen(new Set()); anchor.current = null; }, [diff]);

  const selectable = !!select && lines[0]?.raw.startsWith('diff --git ');
  if (!diff) return <Typography color="text.secondary" sx={{ p: 2 }}>Sin diferencias.</Typography>;

  const adds = lines.filter((l) => l.type === 'add').length;
  const dels = lines.filter((l) => l.type === 'del').length;

  const bg = {
    add: alpha(theme.palette.success.main, 0.15),
    del: alpha(theme.palette.error.main, 0.15),
    hunk: alpha(theme.palette.info.main, 0.12),
    empty: alpha(theme.palette.text.primary, 0.03),
  };
  const selBg = alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.32 : 0.22);
  const fg = { hunk: theme.palette.info.main, meta: theme.palette.text.secondary, note: theme.palette.text.secondary };
  const sign = { add: '+', del: '-', ctx: ' ' };
  const lineBg = (l) => (l && chosen.has(l.i) ? selBg : l ? bg[l.type] : bg.empty);

  // Clic: alterna la línea · Mayús+clic: selecciona el rango desde la última línea pulsada.
  const toggle = (l, e) => {
    if (!selectable || !changed(l)) return;
    setChosen((prev) => {
      const next = new Set(prev);
      if (e.shiftKey && anchor.current != null) {
        const [a, b] = [Math.min(anchor.current, l.i), Math.max(anchor.current, l.i)];
        lines.slice(a, b + 1).filter(changed).forEach((x) => next.add(x.i));
      } else if (next.has(l.i)) next.delete(l.i);
      else next.add(l.i);
      return next;
    });
    anchor.current = l.i;
  };
  const pick = selectable ? { cursor: 'pointer', '&:hover': { filter: 'brightness(1.15)' } } : {};

  const apply = (set, m) => {
    const patch = buildPatch(lines, set, m !== 'stage');
    if (patch) select.onApply(patch, m);
  };
  const hunkSet = (h) => new Set(lines.filter((l) => l.hunk === h && changed(l)).map((l) => l.i));

  const hunkActions = (l) => selectable && (
    <Stack direction="row" spacing={0.5} sx={{ ml: 'auto', pl: 1, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
      {select.actions.map((a) => (
        <Button key={a.mode} size="small" color={a.color || 'primary'} onClick={() => apply(hunkSet(l.i), a.mode)}
          sx={{ py: 0, minHeight: 0, fontSize: 11, lineHeight: 1.8, textTransform: 'none' }}>{a.label} bloque</Button>
      ))}
    </Stack>
  );

  const unifiedRow = (l) => (
    <Box key={l.i} onClick={(e) => toggle(l, e)} sx={{ display: 'flex', alignItems: 'center', bgcolor: lineBg(l), color: fg[l.type], ...(changed(l) ? pick : {}) }}>
      <Box component="span" sx={num}>{l.o ?? ''}</Box>
      <Box component="span" sx={num}>{l.n ?? ''}</Box>
      <Box component="span" sx={{ whiteSpace: 'pre', pl: 1, pr: 2 }}>{(sign[l.type] ?? '') + (l.text || ' ')}</Box>
      {l.type === 'hunk' && hunkActions(l)}
    </Box>
  );

  // Una mitad de la vista lado a lado: número + código (con salto de línea para que ambas columnas se alineen).
  const half = (l, side, i) => {
    const isChange = changed(l);
    const cellBg = l ? (isChange ? lineBg(l) : undefined) : bg.empty;
    const extra = isChange ? pick : {};
    return [
      <Box key={`${i}${side}n`} component="span" onClick={(e) => toggle(l, e)} sx={{ ...num, width: 'auto', bgcolor: cellBg, ...extra }}>
        {l ? (side === 'L' ? l.o : l.n) : ''}
      </Box>,
      <Box key={`${i}${side}c`} component="span" onClick={(e) => toggle(l, e)} sx={{
        whiteSpace: 'pre-wrap', wordBreak: 'break-all', pl: 1, pr: 1, minWidth: 0, bgcolor: cellBg,
        borderRight: side === 'L' ? 1 : 0, borderColor: 'divider', ...extra,
      }}>{l ? (isChange ? sign[l.type] : ' ') + (l.text || ' ') : ''}</Box>,
    ];
  };

  return (
    <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, overflow: 'hidden', bgcolor: alpha(theme.palette.background.default, 0.6) }}>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ px: 1.5, py: 0.5, minHeight: 40, borderBottom: 1, borderColor: 'divider', bgcolor: alpha(theme.palette.text.primary, 0.03) }}>
        {chosen.size > 0 ? (
          <>
            <Typography variant="caption" sx={{ fontWeight: 700, color: 'primary.main' }}>
              {chosen.size} {chosen.size === 1 ? 'línea seleccionada' : 'líneas seleccionadas'}
            </Typography>
            {select.actions.map((a) => (
              <Button key={a.mode} size="small" variant="contained" color={a.color || 'primary'} onClick={() => apply(chosen, a.mode)}
                sx={{ py: 0.25, fontSize: 12 }}>{a.label} líneas</Button>
            ))}
            <Button size="small" onClick={() => setChosen(new Set())} sx={{ py: 0.25, fontSize: 12 }}>Limpiar</Button>
          </>
        ) : (
          <>
            <Typography variant="caption" sx={{ color: 'success.main', fontWeight: 700 }}>+{adds}</Typography>
            <Typography variant="caption" sx={{ color: 'error.main', fontWeight: 700 }}>−{dels}</Typography>
            {selectable && (
              <Typography variant="caption" color="text.secondary" noWrap sx={{ minWidth: 0 }}>
                Clic en líneas para elegirlas (Mayús+clic para un rango)
              </Typography>
            )}
          </>
        )}
        <Box sx={{ flexGrow: 1 }} />
        <ToggleButtonGroup size="small" exclusive value={mode} onChange={(e, m) => setMode(m)} sx={{ flexShrink: 0, '& .MuiToggleButton-root': { py: 0.25, px: 1, gap: 0.5, fontSize: 12, textTransform: 'none' } }}>
          <Tooltip title="Vista unificada: un solo documento con eliminaciones y añadidos intercalados">
            <ToggleButton value="unified" aria-label="Vista unificada"><UnifiedIcon sx={{ fontSize: 16 }} />Unificada</ToggleButton>
          </Tooltip>
          <Tooltip title="Lado a lado: versión anterior a la izquierda y nueva a la derecha">
            <ToggleButton value="split" aria-label="Vista lado a lado"><SplitIcon sx={{ fontSize: 16 }} />Lado a lado</ToggleButton>
          </Tooltip>
        </ToggleButtonGroup>
      </Stack>
      <Box sx={{ fontFamily: theme.typography.fontFamilyCode, fontSize: 12.5, lineHeight: 1.6, overflow: 'auto', maxHeight, userSelect: selectable ? 'none' : 'auto' }}>
        {mode === 'split' ? (
          <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(40px, auto) minmax(0, 1fr) minmax(40px, auto) minmax(0, 1fr)' }}>
            {split.map((r, i) => (r.full ? (
              <Box key={i} sx={{ gridColumn: '1 / -1', px: 1, display: 'flex', alignItems: 'center', bgcolor: bg[r.full.type], color: fg[r.full.type] }}>
                <Box component="span" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{r.full.text || ' '}</Box>
                {r.full.type === 'hunk' && hunkActions(r.full)}
              </Box>
            ) : [...half(r.left, 'L', i), ...half(r.right, 'R', i)]))}
          </Box>
        ) : (
          <Box sx={{ minWidth: 'fit-content' }}>{lines.map(unifiedRow)}</Box>
        )}
      </Box>
    </Box>
  );
}

const num = { width: 48, flexShrink: 0, textAlign: 'right', pr: 1, pl: 1, color: 'text.disabled', userSelect: 'none', borderRight: 1, borderColor: 'divider', alignSelf: 'stretch' };
