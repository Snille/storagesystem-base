import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/store.js';
import { Inventory } from '../src/inventory.js';
import { OllamaEmbeddings } from '../src/embeddings.js';
import { SemanticCache, SemanticIndex, semanticDocument } from '../src/semantic-index.js';
import { createApp } from '../src/server.js';
import { fixture } from './fixture.js';

async function provider(t) {
  const state = { requests: [], response: { model: 'fixture:1', embeddings: [[3, 4]] },
    tags: { models: [{ name: 'fixture:1', digest: 'a'.repeat(64) }] }, status: 200, delay: 0, redirect: false };
  const server = createServer(async (req, res) => {
    let text = ''; for await (const chunk of req) text += chunk;
    state.requests.push({ url: req.url, headers: req.headers, body: text ? JSON.parse(text) : null });
    const send = () => {
      if (state.redirect) { res.writeHead(302, { Location: '/must-not-follow' }); res.end(); return; }
      res.writeHead(state.status, { 'content-type': 'application/json' }); res.end(JSON.stringify(req.url === '/api/tags' ? state.tags : state.response));
    };
    if (state.delay) setTimeout(send, state.delay); else send();
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const config = { baseUrl: `http://127.0.0.1:${server.address().port}`, model: 'fixture:1', modelRevision: 'a'.repeat(64), dimensions: 2, apiKey: 'fixture-only', timeoutMs: 500 };
  return { state, config };
}

function setup(t, path = ':memory:') {
  const store = new Store(':memory:'); store.importLegacy(structuredClone(fixture));
  const inventory = new Inventory(store), cache = new SemanticCache(path);
  const embedder = { dimensions: 2, profile: { model: 'fixture:1', modelRevision: 'one', dimensions: 2 },
    calls: [], async embed(text) { this.calls.push(text); return text.includes('Träskruvar') ? [0, 1] : [1, 0]; } };
  const index = new SemanticIndex({ inventory, cache, embedder });
  t.after(async () => { await index.stop(); cache.close(); store.close(); });
  return { store, inventory, cache, embedder, index };
}

test('native embedding requests disable truncation and validate response identity/dimensions', async t => {
  const { state, config } = await provider(t), client = new OllamaEmbeddings(config);
  assert.deepEqual(await client.embed('synthetic contents'), [0.6, 0.8]);
  assert.deepEqual(state.requests[1].body, { model: 'fixture:1', input: 'synthetic contents', truncate: false });
  assert.equal(state.requests[1].url, '/api/embed');
  assert.equal(state.requests[0].headers.authorization, 'Bearer fixture-only');
  for (const response of [
    { model: 'wrong', embeddings: [[1, 0]] }, { model: 'fixture:1', embeddings: [[0, 0]] },
    { model: 'fixture:1', embeddings: [[1]] }, { model: 'fixture:1', embeddings: [[null, 1]] },
    { model: 'fixture:1', embeddings: [[1, 0], [0, 1]] }, { error: 'private-provider-error' }
  ]) {
    state.response = response;
    await assert.rejects(client.embed('test'), error => error.status === 503 && !error.message.includes('private-provider-error'));
  }
  state.tags.models[0].digest = 'b'.repeat(64); const count = state.requests.length;
  await assert.rejects(client.embed('changed model'), { status: 503 });
  assert.equal(state.requests.length, count + 1); assert.equal(state.requests.at(-1).url, '/api/tags');
});

test('embedding length, refusal, redirects, bounded response and timeout cannot yield partial vectors', async t => {
  const { state, config } = await provider(t), client = new OllamaEmbeddings(config);
  await assert.rejects(client.embed('å'.repeat(32769)), { status: 413 });
  assert.equal(state.requests.length, 0);
  state.status = 400; await assert.rejects(client.embed('over context'), { status: 503 });
  state.status = 200; state.redirect = true; const count = state.requests.length;
  await assert.rejects(client.embed('redirect'), { status: 503 });
  assert.equal(state.requests.length, count + 1);
  state.redirect = false; state.response = { padding: 'x'.repeat(1024 * 1024 + 1) };
  await assert.rejects(client.embed('oversized response'), { status: 503 });
  state.delay = 100;
  await assert.rejects(new OllamaEmbeddings({ ...config, timeoutMs: 10 }).embed('timeout'), { status: 503 });
  for (const baseUrl of ['http://user:pass@localhost', 'http://localhost/v1', 'file:///tmp', 'http://localhost/?key=x']) {
    assert.throws(() => new OllamaEmbeddings({ ...config, baseUrl }));
  }
  assert.throws(() => new OllamaEmbeddings({ ...config, modelRevision: '' }));
});

test('current-content documents exclude history, filenames and locations', t => {
  const { inventory } = setup(t);
  const box = inventory.get(fixture.boxes[0].boxId);
  const doc = semanticDocument(box);
  assert.equal(doc.sessionId, 'S-1');
  assert.match(doc.text, /Lödtenn/);
  for (const value of ['Old contents', 'old-photo', box.boxId, box.locationId]) assert.equal(doc.text.includes(value), false);
  assert.equal(semanticDocument({ ...box, locationId: 'new', photos: [...box.photos].reverse() }).documentHash, doc.documentHash);
});

test('background cache is incremental and persistent; model revision changes force rebuilding', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'storage-semantic-'));
  const path = join(dir, 'vectors.sqlite'), { inventory, cache, embedder, index, store } = setup(t, path);
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const before = store.read(); await index.start();
  assert.equal(index.status().ready, 2); assert.equal(embedder.calls.length, 2);
  await index.schedule(); assert.equal(embedder.calls.length, 2);
  const result = await index.search('soldering device');
  assert.equal(result.available, true); assert.equal(result.semanticMatches.length, 2);
  assert.equal(result.semanticMatches[0].boxId, fixture.boxes[0].boxId);
  assert.equal(result.semanticMatches[0].sessionId, 'S-1');
  assert.equal(cache.audit().ok, true); assert.deepEqual(store.read(), before); assert.equal(store.audit().schemaVersion, 2);
  const persisted = new SemanticCache(path), restart = new SemanticIndex({ inventory, cache: persisted, embedder });
  try {
    const count = embedder.calls.length; await restart.start(); assert.equal(embedder.calls.length, count);
    await restart.stop();
    const changed = new SemanticIndex({ inventory, cache: persisted, embedder: { ...embedder, profile: { ...embedder.profile, modelRevision: 'two' } } });
    assert.equal(changed.status().ready, 0); await changed.start(); assert.equal(embedder.calls.length, count + 2); await changed.stop();
  } finally { persisted.close(); }
});

