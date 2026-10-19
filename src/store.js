import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, existsSync, openSync, closeSync, unlinkSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { InputError, validateSettings, validateInventory } from './validation.js';

const schema = `
CREATE TABLE locations (id TEXT PRIMARY KEY NOT NULL CHECK(length(trim(id)) > 0)) STRICT;
CREATE TABLE boxes (
  id TEXT PRIMARY KEY NOT NULL,
  location_id TEXT NOT NULL REFERENCES locations(id),
  record TEXT NOT NULL CHECK(json_valid(record) AND json_extract(record, '$.boxId') = id
    AND json_extract(record, '$.currentLocationId') = location_id)
) STRICT;
CREATE TABLE sessions (
  id TEXT PRIMARY KEY NOT NULL,
  box_id TEXT NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  is_current INTEGER NOT NULL CHECK(is_current IN (0, 1)),
  record TEXT NOT NULL CHECK(json_valid(record) AND json_extract(record, '$.sessionId') = id
    AND json_extract(record, '$.boxId') = box_id AND json_extract(record, '$.isCurrent') = is_current)
) STRICT;
CREATE UNIQUE INDEX one_current_session ON sessions(box_id) WHERE is_current = 1;
CREATE INDEX sessions_box ON sessions(box_id);
CREATE TABLE photos (
  id TEXT PRIMARY KEY NOT NULL,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  asset_id TEXT NOT NULL,
  record TEXT NOT NULL CHECK(json_valid(record) AND json_extract(record, '$.photoId') = id
    AND json_extract(record, '$.sessionId') = session_id AND json_extract(record, '$.immichAssetId') = asset_id)
) STRICT;
CREATE INDEX photos_session ON photos(session_id);
CREATE TABLE settings (id TEXT PRIMARY KEY NOT NULL, record TEXT NOT NULL CHECK(json_valid(record))) STRICT;
PRAGMA user_version = 1;
`;

export class Store {
  constructor(path, { readOnly = false } = {}) {
    this.path = path;
    if (!readOnly && path !== ':memory:') mkdirSync(dirname(resolve(path)), { recursive: true });
    this.db = new DatabaseSync(path, { readOnly, timeout: 5000 });
    try {
      this.db.exec('PRAGMA foreign_keys = ON; PRAGMA trusted_schema = OFF;');
      const version = this.db.prepare('PRAGMA user_version').get().user_version;
      if (version > 1 || (readOnly && version !== 1)) throw new Error(`Unsupported database schema: ${version}`);
      if (!readOnly) {
        this.db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;');
        if (!version) this.transaction(() => this.db.exec(schema));
      }
    } catch (error) { this.close(); throw error; }
  }

  close() { this.db.close(); }

  transaction(work) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = work(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }

  read() {
    // A consistent snapshot, including when a maintenance CLI runs concurrently.
    const snapshot = () => Object.fromEntries(['boxes', 'sessions', 'photos'].map(table =>
      [table, this.db.prepare(`SELECT record FROM ${table} ORDER BY id`).all().map(row => JSON.parse(row.record))]));
    if (this.db.isTransaction) return snapshot();
    this.db.exec('BEGIN');
    try { const result = snapshot(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }

  settings() { return Object.fromEntries(this.db.prepare('SELECT id, record FROM settings ORDER BY id').all().map(r => [r.id, JSON.parse(r.record)])); }

  writeSettings(settings) {
    for (const [id, value] of Object.entries(validateSettings(settings))) {
      this.db.prepare('INSERT INTO settings VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET record = excluded.record').run(id, JSON.stringify(value));
    }
  }

  insert(data) {
    for (const box of data.boxes) {
      this.db.prepare('INSERT OR IGNORE INTO locations VALUES (?)').run(box.currentLocationId);
      this.db.prepare('INSERT INTO boxes VALUES (?, ?, ?)').run(box.boxId, box.currentLocationId, JSON.stringify(box));
    }
    for (const session of data.sessions) this.db.prepare('INSERT INTO sessions VALUES (?, ?, ?, ?)').run(session.sessionId, session.boxId, Number(session.isCurrent), JSON.stringify(session));
    for (const photo of data.photos) this.db.prepare('INSERT INTO photos VALUES (?, ?, ?, ?)').run(photo.photoId, photo.sessionId, photo.immichAssetId, JSON.stringify(photo));
  }

  importLegacy(input, settings = {}) {
    validateInventory(input); validateSettings(settings);
    return this.transaction(() => {
      if (this.db.prepare('SELECT count(*) AS n FROM boxes').get().n || this.db.prepare('SELECT count(*) AS n FROM settings').get().n) {
        throw new InputError('Import requires an empty database. Restore into a fresh instance.', 409);
      }
      this.insert(input); this.writeSettings(settings);
      return { boxes: input.boxes.length, sessions: input.sessions.length, photos: input.photos.length };
    });
  }

  mutate(work) {
    return this.transaction(() => {
      const data = this.read(); const result = work(data); validateInventory(data);
      this.db.exec('DELETE FROM photos; DELETE FROM sessions; DELETE FROM boxes;');
      this.insert(data);
      return result;
    });
  }

  audit() {
    const errors = [];
    const integrity = this.db.prepare('PRAGMA integrity_check').all();
    if (integrity.some(r => r.integrity_check !== 'ok')) errors.push('SQLite integrity check failed.');
    if (this.db.prepare('PRAGMA foreign_key_check').all().length) errors.push('Broken foreign keys.');
    try { validateInventory(this.read()); validateSettings(this.settings()); } catch (error) { errors.push(error.message); }
    const counts = Object.fromEntries(['boxes', 'sessions', 'photos', 'locations'].map(t => [t, this.db.prepare(`SELECT count(*) AS n FROM ${t}`).get().n]));
    return { ok: errors.length === 0, schemaVersion: this.db.prepare('PRAGMA user_version').get().user_version, counts, errors };
  }

  async backup(destination) {
    if (this.path !== ':memory:' && resolve(destination) === resolve(this.path)) throw new InputError('Backup destination must differ from the active database.');
    // Reserve the path atomically; never overwrite a previous backup.
    const fd = openSync(destination, 'wx', 0o600); closeSync(fd);
    // VACUUM INTO produces a consistent SQLite snapshot without copying live WAL files.
    // Keep this synchronous like other database work; Node's asynchronous backup
    // stalled intermittently in the Windows test runner on Node 26.5.1.
    try { this.db.prepare('VACUUM main INTO ?').run(resolve(destination)); }
    catch (error) { unlinkSync(destination); throw error; }
  }
}

export async function restore(source, destination) {
  if (!existsSync(source)) throw new InputError('Backup does not exist.');
  if (existsSync(destination)) throw new InputError('Restore destination already exists.', 409);
  const input = new Store(source, { readOnly: true });
  try {
    const audit = input.audit();
    if (!audit.ok) throw new InputError(`Backup audit failed: ${audit.errors.join(' ')}`);
    await input.backup(destination);
    return audit;
  } finally { input.close(); }
}
