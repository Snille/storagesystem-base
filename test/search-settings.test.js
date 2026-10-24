import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store, restore } from '../src/store.js';
import { Inventory } from '../src/inventory.js';
import { SearchSettings } from '../src/search-settings.js';
import { SearchService } from '../src/search-service.js';
import { createApp } from '../src/server.js';
import { fixture } from './fixture.js';

function setup(t) {
  const store = new Store(':memory:'); store.importLegacy(structuredClone(fixture), { appearance: { language: 'sv' }, unrelated: { preserved: true } });
  t.after(() => store.close()); return { store, settings: new SearchSettings(store) };
}
const fields = view => { const { apiKeyConfigured, ...e } = view.embedding; return e; };
const rule = action => ({ id: 'extension-leads', queries: ['Skarvsladd'], action, boxIds: fixture.boxes.map(box => box.boxId),
  ...(action === 'clarify' ? { question: { sv: 'Ska det vara en färdig kabel?', en: 'Do you need a finished cable?' } } : {}) });

async function native(t) {
  const state = { calls: [], digest: 'a'.repeat(64), delay: 0, status: 200 };
  const server = createServer(async (req, res) => {
    let text = ''; for await (const chunk of req) text += chunk;
    const input = text ? JSON.parse(text) : null; state.calls.push({ path: req.url, input, authorization: req.headers.authorization });
    if (state.delay && input?.input === 'delayed query') await new Promise(resolve => setTimeout(resolve, state.delay));
    res.writeHead(state.status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(req.url === '/api/tags' ? { models: [{ name: 'synthetic:1', digest: state.digest }] } : { model: 'synthetic:1', embeddings: [[1, 0]] }));
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  return { state, config: { enabled: true, baseUrl: `http://127.0.0.1:${server.address().port}`, model: 'synthetic:1', modelRevision: state.digest, dimensions: 2, apiKey: 'synthetic-key' } };
}
async function until(work) {
  for (let i = 0; i < 200; i++) { const value = await work(); if (value) return value; await new Promise(resolve => setTimeout(resolve, 5)); }
  assert.fail('Expected background work did not complete.');
}

test('saved search settings preserve unrelated sections, redact/retain/clear keys and reject stale edits', t => {
  const { store, settings } = setup(t), initial = settings.view();
  assert.equal(initial.embedding.enabled, false);
  const saved = settings.save({ revision: initial.revision, embedding: { ...fields(initial), baseUrl: 'http://127.0.0.1:11434/', apiKey: 'private-fixture-key' }, rules: [] });
  assert.equal(saved.embedding.apiKeyConfigured, true); assert.equal(JSON.stringify(saved).includes('private-fixture-key'), false);
  assert.equal(store.settings().searchWorkspace.embedding.apiKey, 'private-fixture-key');
  assert.throws(() => settings.save({ revision: initial.revision, embedding: fields(initial), rules: [] }), { status: 409 });
  let next = settings.save({ revision: saved.revision, embedding: { ...fields(saved), apiKey: '' }, rules: [] });
  assert.equal(next.embedding.apiKeyConfigured, true);
  next = settings.save({ revision: next.revision, embedding: { ...fields(next), baseUrl: 'http://127.0.0.1:11435' }, rules: [] });
  assert.equal(next.embedding.apiKeyConfigured, false);
  next = settings.save({ revision: next.revision, embedding: { ...fields(next), apiKey: 'another-fixture' }, rules: [] });
  next = settings.save({ revision: next.revision, embedding: { ...fields(next), clearCredentials: true }, rules: [] });
  assert.equal(next.embedding.apiKeyConfigured, false); assert.deepEqual(store.settings().unrelated, { preserved: true });
  assert.equal(store.audit().ok, true);
});

test('rule constraints, unknown boxes, invalid origins and hidden configuration fields fail atomically', t => {
  const { store, settings } = setup(t), state = settings.view(), before = store.settings();
  const input = { revision: state.revision, embedding: fields(state), rules: [] };
  for (const embedding of [
    { ...input.embedding, baseUrl: 'http://user:key@localhost' }, { ...input.embedding, baseUrl: 'http://localhost/v1' },
    { ...input.embedding, enabled: true }, { ...input.embedding, dimensions: 0 }, { ...input.embedding, apiKey: 'x\ny' },
    { ...input.embedding, cachePath: 'inventory.sqlite' }
  ]) assert.throws(() => settings.save({ ...input, embedding }));
  for (const invalid of [
    { ...rule('all'), boxIds: ['unknown', fixture.boxes[0].boxId] }, { ...rule('any'), queries: [] },
    { ...rule('clarify'), question: {} }, { ...rule('any'), identityEvidence: [] },
    { ...rule('any'), queries: ['Var finns'] }, { ...rule('any'), queries: ['!!!'] },
    { ...rule('all'), boxIds: [...fixture.boxes.map(b => b.boxId), 'third'] }, { ...rule('any'), queries: ['x'.repeat(241)] }
  ]) assert.throws(() => settings.save({ ...input, rules: [invalid] }));
  assert.deepEqual(store.settings(), before);
});

test('saved owner rules work without embeddings and never authorize unsupported or obsolete inventory', async t => {
  const { store, settings } = setup(t);
  store.mutate(data => { for (const s of data.sessions.filter(s => s.isCurrent)) s.itemKeywords.push('skarvsladd'); });
  const service = new SearchService(new Inventory(store), {}); t.after(() => service.close());
  const original = store.read(); let state = settings.view();
  for (const action of ['any', 'all', 'clarify']) {
    state = settings.save({ revision: state.revision, embedding: fields(state), rules: [rule(action)] });
    const result = await service.preview({ query: 'Skarvsladd', revision: state.revision }, 'sv');
    assert.equal(result.decision, action === 'clarify' ? 'clarify' : 'answer');
    assert.equal(result.selectedBoxIds.length, action === 'any' ? 1 : action === 'all' ? 2 : 0);
    assert.equal(result.retrieval.available, false);
    if (action === 'clarify') assert.equal(result.answer, 'Ska det vara en färdig kabel?');
  }
  assert.deepEqual(store.read(), original);
  await assert.rejects(service.preview({ query: 'test', rules: [rule('all')] }), { status: 400 });
  store.mutate(data => { data.sessions.find(s => s.sessionId === 'S-2').itemKeywords = ['unrelated']; });
  const result = await service.preview({ query: 'Skarvsladd', revision: state.revision }, 'sv');
  assert.equal(result.reason, 'rule_evidence_missing'); assert.equal(result.selectedBoxIds.length, 0);
});

test('native model discovery uses only saved credentials and metadata, with stale and unavailable responses rejected', async t => {
  const { state, config } = await native(t), { store, settings } = setup(t);
  const before = store.read();
  let view = settings.view(); view = settings.save({ revision: view.revision, embedding: { ...config, enabled: false, model: '', modelRevision: '' }, rules: [] });
  const models = await settings.models({ revision: view.revision });
  assert.deepEqual(models.models, [{ name: 'synthetic:1', digest: state.digest }]);
  assert.deepEqual(state.calls.map(c => c.path), ['/api/tags']); assert.equal(state.calls[0].authorization, 'Bearer synthetic-key');
  assert.equal(JSON.stringify(models).includes('synthetic-key'), false);
  assert.deepEqual(store.read(), before);
  state.status = 404; await assert.rejects(settings.models({ revision: view.revision }), { status: 502 });
  await assert.rejects(settings.models({ revision: 'stale' }), { status: 409 });
});

test('saved finished-versus-bulk cable clarification survives Swedish cable inflections', async t => {
  const { store, settings } = setup(t);
  store.mutate(data => {
    data.boxes[0].label = 'Nätverkskabel'; data.boxes[1].label = 'Kabel för nätverk';
    const first = data.sessions.find(s => s.sessionId === 'S-1'), second = data.sessions.find(s => s.sessionId === 'S-2');
    first.summary = 'En färdig nätverkskabel.'; first.itemKeywords = [];
    second.summary = 'Nätverkskablar på rulle för montering.'; second.itemKeywords = [];
  });
  const service = new SearchService(new Inventory(store), {}); t.after(() => service.close());
  const view = settings.view(), cableRule = { ...rule('clarify'), queries: ['Nätverkskabel'] };
  settings.save({ revision: view.revision, embedding: fields(view), rules: [cableRule] });
  const result = await service.preview({ query: 'Nätverkskabel' }, 'sv');
  assert.equal(result.reason, 'item_type_distinction'); assert.equal(result.answer, cableRule.question.sv);
  assert.equal((await service.preview({ query: 'M4 nätverkskabel' }, 'sv')).decision, 'no_supported_match');
});

test('model settings apply without restart; a settings change invalidates an in-flight preview', async t => {
  const { state, config } = await native(t), { store, settings } = setup(t);
  const service = new SearchService(new Inventory(store), {}); t.after(() => service.close());
  let view = settings.view(); view = settings.save({ revision: view.revision, embedding: config, rules: [] });
  await until(() => service.status().state === 'ready'); assert.equal(service.status().ready, 2);
  state.delay = 150; const query = service.preview({ query: 'delayed query', revision: view.revision });
  await until(() => state.calls.some(c => c.input?.input === 'delayed query'));
  view = settings.save({ revision: view.revision, embedding: { ...fields(view), enabled: false }, rules: [] });
  await assert.rejects(query, { status: 409 });
  await service.transition; assert.equal(service.status().enabled, false);
  const calls = state.calls.length;
  await service.preview({ query: 'solder', revision: view.revision }); assert.equal(state.calls.length, calls);
});

test('rules and model configuration survive full backup/restore; runtime inventory stays unchanged', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'storage-search-settings-'));
  const store = new Store(join(dir, 'source.sqlite'));
  try {
    store.importLegacy(structuredClone(fixture)); const settings = new SearchSettings(store), view = settings.view();
    settings.save({ revision: view.revision, embedding: { ...fields(view), baseUrl: 'http://localhost:11434', apiKey: 'synthetic-backup-key' }, rules: [rule('clarify')] });
    await store.backup(join(dir, 'backup.sqlite')); await restore(join(dir, 'backup.sqlite'), join(dir, 'restored.sqlite'));
    const restored = new Store(join(dir, 'restored.sqlite'));
    try {
      assert.deepEqual(restored.settings(), store.settings()); assert.deepEqual(restored.read(), store.read());
      assert.equal(new SearchSettings(restored).view().rules[0].question.sv, 'Ska det vara en färdig kabel?');
      assert.equal(restored.audit().ok, true);
    } finally { restored.close(); }
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('HTTP search settings are protected and shared preview never changes public ask or search', async t => {
  const { store } = setup(t), app = createApp({ store, env: { STORAGE_ADMIN_KEY: 'admin', STORAGE_API_KEY: 'read' } });
  app.listen(0, '127.0.0.1'); await once(app, 'listening');
  t.after(async () => { app.closeAllConnections(); await new Promise(resolve => app.close(resolve)); });
  const base = `http://127.0.0.1:${app.address().port}`, headers = { 'x-api-key': 'admin', 'content-type': 'application/json' };
  assert.equal((await fetch(base + '/api/manage/search-settings', { headers: { 'x-api-key': 'read' } })).status, 401);
  const view = await (await fetch(base + '/api/manage/search-settings', { headers })).json();
  const input = JSON.stringify({ revision: view.revision, embedding: fields(view), rules: [rule('clarify')] });
  assert.equal((await fetch(base + '/api/manage/search-settings', { method: 'PUT', headers: { ...headers, Origin: 'https://wrong.example' }, body: input })).status, 403);
  assert.equal((await fetch(base + '/api/manage/search-settings', { method: 'PUT', headers, body: input })).status, 200);
  assert.equal((await fetch(base + '/api/manage/search-settings', { method: 'PUT', headers, body: input })).status, 409);
  assert.equal((await fetch(base + '/api/public/ask', { method: 'POST', headers: { 'x-api-key': 'read', 'content-type': 'application/json' }, body: '{"query":"solder"}' }).then(r => r.json())).source, 'search');
  assert.equal((await fetch(base + '/api/public/search?q=solder', { headers: { 'x-api-key': 'read' } }).then(r => r.json())).matches[0].boxId, fixture.boxes[0].boxId);
  assert.match(await (await fetch(base + '/search-settings.js')).text(), /mountSearchSettings/);
});
