import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { Store } from '../src/store.js';
import { createApp } from '../src/server.js';
import { fixture } from './fixture.js';

const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB1sAAAAASUVORK5CYII=', 'base64');

async function setup(t, respond) {
  const calls = [];
  const upstream = createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : undefined;
    calls.push({ method: req.method, url: req.url, headers: req.headers, body });
    respond(req, res, body);
  });
  upstream.listen(0, '127.0.0.1'); await once(upstream, 'listening');
  const source = `http://127.0.0.1:${upstream.address().port}`;
  const store = new Store(':memory:');
  const app = createApp({ store, env: { STORAGE_ADMIN_KEY: 'admin-fixture', STORAGE_API_KEY: 'read-fixture' } });
  app.listen(0, '127.0.0.1'); await once(app, 'listening');
  const base = `http://127.0.0.1:${app.address().port}`;
  t.after(async () => {
    app.closeAllConnections(); upstream.closeAllConnections();
    await Promise.all([new Promise(r => app.close(r)), new Promise(r => upstream.close(r))]); store.close();
  });
  const request = (path, { method = 'GET', payload, key = 'admin-fixture' } = {}) => fetch(base + path, {
    method, headers: { 'x-api-key': key, 'content-type': 'application/json' }, body: payload === undefined ? undefined : JSON.stringify(payload)
  });
  const getSettings = () => request('/api/manage/settings').then(r => r.json());
  const saveSettings = async (photoSource, appearance) => {
    const current = await getSettings();
    return request('/api/manage/settings', { method: 'PUT', payload: { sourceRevision: current.sourceRevision, photoSource, ...(appearance ? { appearance } : {}) } });
  };
  const configure = async (extra = {}) => {
    const response = await saveSettings({ provider: 'immich', baseUrl: source, accessMode: 'apiKey', apiKey: 'upstream-fixture-key', albumId: 'album-1', ...extra });
    assert.equal(response.status, 200); return response.json();
  };
  return { store, source, base, request, getSettings, saveSettings, configure, calls };
}

function respond(req, res, body) {
  res.setHeader('content-type', 'application/json');
  if (req.url === '/api/albums') return res.end(JSON.stringify([{ id: 'album-1', albumName: 'Fixture album', assetCount: 2 }]));
  if (req.url === '/api/search/metadata') return res.end(JSON.stringify({ assets: {
    items: body.page === 1 ? [{ id: 'asset-1', originalFileName: 'screws.png', type: 'IMAGE', fileCreatedAt: '2026-01-01T00:00:00Z' }, { id: 'video', type: 'VIDEO' }]
      : [{ id: 'asset-2', originalFileName: 'label.png', type: 'IMAGE', fileCreatedAt: '2026-01-02T00:00:00Z' }],
    nextPage: body.page === 1 ? '2' : null
  } }));
  if (req.url.startsWith('/api/assets/')) { res.setHeader('content-type', 'image/png'); return res.end(image); }
  res.writeHead(404); res.end('{}');
}

test('settings are admin-only, redact credentials, preserve unrelated configuration and reject stale edits', async t => {
  const ctx = await setup(t, respond);
  ctx.store.writeSettings({ ai: { provider: 'openai', openai: { apiKey: 'unrelated-private-key' } }, security: { publicApiKey: 'read-fixture' } });
  const stale = await ctx.getSettings(); const initial = await ctx.configure();
  assert.equal(initial.photoSource.apiKeyConfigured, true); assert.equal(initial.photoSource.apiKey, undefined);
  assert.ok(!JSON.stringify(initial).includes('upstream-fixture-key')); assert.ok(!JSON.stringify(initial).includes('unrelated-private-key'));
  assert.equal((await ctx.request('/api/manage/settings', { key: 'read-fixture' })).status, 401);
  assert.equal((await ctx.saveSettings({ apiKey: '' }, { language: 'sv' })).status, 200);
  assert.equal(ctx.store.settings().immich.apiKey, 'upstream-fixture-key');
  assert.equal(ctx.store.settings().appearance.language, 'sv');
  assert.equal(ctx.store.settings().ai.openai.apiKey, 'unrelated-private-key');
  assert.equal((await ctx.request('/api/manage/settings', { method: 'PUT', payload: { sourceRevision: stale.sourceRevision, photoSource: {} } })).status, 409);
  assert.equal((await ctx.saveSettings({ baseUrl: 'file:///not-allowed' })).status, 400);
  const changed = await ctx.saveSettings({ baseUrl: 'http://127.0.0.1:1', apiKey: '' });
  assert.equal(changed.status, 200); assert.equal(ctx.store.settings().immich.apiKey, undefined); assert.equal(ctx.store.settings().immich.albumId, '');
});

