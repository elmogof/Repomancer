import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Box, Button, Chip, Collapse, IconButton, Stack, Tooltip, Typography } from '@mui/material';
import { alpha, keyframes, useTheme } from '@mui/material/styles';
import SuccessIcon from '@mui/icons-material/CheckCircleRounded';
import ErrorIcon from '@mui/icons-material/ErrorRounded';
import WarningIcon from '@mui/icons-material/WarningRounded';
import InfoIcon from '@mui/icons-material/InfoRounded';
import CloseIcon from '@mui/icons-material/CloseRounded';
import CopyIcon from '@mui/icons-material/ContentCopyRounded';
import ExpandIcon from '@mui/icons-material/ExpandMoreRounded';

const Ctx = createContext(() => {});
export const useNotify = () => useContext(Ctx);

const MAX = 4;
const DURATION = { success: 4000, info: 5000, warning: 8000, error: 12000 };
const TITLES = { success: 'Listo', info: 'Información', warning: 'Atención', error: 'Error' };
const ICONS = { success: SuccessIcon, info: InfoIcon, warning: WarningIcon, error: ErrorIcon };

// Errores frecuentes de git traducidos a un resumen claro; la salida completa queda en "Detalles".
const HINTS = [
  [/would be overwritten by (merge|checkout)/i, 'Tienes cambios locales que se sobrescribirían. Haz commit o stash de estos archivos antes de continuar:'],
  [/untracked working tree files would be (overwritten|removed)/i, 'Hay archivos sin seguimiento que se sobrescribirían. Muévelos o elimínalos antes de continuar:'],
  [/CONFLICT|Automatic merge failed/, 'La fusión tiene conflictos. Resuélvelos y crea un commit para terminar.'],
  [/\[rejected\]|non-fast-forward|fetch first/i, 'El remoto tiene commits que no tienes en local. Haz pull antes de hacer push.'],
  [/Authentication failed|could not read Username|HTTP Basic: Access denied|\b40[13]\b/i, 'El remoto rechazó la autenticación. Revisa tu token de GitLab.'],
  [/Could not resolve host|unable to access|Connection (timed out|refused)/i, 'No se pudo conectar con el remoto. Revisa tu conexión o la URL.'],
  [/no upstream|has no upstream branch/i, 'La rama actual no tiene una rama remota asociada (upstream).'],
  [/not a git repository/i, 'La carpeta ya no es un repositorio git válido.'],
];

// Separa el texto en resumen, archivos afectados y detalles técnicos.
function digest(text, severity) {
  const lines = text.split('\n');
  const multi = lines.filter((l) => l.trim()).length > 1;
  const hint = severity !== 'success' && HINTS.find(([re]) => re.test(text));
  let files = [];
  if (hint && /:$/.test(hint[1])) {
    const i = lines.findIndex((l) => hint[0].test(l));
    for (let j = i + 1; j < lines.length && /^\s+\S/.test(lines[j]); j++) files.push(lines[j].trim());
  }
  if (hint) return { summary: hint[1].replace(/:$/, files.length ? ':' : '.'), files, details: text };
  if (!multi) return { summary: text, files, details: null };
  const key = lines.find((l) => /^(error|fatal):/i.test(l.trim()));
  if (key) return { summary: key.trim().replace(/^(error|fatal):\s*/i, ''), files, details: text };
  const [first, ...rest] = lines;
  return { summary: first, files, details: rest.join('\n').trim() || null };
}

const enter = keyframes`from { opacity: 0; transform: translateX(24px) scale(.97); } to { opacity: 1; transform: none; }`;
const leave = keyframes`from { opacity: 1; transform: none; } to { opacity: 0; transform: translateX(24px) scale(.97); }`;
const countdown = keyframes`from { transform: scaleX(1); } to { transform: scaleX(0); }`;

