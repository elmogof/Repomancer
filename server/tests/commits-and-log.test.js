// Convenciones de commit (generales y por repositorio) y opciones de búsqueda en mensajes del historial.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { commit, makeRepo, rm, startServer, tmpDir } from './helpers.js';

let srv;
let root;
let id;

before(async () => {
  root = tmpDir();
  const repo = makeRepo(root, 'app');
  commit(repo.work, 'a.txt', '1', 'fix: corrige el Total del mes');
  commit(repo.work, 'b.txt', '2', 'feat: totales por cliente');
  commit(repo.work, 'c.txt', '3', 'docs: explica el subtotal');
  srv = await startServer();
  id = (await srv.ok('POST', '/repos/add', { path: repo.work })).id;
});

after(async () => {
  await srv?.stop();
  if (root) rm(root);
});

describe('convenciones de commit', () => {
  test('hay valores por defecto con ticket al inicio del resumen', async () => {
    const { global } = await srv.ok('GET', '/repos/commit-settings');
    assert.equal(global.conventional, true);
    assert.equal(global.ticket.mode, 'summary');
    assert.ok(new RegExp(global.ticket.pattern).test('INC033'));
  });

  test('guarda la configuración general y la valida', async () => {
    const { global } = await srv.ok('PUT', '/repos/commit-settings', {
      global: { conventional: false, ticket: { mode: 'footer', pattern: 'JIRA-\\d+', label: 'Ticket' }, template: '{type}: \n\nTicket: {ticket}', autoTemplate: true, scopes: ['pagos', 'api', 'pagos'] },
    });
    assert.equal(global.conventional, false);
    assert.deepEqual(global.ticket, { mode: 'footer', pattern: 'JIRA-\\d+', label: 'Ticket' });
    assert.deepEqual(global.scopes, ['pagos', 'api']);
    assert.equal((await srv.call('PUT', '/repos/commit-settings', { global: { ticket: { pattern: '(' } } })).status, 400);
    assert.equal((await srv.call('PUT', '/repos/commit-settings', { global: { scopes: ['con espacio'] } } )).status, 400);
    assert.equal((await srv.call('PUT', '/repos/commit-settings', { global: { ticket: { label: 'a b' } } })).status, 400);
  });

  test('un repositorio usa la general hasta que tiene una propia, y puede volver a la general', async () => {
    let d = await srv.ok('GET', `/repos/${id}/commit-settings`);
    assert.equal(d.own, null);
    assert.equal(d.effective.ticket.mode, 'footer');
    d = await srv.ok('PUT', `/repos/${id}/commit-settings`, { own: { ticket: { mode: 'end' } } });
    assert.equal(d.effective.ticket.mode, 'end');
    assert.equal(d.global.ticket.mode, 'footer');
    d = await srv.ok('PUT', `/repos/${id}/commit-settings`, { own: null });
    assert.equal(d.own, null);
    assert.equal(d.effective.ticket.mode, 'footer');
    assert.equal((await srv.call('GET', '/repos/no-existe/commit-settings')).status, 404);
  });
});

describe('búsqueda en mensajes del historial', () => {
  const subjects = async (query) => (await srv.ok('GET', `/repos/${id}/log?${query}`)).commits.map((c) => c.subject);

  test('sin opciones: texto literal sin distinguir mayúsculas', async () => {
    assert.deepEqual(await subjects('q=total'), ['docs: explica el subtotal', 'feat: totales por cliente', 'fix: corrige el Total del mes']);
  });

  test('distinguir mayúsculas', async () => {
    assert.deepEqual(await subjects('q=Total&qCase=1'), ['fix: corrige el Total del mes']);
  });

  test('palabra completa', async () => {
    assert.deepEqual(await subjects('q=total&qWord=1'), ['fix: corrige el Total del mes']);
  });

  test('expresión regular', async () => {
    assert.deepEqual(await subjects(`q=${encodeURIComponent('^(fix|docs):')}&qRegex=1`), ['docs: explica el subtotal', 'fix: corrige el Total del mes']);
    assert.equal((await srv.call('GET', `/repos/${id}/log?q=${encodeURIComponent('(')}&qRegex=1`)).status, 400);
  });

  test('un punto se busca literal salvo con expresión regular', async () => {
    assert.deepEqual(await subjects('q=t.tal'), []);
    assert.equal((await subjects('q=t.tal&qRegex=1')).length, 3);
  });
});
