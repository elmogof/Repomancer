// Búsqueda en varios repositorios: texto (git grep) y nombres de archivo, con sus opciones y ámbitos.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { commit, makeRepo, rm, startServer, tmpDir, write } from './helpers.js';

let srv;
let root;
let ids;

before(async () => {
  root = tmpDir();
  const a = makeRepo(root, 'alpha');
  const b = makeRepo(root, 'beta');
  commit(a.work, 'src/pagos.js', 'export const total = 1;\nconst TotalGeneral = 2;\n');
  commit(b.work, 'docs/notas.md', 'El total del mes\n');
  write(b.work, 'borrador.txt', 'total sin commit\n'); // sin seguimiento: también se busca
  write(b.work, '.gitignore', 'ignorado.txt\n');
  write(b.work, 'ignorado.txt', 'total ignorado\n');
  srv = await startServer();
  ids = {};
  for (const r of [a, b]) ids[r.name] = (await srv.ok('POST', '/repos/add', { path: r.work })).id;
});

after(async () => {
  await srv?.stop();
  if (root) rm(root);
});

const files = (res, name) => res.results.find((x) => x.name === name)?.matches.map((m) => m.path) || [];

describe('búsqueda de texto', () => {
  test('encuentra coincidencias en todos los repos, con archivo y línea, sin los ignorados', async () => {
    const res = await srv.ok('GET', '/search?q=total');
    assert.equal(res.searched, 2);
    const alpha = res.results.find((x) => x.name === 'alpha');
    assert.deepEqual(alpha.matches.map((m) => [m.path, m.line]), [['src/pagos.js', 1], ['src/pagos.js', 2]]);
    assert.match(alpha.matches[0].text, /export const total/);
    assert.deepEqual(files(res, 'beta').sort(), ['borrador.txt', 'docs/notas.md']);
  });

  test('distingue mayúsculas solo si se pide', async () => {
    const res = await srv.ok('GET', '/search?q=Total&case=1');
    assert.deepEqual(res.results.map((x) => x.name), ['alpha']);
    assert.equal(res.results[0].matches.length, 1);
  });

  test('expresiones regulares y filtro por archivos', async () => {
    const res = await srv.ok('GET', `/search?q=${encodeURIComponent('const [a-z]+ =')}&regex=1&case=1`);
    assert.equal(res.total, 1);
    const onlyMd = await srv.ok('GET', `/search?q=total&glob=${encodeURIComponent('*.md')}`);
    assert.deepEqual(onlyMd.results.map((x) => x.name), ['beta']);
    assert.deepEqual(files(onlyMd, 'beta'), ['docs/notas.md']);
  });

  test('palabra completa', async () => {
    const res = await srv.ok('GET', '/search?q=total&word=1');
    // «TotalGeneral» no cuenta; «total» y «El total» sí.
    assert.deepEqual(res.results.find((x) => x.name === 'alpha').matches.map((m) => m.line), [1]);
  });

  test('sin coincidencias devuelve una lista vacía, sin errores', async () => {
    const res = await srv.ok('GET', '/search?q=zzzz-nada-zzzz');
    assert.equal(res.total, 0);
    assert.deepEqual(res.results, []);
  });

  test('valida la búsqueda', async () => {
    assert.equal((await srv.call('GET', '/search?q=a')).status, 400);
    assert.equal((await srv.call('GET', `/search?q=${encodeURIComponent('(abc')}&regex=1`)).status, 400);
    assert.equal((await srv.call('GET', '/search?q=total&scope=raro')).status, 400);
  });
});

describe('nombres de archivo y ámbito', () => {
  test('busca por partes de la ruta, sin importar acentos ni mayúsculas', async () => {
    const res = await srv.ok('GET', `/search?q=${encodeURIComponent('SRC págos')}&mode=files`);
    assert.deepEqual(files(res, 'alpha'), ['src/pagos.js']);
  });

  test('nombres de archivo con mayúsculas, palabra completa o expresión regular', async () => {
    assert.deepEqual(files(await srv.ok('GET', '/search?q=SRC&mode=files&case=1'), 'alpha'), []);
    assert.deepEqual(files(await srv.ok('GET', '/search?q=pago&mode=files&word=1'), 'alpha'), []);
    assert.deepEqual(files(await srv.ok('GET', `/search?q=${encodeURIComponent('\\.js$')}&mode=files&regex=1`), 'alpha'), ['src/pagos.js']);
    assert.equal((await srv.call('GET', `/search?q=${encodeURIComponent('(x')}&mode=files&regex=1`)).status, 400);
  });

  test('limita la búsqueda a un grupo', async () => {
    const g = await srv.ok('POST', '/workspaces', { name: 'Solo beta', repos: [ids.beta] });
    const res = await srv.ok('GET', `/search?q=total&scope=group:${g.id}`);
    assert.equal(res.searched, 1);
    assert.deepEqual(res.results.map((x) => x.name), ['beta']);
    assert.equal((await srv.call('GET', '/search?q=total&scope=group:no-existe')).status, 404);
  });
});

describe('abrir un resultado', () => {
  // Solo los casos rechazados: el caso válido lanzaría VS Code en el equipo.
  test('rechaza rutas fuera del repo y nombres peligrosos para cmd', async () => {
    assert.equal((await srv.call('POST', `/repos/${ids.alpha}/open`, { target: 'vscode', file: '../../fuera.txt' })).status, 400);
    assert.equal((await srv.call('POST', `/repos/${ids.alpha}/open`, { target: 'vscode', file: 'a&calc.txt' })).status, 400);
    assert.equal((await srv.call('POST', `/repos/${ids.alpha}/open`, { target: 'folder', file: 'src/pagos.js' })).status, 400);
  });
});