function Toast({ t, onClose }) {
  const theme = useTheme();
  const dark = theme.palette.mode === 'dark';
  const [hover, setHover] = useState(false);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const left = useRef(t.duration);
  const started = useRef(Date.now());
  const paused = hover || open;

  // Temporizador que se pausa al pasar el ratón o al abrir los detalles.
  useEffect(() => {
    if (t.leaving) return undefined;
    if (paused) { left.current -= Date.now() - started.current; return undefined; }
    started.current = Date.now();
    const timer = setTimeout(() => onClose(t.id), Math.max(left.current, 0));
    return () => clearTimeout(timer);
  }, [paused, t.leaving, t.id, onClose]);

  const color = theme.palette[t.severity].main;
  const Icon = ICONS[t.severity];

  const copy = async () => {
    try { await navigator.clipboard.writeText(t.text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* sin portapapeles */ }
  };

  return (
    <Box
      role={t.severity === 'error' ? 'alert' : 'status'}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      sx={{
        pointerEvents: 'auto', position: 'relative', overflow: 'hidden',
        width: { xs: 'calc(100vw - 32px)', sm: 400 },
        borderRadius: 2.5, border: 1,
        borderColor: alpha(color, dark ? 0.35 : 0.3),
        bgcolor: dark ? alpha(theme.palette.background.default, 0.82) : alpha('#fff', 0.88),
        backgroundImage: `linear-gradient(135deg, ${alpha(color, dark ? 0.14 : 0.08)} 0%, transparent 55%)`,
        backdropFilter: 'blur(14px) saturate(140%)',
        boxShadow: dark
          ? `0 12px 32px ${alpha('#000', 0.5)}, inset 0 1px 0 ${alpha('#fff', 0.04)}`
          : `0 12px 32px ${alpha(theme.palette.grey[500], 0.25)}`,
        animation: `${t.leaving ? leave : enter} ${t.leaving ? 180 : 260}ms cubic-bezier(.2,.8,.2,1) both`,
      }}
    >
      <Stack direction="row" spacing={1.5} sx={{ p: 1.5, pr: 1 }}>
        <Box sx={{
          width: 32, height: 32, flexShrink: 0, borderRadius: 1.5, display: 'grid', placeItems: 'center',
          bgcolor: alpha(color, dark ? 0.18 : 0.12), color, border: 1, borderColor: alpha(color, 0.3),
        }}>
          <Icon sx={{ fontSize: 20 }} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0, pt: 0.25 }}>
          <Typography variant="body2" sx={{ fontWeight: 700, lineHeight: 1.4, fontFamily: theme.typography.h6.fontFamily }}>
            {t.title || TITLES[t.severity]}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25, whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.5 }}>
            {t.summary}
          </Typography>
          {t.files.length > 0 && (
            <Stack direction="row" flexWrap="wrap" gap={0.5} sx={{ mt: 1 }}>
              {t.files.map((f) => (
                <Chip key={f} label={f} size="small" variant="outlined"
                  sx={{ fontFamily: theme.typography.fontFamilyCode, fontSize: 11.5, height: 22, borderColor: alpha(color, 0.35), bgcolor: alpha(color, 0.06) }} />
              ))}
            </Stack>
          )}
          {t.details && (
            <>
              <Box component="button" onClick={() => setOpen((o) => !o)}
                sx={{
                  all: 'unset', cursor: 'pointer', mt: 1, display: 'inline-flex', alignItems: 'center', gap: 0.25,
                  fontSize: 12, fontWeight: 600, color: 'primary.main', '&:hover': { textDecoration: 'underline' },
                }}>
                {open ? 'Ocultar detalles' : 'Ver detalles'}
                <ExpandIcon sx={{ fontSize: 16, transition: 'transform .2s', transform: open ? 'rotate(180deg)' : 'none' }} />
              </Box>
              <Collapse in={open} unmountOnExit>
                <Box component="pre" sx={{
                  m: 0, mt: 1, p: 1.25, maxHeight: 220, overflow: 'auto', borderRadius: 1.5,
                  fontFamily: theme.typography.fontFamilyCode, fontSize: 11.5, lineHeight: 1.6,
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'text.secondary',
                  bgcolor: alpha(theme.palette.text.primary, dark ? 0.05 : 0.04), border: 1, borderColor: 'divider',
                }}>{t.details}</Box>
              </Collapse>
            </>
          )}
          {t.action && (
            <Box sx={{ mt: 1.25 }}>
              <Button size="small" variant="outlined" onClick={() => { onClose(t.id); t.action.onClick(); }}
                sx={{ py: 0.25, borderColor: alpha(color, 0.5), color, '&:hover': { borderColor: color, bgcolor: alpha(color, 0.08) } }}>
                {t.action.label}
              </Button>
            </Box>
          )}
        </Box>
        <Stack spacing={0.25} sx={{ flexShrink: 0 }}>
          <Tooltip title="Cerrar" placement="left">
            <IconButton size="small" onClick={() => onClose(t.id)} aria-label="Cerrar notificación" sx={{ color: 'text.secondary' }}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          {t.severity !== 'success' && (
            <Tooltip title={copied ? 'Copiado' : 'Copiar mensaje'} placement="left">
              <IconButton size="small" onClick={copy} aria-label="Copiar mensaje" sx={{ color: copied ? color : 'text.secondary' }}>
                <CopyIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          )}
        </Stack>
      </Stack>
      <Box sx={{
        position: 'absolute', left: 0, right: 0, bottom: 0, height: 2, bgcolor: color, opacity: 0.7, transformOrigin: 'left',
        animation: `${countdown} ${t.duration}ms linear forwards`, animationPlayState: paused ? 'paused' : 'running',
      }} />
    </Box>
  );
}

// notify(texto, severidad = 'success', { title, duration, details, files, action: { label, onClick } })
export function NotifyProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const seq = useRef(0);

  const close = useCallback((id) => {
    setToasts((ts) => ts.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => setToasts((ts) => ts.filter((t) => t.id !== id)), 200);
  }, []);

  const notify = useCallback((text, severity = 'success', opts = {}) => {
    const sev = ICONS[severity] ? severity : 'info';
    const str = String(text ?? '').trim();
    const t = {
      id: ++seq.current, severity: sev, text: str, title: opts.title,
      duration: opts.duration ?? DURATION[sev], ...digest(str, sev),
    };
    if (opts.details !== undefined) { t.summary = str; t.details = opts.details || null; }
    if (opts.files) t.files = opts.files;
    if (opts.action) t.action = opts.action;
    setToasts((ts) => [...ts.filter((x) => !x.leaving).slice(-(MAX - 1)), t]);
  }, []);

  return (
    <Ctx.Provider value={notify}>
      {children}
      <Stack spacing={1.25} sx={{
        position: 'fixed', zIndex: (th) => th.zIndex.snackbar, right: { xs: 16, sm: 24 }, bottom: { xs: 16, sm: 24 },
        alignItems: 'flex-end', pointerEvents: 'none', maxHeight: 'calc(100vh - 32px)',
      }}>
        {toasts.map((t) => <Toast key={t.id} t={t} onClose={close} />)}
      </Stack>
    </Ctx.Provider>
  );
}
