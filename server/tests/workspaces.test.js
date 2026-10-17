// Entornos de trabajo: creación, vista previa, cambio de entorno (stash, ramas remotas, ramas que faltan),
// deshacer, estado del grupo y acciones en lote. Todo sobre repositorios desechables y un servidor aislado.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { branchOf, commit, git, makeRepo, otherClone, rm, startServer, tmpDir, write } from './helpers.js';

let srv;
let root;
let api;
let web;
let lib;
let ids;

before(async () => {
  root = tmpDir();
  api = makeRepo(root, 'api', { qa: {}, 'feature/pagos': { local: false } });
  web = makeRepo(root, 'web', { test: {}, 'feature/PAG-1': {} });
  lib = makeRepo(root, 'lib', {});
  srv = await startServer();
  ids = {};
  for (const r of [api, web, lib]) ids[r.name] = (await srv.ok('POST', '/repos/add', { path: r.work })).id;
});

after(async () => {
  await srv?.stop();
  if (root) rm(root);
});

async function newGroup(envs) {
  return srv.ok('POST', '/workspaces', { name: `G${Math.random().toString(36).slice(2, 7)}`, repos: [ids.api, ids.web, ids.lib], envs });
}

// Deja cada repo limpio y en main (descarta cambios y stashes de la prueba anterior).
const reset = () => {
  for (const r of [api, web, lib]) {
    git(r.work, 'reset', '-q', '--hard');
    git(r.work, 'clean', '-qfd');
    git(r.work, 'checkout', '-q', 'main');
    git(r.work, 'stash', 'clear');
  }
};

describe('grupos y entornos', () => {
  test('ordena los grupos: por nombre hasta reordenarlos, luego el orden guardado', async () => {
    const before = (await srv.ok('GET', '/workspaces?status=0')).groups;
    const zz = await srv.ok('POST', '/workspaces', { name: 'zz orden', repos: [ids.api] });
    const aa = await srv.ok('POST', '/workspaces', { name: 'aa orden', repos: [ids.api] });
    let names = (await srv.ok('GET', '/workspaces?status=0')).groups.map((g) => g.name);
    assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b, 'es')));
    // zz primero; los demás conservan su orden detrás.
    await srv.ok('POST', '/workspaces/order', { ids: [zz.id] });
    let list = (await srv.ok('GET', '/workspaces?status=0')).groups;
    assert.equal(list[0].id, zz.id);
    // Editar un grupo no lo mueve; uno nuevo va al final.
    await srv.ok('PUT', `/workspaces/${zz.id}`, { envs: [{ name: 'B', branches: {} }, { name: 'A', branches: {} }] });
    const nu = await srv.ok('POST', '/workspaces', { name: 'mm orden', repos: [ids.api] });
    list = (await srv.ok('GET', '/workspaces?status=0')).groups;
    assert.equal(list[0].id, zz.id);
    assert.deepEqual(list[0].envs.map((e) => e.name), ['B', 'A']);
    assert.equal(list.at(-1).id, nu.id);
    for (const g of [zz, aa, nu]) await srv.ok('DELETE', `/workspaces/${g.id}`);
    assert.equal((await srv.ok('GET', '/workspaces?status=0')).groups.length, before.length);
  });

  test('guarda una rama por repositorio y descarta repos desconocidos', async () => {
    const g = await srv.ok('POST', '/workspaces', {
      name: '  Portal  ', repos: [ids.api, ids.web, 'no-existe'],
      envs: [{ name: 'QA', branches: { [ids.api]: 'qa', [ids.web]: 'test', 'no-existe': 'x', [ids.lib]: 'main' } }],
    });
    assert.equal(g.name, 'Portal');
    assert.deepEqual(g.repos, [ids.api, ids.web]);
    assert.deepEqual(g.envs[0].branches, { [ids.api]: 'qa', [ids.web]: 'test' });
  });

  test('rechaza nombres de rama inválidos', async () => {
    const r = await srv.call('POST', '/workspaces', { name: 'X', repos: [ids.api], envs: [{ name: 'Mal', branches: { [ids.api]: '--force' } }] });
    assert.equal(r.status, 400);
    const r2 = await srv.call('POST', '/workspaces', { name: 'X', repos: [ids.api], envs: [{ name: 'Mal', branches: { [ids.api]: 'origin/qa' } }] });
    assert.equal(r2.status, 400);
  });

  test('editar y eliminar un grupo', async () => {
    const g = await newGroup([]);
    const edited = await srv.ok('PUT', `/workspaces/${g.id}`, { name: 'Otro', repos: [ids.lib] });
    assert.equal(edited.name, 'Otro');
    assert.deepEqual(edited.repos, [ids.lib]);
    await srv.ok('DELETE', `/workspaces/${g.id}`);
    assert.equal((await srv.call('PUT', `/workspaces/${g.id}`, { name: 'x' })).status, 404);
  });
});

