import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { InputError } from './validation.js';
import { unitVector } from './embeddings.js';

const hash = value => createHash('sha256').update(value).digest('hex');
export const documentVersion = 'current-contents-v1';

export function semanticDocument(box) {
  // Exclude historical contents, filenames, IDs and storage locations.
  const text = [box.label, box.summary, ...(box.itemKeywords || []),
    ...(box.photos || []).map(photo => photo.notes)].filter(value => typeof value === 'string' && value.trim()).join('\n');
  return { boxId: box.boxId, sessionId: box.sessionId || '', text, documentHash: hash(text) };
}

export class SemanticCache {
  constructor(path) {
    if (path !== ':memory:') mkdirSync(dirname(resolve(path)), { recursive: true });
    this.db = new DatabaseSync(path, { timeout: 5000 });
    try {
      const version = this.db.prepare('PRAGMA user_version').get().user_version;
      if (version > 1) throw new Error('Unsupported semantic cache schema.');
      const tables = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
      if (tables.some(row => row.name !== 'embeddings') || (version === 1 && !tables.length)) {
        throw new Error('Refusing to use a non-cache database as the semantic cache.');
      }
      this.db.exec(`PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;
        CREATE TABLE IF NOT EXISTS embeddings (
          box_id TEXT PRIMARY KEY NOT NULL, session_id TEXT NOT NULL,
          document_hash TEXT NOT NULL, profile TEXT NOT NULL, dimensions INTEGER NOT NULL,
          vector TEXT NOT NULL CHECK(json_valid(vector))
        ) STRICT; PRAGMA user_version = 1;`);
    } catch (error) { this.db.close(); throw error; }
  }
  close() { this.db.close(); }
  rows() { return this.db.prepare('SELECT * FROM embeddings ORDER BY box_id').all(); }
  put(doc, profile, dimensions, vector) {
    this.db.prepare(`INSERT INTO embeddings VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(box_id) DO UPDATE SET session_id=excluded.session_id, document_hash=excluded.document_hash,
      profile=excluded.profile, dimensions=excluded.dimensions, vector=excluded.vector`)
      .run(doc.boxId, doc.sessionId, doc.documentHash, profile, dimensions, JSON.stringify(unitVector(vector, dimensions)));
  }
  prune(ids) {
    const keep = new Set(ids);
    const remove = this.db.prepare('DELETE FROM embeddings WHERE box_id=?');
    for (const row of this.rows()) if (!keep.has(row.box_id)) remove.run(row.box_id);
  }
  audit() {
    const errors = [];
    if (this.db.prepare('PRAGMA integrity_check').all().some(row => row.integrity_check !== 'ok')) errors.push('SQLite integrity check failed.');
    for (const row of this.rows()) {
      try {
        if (!row.box_id || !/^[a-f0-9]{64}$/.test(row.document_hash) || !/^[a-f0-9]{64}$/.test(row.profile)
          || !Number.isInteger(row.dimensions) || row.dimensions < 1 || row.dimensions > 8192) throw new Error();
        const vector = JSON.parse(row.vector);
        unitVector(vector, row.dimensions);
        if (Math.abs(Math.hypot(...vector) - 1) > 1e-6) throw new Error();
      } catch { errors.push('Invalid cached vector metadata or values.'); }
    }
    return { ok: !errors.length, count: this.rows().length, errors };
  }
}

