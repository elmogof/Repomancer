// Convenciones de commit: configuración general y, si se quiere, una propia por repositorio.
// - conventional: avisar si el resumen no sigue Conventional Commits (tipo(ámbito): resumen).
// - ticket: detectar el ticket en el nombre de la rama (pattern) y añadirlo al mensaje (mode).
// - template / autoTemplate: plantilla del mensaje ({ticket}, {branch}, {type}) y si se rellena sola.
// - scopes: ámbitos sugeridos para el selector de tipo.
import { load, update } from './config.js';

export const TICKET_MODES = ['off', 'summary', 'end', 'footer'];
export const DEFAULTS = {
  conventional: true,
  ticket: { mode: 'summary', pattern: '[A-Z][A-Z0-9]+-\\d+|[A-Z]{2,}\\d{2,}', label: 'Refs' },
  template: '',
  autoTemplate: false,
  scopes: [],
};

const bad = (msg) => Object.assign(new Error(msg), { status: 400 });

export function sanitize(input = {}) {
  const t = input.ticket || {};
  const mode = TICKET_MODES.includes(t.mode) ? t.mode : DEFAULTS.ticket.mode;
  const pattern = String(t.pattern ?? DEFAULTS.ticket.pattern).trim().slice(0, 200) || DEFAULTS.ticket.pattern;
  try { new RegExp(pattern); } catch (e) { throw bad(`Patrón de ticket inválido: ${e.message}`); }
  const label = String(t.label ?? DEFAULTS.ticket.label).trim() || DEFAULTS.ticket.label;
  if (!/^[\w-]{1,20}$/.test(label)) throw bad('La etiqueta del pie solo admite letras, números, guiones y _ (máx. 20)');
  const scopes = [...new Set((Array.isArray(input.scopes) ? input.scopes : []).map((x) => String(x).trim()).filter(Boolean))];
  if (scopes.length > 40) throw bad('Demasiados ámbitos (máx. 40)');
  for (const sc of scopes) if (!/^[\w./-]{1,30}$/.test(sc)) throw bad(`Ámbito inválido: ${sc}`);
  return {
    conventional: input.conventional === undefined ? DEFAULTS.conventional : !!input.conventional,
    ticket: { mode, pattern, label },
    template: String(input.template ?? '').slice(0, 2000),
    autoTemplate: !!input.autoTemplate,
    scopes,
  };
}

export const globalSettings = () => sanitize(load().commitSettings?.global || DEFAULTS);
export const repoSettings = (id) => load().commitSettings?.repos?.[id] || null;

export function forRepo(id) {
  const own = repoSettings(id);
  const global = globalSettings();
  return { global, own, effective: own ? sanitize(own) : global };
}

export function saveGlobal(input) {
  const clean = sanitize(input);
  update((c) => { c.commitSettings = { ...(c.commitSettings || {}), global: clean }; });
  return clean;
}

// own = null vuelve a usar la configuración general.
export function saveRepo(id, own) {
  const clean = own ? sanitize(own) : null;
  update((c) => {
    const repos = { ...(c.commitSettings?.repos || {}) };
    if (clean) repos[id] = clean; else delete repos[id];
    c.commitSettings = { ...(c.commitSettings || {}), repos };
  });
  return forRepo(id);
}
