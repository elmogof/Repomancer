import { useState } from 'react';
import {
  Badge, Box, CircularProgress, Divider, IconButton, ListItemIcon, ListItemText, Menu, MenuItem, Stack, Tooltip, Typography,
  useMediaQuery,
} from '@mui/material';
import MoreIcon from '@mui/icons-material/MoreVert';
import PullIcon from '@mui/icons-material/Download';
import PushIcon from '@mui/icons-material/Upload';
import FetchIcon from '@mui/icons-material/Sync';
import FolderIcon from '@mui/icons-material/FolderOpen';
import CodeIcon from '@mui/icons-material/Code';
import TerminalIcon from '@mui/icons-material/Terminal';
import CopyIcon from '@mui/icons-material/ContentCopy';
import WebIcon from '@mui/icons-material/OpenInNew';
import DetailIcon from '@mui/icons-material/ArrowForward';
import RemoveIcon from '@mui/icons-material/RemoveCircleOutline';
import StarIcon from '@mui/icons-material/Star';
import StarOutlineIcon from '@mui/icons-material/StarBorder';
import LabelIcon from '@mui/icons-material/LabelOutlined';
import { api } from '../api/client.js';
import { useNotify } from './Notify.jsx';
import { describePull, getPullPrefs } from '../pullPrefs.js';

// Ejecuta una operación git remota sobre un repositorio y devuelve un mensaje corto para el aviso.
export async function syncRepo(id, op) {
  const { output } = await api.post(`/repos/${id}/${op}`, op === 'pull' ? getPullPrefs() : undefined);
  const last = (output || '').split('\n').map((l) => l.trim()).filter(Boolean).pop();
  return last || `${op[0].toUpperCase()}${op.slice(1)} completado`;
}

// Tooltip con título y descripción.
const Tip = ({ title, desc }) => (
  <Box sx={{ py: 0.25 }}>
    <Typography variant="caption" fontWeight={700} component="div">{title}</Typography>
    {desc && <Typography variant="caption" component="div" sx={{ opacity: 0.8, maxWidth: 240 }}>{desc}</Typography>}
  </Box>
);

const badgeSx = { '& .MuiBadge-badge': { fontSize: 10, height: 16, minWidth: 16, px: 0.5 } };

