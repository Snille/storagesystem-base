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
import { labelLayout, labelPostScript, testLabel } from '../src/labels.js';
import { CupsPrinter, encodeIpp, decodeIpp, ippAttribute as attr, ippTags as tag, ippValues } from '../src/ipp.js';
import { createApp } from '../src/server.js';
import { fixture } from './fixture.js';

function setup(t, path = ':memory:') {
  const store = new Store(path); store.importLegacy(structuredClone(fixture));
  const state = { printCalls: 0, validCalls: 0, fail: false, stopped: false, onValidate: null };
  const printer = { async status() { return { state: state.stopped ? 'stopped' : 'idle', acceptingJobs: true, formats: ['application/postscript'] }; },
    async validate() { state.validCalls++; state.onValidate?.(); }, async print() { state.printCalls++; if (state.fail) throw new Error('lost response'); return 42; },
    async job() { return { jobId: 42, state: 'completed' }; } };
  const printing = new Printing(new Inventory(store), { printerFactory: () => printer });
  const view = printing.view(); printing.save({ revision: view.revision, config: { ...view.config, enabled: true, serverUrl: 'http://localhost:631', queue: 'synthetic' } });
  t.after(() => store.close());
  return { store, state, printing };
}
const preview = printing => printing.preview({ revision: printing.view().revision, test: true });

test('IPP transport sends one PostScript document with explicit media and rejects attribute substitution', async t => {
  let substituted = false;
  const requests = [];
  const server = createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const bytes = Buffer.concat(chunks), documentStart = bytes.indexOf(Buffer.from('%!PS-Adobe'));
    const attributes = decodeIpp(documentStart < 0 ? bytes : bytes.subarray(0, documentStart), bytes.readInt32BE(4));
    requests.push({ code: bytes.readUInt16BE(2), attributes, document: documentStart < 0 ? null : bytes.subarray(documentStart) });
    res.writeHead(200, { 'content-type': 'application/ipp' });
    res.end(encodeIpp(substituted ? 1 : 0, bytes.readInt32BE(4), [{ tag: 2, attributes: [attr('job-id', tag.integer, 42), attr('job-state', tag.enum, 9)] }]));
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => server.close());
  const printer = new CupsPrinter({ serverUrl: `http://127.0.0.1:${server.address().port}`, queue: 'fixture' });
  await printer.validate('w162h90', 'Test');
  const ps = labelPostScript(labelLayout(testLabel)); assert.equal(await printer.print('w162h90', 'Test', ps), 42);
  assert.equal((await printer.job(42)).state, 'completed');
  assert.deepEqual(requests.map(r => r.code), [4, 2, 9]);
  assert.equal(requests[0].document, null); assert.deepEqual(requests[1].document, ps);
  assert.deepEqual(ippValues(requests[1].attributes, 'copies', 2), [1]);
  assert.deepEqual(ippValues(requests[1].attributes, 'media', 2), ['w162h90']);
  assert.deepEqual(ippValues(requests[1].attributes, 'ipp-attribute-fidelity', 1), [true]);
  substituted = true; await assert.rejects(printer.validate('w162h90', 'Test'), /substituted/);
});

test('label generation shares bounded layout, preserves Swedish glyphs and escapes PostScript syntax', () => {
  const layout = labelLayout(testLabel); assert.deepEqual(layout.warnings, []);
  const ps = labelPostScript(labelLayout({ title: 'Test (A) \\ B', description: 'ÅÄÖ åäö', location: 'A-H1-P1-A' })).toString('ascii');
  assert.match(ps, /PageSize \[162 90\]/); assert.match(ps, /\\305\\304\\326/); assert.match(ps, /\\\(A\\\)/);
  assert.equal(ps.match(/^showpage$/gm).length, 1);
  assert.ok(labelLayout({ ...testLabel, description: 'a long description '.repeat(30) }).warnings.includes('description'));
  assert.throws(() => labelLayout({ ...testLabel, title: '漢字' }));
});

