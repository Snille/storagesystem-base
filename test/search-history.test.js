import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store, checkBackup, restore } from '../src/store.js';
import { SearchHistory, historyQueryKey, historyLimit } from '../src/search-history.js';
import { createApp } from '../src/server.js';
import { fixture } from './fixture.js';

const metadata = { source: 'web', mode: 'search', query: 'skruv', language: 'sv' };
const result = { matches: [{ boxId: 'box', label: '<img src=x onerror=alert(1)>', location: { system: 'Shelf A' },
  photos: [{ originalUrl: 'https://private.example?key=secret' }], privateField: 'not a log field' }] };

test('search history records repeated requests, snapshots and final answers without credentials or inventory writes', async t => {
  const store = new Store(':memory:'); t.after(() => store.close()); store.importLegacy(structuredClone(fixture));
  const history = new SearchHistory(store), before = store.read(); let notifications = 0;
  store.subscribe(() => notifications++);
  assert.equal(await history.run(metadata, () => result), result);
  await history.run(metadata, () => ({ matches: [] }));
  await history.run({ ...metadata, source: 'api', mode: 'ask' }, () => ({ ...result, answer: 'The final AI answer.', source: 'ai' }));
  const { entries } = history.list();
  assert.equal(entries.length, 3); assert.equal(new Set(entries.map(e => e.id)).size, 3);
  assert.equal(entries[0].answer, 'The final AI answer.'); assert.equal(entries[0].answerSource, 'ai');
  assert.equal(entries[1].count, 0); assert.equal(entries[2].matches[0].label, result.matches[0].label);
  assert.ok(!JSON.stringify(entries).includes('secret')); assert.ok(!JSON.stringify(entries).includes('privateField'));
  assert.equal(notifications, 0, 'log writes do not schedule the embedding worker');
  assert.deepEqual(store.read(), before); assert.equal(store.audit().ok, true);
});

test('history filters and stable cursor pages survive concurrent inserts, and oversized text is marked', async t => {
  const store = new Store(':memory:'); t.after(() => store.close()); const history = new SearchHistory(store);
  for (let i = 0; i < 55; i++) await history.run({ ...metadata, query: `LÖDTENN ${i}` }, () => ({ matches: [] }));
  const page = history.list(); assert.equal(page.entries.length, 50); assert.ok(page.next);
  await history.run({ ...metadata, source: 'mcp', query: 'new' }, () => ({ matches: [] }));
  const older = history.list({ before: page.next }); assert.equal(older.entries.length, 5); assert.equal(older.next, null);
  assert.equal(history.list({ query: 'lödtenn 54', source: 'web' }).entries.length, 1);
  assert.equal(history.list({ source: 'mcp' }).entries.length, 1);
  for (const options of [{ before: '-1' }, { before: '1 OR 1=1' }, { source: 'unknown' }, { query: 'x'.repeat(2001) }]) assert.throws(() => history.list(options), { status: 400 });
  await history.run({ ...metadata, query: 'x'.repeat(2001) }, () => ({ matches: [], answer: 'a'.repeat(4001) }));
  const e = history.list().entries[0];
  assert.equal(e.query.length, 2000); assert.equal(e.answer.length, 4000); assert.equal(e.queryTruncated, true); assert.equal(e.answerTruncated, true);
});

test('accepted failed queries have a safe error entry and a logging failure does not fail search', async t => {
  const store = new Store(':memory:'); t.after(() => store.close()); const history = new SearchHistory(store);
  await assert.rejects(history.run(metadata, () => { throw new Error('upstream-secret'); }), /upstream-secret/);
  const e = history.list().entries[0]; assert.equal(e.outcome, 'error'); assert.equal(e.answer, '');
  assert.ok(!JSON.stringify(e).includes('upstream-secret'));
  const warning = t.mock.method(console, 'warn', () => {});
  store.db.exec('DROP TABLE search_history');
  assert.equal(await history.run(metadata, () => result), result); assert.equal(warning.mock.calls.length, 1);
});

