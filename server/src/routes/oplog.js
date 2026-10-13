import { Router } from 'express';
import { clear, list } from '../oplog.js';

const r = Router();

r.get('/', (req, res) => {
  res.json(list({ repoId: req.query.repo || null, errors: req.query.errors === 'true', limit: Math.min(Number(req.query.limit) || 300, 1000) }));
});

r.delete('/', (req, res) => {
  clear();
  res.json({ ok: true });
});

export default r;
