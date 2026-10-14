import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Dialog, InputAdornment, InputBase, List, ListItemButton, ListItemIcon, ListItemText, ListSubheader, Typography } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import CommandIcon from '@mui/icons-material/KeyboardCommandKey';
import FolderIcon from '@mui/icons-material/FolderOutlined';
import WorkspacesIcon from '@mui/icons-material/Workspaces';
import { api } from '../api/client.js';

// Registro de comandos: cada pantalla registra los suyos mientras está montada (useCommands).
// Un comando: { id, title, group, keys?, icon?, run, disabled? }.
// keys: 'f', 'shift+p', 'alt+1', 'ctrl+shift+p'… (passive: el atajo lo maneja otro componente; aquí solo se muestra). Las teclas sin Ctrl/Alt solo actúan fuera de campos de texto y sin diálogos abiertos.
const Ctx = createContext(null);
export const OPEN_PALETTE = 'gm-open-palette';

const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function eventKeys(e) {
  const k = /^Digit\d$/.test(e.code) ? e.code.slice(5) : e.key.toLowerCase();
  const parts = [];
  if (e.ctrlKey || e.metaKey) parts.push('ctrl');
  if (e.altKey) parts.push('alt');
  // Mayús cuenta en letras, dígitos y teclas con nombre; en signos («?») ya va incluida en el carácter.
  if (e.shiftKey && (/^[a-z0-9]$/.test(k) || k.length > 1)) parts.push('shift');
  parts.push(k);
  return parts.join('+');
}

// Texto legible del atajo: «Mayús+P», «Alt+1»…
export const keyLabel = (keys) => keys?.split(' ').map((combo) => combo.split('+').map((p) => ({
  ctrl: 'Ctrl', alt: 'Alt', shift: 'Mayús', escape: 'Esc', enter: 'Enter', '/': '/', '?': '?',
}[p] || p.toUpperCase())).join('+')).join(' o ');

const typing = (el) => el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
const modalOpen = () => !!document.querySelector('.MuiDialog-root, .MuiPopover-root, .MuiDrawer-modal');

export function CommandsProvider({ children }) {
  const sources = useRef(new Map());
  const [version, setVersion] = useState(0);
  const [open, setOpen] = useState(false);

  const register = useCallback((id, list) => {
    sources.current.set(id, list);
    setVersion((v) => v + 1);
    return () => { sources.current.delete(id); setVersion((v) => v + 1); };
  }, []);
  const all = useCallback(() => [...sources.current.values()].flat().filter(Boolean), []);

  // Atajos globales.
  useEffect(() => {
    const onKey = (e) => {
      if (e.defaultPrevented || e.repeat) return;
      const combo = eventKeys(e);
      if (combo === 'ctrl+shift+p' || combo === 'f1') { e.preventDefault(); setOpen(true); return; }
      const plain = !combo.includes('ctrl') && !combo.includes('alt');
      if (plain && (typing(document.activeElement) || modalOpen())) return;
      if (combo === '?') { e.preventDefault(); setOpen(true); return; }
      const cmd = all().find((c) => !c.disabled && !c.passive && c.keys?.split(' ').includes(combo));
      if (cmd) { e.preventDefault(); cmd.run(); }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener(OPEN_PALETTE, onOpen);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener(OPEN_PALETTE, onOpen); };
  }, [all]);

  const value = useMemo(() => ({ register, all, version }), [register, all, version]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <CommandPalette open={open} onClose={() => setOpen(false)} commands={open ? all() : []} />
    </Ctx.Provider>
  );
}