test('inventory commits stay independent of inference and stale in-flight results are discarded', async t => {
  const { store, cache, embedder, index } = setup(t);
  let release; let entered;
  const called = new Promise(resolve => { entered = resolve; });
  const original = embedder.embed.bind(embedder); let first = true;
  embedder.embed = async text => {
    if (first) { first = false; entered(); await new Promise(resolve => { release = resolve; }); }
    return original(text);
  };
  const building = index.start(); await called;
  store.mutate(data => { data.sessions.find(s => s.sessionId === 'S-2').summary = 'Updated current contents'; });
  assert.equal(store.read().sessions.find(s => s.sessionId === 'S-2').summary, 'Updated current contents');
  assert.equal((await index.search('test')).available, false);
  release(); await building;
  assert.equal(index.status().state, 'ready');
  const row = cache.rows().find(row => row.box_id === fixture.boxes[1].boxId);
  assert.equal(row.document_hash, index.documents().find(doc => doc.boxId === row.box_id).documentHash);
  assert.ok(embedder.calls.some(text => text.includes('Updated current contents')));
  const count = embedder.calls.length;
  assert.throws(() => store.transaction(() => { throw new Error('rollback'); }));
  assert.equal(index.running, null); assert.equal(embedder.calls.length, count);
});

test('failed inference, stale sessions, cache corruption and deletion cannot supply incomplete rankings', async t => {
  const { store, cache, embedder, index } = setup(t);
  const original = embedder.embed.bind(embedder); let fail = true;
  embedder.embed = async text => { if (fail) throw new Error('unreachable'); return original(text); };
  await index.start(); assert.equal(index.status().state, 'degraded');
  assert.equal((await index.search('test')).available, false);
  fail = false; await index.schedule(); assert.equal(index.status().state, 'ready');
  fail = true; assert.equal((await index.search('query failure')).reason, 'embedding_unavailable'); fail = false;
  cache.db.prepare('UPDATE embeddings SET vector=? WHERE box_id=?').run('[0,0]', fixture.boxes[0].boxId);
  assert.equal(cache.audit().ok, false); assert.equal((await index.search('test')).available, false);
  await index.schedule(); assert.equal(cache.audit().ok, true);
  store.mutate(data => { const s = data.sessions.find(s => s.sessionId === 'S-2'); s.sessionId = 'NEW-SESSION'; });
  assert.equal((await index.search('test')).available, false); await index.running;
  assert.equal(cache.rows().find(row => row.box_id === fixture.boxes[1].boxId).session_id, 'NEW-SESSION');
  store.mutate(data => { data.boxes = data.boxes.filter(b => b.boxId !== fixture.boxes[1].boxId); data.sessions = data.sessions.filter(s => s.boxId !== fixture.boxes[1].boxId); });
  await index.running; assert.equal(cache.rows().length, 1);
});

