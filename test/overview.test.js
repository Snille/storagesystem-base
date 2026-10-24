import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { Store } from '../src/store.js';
import { createApp } from '../src/server.js';
import { panoramaAngles, fittingHfov } from '../web/overview.js';

test('panorama angles: 2:1 is a full sphere, wider images are 180 degree panoramas', () => {
  assert.deepEqual(panoramaAngles(8192, 4096), { haov: 360, vaov: 180 });
  const wide = panoramaAngles(15104, 3136); assert.equal(wide.haov, 180); assert.ok(Math.abs(wide.vaov - 37.4) < 0.1);
  // A 37 degree high image in a 2.28:1 box allows about 75 degrees across; a square box shows exactly the image height.
  assert.ok(Math.abs(fittingHfov(wide.vaov, 1047 / 460) - 75.2) < 0.5); assert.ok(Math.abs(fittingHfov(60, 1) - 60) < 1e-9);
});

test('the vendored panorama viewer is served from this application and the page policy allows its images', async t => {
  const store = new Store(':memory:'), app = createApp({ store, env: {} });
  app.listen(0, '127.0.0.1'); await once(app, 'listening');
  t.after(async () => { app.closeAllConnections(); await new Promise(r => app.close(r)); store.close(); });
  const base = `http://127.0.0.1:${app.address().port}`;
  for (const [file, type] of [['pannellum.js', 'text/javascript'], ['pannellum.css', 'text/css']]) {
    const response = await fetch(`${base}/vendor/pannellum/${file}`); assert.equal(response.status, 200); assert.match(response.headers.get('content-type'), new RegExp(type));
  }
  const policy = (await fetch(base + '/')).headers.get('content-security-policy');
  assert.match(policy, /img-src 'self' data: blob:/); assert.match(policy, /script-src 'self';/);
});