export class SemanticIndex {
  constructor({ inventory, cache, embedder }) {
    this.inventory = inventory; this.cache = cache; this.embedder = embedder;
    this.profile = hash(JSON.stringify({ documentVersion, ...embedder.profile }));
    this.dimensions = embedder.dimensions;
    this.running = null; this.pending = false; this.stopped = false;
    this.failed = false; this.queryBusy = false; this.unsubscribe = null;
  }
  documents() { return this.inventory.list().map(semanticDocument); }
  valid(row, doc) {
    if (!row || row.session_id !== doc.sessionId || row.document_hash !== doc.documentHash
      || row.profile !== this.profile || row.dimensions !== this.dimensions) return null;
    try {
      const vector = JSON.parse(row.vector);
      unitVector(vector, this.dimensions);
      return Math.abs(Math.hypot(...vector) - 1) <= 1e-6 ? vector : null;
    } catch { return null; }
  }
  status() {
    const docs = this.documents(), rows = new Map(this.cache.rows().map(row => [row.box_id, row]));
    const ready = docs.filter(doc => this.valid(rows.get(doc.boxId), doc)).length;
    return { state: this.stopped ? 'stopped' : this.running ? 'building' : ready === docs.length ? 'ready' : this.failed ? 'degraded' : 'pending',
      total: docs.length, ready, documentVersion, model: this.embedder.profile.model, modelRevision: this.embedder.profile.modelRevision };
  }
  start() {
    if (this.stopped) throw new InputError('Semantic index is stopped.', 409);
    this.unsubscribe ||= this.inventory.store.subscribe(() => { this.schedule(); });
    return this.schedule();
  }
  schedule() {
    if (this.stopped) return Promise.resolve();
    this.pending = true;
    if (!this.running) {
      // Never wait for inference inside the inventory write transaction/request.
      this.running = new Promise(resolve => setImmediate(resolve)).then(() => this.drain())
        .catch(() => { this.failed = true; }).finally(() => { this.running = null; });
    }
    return this.running;
  }
  async drain() {
    while (this.pending && !this.stopped) {
      this.pending = false; this.failed = false;
      const docs = this.documents(), rows = new Map(this.cache.rows().map(row => [row.box_id, row]));
      this.cache.prune(docs.map(doc => doc.boxId));
      for (const doc of docs) {
        if (this.stopped) return;
        if (this.valid(rows.get(doc.boxId), doc)) continue;
        try {
          const vector = await this.embedder.embed(doc.text);
          if (this.stopped) return;
          const current = this.documents().find(item => item.boxId === doc.boxId);
          if (!current || current.documentHash !== doc.documentHash || current.sessionId !== doc.sessionId) {
            this.pending = true; continue;
          }
          this.cache.put(doc, this.profile, this.dimensions, vector);
        } catch {
          // No automatic retry storm. Explicit retry or a subsequent write can retry.
          this.failed = true; this.pending = false; return;
        }
      }
    }
  }
  async stop() {
    this.stopped = true; this.unsubscribe?.(); this.unsubscribe = null;
    await this.running;
  }
  async search(query) {
    if (typeof query !== 'string' || !query.trim() || query.length > 2000) throw new InputError('A bounded nonempty query is required.');
    const unavailable = reason => ({ available: false, reason, semanticMatches: [] });
    if (this.stopped || this.status().state !== 'ready') return unavailable('index_not_ready');
    if (this.queryBusy || this.running) return unavailable('embedding_busy');
    this.queryBusy = true;
    try {
      const docs = this.documents(), snapshot = hash(JSON.stringify(docs));
      const queryVector = unitVector(await this.embedder.embed(query), this.dimensions);
      if (this.stopped || snapshot !== hash(JSON.stringify(this.documents())) || this.status().state !== 'ready') return unavailable('inventory_changed');
      const rows = new Map(this.cache.rows().map(row => [row.box_id, row]));
      const semanticMatches = [];
      for (const doc of docs) {
        const vector = this.valid(rows.get(doc.boxId), doc);
        if (!vector) return unavailable('index_not_ready');
        const similarity = Math.max(-1, Math.min(1, vector.reduce((sum, n, i) => sum + n * queryVector[i], 0)));
        semanticMatches.push({ boxId: doc.boxId, ...(doc.sessionId ? { sessionId: doc.sessionId } : {}), similarity });
      }
      semanticMatches.sort((a, b) => b.similarity - a.similarity || a.boxId.localeCompare(b.boxId));
      return { available: true, semanticMatches };
    } catch { return unavailable('embedding_unavailable'); }
    finally { this.queryBusy = false; }
  }
}
