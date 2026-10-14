import { useEffect, useState } from 'react';
import {
  Alert, Autocomplete, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem,
  Radio, RadioGroup, Stack, Switch, TextField, Typography,
} from '@mui/material';
import { api } from '../api/client.js';
import { useNotify } from './Notify.jsx';
import { TICKET_MODES, applyTicket, detectTicket } from '../commitConventions.js';

// Formulario de convenciones de commit (lo usan Configuración y el ajuste propio de cada repositorio).
export function CommitConventionsForm({ value, onChange, sampleBranch = 'feature/PAG-112-checkout' }) {
  const set = (patch) => onChange({ ...value, ...patch });
  const setTicket = (patch) => onChange({ ...value, ticket: { ...value.ticket, ...patch } });
  let patternError = null;
  try { new RegExp(value.ticket.pattern); } catch (e) { patternError = e.message; }
  const sample = detectTicket(sampleBranch, value.ticket.pattern);
  const example = sample ? applyTicket('fix(pagos): corrige el total del mes', sample, value.ticket) : null;
  return (
    <Stack spacing={2}>
      <FormControlLabel control={<Switch checked={value.conventional} onChange={(e) => set({ conventional: e.target.checked })} />}
        label="Avisar si el resumen no sigue Conventional Commits (tipo(ámbito): resumen)" />

      <Box>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>Ticket de la rama</Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
          <TextField select size="small" label="Añadir el ticket" value={value.ticket.mode} onChange={(e) => setTicket({ mode: e.target.value })} sx={{ minWidth: 220 }}>
            {TICKET_MODES.map(([k, label]) => <MenuItem key={k} value={k}>{label}</MenuItem>)}
          </TextField>
          <TextField size="small" label="Patrón del ticket (expresión regular)" value={value.ticket.pattern} onChange={(e) => setTicket({ pattern: e.target.value })}
            error={!!patternError} helperText={patternError || 'Por defecto: INC033, PAG-112, JIRA-45…'} sx={{ flex: 1 }}
            InputProps={{ sx: { fontFamily: (t) => t.typography.fontFamilyCode, fontSize: 13 } }} />
          {value.ticket.mode === 'footer' && (
            <TextField size="small" label="Etiqueta del pie" value={value.ticket.label} onChange={(e) => setTicket({ label: e.target.value })} sx={{ width: 140 }} />
          )}
        </Stack>
        {value.ticket.mode !== 'off' && !patternError && (
          <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.5 }}>
            Ejemplo con la rama <b>{sampleBranch}</b>: {example
              ? <Box component="span" sx={{ fontFamily: (t) => t.typography.fontFamilyCode, whiteSpace: 'pre-wrap' }}>{example}</Box>
              : 'no se detecta ningún ticket'}
          </Typography>
        )}
      </Box>

      <Box>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>Plantilla del mensaje</Typography>
        <TextField fullWidth multiline minRows={3} size="small" value={value.template} onChange={(e) => set({ template: e.target.value })}
          placeholder={'{type}: \n\nTicket: {ticket}\nPruebas: '}
          helperText="Variables: {ticket}, {branch} y {type}. Vacía = sin plantilla."
          InputProps={{ sx: { fontFamily: (t) => t.typography.fontFamilyCode, fontSize: 13 } }} />
        <FormControlLabel control={<Switch checked={value.autoTemplate} disabled={!value.template.trim()} onChange={(e) => set({ autoTemplate: e.target.checked })} />}
          label="Rellenar el mensaje con la plantilla al empezar a escribir" />
      </Box>

      <Autocomplete multiple freeSolo options={[]} value={value.scopes} onChange={(e, v) => set({ scopes: v.map((x) => x.trim()).filter(Boolean) })}
        renderTags={(v, getProps) => v.map((o, i) => { const { key, ...p } = getProps({ index: i }); return <Chip key={key} size="small" label={o} {...p} />; })}
        renderInput={(p) => <TextField {...p} size="small" label="Ámbitos sugeridos" placeholder="pagos, api, ui… (Enter)" helperText="Aparecen en el selector de tipo para escribir feat(pagos): … con un clic" />} />
    </Stack>
  );
}

// Convenciones de un repositorio: usar las generales o unas propias.
export function CommitSettingsDialog({ open, repoId, branch, onClose, onSaved }) {
  const notify = useNotify();
  const [data, setData] = useState(null);
  const [own, setOwn] = useState(false);
  const [value, setValue] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setData(null);
    api.get(`/repos/${repoId}/commit-settings`).then((d) => { setData(d); setOwn(!!d.own); setValue(d.own || d.global); }).catch((e) => notify(e.message, 'error'));
  }, [open, repoId, notify]);

  const save = async () => {
    setBusy(true);
    try { const d = await api.put(`/repos/${repoId}/commit-settings`, { own: own ? value : null }); onSaved(d); notify('Convenciones guardadas', 'success'); onClose(); } catch (e) { notify(e.message, 'error'); } finally { setBusy(false); }
  };

  return (
    <Dialog open={!!open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>Convenciones de commit de este repositorio</DialogTitle>
      <DialogContent>
        {data && value && (
          <>
            <RadioGroup row value={own ? 'own' : 'global'} onChange={(e) => { const o = e.target.value === 'own'; setOwn(o); if (!o) setValue(data.global); }} sx={{ mb: 2 }}>
              <FormControlLabel value="global" control={<Radio size="small" />} label="Usar la configuración general" />
              <FormControlLabel value="own" control={<Radio size="small" />} label="Configuración propia" />
            </RadioGroup>
            {!own && <Alert severity="info" sx={{ mb: 2 }}>Se cambia en <b>Configuración → Commits</b> y aplica a todos los repositorios sin configuración propia.</Alert>}
            <Box sx={{ opacity: own ? 1 : 0.6, pointerEvents: own ? 'auto' : 'none' }}>
              <CommitConventionsForm value={value} onChange={setValue} sampleBranch={branch && detectTicket(branch, value.ticket.pattern) ? branch : undefined} />
            </Box>
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="contained" onClick={save} disabled={busy || !data}>Guardar</Button>
      </DialogActions>
    </Dialog>
  );
}

