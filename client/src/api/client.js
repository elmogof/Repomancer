import { getInstance } from '../gitlabInstance.js';

// Las llamadas a /gitlab/… van a la instancia de GitLab activa, salvo que la URL ya indique una.
function withInstance(url) {
  if (!url.startsWith('/gitlab/') || /[?&]instance=/.test(url)) return url;
  const inst = getInstance();
  return inst === 'main' ? url : `${url}${url.includes('?') ? '&' : '?'}instance=${encodeURIComponent(inst)}`;
}

async function request(method, path, body) {
  const url = withInstance(path);
  const res = await fetch(`/api${url}`, {
    method,
    headers: { 'X-Repomancer': '1', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || res.statusText);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const api = {
  get: (u) => request('GET', u),
  post: (u, b) => request('POST', u, b || {}),
  put: (u, b) => request('PUT', u, b || {}),
  del: (u) => request('DELETE', u),
};

export const qs = (o) => '?' + new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== '')).toString();
