import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { readDymoRoll, decodeRoll } from '../src/dymo-roll.js';
import { Store } from '../src/store.js';
import { Inventory } from '../src/inventory.js';
import { Printing } from '../src/printing.js';
import { labelMediaPresets, labelLayout, labelPostScript } from '../src/labels.js';
import { validatePrinting } from '../src/validation.js';

function status(engine = 0) { const b = Buffer.alloc(32); b[0] = engine; b[10] = 8; b.write('S0722540', 11); b.writeUInt16LE(123, 27); return b; }
function sku() { const b = Buffer.alloc(64); b.writeUInt16LE(0xcab6); b[3] = 60; b.write('S0722540', 8); return b; }
async function fixture(t, options = {}) {
  let connections = 0, requests = 0; const commands = [], sockets = new Set();
  const server = createServer(socket => {
    connections++; sockets.add(socket); socket.on('close', () => sockets.delete(socket)); let buffer = Buffer.alloc(0);
    socket.on('data', data => {
      buffer = Buffer.concat([buffer, data]);
      while (buffer.length >= 2) {
        const n = buffer[1] === 0x41 ? 3 : 2; if (buffer.length < n) break;
        const cmd = buffer.subarray(0, n); buffer = buffer.subarray(n); commands.push(cmd.toString('hex'));
        if (cmd[1] === 0x41) {
          requests++; const b = options.status ? options.status(requests) : status(requests === 1 ? 5 : 0);
          if (b) { socket.write(b.subarray(0, 4)); setImmediate(() => socket.write(b.subarray(4))); }
        } else if (cmd[1] === 0x55 && !options.timeout) socket.write(options.sku || sku());
      }
    });
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { for (const s of sockets) s.destroy(); await new Promise(resolve => server.close(resolve)); });
  return { config: { host: '127.0.0.1', port: server.address().port }, commands, connections: () => connections,
    settled: () => Promise.all([...sockets].map(socket => once(socket, 'close'))) };
}
const fast = { timeoutMs: 150, retryDelayMs: 1, graceMs: 1 };

test('roll reading waits for ownership and releases exactly its own lock on one connection', async t => {
  const f = await fixture(t), result = await readDymoRoll(f.config, fast);
  await f.settled();
  assert.deepEqual(f.commands, ['1b4101', '1b4101', '1b55', '1b51']); assert.equal(f.connections(), 1);
  assert.equal(result.labelsRemaining, 123); assert.equal(result.sku, 'S0722540'); assert.equal(result.media.key, 'w162h90'); assert.equal(result.sizeSource, 'sku-preset'); assert.equal(result.releaseRequested, true);
});
test('failed lock attempts and active jobs never receive an end-job command', async t => {
  for (const active of [false, true]) {
    const f = await fixture(t, { status() { const b = status(5); if (active) b.writeUInt32LE(42, 1); return b; } });
    await assert.rejects(readDymoRoll(f.config, fast), /lock|busy/); await f.settled(); assert.ok(!f.commands.includes('1b51')); assert.ok(!f.commands.includes('1b55')); assert.equal(f.commands.length, active ? 1 : 3);
  }
});
test('malformed or timed-out consumable reads release a verified acquired lock without feeding/resetting', async t => {
  for (const timeout of [false, true]) {
    const f = await fixture(t, { status: () => status(), sku: Buffer.alloc(64), timeout });
    await assert.rejects(readDymoRoll(f.config, fast), /consumable|timed out/);
    await f.settled();
    assert.deepEqual(f.commands, ['1b4101', '1b55', '1b51']);
  }
});
test('incomplete lock replies do not authorize ending an unknown job', async t => {
  const f = await fixture(t, { status: () => status().subarray(0, 16) });
  await assert.rejects(readDymoRoll(f.config, fast), /timed out/); await f.settled(); assert.deepEqual(f.commands, ['1b4101']);
});

test('an error reply with no active job releases its granted reservation without reading or feeding', async t => {
  for (const bay of [8, 9]) {
    const f = await fixture(t, { status(n) { const b = status(n === 1 ? 5 : 2); b[10] = bay; return b; } });
    await assert.rejects(readDymoRoll(f.config, fast), bay === 9 ? /label jam/ : /device error/);
    await f.settled(); assert.deepEqual(f.commands, ['1b4101', '1b4101', '1b51']);
  }
  const active = await fixture(t, { status() { const b = status(2); b.writeUInt32LE(42, 1); return b; } });
  await assert.rejects(readDymoRoll(active.config, fast), /busy|ownership/);
  await active.settled(); assert.deepEqual(active.commands, ['1b4101']);
});
test('roll decoder validates identity, placeholders and errors, and preserves a real zero count', () => {
  const b = status(), media = sku(); b.writeUInt16LE(0, 27); assert.equal(decodeRoll(b, media).labelsRemaining, 0);
  const changed = Buffer.from(media); changed.write('S0722550', 8); assert.throws(() => decodeRoll(b, changed), /disagree/);
  b.writeUInt32LE(4096, 23); assert.throws(() => decodeRoll(b, media), /device error/);
  assert.throws(() => decodeRoll(status(5), media), /idle/);
  const unknown = status(), unknownSku = sku(); unknown.write('S1234567', 11); unknownSku.write('S1234567', 8); assert.equal(decodeRoll(unknown, unknownSku).media, null);
});
test('all explicit label formats generate their own dimensions and retain overflow guards', () => {
  for (const media of labelMediaPresets) {
    const layout = labelLayout({ title: 'M4', description: 'Test', location: 'A1' }, undefined, media.key);
    assert.equal(layout.widthPt, media.widthPt); assert.equal(layout.heightPt, media.heightPt); assert.deepEqual(layout.warnings, []);
    assert.match(labelPostScript(layout).toString(), new RegExp(`PageSize \\[${media.widthPt} ${media.heightPt}\\]`));
    assert.ok(layout.lines.every(line => line.y < media.heightPt && line.width <= media.widthPt - 17));
    assert.ok(labelLayout({ title: 'Test', description: 'Long '.repeat(300), location: 'A1' }, undefined, media.key).warnings.length);
  }
});
test('roll reader settings and process guard prevent active queue access, races and automatic retry', async t => {
  const store = new Store(':memory:'); t.after(() => store.close()); let calls = 0, queue = { state: 'idle', queuedJobs: 1 }, resolve;
  const service = new Printing(new Inventory(store), { printerFactory: () => ({ async status() { return queue; } }), rollReader: async () => { calls++; return new Promise(r => { resolve = r; }); } });
  const revision = () => service.view().revision;
  await assert.rejects(service.readRoll({ revision: revision() }), /Enable/);
  const config = { ...service.config(), enabled: true, queue: 'synthetic', serverUrl: 'http://cups:631', rollReader: { enabled: true, host: 'printer.local', port: 9100 } };
  service.save({ revision: revision(), config });
  for (const bad of [{ host: 'http://printer' }, { port: 0 }, { enabled: true, host: '' }, { command: 'reset' }]) assert.throws(() => validatePrinting({ ...config, rollReader: { ...config.rollReader, ...bad } }), /roll-reader/);
  await assert.rejects(service.readRoll({ revision: revision() }), /idle and empty/); assert.equal(calls, 0);
  service.lastRollCheck = 0; queue.queuedJobs = 0; const pending = service.readRoll({ revision: revision() }); await new Promise(setImmediate);
  assert.equal(service.busy, true); await assert.rejects(service.readRoll({ revision: revision() }), /Wait/);
  service.save({ revision: revision(), config: { ...config, queue: 'changed' } }); resolve({ labelsRemaining: 123 });
  await assert.rejects(pending, /settings changed/); assert.equal(service.busy, false); assert.equal(store.printJobs().length, 0);
});