test('source switches are rejected when photos exist; clearing credentials is explicit', async t => {
  const ctx = await setup(t, respond); await ctx.configure();
  ctx.store.mutate(data => Object.assign(data, structuredClone(fixture)));
  const changed = await ctx.saveSettings({ baseUrl: 'https://another-source.example.test' });
  assert.equal(changed.status, 409); assert.equal(ctx.store.settings().immich.baseUrl, ctx.source);
  assert.equal((await ctx.saveSettings({ apiKey: '' })).status, 200);
  assert.equal(ctx.store.settings().immich.apiKey, 'upstream-fixture-key');
  assert.equal((await ctx.saveSettings({ clearCredentials: true })).status, 200);
  assert.equal(ctx.store.settings().immich.apiKey, undefined);
});

test('Immich album pagination, image filtering, expiring previews and tamper protection', async t => {
  const ctx = await setup(t, respond); await ctx.configure();
  const albums = await (await ctx.request('/api/manage/albums')).json(); assert.equal(albums.albums[0].label, 'Fixture album');
  const catalog = await (await ctx.request('/api/manage/album')).json();
  assert.deepEqual(catalog.assets.map(a => a.id), ['asset-1', 'asset-2']);
  const searchCalls = ctx.calls.filter(c => c.url === '/api/search/metadata');
  assert.deepEqual(searchCalls.map(c => c.body.page), [1, 2]);
  assert.ok(searchCalls.every(c => c.body.albumIds[0] === 'album-1' && c.headers['x-api-key'] === 'upstream-fixture-key'));
  const url = catalog.assets[0].thumbnailUrl;
  assert.ok(!url.includes('upstream-fixture-key')); assert.ok(!url.includes('admin-fixture'));
  const preview = await fetch(ctx.base + url); assert.equal(preview.status, 200); assert.deepEqual(Buffer.from(await preview.arrayBuffer()), image);
  for (const [field, upstream] of [['previewUrl', '/api/assets/asset-1/thumbnail?size=preview'], ['originalUrl', '/api/assets/asset-1/original?edited=true']]) {
    const large = await fetch(ctx.base + catalog.assets[0][field]);
    assert.equal(large.status, 200); assert.deepEqual(Buffer.from(await large.arrayBuffer()), image);
    assert.equal(ctx.calls.at(-1).url, upstream);
    const tampered = new URL(ctx.base + url); tampered.searchParams.set('variant', field === 'originalUrl' ? 'original' : 'preview');
    assert.equal((await fetch(tampered)).status, 401);
  }
  assert.equal(ctx.store.audit().counts.boxes, 0); assert.equal(ctx.store.audit().counts.photos, 0);
  assert.equal((await fetch(ctx.base + url.replace('asset-1?', 'asset-2?'))).status, 401);
  const expired = new URL(ctx.base + url); expired.searchParams.set('expires', '1'); assert.equal((await fetch(expired)).status, 401);
  await ctx.saveSettings({ apiKey: 'replacement-fixture-key' });
  assert.equal((await fetch(ctx.base + url)).status, 401);
});

test('album-to-session save is checked against current membership, ownership and source revision', async t => {
  let removed = false;
  const ctx = await setup(t, (req, res, body) => {
    if (removed && req.url === '/api/search/metadata') { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify({ assets: { items: [], nextPage: null } })); }
    respond(req, res, body);
  });
  await ctx.configure(); const catalog = await (await ctx.request('/api/manage/album')).json();
  const payload = {
    box: { boxId: 'box-1', label: 'Screws', currentLocationId: 'A-H1-P1-A' },
    session: { boxId: 'box-1', summary: 'M3 fasteners', itemKeywords: ['screws'] },
    photos: [{ immichAssetId: 'asset-1', photoRole: 'inside', capturedAt: 'untrusted-date' }], photoSourceRevision: catalog.sourceRevision
  };
  const saved = await ctx.request('/api/manage/session', { method: 'POST', payload }); assert.equal(saved.status, 200);
  const box = await saved.json(); assert.equal(box.photos[0].capturedAt, '2026-01-01T00:00:00Z'); assert.equal(box.photos[0].originalFileName, 'screws.png');
  const read = await (await ctx.request('/api/public/search?q=screws.png', { key: 'read-fixture' })).json(); assert.equal(read.matches[0].boxId, 'box-1');
  const current = await (await ctx.request('/api/manage/album')).json(); assert.deepEqual(current.assets[0].assignedBoxIds, ['box-1']);
  const other = { ...payload, box: { ...payload.box, boxId: 'box-2' }, session: { ...payload.session, boxId: 'box-2' } };
  assert.equal((await ctx.request('/api/manage/session', { method: 'POST', payload: other })).status, 409);
  const old = { ...other, photos: [{ immichAssetId: 'asset-2', photoRole: 'label' }], photoSourceRevision: 'stale' };
  assert.equal((await ctx.request('/api/manage/session', { method: 'POST', payload: old })).status, 409);
  removed = true;
  const missing = { ...old, photoSourceRevision: catalog.sourceRevision };
  assert.equal((await ctx.request('/api/manage/session', { method: 'POST', payload: missing })).status, 409);
  // Keeping one's own references works without fetching the source again.
  const retained = await ctx.request('/api/manage/session', { method: 'POST', payload: { ...payload, photoSourceRevision: undefined } }); assert.equal(retained.status, 200);
  assert.equal(ctx.store.read().sessions.length, 2); assert.equal(ctx.store.read().photos.length, 2);
  assert.equal(ctx.store.audit().ok, true);
});

