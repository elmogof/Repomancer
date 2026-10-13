import { useEffect, useState } from 'react';
import {
  Alert, Autocomplete, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Stack, TextField,
} from '@mui/material';
import { api } from '../api/client.js';

// Crea un pull request en GitHub desde la rama actual (la rama debe estar publicada).
export default function CreatePRDialog({ open, onClose, repoId, github, onCreated }) {
  const [form, setForm] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !github) return;
    setError(null);
    setForm({ head: github.branch || '', base: github.default_branch || 'main', title: '', body: '', draft: false });
  }, [open, github]);

  const create = async () => {
    setBusy(true); setError(null);
    try { onCreated(await api.post(`/repos/${repoId}/github/pulls`, form)); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  const branches = github?.branches || [];
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>Nuevo pull request {github && `· ${github.full_name}`}</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {github && !branches.includes(github.branch) && (
          <Alert severity="warning" sx={{ mb: 2 }}>La rama «{github.branch}» aún no está en GitHub: haz push antes de crear el pull request.</Alert>
        )}
        <Stack direction="row" spacing={2} sx={{ mt: 1 }}>
          <Autocomplete fullWidth options={branches} value={form.head || null} onChange={(e, v) => setForm((f) => ({ ...f, head: v || '' }))}
            renderInput={(p) => <TextField {...p} label="Rama con los cambios (head)" />} />
          <Autocomplete fullWidth options={branches} value={form.base || null} onChange={(e, v) => setForm((f) => ({ ...f, base: v || '' }))}
            renderInput={(p) => <TextField {...p} label="Rama destino (base)" />} />
        </Stack>
        <TextField fullWidth margin="normal" label="Título" value={form.title || ''} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
        <TextField fullWidth multiline minRows={5} label="Descripción (Markdown)" value={form.body || ''} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} />
        <FormControlLabel sx={{ mt: 1 }} control={<Checkbox checked={!!form.draft} onChange={(e) => setForm((f) => ({ ...f, draft: e.target.checked }))} />} label="Borrador (draft)" />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="contained" onClick={create} disabled={busy || !form.title?.trim() || !form.head || !form.base || form.head === form.base}>Crear pull request</Button>
      </DialogActions>
    </Dialog>
  );
}
