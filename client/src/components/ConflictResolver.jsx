import { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, ButtonGroup, Chip, LinearProgress, Paper, Stack, TextField, Tooltip, Typography } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import CheckIcon from '@mui/icons-material/TaskAlt';
import { api, qs } from '../api/client.js';

// Separa el archivo en texto común y bloques de conflicto (<<<<<<< ours ||||||| base ======= theirs >>>>>>>).
// Se conservan los finales de línea originales (CRLF incluidos).
export function parseConflicts(content) {
  const lines = content.split(/(?<=\n)/);
  const parts = [];
  let text = '', block = null, zone = null;
  const is = (l, mark) => l.startsWith(mark) && (l.length === 7 || /^[ \r\n]/.test(l[7]));
  for (const l of lines) {
    if (!block && is(l, '<<<<<<<')) {
      if (text) parts.push({ text }); text = '';
      block = { ours: '', base: '', theirs: '', oursLabel: l.slice(8).trim(), theirsLabel: '' }; zone = 'ours';
    } else if (block && zone === 'ours' && is(l, '|||||||')) zone = 'base';
    else if (block && zone !== 'theirs' && is(l, '=======')) zone = 'theirs';
    else if (block && zone === 'theirs' && is(l, '>>>>>>>')) {
      block.theirsLabel = l.slice(8).trim(); parts.push({ conflict: block }); block = null;
    } else if (block) block[zone] += l;
    else text += l;
  }
  if (block) text += `<<<<<<< ${block.oursLabel}\n${block.ours}=======\n${block.theirs}`; // bloque sin cerrar: se deja tal cual
  if (text) parts.push({ text });
  return parts;
}

const CHOICES = {
  ours: (c) => c.ours,
  theirs: (c) => c.theirs,
  both: (c) => c.ours + c.theirs,
  bothRev: (c) => c.theirs + c.ours,
};
const markers = (c) => `<<<<<<< ${c.oursLabel}\n${c.ours}=======\n${c.theirs}>>>>>>> ${c.theirsLabel}\n`;

const OP_HINT = {
  rebase: 'Durante un rebase, «actual» es la rama sobre la que se reaplica y «entrante» es tu commit.',
  merge: '«Actual» es tu rama; «entrante» es la rama que estás fusionando.',
  'cherry-pick': '«Actual» es tu rama; «entrante» es el commit que estás aplicando.',
  revert: '«Actual» es tu rama; «entrante» es el revert del commit.',
};

