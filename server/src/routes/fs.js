import { Router } from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const r = Router();

const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });

// Unidades disponibles en Windows (C:\, D:\, ...) o la raíz en otros sistemas.
function roots() {
  if (process.platform !== 'win32') return ['/'];
  const list = [];
  for (let c = 65; c <= 90; c++) {
    const drive = `${String.fromCharCode(c)}:\\`;
    if (fs.existsSync(drive)) list.push(drive);
  }
  return list;
}

const isRepo = (dir) => fs.existsSync(path.join(dir, '.git'));

// ---------- explorador de carpetas para los selectores del cliente ----------
r.get('/list', async (req, res) => {
  const requested = req.query.path ? String(req.query.path) : os.homedir();
  const dir = path.resolve(requested);
  let dirents;
  try {
    dirents = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch (e) {
    throw bad(e.code === 'ENOENT' ? `La carpeta no existe: ${dir}` : `No se puede abrir ${dir}: ${e.code || e.message}`);
  }
  const showHidden = req.query.hidden === '1';
  const entries = dirents
    .filter((d) => d.isDirectory() || d.isSymbolicLink())
    .filter((d) => showHidden || !/^[.$]/.test(d.name))
    .map((d) => ({ name: d.name, path: path.join(dir, d.name) }))
    .filter((e) => { try { return fs.statSync(e.path).isDirectory(); } catch { return false; } })
    .map((e) => ({ ...e, isRepo: isRepo(e.path) }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }));
  const parent = path.dirname(dir);
  res.json({
    path: dir,
    parent: parent === dir ? null : parent,
    isRepo: isRepo(dir),
    home: os.homedir(),
    roots: roots(),
    entries,
  });
});

r.post('/mkdir', async (req, res) => {
  const { parent, name } = req.body || {};
  if (!parent || !name || /[\\/:*?"<>|]/.test(name) || name === '.' || name === '..') throw bad('Nombre de carpeta inválido');
  const dir = path.join(path.resolve(parent), name);
  if (fs.existsSync(dir)) throw bad('Ya existe una carpeta con ese nombre');
  await fs.promises.mkdir(dir);
  res.json({ path: dir });
});

export default r;
