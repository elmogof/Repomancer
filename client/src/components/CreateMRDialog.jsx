import { useEffect, useState } from 'react';
import {
  Alert, Autocomplete, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControlLabel, Stack, TextField,
} from '@mui/material';
import { api } from '../api/client.js';

export default function CreateMRDialog({ open, onClose, project, sourceBranch, onCreated }) {
  const inst = `?instance=${encodeURIComponent(project?.instance || 'main')}`;
  const [branches, setBranches] = useState([]);
  const [form, setForm] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !project) return;
    setError(null);
    setForm({ source_branch: sourceBranch || '', target_branch: project.default_branch || 'main', title: '', description: '', remove_source_branch: true, squash: false, draft: false });
    api.get(`/gitlab/projects/${project.id}/branches${inst}`).then((b) => setBranches(b.map((x) => x.name))).catch((e) => setError(e.message));
  }, [open, project, sourceBranch]);

  const set = (k) => (e, v) => setForm((f) => ({ ...f, [k]: v !== undefined && typeof v !== 'object' ? v : e?.target?.type === 'checkbox' ? e.target.checked : (v ?? e.target.value) }));

  const create = async () => {
    setBusy(true); setError(null);
    try { onCreated(await api.post(`/gitlab/projects/${project.id}/merge_requests${inst}`, form)); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>Nuevo merge request {project && `· ${project.path_with_namespace}`}</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Stack direction="row" spacing={2} sx={{ mt: 1 }}>
          <Autocomplete fullWidth options={branches} value={form.source_branch || null} onChange={(e, v) => setForm((f) => ({ ...f, source_branch: v || '' }))} renderInput={(p) => <TextField {...p} label="Rama origen" helperText="Debe estar publicada (push)" />} />
          <Autocomplete fullWidth options={branches} value={form.target_branch || null} onChange={(e, v) => setForm((f) => ({ ...f, target_branch: v || '' }))} renderInput={(p) => <TextField {...p} label="Rama destino" />} />
        </Stack>
        <TextField fullWidth margin="normal" label="Título" value={form.title || ''} onChange={set('title')} />
        <TextField fullWidth multiline minRows={5} label="Descripción (Markdown)" value={form.description || ''} onChange={set('description')} />
        <Stack direction="row" sx={{ mt: 1 }}>
          <FormControlLabel control={<Checkbox checked={!!form.remove_source_branch} onChange={set('remove_source_branch')} />} label="Borrar rama origen al fusionar" />
          <FormControlLabel control={<Checkbox checked={!!form.squash} onChange={set('squash')} />} label="Squash de commits" />
          <FormControlLabel control={<Checkbox checked={!!form.draft} onChange={set('draft')} />} label="Borrador (Draft)" />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="contained" onClick={create} disabled={busy || !form.title || !form.source_branch || !form.target_branch}>Crear merge request</Button>
      </DialogActions>
    </Dialog>
  );
}
