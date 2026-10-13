import { Router } from 'express';
import { configure, runNow, status } from '../autofetch.js';

const r = Router();

// Estado y novedades posteriores a ?after=<seq>.
r.get('/', (req, res) => res.json(status(req.query.after)));

r.put('/', (req, res) => res.json(configure(req.body || {})));

// Ejecuta un ciclo ya (no espera si ya hay uno en curso: devuelve su último resultado).
r.post('/run', async (req, res) => {
  await runNow();
  res.json(status(req.body?.after));
});

export default r;
