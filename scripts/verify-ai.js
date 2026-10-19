// Explicit live acceptance: sends one selected test-album preview image to the configured AI service.
// Requires IMMICH_API_KEY, STORAGE_ADMIN_KEY, AI_TEST_MODEL and provider credentials in the environment.
// Inventory is isolated in memory. --configure-development copies only the verified AI setup to the local preview.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { Store } from '../src/store.js';
import { createApp } from '../src/server.js';

const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const configuredBase = option('--base-url', 'http://localhost:3210');
let store; let app;
try {
  for (const name of ['IMMICH_API_KEY', 'STORAGE_ADMIN_KEY', 'AI_TEST_MODEL']) assert.ok(process.env[name], `${name} must be set.`);
  const provider = option('--provider', 'openrouter');
  assert.ok(['openrouter', 'compatible', 'llamacpp'].includes(provider), 'Choose openrouter, llamacpp or compatible.');
  const apiKey = provider === 'openrouter' ? process.env.OPENROUTER_API_KEY : process.env.AI_API_KEY;
  if (provider === 'openrouter') assert.ok(apiKey, 'OPENROUTER_API_KEY must be set.');
  if (provider !== 'openrouter') assert.ok(process.env.AI_BASE_URL, 'AI_BASE_URL must be set.');
  const remote = async (base, key, path, input, method = 'POST') => {
    const r = await fetch(base + '/api/manage/' + path, { method: input === undefined ? 'GET' : method, headers: { 'x-api-key': key, 'content-type': 'application/json' }, body: input === undefined ? undefined : JSON.stringify(input), signal: AbortSignal.timeout(120000) });
    const payload = await r.json();
    assert.equal(r.status, 200, `Live acceptance HTTP ${r.status} at ${path}${typeof payload.error === 'string' ? ': ' + payload.error : '.'}`); return payload;
  };
  const dev = (path, input, method) => remote(configuredBase, process.env.STORAGE_ADMIN_KEY, path, input, method);
  const source = (await dev('settings')).photoSource;
  assert.equal(source.provider, 'immich'); assert.ok(source.baseUrl && source.albumId);
  store = new Store(':memory:');
  store.writeSettings({ appearance: { language: 'sv' }, immich: { provider: 'immich', baseUrl: source.baseUrl, albumId: source.albumId, apiKey: process.env.IMMICH_API_KEY, accessMode: 'apiKey' } });
  const env = { STORAGE_ADMIN_KEY: 'isolated-admin-fixture', STORAGE_API_KEY: 'isolated-read-fixture' };
  app = createApp({ store, env }); app.listen(args.includes('--hold') ? Number(option('--port', 3214)) : 0, '127.0.0.1'); await once(app, 'listening');
  const base = `http://127.0.0.1:${app.address().port}`; env.APP_BASE_URL = base;
  const local = (path, input, method) => remote(base, env.STORAGE_ADMIN_KEY, path, input, method);
  const connection = { id: option('--connection-id', provider), name: option('--connection-name', provider === 'openrouter' ? 'Storage System · OpenRouter' : 'Local image AI'), provider, baseUrl: provider === 'openrouter' ? 'https://openrouter.ai/api/v1' : process.env.AI_BASE_URL, ...(apiKey ? { apiKey } : {}) };
  const task = { connectionId: connection.id, model: process.env.AI_TEST_MODEL, language: 'sv', extraInstructions: '' };
  const state = await local('ai/settings', { revision: (await local('ai/settings')).revision, connections: [connection], imageInventory: task }, 'PUT');
  if (apiKey) assert.ok(!JSON.stringify(state).includes(apiKey));
  const models = await local('ai/models', { revision: state.revision, connectionId: connection.id });
  assert.ok(models.models.some(m => m.id === task.model && m.imageInput !== false), 'The selected model must be listed and not explicitly text-only.');
  console.log('PASS: saved AI settings redact the key; service responds and lists the selected model. Image support will be verified by the preview.');
  const album = await local('album?refresh=true'); assert.ok(album.assets.length);
  const batch = args.includes('--box-draft');
  let input;
  if (batch) {
    const selected = JSON.parse(process.env.AI_TEST_PHOTOS || '[]');
    assert.ok(Array.isArray(selected) && selected.length > 0, 'Supply AI_TEST_PHOTOS as a JSON array of fileName/role pairs.');
    input = { photos: selected.map(photo => {
      const matches = album.assets.filter(a => a.fileName === photo.fileName);
      assert.equal(matches.length, 1, 'Each selected filename must match exactly one album image.');
      return { assetId: matches[0].id, role: photo.role };
    }) };
  } else {
    const asset = album.assets[Number(option('--asset-index', 0))]; assert.ok(asset); input = { assetId: asset.id, role: 'auto' };
  }
  const preview = await local(batch ? 'ai/draft' : 'ai/preview', { revision: state.revision, sourceRevision: album.sourceRevision, ...input });
  assert.equal(preview.saved, false); assert.equal(preview.language, 'sv'); assert.ok(preview.result.summary.trim()); assert.ok(Array.isArray(preview.result.keywords));
  if (batch) {
    assert.deepEqual(preview.result.photos.map(p => p.assetId), input.photos.map(p => p.assetId));
    input.photos.forEach((p, i) => { if (p.role !== 'auto') assert.equal(preview.result.photos[i].role, p.role); });
  }
  assert.equal(store.read().sessions.length, 0); assert.equal(store.audit().ok, true);
  console.log(`PASS: ${batch ? input.photos.length : 1} live album previews analyzed with ${task.model}; valid Swedish draft in ${preview.elapsedMs} ms; no inventory writes; integrity audit passed.`);
  if (args.includes('--configure-development')) {
    const before = await dev('audit'); const current = await dev('ai/settings');
    const connections = current.connections.filter(c => c.id !== connection.id).map(({ apiKeyConfigured, lastTest, ...c }) => c); connections.push(connection);
    await dev('ai/settings', { revision: current.revision, connections, imageInventory: task }, 'PUT');
    const after = await dev('audit'); assert.deepEqual(after.counts, before.counts); assert.equal(after.ok, true);
    console.log('PASS: verified AI connection/model saved to the development preview; inventory counts unchanged.');
  }
  if (args.includes('--hold')) {
    console.log(`Live browser acceptance: ${base}; management key: isolated-admin-fixture`);
    await new Promise(resolve => { process.once('SIGINT', resolve); process.once('SIGTERM', resolve); });
  }
} catch (error) {
  console.error('FAIL: live AI acceptance did not complete.', error instanceof assert.AssertionError ? error.message : error.name);
  process.exitCode = 1;
} finally {
  if (app) { app.closeAllConnections(); await new Promise(resolve => app.close(resolve)); }
  store?.close();
}
