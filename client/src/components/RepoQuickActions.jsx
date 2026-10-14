import { useState } from 'react';
import { Box, Chip, Divider, IconButton, Stack, Tooltip, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import FolderIcon from '@mui/icons-material/FolderOpen';
import CodeIcon from '@mui/icons-material/Code';
import TerminalIcon from '@mui/icons-material/Terminal';
import CopyIcon from '@mui/icons-material/ContentCopy';
import WebIcon from '@mui/icons-material/OpenInNew';
import RemoveIcon from '@mui/icons-material/RemoveCircleOutline';
import StarIcon from '@mui/icons-material/Star';
import StarOutlineIcon from '@mui/icons-material/StarBorder';
import LabelIcon from '@mui/icons-material/LabelOutlined';
import { api } from '../api/client.js';
import { useNotify } from './Notify.jsx';
import LabelsDialog, { labelColor } from './LabelsDialog.jsx';
import { ConfirmDialog } from './GitDialogs.jsx';

const Tip = ({ title, desc }) => (
  <Box sx={{ py: 0.25 }}>
    <Typography variant="caption" fontWeight={700} component="div">{title}</Typography>
    {desc && <Typography variant="caption" component="div" sx={{ opacity: 0.8, maxWidth: 240, wordBreak: 'break-all' }}>{desc}</Typography>}
  </Box>
);

// Accesos rápidos de la lista de repositorios en la cabecera del detalle:
// abrir carpeta / VS Code / terminal / web, copiar ruta, favorito, etiquetas y quitar de la lista.
export default function RepoQuickActions({ repo, onChanged, onRemoved }) {
  const notify = useNotify();
  const [labelsOpen, setLabelsOpen] = useState(false);
  const [allLabels, setAllLabels] = useState([]);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const open = async (target) => {
    try { await api.post(`/repos/${repo.id}/open`, { target }); }
    catch (e) { notify(e.message, 'error'); }
  };
  const openWeb = async () => {
    try { const { url } = await api.get(`/repos/${repo.id}/web-url`); window.open(url, '_blank', 'noopener'); }
    catch (e) { notify(e.message, 'error'); }
  };
  const copyPath = async () => {
    try { await navigator.clipboard.writeText(repo.path); notify('Ruta copiada al portapapeles'); }
    catch { notify('No se pudo copiar la ruta', 'error'); }
  };
  const toggleFavorite = async () => {
    try { await api.put(`/repos/${repo.id}/meta`, { favorite: !repo.favorite }); onChanged(); }
    catch (e) { notify(e.message, 'error'); }
  };
  const openLabels = () => {
    api.get('/repos/labels').then(setAllLabels).catch(() => setAllLabels([]));
    setLabelsOpen(true);
  };
  const saveLabels = async ({ labels }) => {
    setLabelsOpen(false);
    try { await api.put(`/repos/${repo.id}/meta`, { labels }); onChanged(); }
    catch (e) { notify(e.message, 'error'); }
  };
  const remove = async () => {
    setConfirmRemove(false);
    try { await api.post('/repos/remove-many', { ids: [repo.id] }); notify(`«${repo.name}» quitado de la lista`); onRemoved(); }
    catch (e) { notify(e.message, 'error'); }
  };

  const btn = (key, icon, title, onClick, desc, props = {}) => (
    <Tooltip key={key} title={<Tip title={title} desc={desc} />} arrow enterDelay={300}>
      <IconButton size="small" onClick={onClick} aria-label={title} {...props}>{icon}</IconButton>
    </Tooltip>
  );

  return (
    <Stack direction="row" alignItems="center" justifyContent="flex-end" useFlexGap spacing={0.25} sx={{ flexShrink: 0, flexWrap: { xs: 'wrap', sm: 'nowrap' } }}>
      {repo.labels?.map((l) => (
        <Chip key={l} size="small" variant="outlined" label={l} onClick={openLabels}
          sx={{ height: 20, fontSize: 11, mr: 0.5, borderColor: alpha(labelColor(l), 0.6), color: labelColor(l), bgcolor: alpha(labelColor(l), 0.08) }} />
      ))}
      {btn('folder', <FolderIcon fontSize="small" />, 'Abrir carpeta', () => open('folder'), 'Abre la carpeta en el explorador de archivos.')}
      {btn('vscode', <CodeIcon fontSize="small" />, 'Abrir en VS Code', () => open('vscode'), 'Abre el repositorio en Visual Studio Code.')}
      {btn('terminal', <TerminalIcon fontSize="small" />, 'Abrir terminal', () => open('terminal'), 'Abre una terminal en la carpeta del repositorio.')}
      {btn('web', <WebIcon fontSize="small" />, 'Abrir en GitLab / web', openWeb, 'Abre la página del proyecto (remoto origin) en el navegador.', { disabled: !repo.remote })}
      {btn('copy', <CopyIcon fontSize="small" />, 'Copiar ruta', copyPath, repo.path)}
      <Divider orientation="vertical" flexItem sx={{ mx: 0.5, my: 0.5 }} />
      {btn('fav', repo.favorite ? <StarIcon fontSize="small" sx={{ color: 'warning.main' }} /> : <StarOutlineIcon fontSize="small" />,
        repo.favorite ? 'Quitar de favoritos' : 'Añadir a favoritos', toggleFavorite, 'Los favoritos aparecen primero en la lista.')}
      {btn('labels', <LabelIcon fontSize="small" />, 'Etiquetas…', openLabels, 'Agrupa el repositorio por cliente, proyecto o equipo.')}
      {btn('remove', <RemoveIcon fontSize="small" />, 'Quitar de la lista', () => setConfirmRemove(true), 'Solo se quita de Git Manager; los archivos en disco no se borran.', { color: 'error' })}

      <LabelsDialog open={labelsOpen} repos={[repo]} allLabels={allLabels} onClose={() => setLabelsOpen(false)} onSave={saveLabels} />
      <ConfirmDialog open={confirmRemove} title={`¿Quitar «${repo.name}» de la lista?`} confirm="Quitar" color="error"
        body="Solo se quita de Git Manager. Los archivos en disco no se borran."
        onClose={() => setConfirmRemove(false)} onConfirm={remove} />
    </Stack>
  );
}