test('management queue status reads only IPP attributes and preserves queue/device distinction', async t => {
  const calls = [];
  const cups = createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const request = Buffer.concat(chunks); calls.push(request.readUInt16BE(2));
    res.writeHead(200, { 'content-type': 'application/ipp' });
    res.end(encodeIpp(0, request.readInt32BE(4), [{ tag: 4, attributes: [
      attr('printer-state', tag.enum, 3), attr('printer-is-accepting-jobs', tag.boolean, true),
      attr('queued-job-count', tag.integer, 0), attr('printer-state-reasons', tag.keyword, ['none']),
      attr('media-default', tag.keyword, 'large-default'), attr('printer-make-and-model', tag.text, 'Fixture')
    ] }]));
  });
  cups.listen(0, '127.0.0.1'); await once(cups, 'listening'); t.after(() => cups.close());
  const store = new Store(':memory:'); t.after(() => store.close());
  const printing = new Printing(new Inventory(store)), before = printing.view();
  printing.save({ revision: before.revision, config: { ...before.config, enabled: true, serverUrl: `http://127.0.0.1:${cups.address().port}`, queue: 'fixture' } });
  const result = await printing.status();
  assert.equal(result.state, 'idle'); assert.equal(result.queuedJobs, 0); assert.equal(result.defaultMedia, 'large-default');
  assert.deepEqual(result.reasons, ['none']); assert.equal(result.labelsRemaining, undefined); assert.equal(result.device, undefined);
  assert.equal(printing.view().media.key, 'w162h90'); assert.equal(store.printJobs().length, 0); assert.deepEqual(calls, [0x0b]);
});

test('print requests are single-use and durably idempotent without changing inventory', async t => {
  const { store, state, printing } = setup(t), before = store.read(), p = preview(printing), requestId = randomUUID();
  const job = await printing.submit({ token: p.token, requestId }); assert.equal(job.jobId, 42); assert.equal(job.state, 'submitted');
  assert.deepEqual(await printing.submit({ token: p.token, requestId }), job); assert.equal(state.printCalls, 1);
  await assert.rejects(printing.submit({ token: p.token, requestId: randomUUID() }), { status: 409 });
  assert.equal(state.printCalls, 1); assert.deepEqual(store.read(), before); assert.equal(store.audit().ok, true);
  assert.equal((await printing.job(requestId)).status.state, 'completed');
  const restarted = new Printing(new Inventory(store));
  assert.deepEqual(await restarted.submit({ token: p.token, requestId }), job);
});

test('ambiguous submission failures remain unknown and retries cannot print a second label', async t => {
  const { state, printing } = setup(t); state.fail = true;
  const p = preview(printing), input = { token: p.token, requestId: randomUUID() };
  assert.equal((await printing.submit(input)).state, 'unknown');
  assert.equal((await printing.submit(input)).state, 'unknown'); assert.equal(state.printCalls, 1);
  assert.equal((await printing.job(input.requestId)).status, null);
});

test('stale content/settings, disabled/stopped queues, expired and overflowing previews do not submit', async t => {
  const { store, state, printing } = setup(t); let p = preview(printing);
  let view = printing.view(); printing.save({ revision: view.revision, config: { ...view.config, queue: 'other' } });
  await assert.rejects(printing.submit({ token: p.token, requestId: randomUUID() }), { status: 409 });
  p = printing.preview({ revision: printing.view().revision, boxId: fixture.boxes[0].boxId, fields: testLabel });
  store.mutate(data => { data.boxes.find(b => b.boxId === fixture.boxes[0].boxId).label = 'Changed'; });
  await assert.rejects(printing.submit({ token: p.token, requestId: randomUUID() }), { status: 409 });
  p = preview(printing); printing.previews.get(p.token).expires = 0;
  await assert.rejects(printing.submit({ token: p.token, requestId: randomUUID() }), { status: 409 });
  p = preview(printing); state.stopped = true;
  await assert.rejects(printing.submit({ token: p.token, requestId: randomUUID() }), { status: 409 }); state.stopped = false;
  p = preview(printing); state.onValidate = () => { const v = printing.view(); printing.save({ revision: v.revision, config: { ...v.config, enabled: false } }); };
  await assert.rejects(printing.submit({ token: p.token, requestId: randomUUID() }), { status: 409 });
  assert.equal(state.printCalls, 0); assert.equal(store.printJobs().length, 0);
});

