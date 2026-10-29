import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store, restore } from '../src/store.js';
import { Inventory } from '../src/inventory.js';
import { Printing } from '../src/printing.js';
import { createApp } from '../src/server.js';
import { fixture } from './fixture.js';

const KEY = 'storage-client-key-for-tests';

// A stand-in for the label service: records every request and answers like its API.
async function labelService(t) {
  const calls = [], jobs = new Map(), state = { fail: null, templates: [
    { id: 'box', name: 'Box label', builtIn: true, fields: { title: '', description: '', location: '' } },
    { id: 'location', name: 'Location label', builtIn: true, fields: { location: '' } },
    { id: 'lines', name: 'Free lines', builtIn: true, fields: { lines: '' } },
    { id: 'box-portrait', name: 'Box portrait', media: ['w162h90'], fields: { title: {}, location: {}, boxId: {} } },
    { id: 'box-small', name: 'Box small roll', media: ['w54h144'], fields: { title: {} } },
    { id: 'unit-landscape', name: 'Unit landscape', fields: { kind: {}, name: {}, unitId: {} } }] };
  const server = createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : undefined;
    calls.push({ method: req.method, path: req.url, key: req.headers['x-api-key'], body });
    const reply = (status, value) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(value)); };
    if (req.headers['x-api-key'] !== KEY) return reply(401, { error: 'A valid API key is required.' });
    if (state.fail) return reply(state.fail.status, { error: state.fail.error });
    const media = { key: 'w162h90', name: 'S0722540 · 57 × 32 mm' };
    if (req.url === '/api/v1/formats') return reply(200, { mediaKey: media.key, media });
    if (req.url === '/api/v1/templates') return reply(200, { templates: state.templates });
    if (req.url === '/api/v1/status') return reply(200, { queue: 'DYMO_5XL', state: 'idle', acceptingJobs: true, queuedJobs: 0, reasons: ['none'], model: 'DYMO LabelWriter 5XL' });
    if (req.url === '/api/v1/previews') {
      const fields = body.test ? { title: 'Storage System TEST', description: 'x', location: 'TEST' } : body.fields;
      return reply(201, { token: randomUUID(), expiresAt: new Date(Date.now() + 600000).toISOString(), kind: body.template, fields,
        layout: { name: media.name, widthPt: 162, heightPt: 90, orientation: 'landscape', rotated: false, lines: [], warnings: [] }, svg: '<svg/>', printable: true });
    }
    if (req.url === '/api/v1/jobs' && req.method === 'POST') {
      const job = jobs.get(body.requestId) || { id: body.requestId, state: 'submitted', jobId: jobs.size + 1, kind: 'box', createdAt: new Date().toISOString() };
      jobs.set(body.requestId, job); return reply(201, job);
    }
    if (req.url === '/api/v1/jobs') return reply(200, { jobs: [...jobs.values()] });
    const match = req.url.match(/^\/api\/v1\/jobs\/(.+)$/);
    if (match && jobs.has(match[1])) return reply(200, { record: jobs.get(match[1]), status: { state: 'completed' } });
    reply(404, { error: 'Not found.' });
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => server.close());
  return { url: `http://127.0.0.1:${server.address().port}`, calls, state, prints: () => calls.filter(c => c.method === 'POST' && c.path === '/api/v1/jobs').length };
}

async function setup(t) {
  const service = await labelService(t), store = new Store(':memory:'); store.importLegacy(structuredClone(fixture));
  const printing = new Printing(new Inventory(store));
  printing.save({ revision: printing.revision(), config: { enabled: true, url: service.url, apiKey: KEY } });
  t.after(() => store.close());
  return { store, printing, service };
}

