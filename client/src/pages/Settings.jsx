import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Button, FormControlLabel, IconButton, MenuItem, Paper, Radio, RadioGroup, Stack, Switch, TextField, ToggleButton, ToggleButtonGroup,
  Tooltip, Typography,
} from '@mui/material';
import DarkIcon from '@mui/icons-material/DarkMode';
import LightIcon from '@mui/icons-material/LightMode';
import CopyIcon from '@mui/icons-material/ContentCopy';
import AccountsIcon from '@mui/icons-material/ManageAccounts';
import { api } from '../api/client.js';
import { useNotify } from '../components/Notify.jsx';
import PathField from '../components/FolderPicker.jsx';
import { saveAutoFetch } from '../components/AutoFetch.jsx';
import { getPullPrefs, setPullPrefs } from '../pullPrefs.js';
import { getSwitchPrefs, setSwitchPrefs } from '../workspacePrefs.js';
import { CommitConventionsForm } from '../components/CommitSettings.jsx';

// Una sección de la configuración: título, explicación corta y sus controles.
function Section({ title, description, children }) {
  return (
    <Paper variant="outlined" sx={{ p: { xs: 2, sm: 2.5 } }}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={{ xs: 1.5, md: 4 }}>
        <Box sx={{ width: { md: 280 }, flexShrink: 0 }}>
          <Typography variant="subtitle1" fontWeight={700}>{title}</Typography>
          {description && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{description}</Typography>}
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>{children}</Box>
      </Stack>
    </Paper>
  );
}