describe('vista previa', () => {
  test('clasifica cada repositorio según su rama destino', async () => {
    reset();
    write(api.work, 'wip.txt', 'sin commit');
    const g = await newGroup([{ name: 'F', branches: { [ids.api]: 'feature/pagos', [ids.web]: 'no-existe' } }]);
    const { items } = await srv.ok('POST', `/workspaces/${g.id}/preview`, { envId: g.envs[0].id });
    const by = Object.fromEntries(items.map((x) => [x.name, x]));
    assert.equal(by.api.state, 'remote');
    assert.equal(by.api.changes, 1);
    assert.equal(by.web.state, 'missing');
    assert.equal(by.lib.state, 'keep');
    const g2 = await newGroup([{ name: 'M', branches: { [ids.api]: 'main', [ids.web]: 'test' } }]);
    const p2 = Object.fromEntries((await srv.ok('POST', `/workspaces/${g2.id}/preview`, { envId: g2.envs[0].id })).items.map((x) => [x.name, x]));
    assert.equal(p2.api.state, 'same');
    assert.equal(p2.web.state, 'ready');
  });
});

describe('cambio de entorno', () => {
  test('guarda los cambios sin commit y los recupera al volver a esa rama', async () => {
    reset();
    write(api.work, 'wip.txt', 'trabajo a medias');
    const g = await newGroup([
      { name: 'Prod', branches: { [ids.api]: 'main', [ids.web]: 'main' } },
      { name: 'QA', branches: { [ids.api]: 'qa', [ids.web]: 'test' } },
    ]);
    const [prod, qa] = g.envs;
    const res = await srv.ok('POST', `/workspaces/${g.id}/switch`, { envId: qa.id, dirty: 'stash' });
    assert.equal(branchOf(api.work), 'qa');
    assert.equal(branchOf(web.work), 'test');
    assert.equal(branchOf(lib.work), 'main', 'un repo sin rama en el entorno no cambia');
    assert.ok(!fs.existsSync(path.join(api.work, 'wip.txt')), 'el cambio sin commit no viaja a qa');
    assert.equal(res.results.find((x) => x.name === 'lib').status, 'kept');
    assert.equal(res.group.lastEnv, qa.id);

    await srv.ok('POST', `/workspaces/${g.id}/switch`, { envId: prod.id });
    assert.equal(branchOf(api.work), 'main');
    assert.equal(fs.readFileSync(path.join(api.work, 'wip.txt'), 'utf8'), 'trabajo a medias');
    assert.equal(git(api.work, 'stash', 'list'), '', 'el stash automático se consume al recuperarlo');
  });

  test('crea la rama local desde origin cuando solo existe en el remoto', async () => {
    reset();
    const g = await newGroup([{ name: 'F', branches: { [ids.api]: 'feature/pagos' } }]);
    await srv.ok('POST', `/workspaces/${g.id}/switch`, { envId: g.envs[0].id });
    assert.equal(branchOf(api.work), 'feature/pagos');
    assert.equal(git(api.work, 'rev-parse', '--abbrev-ref', '@{u}'), 'origin/feature/pagos');
  });

  test('con dirty=skip no toca los repositorios con cambios', async () => {
    reset();
    write(web.work, 'README.md', 'cambiado');
    const g = await newGroup([{ name: 'QA', branches: { [ids.api]: 'qa', [ids.web]: 'test' } }]);
    const { results } = await srv.ok('POST', `/workspaces/${g.id}/switch`, { envId: g.envs[0].id, dirty: 'skip' });
    assert.equal(results.find((x) => x.name === 'web').status, 'skipped');
    assert.equal(branchOf(web.work), 'main');
    assert.equal(branchOf(api.work), 'qa');
    assert.equal(fs.readFileSync(path.join(web.work, 'README.md'), 'utf8'), 'cambiado');
  });

  test('una rama que no existe falla solo en ese repo; se puede elegir otra y guardarla', async () => {
    reset();
    const g = await newGroup([{ name: 'Roto', branches: { [ids.api]: 'no-existe', [ids.web]: 'test' } }]);
    const env = g.envs[0];
    const first = await srv.ok('POST', `/workspaces/${g.id}/switch`, { envId: env.id });
    assert.equal(first.results.find((x) => x.name === 'api').status, 'failed');
    assert.equal(branchOf(web.work), 'test');

    const fixed = await srv.ok('POST', `/workspaces/${g.id}/switch`, { envId: env.id, branches: { [ids.api]: 'qa' }, saveOverrides: true });
    assert.equal(branchOf(api.work), 'qa');
    assert.equal(fixed.group.envs[0].branches[ids.api], 'qa');
  });

  test('volver al estado anterior restaura las ramas previas', async () => {
    reset();
    git(web.work, 'checkout', '-q', 'feature/PAG-1');
    const g = await newGroup([{ name: 'QA', branches: { [ids.api]: 'qa', [ids.web]: 'test' } }]);
    await srv.ok('POST', `/workspaces/${g.id}/switch`, { envId: g.envs[0].id });
    assert.equal(branchOf(web.work), 'test');
    await srv.ok('POST', `/workspaces/${g.id}/switch`, { restore: true });
    assert.equal(branchOf(api.work), 'main');
    assert.equal(branchOf(web.work), 'feature/PAG-1');
  });

  test('sin estado anterior, restaurar responde 400', async () => {
    const g = await newGroup([]);
    assert.equal((await srv.call('POST', `/workspaces/${g.id}/switch`, { restore: true })).status, 400);
  });

  test('después de cambiar hace pull solo de avance rápido', async () => {
    reset();
    const other = otherClone(root, lib, 'lib-ff');
    git(other, 'checkout', '-q', '-b', 'release', 'origin/main');
    commit(other, 'r.txt', 'r', 'release');
    git(other, 'push', '-q', '-u', 'origin', 'release');
    git(lib.work, 'fetch', '-q');
    git(lib.work, 'branch', '-q', '--track', 'release', 'origin/release');
    commit(other, 'r2.txt', 'r2', 'release 2');
    git(other, 'push', '-q');
    const g = await newGroup([{ name: 'Rel', branches: { [ids.lib]: 'release' } }]);
    const { results } = await srv.ok('POST', `/workspaces/${g.id}/switch`, { envId: g.envs[0].id, pull: true });
    assert.equal(results.find((x) => x.name === 'lib').status, 'ok');
    assert.ok(fs.existsSync(path.join(lib.work, 'r2.txt')), 'trae el commit nuevo del remoto');
    rm(other);
  });
});

