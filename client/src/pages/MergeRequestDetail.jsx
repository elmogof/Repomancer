import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Accordion, AccordionDetails, AccordionSummary, Avatar, Box, Button, Checkbox, Chip, CircularProgress, Skeleton,
  FormControlLabel, IconButton, Link, Paper, Stack, Tab, Tabs, TextField, Typography,
} from '@mui/material';
import ExpandIcon from '@mui/icons-material/ExpandMore';
import BackIcon from '@mui/icons-material/ArrowBack';
import OpenIcon from '@mui/icons-material/OpenInNew';
import { api } from '../api/client.js';
import { useNotify } from '../components/Notify.jsx';
import DiffView from '../components/DiffView.jsx';

// Último detalle cargado de cada MR: al volver se muestra al instante mientras se actualiza.
const mrCache = new Map();

export default function MergeRequestDetail() {
  const { pid, iid } = useParams();
  const navigate = useNavigate();
  const notify = useNotify();
  const [mr, setMrState] = useState(() => mrCache.get(`${pid}/${iid}`) || null);
  const setMr = (m) => { mrCache.set(`${pid}/${iid}`, m); setMrState(m); };
  const [tab, setTab] = useState(0);
  const [comment, setComment] = useState('');
  const [squash, setSquash] = useState(false);
  const [removeSrc, setRemoveSrc] = useState(true);
  const [busy, setBusy] = useState(false);

  const base = `/gitlab/projects/${pid}/merge_requests/${iid}`;
  const load = useCallback(() => api.get(base).then((m) => { setMr(m); setSquash(!!m.squash); setRemoveSrc(m.force_remove_source_branch ?? true); }).catch((e) => notify(e.message, 'error')), [base, notify]);
  useEffect(() => { load(); }, [load]);

  const run = async (fn, ok) => {
    setBusy(true);
    try { await fn(); notify(ok); await load(); } catch (e) { notify(e.message, 'error'); } finally { setBusy(false); }
  };

  if (!mr) return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1.5 }}>
        <Skeleton variant="circular" width={32} height={32} /><Skeleton width="45%" height={36} />
        <Box sx={{ flexGrow: 1 }} /><Skeleton variant="rounded" width={150} height={34} />
      </Stack>
      <Stack direction="row" spacing={1} sx={{ mb: 2, ml: 6 }}><Skeleton variant="rounded" width={70} height={24} /><Skeleton width={320} /></Stack>
      <Skeleton variant="rounded" height={64} sx={{ mb: 2 }} />
      <Skeleton variant="rounded" height={44} sx={{ mb: 2 }} />
      <Skeleton variant="rounded" height={240} />
    </Box>
  );
  const adds = (d) => (d.match(/^\+(?!\+\+)/gm) || []).length;
  const dels = (d) => (d.match(/^-(?!--)/gm) || []).length;

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
        <IconButton onClick={() => navigate(-1)}><BackIcon /></IconButton>
        <Typography variant="h5" sx={{ flexGrow: 1 }}>{mr.title} <Typography component="span" color="text.secondary">!{mr.iid}</Typography></Typography>
        <Button endIcon={<OpenIcon />} component={Link} href={mr.web_url} target="_blank" rel="noreferrer">Abrir en GitLab</Button>
      </Stack>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2, ml: 6 }} flexWrap="wrap" useFlexGap>
        <Chip size="small" label={mr.state} color={mr.state === 'opened' ? 'success' : mr.state === 'merged' ? 'info' : 'default'} />
        <Typography variant="body2"><b>{mr.source_branch}</b> → <b>{mr.target_branch}</b></Typography>
        <Typography variant="body2" color="text.secondary">por {mr.author?.name}</Typography>
        {mr.detailed_merge_status && <Chip size="small" variant="outlined" label={mr.detailed_merge_status} />}
        {mr.has_conflicts && <Chip size="small" color="error" label="Con conflictos" />}
      </Stack>

      {mr.state === 'opened' && (
        <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <FormControlLabel control={<Checkbox checked={squash} onChange={(e) => setSquash(e.target.checked)} />} label="Squash" />
            <FormControlLabel control={<Checkbox checked={removeSrc} onChange={(e) => setRemoveSrc(e.target.checked)} />} label="Borrar rama origen" />
            <Box sx={{ flexGrow: 1 }} />
            <Button disabled={busy} onClick={() => run(() => api.post(`${base}/approve`), 'Aprobado')}>Aprobar</Button>
            <Button disabled={busy} color="error" onClick={() => confirm('¿Cerrar este merge request?') && run(() => api.put(`${base}/close`), 'Merge request cerrado')}>Cerrar</Button>
            <Button disabled={busy || mr.has_conflicts || mr.draft} variant="contained" color="success"
              onClick={() => confirm(`¿Fusionar ${mr.source_branch} en ${mr.target_branch}?`) && run(() => api.put(`${base}/merge`, { squash, should_remove_source_branch: removeSrc }), 'Merge request fusionado')}>
              Fusionar
            </Button>
          </Stack>
        </Paper>
      )}

      <Tabs value={tab} onChange={(e, v) => setTab(v)} sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Tab label="Descripción" />
        <Tab label={`Cambios (${mr.changes?.length || 0})`} />
        <Tab label={`Comentarios (${mr.notes?.length || 0})`} />
      </Tabs>

      {tab === 0 && <Paper variant="outlined" sx={{ p: 2 }}><Box component="pre" sx={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', m: 0 }}>{mr.description || 'Sin descripción.'}</Box></Paper>}

      {tab === 1 && mr.changes.map((c) => (
        <Accordion key={c.new_path + c.old_path} defaultExpanded={mr.changes.length <= 5} disableGutters variant="outlined">
          <AccordionSummary expandIcon={<ExpandIcon />}>
            <Typography sx={{ fontFamily: 'monospace', flexGrow: 1 }}>
              {c.renamed_file ? `${c.old_path} → ${c.new_path}` : c.new_path}
              {c.new_file && ' (nuevo)'}{c.deleted_file && ' (eliminado)'}
            </Typography>
            <Typography sx={{ color: 'success.main', mr: 1 }}>+{adds(c.diff)}</Typography>
            <Typography sx={{ color: 'error.main', mr: 2 }}>-{dels(c.diff)}</Typography>
          </AccordionSummary>
          <AccordionDetails sx={{ p: 0 }}><DiffView diff={c.diff} maxHeight="60vh" /></AccordionDetails>
        </Accordion>
      ))}

      {tab === 2 && (
        <Stack spacing={1}>
          {mr.notes.map((n) => (
            <Paper key={n.id} variant="outlined" sx={{ p: 2 }}>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                <Avatar src={n.author.avatar_url} sx={{ width: 24, height: 24 }} />
                <b>{n.author.name}</b>
                <Typography variant="caption" color="text.secondary">{new Date(n.created_at).toLocaleString('es-CR')}</Typography>
                {n.position && <Chip size="small" variant="outlined" label={`${n.position.new_path}:${n.position.new_line || n.position.old_line}`} />}
              </Stack>
              <Box component="pre" sx={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', m: 0 }}>{n.body}</Box>
            </Paper>
          ))}
          <TextField multiline minRows={3} label="Nuevo comentario" value={comment} onChange={(e) => setComment(e.target.value)} />
          <Box><Button variant="contained" disabled={busy || !comment.trim()} onClick={() => run(async () => { await api.post(`${base}/notes`, { body: comment }); setComment(''); }, 'Comentario publicado')}>Comentar</Button></Box>
        </Stack>
      )}
    </Box>
  );
}
