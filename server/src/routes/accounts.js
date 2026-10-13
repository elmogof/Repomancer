import { Router } from 'express';
import { accounts, addAccount, publicAccount, removeAccount } from '../accounts.js';
import { load } from '../config.js';

const r = Router();

// Cuentas: la sesión principal de GitLab (solo lectura) y las adicionales (GitLab y GitHub).
r.get('/', (req, res) => {
  const g = load().gitlab;
  res.json({ main: { provider: 'gitlab', url: g.url, user: g.user, authType: g.authType }, accounts: accounts().map(publicAccount) });
});

r.post('/', async (req, res) => res.json(await addAccount(req.body || {})));

r.delete('/:id', (req, res) => {
  removeAccount(req.params.id);
  res.json({ ok: true });
});

export default r;
