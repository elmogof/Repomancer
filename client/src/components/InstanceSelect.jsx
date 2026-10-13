import { useEffect, useState } from 'react';
import { MenuItem, TextField } from '@mui/material';
import { api } from '../api/client.js';
import { setInstance, useGitlabInstance } from '../gitlabInstance.js';

const host = (url) => { try { return new URL(url).host; } catch { return url; } };

// Selector de instancia de GitLab; solo aparece si hay más de una configurada.
export default function InstanceSelect() {
  const current = useGitlabInstance();
  const [list, setList] = useState([]);
  useEffect(() => {
    api.get('/gitlab/instances?instance=main').then((l) => {
      setList(l);
      if (!l.some((i) => i.id === current)) setInstance('main'); // la cuenta guardada ya no existe
    }).catch(() => setList([]));
  }, []);
  if (list.length < 2) return null;
  return (
    <TextField select size="small" label="Instancia" value={list.some((i) => i.id === current) ? current : 'main'} onChange={(e) => setInstance(e.target.value)} sx={{ minWidth: 220 }}>
      {list.map((i) => <MenuItem key={i.id} value={i.id}>{host(i.url)}{i.user?.username ? ` · @${i.user.username}` : ''}</MenuItem>)}
    </TextField>
  );
}