test('schema 1 migration preserves inventory/settings and print journal survives backup/restore', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'storage-printing-'));
  // Create an actual v1-format file by dropping only the new empty journal.
  const original = new Store(join(dir, 'inventory.sqlite')); original.importLegacy(structuredClone(fixture), { unrelated: { preserve: true } });
  const before = original.read(); original.db.exec('DROP TABLE print_jobs; PRAGMA user_version = 1'); original.close();
  const legacy = new Store(join(dir, 'inventory.sqlite'), { readOnly: true }); assert.equal(legacy.audit().ok, true); legacy.close();
  const migrated = new Store(join(dir, 'inventory.sqlite'));
  try {
    assert.deepEqual(migrated.read(), before); assert.equal(migrated.audit().schemaVersion, 2); assert.equal(migrated.settings().unrelated.preserve, true);
    const service = new Printing(new Inventory(migrated), { printerFactory: () => ({ async status() { return { state: 'idle', acceptingJobs: true, formats: ['application/postscript'] }; }, async validate() {}, async print() { return 9; } }) });
    const v = service.view(); service.save({ revision: v.revision, config: { ...v.config, enabled: true, serverUrl: 'http://localhost:631', queue: 'fixture' } });
    await service.submit({ token: preview(service).token, requestId: randomUUID() });
    await migrated.backup(join(dir, 'backup.sqlite')); await restore(join(dir, 'backup.sqlite'), join(dir, 'restored.sqlite'));
    const restored = new Store(join(dir, 'restored.sqlite'));
    try { assert.deepEqual(restored.printJobs(), migrated.printJobs()); assert.equal(restored.audit().ok, true); assert.deepEqual(restored.read(), before); }
    finally { restored.close(); }
    migrated.db.prepare('UPDATE print_jobs SET record=json_set(record,\'$.state\',\'bad\')').run();
    assert.equal(migrated.audit().ok, false);
  } finally { migrated.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('IPP codec bounds malformed data and scalar continuations', () => {
  const encoded = encodeIpp(0, 1, [{ tag: 4, attributes: [attr('media-supported', tag.keyword, ['one', 'two']), attr('printer-state', tag.enum, 3)] }]);
  assert.deepEqual(ippValues(decodeIpp(encoded, 1), 'media-supported', 4), ['one', 'two']);
  assert.throws(() => decodeIpp(encoded, 2)); assert.throws(() => decodeIpp(encoded.subarray(0, -1), 1));
  assert.throws(() => decodeIpp(Buffer.alloc(1024 * 1024 + 1), 1));
  for (const url of ['http://user:key@localhost', 'file:///tmp', 'http://localhost/admin']) assert.throws(() => new CupsPrinter({ serverUrl: url, queue: 'test' }));
});

test('HTTP printing is management-only and previews never submit a job', async t => {
  const store = new Store(':memory:'); store.importLegacy(structuredClone(fixture));
  const app = createApp({ store, env: { STORAGE_ADMIN_KEY: 'admin', STORAGE_API_KEY: 'read' } });
  app.listen(0, '127.0.0.1'); await once(app, 'listening');
  t.after(async () => { app.closeAllConnections(); await new Promise(resolve => app.close(resolve)); store.close(); });
  const base = `http://127.0.0.1:${app.address().port}`, headers = { 'x-api-key': 'admin', 'content-type': 'application/json' };
  assert.equal((await fetch(base + '/api/manage/printing', { headers: { 'x-api-key': 'read' } })).status, 401);
  const view = await (await fetch(base + '/api/manage/printing', { headers })).json();
  const result = await (await fetch(base + '/api/manage/printing/preview', { method: 'POST', headers, body: JSON.stringify({ revision: view.revision, test: true }) })).json();
  assert.equal(result.layout.warnings.length, 0); assert.equal(store.printJobs().length, 0);
  const diagnostic = base + '/api/manage/printing/device-status';
  assert.equal((await fetch(diagnostic, { method: 'POST', headers: { 'x-api-key': 'read', 'content-type': 'application/json' }, body: '{}' })).status, 401);
  assert.equal((await fetch(diagnostic, { method: 'POST', headers: { ...headers, Origin: 'https://wrong.example' }, body: '{}' })).status, 403);
  assert.equal((await fetch(diagnostic, { method: 'POST', headers, body: JSON.stringify({ revision: view.revision }) })).status, 404);
  assert.throws(() => new Printing(new Inventory(store)).save({ revision: view.revision, config: { ...view.config, dymoStatus: { enabled: true, host: 'printer', port: 9100 } } }), /Unsupported printing/);
  const roll = base + '/api/manage/printing/roll';
  assert.equal((await fetch(roll, { method: 'POST', headers: { 'x-api-key': 'read', 'content-type': 'application/json' }, body: '{}' })).status, 401);
  assert.equal((await fetch(roll, { method: 'POST', headers: { ...headers, Origin: 'https://wrong.example' }, body: '{}' })).status, 403);
  assert.equal((await fetch(roll, { method: 'POST', headers, body: JSON.stringify({ revision: view.revision }) })).status, 409);
  assert.equal((await fetch(base + '/api/manage/printing', { method: 'PUT', headers: { ...headers, Origin: 'https://wrong.example' }, body: JSON.stringify({ revision: view.revision, config: view.config }) })).status, 403);
});
