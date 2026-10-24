import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { Store } from '../src/store.js';
import { createApp } from '../src/server.js';
import { fixture } from './fixture.js';

async function setup(t, env) {
  const store = new Store(':memory:'); store.importLegacy(structuredClone(fixture));
  const app = createApp({ store, env: { STORAGE_ADMIN_KEY: 'admin', ...env } });
  app.listen(0, '127.0.0.1'); await once(app, 'listening');
  t.after(async () => { app.closeAllConnections(); await new Promise(r => app.close(r)); store.close(); });
  const base = `http://127.0.0.1:${app.address().port}`;
  const view = async () => (await fetch(base + '/api/manage/security', { headers: { 'x-api-key': 'admin' } })).json();
  const put = async body => fetch(base + '/api/manage/security', { method: 'PUT', headers: { 'x-api-key': 'admin', 'content-type': 'application/json' }, body: JSON.stringify({ revision: (await view()).revision, ...body }) });
  const health = key => fetch(base + '/api/public/health', { headers: key ? { 'x-api-key': key } : {} }).then(r => r.status);
  return { store, base, view, put, health };
}

test('the public API key can be set, replaced and removed in the interface, and is never returned', async t => {
  const { store, base, view, put, health } = await setup(t, { STORAGE_API_KEY: 'environment-key' });
  assert.equal((await fetch(base + '/api/manage/security', { headers: { 'x-api-key': 'environment-key' } })).status, 401);
  assert.equal((await view()).publicKeySource, 'environment'); assert.equal(await health('environment-key'), 200);
  for (const bad of ['short', 'has spaces in the middle of it', 'x'.repeat(201)]) assert.equal((await put({ publicApiKey: bad })).status, 400);
  const stale = await fetch(base + '/api/manage/security', { method: 'PUT', headers: { 'x-api-key': 'admin', 'content-type': 'application/json' }, body: JSON.stringify({ revision: 'old', publicApiKey: 'a-new-key-of-enough-length' }) });
  assert.equal(stale.status, 409);
  // A saved key replaces the environment key at once.
  const saved = await (await put({ publicApiKey: 'a-new-key-of-enough-length' })).json();
  assert.equal(saved.publicKeySource, 'settings'); assert.ok(!JSON.stringify(saved).includes('a-new-key'));
  assert.equal(await health('a-new-key-of-enough-length'), 200); assert.equal(await health('environment-key'), 401);
  assert.equal(await health('admin'), 401);
  // Removing it falls back to the environment key.
  assert.equal((await (await put({ clearPublicApiKey: true })).json()).publicKeySource, 'environment');
  assert.equal(await health('environment-key'), 200); assert.equal(store.audit().ok, true);
});

test('the public base URL is checked, and APP_BASE_URL on the server takes precedence', async t => {
  const plain = await setup(t, {});
  assert.equal((await plain.view()).publicKeySource, 'none');
  for (const bad of ['not a url', 'ftp://example.com', 'https://user:pass@example.com', 'https://example.com/?x=1']) assert.equal((await plain.put({ appBaseUrl: bad })).status, 400);
  assert.equal((await (await plain.put({ appBaseUrl: 'https://storage.example.com/' })).json()).appBaseUrl, 'https://storage.example.com');
  const pinned = await setup(t, { APP_BASE_URL: 'http://localhost:3210' });
  const state = await pinned.view();
  assert.equal(state.appBaseUrlFromEnvironment, true); assert.equal(state.environmentBaseUrl, 'http://localhost:3210');
});
