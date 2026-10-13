// Preferencias de pull (merge o rebase, autostash), recordadas en el navegador y compartidas
// por la vista de detalle, las acciones de cada fila y el pull en lote.
const KEY = 'gm-pull-opts';
const DEFAULTS = { rebase: false, autostash: false };

export function getPullPrefs() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...DEFAULTS }; }
}

export function setPullPrefs(prefs) {
  try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* sin almacenamiento */ }
}

export const describePull = (p) => `${p.rebase ? 'rebase' : 'merge'}${p.autostash ? ' + autostash' : ''}`;
