import { useState } from 'react';
import { Box, Tooltip } from '@mui/material';
import { alpha } from '@mui/material/styles';

import { makeMatcher } from '../searchMatch.js';

export { makeMatcher, matchesAll, norm, searchWords } from '../searchMatch.js';

// Resalta en el texto las partes que coinciden. Acepta un buscador (matcher) o, como antes, una lista de palabras.
export function Highlight({ text, words, matcher }) {
  const m = matcher || (words?.length ? makeMatcher(words.join(' ')) : null);
  if (!text || !m || m.empty) return text || null;
  const ranges = m.ranges(String(text));
  if (!ranges.length) return text;
  const chars = String(text);
  const marked = new Array(chars.length).fill(false);
  for (const [a, b] of ranges) for (let j = a; j < b; j++) marked[j] = true;
  const parts = [];
  for (let i = 0; i < chars.length; i++) {
    const last = parts[parts.length - 1];
    if (last && last.on === marked[i]) last.text += chars[i]; else parts.push({ on: marked[i], text: chars[i] });
  }
  return parts.map((p, i) => (p.on
    ? <Box key={i} component="mark" sx={(t) => ({ bgcolor: alpha(t.palette.warning.main, 0.3), color: 'inherit', borderRadius: 0.5 })}>{p.text}</Box>
    : p.text));
}

// ---------- opciones de búsqueda al estilo de VS Code ----------
export const NO_OPTIONS = { caseSensitive: false, wholeWord: false, regex: false };

// Opciones recordadas en el navegador por buscador (key).
export function useSearchOptions(key, initial = NO_OPTIONS) {
  const [opts, setOpts] = useState(() => {
    try { return { ...initial, ...JSON.parse(localStorage.getItem(`gm-search-opts:${key}`) || '{}') }; } catch { return { ...initial }; }
  });
  const set = (next) => setOpts((o) => {
    const n = typeof next === 'function' ? next(o) : next;
    try { localStorage.setItem(`gm-search-opts:${key}`, JSON.stringify(n)); } catch { /* sin almacenamiento */ }
    return n;
  });
  return [opts, set];
}

const TOGGLES = [
  { key: 'caseSensitive', label: 'Aa', title: 'Coincidir mayúsculas y minúsculas', keys: 'Alt+C', code: 'KeyC' },
  { key: 'wholeWord', label: 'ab', title: 'Solo palabras completas', keys: 'Alt+W', code: 'KeyW', underline: true },
  { key: 'regex', label: '.*', title: 'Usar expresión regular', keys: 'Alt+R', code: 'KeyR' },
];

// Atajos Alt+C / Alt+W / Alt+R dentro del campo, como en VS Code. Úsalo en el onKeyDown del campo.
export function searchOptionKeys(e, opts, setOpts, only) {
  if (!e.altKey || e.ctrlKey || e.metaKey) return false;
  const t = TOGGLES.find((x) => x.code === e.code && (!only || only.includes(x.key)));
  if (!t) return false;
  e.preventDefault();
  e.stopPropagation();
  setOpts({ ...opts, [t.key]: !opts[t.key] });
  return true;
}

// Botones Aa / ab / .* para poner al final del campo (InputAdornment). only: qué opciones mostrar.
export function SearchToggles({ value, onChange, only, size = 'medium' }) {
  const small = size === 'small';
  return (
    <Box sx={{ display: 'inline-flex', gap: 0.25, alignItems: 'center' }}>
      {TOGGLES.filter((t) => !only || only.includes(t.key)).map((t) => {
        const on = !!value[t.key];
        return (
          <Tooltip key={t.key} title={`${t.title} (${t.keys})`}>
            <Box component="button" type="button" aria-pressed={on} aria-label={t.title}
              onMouseDown={(e) => e.preventDefault() /* no quita el foco del campo */}
              onClick={() => onChange({ ...value, [t.key]: !on })}
              sx={(th) => ({
                all: 'unset', cursor: 'pointer', boxSizing: 'border-box', display: 'grid', placeItems: 'center',
                minWidth: small ? 22 : 26, height: small ? 20 : 24, px: 0.5, borderRadius: 0.75,
                fontFamily: th.typography.fontFamilyCode, fontSize: small ? 11.5 : 12.5, fontWeight: 600, lineHeight: 1,
                textDecoration: t.underline ? 'underline' : 'none', textUnderlineOffset: 2,
                color: on ? 'primary.main' : 'text.secondary',
                border: 1, borderColor: on ? alpha(th.palette.primary.main, 0.8) : 'transparent',
                bgcolor: on ? alpha(th.palette.primary.main, 0.16) : 'transparent',
                '&:hover': { bgcolor: on ? alpha(th.palette.primary.main, 0.24) : th.palette.action.hover, color: on ? 'primary.main' : 'text.primary' },
                '&:focus-visible': { outline: `2px solid ${th.palette.primary.main}`, outlineOffset: 1 },
              })}>
              {t.label}
            </Box>
          </Tooltip>
        );
      })}
    </Box>
  );
}
