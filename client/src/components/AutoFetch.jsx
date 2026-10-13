import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Badge, Box, Button, CircularProgress, Divider, FormControlLabel, IconButton, MenuItem, Popover, Select, Stack, Switch, Tooltip, Typography,
} from '@mui/material';
import AutoIcon from '@mui/icons-material/CloudSync';
import OffIcon from '@mui/icons-material/CloudOff';
import { api } from '../api/client.js';
import { useNotify } from './Notify.jsx';

const POLL = 30 * 1000;
const EVENT = 'gm-autofetch';
export const REPOS_REFRESH = 'gm-repos-refresh';
export const AUTOFETCH_RUN = 'gm-autofetch-run'; // lo lanza la paleta de comandos
let latest = null; // último estado conocido, compartido entre el vigilante y el botón

const publish = (s) => { latest = s; window.dispatchEvent(new CustomEvent(EVENT, { detail: s })); };

function relTime(iso) {
  if (!iso) return '';
  const s = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });
  const a = Math.abs(s);
  if (a < 60) return rtf.format(Math.round(s), 'second');
  if (a < 3600) return rtf.format(Math.round(s / 60), 'minute');
  return rtf.format(Math.round(s / 3600), 'hour');
}

// Consulta el estado del fetch automático y avisa cuando hay commits nuevos por bajar.
// Se monta una sola vez en la app, así los avisos llegan en cualquier pantalla.
export function AutoFetchWatcher() {
  const notify = useNotify();
  const navigate = useNavigate();
  const seq = useRef(null);
  const wasRunning = useRef(false);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const s = await api.get(`/auto-fetch${seq.current == null ? '' : `?after=${seq.current}`}`);
        if (!alive) return;
        publish(s);
        if (seq.current != null) {
          const ids = new Set();
          const updates = s.events.flatMap((e) => e.updates).filter((u) => !ids.has(u.id) && ids.add(u.id));
          if (updates.length) {
            const one = updates.length === 1 ? updates[0] : null;
            notify(
              one ? `${one.name}: ${one.newCommits} ${one.newCommits === 1 ? 'commit nuevo' : 'commits nuevos'} en ${one.branch} (${one.behind} por bajar)`
                : `${updates.length} repositorios tienen commits nuevos por bajar`,
              'info',
              {
                title: 'Novedades en el remoto',
                details: one ? null : updates.map((u) => `${u.name} (${u.branch}): +${u.newCommits} · ${u.behind} por bajar`).join('\n'),
                action: { label: one ? 'Abrir repositorio' : 'Ver lista', onClick: () => navigate(one ? `/repos/${one.id}` : '/repos') },
                duration: 12000,
              },
            );
          }
        }
        // Al terminar un ciclo, la lista de repos se refresca para mostrar los «↓ por bajar» al día.
        if (wasRunning.current && !s.running) window.dispatchEvent(new Event(REPOS_REFRESH));
        if (s.events.length && seq.current != null) window.dispatchEvent(new Event(REPOS_REFRESH));
        wasRunning.current = s.running;
        seq.current = s.seq;
      } catch { /* servidor no disponible: se reintenta en el próximo ciclo */ }
    };
    poll();
    const t = setInterval(poll, POLL);
    const onFocus = () => poll();
    window.addEventListener('focus', onFocus);
    window.addEventListener('gm-autofetch-poll', onFocus);
    return () => { alive = false; clearInterval(t); window.removeEventListener('focus', onFocus); window.removeEventListener('gm-autofetch-poll', onFocus); };
  }, [notify, navigate]);
  return null;
}

