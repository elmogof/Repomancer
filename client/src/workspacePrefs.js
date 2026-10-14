// Opciones del cambio de entorno de trabajo (fetch antes, pull después y qué hacer con los cambios sin commit),
// recordadas en el navegador. Las usan el diálogo de cambio y la pantalla de Configuración.
const KEY = 'gm-ws-switch';
const DEFAULTS = { fetch: true, pull: true, dirty: 'stash' };

export function getSwitchPrefs() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...DEFAULTS }; }
}

export function setSwitchPrefs(prefs) {
  try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* sin almacenamiento */ }
}