test('label service settings keep the key private, retain it for the same service and require it to enable printing', async t => {
  const store = new Store(':memory:'); t.after(() => store.close());
  const env = new Printing(new Inventory(store), { env: { LABEL_SERVICE_URL: 'http://10.0.0.25:3230', LABEL_SERVICE_KEY: KEY } });
  assert.deepEqual(env.view().config, { enabled: true, url: 'http://10.0.0.25:3230', apiKeyConfigured: true }); assert.equal(env.view().usingEnvironment, true);
  const printing = new Printing(new Inventory(store));
  assert.equal(printing.view().config.enabled, false);
  assert.throws(() => printing.save({ revision: printing.revision(), config: { enabled: true, url: 'http://10.0.0.25:3230' } }), /key before enabling/);
  let view = printing.save({ revision: printing.revision(), config: { enabled: true, url: 'http://10.0.0.25:3230/', apiKey: KEY } });
  assert.deepEqual(view.config, { enabled: true, url: 'http://10.0.0.25:3230', apiKeyConfigured: true });
  assert.doesNotMatch(JSON.stringify(view), new RegExp(KEY));
  view = printing.save({ revision: view.revision, config: { enabled: true, url: 'http://10.0.0.25:3230' } });
  assert.equal(store.settings().labelService.apiKey, KEY);
  assert.throws(() => printing.save({ revision: view.revision, config: { enabled: true, url: 'http://10.0.0.99:3230' } }), /key before enabling/);
  assert.throws(() => printing.save({ revision: view.revision, config: { enabled: true, url: 'http://10.0.0.25:3230', clearKey: true } }), /key before enabling/);
  for (const url of ['http://user:pw@host:3230', 'http://host:3230/api', 'ftp://host']) {
    assert.throws(() => printing.save({ revision: view.revision, config: { enabled: true, url, apiKey: KEY } }), /origin/);
  }
  assert.throws(() => printing.save({ revision: view.revision, config: { enabled: true, url: 'http://10.0.0.25:3230', apiKey: 'short' } }), /16-500/);
  assert.throws(() => printing.save({ revision: 'stale', config: { enabled: false, url: '' } }), { status: 409 });
});

test('previews send only the chosen content to the label service and printing passes the token and request identifier', async t => {
  const { printing, service } = await setup(t), revision = printing.revision(), box = fixture.boxes[0], location = fixture.boxes[1].currentLocationId;
  const p = await printing.preview({ revision, boxId: box.boxId }, 'sv');
  const sent = service.calls.at(-1);
  assert.equal(sent.key, KEY); assert.equal(sent.body.template, 'box'); assert.equal(sent.body.reference, `box:${box.boxId}`); assert.equal(sent.body.fields.title, box.label);
  assert.deepEqual(Object.keys(sent.body.fields), ['title', 'description', 'location']);
  assert.equal(p.printable, true); assert.equal(p.boxId, box.boxId);
  const requestId = randomUUID(), job = await printing.submit({ token: p.token, requestId });
  assert.equal(job.state, 'submitted'); assert.deepEqual(service.calls.at(-1).body, { token: p.token, requestId });
  // Resending after a lost response reaches the service's deduplication, which returns the same job.
  assert.deepEqual(await printing.submit({ token: p.token, requestId }), job);
  await printing.preview({ revision, test: true });
  assert.deepEqual(service.calls.at(-1).body, { template: 'box', test: true });
  // The text direction belongs to the template now.
  await assert.rejects(printing.preview({ revision, test: true, orientation: 'portrait' }), /Unsupported/);
  await printing.preview({ revision, kind: 'location', locationId: location }, 'sv');
  assert.equal(service.calls.at(-1).body.reference, `location:${location}`); assert.match(service.calls.at(-1).body.fields.location, /Lagerhylla|Bänk|Skåp/);
  await assert.rejects(printing.preview({ revision, kind: 'location', locationId: 'IVAR-Z-H9-P9' }), { status: 404 });
  await assert.rejects(printing.preview({ revision, kind: 'shelf', test: true }), /Unsupported/);
  assert.equal((await printing.jobs()).length, 1); assert.equal((await printing.job(requestId)).status.state, 'completed');
  assert.equal((await printing.status()).media.name, 'S0722540 · 57 × 32 mm');
});

test('a changed box, changed settings or an unknown preview never reach the label service as a print', async t => {
  const { store, printing, service } = await setup(t), box = fixture.boxes[0];
  let p = await printing.preview({ revision: printing.revision(), boxId: box.boxId });
  store.mutate(data => { data.boxes.find(b => b.boxId === box.boxId).label = 'Changed'; });
  await assert.rejects(printing.submit({ token: p.token, requestId: randomUUID() }), /changed/);
  p = await printing.preview({ revision: printing.revision(), test: true });
  printing.save({ revision: printing.revision(), config: { enabled: true, url: service.url, apiKey: `${KEY}-rotated` } });
  await assert.rejects(printing.submit({ token: p.token, requestId: randomUUID() }), { status: 409 });
  await assert.rejects(printing.submit({ token: randomUUID(), requestId: randomUUID() }), /new label preview/);
  await assert.rejects(printing.submit({ token: 'x', requestId: randomUUID() }), /valid preview token/);
  assert.equal(service.prints(), 0);
});