// Configuración reunida en un solo lugar. Lo que es del servidor (carpeta de clonado, fetch automático) se guarda en
// config.json; lo que es de este navegador (tema, opciones de pull y de cambio de entorno) en el navegador.
export default function Settings({ mode, onToggleMode }) {
  const notify = useNotify();
  const navigate = useNavigate();
  const [server, setServer] = useState(null);
  const [cloneDir, setCloneDir] = useState('');
  const [auto, setAuto] = useState(null);
  const [pull, setPull] = useState(getPullPrefs);
  const [sw, setSw] = useState(getSwitchPrefs);
  const [commitConv, setCommitConv] = useState(null); // convenciones de commit generales (borrador)
  const [commitSaved, setCommitSaved] = useState(null);

  useEffect(() => {
    api.get('/repos/settings').then((d) => { setServer(d); setCloneDir(d.defaultCloneDir); }).catch((e) => notify(e.message, 'error'));
    api.get('/auto-fetch').then(setAuto).catch(() => {});
    api.get('/repos/commit-settings').then((d) => { setCommitConv(d.global); setCommitSaved(d.global); }).catch(() => {});
  }, [notify]);

  const saved = () => notify('Configuración guardada', 'success');
  const savePull = (p) => { const n = { ...pull, ...p }; setPull(n); setPullPrefs(n); saved(); };
  const saveSw = (p) => { const n = { ...sw, ...p }; setSw(n); setSwitchPrefs(n); saved(); };
  const saveAuto = async (body) => {
    try { setAuto(await saveAutoFetch(body)); saved(); } catch (e) { notify(e.message, 'error'); }
  };
  const saveCloneDir = async () => {
    try { const d = await api.put('/repos/settings', { defaultCloneDir: cloneDir }); setServer(d); setCloneDir(d.defaultCloneDir); saved(); } catch (e) { notify(e.message, 'error'); }
  };
  const saveCommitConv = async () => {
    try { const d = await api.put('/repos/commit-settings', { global: commitConv }); setCommitConv(d.global); setCommitSaved(d.global); saved(); } catch (e) { notify(e.message, 'error'); }
  };
  const copy = (text) => navigator.clipboard?.writeText(text).then(() => notify('Ruta copiada', 'success'), () => {});

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 2 }}>Configuración</Typography>
      <Stack spacing={2}>
        <Section title="Apariencia" description="Tema de la interfaz en este navegador (Alt+T).">
          <ToggleButtonGroup exclusive size="small" value={mode} onChange={(e, v) => v && v !== mode && onToggleMode()}
            sx={{ '& .MuiToggleButton-root': { gap: 0.75, px: 2, textTransform: 'none' } }}>
            <ToggleButton value="dark"><DarkIcon fontSize="small" />Oscuro</ToggleButton>
            <ToggleButton value="light"><LightIcon fontSize="small" />Claro</ToggleButton>
          </ToggleButtonGroup>
        </Section>

        <Section title="Clonar" description="Carpeta que se propone al clonar un repositorio. Cada proyecto se crea en una subcarpeta.">
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'flex-start' }}>
            <PathField label="Carpeta para clonar" fullWidth value={cloneDir} onChange={setCloneDir} pickerTitle="Carpeta donde se clonarán los repositorios" />
            <Button variant="contained" onClick={saveCloneDir} disabled={!server || !cloneDir || cloneDir === server.defaultCloneDir} sx={{ height: 40, flexShrink: 0 }}>Guardar</Button>
          </Stack>
        </Section>

        <Section title="Pull" description="Cómo se integran los cambios del remoto al hacer pull desde un repositorio o desde la lista.">
          <RadioGroup value={pull.rebase ? 'rebase' : 'merge'} onChange={(e) => savePull({ rebase: e.target.value === 'rebase' })}>
            <FormControlLabel value="merge" control={<Radio size="small" />} label="Merge: crea un commit de fusión si tu rama y la remota divergen" />
            <FormControlLabel value="rebase" control={<Radio size="small" />} label="Rebase: pone tus commits locales encima de los del remoto" />
          </RadioGroup>
          <FormControlLabel control={<Switch checked={pull.autostash} onChange={(e) => savePull({ autostash: e.target.checked })} />}
            label="Autostash: guarda los cambios sin commit antes del pull y los vuelve a aplicar después" />
        </Section>

        <Section title="Fetch automático" description="Busca novedades en los remotos de todos los repositorios cada cierto tiempo y avisa cuando hay commits nuevos. Se ejecuta en el servidor, aunque cierres el navegador.">
          {auto && (
            <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
              <FormControlLabel control={<Switch checked={auto.enabled} onChange={(e) => saveAuto({ enabled: e.target.checked })} />} label={auto.enabled ? 'Activado' : 'Desactivado'} />
              <TextField select size="small" label="Cada" value={auto.minutes} disabled={!auto.enabled} onChange={(e) => saveAuto({ minutes: e.target.value })} sx={{ minWidth: 140 }}>
                {(auto.intervals || [5, 10, 15, 30, 60]).map((m) => <MenuItem key={m} value={m}>{m} minutos</MenuItem>)}
              </TextField>
            </Stack>
          )}
        </Section>

        <Section title="Entornos de trabajo" description="Opciones por defecto al cambiar de entorno. También se pueden cambiar en cada cambio.">
          <Stack>
            <FormControlLabel control={<Switch checked={sw.fetch} onChange={(e) => saveSw({ fetch: e.target.checked })} />} label="Buscar novedades en origin antes de cambiar (fetch)" />
            <FormControlLabel control={<Switch checked={sw.pull} onChange={(e) => saveSw({ pull: e.target.checked })} />} label="Actualizar cada rama después de cambiar (pull solo de avance rápido)" />
            <Typography variant="body2" sx={{ mt: 1.5, mb: 0.5 }}>Con cambios sin commit:</Typography>
            <RadioGroup value={sw.dirty} onChange={(e) => saveSw({ dirty: e.target.value })}>
              <FormControlLabel value="stash" control={<Radio size="small" />} label="Guardarlos y recuperarlos al volver a su rama (recomendado)" />
              <FormControlLabel value="skip" control={<Radio size="small" />} label="No cambiar esos repositorios" />
              <FormControlLabel value="carry" control={<Radio size="small" />} label="Llevarlos a la nueva rama (falla si chocan)" />
            </RadioGroup>
          </Stack>
        </Section>

        <Section title="Commits" description="Convenciones para los mensajes de commit de todos los repositorios. Cada repositorio puede tener las suyas desde el botón de ajustes de su caja de commit.">
          {commitConv && (
            <>
              <CommitConventionsForm value={commitConv} onChange={setCommitConv} />
              <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ mt: 2 }}>
                <Button onClick={() => setCommitConv(commitSaved)} disabled={JSON.stringify(commitConv) === JSON.stringify(commitSaved)}>Descartar</Button>
                <Button variant="contained" onClick={saveCommitConv} disabled={JSON.stringify(commitConv) === JSON.stringify(commitSaved)}>Guardar</Button>
              </Stack>
            </>
          )}
        </Section>

        <Section title="Cuentas" description="Sesiones de GitLab y GitHub, y cuentas adicionales para otros servidores.">
          <Button variant="outlined" startIcon={<AccountsIcon />} onClick={() => navigate('/accounts')}>Gestionar cuentas</Button>
        </Section>

        <Section title="Datos" description="Dónde guarda Git Manager su configuración, los tokens y el registro de operaciones. Fuera del proyecto y nunca se sube a git.">
          {server && (
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography sx={{ fontFamily: (t) => t.typography.fontFamilyCode, fontSize: 13, wordBreak: 'break-all' }}>{server.configDir}</Typography>
              <Tooltip title="Copiar ruta"><IconButton size="small" onClick={() => copy(server.configDir)}><CopyIcon fontSize="small" /></IconButton></Tooltip>
            </Stack>
          )}
          <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1 }}>
            Para que Git Manager arranque con Windows usa <Box component="code">npm run startup:install</Box> (ver el README).
          </Typography>
        </Section>
      </Stack>
    </Box>
  );
}