describe('estado del grupo y acciones en lote', () => {
  test('informa cambios, commits por subir y bajar, y las ramas existentes', async () => {
    reset();
    const other = otherClone(root, web, 'web-st');
    commit(other, 'nuevo.txt', 'n', 'remoto');
    git(other, 'push', '-q');
    git(web.work, 'fetch', '-q');
    commit(api.work, 'local.txt', 'l', 'local');
    write(lib.work, 'wip.txt', 'x');
    const g = await newGroup([]);
    const { state, current } = await srv.ok('GET', '/workspaces');
    assert.equal(current[ids.api], 'main');
    assert.equal(state[ids.api].ahead, 1);
    assert.equal(state[ids.web].behind, 1);
    assert.equal(state[ids.lib].changes, 1);
    assert.ok(state[ids.api].branches.includes('feature/pagos'), 'incluye ramas que solo están en origin');
    assert.ok(!state[ids.api].branches.includes('HEAD'));
    const fast = await srv.ok('GET', '/workspaces?status=0');
    assert.equal(fast.state, undefined);
    assert.ok(g.id);
    rm(other);
  });

  test('pull y push del grupo', async () => {
    const g = await newGroup([]);
    const pull = await srv.ok('POST', `/workspaces/${g.id}/run`, { op: 'pull' });
    assert.equal(pull.results.find((x) => x.name === 'web').status, 'ok');
    assert.ok(fs.existsSync(path.join(web.work, 'nuevo.txt')));

    const push = await srv.ok('POST', `/workspaces/${g.id}/run`, { op: 'push' });
    assert.equal(push.results.find((x) => x.name === 'api').status, 'ok');
    assert.equal(push.results.find((x) => x.name === 'web').status, 'unchanged');
    assert.equal(git(api.work, 'rev-parse', 'HEAD'), git(api.work, 'rev-parse', 'origin/main'));

    git(lib.work, 'checkout', '-q', '-b', 'sin-publicar');
    const skipped = await srv.ok('POST', `/workspaces/${g.id}/run`, { op: 'push' });
    assert.equal(skipped.results.find((x) => x.name === 'lib').status, 'skipped');

    const fetchAll = await srv.ok('POST', `/workspaces/${g.id}/run`, { op: 'fetch' });
    assert.ok(fetchAll.results.every((x) => x.status === 'ok'));
    assert.equal((await srv.call('POST', `/workspaces/${g.id}/run`, { op: 'borrar' })).status, 400);
    git(lib.work, 'checkout', '-q', 'main');
  });

  test('cada cambio queda en el registro de operaciones', async () => {
    const log = await srv.ok('GET', '/oplog');
    const entries = Array.isArray(log) ? log : log.entries;
    assert.ok(entries.some((e) => /Entorno de trabajo/.test(e.label)));
    assert.ok(entries.some((e) => /grupo/.test(e.label)));
  });
});
