import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store, restore } from '../src/store.js';
import { createApp } from '../src/server.js';
import { fixture } from './fixture.js';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB1sAAAAASUVORK5CYII=', 'base64');

async function setup(t, store = new Store(':memory:')) {
  const app = createApp({ store, env: { STORAGE_ADMIN_KEY: 'admin', STORAGE_API_KEY: 'read' } });
  app.listen(0, '127.0.0.1'); await once(app, 'listening');
  t.after(async () => { app.closeAllConnections(); await new Promise(r => app.close(r)); store.close(); });
  const base = `http://127.0.0.1:${app.address().port}`;
  const view = async () => (await fetch(base + '/api/appearance')).json();
  const put = async (body, key = 'admin') => fetch(base + '/api/manage/appearance', { method: 'PUT', headers: { 'x-api-key': key, 'content-type': 'application/json' }, body: JSON.stringify({ revision: (await view()).revision, ...body }) });
  return { store, base, view, put };
}

test('backgrounds are public to read, management-only to change, and the uploaded image is checked and served', async t => {
  const { store, base, view, put } = await setup(t);
  assert.deepEqual({ ...await view(), revision: undefined }, { uiLanguage: 'en', background: 'hills', imageRevision: null, accent: '#95c200', revision: undefined });
  for (const name of ['hills', 'pegboard', 'blueprint']) {
    const svg = await fetch(`${base}/backgrounds/${name}.svg`); assert.equal(svg.status, 200); assert.equal(svg.headers.get('content-type'), 'image/svg+xml');
  }
  assert.equal((await put({ background: 'pegboard' }, 'read')).status, 401);
  assert.equal((await put({ background: 'sunset' })).status, 400);
  assert.equal((await put({ background: 'custom' })).status, 400);
  assert.equal((await put({ background: 'blueprint' })).status, 200); assert.equal((await view()).background, 'blueprint');
  const stale = await fetch(base + '/api/manage/appearance', { method: 'PUT', headers: { 'x-api-key': 'admin', 'content-type': 'application/json' }, body: JSON.stringify({ revision: 'old', background: 'none' }) });
  assert.equal(stale.status, 409);
  // A file whose bytes do not match its type, or that is too large, changes nothing.
  assert.equal((await put({ image: { mime: 'image/jpeg', data: png.toString('base64') } })).status, 400);
  assert.equal((await put({ image: { mime: 'image/png', data: Buffer.concat([png, Buffer.alloc(5 * 1024 * 1024)]).toString('base64') } })).status, 400);
  assert.equal((await put({ image: { mime: 'image/png', data: 'not base64!' } })).status, 400);
  assert.equal((await fetch(base + '/api/appearance/background-image')).status, 404); assert.equal((await view()).background, 'blueprint');
  // Uploading selects the image.
  assert.equal((await put({ image: { mime: 'image/png', data: png.toString('base64') } })).status, 200);
  const custom = await view(); assert.equal(custom.background, 'custom'); assert.match(custom.imageRevision, /^[a-f0-9]{64}$/);
  const image = await fetch(base + '/api/appearance/background-image'); assert.equal(image.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(await image.arrayBuffer()), png); assert.equal(store.audit().ok, true);
  // Removing the selected image falls back to the default background.
  assert.equal((await put({ clearImage: true })).status, 200);
  assert.deepEqual([(await view()).background, (await view()).imageRevision], ['hills', null]);
  assert.equal((await fetch(base + '/api/appearance/background-image')).status, 404); assert.equal(store.audit().ok, true);
});

test('the accent colour is public to read, checked, saved without touching the background, and resets to the default', async t => {
  const { store, view, put } = await setup(t);
  assert.equal((await put({ accent: '#2fb8ff' }, 'read')).status, 401);
  for (const bad of ['blue', '#2fb8f', '#2fb8ffaa', 'url(x)', 42, '']) assert.equal((await put({ accent: bad })).status, 400, String(bad));
  assert.equal((await put({ background: 'pegboard' })).status, 200);
  assert.equal((await put({ accent: '#2FB8FF' })).status, 200);
  assert.deepEqual([(await view()).accent, (await view()).background], ['#2fb8ff', 'pegboard']);
  assert.equal((await put({ background: 'blueprint' })).status, 200); assert.equal((await view()).accent, '#2fb8ff', 'a background change keeps the accent');
  assert.equal((await put({ accent: null })).status, 200);
  assert.equal((await view()).accent, '#95c200'); assert.equal(store.settings().appearance.accent, undefined);
  assert.throws(() => store.writeSettings({ appearance: { accent: 'red' } }), /accent colour/);
});

