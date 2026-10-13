// Cliente mínimo de la API REST de GitHub (github.com o GitHub Enterprise) con el token de una cuenta.
import { githubApiBase } from './accounts.js';

export async function gh(account, pathname, { method = 'GET', body, query } = {}) {
  const url = new URL(`${githubApiBase(account.url)}${pathname}`);
  for (const [k, v] of Object.entries(query || {})) if (v !== undefined && v !== '') url.searchParams.set(k, v);
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${account.token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const detail = data?.errors?.map((e) => e.message || e.code).filter(Boolean).join('; ');
    const e = new Error(`GitHub: ${data?.message || res.statusText}${detail ? ` (${detail})` : ''}`);
    e.status = res.status === 401 ? 401 : res.status >= 500 ? 502 : 400;
    throw e;
  }
  return data;
}

// owner/repo a partir de la URL web del remoto (https://host/owner/repo).
export function ownerRepo(web) {
  const m = web?.match(/^https?:\/\/[^/]+\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/);
  return m ? { owner: m[1], repo: m[2] } : null;
}

export const pickPull = (p) => ({
  number: p.number, title: p.title, state: p.state, draft: p.draft, merged: !!p.merged_at, html_url: p.html_url,
  user: p.user?.login, head: p.head?.ref, base: p.base?.ref, created_at: p.created_at, updated_at: p.updated_at,
  repo: p.base?.repo?.full_name || p.repository_url?.split('/repos/')[1] || null,
});