test('retention removes expired entries and caps the journal without touching inventory', async t => {
  const store = new Store(':memory:'); t.after(() => store.close()); const history = new SearchHistory(store);
  await history.run(metadata, () => ({ matches: [] })); const sample = history.list().entries[0];
  const insert = store.db.prepare('INSERT INTO search_history (id, created_at, source, query_key, record) VALUES (?, ?, ?, ?, ?)');
  store.transaction(() => {
    for (let i = 0; i < historyLimit; i++) {
      const entry = { ...sample, id: randomUUID() };
      insert.run(entry.id, entry.createdAt, entry.source, historyQueryKey(entry.query), JSON.stringify(entry));
    }
    const old = { ...sample, id: randomUUID(), createdAt: '2000-01-01T00:00:00.000Z' };
    insert.run(old.id, old.createdAt, old.source, historyQueryKey(old.query), JSON.stringify(old));
  });
  await history.run(metadata, () => ({ matches: [] }));
  assert.equal(store.db.prepare('SELECT count(*) AS n FROM search_history').get().n, historyLimit);
  assert.equal(store.db.prepare("SELECT count(*) AS n FROM search_history WHERE created_at < '2001'").get().n, 0);
});

test('schema 3 migration, SQLite backup, fresh restore and in-place restore preserve and audit the journal', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'storage-history-')); let restored, store;
  t.after(() => { restored?.close(); store?.close(); rmSync(dir, { recursive: true, force: true }); });
  store = new Store(join(dir, 'old.sqlite')); store.importLegacy(structuredClone(fixture));
  store.db.exec('DROP TABLE search_history; PRAGMA user_version = 3'); store.close();
  store = new Store(join(dir, 'old.sqlite')); const before = store.read();
  assert.equal(store.audit().schemaVersion, 4); assert.deepEqual(new SearchHistory(store).list().entries, []);
  await new SearchHistory(store).run(metadata, () => result); const entries = new SearchHistory(store).list().entries;
  await store.backup(join(dir, 'backup.sqlite')); assert.equal(checkBackup(join(dir, 'backup.sqlite')).ok, true);
  await restore(join(dir, 'backup.sqlite'), join(dir, 'restored.sqlite'));
  restored = new Store(join(dir, 'restored.sqlite'));
  assert.deepEqual(new SearchHistory(restored).list().entries, entries); assert.deepEqual(restored.read(), before);
  await new SearchHistory(restored).run(metadata, () => ({ matches: [] }));
  restored.replaceFrom(join(dir, 'backup.sqlite')); assert.deepEqual(new SearchHistory(restored).list().entries, entries);
  restored.db.exec("UPDATE search_history SET query_key = 'wrong'"); assert.equal(restored.audit().ok, false);
});

test('HTTP logs web, public search/ask, MCP and previews once each, with protected read-only log access', async t => {
  const store = new Store(':memory:'); store.importLegacy(structuredClone(fixture));
  const app = createApp({ store, env: { STORAGE_ADMIN_KEY: 'admin', STORAGE_API_KEY: 'read' } });
  app.listen(0, '127.0.0.1'); await once(app, 'listening');
  t.after(async () => { app.closeAllConnections(); await new Promise(r => app.close(r)); store.close(); });
  const base = `http://127.0.0.1:${app.address().port}`;
  const request = (path, key = 'admin', body, method) => fetch(base + path, { method: method || (body ? 'POST' : 'GET'),
    headers: { 'x-api-key': key, 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  assert.equal((await request('/api/manage/search-history', 'read')).status, 401);
  assert.equal((await request('/api/manage/search?q=skruv', 'wrong')).status, 401);
  assert.equal((await request('/api/public/search?q=skruv', 'wrong')).status, 401);
  for (let i = 0; i < 2; i++) assert.equal((await request('/api/manage/search?q=skruv')).status, 200);
  assert.equal((await request('/api/public/search?q=notfound', 'read')).status, 200);
  const asked = await (await request('/api/public/ask', 'read', { query: 'skruv' })).json();
  assert.equal(asked.source, 'search');
  const mcp = await (await request('/api/mcp', 'read', { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'search_inventory', arguments: { query: 'skruv' } } })).json();
  assert.ok(mcp.result.structuredContent);
  assert.equal((await request('/api/manage/semantic/preview', 'admin', { query: 'skruv' })).status, 200);
  const log = await (await request('/api/manage/search-history')).json();
  assert.equal(log.entries.length, 6);
  assert.deepEqual(log.entries.map(e => e.source), ['preview', 'mcp', 'api', 'api', 'web', 'web']);
  assert.equal(log.entries[2].answer, asked.answer); assert.equal(log.entries[3].count, 0);
  assert.equal((await request('/api/manage/search-history?before=bad')).status, 400);
  assert.equal((await request('/api/manage/search-history', 'admin', {}, 'DELETE')).status, 404);
  assert.equal((await (await request('/api/manage/search-history')).json()).entries.length, 6, 'reading/filtering does not log itself');
});
