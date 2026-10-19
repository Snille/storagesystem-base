import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { Store } from '../src/store.js';
import { createApp } from '../src/server.js';
import { fixture } from './fixture.js';

async function setup(t, { populated = true, settings = {}, env = {} } = {}) {
  const store = new Store(':memory:');
  if (populated) store.importLegacy(fixture, { appearance: { language: 'sv' }, ...settings });
  const server = createApp({ store, env: { STORAGE_ADMIN_KEY: 'admin-test-key', STORAGE_API_KEY: 'public-test-key', ...env } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { server.closeAllConnections(); await new Promise(r => server.close(r)); store.close(); });
  const request = (path, options = {}) => fetch(base + path, { ...options, headers: { 'x-api-key': path.startsWith('/api/manage/') ? 'admin-test-key' : 'public-test-key', ...options.headers } });
  const rpc = (method, args = {}, id = 1) => request('/api/mcp', { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id, method, params: args }) }).then(r => r.json());
  return { store, base, request, rpc };
}

test('REST contract: health, auth precedence, search languages, ask fallback, missing box', async t => {
  const { base, request } = await setup(t);
  assert.equal((await fetch(base + '/api/public/health')).status, 401);
  const wrongMethod = await fetch(base + '/api/public/health', { method: 'DELETE' });
  assert.equal(wrongMethod.status, 405); assert.equal(wrongMethod.headers.get('allow'), 'GET');
  for (const suffix of ['', '?key=public-test-key']) {
    const headers = suffix ? {} : { authorization: 'Bearer public-test-key' };
    const response = await fetch(base + '/api/public/health' + suffix, { headers });
    const health = await response.json(); assert.equal(health.ok, true); assert.equal(health.service, 'lagersystem'); assert.ok(Date.parse(health.date));
  }
  const search = await (await request('/api/public/search?q=lodtenn&limit=5')).json();
  assert.equal(search.count, 1); const box = search.matches[0];
  assert.equal(box.boxId, 'IVAR-G-H6-P1-A'); assert.equal(box.sessionId, 'S-1');
  assert.deepEqual(box.location, { system: 'Lagerhylla: G', shelf: 'Hylla 6', slot: 'Plats: 1A' });
  for (const field of ['label', 'locationId', 'summary', 'itemKeywords', 'photos']) assert.ok(field in box);
  const en = await (await request('/api/public/search?q=solder&lang=en')).json();
  assert.deepEqual(en.matches[0].location, { system: 'Shelving unit: G', shelf: 'Shelf 6', slot: 'Slot: 1A' });
  const ask = await (await request('/api/public/ask', { method: 'POST', body: JSON.stringify({ query: 'skruv' }) })).json();
  assert.equal(ask.source, 'search'); assert.equal(ask.count, 1); assert.equal(ask.answer, 'Träskruvar finns i Bänk: 2, Yta: Under, Plats: 1A.');
  assert.equal((await request('/api/public/boxes/NOPE')).status, 404);
  const detail = await (await request('/api/public/boxes/IVAR-G-H6-P1-A')).json(); assert.equal(detail.sessionId, 'S-1');
  assert.equal((await request('/api/public/search')).status, 400);
  assert.equal((await request('/api/public/ask', { method: 'POST', body: '{broken' })).status, 400);
});

test('cover selection is management-only, restricted to current box photos and shared with REST without changing history or MCP photos', async t => {
  const { store, request, rpc } = await setup(t); const id = 'IVAR-G-H6-P1-A'; const path = `/api/manage/boxes/${id}/cover`;
  const initial = await (await request(`/api/public/boxes/${id}`)).json(); assert.equal(initial.coverAssetId, 'asset-inside'); assert.equal(initial.coverIsAutomatic, true);
  const counts = store.audit().counts;
  const put = assetId => request(path, { method: 'PUT', body: JSON.stringify({ assetId }) });
  assert.equal((await request(path, { method: 'PUT', headers: { 'x-api-key': 'public-test-key' }, body: '{"assetId":"asset-label"}' })).status, 401);
  assert.equal((await put('old-photo')).status, 409); assert.equal((await put('unknown')).status, 409);
  const chosen = await (await put('asset-label')).json(); assert.equal(chosen.coverAssetId, 'asset-label'); assert.equal(chosen.coverIsAutomatic, false);
  const search = await (await request('/api/public/search?q=solder')).json(); assert.equal(search.matches[0].coverAssetId, 'asset-label');
  const mcp = await rpc('tools/call', { name: 'get_box', arguments: { box_id: id } }); assert.deepEqual(mcp.result.structuredContent.photos.map(p => p.photoId), ['S-1:1', 'S-1:2']);
  assert.equal(store.read().boxes.find(b => b.boxId === id).coverAssetId, 'asset-label'); assert.deepEqual(store.audit().counts, counts);
  const reset = await (await put(null)).json(); assert.equal(reset.coverAssetId, 'asset-inside'); assert.equal(reset.coverIsAutomatic, true);
});