test('removing a current photo releases it to the album and another box while retaining historical references', async t => {
  const ctx = await setup(t, respond); await ctx.configure();
  const album = () => ctx.request('/api/manage/album').then(r => r.json());
  const initial = await album();
  const first = { box: { boxId: 'first-box', label: 'First', currentLocationId: 'A-H1-P1-A' }, session: { boxId: 'first-box', summary: '', itemKeywords: [] }, photos: [{ immichAssetId: 'asset-1', photoRole: 'label' }], photoSourceRevision: initial.sourceRevision };
  const save = payload => ctx.request('/api/manage/session', { method: 'POST', payload });
  assert.equal((await save(first)).status, 200);
  assert.deepEqual((await album()).assets.find(p => p.id === 'asset-1').assignedBoxIds, ['first-box']);
  const originalSession = ctx.store.read().photos[0].sessionId;
  assert.equal((await save({ ...first, photos: [], photoSourceRevision: undefined })).status, 200);
  assert.deepEqual((await album()).assets.find(p => p.id === 'asset-1').assignedBoxIds, []);
  assert.ok(ctx.store.read().photos.some(p => p.sessionId === originalSession));
  // An old historical reference is no longer a retained current attachment.
  assert.equal((await save({ ...first, photoSourceRevision: undefined })).status, 409);
  const second = { ...first, box: { ...first.box, boxId: 'second-box', label: 'Second', currentLocationId: 'A-H1-P2-A' }, session: { ...first.session, boxId: 'second-box' } };
  assert.equal((await save(second)).status, 200);
  assert.deepEqual((await album()).assets.find(p => p.id === 'asset-1').assignedBoxIds, ['second-box']);
  const before = ctx.store.read(); assert.equal((await save(first)).status, 409); assert.deepEqual(ctx.store.read(), before);
  assert.equal(ctx.store.read().photos.length, 2); assert.equal(ctx.store.audit().ok, true);
});

test('provider failures are bounded and do not expose upstream response bodies or secrets', async t => {
  let status = 403;
  const ctx = await setup(t, (req, res) => { res.writeHead(status); res.end('secret upstream response: upstream-fixture-key'); });
  await ctx.configure(); const response = await ctx.request('/api/manage/albums');
  assert.equal(response.status, 502); const error = await response.text(); assert.match(error, /rejected access/); assert.ok(!error.includes('upstream-fixture-key'));
  status = 400;
  const inaccessible = await ctx.request('/api/manage/albums'); assert.equal(inaccessible.status, 502);
  assert.match((await inaccessible.json()).error, /album access/);
});

test('repeated Immich pagination cursor fails without a partial album result', async t => {
  const ctx = await setup(t, (req, res) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ assets: { items: [], nextPage: '1' } })); });
  await ctx.configure(); const response = await ctx.request('/api/manage/album'); assert.equal(response.status, 502); assert.match((await response.json()).error, /repeated pagination/);
});

test('PhotoPrism albums and Immich shared-link albums use their provider contracts', async t => {
  const ctx = await setup(t, (req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.url.startsWith('/api/v1/albums?')) { assert.equal(req.headers.authorization, 'Bearer upstream-fixture-key'); return res.end(JSON.stringify([{ UID: 'album-1', Title: 'Prism', PhotoCount: 1 }])); }
    if (req.url.startsWith('/api/v1/photos?')) return res.end(JSON.stringify([{ UID: 'prism-photo', Type: 'image', OriginalName: 'box.jpg', TakenAt: '2026-01-01' }]));
    if (req.url.startsWith('/api/shared-links/me?key=fixture-share')) return res.end(JSON.stringify({ album: { id: 'album-1', albumName: 'Shared fixture' }, assets: [{ id: 'shared-photo', type: 'IMAGE', originalFileName: 'shared.jpg' }] }));
    res.writeHead(404); res.end('{}');
  });
  await ctx.configure({ provider: 'photoprism' });
  assert.equal((await (await ctx.request('/api/manage/albums')).json()).albums[0].label, 'Prism');
  assert.equal((await (await ctx.request('/api/manage/album')).json()).assets[0].id, 'prism-photo');
  await ctx.configure({ accessMode: 'shareKey', shareKey: 'fixture-share', apiKey: '' });
  assert.equal((await (await ctx.request('/api/manage/albums')).json()).albums[0].label, 'Shared fixture');
  assert.equal((await (await ctx.request('/api/manage/album')).json()).assets[0].id, 'shared-photo');
});
