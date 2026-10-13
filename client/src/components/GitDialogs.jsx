import { useEffect, useState } from 'react';
import {
  Button, Checkbox, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, FormControlLabel, Stack, TextField,
} from '@mui/material';

// Guarda los cambios actuales en un stash.
export function StashDialog({ open, onClose, onSave }) {
  const [message, setMessage] = useState('');
  const [untracked, setUntracked] = useState(true);
  const [keepIndex, setKeepIndex] = useState(false);
  useEffect(() => { if (open) { setMessage(''); setUntracked(true); setKeepIndex(false); } }, [open]);
  const save = () => onSave({ message, includeUntracked: untracked, keepIndex });
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Guardar cambios en stash</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>
          Guarda tus cambios sin hacer commit y deja el árbol de trabajo limpio. Podrás aplicarlos después desde la pestaña Stash.
        </DialogContentText>
        <TextField autoFocus fullWidth label="Descripción (opcional)" placeholder="p. ej. ajustes antes del pull" value={message}
          onChange={(e) => setMessage(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
        <Stack sx={{ mt: 1 }}>
          <FormControlLabel control={<Checkbox checked={untracked} onChange={(e) => setUntracked(e.target.checked)} />} label="Incluir archivos nuevos (sin seguimiento)" />
          <FormControlLabel control={<Checkbox checked={keepIndex} onChange={(e) => setKeepIndex(e.target.checked)} />} label="Mantener también los cambios preparados en el árbol" />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="contained" onClick={save}>Guardar en stash</Button>
      </DialogActions>
    </Dialog>
  );
}

// Propone la siguiente versión a partir del último tag semántico (v1.2.3 → v1.2.4).
export function nextVersion(tags) {
  const sem = tags.map((t) => t.name.match(/^(v?)(\d+)\.(\d+)\.(\d+)$/)).filter(Boolean)
    .sort((a, b) => (+b[2] - +a[2]) || (+b[3] - +a[3]) || (+b[4] - +a[4]));
  if (!sem.length) return 'v1.0.0';
  const [, v, M, m, p] = sem[0];
  return `${v}${M}.${m}.${+p + 1}`;
}

// Crea un tag en HEAD o en el commit indicado.
export function TagDialog({ open, onClose, onSave, target, suggestion, canPush }) {
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [push, setPush] = useState(false);
  useEffect(() => { if (open) { setName(suggestion || ''); setMessage(''); setPush(false); } }, [open, suggestion]);
  const save = () => name.trim() && onSave({ name: name.trim(), message, push, ref: target?.hash });
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Nuevo tag</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>
          {target ? <>En el commit <b>{target.short}</b> · {target.subject}</> : 'En el último commit de la rama actual (HEAD).'}
        </DialogContentText>
        <TextField autoFocus fullWidth label="Nombre" placeholder="v1.0.0" value={name} onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()} sx={{ mb: 2 }} />
        <TextField fullWidth multiline minRows={2} label="Mensaje (opcional)" value={message} onChange={(e) => setMessage(e.target.value)}
          helperText={message.trim() ? 'Se creará un tag anotado (con autor, fecha y mensaje).' : 'Sin mensaje se crea un tag ligero.'} />
        {canPush && <FormControlLabel sx={{ mt: 1 }} control={<Checkbox checked={push} onChange={(e) => setPush(e.target.checked)} />} label="Publicar en origin" />}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="contained" disabled={!name.trim()} onClick={save}>Crear tag</Button>
      </DialogActions>
    </Dialog>
  );
}

// Confirmación genérica con texto de acción y color.
export function ConfirmDialog({ open, title, body, confirm = 'Confirmar', color = 'primary', onClose, onConfirm }) {
  return (
    <Dialog open={!!open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent><DialogContentText component="div">{body}</DialogContentText></DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="contained" color={color} onClick={onConfirm}>{confirm}</Button>
      </DialogActions>
    </Dialog>
  );
}