test('management is separate from public keys and rejects cross-origin mutations', async t => {
  const { base, request } = await setup(t);
  assert.equal((await fetch(base + '/api/manage/export', { headers: { 'x-api-key': 'public-test-key' } })).status, 401);
  assert.equal((await fetch(base + '/api/manage/export?key=admin-test-key')).status, 401);
  assert.equal((await request('/api/manage/session', { method: 'POST', headers: { origin: 'https://other.test' }, body: '{}' })).status, 403);
  const before = await (await request('/api/manage/export')).json();
  assert.equal((await request('/api/manage/import', { method: 'POST', body: JSON.stringify(fixture) })).status, 409);
  assert.deepEqual(await (await request('/api/manage/export')).json(), before);
  const backup = await request('/api/manage/backup'); assert.equal(backup.status, 200);
  assert.equal(Buffer.from(await backup.arrayBuffer()).subarray(0, 15).toString(), 'SQLite format 3');
  assert.equal((await (await request('/api/manage/audit')).json()).ok, true);
});

test('public read access can be open while management stays disabled by default', async t => {
  const { base } = await setup(t, { env: { STORAGE_API_KEY: '', STORAGE_ADMIN_KEY: '' } });
  assert.equal((await fetch(base + '/api/public/health')).status, 200);
  assert.equal((await fetch(base + '/api/manage/boxes')).status, 503);
});

test('HTTP session writes persist and search is shared between management, REST and MCP', async t => {
  const { request, rpc } = await setup(t, { populated: false });
  const payload = { box: { boxId: 'box-1', label: 'Fasteners', currentLocationId: 'CABINET:A:H1:P2' }, session: { boxId: 'box-1', summary: 'M3 screws', itemKeywords: ['bolts'] } };
  const response = await request('/api/manage/session', { method: 'POST', body: JSON.stringify(payload) }); assert.equal(response.status, 200);
  const rest = await (await request('/api/public/search?q=bolts')).json();
  const ui = await (await request('/api/manage/search?q=bolts')).json();
  const mcp = await rpc('tools/call', { name: 'search_inventory', arguments: { query: 'bolts' } });
  assert.equal(rest.matches[0].boxId, 'box-1'); assert.deepEqual(ui, rest);
  assert.equal(mcp.result.structuredContent.matches[0].boxId, rest.matches[0].boxId);
  await request('/api/manage/session', { method: 'POST', body: JSON.stringify(payload) });
  const history = await (await request('/api/manage/history/box-1')).json(); assert.equal(history.sessions.length, 2);
});