// Acciones de una fila: tantas como quepan como iconos (según el ancho de pantalla)
// y el resto en el menú ⋮, que siempre incluye "Ver detalle" y "Quitar de la lista".
export default function RepoActions({ repo, onChanged, onRemove, onOpenDetail, onFavorite, onLabels }) {
  const [anchor, setAnchor] = useState(null);
  const [busy, setBusy] = useState(null);
  const notify = useNotify();

  const xl = useMediaQuery((t) => t.breakpoints.up('xl'));
  const lg = useMediaQuery((t) => t.breakpoints.up('lg'));
  const md = useMediaQuery((t) => t.breakpoints.up('md'));
  const sm = useMediaQuery((t) => t.breakpoints.up('sm'));
  const inline = xl ? 8 : lg ? 6 : md ? 4 : sm ? 2 : 1;

  const close = () => setAnchor(null);
  const gone = repo.missing;

  const git = async (op) => {
    close(); setBusy(op);
    try { notify(await syncRepo(repo.id, op), 'success', { title: repo.name }); }
    catch (e) { notify(e.message, 'error', { title: `${op[0].toUpperCase()}${op.slice(1)} falló en ${repo.name}` }); }
    finally { setBusy(null); onChanged(repo.id); }
  };

  const open = async (target) => {
    close();
    try { await api.post(`/repos/${repo.id}/open`, { target }); }
    catch (e) { notify(e.message, 'error'); }
  };

  const copyPath = async () => {
    close();
    try { await navigator.clipboard.writeText(repo.path); notify('Ruta copiada al portapapeles'); }
    catch { notify('No se pudo copiar la ruta', 'error'); }
  };

  const openWeb = async () => {
    close();
    try { const { url } = await api.get(`/repos/${repo.id}/web-url`); window.open(url, '_blank', 'noopener'); }
    catch (e) { notify(e.message, 'error'); }
  };

  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

  // Orden = prioridad: las primeras son las que se quedan visibles en pantallas estrechas.
  const actions = [
    {
      key: 'pull', icon: <PullIcon fontSize="small" />, label: 'Pull', count: repo.behind, onClick: () => git('pull'),
      disabled: gone || !!busy, color: repo.behind ? 'primary' : undefined,
      desc: `${repo.behind ? `Trae ${plural(repo.behind, 'commit', 'commits')} del remoto` : 'Trae los cambios del remoto a tu rama'} (${describePull(getPullPrefs())}).`,
    },
    {
      key: 'push', icon: <PushIcon fontSize="small" />, label: 'Push', count: repo.ahead, onClick: () => git('push'),
      disabled: gone || !!busy, color: repo.ahead ? 'primary' : undefined,
      desc: repo.ahead ? `Sube ${plural(repo.ahead, 'commit local', 'commits locales')} al remoto.` : 'Sube tus commits locales al remoto.',
    },
    {
      key: 'fetch', icon: <FetchIcon fontSize="small" />, label: 'Fetch', onClick: () => git('fetch'), disabled: gone || !!busy,
      desc: 'Descarga las novedades del remoto sin modificar tus archivos.',
    },
    { key: 'folder', icon: <FolderIcon fontSize="small" />, label: 'Abrir carpeta', onClick: () => open('folder'), disabled: gone, desc: 'Abre la carpeta en el explorador de archivos.' },
    { key: 'vscode', icon: <CodeIcon fontSize="small" />, label: 'Abrir en VS Code', onClick: () => open('vscode'), disabled: gone, desc: 'Abre el repositorio en Visual Studio Code.' },
    { key: 'terminal', icon: <TerminalIcon fontSize="small" />, label: 'Abrir terminal', onClick: () => open('terminal'), disabled: gone, desc: 'Abre una terminal en la carpeta del repositorio.' },
    { key: 'web', icon: <WebIcon fontSize="small" />, label: 'Abrir en GitLab / web', onClick: openWeb, disabled: gone, desc: 'Abre la página del proyecto (remoto origin) en el navegador.' },
    { key: 'copy', icon: <CopyIcon fontSize="small" />, label: 'Copiar ruta', onClick: copyPath, desc: repo.path },
  ];
  const visible = actions.slice(0, inline);
  const overflow = actions.slice(inline);

  const iconFor = (a) => (busy === a.key ? <CircularProgress size={18} /> : a.count
    ? <Badge color="primary" badgeContent={a.count} max={99} sx={badgeSx}>{a.icon}</Badge>
    : a.icon);

  const item = (icon, label, onClick, props = {}) => (
    <MenuItem key={label} onClick={onClick} {...props}>
      <ListItemIcon>{icon}</ListItemIcon>
      <ListItemText primaryTypographyProps={{ fontSize: 14 }}>{label}</ListItemText>
    </MenuItem>
  );

  return (
    <Stack direction="row" spacing={0.25} justifyContent="flex-end" alignItems="center" onClick={(e) => e.stopPropagation()}>
      {visible.map((a) => (
        <Tooltip key={a.key} title={<Tip title={a.label} desc={a.desc} />} arrow enterDelay={300}>
          <span>
            <IconButton size="small" disabled={a.disabled} onClick={a.onClick} color={a.color} aria-label={a.label}>{iconFor(a)}</IconButton>
          </span>
        </Tooltip>
      ))}
      <Tooltip title={<Tip title="Más acciones" />} arrow enterDelay={300}>
        <IconButton size="small" onClick={(e) => setAnchor(e.currentTarget)} aria-label="Más acciones">
          {busy && overflow.some((a) => a.key === busy) ? <CircularProgress size={18} /> : <MoreIcon fontSize="small" />}
        </IconButton>
      </Tooltip>
      <Menu anchorEl={anchor} open={!!anchor} onClose={close} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { minWidth: 220 } } }}>
        {item(<DetailIcon fontSize="small" />, 'Ver detalle', () => { close(); onOpenDetail(); }, { disabled: gone })}
        {onFavorite && item(repo.favorite ? <StarIcon fontSize="small" sx={{ color: 'warning.main' }} /> : <StarOutlineIcon fontSize="small" />,
          repo.favorite ? 'Quitar de favoritos' : 'Añadir a favoritos', () => { close(); onFavorite(); })}
        {onLabels && item(<LabelIcon fontSize="small" />, 'Etiquetas…', () => { close(); onLabels(); })}
        {overflow.length > 0 && <Divider />}
        {overflow.map((a) => item(iconFor(a), `${a.label}${a.count ? ` (${a.count})` : ''}`, a.onClick, { disabled: a.disabled }))}
        <Divider />
        {item(<RemoveIcon fontSize="small" color="error" />, 'Quitar de la lista', () => { close(); onRemove(); }, { sx: { color: 'error.main' } })}
      </Menu>
    </Stack>
  );
}
