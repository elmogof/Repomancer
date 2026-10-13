import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PORT } from './gitlab.js';
import authRoutes from './routes/auth.js';
import gitlabRoutes from './routes/gitlab.js';
import repoRoutes from './routes/repos.js';

const app = express();
app.use(express.json({ limit: '5mb' }));

// Protección CSRF: toda llamada a /api (salvo el callback OAuth, que llega por
// redirección del navegador) debe traer esta cabecera. Otro sitio web no puede
// añadirla sin una petición CORS, que este servidor no autoriza.
app.use('/api', (req, res, next) => {
  if (req.path === '/auth/oauth/callback') return next();
  if (req.get('X-Git-Manager') !== '1') return res.status(403).json({ error: 'Petición no permitida' });
  next();
});

// Express 4 no captura errores de funciones async: este envoltorio lo hace.
const wrap = (router) => {
  for (const layer of router.stack) {
    for (const l of layer.route?.stack || []) {
      const fn = l.handle;
      l.handle = (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
    }
  }
  return router;
};

app.use('/api/auth', wrap(authRoutes));
app.use('/api/gitlab', wrap(gitlabRoutes));
app.use('/api/repos', wrap(repoRoutes));

// En producción sirve el frontend compilado.
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use((err, req, res, next) => {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message || 'Error interno' });
});

// Solo escucha en la máquina local: nadie de la red puede conectarse.
app.listen(PORT, '127.0.0.1', () => {
  console.log(`Git Manager API en http://localhost:${PORT}`);
});
