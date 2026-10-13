// Instancia de GitLab activa para las pantallas de proyectos y merge requests.
// Se recuerda en el navegador; el cliente de la API la añade a cada llamada /gitlab/… (?instance=).
import { useEffect, useState } from 'react';

const KEY = 'gm-gitlab-instance';
const EVENT = 'gm-gitlab-instance';

export function getInstance() {
  try { return localStorage.getItem(KEY) || 'main'; } catch { return 'main'; }
}

export function setInstance(id) {
  try { localStorage.setItem(KEY, id || 'main'); } catch { /* sin almacenamiento */ }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: id || 'main' }));
}

export function useGitlabInstance() {
  const [id, setId] = useState(getInstance);
  useEffect(() => {
    const on = (e) => setId(e.detail);
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  return id;
}
