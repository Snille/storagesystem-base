import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store, restore } from '../src/store.js';
import { Inventory, currentSession } from '../src/inventory.js';
import { fixture } from './fixture.js';

function setup(t) {
  const dir = mkdtempSync(join(tmpdir(), 'storage-test-'));
  const store = new Store(join(dir, 'storage.sqlite'));
  t.after(() => { store.close(); rmSync(dir, { recursive: true, force: true }); });
  return { dir, store };
}

test('registered and vacated positions survive writes, backup and fresh restore without changing inventory identifiers', async t => {
  const { store, dir } = setup(t); const inventory = new Inventory(store);
  assert.deepEqual(inventory.positions(), []);
  inventory.addPosition({ locationId: 'CABINET:A:H2:P3' });
  inventory.addPosition({ locationId: 'CABINET:A:H2:P3' });
  assert.equal(inventory.positions()[0].boxCount, 0);
  store.importLegacy(structuredClone(fixture));
  const id = fixture.boxes[0].boxId; const old = fixture.boxes[0].currentLocationId;
  const before = store.read();
  inventory.save({ box: { boxId: id, label: 'Moved box', currentLocationId: 'CABINET:A:H2:P3' }, session: { boxId: id, summary: 'Moved', itemKeywords: [] } });
  assert.equal(inventory.positions().find(p => p.locationId === old).boxCount, 0);
  assert.equal(inventory.positions().find(p => p.locationId === 'CABINET:A:H2:P3').boxCount, 1);
  assert.deepEqual(store.read().sessions.filter(s => s.boxId === id && s.sessionId !== inventory.get(id).sessionId).map(s => s.sessionId), before.sessions.filter(s => s.boxId === id).map(s => s.sessionId));
  assert.deepEqual(store.read().boxes.map(b => b.boxId).sort(), before.boxes.map(b => b.boxId).sort());
  inventory.addPosition({ locationId: 'Empty corner' });
  await store.backup(join(dir, 'positions.sqlite'));
  await restore(join(dir, 'positions.sqlite'), join(dir, 'positions-restored.sqlite'));
  const restored = new Store(join(dir, 'positions-restored.sqlite'));
  try { assert.deepEqual(new Inventory(restored).positions(), inventory.positions()); assert.equal(restored.audit().ok, true); } finally { restored.close(); }
  assert.equal(store.audit().ok, true);
});

test('chosen cover survives reopen/backup and removing it from a new session falls back without changing history', async t => {
  const { store, dir } = setup(t); store.importLegacy(structuredClone(fixture));
  const inventory = new Inventory(store); const id = fixture.boxes[0].boxId;
  inventory.setCover(id, 'asset-label'); await store.backup(join(dir, 'cover.sqlite'));
  const snapshot = new Store(join(dir, 'cover.sqlite'));
  try { assert.equal(new Inventory(snapshot).get(id).coverAssetId, 'asset-label'); assert.equal(snapshot.audit().ok, true); } finally { snapshot.close(); }
  inventory.save({ box: { boxId: id, label: 'Reviewed box', currentLocationId: 'G-H6-P1-A' }, session: { boxId: id, summary: 'Retained contents', itemKeywords: [] }, photos: [{ immichAssetId: 'asset-inside', photoRole: 'inside' }] });
  assert.equal(inventory.get(id).coverAssetId, 'asset-inside'); assert.equal(inventory.get(id).coverIsAutomatic, true);
  assert.equal(store.read().photos.filter(p => p.sessionId === 'S-1').length, 2); assert.equal(store.audit().ok, true);
});

test('legacy import preserves every field, identifier, history and setting through SQLite backup/restore', async t => {
  const { store, dir } = setup(t);
  const data = structuredClone(fixture); data.boxes[0].futureMetadata = { keep: true };
  const settings = { appearance: { language: 'sv', uiLanguage: 'en' }, labels: { templates: [{ id: 'existing-template' }] }, translationOverrides: { en: { custom: 'Value' } } };
  const source = join(dir, 'source.json'); writeFileSync(source, JSON.stringify(data));
  assert.deepEqual(store.importLegacy(data, settings), { boxes: 2, sessions: 3, photos: 3 });
  const expected = store.read(); assert.equal(store.audit().ok, true);
  await store.backup(join(dir, 'backup.sqlite'));
  assert.equal((await restore(join(dir, 'backup.sqlite'), join(dir, 'restored.sqlite'))).ok, true);
  const restored = new Store(join(dir, 'restored.sqlite'));
  try { assert.deepEqual(restored.read(), expected); assert.deepEqual(restored.settings(), settings); assert.equal(restored.audit().ok, true); }
  finally { restored.close(); }
  assert.deepEqual(JSON.parse(readFileSync(source)), data);
  assert.equal(expected.sessions.length, data.sessions.length);
  assert.deepEqual(expected.boxes.find(b => b.boxId === data.boxes[0].boxId), data.boxes[0]);
  await assert.rejects(store.backup(join(dir, 'backup.sqlite')));
  await assert.rejects(restore(join(dir, 'backup.sqlite'), join(dir, 'restored.sqlite')), /already exists/);
});

