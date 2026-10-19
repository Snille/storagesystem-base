import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { Store } from '../src/store.js';
import { Photos } from '../src/photos.js';

async function source(t, respond) {
  const server = createServer(respond); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise(r => server.close(r)); });
  return `http://127.0.0.1:${server.address().port}`;
}

test('PhotoPrism resolves a thumbnail hash and preview token and uses Bearer authentication', async t => {
  const requests = [];
  const baseUrl = await source(t, (req, res) => {
    requests.push({ url: req.url, auth: req.headers.authorization });
    if (req.url.startsWith('/api/v1/photos?')) {
      res.writeHead(200, { 'Content-Type': 'application/json', 'X-Preview-Token': 'fixture-preview' });
      res.end(JSON.stringify([{ UID: 'photo-uid', Files: [{ Hash: 'hash-1', Primary: true }] }]));
    } else { res.writeHead(200, { 'Content-Type': 'image/jpeg' }); res.end('fixture-image'); }
  });
  const store = new Store(':memory:'); t.after(() => store.close());
  store.writeSettings({ immich: { provider: 'photoprism', baseUrl, apiKey: 'photoprism-fixture' } });
  const photos = new Photos(store);
  assert.equal((await photos.fetch('photo-uid', 'thumbnail')).mime, 'image/jpeg');
  assert.match(requests[0].url, /q=uid%3Aphoto-uid/);
  assert.equal(requests[1].url, '/api/v1/t/hash-1/fixture-preview/tile_500');
  assert.ok(requests.every(r => r.auth === 'Bearer photoprism-fixture'));
  await photos.fetch('photo-uid', 'original');
  assert.equal(requests.at(-1).url, '/api/v1/photos/photo-uid/dl');
});

test('Immich shared-link access and original image parameters follow the reference contract', async t => {
  let received;
  const baseUrl = await source(t, (req, res) => { received = req; res.writeHead(200, { 'Content-Type': 'image/png' }); res.end('fixture-image'); });
  const store = new Store(':memory:'); t.after(() => store.close());
  store.writeSettings({ immich: { provider: 'immich', baseUrl, accessMode: 'shareKey', shareKey: 'fixture-share' } });
  await new Photos(store).fetch('asset/with spaces', 'original');
  assert.equal(received.url, '/api/assets/asset%2Fwith%20spaces/original?key=fixture-share&edited=true');
  assert.equal(received.headers['x-api-key'], undefined);
});

test('photo proxy rejects executable content and oversized thumbnails', async t => {
  let mode = 'html';
  const baseUrl = await source(t, (req, res) => {
    res.writeHead(200, { 'Content-Type': mode === 'html' ? 'text/html' : 'image/png' });
    res.end(mode === 'html' ? '<script>invalid</script>' : Buffer.alloc(2 * 1024 * 1024 + 1));
  });
  const store = new Store(':memory:'); t.after(() => store.close());
  store.writeSettings({ immich: { provider: 'immich', baseUrl, apiKey: 'fixture' } });
  const photos = new Photos(store);
  await assert.rejects(photos.fetch('asset', 'thumbnail'), /Unsupported photo content/);
  mode = 'oversized';
  await assert.rejects(photos.fetch('asset', 'thumbnail'), /size limit/);
});
