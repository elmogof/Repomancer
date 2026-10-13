import { useState } from 'react';
import {
  Box, Button, Checkbox, FormControlLabel, ListItemText, Menu, MenuItem, Paper, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import GenerateIcon from '@mui/icons-material/AutoAwesome';
import TypeIcon from '@mui/icons-material/LocalOfferOutlined';
import StashIcon from '@mui/icons-material/Inventory2Outlined';
import UndoIcon from '@mui/icons-material/Undo';
import { api } from '../api/client.js';

// Tipos de Conventional Commits con su descripción.
export const COMMIT_TYPES = [
  ['feat', 'Nueva funcionalidad'],
  ['fix', 'Corrección de un error'],
  ['docs', 'Solo documentación'],
  ['style', 'Formato, sin cambios de lógica'],
  ['refactor', 'Reestructura sin cambiar el comportamiento'],
  ['perf', 'Mejora de rendimiento'],
  ['test', 'Pruebas'],
  ['build', 'Compilación o dependencias'],
  ['ci', 'Integración continua'],
  ['chore', 'Mantenimiento'],
  ['revert', 'Revierte un commit anterior'],
];
const PREFIX_RE = /^(\w+)(\(([^)]*)\))?(!)?:\s*/;

// Cambia (o añade) el prefijo «tipo(ámbito)!: » de la primera línea sin tocar el resto del mensaje.
function withPrefix(message, type, scope, breaking) {
  const [first = '', ...rest] = message.split('\n');
  const m = first.match(PREFIX_RE);
  const subject = m ? first.slice(m[0].length) : first;
  const sc = scope ?? m?.[3] ?? '';
  const br = breaking ?? !!m?.[4];
  return [`${type}${sc ? `(${sc})` : ''}${br ? '!' : ''}: ${subject}`, ...rest].join('\n');
}

// Caja de commit: mensaje con plantillas Conventional Commits, generador a partir del diff y acciones.
export default function CommitBox({
  repoId, message, setMessage, amend, setAmend, staged, busy, onCommit, onStash, onUndo, canStash, canUndo, notify, inputRef,
}) {
  const [typeMenu, setTypeMenu] = useState(null);
  const [generating, setGenerating] = useState(false);
  const prefix = message.split('\n')[0].match(PREFIX_RE);
  const disabled = !!busy || (!staged && !amend) || (!message.trim() && !amend);

  const generate = async () => {
    if (message.trim() && !window.confirm('¿Reemplazar el mensaje actual por uno generado a partir de los cambios?')) return;
    setGenerating(true);
    try {
      const r = await api.post(`/repos/${repoId}/suggest-message`);
      setMessage(r.message);
      if (!r.staged) notify('No hay cambios preparados: el mensaje describe todos los cambios del árbol.', 'info', { title: 'Mensaje generado' });
      setTimeout(() => inputRef?.current?.focus(), 0);
    } catch (e) { notify(e.message, 'error', { title: 'No se pudo generar el mensaje' }); }
    finally { setGenerating(false); }
  };

  return (
    <Paper variant="outlined" sx={{ p: 2, flexShrink: 0 }}>
      <Stack direction="row" spacing={1} sx={{ mb: 1.5 }}>
        <Tooltip title="Plantillas Conventional Commits: elige el tipo del cambio">
          <Button size="small" variant="outlined" startIcon={<TypeIcon fontSize="small" />} onClick={(e) => setTypeMenu(e.currentTarget)} sx={{ flex: 1 }}>
            {prefix ? prefix[1] : 'Tipo'}
          </Button>
        </Tooltip>
        <Tooltip title="Propone un mensaje a partir de los cambios preparados (se calcula en tu equipo; no se envía código a ningún servicio)">
          <span style={{ flex: 1.4, display: 'flex' }}>
            <Button fullWidth size="small" variant="outlined" startIcon={<GenerateIcon fontSize="small" />} disabled={generating || !!busy} onClick={generate}>
              {generating ? 'Generando…' : 'Generar mensaje'}
            </Button>
          </span>
        </Tooltip>
      </Stack>
      <TextField fullWidth multiline minRows={3} label="Mensaje del commit" placeholder={'tipo(ámbito): resumen corto\n\nDescripción opcional'} value={message}
        inputRef={inputRef} onChange={(e) => setMessage(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !disabled) onCommit(false); }}
        helperText={message ? `${message.split('\n')[0].length} caracteres en el resumen${message.split('\n')[0].length > 72 ? ' (mejor ≤ 72)' : ''} · Ctrl+Enter para commit` : 'Ctrl+Enter para commit'} />
      <FormControlLabel control={<Checkbox checked={amend} onChange={(e) => setAmend(e.target.checked)} size="small" />} label="Corregir último commit (amend)" />
      <Stack direction="row" spacing={1}>
        <Button fullWidth variant="contained" disabled={disabled} onClick={() => onCommit(false)}>Commit ({staged})</Button>
        <Button fullWidth variant="outlined" disabled={disabled} onClick={() => onCommit(true)}>Commit y push</Button>
      </Stack>
      <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
        <Tooltip title="Aparta los cambios sin hacer commit y deja el árbol limpio (S)">
          <span style={{ flex: 1 }}><Button fullWidth size="small" startIcon={<StashIcon fontSize="small" />} disabled={!!busy || !canStash} onClick={onStash}>Stash</Button></span>
        </Tooltip>
        <Tooltip title="Reset suave: quita el último commit y deja sus cambios preparados">
          <span style={{ flex: 1 }}><Button fullWidth size="small" startIcon={<UndoIcon fontSize="small" />} disabled={!!busy || !canUndo} onClick={onUndo}>Deshacer commit</Button></span>
        </Tooltip>
      </Stack>

      <Menu anchorEl={typeMenu} open={!!typeMenu} onClose={() => setTypeMenu(null)} slotProps={{ paper: { sx: { maxHeight: 420 } } }}>
        {COMMIT_TYPES.map(([t, desc]) => (
          <MenuItem key={t} selected={prefix?.[1] === t} onClick={() => { setTypeMenu(null); setMessage(withPrefix(message, t)); setTimeout(() => inputRef?.current?.focus(), 0); }}>
            <ListItemText primary={<Box component="span" sx={{ fontFamily: (th) => th.typography.fontFamilyCode, fontWeight: 700 }}>{t}</Box>} secondary={desc} secondaryTypographyProps={{ fontSize: 12 }} />
          </MenuItem>
        ))}
        <Box sx={{ px: 2, py: 1, borderTop: 1, borderColor: 'divider' }}>
          <FormControlLabel control={<Checkbox size="small" checked={!!prefix?.[4]} disabled={!prefix}
            onChange={(e) => setMessage(withPrefix(message, prefix[1], undefined, e.target.checked))} />}
            label={<Typography variant="body2">Cambio incompatible (!)</Typography>} />
          <Typography variant="caption" color="text.secondary" component="div">Ámbito: escríbelo entre paréntesis, p. ej. feat(api): …</Typography>
        </Box>
      </Menu>
    </Paper>
  );
}
