import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Avatar, Box, Chip, LinearProgress, List, ListItemAvatar, ListItemButton, ListItemText, MenuItem, Paper,
  Stack, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import { api, qs } from '../api/client.js';
import { useNotify } from '../components/Notify.jsx';
import InstanceSelect from '../components/InstanceSelect.jsx';
import { useGitlabInstance } from '../gitlabInstance.js';
import ListSkeleton from '../components/ListSkeleton.jsx';

// Última respuesta de cada consulta: al volver a la pantalla se muestra al instante mientras se actualiza.
const cache = new Map();

const STATE_COLOR = { opened: 'success', merged: 'info', closed: 'default' };
const STATE_LABEL = { opened: 'Abierto', merged: 'Fusionado', closed: 'Cerrado' };

export default function MergeRequests() {
  const [params, setParams] = useSearchParams();
  const project = params.get('project');
  const [state, setState] = useState('opened');
  const [scope, setScope] = useState('all');
  const notify = useNotify();
  const navigate = useNavigate();
  const instance = useGitlabInstance();
  const url = project ? `/gitlab/projects/${project}/merge_requests${qs({ state })}` : `/gitlab/merge_requests${qs({ state, scope })}`;
  const key = `${instance || ''} ${url}`;
  const [items, setItems] = useState(() => cache.get(key) || null);
  const [loading, setLoading] = useState(true);

  // Al cambiar de filtro se mantiene la lista anterior (con la barra de carga) hasta que llega la nueva.
  useEffect(() => {
    let alive = true;
    setLoading(true);
    if (cache.has(key)) setItems(cache.get(key));
    api.get(url)
      .then((d) => { cache.set(key, d); if (alive) setItems(d); })
      .catch((e) => { if (alive) { notify(e.message, 'error'); setItems((cur) => cur || []); } })
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [key]);

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
        <Typography variant="h5" sx={{ flexGrow: 1 }}>Merge requests</Typography>
        <InstanceSelect />
        {project && <Chip label={params.get('name') || `Proyecto ${project}`} onDelete={() => setParams({})} />}
        {!project && (
          <TextField select size="small" value={scope} onChange={(e) => setScope(e.target.value)} sx={{ width: 220 }}>
            <MenuItem value="all">Todos los visibles</MenuItem>
            <MenuItem value="created_by_me">Creados por mí</MenuItem>
            <MenuItem value="assigned_to_me">Asignados a mí</MenuItem>
          </TextField>
        )}
        <ToggleButtonGroup size="small" exclusive value={state} onChange={(e, v) => v && setState(v)}>
          <ToggleButton value="opened">Abiertos</ToggleButton>
          <ToggleButton value="merged">Fusionados</ToggleButton>
          <ToggleButton value="closed">Cerrados</ToggleButton>
          <ToggleButton value="all">Todos</ToggleButton>
        </ToggleButtonGroup>
      </Stack>
      <Box sx={{ height: 4, mb: 1 }}>{loading && <LinearProgress />}</Box>
      {!items ? (
        <Paper variant="outlined"><List disablePadding><ListSkeleton /></List></Paper>
      ) : (
        <Paper variant="outlined" sx={{ opacity: loading ? 0.6 : 1, transition: 'opacity .15s' }}>
          <List disablePadding>
            {items.length === 0 && !loading && <Typography color="text.secondary" sx={{ p: 2 }}>No hay merge requests.</Typography>}
            {items.map((mr) => (
              <ListItemButton key={mr.id} divider onClick={() => navigate(`/projects/${mr.project_id}/merge-requests/${mr.iid}`)}>
                <ListItemAvatar><Avatar src={mr.author?.avatar_url} /></ListItemAvatar>
                <ListItemText
                  primary={<Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                    <span>{mr.title}</span>
                    <Chip size="small" color={STATE_COLOR[mr.state]} label={STATE_LABEL[mr.state] || mr.state} />
                    {mr.draft && <Chip size="small" variant="outlined" label="Draft" />}
                  </Stack>}
                  secondary={`${mr.references?.full || '!' + mr.iid} · ${mr.source_branch} → ${mr.target_branch} · ${mr.author?.name} · ${new Date(mr.updated_at).toLocaleString('es')}`} />
              </ListItemButton>
            ))}
          </List>
        </Paper>
      )}
    </Box>
  );
}