// Botón con el estado del fetch automático y sus ajustes (activar, intervalo, ejecutar ahora).
export function AutoFetchButton() {
  const [s, setS] = useState(latest);
  const [anchor, setAnchor] = useState(null);
  const [busy, setBusy] = useState(false);
  const notify = useNotify();
  const [, tick] = useState(0);

  useEffect(() => {
    const on = (e) => setS(e.detail);
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  // Mientras el panel está abierto, los tiempos relativos se refrescan cada 15 s.
  useEffect(() => { if (!anchor) return undefined; const t = setInterval(() => tick((n) => n + 1), 15000); return () => clearInterval(t); }, [anchor]);

  const save = async (body) => {
    try { publish({ ...latest, ...(await api.put('/auto-fetch', body)), events: [] }); }
    catch (e) { notify(e.message, 'error'); }
  };
  const runNow = async () => {
    setBusy(true);
    publish({ ...latest, running: true });
    try {
      const r = await api.post('/auto-fetch/run', {});
      const res = r.lastResult;
      // Si hay novedades, el vigilante ya las anuncia (con enlace al repo); aquí solo se informa lo demás.
      if (!res.updated || res.failed.length) {
        notify(res.updated ? `${res.updated} con commits nuevos por bajar` : 'No hay commits nuevos en los remotos', res.failed.length ? 'warning' : 'success',
          { title: `Fetch de ${res.repos} repositorios`, details: res.failed.length ? res.failed.map((f) => `${f.name}: ${f.error}`).join('\n') : null });
      }
      window.dispatchEvent(new Event('gm-autofetch-poll'));
      window.dispatchEvent(new Event(REPOS_REFRESH));
    } catch (e) { notify(e.message, 'error', { title: 'Fetch automático' }); }
    finally { setBusy(false); }
  };

  useEffect(() => {
    const on = () => runNow();
    window.addEventListener(AUTOFETCH_RUN, on);
    return () => window.removeEventListener(AUTOFETCH_RUN, on);
  });

  if (!s) return null;
  const running = s.running || busy;
  const res = s.lastResult;
  return (
    <>
      <Tooltip title={s.enabled ? `Fetch automático cada ${s.minutes} min${s.lastRun ? ` · último ${relTime(s.lastRun)}` : ''}` : 'Fetch automático desactivado'}>
        <IconButton onClick={(e) => setAnchor(e.currentTarget)} aria-label="Fetch automático">
          {running ? <CircularProgress size={22} />
            : <Badge color="error" variant="dot" invisible={!res?.failed?.length}>{s.enabled ? <AutoIcon color="primary" /> : <OffIcon />}</Badge>}
        </IconButton>
      </Tooltip>
      <Popover open={!!anchor} anchorEl={anchor} onClose={() => setAnchor(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { width: 320, p: 2 } } }}>
        <Typography variant="subtitle2" gutterBottom>Fetch automático</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Trae las novedades de los remotos de todos los repositorios sin tocar tus archivos, y te avisa cuando hay commits nuevos por bajar.
        </Typography>
        <FormControlLabel control={<Switch checked={s.enabled} onChange={(e) => save({ enabled: e.target.checked })} />} label={s.enabled ? 'Activado' : 'Desactivado'} />
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 1 }}>
          <Typography variant="body2" sx={{ flexGrow: 1 }}>Cada</Typography>
          <Select size="small" value={s.minutes} disabled={!s.enabled} onChange={(e) => save({ minutes: e.target.value })} sx={{ minWidth: 120 }}>
            {s.intervals.map((m) => <MenuItem key={m} value={m}>{m < 60 ? `${m} minutos` : '1 hora'}</MenuItem>)}
          </Select>
        </Stack>
        <Divider sx={{ my: 1.5 }} />
        <Box sx={{ fontSize: 13, color: 'text.secondary', '& b': { color: 'text.primary', fontWeight: 600 } }}>
          {running ? <div>Revisando los remotos…</div> : s.lastRun ? (
            <>
              <div>Último: <b>{relTime(s.lastRun)}</b> · {res.repos} repos en {Math.round(res.ms / 1000)} s</div>
              <div>{res.updated ? <b>{res.updated} con commits nuevos</b> : 'Sin novedades'}{res.failed.length ? <> · <Box component="span" sx={{ color: 'error.main' }}>{res.failed.length} con error</Box></> : ''}</div>
            </>
          ) : <div>Todavía no se ha ejecutado.</div>}
          {s.enabled && s.nextRun && !running && <div>Próximo: {relTime(s.nextRun)}</div>}
          {res?.failed?.length > 0 && (
            <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2, maxHeight: 120, overflow: 'auto', fontSize: 12 }}>
              {res.failed.map((f) => <li key={f.id}><b>{f.name}</b>: {f.error}</li>)}
            </Box>
          )}
        </Box>
        <Button fullWidth variant="outlined" sx={{ mt: 1.5 }} startIcon={<AutoIcon />} disabled={running} onClick={runNow}>Buscar novedades ahora</Button>
      </Popover>
    </>
  );
}
