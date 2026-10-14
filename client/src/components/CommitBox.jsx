import { useEffect, useState } from 'react';
import {
  Box, Button, Checkbox, Chip, CircularProgress, Divider, FormControlLabel, IconButton, ListItemIcon, ListItemText, Menu, MenuItem, Paper, Stack,
  TextField, Tooltip, Typography,
} from '@mui/material';
import MoreIcon from '@mui/icons-material/MoreVert';
import DropIcon from '@mui/icons-material/ArrowDropDown';
import AmendIcon from '@mui/icons-material/EditNoteOutlined';
import SettingsIcon from '@mui/icons-material/TuneOutlined';
import TicketIcon from '@mui/icons-material/ConfirmationNumberOutlined';
import TemplateIcon from '@mui/icons-material/PostAddOutlined';
import GenerateIcon from '@mui/icons-material/AutoAwesome';
import TypeIcon from '@mui/icons-material/LocalOfferOutlined';
import StashIcon from '@mui/icons-material/Inventory2Outlined';
import UndoIcon from '@mui/icons-material/Undo';
import { api } from '../api/client.js';
import { PREFIX_RE, applyTicket, detectTicket, isConventional, renderTemplate } from '../commitConventions.js';
import { CommitSettingsDialog } from './CommitSettings.jsx';
import { useConfirm } from './Confirm.jsx';

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
// Convenciones (Configuración → Commits, o propias del repositorio): ticket de la rama, plantilla y ámbitos.
export default function CommitBox({
  repoId, branch, message, setMessage, amend, setAmend, staged, busy, onCommit, onStash, onUndo, canStash, canUndo, notify, inputRef,
}) {
  const [typeMenu, setTypeMenu] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [conv, setConv] = useState(null); // convenciones efectivas
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [addTicket, setAddTicket] = useState(true);
  const [moreMenu, setMoreMenu] = useState(null);
  const confirm = useConfirm();
  useEffect(() => { api.get(`/repos/${repoId}/commit-settings`).then((d) => setConv(d.effective)).catch(() => {}); }, [repoId]);

  const prefix = message.split('\n')[0].match(PREFIX_RE);
  const disabled = !!busy || (!staged && !amend) || (!message.trim() && !amend);
  const ticket = conv && conv.ticket.mode !== 'off' ? detectTicket(branch, conv.ticket.pattern) : null;
  const inMessage = ticket && message.toLowerCase().includes(ticket.toLowerCase());
  // Mensaje que se enviará: con el ticket añadido si corresponde.
  const finalMessage = () => (ticket && addTicket ? applyTicket(message, ticket, conv.ticket) : message);
  const commit = (push) => onCommit(push, finalMessage());
  const template = () => renderTemplate(conv?.template, { ticket, branch, type: prefix?.[1] || '' });
  const useTemplate = async () => {
    if (message.trim() && !(await confirm({ title: '¿Usar la plantilla?', body: 'Se reemplaza el mensaje que ya escribiste.', confirm: 'Reemplazar' }))) return;
    setMessage(template());
    setTimeout(() => { const el = inputRef?.current; if (el) { el.focus(); const i = el.value.indexOf('\n'); el.setSelectionRange(i < 0 ? el.value.length : i, i < 0 ? el.value.length : i); } }, 0);
  };
  const where = { summary: 'al inicio del resumen', end: 'al final del resumen', footer: `en el pie (${conv?.ticket.label}: …)` }[conv?.ticket.mode];

  const generate = async () => {
    if (message.trim() && !(await confirm({ title: '¿Generar un mensaje nuevo?', body: 'Se reemplaza el mensaje que ya escribiste por uno propuesto a partir de los cambios.', confirm: 'Reemplazar' }))) return;
    setGenerating(true);
    try {
      const r = await api.post(`/repos/${repoId}/suggest-message`);
      setMessage(r.message);
      if (!r.staged) notify('No hay cambios preparados: el mensaje describe todos los cambios del árbol.', 'info', { title: 'Mensaje generado' });
      setTimeout(() => inputRef?.current?.focus(), 0);
    } catch (e) { notify(e.message, 'error', { title: 'No se pudo generar el mensaje' }); }
    finally { setGenerating(false); }
  };

  const summaryLen = message.split('\n')[0].length;
  const notConventional = conv?.conventional && message.trim() && !isConventional(message);
  const iconSx = { color: 'text.secondary', '&:hover': { color: 'text.primary' } };

  return (
    <Paper variant="outlined" sx={{ p: 1.5, flexShrink: 0 }}>
      {/* Barra compacta: tipo, ticket y amend a la izquierda; generar, plantilla y ajustes como iconos. */}
      <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 1, minHeight: 30 }}>
        <Tooltip title="Tipo de cambio (Conventional Commits)">
          <Button size="small" variant="outlined" startIcon={<TypeIcon sx={{ fontSize: '16px !important' }} />} endIcon={<DropIcon />} onClick={(e) => setTypeMenu(e.currentTarget)}
            sx={{ height: 28, px: 1, minWidth: 0, fontSize: 13, '& .MuiButton-endIcon': { ml: 0 }, ...(prefix && { fontFamily: (t) => t.typography.fontFamilyCode }) }}>
            {prefix ? prefix[1] : 'Tipo'}
          </Button>
        </Tooltip>
        {ticket && (
          <Tooltip title={inMessage ? 'El mensaje ya incluye el ticket de la rama' : addTicket ? `Ticket de la rama: se añadirá ${where} al hacer commit. Clic para no añadirlo esta vez.` : 'Ticket de la rama: no se añadirá. Clic para añadirlo.'}>
            <Chip size="small" icon={<TicketIcon />} label={ticket} color={addTicket || inMessage ? 'primary' : 'default'} variant={addTicket || inMessage ? 'filled' : 'outlined'}
              onClick={inMessage ? undefined : () => setAddTicket((a) => !a)}
              sx={{ height: 24, fontFamily: (t) => t.typography.fontFamilyCode, fontWeight: 600, ...(!addTicket && !inMessage && { textDecoration: 'line-through' }) }} />
          </Tooltip>
        )}
        {amend && (
          <Tooltip title="El commit corregirá el último commit (amend). Quítalo para crear uno nuevo.">
            <Chip size="small" color="warning" variant="outlined" label="amend" onDelete={() => setAmend(false)} sx={{ height: 24 }} />
          </Tooltip>
        )}
        <Box sx={{ flexGrow: 1 }} />
        <Tooltip title="Generar mensaje a partir de los cambios preparados (se calcula en tu equipo; no se envía código a ningún servicio)">
          <span><IconButton size="small" disabled={generating || !!busy} onClick={generate} aria-label="Generar mensaje" sx={iconSx}>
            {generating ? <CircularProgress size={16} /> : <GenerateIcon fontSize="small" />}
          </IconButton></span>
        </Tooltip>
        {conv?.template?.trim() && (
          <Tooltip title="Usar la plantilla del equipo">
            <IconButton size="small" onClick={useTemplate} aria-label="Usar plantilla" sx={iconSx}><TemplateIcon fontSize="small" /></IconButton>
          </Tooltip>
        )}
        <Tooltip title="Convenciones de commit: ticket de la rama, plantilla y ámbitos">
          <IconButton size="small" onClick={() => setSettingsOpen(true)} aria-label="Convenciones de commit" sx={iconSx}><SettingsIcon fontSize="small" /></IconButton>
        </Tooltip>
      </Stack>

      <TextField fullWidth multiline minRows={3} maxRows={12} placeholder="Mensaje del commit" value={message}
        inputRef={inputRef} onChange={(e) => setMessage(e.target.value)} inputProps={{ 'aria-label': 'Mensaje del commit' }}
        onFocus={() => { if (conv?.autoTemplate && conv.template.trim() && !message) setMessage(template()); }}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !disabled) commit(false); }}
        InputProps={{ sx: { fontSize: 14 } }} />
      {/* Solo aparece cuando hay algo que decir: largo del resumen y, si aplica, el aviso de formato. */}
      {message.trim() && (
        <Stack direction="row" spacing={1} sx={{ mt: 0.5, px: 0.25 }}>
          <Typography variant="caption" color="warning.main" sx={{ flexGrow: 1 }}>{notConventional ? 'No sigue el formato tipo: resumen' : ''}</Typography>
          <Typography variant="caption" color={summaryLen > 72 ? 'warning.main' : 'text.disabled'} title="Caracteres del resumen (mejor 72 o menos)">{summaryLen}/72</Typography>
        </Stack>
      )}

      <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1.25 }}>
        <Tooltip title="Ctrl+Enter">
          <span style={{ flex: 1, display: 'flex' }}>
            <Button fullWidth variant="contained" disabled={disabled} onClick={() => commit(false)}>{amend ? 'Corregir commit' : `Commit (${staged})`}</Button>
          </span>
        </Tooltip>
        <Button fullWidth variant="outlined" disabled={disabled} onClick={() => commit(true)} sx={{ flex: 1 }}>{amend ? 'Corregir y push' : 'Commit y push'}</Button>
        <Tooltip title="Más acciones: amend, stash, deshacer commit">
          <IconButton size="small" onClick={(e) => setMoreMenu(e.currentTarget)} aria-label="Más acciones" sx={iconSx}><MoreIcon fontSize="small" /></IconButton>
        </Tooltip>
      </Stack>

      <Menu anchorEl={moreMenu} open={!!moreMenu} onClose={() => setMoreMenu(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
        <MenuItem onClick={() => { setMoreMenu(null); setAmend(!amend); }}>
          <ListItemIcon><AmendIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="Corregir último commit (amend)" secondary="Añade los cambios y el mensaje al último commit" secondaryTypographyProps={{ fontSize: 12 }} />
          <Checkbox size="small" checked={amend} sx={{ ml: 1, p: 0.5 }} tabIndex={-1} />
        </MenuItem>
        <Divider />
        <MenuItem disabled={!!busy || !canStash} onClick={() => { setMoreMenu(null); onStash(); }}>
          <ListItemIcon><StashIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="Stash" secondary="Aparta los cambios sin hacer commit (S)" secondaryTypographyProps={{ fontSize: 12 }} />
        </MenuItem>
        <MenuItem disabled={!!busy || !canUndo} onClick={() => { setMoreMenu(null); onUndo(); }}>
          <ListItemIcon><UndoIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="Deshacer último commit" secondary="Reset suave: sus cambios quedan preparados" secondaryTypographyProps={{ fontSize: 12 }} />
        </MenuItem>
      </Menu>

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
          {conv?.scopes?.length ? (
            <>
              <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 1, mb: 0.5 }}>Ámbito</Typography>
              <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ maxWidth: 280 }}>
                {conv.scopes.map((sc) => (
                  <Chip key={sc} size="small" label={sc} clickable color={prefix?.[3] === sc ? 'primary' : 'default'} variant={prefix?.[3] === sc ? 'filled' : 'outlined'}
                    onClick={() => { setTypeMenu(null); setMessage(withPrefix(message, prefix?.[1] || 'feat', prefix?.[3] === sc ? '' : sc)); setTimeout(() => inputRef?.current?.focus(), 0); }} />
                ))}
              </Stack>
            </>
          ) : <Typography variant="caption" color="text.secondary" component="div">Ámbito: escríbelo entre paréntesis, p. ej. feat(api): …</Typography>}
        </Box>
      </Menu>
      <CommitSettingsDialog open={settingsOpen} repoId={repoId} branch={branch} onClose={() => setSettingsOpen(false)} onSaved={(d) => setConv(d.effective)} />
    </Paper>
  );
}
