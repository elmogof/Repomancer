import { Box } from '@mui/material';
import { alpha } from '@mui/material/styles';

// Búsqueda por palabras sin distinguir mayúsculas ni tildes, compartida por los buscadores de repositorios.
export const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
export const searchWords = (q) => norm(q).split(/\s+/).filter(Boolean);
export const matchesAll = (words, ...fields) => { const hay = norm(fields.flat().join(' ')); return words.every((w) => hay.includes(w)); };

// Resalta en el texto las partes que coinciden con alguna de las palabras buscadas.
export function Highlight({ text, words }) {
  if (!text || !words?.length) return text || null;
  // Texto normalizado carácter a carácter, recordando la posición original de cada carácter.
  let flat = '';
  const at = [];
  [...text].forEach((ch, i) => { for (const c of norm(ch)) { flat += c; at.push(i); } });
  const chars = [...text];
  const marked = new Array(chars.length).fill(false);
  for (const w of words) {
    for (let i = flat.indexOf(w); i !== -1; i = flat.indexOf(w, i + 1)) {
      for (let j = i; j < i + w.length; j++) marked[at[j]] = true;
    }
  }
  const parts = [];
  chars.forEach((ch, i) => {
    const last = parts[parts.length - 1];
    if (last && last.on === marked[i]) last.text += ch; else parts.push({ on: marked[i], text: ch });
  });
  return parts.map((p, i) => (p.on
    ? <Box key={i} component="mark" sx={(t) => ({ bgcolor: alpha(t.palette.warning.main, 0.3), color: 'inherit', borderRadius: 0.5 })}>{p.text}</Box>
    : p.text));
}