test('the overview image is the album cover, management-only, signed and without the photo key', async t => {
  let cover = 'cover-asset';
  const immich = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.url === '/api/albums/album?withoutAssets=true' && req.headers['x-api-key'] === 'photo-key') return res.end(JSON.stringify({ id: 'album', albumName: 'Verkstad', albumThumbnailAssetId: cover }));
    if (req.url === '/api/search/metadata') return res.end(JSON.stringify({ assets: { items: ['cover-asset', 'box-photo'].map(id => ({ id, type: 'IMAGE', originalFileName: `${id}.jpg` })), nextPage: null } }));
    res.writeHead(404); res.end('{}');
  });
  immich.listen(0, '127.0.0.1'); await once(immich, 'listening'); t.after(() => new Promise(r => immich.close(r)));
  const store = new Store(':memory:');
  store.writeSettings({ immich: { provider: 'immich', baseUrl: `http://127.0.0.1:${immich.address().port}`, apiKey: 'photo-key', albumId: 'album' } });
  const { base } = await setup(t, store);
  assert.equal((await fetch(base + '/api/manage/overview', { headers: { 'x-api-key': 'read' } })).status, 401);
  const response = await (await fetch(base + '/api/manage/overview', { headers: { 'x-api-key': 'admin' } })).json();
  assert.equal(response.image.assetId, 'cover-asset'); assert.equal(response.image.albumName, 'Verkstad');
  assert.match(response.image.previewUrl, /^\/api\/album-preview\/cover-asset\?variant=preview&.*grant=/); assert.ok(!JSON.stringify(response).includes('photo-key'));
  // Clickable points are saved per overview image and checked.
  assert.deepEqual(response.points.points, []);
  const putPoints = (body, key = 'admin') => fetch(base + '/api/manage/overview/points', { method: 'PUT', headers: { 'x-api-key': key, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const point = { yaw: -42.5, pitch: 3.25, unit: 'cabinet-3' };
  assert.equal((await putPoints({ assetId: 'cover-asset', revision: response.points.revision, points: [point] }, 'read')).status, 401);
  for (const bad of [{ ...point, yaw: 181 }, { ...point, pitch: Number.NaN }, { ...point, unit: 'Not A Slug' }, { ...point, extra: 1 }]) {
    assert.equal((await putPoints({ assetId: 'cover-asset', revision: response.points.revision, points: [bad] })).status, 400);
  }
  const saved = await (await putPoints({ assetId: 'cover-asset', revision: response.points.revision, points: [point] })).json();
  assert.deepEqual(saved.points, [point]);
  assert.equal((await putPoints({ assetId: 'cover-asset', revision: response.points.revision, points: [] })).status, 409);
  assert.deepEqual((await (await fetch(base + '/api/manage/overview', { headers: { 'x-api-key': 'admin' } })).json()).points.points, [point]);
  assert.deepEqual(store.settings().overviewPoints, { 'cover-asset': [point] }); assert.equal(store.audit().ok, true);
  // A new cover is offered the previous image's points until its own are saved, even when empty.
  cover = 'new-cover';
  const offered = (await (await fetch(base + '/api/manage/overview', { headers: { 'x-api-key': 'admin' } })).json()).points;
  assert.deepEqual([offered.copiedFrom, offered.points], ['cover-asset', [point]]);
  assert.equal((await putPoints({ assetId: 'new-cover', revision: offered.revision, points: [] })).status, 200);
  const own = (await (await fetch(base + '/api/manage/overview', { headers: { 'x-api-key': 'admin' } })).json()).points;
  assert.deepEqual([own.copiedFrom, own.points], [undefined, []]);
  assert.deepEqual(store.settings().overviewPoints['cover-asset'], [point], 'the old image keeps its points');
  cover = 'cover-asset';
  // The album inbox and photo choices leave the cover out, unless a box already uses it.
  const albumIds = async () => (await (await fetch(base + '/api/manage/album?refresh=true', { headers: { 'x-api-key': 'admin' } })).json()).assets.map(a => a.id);
  assert.deepEqual(await albumIds(), ['box-photo']);
  store.transaction(() => store.insert({ boxes: [{ boxId: 'B', label: 'Box', currentLocationId: 'A-H1-P1-A' }],
    sessions: [{ sessionId: 'S', boxId: 'B', isCurrent: true, createdAt: new Date().toISOString(), summary: '', itemKeywords: [] }],
    photos: [{ photoId: 'S:1', sessionId: 'S', immichAssetId: 'cover-asset', photoRole: 'location' }] }));
  assert.deepEqual(await albumIds(), ['cover-asset', 'box-photo']);
  cover = null;
  assert.deepEqual(await (await fetch(base + '/api/manage/overview', { headers: { 'x-api-key': 'admin' } })).json(), { image: null });
});

test('the background image survives migration from schema 2, backup and restore; the audit finds a damaged image', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'storage-appearance-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const old = new Store(join(dir, 'old.sqlite')); old.importLegacy(structuredClone(fixture)); const before = old.read();
  old.db.exec('DROP TABLE media; PRAGMA user_version = 2'); old.close();
  const store = new Store(join(dir, 'old.sqlite'));
  try {
    assert.equal(store.audit().schemaVersion, 3); assert.deepEqual(store.read(), before);
    store.transaction(() => { store.setMedia('background', 'image/png', png); store.writeSettings({ appearance: { background: 'custom' } }); });
    await store.backup(join(dir, 'backup.sqlite')); await restore(join(dir, 'backup.sqlite'), join(dir, 'restored.sqlite'));
    const restored = new Store(join(dir, 'restored.sqlite'));
    try { assert.deepEqual(restored.media('background').data, png); assert.equal(restored.audit().ok, true); } finally { restored.close(); }
    store.db.prepare("UPDATE media SET data = zeroblob(8) WHERE id = 'background'").run();
    assert.equal(store.audit().ok, false);
    store.db.exec("DELETE FROM media"); assert.match(store.audit().errors.join(' '), /custom background has no image/);
  } finally { store.close(); }
});
