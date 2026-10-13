import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Autocomplete, Box, Chip, InputAdornment, TextField, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import SearchIcon from '@mui/icons-material/Search';
import GitIcon from '@mui/icons-material/AccountTree';
import BranchIcon from '@mui/icons-material/CallSplit';
import { api } from '../api/client.js';

const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Coincide si todas las palabras escritas aparecen en el nombre, la ruta o la rama.
const filterRepos = (options, { inputValue }) => {
  const words = norm(inputValue).split(/\s+/).filter(Boolean);
  if (!words.length) return options;
  return options
    .filter((o) => { const hay = norm(`${o.name} ${o.path} ${o.branch}`); return words.every((w) => hay.includes(w)); })
    .sort((a, b) => (norm(b.name).startsWith(words[0]) ? 1 : 0) - (norm(a.name).startsWith(words[0]) ? 1 : 0));
};

// Buscador global de repositorios locales en la barra superior (Ctrl+K).
export default function RepoSearch() {
  const [repos, setRepos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [input, setInput] = useState('');
  const inputRef = useRef(null);
  const navigate = useNavigate();

  const refresh = () => {
    setLoading(true);
    api.get('/repos/index').then(setRepos).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); inputRef.current?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <Autocomplete
      sx={{
        width: { xs: 220, md: 340, lg: 420 }, mr: 2,
        // Autocomplete reduce el padding izquierdo a 6px; se amplía para que la lupa no quede pegada al borde.
        '& .MuiAutocomplete-inputRoot.MuiOutlinedInput-root.MuiInputBase-sizeSmall': { pl: 1.5 },
      }}
      size="small"
      options={repos}
      loading={loading}
      value={null}
      inputValue={input}
      onInputChange={(e, v, reason) => reason !== 'reset' && setInput(v)}
      onOpen={refresh}
      filterOptions={filterRepos}
      getOptionLabel={(o) => o.name}
      getOptionDisabled={(o) => o.missing}
      isOptionEqualToValue={(a, b) => a.id === b.id}
      noOptionsText={repos.length ? 'Ningún repositorio coincide' : 'No hay repositorios añadidos'}
      loadingText="Cargando…"
      blurOnSelect
      clearOnBlur={false}
      onChange={(e, repo) => { if (repo) { setInput(''); navigate(`/repos/${repo.id}`); } }}
      slotProps={{ paper: { sx: { mt: 0.5, minWidth: 520 } }, listbox: { sx: { maxHeight: 440 } } }}
      renderOption={({ key, ...props }, o) => (
        <Box component="li" key={o.id} {...props} sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start !important', py: '8px !important' }}>
          <GitIcon fontSize="small" color={o.missing ? 'disabled' : 'primary'} sx={{ mt: 0.25 }} />
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="body2" fontWeight={600} noWrap>{o.name}</Typography>
              {o.missing
                ? <Chip size="small" color="error" variant="outlined" label="Carpeta no encontrada" />
                : o.branch && <Chip size="small" variant="outlined" color="primary" icon={<BranchIcon sx={{ fontSize: '14px !important' }} />} label={o.branch} sx={{ maxWidth: 260, height: 20, fontSize: 11 }} />}
            </Box>
            <Typography variant="caption" color="text.secondary" noWrap component="div" sx={{ fontFamily: (t) => t.typography.fontFamilyCode, fontSize: 11 }}>{o.path}</Typography>
          </Box>
        </Box>
      )}
      renderInput={(params) => (
        <TextField
          {...params}
          inputRef={inputRef}
          placeholder="Buscar repositorio…"
          InputProps={{
            ...params.InputProps,
            startAdornment: <InputAdornment position="start" sx={{ ml: 0, mr: 1 }}><SearchIcon fontSize="small" sx={{ color: 'text.secondary' }} /></InputAdornment>,
            endAdornment: (
              <>
                {!input && (
                  <Box component="kbd" sx={(t) => ({
                    fontFamily: t.typography.fontFamily, fontSize: 11, fontWeight: 700, px: 0.75, py: 0.25, mr: 0.5, borderRadius: 1,
                    border: 1, borderColor: 'divider', bgcolor: alpha(t.palette.text.primary, 0.06), color: 'text.secondary',
                  })}>Ctrl+K</Box>
                )}
                {params.InputProps.endAdornment}
              </>
            ),
            sx: { borderRadius: 2.5, fontSize: 14 },
          }}
        />
      )}
    />
  );
}