// Registra comandos mientras el componente está montado. deps: cuándo volver a registrarlos.
export function useCommands(id, factory, deps) {
  const ctx = useContext(Ctx);
  const latest = useRef(factory);
  latest.current = factory;
  useEffect(() => {
    if (!ctx) return undefined;
    // run() siempre llama a la versión más reciente del comando (con el estado actual).
    const list = latest.current().filter(Boolean).map((c) => ({ ...c, run: (...a) => latest.current().find((x) => x && x.id === c.id)?.run(...a) }));
    return ctx.register(id, list);
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
}

function CommandPalette({ open, onClose, commands }) {
  const theme = useTheme();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const [repos, setRepos] = useState([]);
  const [workspaces, setWorkspaces] = useState([]);
  const listRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setQ(''); setSel(0);
    api.get('/repos/index').then(setRepos).catch(() => setRepos([]));
    api.get('/workspaces').then((d) => setWorkspaces(d.groups)).catch(() => setWorkspaces([]));
  }, [open]);

  const items = useMemo(() => {
    const words = norm(q).split(/\s+/).filter(Boolean);
    const match = (text) => words.every((w) => norm(text).includes(w));
    const cmds = commands.filter((c) => !c.disabled && match(`${c.group} ${c.title}`));
    // Los repositorios solo aparecen al escribir, para no tapar los comandos.
    const repoItems = words.length ? repos.filter((r) => !r.missing && match(`repositorio ${r.name} ${r.branch || ''}`)).slice(0, 8).map((r) => ({
      id: `repo:${r.id}`, group: 'Abrir repositorio', title: r.name, hint: r.branch, icon: <FolderIcon fontSize="small" />, run: () => navigate(`/repos/${r.id}`),
    })) : [];
    // Entornos de trabajo: «Portal Clientes → QA» abre la vista previa del cambio.
    const envItems = words.length ? workspaces.flatMap((g) => g.envs.map((e) => ({
      id: `ws:${g.id}:${e.id}`, group: 'Cambiar entorno de trabajo', title: `${g.name} → ${e.name}`, icon: <WorkspacesIcon fontSize="small" />,
      run: () => navigate(`/workspaces?switch=${g.id}:${e.id}`),
    }))).filter((c) => match(`entorno ${c.title}`)).slice(0, 8) : [];
    return [...cmds, ...envItems, ...repoItems];
  }, [q, commands, repos, workspaces, navigate]);

  useEffect(() => { setSel(0); }, [q]);
  useEffect(() => { listRef.current?.querySelector('.Mui-selected')?.scrollIntoView({ block: 'nearest' }); }, [sel]);

  const run = (c) => { onClose(); setTimeout(() => c.run(), 0); };
  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, items.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
    else if (e.key === 'Enter' && items[sel]) { e.preventDefault(); run(items[sel]); }
  };

  let lastGroup = null;
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" sx={{ '& .MuiDialog-container': { alignItems: 'flex-start' } }}
      slotProps={{ paper: { sx: { mt: { xs: 2, sm: 10 }, overflow: 'hidden' } } }}>
      <InputBase autoFocus fullWidth value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKeyDown}
        placeholder="Escribe un comando o el nombre de un repositorio…"
        startAdornment={<InputAdornment position="start"><CommandIcon fontSize="small" /></InputAdornment>}
        sx={{ px: 2, py: 1.5, fontSize: 16, borderBottom: 1, borderColor: 'divider' }} />
      <List ref={listRef} dense disablePadding sx={{ maxHeight: '60vh', overflow: 'auto', py: 0.5 }}>
        {items.length === 0 && <Typography color="text.secondary" sx={{ p: 2 }}>Ningún comando coincide.</Typography>}
        {items.map((c, i) => {
          const header = c.group !== lastGroup;
          lastGroup = c.group;
          return [
            header && <ListSubheader key={`h:${c.group}`} sx={{ lineHeight: 2.2, fontSize: 11.5, textTransform: 'uppercase', letterSpacing: 0.6 }}>{c.group}</ListSubheader>,
            <ListItemButton key={c.id} selected={i === sel} onMouseMove={() => sel !== i && setSel(i)} onClick={() => run(c)} sx={{ mx: 0.5, borderRadius: 1 }}>
              {c.icon && <ListItemIcon sx={{ minWidth: 34 }}>{c.icon}</ListItemIcon>}
              <ListItemText primary={c.title} secondary={c.hint} primaryTypographyProps={{ fontSize: 14 }} secondaryTypographyProps={{ fontSize: 11.5 }} />
              {c.keys && (
                <Box component="kbd" sx={{
                  ml: 1, px: 0.75, py: 0.25, borderRadius: 1, border: 1, borderColor: 'divider', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
                  fontFamily: theme.typography.fontFamily, color: 'text.secondary', bgcolor: alpha(theme.palette.text.primary, 0.06),
                }}>{keyLabel(c.keys)}</Box>
              )}
            </ListItemButton>,
          ];
        })}
      </List>
      <Box sx={{ px: 2, py: 0.75, borderTop: 1, borderColor: 'divider', fontSize: 11.5, color: 'text.secondary', display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <span>↑↓ navegar · Enter ejecutar · Esc cerrar</span>
        <span style={{ marginLeft: 'auto' }}>Ctrl+Mayús+P, F1 o ? abre esta paleta</span>
      </Box>
    </Dialog>
  );
}
