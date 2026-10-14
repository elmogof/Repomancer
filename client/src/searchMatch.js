// Lógica de búsqueda sin dependencias de React (la usan los buscadores y el resaltado de searchText.jsx).
// Búsqueda por palabras sin distinguir mayúsculas ni tildes, compartida por los buscadores de la app.
export const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
export const searchWords = (q) => norm(q).split(/\s+/).filter(Boolean);
export const matchesAll = (words, ...fields) => { const hay = norm(fields.flat().join(' ')); return words.every((w) => hay.includes(w)); };

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const WORD = '[\\p{L}\\p{N}_]';

// Texto normalizado carácter a carácter, recordando la posición original de cada carácter (para resaltar).
function folded(text) {
  let flat = '';
  const at = [];
  for (let i = 0; i < text.length; i++) for (const c of norm(text[i])) { flat += c; at.push(i); }
  return { flat, at };
}

// Buscador con las opciones de VS Code: distinguir mayúsculas (caseSensitive), palabra completa (wholeWord)
// y expresión regular (regex). Sin opciones se comporta como siempre: varias palabras, todas deben aparecer,
// sin distinguir mayúsculas ni tildes. Con expresión regular, la búsqueda entera es una sola expresión.
// Devuelve { empty, valid, error, test(...campos), ranges(texto) }.
export function makeMatcher(query, { caseSensitive = false, wholeWord = false, regex = false } = {}) {
  const q = (query || '').trim();
  if (!q) return { empty: true, valid: true, test: () => true, ranges: () => [] };
  const fold = !caseSensitive && !regex;
  let res;
  try {
    const parts = regex ? [q] : (fold ? norm(q) : q).split(/\s+/).filter(Boolean).map(escape);
    const flags = `g${regex && !caseSensitive ? 'i' : ''}${wholeWord ? 'u' : ''}`;
    res = parts.map((p) => new RegExp(wholeWord ? `(?<!${WORD})(?:${p})(?!${WORD})` : p, flags));
  } catch (e) {
    // Expresión inválida: no coincide nada y el campo muestra el error.
    return { empty: false, valid: false, error: e.message.replace(/^Invalid regular expression: /, ''), test: () => false, ranges: () => [] };
  }
  const hit = (re, s) => { re.lastIndex = 0; return re.test(s); };
  return {
    empty: false,
    valid: true,
    test: (...fields) => {
      const hay = fields.flat().filter((x) => x != null).join('\n');
      const target = fold ? norm(hay) : hay;
      return res.every((re) => hit(re, target));
    },
    ranges: (text) => {
      if (!text) return [];
      const { flat, at } = fold ? folded(text) : { flat: text, at: null };
      const out = [];
      for (const re of res) {
        re.lastIndex = 0;
        for (let m = re.exec(flat); m; m = re.exec(flat)) {
          if (!m[0]) { re.lastIndex++; continue; }
          out.push(at ? [at[m.index], at[m.index + m[0].length - 1] + 1] : [m.index, m.index + m[0].length]);
        }
      }
      return out;
    },
  };
}
