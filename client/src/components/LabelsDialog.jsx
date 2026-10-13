import { useEffect, useState } from 'react';
import { Autocomplete, Button, Chip, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, TextField } from '@mui/material';

// Color estable por etiqueta (mismo nombre → mismo color en toda la app).
const PALETTE = ['#3399FF', '#1DB45A', '#F1A20D', '#E85D9E', '#8B6CEF', '#14B8C4', '#FF7A45', '#9CCC3C'];
export function labelColor(name) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

const field = (label, value, onChange, options, helper) => (
  <Autocomplete multiple freeSolo options={options} value={value} onChange={(e, v) => onChange(v.map((x) => x.trim()).filter(Boolean))}
    renderTags={(v, getProps) => v.map((o, i) => {
      const { key, ...p } = getProps({ index: i });
      return <Chip key={key} size="small" label={o} {...p} sx={{ borderColor: labelColor(o), color: labelColor(o) }} variant="outlined" />;
    })}
    renderInput={(p) => <TextField {...p} label={label} placeholder="Escribe y pulsa Enter" helperText={helper} />} sx={{ mt: 1 }} />
);

// Etiquetas de un repositorio (repos = [uno]) o de varios a la vez (añadir y quitar en lote).
export default function LabelsDialog({ open, repos, allLabels, onClose, onSave }) {
  const single = repos?.length === 1;
  const [labels, setLabels] = useState([]);
  const [add, setAdd] = useState([]);
  const [remove, setRemove] = useState([]);
  useEffect(() => { if (open) { setLabels(single ? repos[0].labels || [] : []); setAdd([]); setRemove([]); } }, [open]);

  const present = [...new Set((repos || []).flatMap((r) => r.labels || []))];
  return (
    <Dialog open={!!open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{single ? `Etiquetas de ${repos[0].name}` : `Etiquetas de ${repos?.length} repositorios`}</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 1 }}>
          Agrupa tus repositorios (por cliente, proyecto o equipo) y fíltralos con un clic en la lista.
        </DialogContentText>
        {single
          ? field('Etiquetas', labels, setLabels, allLabels)
          : <>
            {field('Añadir etiquetas', add, setAdd, allLabels)}
            {present.length > 0 && field('Quitar etiquetas', remove, setRemove, present, 'Se quitan solo de los repositorios seleccionados.')}
          </>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="contained" disabled={!single && !add.length && !remove.length} onClick={() => onSave(single ? { labels } : { add, remove })}>Guardar</Button>
      </DialogActions>
    </Dialog>
  );
}
