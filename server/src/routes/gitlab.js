import { Router } from 'express';
import { api } from '../gitlab.js';

const r = Router();
const enc = encodeURIComponent;

r.get('/projects', async (req, res) => {
  const { search, page = 1, membership = 'true' } = req.query;
  const { data, headers } = await api('/projects', {
    query: { search, page, per_page: 30, membership, order_by: 'last_activity_at', simple: 'true' },
  });
  res.json({ items: data, total: Number(headers.get('x-total') || 0), nextPage: headers.get('x-next-page') || null });
});

r.get('/projects/:id', async (req, res) => {
  res.json((await api(`/projects/${enc(req.params.id)}`)).data);
});

r.get('/projects/:id/branches', async (req, res) => {
  res.json((await api(`/projects/${enc(req.params.id)}/repository/branches`, { query: { per_page: 100, search: req.query.search } })).data);
});

r.get('/projects/:id/merge_requests', async (req, res) => {
  const { state = 'opened' } = req.query;
  res.json((await api(`/projects/${enc(req.params.id)}/merge_requests`, { query: { state, per_page: 50 } })).data);
});

r.get('/merge_requests', async (req, res) => {
  const { state = 'opened', scope = 'all' } = req.query;
  res.json((await api('/merge_requests', { query: { state, scope, per_page: 50 } })).data);
});

r.post('/projects/:id/merge_requests', async (req, res) => {
  const { source_branch, target_branch, title, description, remove_source_branch, squash, draft } = req.body;
  const body = {
    source_branch, target_branch,
    title: draft && !/^draft:/i.test(title) ? `Draft: ${title}` : title,
    description, remove_source_branch, squash,
  };
  res.json((await api(`/projects/${enc(req.params.id)}/merge_requests`, { method: 'POST', body })).data);
});

r.get('/projects/:id/merge_requests/:iid', async (req, res) => {
  const p = `/projects/${enc(req.params.id)}/merge_requests/${req.params.iid}`;
  const [mr, changes, notes] = await Promise.all([
    api(p),
    api(`${p}/changes`),
    api(`${p}/notes`, { query: { sort: 'asc', per_page: 100 } }),
  ]);
  res.json({ ...mr.data, changes: changes.data.changes, notes: notes.data.filter((n) => !n.system) });
});

r.post('/projects/:id/merge_requests/:iid/notes', async (req, res) => {
  res.json((await api(`/projects/${enc(req.params.id)}/merge_requests/${req.params.iid}/notes`, { method: 'POST', body: { body: req.body.body } })).data);
});

r.post('/projects/:id/merge_requests/:iid/approve', async (req, res) => {
  res.json((await api(`/projects/${enc(req.params.id)}/merge_requests/${req.params.iid}/approve`, { method: 'POST' })).data);
});

r.put('/projects/:id/merge_requests/:iid/merge', async (req, res) => {
  const { squash, should_remove_source_branch } = req.body || {};
  res.json((await api(`/projects/${enc(req.params.id)}/merge_requests/${req.params.iid}/merge`, { method: 'PUT', body: { squash, should_remove_source_branch } })).data);
});

r.put('/projects/:id/merge_requests/:iid/close', async (req, res) => {
  res.json((await api(`/projects/${enc(req.params.id)}/merge_requests/${req.params.iid}`, { method: 'PUT', body: { state_event: 'close' } })).data);
});

export default r;
