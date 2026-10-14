import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert, Avatar, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, IconButton, LinearProgress,
  List, ListItem, ListItemAvatar, ListItemText, MenuItem, Paper, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/PersonAddAlt';
import DeleteIcon from '@mui/icons-material/DeleteOutline';
import GitHubIcon from '@mui/icons-material/GitHub';
import CloudIcon from '@mui/icons-material/Cloud';
import { api } from '../api/client.js';
import { useNotify } from '../components/Notify.jsx';
import { ConfirmDialog } from '../components/GitDialogs.jsx';

const host = (url) => { try { return new URL(url).host; } catch { return url; } };

const SCOPES = {
  gitlab: 'Permisos del token: api, read_user, read_repository y write_repository.',
  github: 'Token clásico con permiso «repo» (y «read:org» si usas organizaciones), o fine-grained con acceso a Contents y Pull requests (lectura y escritura).',
};

// Cuentas para otras instancias de GitLab y para GitHub, cada una con su token personal.
export default function Accounts() {
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [toRemove, setToRemove] = useState(null);
  const notify = useNotify();
  const navigate = useNavigate();

  const load = () => api.get('/accounts').then(setData).catch((e) => notify(e.message, 'error'));
  useEffect(() => { load(); }, []);

  const save = async () => {
    setBusy(true); setError(null);
    try {
      const a = await api.post('/accounts', form);
      notify(`Cuenta de ${host(a.url)} añadida como @${a.user?.username}`);
      setForm(null); load();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    const a = toRemove; setToRemove(null);
    try { await api.del(`/accounts/${a.id}`); notify(`Cuenta de ${host(a.url)} quitada`); load(); }
    catch (e) { notify(e.message, 'error'); }
  };

  const row = (a, main) => (
    <ListItem key={a.id || 'main'} divider secondaryAction={main ? (!a.user && (
      <Button size="small" variant="outlined" onClick={() => navigate('/connect/gitlab')}>Conectar GitLab</Button>
    )) : (
      <Tooltip title="Quitar cuenta"><IconButton onClick={() => setToRemove(a)}><DeleteIcon /></IconButton></Tooltip>
    )}>
      <ListItemAvatar><Avatar src={a.user?.avatar_url}>{a.provider === 'github' ? <GitHubIcon /> : <CloudIcon />}</Avatar></ListItemAvatar>
      <ListItemText
        primary={<Stack direction="row" spacing={1} alignItems="center">
          <span>{host(a.url)}</span>
          <Chip size="small" variant="outlined" icon={a.provider === 'github' ? <GitHubIcon /> : <CloudIcon />} label={a.provider === 'github' ? 'GitHub' : 'GitLab'} />
          {(main ? !!a.user : a.login) && <Chip size="small" color="primary" label="Sesión principal" />}
        </Stack>}
        secondary={a.user ? `@${a.user.username}${a.user.name ? ` · ${a.user.name}` : ''}` : 'Sin sesión'} />
    </ListItem>
  );

  return (
    <Box>
      <Stack direction="row" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h5" sx={{ flexGrow: 1 }}>Cuentas</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => { setError(null); setForm({ provider: 'github', url: 'https://github.com', token: '' }); }}>Añadir cuenta</Button>
      </Stack>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        Con una cuenta, Git Manager usa su token para fetch, pull y push de los repos de ese servidor, y para gestionar merge requests (GitLab) o pull requests (GitHub).
        Los tokens se guardan solo en tu equipo, en ~/.git-manager/config.json.
      </Typography>
      {!data ? <LinearProgress /> : (
        <Paper variant="outlined">
          <List disablePadding>
            {row(data.main, true)}
            {data.accounts.map((a) => row(a, false))}
          </List>
        </Paper>
      )}
      {data && !data.accounts.length && <Alert severity="info" sx={{ mt: 2 }}>Aún no hay cuentas adicionales. Añade GitHub u otra instancia de GitLab.</Alert>}

      <Dialog open={!!form} onClose={() => setForm(null)} fullWidth maxWidth="sm">
        <DialogTitle>Añadir cuenta</DialogTitle>
        <DialogContent>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <TextField select fullWidth margin="dense" label="Servicio" value={form?.provider || 'github'}
            onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value, url: e.target.value === 'github' ? 'https://github.com' : '' }))}>
            <MenuItem value="github">GitHub (github.com o Enterprise)</MenuItem>
            <MenuItem value="gitlab">Otra instancia de GitLab</MenuItem>
          </TextField>
          <TextField fullWidth margin="dense" label="URL" placeholder={form?.provider === 'github' ? 'https://github.com' : 'https://gitlab.ejemplo.com'}
            value={form?.url || ''} onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))} />
          <TextField fullWidth margin="dense" type="password" label="Token de acceso personal" autoComplete="off"
            value={form?.token || ''} onChange={(e) => setForm((f) => ({ ...f, token: e.target.value }))} helperText={SCOPES[form?.provider || 'github']} />
          <DialogContentText variant="caption" component="div" sx={{ mt: 1 }}>
            El token se comprueba contra el servidor antes de guardarlo.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setForm(null)}>Cancelar</Button>
          <Button variant="contained" disabled={busy || !form?.url || !form?.token} onClick={save}>{busy ? 'Comprobando…' : 'Añadir'}</Button>
        </DialogActions>
      </Dialog>
      <ConfirmDialog open={toRemove} title="Quitar cuenta" color="error" confirm="Quitar" onClose={() => setToRemove(null)} onConfirm={remove}
        body={<>Se borrará de este equipo el token de <b>{toRemove && host(toRemove.url)}</b>. Los repositorios de ese servidor seguirán en la lista, pero sin credenciales.</>} />
    </Box>
  );
}
