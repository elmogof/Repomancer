import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert, Box, Button, Chip, LinearProgress, List, ListItemButton, ListItemText, MenuItem, Paper, Stack, TextField, ToggleButton,
  ToggleButtonGroup, Typography,
} from '@mui/material';
import OpenIcon from '@mui/icons-material/OpenInNew';
import { api, qs } from '../api/client.js';
import ListSkeleton from '../components/ListSkeleton.jsx';

const cache = new Map();

const fmt = (d) => new Date(d).toLocaleDateString('es-CR', { dateStyle: 'medium' });
const host = (url) => { try { return new URL(url).host; } catch { return url; } };

// Pull requests de GitHub en los que participas, de todas las cuentas de GitHub añadidas.
export default function PullRequests() {
  const [filter, setFilter] = useState('involves');
  const [state, setState] = useState('open');
  const url = `/github/pulls${qs({ filter, state })}`;
  const [data, setData] = useState(() => cache.get(url) || null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  // Se mantiene la lista anterior hasta que llega la nueva; la última respuesta de cada filtro se recuerda.
  useEffect(() => {
    let alive = true;
    setLoading(true);
    if (cache.has(url)) setData(cache.get(url));
    api.get(url)
      .then((d) => { cache.set(url, d); if (alive) setData(d); })
      .catch((e) => alive && setData([{ error: e.message, items: [] }]))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [url]);

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
        <Typography variant="h5" sx={{ flexGrow: 1 }}>Pull requests (GitHub)</Typography>
        <TextField select size="small" value={filter} onChange={(e) => setFilter(e.target.value)} sx={{ width: 230 }}>
          <MenuItem value="involves">Donde participo</MenuItem>
          <MenuItem value="author">Creados por mí</MenuItem>
          <MenuItem value="review">Revisión solicitada</MenuItem>
        </TextField>
        <ToggleButtonGroup size="small" exclusive value={state} onChange={(e, v) => v && setState(v)}>
          <ToggleButton value="open">Abiertos</ToggleButton>
          <ToggleButton value="closed">Cerrados</ToggleButton>
        </ToggleButtonGroup>
      </Stack>
      <Box sx={{ height: 4, mb: 1 }}>{loading && <LinearProgress />}</Box>
      {!data ? (
        <Paper variant="outlined"><List disablePadding><ListSkeleton avatar={false} /></List></Paper>
      ) : !data.length ? (
        <Alert severity="info" action={<Button color="inherit" onClick={() => navigate('/accounts')}>Ir a Cuentas</Button>}>
          Añade una cuenta de GitHub (con su token personal) para ver y crear pull requests desde aquí.
        </Alert>
      ) : data.map((group, i) => (
        <Box key={group.account?.id || i} sx={{ mb: 3 }}>
          {group.account && <Typography variant="subtitle2" sx={{ mb: 1 }}>{host(group.account.url)} · @{group.account.user?.username}</Typography>}
          {group.error && <Alert severity="error" sx={{ mb: 1 }}>{group.error}</Alert>}
          {!group.error && !group.items.length && !loading && <Typography color="text.secondary">No hay pull requests con este filtro.</Typography>}
          {group.items.length > 0 && (
            <Paper variant="outlined" sx={{ opacity: loading ? 0.6 : 1, transition: 'opacity .15s' }}>
              <List disablePadding>
                {group.items.map((p) => (
                  <ListItemButton key={p.html_url} divider component="a" href={p.html_url} target="_blank" rel="noopener">
                    <ListItemText
                      primary={<Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                        <span>{p.title}</span>
                        {p.draft && <Chip size="small" label="Borrador" />}
                        <Chip size="small" variant="outlined" color={p.state === 'open' ? 'success' : 'default'} label={p.state === 'open' ? 'Abierto' : 'Cerrado'} />
                      </Stack>}
                      secondary={`${p.repo} #${p.number} · ${p.user} · actualizado ${fmt(p.updated_at)}`} />
                    <OpenIcon fontSize="small" color="action" />
                  </ListItemButton>
                ))}
              </List>
            </Paper>
          )}
        </Box>
      ))}
    </Box>
  );
}
