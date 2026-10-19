// Active integration acceptance using the selected test album and an in-memory inventory.
// Load IMMICH_API_KEY from the environment. This script never needs the user's password.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { spawnSync } from 'node:child_process';
import { Store } from '../src/store.js';
import { createApp } from '../src/server.js';

const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const configuredBase = option('--base-url', 'http://localhost:3210');
const container = option('--container', '');
const hold = args.includes('--hold');
const admin = process.env.STORAGE_ADMIN_KEY;
const sourceKey = process.env.IMMICH_API_KEY;
let store; let server;

try {
  if (!admin || !sourceKey) throw new Error('STORAGE_ADMIN_KEY and IMMICH_API_KEY must be set.');
  const response = await fetch(`${configuredBase}/api/manage/settings`, { headers: { 'x-api-key': admin }, signal: AbortSignal.timeout(10000) });
  assert.equal(response.status, 200, 'Configured development instance must expose settings to its management key.');
  const settings = await response.json(); const source = settings.photoSource;
  assert.equal(source.provider, 'immich'); assert.equal(source.accessMode, 'apiKey');
  assert.ok(source.baseUrl && source.albumId && source.apiKeyConfigured, 'Configure the test album in development Settings first.');
  if (container) {
    const code = "import { readFileSync } from 'node:fs'; import { Store } from './src/store.js'; const s=new Store(process.env.STORAGE_DB,{readOnly:true}); try { const matches=s.settings().immich?.apiKey===readFileSync(0,'utf8'); console.log(matches?'MATCH':'DIFFERENT'); process.exitCode=matches?0:1; } finally{s.close();}";
    const check = spawnSync('docker', ['exec', '-i', container, 'node', '--input-type=module', '-e', code], { input: sourceKey, encoding: 'utf8', timeout: 15000 });
    assert.equal(check.status, 0, 'The configured runtime key must match the supplied environment key.');
    assert.equal(check.stdout.trim(), 'MATCH');
    console.log('PASS: central key and configured runtime key MATCH.');
  }
  const deployedAlbum = await fetch(`${configuredBase}/api/manage/album?refresh=true`, { headers: { 'x-api-key': admin }, signal: AbortSignal.timeout(30000) });
  assert.equal(deployedAlbum.status, 200, 'The running development instance must read the configured album.');
  const deployedCatalog = await deployedAlbum.json(); assert.ok(deployedCatalog.assets.length > 0);
  const deployedPreview = await fetch(new URL(deployedCatalog.assets[0].thumbnailUrl, configuredBase), { signal: AbortSignal.timeout(20000) });
  assert.equal(deployedPreview.status, 200); assert.match(deployedPreview.headers.get('content-type'), /^image\//);
  assert.ok((await deployedPreview.arrayBuffer()).byteLength > 0);
  console.log('PASS: running development instance reads the live album and serves a signed preview.');
  store = new Store(':memory:');
  store.writeSettings({ immich: { provider: 'immich', baseUrl: source.baseUrl, accessMode: 'apiKey', apiKey: sourceKey, albumId: source.albumId } });
  const env = { STORAGE_ADMIN_KEY: 'isolated-admin-fixture', STORAGE_API_KEY: randomUUID() };
  server = createApp({ store, env });
  server.listen(hold ? Number(option('--port', 3214)) : 0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`; env.APP_BASE_URL = base;
  const request = async (path, { key = env.STORAGE_ADMIN_KEY, body } = {}) => {
    const result = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { 'x-api-key': key, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000) });
    assert.equal(result.status, 200, `HTTP acceptance failed at ${path.split('?')[0]}.`);
    return result.json();
  };
  const albums = await request('/api/manage/albums');
  assert.ok(albums.albums.some(a => a.id === source.albumId), 'The selected album must be visible to the dedicated account.');
  const album = await request('/api/manage/album?refresh=true');
  assert.ok(album.assets.length > 0, 'The selected album must contain images.');
  console.log(`PASS: dedicated account can list the selected album and read ${album.assets.length} images.`);
  const preview = await fetch(base + album.assets[0].thumbnailUrl, { signal: AbortSignal.timeout(20000) });
  assert.equal(preview.status, 200); assert.match(preview.headers.get('content-type'), /^image\//);
  assert.ok((await preview.arrayBuffer()).byteLength > 0);
  const keyword = 'immich-acceptance-fixture';
  const photos = album.assets.slice(0, 3).map((asset, index) => ({ immichAssetId: asset.id, photoRole: ['inside', 'label', 'location'][index] }));
  const saved = await request('/api/manage/session', { body: {
    box: { boxId: 'LIVE-IMMICH-TEST', label: 'Temporary Immich acceptance fixture', currentLocationId: 'A-H1-P1-A' },
    session: { boxId: 'LIVE-IMMICH-TEST', summary: 'Live photo-source acceptance, isolated inventory only.', itemKeywords: [keyword] },
    photos, photoSourceRevision: album.sourceRevision
  } });
  assert.equal(saved.photos.length, photos.length); assert.ok(saved.photos.every(p => p.originalFileName));
  const read = await request(`/api/public/search?q=${keyword}`, { key: env.STORAGE_API_KEY });
  assert.equal(read.count, 1); assert.equal(read.matches[0].boxId, saved.boxId);
  const box = await request('/api/public/boxes/LIVE-IMMICH-TEST', { key: env.STORAGE_API_KEY });
  for (const variant of ['thumbnailUrl', 'originalUrl']) {
    const image = await fetch(box.photos[0][variant], { signal: AbortSignal.timeout(25000) });
    assert.equal(image.status, 200); assert.match(image.headers.get('content-type'), /^image\//);
    assert.ok((await image.arrayBuffer()).byteLength > 0);
  }
  console.log('PASS: album preview, validated session attachment, REST search/detail and signed thumbnail/original retrieval.');
  for (const [name, arguments_] of [
    ['search_inventory', { query: keyword }], ['get_box', { box_id: saved.boxId }], ['get_box_photo', { box_id: saved.boxId }]
  ]) {
    const reply = await request('/api/mcp', { key: env.STORAGE_API_KEY, body: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: arguments_ } } });
    assert.ok(reply.result && !reply.result.isError, `${name} must succeed.`);
    if (name === 'get_box_photo') assert.equal(reply.result.content[0].type, 'image');
  }
  assert.equal(store.audit().ok, true);
  console.log('PASS: live MCP search/get_box/get_box_photo and data integrity audit.');
  console.log('Scope: only the test album is read. Acceptance inventory and credentials are in memory; development inventory is unchanged.');
  if (hold) {
    console.log(`Browser acceptance instance: ${base}; management key: isolated-admin-fixture`);
    console.log('Stop with Ctrl+C to discard the isolated inventory.');
    await new Promise(resolve => { process.once('SIGINT', resolve); process.once('SIGTERM', resolve); });
  }
} catch (error) {
  // Do not emit provider bodies, filenames, key values or arbitrary native error details.
  console.error('FAIL: Immich acceptance did not complete.', error instanceof assert.AssertionError ? error.message : error.name);
  process.exitCode = 1;
} finally {
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  store?.close();
}