test('MCP initialize, batch, notifications, errors and all five read-only tools', async t => {
  const { rpc, request } = await setup(t);
  const initialized = await rpc('initialize', { protocolVersion: '2025-06-18' });
  assert.equal(initialized.result.protocolVersion, '2025-06-18');
  assert.equal(initialized.result.serverInfo.name, 'storagesystem');
  const names = (await rpc('tools/list')).result.tools.map(tool => tool.name);
  assert.deepEqual(names, ['search_inventory', 'get_box', 'list_locations', 'list_boxes_at_location', 'get_box_photo']);
  const box = await rpc('tools/call', { name: 'get_box', arguments: { box_id: 'IVAR-G-H6-P1-A' } });
  assert.equal(box.result.structuredContent.photos[0].role, 'label'); assert.ok(!JSON.stringify(box).includes('public-test-key'));
  assert.ok(!JSON.stringify(box).includes('thumbnailUrl'));
  const locations = (await rpc('tools/call', { name: 'list_locations' })).result.structuredContent;
  assert.equal(locations.count, 2); assert.ok(locations.locations.some(l => l.location === 'g'));
  const at = await rpc('tools/call', { name: 'list_boxes_at_location', arguments: { location: 'g' } }); assert.equal(at.result.structuredContent.boxes[0].boxId, 'IVAR-G-H6-P1-A');
  const missing = await rpc('tools/call', { name: 'get_box', arguments: { box_id: 'missing' } }); assert.equal(missing.result.isError, true);
  const invalid = await rpc('tools/call', { name: 'search_inventory', arguments: { query: 'solder', limit: 100 } }); assert.equal(invalid.result.isError, true);
  const photo = await rpc('tools/call', { name: 'get_box_photo', arguments: { box_id: 'IVAR-G-H6-P1-A' } }); assert.equal(photo.result.isError, true);
  assert.equal((await rpc('unknown')).error.code, -32601);
  assert.equal((await request('/api/mcp')).status, 405);
  assert.equal((await request('/api/mcp', { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) })).status, 202);
  const batch = await (await request('/api/mcp', { method: 'POST', body: JSON.stringify([{ jsonrpc: '2.0', id: 1, method: 'ping' }, { jsonrpc: '2.0', method: 'notifications/initialized' }]) })).json(); assert.equal(batch.length, 1);
  const malformed = await request('/api/mcp', { method: 'POST', body: '{bad' }); assert.equal(malformed.status, 400); assert.equal((await malformed.json()).error.code, -32700);
});

test('signed photo URLs work without API headers, bind asset and variant, and never leak keys', async t => {
  const calls = [];
  const upstream = createServer((req, res) => {
    calls.push({ url: req.url, key: req.headers['x-api-key'] });
    res.writeHead(200, { 'Content-Type': 'image/png' }); res.end(Buffer.from('fixture-png'));
  });
  upstream.listen(0, '127.0.0.1'); await once(upstream, 'listening');
  t.after(async () => { upstream.closeAllConnections(); await new Promise(r => upstream.close(r)); });
  const { base, request, rpc } = await setup(t, { settings: { immich: { provider: 'immich', baseUrl: `http://127.0.0.1:${upstream.address().port}`, apiKey: 'upstream-test-key' } } });
  const box = await (await request('/api/public/boxes/IVAR-G-H6-P1-A')).json(); const photo = box.photos[0];
  assert.match(photo.thumbnailUrl, /\?sig=/); assert.ok(!photo.thumbnailUrl.includes('public-test-key'));
  const response = await fetch(base + photo.thumbnailUrl); assert.equal(response.status, 200); assert.equal(await response.text(), 'fixture-png');
  assert.equal(calls[0].key, 'upstream-test-key'); assert.match(calls[0].url, /thumbnail\?size=thumbnail/);
  const preview = await fetch(base + photo.previewUrl);
  assert.equal(preview.status, 200); assert.equal(await preview.text(), 'fixture-png');
  assert.equal(calls.at(-1).key, 'upstream-test-key'); assert.match(calls.at(-1).url, /thumbnail\?size=preview/);
  assert.equal((await fetch(base + photo.thumbnailUrl.replace('/thumbnail?', '/preview?'))).status, 401);
  assert.equal((await fetch(base + photo.previewUrl.replace('/preview?', '/original?'))).status, 401);
  assert.equal((await fetch(base + photo.thumbnailUrl.replace('asset-label', 'asset-inside'))).status, 401);
  assert.equal((await fetch(base + photo.thumbnailUrl.replace('/thumbnail?', '/original?'))).status, 401);
  const image = await rpc('tools/call', { name: 'get_box_photo', arguments: { box_id: box.boxId } });
  assert.equal(image.result.content[0].type, 'image'); assert.equal(image.result.content[0].mimeType, 'image/png');
  assert.match(calls.at(-1).url, /asset-inside/);
});

test('configured external base URL is used for HA images', async t => {
  const { request } = await setup(t, { env: { APP_BASE_URL: 'https://storage.example.test/' } });
  const box = await (await request('/api/public/boxes/IVAR-G-H6-P1-A')).json();
  assert.ok(box.photos[0].thumbnailUrl.startsWith('https://storage.example.test/api/public/'));
});
