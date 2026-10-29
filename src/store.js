import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, existsSync, openSync, closeSync, unlinkSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { InputError, validateSettings, validateInventory, validatePrintJob } from './validation.js';
import { validateSearchEntry, historyQueryKey, historyDays, historyLimit } from './search-history.js';

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

const printSchema = `CREATE TABLE print_jobs (
  id TEXT PRIMARY KEY NOT NULL, token_hash TEXT UNIQUE NOT NULL,
  record TEXT NOT NULL CHECK(json_valid(record) AND json_extract(record, '$.id') = id AND json_extract(record, '$.tokenHash') = token_hash)
) STRICT; PRAGMA user_version = 2;`;

// Small images owned by the application, such as an uploaded page background.
export const mediaTypes = ['image/jpeg', 'image/png', 'image/webp'];
export const maxMediaBytes = 5 * 1024 * 1024;
const mediaSchema = `CREATE TABLE media (
  id TEXT PRIMARY KEY NOT NULL, mime TEXT NOT NULL CHECK(mime IN ('image/jpeg', 'image/png', 'image/webp')),
  sha256 TEXT NOT NULL CHECK(length(sha256) = 64), data BLOB NOT NULL CHECK(length(data) BETWEEN 1 AND ${maxMediaBytes})
) STRICT; PRAGMA user_version = 3;`;
const searchSchema = `CREATE TABLE search_history (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL,
  created_at TEXT NOT NULL, source TEXT NOT NULL CHECK(source IN ('web', 'api', 'mcp', 'preview')),
  query_key TEXT NOT NULL,
  record TEXT NOT NULL CHECK(json_valid(record) AND json_extract(record, '$.id') = id
    AND json_extract(record, '$.createdAt') = created_at AND json_extract(record, '$.source') = source)
) STRICT;
CREATE INDEX search_history_created ON search_history(created_at);
PRAGMA user_version = 4;`;
const signatures = { 'image/jpeg': [0xff, 0xd8, 0xff], 'image/png': [0x89, 0x50, 0x4e, 0x47], 'image/webp': [0x52, 0x49, 0x46, 0x46] };
export const mediaMatchesType = (mime, data) => signatures[mime]?.every((byte, i) => data[i] === byte)
  && (mime !== 'image/webp' || data.subarray(8, 12).toString('latin1') === 'WEBP');

export class Store {
  constructor(path, { readOnly = false } = {}) {
    this.path = path;
    this.listeners = new Set();
    if (!readOnly && path !== ':memory:') mkdirSync(dirname(resolve(path)), { recursive: true });
    this.db = new DatabaseSync(path, { readOnly, timeout: 5000 });
    try {
      this.db.exec('PRAGMA foreign_keys = ON; PRAGMA trusted_schema = OFF;');
      const version = this.db.prepare('PRAGMA user_version').get().user_version;
      if (version > 4 || (readOnly && ![1, 2, 3, 4].includes(version))) throw new Error(`Unsupported database schema: ${version}`);
      if (!readOnly) {
        this.db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;');
        if (!version) this.transaction(() => this.db.exec(schema));
        if (version < 2) this.transaction(() => this.db.exec(printSchema));
        if (version < 3) this.transaction(() => this.db.exec(mediaSchema));
        if (version < 4) this.transaction(() => this.db.exec(searchSchema));
      }
    } catch (error) { this.close(); throw error; }
  }

  close() { this.db.close(); }

  transaction(work, { notify = true } = {}) {
    this.db.exec('BEGIN IMMEDIATE');
    let result;
    try { result = work(); this.db.exec('COMMIT'); }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
    if (notify) for (const listener of this.listeners) { try { listener(); } catch { /* A background task cannot fail a committed inventory write. */ } }
    return result;
  }

  subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }

  addSearchEntry(entry) {
    validateSearchEntry(entry);
    this.transaction(() => {
      this.db.prepare('INSERT INTO search_history (id, created_at, source, query_key, record) VALUES (?, ?, ?, ?, ?)')
        .run(entry.id, entry.createdAt, entry.source, historyQueryKey(entry.query), JSON.stringify(entry));
      this.db.prepare('DELETE FROM search_history WHERE created_at < ?').run(new Date(Date.now() - historyDays * 86400000).toISOString());
      this.db.prepare('DELETE FROM search_history WHERE sequence NOT IN (SELECT sequence FROM search_history ORDER BY sequence DESC LIMIT ?)').run(historyLimit);
    }, { notify: false });
  }

  // Read-only journal of jobs submitted directly to CUPS by 0.12-0.14. The label service keeps the journal now.
  printJobs() {
    if (this.db.prepare('PRAGMA user_version').get().user_version < 2) return [];
    return this.db.prepare('SELECT record FROM print_jobs ORDER BY id').all().map(row => JSON.parse(row.record));
  }

  media(id) {
    if (this.db.prepare('PRAGMA user_version').get().user_version < 3) return null;
    const row = this.db.prepare('SELECT mime, sha256, data FROM media WHERE id = ?').get(id);
    return row ? { mime: row.mime, sha256: row.sha256, data: Buffer.from(row.data) } : null;
  }
  // Callers write media inside their own transaction together with the settings that refer to it.
  setMedia(id, mime, data) {
    if (!mediaTypes.includes(mime) || !data.length || data.length > maxMediaBytes || !mediaMatchesType(mime, data)) throw new InputError('Use a JPEG, PNG or WebP image of at most 5 MiB.');
    const sha256 = createHash('sha256').update(data).digest('hex');
    this.db.prepare('INSERT INTO media VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET mime = excluded.mime, sha256 = excluded.sha256, data = excluded.data').run(id, mime, sha256, data);
    return sha256;
  }
  deleteMedia(id) { this.db.prepare('DELETE FROM media WHERE id = ?').run(id); }

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

  locationIds() { return this.db.prepare('SELECT id FROM locations ORDER BY id').all().map(row => row.id); }

  addLocation(id) {
    this.transaction(() => this.db.prepare('INSERT OR IGNORE INTO locations VALUES (?)').run(id));
  }

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
    try { for (const job of this.printJobs()) validatePrintJob(job); } catch { errors.push('Invalid print job journal.'); }
    if (this.db.prepare('PRAGMA user_version').get().user_version >= 4) {
      try {
        for (const row of this.db.prepare('SELECT query_key, record FROM search_history').all()) {
          const entry = validateSearchEntry(JSON.parse(row.record));
          if (row.query_key !== historyQueryKey(entry.query)) throw new Error();
        }
      } catch { errors.push('Invalid search history.'); }
    }
    if (this.db.prepare('PRAGMA user_version').get().user_version >= 3) {
      for (const row of this.db.prepare('SELECT id, mime, sha256, data FROM media').all()) {
        const data = Buffer.from(row.data);
        if (createHash('sha256').update(data).digest('hex') !== row.sha256 || !mediaMatchesType(row.mime, data)) errors.push(`Media ${row.id} is damaged.`);
      }
      const settings = this.settings();
      if (settings.appearance?.background === 'custom' && !this.media('background')) errors.push('The custom background has no image.');
    }
    const counts = Object.fromEntries(['boxes', 'sessions', 'photos', 'locations'].map(t => [t, this.db.prepare(`SELECT count(*) AS n FROM ${t}`).get().n]));
    return { ok: errors.length === 0, schemaVersion: this.db.prepare('PRAGMA user_version').get().user_version, counts, errors };
  }

  // Replaces every table with a checked backup in one transaction, so a failure changes nothing.
  // The backup must already have passed checkBackup (current schema, audit ok).
  replaceFrom(sourcePath) {
    this.db.prepare('ATTACH DATABASE ? AS src').run(resolve(sourcePath));
    try {
      this.transaction(() => {
        for (const table of [...tables].reverse()) this.db.exec(`DELETE FROM main.${table}`);
        for (const table of tables) this.db.exec(`INSERT INTO main.${table} SELECT * FROM src.${table}`);
        const audit = this.audit();
        if (!audit.ok) throw new InputError(`The restored data failed the audit: ${audit.errors.join(' ')}`);
      });
    } finally { this.db.exec('DETACH DATABASE src'); }
    return this.audit();
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

const tables = ['locations', 'boxes', 'sessions', 'photos', 'settings', 'print_jobs', 'media', 'search_history'];

// Opens an uploaded backup copy, refusing anything that is not one of this application's
// databases, migrates it to the current schema in place and audits it. The copy is changed;
// the caller keeps the uploaded original only as that copy.
export function checkBackup(path) {
  let version;
  try {
    const probe = new DatabaseSync(path, { readOnly: true });
    try { version = probe.prepare('PRAGMA user_version').get().user_version; } finally { probe.close(); }
  } catch { throw new InputError('The file is not an SQLite backup from this application.'); }
  if (![1, 2, 3, 4].includes(version)) throw new InputError(version > 4 ? 'The backup is from a newer version of this application.' : 'The file is not an SQLite backup from this application.');
  let store;
  try { store = new Store(path); } catch { throw new InputError('The backup could not be opened.'); }
  try { return { ...store.audit(), sourceSchemaVersion: version }; } finally { store.close(); }
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
