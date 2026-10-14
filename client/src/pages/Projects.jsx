import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Avatar, Box, Button, InputAdornment, LinearProgress, List, ListItem, ListItemAvatar, ListItemText,
  Paper, Stack, TextField, Typography,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import CloneIcon from '@mui/icons-material/CloudDownload';
import MergeIcon from '@mui/icons-material/CallMerge';
import { api, qs } from '../api/client.js';
import { useNotify } from '../components/Notify.jsx';
import InstanceSelect from '../components/InstanceSelect.jsx';
import { useGitlabInstance } from '../gitlabInstance.js';
import CloneDialog from '../components/CloneDialog.jsx';
import ListSkeleton from '../components/ListSkeleton.jsx';

// Última lista sin búsqueda por instancia: al volver a la pantalla se muestra al instante mientras se actualiza.
const cache = new Map();

export default function Projects() {
  const instance = useGitlabInstance();
  const cached = cache.get(instance || '');
  const [search, setSearch] = useState('');
  const [items, setItems] = useState(cached?.items || []);
  const [next, setNext] = useState(cached?.next ?? null);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(!!cached); // hasta la primera respuesta no se muestra «no se encontraron»
  const firstRun = useRef(true);
  const [clone, setClone] = useState(null);
  const notify = useNotify();
  const navigate = useNavigate();

  const load = (page = 1, append = false) => {
    setLoading(true);
    api.get(`/gitlab/projects${qs({ search, page })}`)
      .then((d) => {
        setItems((prev) => (append ? [...prev, ...d.items] : d.items)); setNext(d.nextPage);
        if (!search && !append) cache.set(instance || '', { items: d.items, next: d.nextPage });
      })
      .catch((e) => notify(e.message, 'error')).finally(() => { setLoading(false); setLoaded(true); });
  };
  // La primera carga sale de inmediato; al escribir en el buscador se espera un poco antes de pedir.
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; load(); return undefined; }
    setLoading(true);
    const t = setTimeout(() => load(), 300);
    return () => clearTimeout(t);
  }, [search, instance]);
  const showSkeleton = !items.length && (loading || !loaded);

  return (
    <Box>
      <Stack direction="row" alignItems="center" sx={{ mb: 2 }} spacing={2}>
        <Typography variant="h5" sx={{ flexGrow: 1 }}>Proyectos GitLab</Typography>
        <InstanceSelect />
        <TextField size="small" placeholder="Buscar proyecto…" value={search} onChange={(e) => setSearch(e.target.value)}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> }} sx={{ width: 320 }} />
      </Stack>
      {/* La barra se superpone en un hueco fijo para que la lista no se mueva al cargar. */}
      <Box sx={{ height: 4, mb: 1 }}>{loading && <LinearProgress />}</Box>
      <Paper variant="outlined">
        <List>
          {showSkeleton && <ListSkeleton />}
          {items.map((p) => (
            <ListItem key={p.id} divider secondaryAction={
              <Stack direction="row" spacing={1}>
                <Button size="small" startIcon={<MergeIcon />} onClick={() => navigate(`/merge-requests?project=${p.id}&name=${encodeURIComponent(p.path_with_namespace)}`)}>MRs</Button>
                <Button size="small" variant="outlined" startIcon={<CloneIcon />} onClick={() => setClone(p)}>Clonar</Button>
              </Stack>
            }>
              <ListItemAvatar><Avatar variant="rounded" src={p.avatar_url}>{p.name[0]?.toUpperCase()}</Avatar></ListItemAvatar>
              <ListItemText primary={p.name_with_namespace} secondary={[p.description, `actividad ${new Date(p.last_activity_at).toLocaleDateString('es-CR')}`].filter(Boolean).join(' · ')} secondaryTypographyProps={{ noWrap: true }} sx={{ pr: 24 }} />
            </ListItem>
          ))}
          {loaded && !loading && items.length === 0 && <Typography color="text.secondary" sx={{ p: 2 }}>No se encontraron proyectos.</Typography>}
        </List>
      </Paper>
      {next && <Button sx={{ mt: 2 }} onClick={() => load(Number(next), true)} disabled={loading}>Cargar más</Button>}
      <CloneDialog open={!!clone} onClose={() => setClone(null)} initialUrl={clone?.http_url_to_repo} gitlabProjectId={clone?.id}
        onCloned={(repo) => { setClone(null); notify('Repositorio clonado'); navigate(`/repos/${repo.id}`); }} />
    </Box>
  );
}
