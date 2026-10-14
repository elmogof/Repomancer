import { useEffect, useState } from 'react';
import { Box, Button, Chip, Dialog, DialogContent, DialogTitle, LinearProgress, Stack, Tooltip, Typography } from '@mui/material';
import { api, qs } from '../api/client.js';
import DiffView from './DiffView.jsx';

export const fmtDate = (d) => new Date(d).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' });

// Detalle de un commit: mensaje, autor y diff (opcionalmente limitado a un archivo, siguiendo su ruta anterior).
// actions: [{ key, label, icon, desc, run }] se muestran como botones en la cabecera.
export default function CommitDialog({ repoId, commit, file, from, onClose, actions = [] }) {
  const [detail, setDetail] = useState(null);
  const [onlyFile, setOnlyFile] = useState(true);

  useEffect(() => {
    if (!commit) { setDetail(null); return; }
    setDetail(null);
    const params = file && onlyFile ? qs({ file, from: from || undefined }) : '';
    api.get(`/repos/${repoId}/commit/${commit.hash}${params}`).then(setDetail).catch((e) => setDetail({ error: e.message }));
  }, [repoId, commit, file, from, onlyFile]);

  return (
    <Dialog open={!!commit} onClose={onClose} fullWidth maxWidth="lg">
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Box sx={{ flexGrow: 1, minWidth: 0 }}>{commit?.subject || detail?.message?.split('\n')[0]}</Box>
        {actions.map((a) => (
          <Tooltip key={a.key} title={a.desc || ''}><Button size="small" variant="outlined" startIcon={a.icon} onClick={a.run}>{a.label}</Button></Tooltip>
        ))}
      </DialogTitle>
      <DialogContent>
        {!detail ? <LinearProgress /> : detail.error ? <Typography color="error">{detail.error}</Typography> : (
          <>
            <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'monospace' }}>{detail.hash}</Typography>
            <Typography variant="body2" color="text.secondary" gutterBottom>{detail.author} · {fmtDate(detail.date)}</Typography>
            {detail.message.includes('\n') && <Box component="pre" sx={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>{detail.message}</Box>}
            {detail.parents?.length > 1 && <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 1 }}>Commit de merge: se muestran los cambios respecto al primer padre.</Typography>}
            {file && (
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                <Chip size="small" variant={onlyFile ? 'filled' : 'outlined'} color="primary" label={`Solo ${file.split('/').pop()}`} onClick={() => setOnlyFile(true)} />
                <Chip size="small" variant={!onlyFile ? 'filled' : 'outlined'} color="primary" label="Todo el commit" onClick={() => setOnlyFile(false)} />
              </Stack>
            )}
            <DiffView diff={detail.diff} maxHeight="65vh" />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
