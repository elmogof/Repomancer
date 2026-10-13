import { useEffect, useState } from 'react';
import {
  Box, Checkbox, Chip, Dialog, DialogContent, DialogTitle, FormControlLabel, LinearProgress, List,
  ListItemButton, ListItemText, Paper, Stack, Typography,
} from '@mui/material';
import { api } from '../api/client.js';
import DiffView from '../components/DiffView.jsx';

const fmt = (d) => new Date(d).toLocaleString('es-CR', { dateStyle: 'medium', timeStyle: 'short' });

export default function History({ repoId }) {
  const [commits, setCommits] = useState(null);
  const [all, setAll] = useState(false);
  const [detail, setDetail] = useState(null);

  useEffect(() => { api.get(`/repos/${repoId}/log?limit=200&all=${all}`).then(setCommits).catch(() => setCommits([])); }, [repoId, all]);

  const open = (c) => { setDetail({ ...c, loading: true }); api.get(`/repos/${repoId}/commit/${c.hash}`).then(setDetail); };

  return (
    <Box>
      <FormControlLabel control={<Checkbox checked={all} onChange={(e) => setAll(e.target.checked)} />} label="Mostrar todas las ramas" />
      {!commits ? <LinearProgress /> : (
        <Paper variant="outlined">
          <List dense disablePadding>
            {commits.length === 0 && <Typography color="text.secondary" sx={{ p: 2 }}>Todavía no hay commits.</Typography>}
            {commits.map((c) => (
              <ListItemButton key={c.hash} onClick={() => open(c)} divider>
                <ListItemText
                  primary={<Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                    <Typography component="span" sx={{ fontFamily: 'monospace', color: 'primary.main' }}>{c.short}</Typography>
                    <span>{c.subject}</span>
                    {c.refs.map((r) => <Chip key={r} size="small" variant="outlined" label={r.replace('HEAD -> ', '★ ')} />)}
                  </Stack>}
                  secondary={`${c.author} · ${fmt(c.date)}`} />
              </ListItemButton>
            ))}
          </List>
        </Paper>
      )}
      <Dialog open={!!detail} onClose={() => setDetail(null)} fullWidth maxWidth="lg">
        <DialogTitle>{detail?.subject || detail?.message?.split('\n')[0]}</DialogTitle>
        <DialogContent>
          {detail?.loading ? <LinearProgress /> : detail && (
            <>
              <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'monospace' }}>{detail.hash}</Typography>
              <Typography variant="body2" color="text.secondary" gutterBottom>{detail.author} · {fmt(detail.date)}</Typography>
              {detail.message.includes('\n') && <Box component="pre" sx={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>{detail.message}</Box>}
              <DiffView diff={detail.diff} maxHeight="65vh" />
            </>
          )}
        </DialogContent>
      </Dialog>
    </Box>
  );
}
