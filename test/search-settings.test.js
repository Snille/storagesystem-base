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
  const state = { calls: [], digest: 'a'.repeat(64), delay: 0, status: 200, verificationDelay: 0, verificationStatus: 200,
    proof: { supported: true, relation: 'same_item', field: 'summary', quote: fixture.sessions[1].summary } };
  const server = createServer(async (req, res) => {
    let text = ''; for await (const chunk of req) text += chunk;
    const input = text ? JSON.parse(text) : null; state.calls.push({ path: req.url, input, authorization: req.headers.authorization });
    if (state.delay && input?.input === 'delayed query') await new Promise(resolve => setTimeout(resolve, state.delay));
    if (req.url === '/v1/chat/completions') {
      if (state.verificationDelay) await new Promise(resolve => setTimeout(resolve, state.verificationDelay));
      res.writeHead(state.verificationStatus, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(state.proof) } }] }));
    } else {
      res.writeHead(state.status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(req.url === '/api/tags' ? { models: [{ name: 'synthetic:1', digest: state.digest }] }
        : { model: 'synthetic:1', embeddings: [input.input.includes('Träskruvar') ? [0, 1] : [1, 0]] }));
    }
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
    settings.save({ revision: view.revision, embedding: { ...fields(view), enabled: true, baseUrl: 'http://localhost:11434', apiKey: 'synthetic-backup-key', model: 'synthetic', modelRevision: 'a'.repeat(64) }, rules: [rule('clarify')],
      verification: { ...verifierFields(view), enabled: true, baseUrl: 'http://localhost:11434/v1', model: 'synthetic', similarity: 0.7, margin: 0.1, apiKey: 'synthetic-verifier-key' }, publicEnabled: true });
    await store.backup(join(dir, 'backup.sqlite')); await restore(join(dir, 'backup.sqlite'), join(dir, 'restored.sqlite'));
    const restored = new Store(join(dir, 'restored.sqlite'));
    try {
      assert.deepEqual(restored.settings(), store.settings()); assert.deepEqual(restored.read(), store.read());
      assert.equal(new SearchSettings(restored).view().rules[0].question.sv, 'Ska det vara en färdig kabel?');
      assert.equal(new SearchSettings(restored).view().verification.apiKeyConfigured, true);
      assert.equal(new SearchSettings(restored).view().publicEnabled, true);
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

const verifierFields = view => { const { apiKeyConfigured, ...v } = view.verification; return v; };
const verifierConfig = config => ({ enabled: true, baseUrl: `${config.baseUrl}/v1`, model: 'synthetic-identity',
  timeoutMs: 1000, similarity: 0.8, margin: 0.2, apiKey: 'synthetic-verifier-key' });

test('verification settings are optional for old data, explicit, redacted, and preserve independent credentials', t => {
  const { store, settings } = setup(t);
  store.writeSettings({ searchWorkspace: { embedding: fields(settings.view()), rules: [] } });
  let view = settings.view();
  assert.equal(view.verification.enabled, false); assert.equal(view.verification.similarity, null);
  const verification = { ...verifierFields(view), baseUrl: 'http://localhost:11434/v1/', model: 'identity', apiKey: 'synthetic-verifier-key' };
  view = settings.save({ revision: view.revision, embedding: fields(view), rules: [], verification });
  assert.equal(view.verification.apiKeyConfigured, true); assert.equal(JSON.stringify(view).includes('synthetic-verifier-key'), false);
  assert.equal(view.verification.baseUrl, 'http://localhost:11434/v1');
  for (const invalid of [
    { ...verifierFields(view), enabled: true }, { ...verifierFields(view), timeoutMs: 99 },
    { ...verifierFields(view), timeoutMs: 90001 }, { ...verifierFields(view), margin: -1 },
    { ...verifierFields(view), similarity: 2 }, { ...verifierFields(view), baseUrl: 'http://user:key@localhost/v1' },
    { ...verifierFields(view), apiKey: 'line\nbreak' }, { ...verifierFields(view), identityEvidence: [] }
  ]) assert.throws(() => settings.save({ revision: view.revision, embedding: fields(view), rules: [], verification: invalid }));
  view = settings.save({ revision: view.revision, embedding: fields(view), rules: [], verification: { ...verifierFields(view), apiKey: '' } });
  assert.equal(view.verification.apiKeyConfigured, true);
  view = settings.save({ revision: view.revision, embedding: fields(view), rules: [], verification: { ...verifierFields(view), baseUrl: 'http://localhost:11435/v1' } });
  assert.equal(view.verification.apiKeyConfigured, false);
  view = settings.save({ revision: view.revision, embedding: fields(view), rules: [], verification: { ...verifierFields(view), apiKey: 'replacement-fixture' } });
  view = settings.save({ revision: view.revision, embedding: fields(view), rules: [], verification: { ...verifierFields(view), clearCredentials: true } });
  assert.equal(view.verification.apiKeyConfigured, false); assert.equal(store.audit().ok, true);
});

test('runtime preview requires source-bound identity proof and keeps thresholds and public requests separate', async t => {
  const { state, config } = await native(t), { store, settings } = setup(t);
  const inventory = new Inventory(store), service = new SearchService(inventory, {}); t.after(() => service.close());
  const before = store.read();
  let view = settings.save({ revision: settings.revision(), embedding: config, rules: [], verification: verifierConfig(config) });
  await until(() => service.status().state === 'ready');
  const query = 'joining electronics';
  let result = await service.preview({ query, revision: view.revision }, 'sv');
  assert.equal(result.reason, 'verified_semantic_evidence'); assert.equal(result.verification.outcome, 'supported');
  assert.deepEqual(result.selectedBoxIds, [fixture.boxes[0].boxId]);
  const request = state.calls.find(c => c.path === '/v1/chat/completions');
  assert.equal(request.authorization, 'Bearer synthetic-verifier-key');
  assert.equal(JSON.stringify(request.input).includes(fixture.boxes[0].boxId), false);
  const count = () => state.calls.filter(c => c.path === '/v1/chat/completions').length;
  const previous = count();
  result = await service.preview({ query: 'solder' }, 'sv');
  assert.equal(result.reason, 'direct_current_evidence'); assert.equal(result.verification.outcome, 'not_required'); assert.equal(count(), previous);
  state.proof = { supported: false, relation: 'related_item', quote: '' };
  result = await service.preview({ query }, 'sv'); assert.equal(result.decision, 'no_supported_match'); assert.equal(result.verification.outcome, 'unsupported');
  state.proof = { supported: true, relation: 'same_item', field: 'summary', quote: 'Invented item' };
  result = await service.preview({ query }, 'sv'); assert.equal(result.decision, 'no_supported_match'); assert.equal(result.verification.outcome, 'invalid');
  state.verificationStatus = 503;
  result = await service.preview({ query }, 'sv'); assert.equal(result.decision, 'no_supported_match'); assert.equal(result.verification.outcome, 'unavailable');
  view = settings.save({ revision: view.revision, embedding: fields(view), rules: [], verification: { ...verifierFields(view), enabled: false } });
  const calls = count(); result = await service.preview({ query }, 'sv');
  assert.equal(result.decision, 'no_supported_match'); assert.equal(count(), calls);
  for (const extra of [{ thresholds: { similarity: -1, margin: 0 } }, { confirmedIntent: 'solder' }, { identityEvidence: [state.proof] }]) {
    await assert.rejects(service.preview({ query, ...extra }), { status: 400 });
  }
  assert.equal(inventory.ask(query, 'sv').source, 'search'); assert.deepEqual(store.read(), before);
});

test('settings changes and inventory changes during verification cannot return an old-policy answer', async t => {
  const { state, config } = await native(t), { store, settings } = setup(t);
  const service = new SearchService(new Inventory(store), {}); t.after(() => service.close());
  let view = settings.save({ revision: settings.revision(), embedding: config, rules: [], verification: verifierConfig(config) });
  await until(() => service.status().state === 'ready'); state.verificationDelay = 150;
  const pending = service.preview({ query: 'joining electronics', revision: view.revision }, 'sv');
  await until(() => state.calls.some(c => c.path === '/v1/chat/completions'));
  view = settings.save({ revision: view.revision, embedding: fields(view), rules: [], verification: { ...verifierFields(view), model: 'different-identity' } });
  await assert.rejects(pending, { status: 409 });
  const count = state.calls.filter(c => c.path === '/v1/chat/completions').length;
  const stale = service.preview({ query: 'joining electronics', revision: view.revision }, 'sv');
  await until(() => state.calls.filter(c => c.path === '/v1/chat/completions').length > count);
  store.mutate(data => { data.sessions.find(s => s.sessionId === 'S-1').summary = 'Different current contents.'; });
  await assert.rejects(stale, { status: 400 });
  assert.equal(store.audit().ok, true);
});

test('changing a competitor during identity verification invalidates the original ranking', async t => {
  const { state, config } = await native(t), { store, settings } = setup(t);
  const service = new SearchService(new Inventory(store), {}); t.after(() => service.close());
  settings.save({ revision: settings.revision(), embedding: config, rules: [], verification: verifierConfig(config) });
  await until(() => service.status().state === 'ready'); state.verificationDelay = 150;
  const pending = service.preview({ query: 'joining electronics' }, 'sv');
  await until(() => state.calls.some(c => c.path === '/v1/chat/completions'));
  store.mutate(data => { data.sessions.find(s => s.sessionId === 'S-2').summary = 'Another candidate now mentions electronics.'; });
  await assert.rejects(pending, { status: 409 });
});

test('runtime identity busy and timeout outcomes abstain without overlapping verifier calls', async t => {
  const { state, config } = await native(t), { store, settings } = setup(t);
  const service = new SearchService(new Inventory(store), {}); t.after(() => service.close());
  let view = settings.save({ revision: settings.revision(), embedding: config, rules: [], verification: verifierConfig(config) });
  await until(() => service.status().state === 'ready'); state.verificationDelay = 150;
  const first = service.preview({ query: 'joining electronics' }, 'sv');
  await until(() => state.calls.some(c => c.path === '/v1/chat/completions'));
  const second = await service.preview({ query: 'joining electronics' }, 'sv');
  assert.equal(second.decision, 'no_supported_match'); assert.equal(second.verification.outcome, 'busy');
  assert.equal(state.calls.filter(c => c.path === '/v1/chat/completions').length, 1);
  assert.equal((await first).verification.outcome, 'supported');
  view = settings.save({ revision: view.revision, embedding: fields(view), rules: [], verification: { ...verifierFields(view), timeoutMs: 100 } });
  await service.transition;
  await until(() => service.status().state === 'ready');
  state.verificationDelay = 200;
  const timedOut = await service.preview({ query: 'joining electronics', revision: view.revision }, 'sv');
  assert.equal(timedOut.decision, 'no_supported_match'); assert.equal(timedOut.verification.outcome, 'unavailable');
});

test('ordinary semantic search activation is explicit, validated and retained by older clients', async t => {
  const { config } = await native(t), { settings } = setup(t);
  let view = settings.view(); assert.equal(view.publicEnabled, false);
  for (const publicEnabled of [true, null, 'true']) assert.throws(() => settings.save({
    revision: view.revision, embedding: fields(view), rules: [], publicEnabled }));
  view = settings.save({ revision: view.revision, embedding: config, verification: verifierConfig(config), rules: [], publicEnabled: true });
  assert.equal(view.publicEnabled, true);
  view = settings.save({ revision: view.revision, embedding: fields(view), rules: [] });
  assert.equal(view.publicEnabled, true);
  assert.throws(() => settings.save({ revision: view.revision, embedding: { ...fields(view), enabled: false }, rules: [] }));
  view = settings.save({ revision: view.revision, embedding: { ...fields(view), enabled: false }, rules: [], publicEnabled: false });
  assert.equal(view.publicEnabled, false);
});

test('preferred destination rules require one current supported box, never an invented location', async t => {
  const { store, settings } = setup(t), service = new SearchService(new Inventory(store), {}); t.after(() => service.close());
  let view = settings.view();
  const preferred = { id: 'preferred-consumable', queries: ['solder'], action: 'prefer', boxIds: [fixture.boxes[0].boxId] };
  view = settings.save({ revision: view.revision, embedding: fields(view), rules: [preferred] });
  let result = await service.preview({ query: 'solder' }, 'sv');
  assert.equal(result.reason, 'confirmed_preferred_destination'); assert.deepEqual(result.selectedBoxIds, preferred.boxIds);
  assert.throws(() => settings.save({ revision: view.revision, embedding: fields(view), rules: [{ ...preferred, boxIds: fixture.boxes.map(b => b.boxId) }] }));
  store.mutate(data => { data.sessions.find(s => s.sessionId === 'S-1').itemKeywords = []; data.boxes[0].label = 'Empty box'; });
  result = await service.preview({ query: 'solder' }, 'sv');
  assert.equal(result.reason, 'rule_evidence_missing'); assert.deepEqual(result.selectedBoxIds, []);
});

test('a reply after a clarification is read with the question, per conversation and only for a short time', async t => {
  const { config } = await native(t), { store, settings } = setup(t);
  store.mutate(data => {
    data.boxes[0].label = 'Nätverkskabel'; data.boxes[1].label = 'Kabel för nätverk';
    const first = data.sessions.find(s => s.sessionId === 'S-1'), second = data.sessions.find(s => s.sessionId === 'S-2');
    first.summary = 'En färdig nätverkskabel.'; first.itemKeywords = [];
    second.summary = 'Nätverkskablar på rulle för montering.'; second.itemKeywords = [];
  });
  const cableRule = { ...rule('clarify'), queries: ['Nätverkskabel'] };
  settings.save({ revision: settings.revision(), embedding: config, verification: verifierConfig(config), rules: [cableRule], publicEnabled: true });
  const ask = async (service, query, conversationId) => service.ask(query, 'sv', conversationId);
  const service = new SearchService(new Inventory(store), {}); t.after(() => service.close());
  await until(() => service.status().state === 'ready');
  assert.equal((await ask(service, 'Nätverkskabel', 'satellite-1')).decision, 'clarify');
  let result = await ask(service, 'rulle', 'satellite-1');
  assert.equal(result.decision, 'answer'); assert.equal(result.followUpOf, 'Nätverkskabel');
  assert.deepEqual(result.matches.map(b => b.boxId), [fixture.boxes[1].boxId]);
  // The context is used once, belongs to one conversation, and a reply that
  // settles nothing becomes a new question.
  assert.equal((await ask(service, 'rulle', 'satellite-1')).followUpOf, undefined);
  await ask(service, 'Nätverkskabel', 'satellite-1');
  assert.equal((await ask(service, 'rulle', 'satellite-2')).followUpOf, undefined);
  result = await ask(service, 'M99', 'satellite-1');
  assert.equal(result.decision, 'no_supported_match'); assert.equal(result.followUpOf, undefined);
  assert.equal(result.answer, 'Jag hittar ingen säker träff för "M99" i inventeringen.');
  assert.equal((await ask(service, 'rulle', 'satellite-1')).followUpOf, undefined);
  const disabled = new SearchService(new Inventory(store), { STORAGE_CLARIFICATION_SECONDS: '0' }); t.after(() => disabled.close());
  await until(() => disabled.status().state === 'ready');
  await ask(disabled, 'Nätverkskabel', 'satellite-1');
  assert.equal((await ask(disabled, 'rulle', 'satellite-1')).followUpOf, undefined);
});

test('web, REST, MCP and HA ask share supported selections and journal final answers without rephrasing', async t => {
  const { state, config } = await native(t), { store, settings } = setup(t);
  store.writeSettings({ aiWorkspace: { connections: [{ id: 'fake-phrasing', name: 'Synthetic', provider: 'compatible', baseUrl: `${config.baseUrl}/v1` }],
    imageInventory: { connectionId: 'fake-phrasing', model: 'must-not-rephrase', language: 'sv', extraInstructions: '' } } });
  settings.save({ revision: settings.revision(), embedding: config, verification: verifierConfig(config), rules: [], publicEnabled: true });
  const app = createApp({ store, env: { STORAGE_ADMIN_KEY: 'admin', STORAGE_API_KEY: 'read' } });
  app.listen(0, '127.0.0.1'); await once(app, 'listening');
  t.after(async () => { app.closeAllConnections(); await new Promise(resolve => app.close(resolve)); });
  const base = `http://127.0.0.1:${app.address().port}`;
  const request = async (path, body, admin = false) => {
    const r = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { 'x-api-key': admin ? 'admin' : 'read', 'content-type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    assert.equal(r.status, 200); return r.json();
  };
  await until(async () => (await request('/api/manage/semantic', null, true)).state === 'ready');
  const query = 'joining electronics', results = [];
  results.push(await request('/api/manage/search?q=' + encodeURIComponent(query), null, true));
  results.push(await request('/api/public/search?q=' + encodeURIComponent(query)));
  results.push(await request('/api/public/ask', { query }));
  const rpc = await request('/api/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'search_inventory', arguments: { query } } });
  results.push(rpc.result.structuredContent);
  for (const result of results) {
    assert.equal(result.source, 'semantic'); assert.equal(result.reason, 'verified_semantic_evidence');
    assert.deepEqual(result.matches.map(b => b.boxId), [fixture.boxes[0].boxId]); assert.equal(result.answer, results[0].answer);
  }
  assert.ok(state.calls.filter(c => c.path === '/v1/chat/completions').every(c => c.input.model === 'synthetic-identity'));
  const history = await request('/api/manage/search-history', null, true);
  assert.equal(history.entries.length, 4); assert.ok(history.entries.every(e => e.answerSource === 'semantic' && e.answer === results[0].answer));
  assert.deepEqual(new Set(history.entries.map(e => e.source)), new Set(['web', 'api', 'mcp']));
  state.verificationStatus = 503;
  let result = await request('/api/public/ask', { query });
  assert.equal(result.decision, 'no_supported_match'); assert.equal(result.matches.length, 0);
  state.status = 503;
  result = await request('/api/public/ask', { query: 'solder' });
  assert.equal(result.decision, 'answer'); assert.equal(result.fallback, 'embedding_unavailable');
  assert.deepEqual(result.matches.map(b => b.boxId), [fixture.boxes[0].boxId]);
  result = await request('/api/public/ask', { query: 'M99 screws', conversationId: 'satellite-1' });
  assert.equal(result.decision, 'no_supported_match'); assert.equal(result.count, 0);
  const tooLong = await fetch(base + '/api/public/ask', { method: 'POST', headers: { 'x-api-key': 'read', 'content-type': 'application/json' },
    body: JSON.stringify({ query: 'solder', conversationId: 'x'.repeat(201) }) });
  assert.equal(tooLong.status, 400);
  store.mutate(data => { for (const session of data.sessions.filter(s => s.isCurrent)) session.itemKeywords.push('fastener', 'shared'); });
  const view = settings.view();
  settings.save({ revision: view.revision, embedding: fields(view), rules: [{ id: 'both-fasteners', queries: ['fastener'], action: 'all', boxIds: fixture.boxes.map(b => b.boxId) }] });
  result = await request('/api/public/ask', { query: 'fastener' });
  assert.equal(result.reason, 'confirmed_compatible_destinations'); assert.equal(result.count, 2);
  for (const box of result.matches) assert.ok(result.answer.includes(Object.values(box.location).filter(Boolean).join(', ')));
  result = await request('/api/public/search?q=fastener&limit=1'); assert.equal(result.count, 1);
  result = await request('/api/public/ask', { query: 'shared' });
  assert.equal(result.decision, 'clarify'); assert.equal(result.count, 2);
  assert.equal(store.audit().ok, true);
});

test('reanalysis replaces public evidence and vectors while retained filename lookups still locate the current box', async t => {
  const { config } = await native(t), { store, settings } = setup(t);
  store.mutate(data => { data.photos[0].originalFileName = 'old_box_image.jpg'; });
  settings.save({ revision: settings.revision(), embedding: config, verification: verifierConfig(config), rules: [], publicEnabled: true });
  const service = new SearchService(new Inventory(store), {}); t.after(() => service.close());
  await until(() => service.status().state === 'ready');
  assert.equal((await service.search('solder')).decision, 'answer');
  store.mutate(data => {
    data.boxes.find(b => b.boxId === fixture.boxes[0].boxId).label = 'Connector parts'; data.sessions.find(s => s.sessionId === 'S-1').isCurrent = false;
    data.sessions.push({ sessionId: 'NEW-SESSION', boxId: fixture.boxes[0].boxId, isCurrent: true,
      createdAt: '2026-10-29T20:00:00Z', summary: 'Current connectors only.', itemKeywords: ['connector'] });
  });
  assert.equal((await service.search('solder')).decision, 'no_supported_match');
  await until(() => service.status().state === 'ready');
  assert.equal((await service.search('solder')).decision, 'no_supported_match');
  const current = await service.search('connector');
  assert.equal(current.matches[0].sessionId, 'NEW-SESSION'); assert.equal(current.matches[0].summary, 'Current connectors only.');
  const filename = await service.search('old_box_image.jpg');
  assert.equal(filename.reason, 'retained_filename'); assert.equal(filename.matches[0].sessionId, 'NEW-SESSION');
  assert.equal(store.audit().ok, true);
});

test('network-cable evidence supports both Swedish phrasings while owner rule triggers stay distinct', async t => {
  const { store, settings } = setup(t);
  store.mutate(data => {
    data.boxes.find(b => b.boxId === fixture.boxes[0].boxId).label = 'Kabel för Nätverk';
    data.boxes.find(b => b.boxId === fixture.boxes[1].boxId).label = 'Nätverkskabel';
    for (const s of data.sessions.filter(s => s.isCurrent)) { s.summary = 'Nätverkskablar.'; s.itemKeywords = ['nätverkskabel']; }
    data.boxes.push({ boxId: 'SHORT-CABLES', label: 'Små nätverkskablar', currentLocationId: 'C-H1-P1-A', createdAt: '2026-01-01T10:00:00Z', updatedAt: '2026-01-01T10:00:00Z' });
    data.sessions.push({ sessionId: 'SHORT-SESSION', boxId: 'SHORT-CABLES', summary: 'Korta nätverkskablar.', itemKeywords: [], isCurrent: true, createdAt: '2026-01-01T10:00:00Z' });
  });
  const ids = fixture.boxes.map(b => b.boxId), view = settings.view();
  const question = 'Ska det vara en färdig nätverkskabel?';
  settings.save({ revision: view.revision, embedding: fields(view), rules: [
    { id: 'two-cables', queries: ['nätverkskabel'], action: 'all', boxIds: [ids[1], 'SHORT-CABLES'] },
    { id: 'cable-kind', queries: ['kabel för nätverk'], action: 'clarify', boxIds: [...ids, 'SHORT-CABLES'], question: { sv: question } }
  ] });
  const service = new SearchService(new Inventory(store), {}); t.after(() => service.close());
  let result = await service.preview({ query: 'nätverkskabel' }, 'sv');
  assert.equal(result.decision, 'answer'); assert.deepEqual(result.selectedBoxIds, [ids[1], 'SHORT-CABLES']);
  result = await service.preview({ query: 'kabel för nätverk' }, 'sv');
  assert.equal(result.reason, 'item_type_distinction'); assert.equal(result.answer, question);
  store.mutate(data => { data.sessions.find(s => s.sessionId === 'SHORT-SESSION').summary = 'Inga nätverkskablar.'; });
  result = await service.preview({ query: 'kabel för nätverk' }, 'sv');
  assert.equal(result.reason, 'rule_evidence_missing');
});