test('label service errors are reported clearly, and a rejected key is a configuration problem', async t => {
  const { printing, service } = await setup(t), revision = printing.revision();
  service.state.fail = { status: 409, error: 'The selected label format is S0722550 · 19 × 51 mm.' };
  await assert.rejects(printing.preview({ revision, test: true }), { status: 409, message: /S0722550/ });
  service.state.fail = null;
  printing.save({ revision, config: { enabled: true, url: service.url, apiKey: 'a-wrong-key-of-enough-length' } });
  await assert.rejects(printing.status(), { status: 502, message: /rejected the key/ });
  printing.save({ revision: printing.revision(), config: { enabled: true, url: 'http://127.0.0.1:1', apiKey: KEY } });
  await assert.rejects(printing.status(), { status: 502, message: /did not answer/ });
  printing.save({ revision: printing.revision(), config: { enabled: false, url: '' , clearKey: true } });
  await assert.rejects(printing.status(), /disabled/);
});

test('the legacy CUPS settings and print journal stay valid through migration, backup and restore', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'storage-printing-'));
  const original = new Store(join(dir, 'inventory.sqlite')); original.importLegacy(structuredClone(fixture), { unrelated: { preserve: true } });
  const before = original.read(); original.db.exec('DROP TABLE print_jobs; DROP TABLE search_history; DROP TABLE media; PRAGMA user_version = 1'); original.close();
  const migrated = new Store(join(dir, 'inventory.sqlite'));
  try {
    assert.deepEqual(migrated.read(), before); assert.equal(migrated.audit().schemaVersion, 4); assert.equal(migrated.settings().unrelated.preserve, true);
    // A record and settings exactly as 0.14 wrote them.
    const hex = 'a'.repeat(64), record = { id: randomUUID(), tokenHash: hex, documentHash: hex, settingsRevision: hex, serverUrl: 'http://127.0.0.1:18463', queue: 'DYMO_5XL',
      mediaKey: 'w54h144', createdAt: new Date().toISOString(), state: 'submitted', kind: 'location', locationId: 'A-H6-P1-A', jobId: 121 };
    migrated.db.prepare('INSERT INTO print_jobs VALUES (?, ?, ?)').run(record.id, record.tokenHash, JSON.stringify(record));
    migrated.writeSettings({ printing: { enabled: true, serverUrl: 'http://127.0.0.1:18463', queue: 'DYMO_5XL', mediaKey: 'w54h144', styles: {}, rollReader: { enabled: true, host: '127.0.0.1', port: 18464 } } });
    assert.equal(migrated.audit().ok, true);
    await migrated.backup(join(dir, 'backup.sqlite')); await restore(join(dir, 'backup.sqlite'), join(dir, 'restored.sqlite'));
    const restored = new Store(join(dir, 'restored.sqlite'));
    try { assert.deepEqual(restored.printJobs(), [record]); assert.equal(restored.audit().ok, true); } finally { restored.close(); }
    migrated.db.prepare('UPDATE print_jobs SET record=json_set(record,\'$.state\',\'bad\')').run();
    assert.equal(migrated.audit().ok, false);
  } finally { migrated.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('HTTP printing is management-only and the removed direct printer routes are gone', async t => {
  const service = await labelService(t), store = new Store(':memory:'); store.importLegacy(structuredClone(fixture));
  const app = createApp({ store, env: { STORAGE_ADMIN_KEY: 'admin', STORAGE_API_KEY: 'read', LABEL_SERVICE_URL: service.url, LABEL_SERVICE_KEY: KEY } });
  app.listen(0, '127.0.0.1'); await once(app, 'listening');
  t.after(async () => { app.closeAllConnections(); await new Promise(resolve => app.close(resolve)); store.close(); });
  const base = `http://127.0.0.1:${app.address().port}`, headers = { 'x-api-key': 'admin', 'content-type': 'application/json' };
  assert.equal((await fetch(base + '/api/manage/printing', { headers: { 'x-api-key': 'read' } })).status, 401);
  const view = await (await fetch(base + '/api/manage/printing', { headers })).json();
  assert.equal(view.config.apiKeyConfigured, true); assert.doesNotMatch(JSON.stringify(view), new RegExp(KEY));
  const preview = await (await fetch(base + '/api/manage/printing/preview', { method: 'POST', headers, body: JSON.stringify({ revision: view.revision, test: true }) })).json();
  assert.equal(preview.printable, true); assert.equal(service.prints(), 0);
  assert.equal((await fetch(base + '/api/manage/printing/jobs', { headers })).status, 200);
  assert.equal((await fetch(base + '/api/manage/printing/roll', { method: 'POST', headers, body: JSON.stringify({ revision: view.revision }) })).status, 404);
  assert.equal((await fetch(base + '/api/manage/printing', { method: 'PUT', headers: { ...headers, Origin: 'https://wrong.example' }, body: JSON.stringify({ revision: view.revision, config: { enabled: false, url: '' } }) })).status, 403);
});

test('label templates: each label type has a standard template and others, and a box remembers a non-standard choice', async t => {
  const { store, printing, service } = await setup(t), revision = printing.revision(), box = fixture.boxes[0];
  const list = await printing.templates();
  const byId = Object.fromEntries(list.templates.map(x => [x.id, x]));
  assert.deepEqual(byId.box.functions, ['box']); assert.deepEqual(byId.location.functions, ['box', 'location']); assert.deepEqual(byId.lines.functions, []);
  assert.deepEqual(byId['box-portrait'].functions, ['box']); assert.equal(byId['box-portrait'].fitsRoll, true); assert.equal(byId['box-small'].fitsRoll, false);
  assert.deepEqual(list.functions.box, { default: 'box', extra: [] });
  assert.throws(() => printing.saveFunctions({ functions: { box: { default: 'box', extra: ['box'] } } }), /each once/);
  assert.throws(() => printing.saveFunctions({ functions: { shelf: { default: 'box', extra: [] } } }), /Unsupported label function/);
  printing.saveFunctions({ functions: { box: { default: 'box', extra: ['box-portrait'] } } });
  assert.deepEqual(printing.view().functions.location, { default: 'location', extra: [] });

  // An explicit template gets only the fields it asks for, including the box ID that is not shown in the dialog.
  let p = await printing.preview({ revision, boxId: box.boxId, template: 'box-portrait', fields: { title: 'Edited', description: 'ignored' } });
  assert.deepEqual(service.calls.at(-1).body.fields, { title: 'Edited', location: service.calls.at(-1).body.fields.location, boxId: box.boxId });
  assert.equal(p.template, 'box-portrait'); assert.equal(p.fallback, false);
  await assert.rejects(printing.preview({ revision, boxId: box.boxId, template: 'lines' }), /cannot fill/);
  await assert.rejects(printing.preview({ revision, boxId: box.boxId, fields: { boxId: 'other' } }), /Unsupported label field/);
  await assert.rejects(printing.preview({ revision, boxId: box.boxId, template: 'gone' }), { status: 409 });

  // Printing the portrait template remembers it for the box; it is then the box's starting choice.
  await printing.submit({ token: p.token, requestId: randomUUID() });
  assert.equal(printing.inventory.get(box.boxId).labelTemplate, 'box-portrait'); assert.equal(store.audit().ok, true);
  p = await printing.preview({ revision, boxId: box.boxId });
  assert.equal(service.calls.at(-1).body.template, 'box-portrait');
  // A remembered template that was removed from the label service falls back to the standard one and is not remembered.
  service.state.templates = service.state.templates.filter(x => x.id !== 'box-portrait');
  p = await printing.preview({ revision, boxId: box.boxId });
  assert.equal(p.template, 'box'); assert.equal(p.fallback, true);
  await printing.submit({ token: p.token, requestId: randomUUID() });
  assert.equal(printing.inventory.get(box.boxId).labelTemplate, 'box-portrait');
  // Printing the standard template on purpose forgets the earlier choice.
  p = await printing.preview({ revision, boxId: box.boxId, template: 'box' });
  await printing.submit({ token: p.token, requestId: randomUUID() });
  assert.equal(printing.inventory.get(box.boxId).labelTemplate, null); assert.equal(store.read().boxes.find(b => b.boxId === box.boxId).labelTemplate, undefined);
  // Location labels never touch a box.
  p = await printing.preview({ revision, kind: 'location', locationId: box.currentLocationId });
  assert.deepEqual(Object.keys(service.calls.at(-1).body.fields), ['location']);
});

test('a remembered label template is part of the box, set over HTTP and checked by the audit', async t => {
  const service = await labelService(t), store = new Store(':memory:'); store.importLegacy(structuredClone(fixture));
  const app = createApp({ store, env: { STORAGE_ADMIN_KEY: 'admin', STORAGE_API_KEY: 'read', LABEL_SERVICE_URL: service.url, LABEL_SERVICE_KEY: KEY } });
  app.listen(0, '127.0.0.1'); await once(app, 'listening');
  t.after(async () => { app.closeAllConnections(); await new Promise(resolve => app.close(resolve)); store.close(); });
  const base = `http://127.0.0.1:${app.address().port}`, headers = { 'x-api-key': 'admin', 'content-type': 'application/json' }, id = fixture.boxes[0].boxId;
  const put = templateId => fetch(`${base}/api/manage/boxes/${encodeURIComponent(id)}/label-template`, { method: 'PUT', headers, body: JSON.stringify({ templateId }) });
  assert.equal((await (await put('box-portrait')).json()).labelTemplate, 'box-portrait');
  assert.equal((await put('Bad Id')).status, 400);
  assert.equal((await fetch(`${base}/api/manage/boxes/${encodeURIComponent(id)}/label-template`, { method: 'PUT', headers: { 'x-api-key': 'read', 'content-type': 'application/json' }, body: '{"templateId":null}' })).status, 401);
  const templates = await (await fetch(base + '/api/manage/printing/templates', { headers })).json();
  assert.ok(templates.templates.some(x => x.id === 'box-portrait'));
  assert.equal((await fetch(base + '/api/manage/printing/templates', { method: 'PUT', headers, body: JSON.stringify({ functions: { box: { default: 'box-portrait', extra: ['box'] } } }) })).status, 200);
  assert.equal(store.settings().labelTemplates.box.default, 'box-portrait');
  assert.equal((await put(null)).status, 200); assert.equal(store.audit().ok, true);
  store.db.prepare("UPDATE boxes SET record = json_set(record, '$.labelTemplate', 'NOT VALID') WHERE id = ?").run(id);
  assert.equal(store.audit().ok, false);
});

test('storage unit labels fill unit, kind, name and unitId, and need a template of their own', async t => {
  const { printing, service } = await setup(t), revision = printing.revision();
  assert.deepEqual((await printing.templates()).templates.find(x => x.id === 'unit-landscape').functions, ['unit']);
  // No built-in template exists for storage units, so one must be chosen first.
  await assert.rejects(printing.preview({ revision, kind: 'unit', unitId: 'g' }), /storage unit label template/);
  printing.saveFunctions({ functions: { unit: { default: 'unit-landscape', extra: [] } } });
  const p = await printing.preview({ revision, kind: 'unit', unitId: 'g' }, 'sv');
  assert.deepEqual(service.calls.at(-1).body.fields, { kind: 'Lagerhylla', name: 'G', unitId: 'g' });
  assert.equal(service.calls.at(-1).body.reference, 'unit:g'); assert.equal(p.unitId, 'g');
  await printing.preview({ revision, kind: 'unit', unitId: 'g', fields: { name: 'G1' } }, 'en');
  assert.deepEqual(service.calls.at(-1).body.fields, { kind: 'Shelving unit', name: 'G1', unitId: 'g' });
  await assert.rejects(printing.preview({ revision, kind: 'unit', unitId: 'nope' }), { status: 404 });
  await assert.rejects(printing.preview({ revision, kind: 'box', unitId: 'g' }), /Unsupported/);
  await printing.submit({ token: p.token, requestId: randomUUID() });
  assert.equal(service.prints(), 1);
});