test('invalid imports fail atomically and populated databases cannot be replaced', t => {
  const { store } = setup(t);
  for (const change of [
    d => d.sessions[0].boxId = 'missing',
    d => d.photos[0].sessionId = 'missing',
    d => d.boxes.push(d.boxes[0]),
    d => d.sessions[0].isCurrent = true,
    d => d.photos[0].photoRole = 'invalid',
    d => d.sessions[0].itemKeywords = ['valid', 12]
  ]) {
    const data = structuredClone(fixture); change(data);
    assert.throws(() => store.importLegacy(data)); assert.equal(store.read().boxes.length, 0);
  }
  assert.throws(() => store.importLegacy(fixture, { security: { publicApiKey: 123 } }), /string/);
  assert.throws(() => store.importLegacy(fixture, { immich: { baseUrl: 'file:///local' } }), /HTTP/);
  assert.equal(store.read().boxes.length, 0);
  store.importLegacy(fixture);
  assert.throws(() => store.importLegacy({ boxes: [], sessions: [], photos: [] }), /empty database/);
  assert.deepEqual(store.read().boxes.length, 2);
});

test('saving creates history, prevents session reassignment, and rolls back bad photos', t => {
  const { store } = setup(t); store.importLegacy(fixture);
  const inventory = new Inventory(store); const before = store.read();
  const payload = {
    box: { boxId: fixture.boxes[0].boxId, label: 'Updated', currentLocationId: 'CABINET:A:H2:P3' },
    session: { boxId: fixture.boxes[0].boxId, summary: 'New contents', itemKeywords: ['bolts'] },
    photos: [{ immichAssetId: 'new-photo', photoRole: 'inside' }]
  };
  const saved = inventory.save(payload);
  assert.equal(saved.label, 'Updated'); assert.equal(saved.photos.length, 1);
  const data = store.read(); assert.equal(data.sessions.length, 4); assert.equal(data.photos.length, 4);
  assert.equal(data.sessions.filter(s => s.boxId === saved.boxId && s.isCurrent).length, 1);
  assert.equal(data.boxes.find(b => b.boxId === saved.boxId).createdAt, before.boxes.find(b => b.boxId === saved.boxId).createdAt);
  assert.equal(currentSession(data, saved.boxId).summary, 'New contents');
  const snapshot = store.read();
  assert.throws(() => inventory.save({ ...payload, session: { ...payload.session, sessionId: 'S-2' } }), /reassigned/);
  assert.throws(() => inventory.save({ ...payload, photos: [{ photoRole: 'broken' }] }));
  assert.deepEqual(store.read(), snapshot);
});

test('SQL constraints reject orphan sessions and duplicate current sessions', t => {
  const { store } = setup(t); store.importLegacy(fixture);
  assert.throws(() => store.db.prepare('INSERT INTO sessions VALUES (?, ?, ?, ?)').run('invalid', 'missing', 0, JSON.stringify({ sessionId: 'invalid', boxId: 'missing', isCurrent: false })));
  const row = { ...fixture.sessions[1], sessionId: 'duplicate' };
  assert.throws(() => store.db.prepare('INSERT INTO sessions VALUES (?, ?, ?, ?)').run(row.sessionId, row.boxId, 1, JSON.stringify(row)));
  assert.equal(store.audit().ok, true);
});

test('audit detects corruption even when a foreign key was bypassed externally', t => {
  const { store } = setup(t); store.importLegacy(fixture);
  store.db.exec('PRAGMA foreign_keys = OFF');
  store.db.prepare('DELETE FROM boxes WHERE id = ?').run(fixture.boxes[0].boxId);
  store.db.exec('PRAGMA foreign_keys = ON');
  const result = store.audit(); assert.equal(result.ok, false); assert.match(result.errors.join(' '), /foreign keys|Orphan/);
});

test('future schema versions and arbitrary SQLite files cannot be restored', async t => {
  const { store, dir } = setup(t);
  await store.backup(join(dir, 'future.sqlite'));
  const future = new Store(join(dir, 'future.sqlite')); future.db.exec('PRAGMA user_version = 99'); future.close();
  await assert.rejects(restore(join(dir, 'future.sqlite'), join(dir, 'reject.sqlite')), /Unsupported database schema/);
  assert.equal(store.audit().ok, true);
});