test('query races abstain and concurrent query requests are bounded', async t => {
  const { store, embedder, index } = setup(t); await index.start();
  let release; const original = embedder.embed.bind(embedder);
  embedder.embed = async text => { if (text === 'paused query') await new Promise(resolve => { release = resolve; }); return original(text); };
  const query = index.search('paused query');
  assert.equal((await index.search('other')).reason, 'embedding_busy');
  store.mutate(data => { data.boxes[0].label = 'Changed label'; });
  release(); assert.equal((await query).available, false); await index.running;
  await index.stop(); assert.equal((await index.search('test')).available, false);
});

test('cache creation refuses an inventory database and listener failures cannot undo commits', t => {
  const dir = mkdtempSync(join(tmpdir(), 'storage-semantic-boundary-'));
  const path = join(dir, 'inventory.sqlite'), store = new Store(path);
  t.after(() => { store.close(); rmSync(dir, { recursive: true, force: true }); });
  store.subscribe(() => { throw new Error('background failure'); });
  store.importLegacy(structuredClone(fixture));
  const before = store.read();
  assert.throws(() => new SemanticCache(path), /non-cache database|Unsupported semantic cache schema/);
  assert.deepEqual(store.read(), before); assert.equal(store.audit().ok, true);
  assert.equal(store.db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name='embeddings'").get().n, 0);
});

test('a box without a session retains valid label retrieval without invented session identifiers', async t => {
  const { store, inventory, index } = setup(t);
  store.mutate(data => { data.boxes.push({ ...fixture.boxes[0], boxId: 'EMPTY', label: 'Empty carton', currentLocationId: 'G-H1-P12-A' }); });
  await index.start(); const result = await index.search('Empty carton');
  assert.equal(result.available, true);
  assert.equal(result.semanticMatches.find(row => row.boxId === 'EMPTY').sessionId, undefined);
  assert.equal(inventory.previewAnswer('Empty carton', result).selectedBoxIds[0], 'EMPTY');
});

test('HTTP semantic preview is management-only, explicitly enabled and preserves public search', async t => {
  const { state, config } = await provider(t); const store = new Store(':memory:'); store.importLegacy(structuredClone(fixture));
  const env = { STORAGE_ADMIN_KEY: 'admin', STORAGE_SEMANTIC_PREVIEW: '1', STORAGE_EMBEDDING_URL: config.baseUrl,
    STORAGE_EMBEDDING_MODEL: config.model, STORAGE_EMBEDDING_REVISION: config.modelRevision, STORAGE_EMBEDDING_DIMENSIONS: '2' };
  const app = createApp({ store, env }); app.listen(0, '127.0.0.1'); await once(app, 'listening');
  t.after(async () => { app.closeAllConnections(); await new Promise(resolve => app.close(resolve)); store.close(); });
  const base = `http://127.0.0.1:${app.address().port}`;
  assert.equal((await fetch(base + '/api/manage/semantic')).status, 401);
  const headers = { 'x-api-key': 'admin', 'content-type': 'application/json' };
  let status;
  for (let i = 0; i < 100; i++) {
    status = await (await fetch(base + '/api/manage/semantic', { headers })).json();
    if (status.state === 'ready') break;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  assert.equal(status.state, 'ready'); assert.equal(status.audit.ok, true);
  assert.equal((await fetch(base + '/api/manage/semantic/preview', { method: 'POST', headers, body: JSON.stringify({ query: 'unlisted device', identityEvidence: [{}], thresholds: { similarity: -1, margin: 0 } }) })).status, 400);
  const preview = await (await fetch(base + '/api/manage/semantic/preview', { method: 'POST', headers, body: JSON.stringify({ query: 'unlisted device' }) })).json();
  assert.equal(preview.retrieval.available, true); assert.equal(preview.decision, 'no_supported_match');
  const count = state.requests.length;
  const publicResult = await (await fetch(base + '/api/public/search?q=solder')).json();
  assert.equal(publicResult.matches[0].boxId, fixture.boxes[0].boxId); assert.equal(state.requests.length, count);
  const disabled = createApp({ store, env: { STORAGE_ADMIN_KEY: 'admin' } }); disabled.listen(0, '127.0.0.1'); await once(disabled, 'listening');
  try {
    const base2 = `http://127.0.0.1:${disabled.address().port}`;
    assert.deepEqual(await (await fetch(base2 + '/api/manage/semantic', { headers })).json(), { enabled: false });
    assert.equal((await fetch(base2 + '/api/manage/semantic/preview', { method: 'POST', headers, body: '{"query":"test"}' })).status, 200);
  } finally { disabled.closeAllConnections(); await new Promise(resolve => disabled.close(resolve)); }
});
