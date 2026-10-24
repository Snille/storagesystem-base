import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Store } from '../src/store.js';
import { createApp } from '../src/server.js';
import { fixture } from './fixture.js';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB1sAAAAASUVORK5CYII=', 'base64');

async function setup(t) {
  const dir = mkdtempSync(join(tmpdir(), 'storage-restore-'));
  const store = new Store(join(dir, 'live.sqlite')); store.importLegacy(structuredClone(fixture), { appearance: { language: 'sv' } });
  const app = createApp({ store, env: { STORAGE_ADMIN_KEY: 'admin', STORAGE_API_KEY: 'read' } });
  app.listen(0, '127.0.0.1'); await once(app, 'listening');
  // Windows cannot remove the folder while the database is open, so close first.
  t.after(async () => { app.closeAllConnections(); await new Promise(r => app.close(r)); store.close(); rmSync(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${app.address().port}`;
  const upload = (bytes, key = 'admin') => fetch(base + '/api/manage/restore/upload', { method: 'POST', headers: { 'x-api-key': key, 'content-type': 'application/vnd.sqlite3' }, body: bytes });
  const apply = body => fetch(base + '/api/manage/restore', { method: 'POST', headers: { 'x-api-key': 'admin', 'content-type': 'application/json' }, body: JSON.stringify(body) });
  // A different inventory with its own settings and background image, saved as a backup file.
  const other = new Store(join(dir, 'other.sqlite'));
  const data = structuredClone(fixture); data.boxes[0].label = 'Restored label';
  other.importLegacy(data, { appearance: { language: 'en', background: 'custom' }, security: { publicApiKey: 'restored-public-key' } });
  other.transaction(() => other.setMedia('background', 'image/png', png));
  await other.backup(join(dir, 'backup.sqlite')); other.close();
  return { dir, store, upload, apply, backup: readFileSync(join(dir, 'backup.sqlite')) };
}

test('a full restore needs a checked upload and typed confirmation, replaces everything and keeps a safety backup', async t => {
  const { dir, store, upload, apply, backup } = await setup(t);
  const before = store.read();
  assert.equal((await upload(backup, 'read')).status, 401);
  const check = await upload(backup); assert.equal(check.status, 200);
  const { token, counts, current } = await check.json();
  assert.equal(counts.boxes, fixture.boxes.length); assert.equal(current.boxes, fixture.boxes.length);
  assert.deepEqual(store.read(), before, 'checking changes nothing');
  assert.equal((await apply({ token, confirm: 'restore' })).status, 400);
  assert.equal((await apply({ token: 'other', confirm: 'RESTORE' })).status, 409);
  const done = await apply({ token, confirm: 'RESTORE' }); assert.equal(done.status, 200);
  const result = await done.json(); assert.equal(result.audit.ok, true);
  assert.equal(store.read().boxes.find(b => b.boxId === fixture.boxes[0].boxId).label, 'Restored label');
  assert.equal(store.settings().security.publicApiKey, 'restored-public-key'); assert.deepEqual(store.media('background').data, png);
  // The previous data is kept next to the database, and the upload is gone.
  const safety = new Store(join(dir, 'restore-backups', result.safetyBackup), { readOnly: true });
  try { assert.deepEqual(safety.read(), before); } finally { safety.close(); }
  assert.deepEqual(readdirSync(join(dir, 'restore-uploads')), []);
  assert.equal((await apply({ token, confirm: 'RESTORE' })).status, 409, 'a token works once');
});

test('files that are not backups of this application, or fail the audit, are refused without changes', async t => {
  const { dir, store, upload, backup } = await setup(t);
  const before = store.read();
  assert.equal((await upload(Buffer.from('not a database'))).status, 400);
  const foreign = new DatabaseSync(join(dir, 'foreign.sqlite')); foreign.exec('CREATE TABLE notes (text TEXT)'); foreign.close();
  assert.equal((await upload(readFileSync(join(dir, 'foreign.sqlite')))).status, 400);
  const future = new Store(join(dir, 'future.sqlite')); future.db.exec('PRAGMA user_version = 99'); future.close();
  assert.equal((await upload(readFileSync(join(dir, 'future.sqlite')))).status, 400);
  // A damaged image fails the audit.
  writeFileSync(join(dir, 'damaged.sqlite'), backup);
  const damaged = new Store(join(dir, 'damaged.sqlite')); damaged.db.exec("UPDATE media SET data = zeroblob(8)"); damaged.close();
  assert.equal((await upload(readFileSync(join(dir, 'damaged.sqlite')))).status, 400);
  assert.deepEqual(store.read(), before); assert.deepEqual(readdirSync(join(dir, 'restore-uploads')), []);
});

test('a backup from schema 2 is migrated during the check and restores', async t => {
  const { dir, store, upload, apply, backup } = await setup(t);
  writeFileSync(join(dir, 'old.sqlite'), backup);
  const old = new Store(join(dir, 'old.sqlite')); old.db.exec("UPDATE settings SET record = json_set(record, '$.background', 'hills') WHERE id = 'appearance'; DROP TABLE media; PRAGMA user_version = 2"); old.close();
  const check = await (await upload(readFileSync(join(dir, 'old.sqlite')))).json(); assert.equal(check.sourceSchemaVersion, 2);
  assert.equal((await apply({ token: check.token, confirm: 'RESTORE' })).status, 200);
  assert.equal(store.read().boxes.find(b => b.boxId === fixture.boxes[0].boxId).label, 'Restored label'); assert.equal(store.media('background'), null); assert.equal(store.audit().ok, true);
});
