import { useEffect, useState } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, LinearProgress, TextField } from '@mui/material';
import { getInstance } from '../gitlabInstance.js';
import { api } from '../api/client.js';
import PathField from './FolderPicker.jsx';

export default function CloneDialog({ open, onClose, onCloned, initialUrl = '', gitlabProjectId }) {
  const [url, setUrl] = useState(initialUrl);
  const [dir, setDir] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) return;
    setUrl(initialUrl); setError(null);
    api.get('/repos').then((d) => setDir(d.defaultCloneDir)).catch(() => {});
  }, [open, initialUrl]);

  const clone = async () => {
    setBusy(true); setError(null);
    try {
      const repo = await api.post('/repos/clone', { url, dir, gitlabProjectId, gitlabInstance: gitlabProjectId ? getInstance() : undefined });
      onCloned(repo);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>Clonar repositorio</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2, whiteSpace: 'pre-wrap' }}>{error}</Alert>}
        <TextField label="URL (HTTPS)" fullWidth margin="dense" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://gitlab.com/grupo/proyecto.git" />
        <PathField label="Carpeta donde se creará" fullWidth margin="dense" value={dir} onChange={setDir} pickerTitle="Carpeta donde se clonará" helperText="Se creará una subcarpeta con el nombre del proyecto." />
        {busy && <LinearProgress sx={{ mt: 2 }} />}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Cancelar</Button>
        <Button variant="contained" onClick={clone} disabled={busy || !url}>Clonar</Button>
      </DialogActions>
    </Dialog>
  );
}