export default function ConflictResolver({ repoId, file, onResolved, notify }) {
  const theme = useTheme();
  const [data, setData] = useState(null);
  const [choice, setChoice] = useState({});
  const [edited, setEdited] = useState(null); // texto editado a mano; null = se calcula a partir de las elecciones
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setData(null); setChoice({}); setEdited(null);
    api.get(`/repos/${repoId}/conflict${qs({ file })}`).then(setData).catch((e) => setData({ error: e.message }));
  }, [repoId, file]);

  const parts = useMemo(() => (data?.content ? parseConflicts(data.content) : []), [data]);
  const blocks = parts.filter((p) => p.conflict);
  const result = useMemo(() => parts.map((p, i) => (p.text ?? (choice[i] ? CHOICES[choice[i]](p.conflict) : markers(p.conflict)))).join(''), [parts, choice]);
  const pending = parts.filter((p, i) => p.conflict && !choice[i]).length;
  const text = edited ?? result;

  const resolve = async (body, msg) => {
    setBusy(true);
    try { await api.post(`/repos/${repoId}/conflict/resolve`, { file, ...body }); notify(msg, 'success', { title: file }); onResolved(); }
    catch (e) { notify(e.message, 'error', { title: 'No se pudo resolver' }); }
    finally { setBusy(false); }
  };
  const pickAll = (c) => { setEdited(null); setChoice(Object.fromEntries(parts.map((p, i) => [i, p.conflict ? c : undefined]).filter(([, v]) => v))); };

  if (!data) return <LinearProgress />;
  if (data.error) return <Alert severity="error">{data.error}</Alert>;

  const sideBox = (label, body, color, chosen) => (
    <Box sx={{ minWidth: 0, border: 1, borderRadius: 1, borderColor: chosen ? color : alpha(color, 0.35), bgcolor: alpha(color, chosen ? 0.14 : 0.06) }}>
      <Typography variant="caption" sx={{ display: 'block', px: 1, py: 0.25, fontWeight: 700, color, borderBottom: 1, borderColor: alpha(color, 0.25) }}>{label}</Typography>
      <Box component="pre" sx={{ m: 0, p: 1, fontFamily: theme.typography.fontFamilyCode, fontSize: 12.5, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 260, overflow: 'auto' }}>
        {body || <Box component="span" sx={{ color: 'text.disabled', fontStyle: 'italic' }}>(vacío)</Box>}
      </Box>
    </Box>
  );
  const ours = theme.palette.info.main, theirs = theme.palette.secondary?.main || theme.palette.warning.main;

  return (
    <Stack spacing={2}>
      <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap>
        <Chip size="small" color="error" label="Conflicto" />
        <Typography variant="subtitle2" sx={{ fontFamily: theme.typography.fontFamilyCode }}>{file}</Typography>
        <Box sx={{ flexGrow: 1 }} />
        <ButtonGroup size="small" variant="outlined" disabled={busy}>
          <Tooltip title="Descarta los cambios entrantes y conserva tu versión completa del archivo">
            <Button onClick={() => resolve({ side: 'ours' }, 'Resuelto con la versión actual')}>Usar todo lo actual</Button>
          </Tooltip>
          <Tooltip title="Reemplaza el archivo por la versión entrante completa">
            <Button onClick={() => resolve({ side: 'theirs' }, 'Resuelto con la versión entrante')}>Usar todo lo entrante</Button>
          </Tooltip>
        </ButtonGroup>
      </Stack>
      {data.operation && <Typography variant="body2" color="text.secondary">{OP_HINT[data.operation]}</Typography>}

      {!data.exists || !data.ours || !data.theirs ? (
        <Alert severity="warning">
          {!data.ours ? 'Tu rama eliminó este archivo y la otra parte lo modificó.' : !data.theirs ? 'La otra parte eliminó este archivo y tu rama lo modificó.' : 'El archivo no existe en el árbol de trabajo.'}
          {' '}Elige con los botones de arriba qué versión conservar.
        </Alert>
      ) : blocks.length === 0 ? (
        <Alert severity="info" action={<Button color="inherit" disabled={busy} onClick={() => resolve({ content: data.content }, 'Marcado como resuelto')}>Marcar como resuelto</Button>}>
          El archivo ya no tiene marcadores de conflicto. Si el contenido es correcto, márcalo como resuelto.
        </Alert>
      ) : (
        <>
          <Stack direction="row" alignItems="center" spacing={1}>
            <Typography variant="body2" sx={{ flexGrow: 1 }}>
              {blocks.length} {blocks.length === 1 ? 'conflicto' : 'conflictos'} · {pending ? `${pending} sin decidir` : 'todos decididos'}
            </Typography>
            <Button size="small" onClick={() => pickAll('ours')}>Todo actual</Button>
            <Button size="small" onClick={() => pickAll('theirs')}>Todo entrante</Button>
          </Stack>
          {parts.map((p, i) => p.conflict && (
            <Paper key={i} variant="outlined" sx={{ p: 1.5 }}>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }} flexWrap="wrap" useFlexGap>
                <Typography variant="caption" fontWeight={700}>Conflicto {blocks.indexOf(p) + 1}</Typography>
                {choice[i] && <Chip size="small" icon={<CheckIcon />} color="success" variant="outlined" label="Decidido" />}
                <Box sx={{ flexGrow: 1 }} />
                <ButtonGroup size="small">
                  {[['ours', 'Aceptar actual'], ['theirs', 'Aceptar entrante'], ['both', 'Ambos'], ['bothRev', 'Ambos (entrante primero)']].map(([k, label]) => (
                    <Button key={k} variant={choice[i] === k ? 'contained' : 'outlined'} onClick={() => { setEdited(null); setChoice((c) => ({ ...c, [i]: k })); }}>{label}</Button>
                  ))}
                </ButtonGroup>
              </Stack>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 1fr) minmax(0, 1fr)' }, gap: 1 }}>
                {sideBox(`Actual · ${p.conflict.oursLabel || 'HEAD'}`, p.conflict.ours, ours, choice[i] === 'ours' || choice[i]?.startsWith('both'))}
                {sideBox(`Entrante · ${p.conflict.theirsLabel || 'otra rama'}`, p.conflict.theirs, theirs, choice[i] === 'theirs' || choice[i]?.startsWith('both'))}
              </Box>
            </Paper>
          ))}
          <Box>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
              <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>Resultado {edited != null && <Chip size="small" label="editado a mano" sx={{ ml: 1 }} />}</Typography>
              {edited != null && <Button size="small" onClick={() => setEdited(null)}>Descartar edición</Button>}
            </Stack>
            <TextField fullWidth multiline minRows={8} maxRows={24} value={text} onChange={(e) => setEdited(e.target.value)}
              InputProps={{ sx: { fontFamily: theme.typography.fontFamilyCode, fontSize: 12.5, lineHeight: 1.6 } }} />
          </Box>
          <Stack direction="row" justifyContent="flex-end">
            <Tooltip title={/^(<{7}|>{7})( |\r?$)/m.test(text) ? 'Aún quedan marcadores de conflicto en el resultado' : ''}>
              <span>
                <Button variant="contained" startIcon={<CheckIcon />} disabled={busy || /^(<{7}|>{7})( |\r?$)/m.test(text)}
                  onClick={() => resolve({ content: text }, 'Conflicto resuelto y archivo preparado')}>Guardar y marcar como resuelto</Button>
              </span>
            </Tooltip>
          </Stack>
        </>
      )}
    </Stack>
  );
}
