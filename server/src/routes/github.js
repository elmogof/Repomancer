import { Router } from 'express';
import { accounts, getAccount, publicAccount } from '../accounts.js';
import { gh, pickPull } from '../github.js';

const r = Router();

// Pull requests abiertos en los que participas (autor, asignado, revisor o mención), por cuenta de GitHub.
r.get('/pulls', async (req, res) => {
  const list = req.query.account ? [getAccount(req.query.account)] : accounts().filter((a) => a.provider === 'github');
  const filter = { involves: 'involves:@me', author: 'author:@me', review: 'review-requested:@me' }[req.query.filter] || 'involves:@me';
  const state = req.query.state === 'closed' ? 'is:closed' : 'is:open';
  const results = await Promise.all(list.map(async (a) => {
    try {
      const data = await gh(a, '/search/issues', { query: { q: `is:pr ${state} ${filter}`, per_page: 50, sort: 'updated' } });
      return { account: publicAccount(a), items: data.items.map(pickPull) };
    } catch (e) { return { account: publicAccount(a), error: e.message, items: [] }; }
  }));
  res.json(results);
});

export default r;
