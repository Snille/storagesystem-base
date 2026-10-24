import { createWriteStream, mkdirSync, rmSync, readSync, openSync, closeSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { InputError } from './validation.js';
import { checkBackup } from './store.js';

const maxBytes = 512 * 1024 * 1024;
const header = Buffer.from('SQLite format 3\0', 'latin1');
// Opening the copy can leave SQLite's write-ahead files beside it.
const removeUpload = path => { for (const suffix of ['', '-wal', '-shm', '-journal']) rmSync(path + suffix, { force: true }); };

// Restoring a full SQLite backup from the browser takes two steps: upload and check, then
// confirm. Before replacing anything, the current database is saved as a safety backup.
export class RestoreService {
  constructor(store) {
    this.store = store; this.pending = null;
    const base = store.path === ':memory:' ? join(tmpdir(), 'storage-system') : dirname(resolve(store.path));
    this.uploads = join(base, 'restore-uploads'); this.backups = join(base, 'restore-backups');
  }
  discard() { if (this.pending) removeUpload(this.pending.path); this.pending = null; }

  async upload(req) {
    this.discard(); mkdirSync(this.uploads, { recursive: true, mode: 0o700 });
    const path = join(this.uploads, `${randomUUID()}.sqlite`); let size = 0;
    const limit = new Transform({ transform(chunk, _, done) {
      size += chunk.length; done(size > maxBytes ? new InputError('The backup exceeds 512 MiB.', 413) : null, chunk);
    } });
    try {
      await pipeline(req, limit, createWriteStream(path, { flags: 'wx', mode: 0o600 }));
      const start = Buffer.alloc(header.length), fd = openSync(path, 'r');
      try { readSync(fd, start, 0, header.length, 0); } finally { closeSync(fd); }
      if (!start.equals(header)) throw new InputError('The file is not an SQLite backup from this application.');
      const audit = checkBackup(path);
      if (!audit.ok) throw new InputError(`The backup failed the data check: ${audit.errors.join(' ')}`);
      this.pending = { token: randomUUID(), path, expires: Date.now() + 10 * 60 * 1000 };
      return { token: this.pending.token, counts: audit.counts, sourceSchemaVersion: audit.sourceSchemaVersion, current: this.store.audit().counts };
    } catch (error) {
      removeUpload(path);
      throw error instanceof InputError ? error : new InputError('The backup could not be read.');
    }
  }

  async apply(input) {
    if (!this.pending || input?.token !== this.pending.token) throw new InputError('Upload and check the backup again before restoring.', 409);
    if (Date.now() > this.pending.expires) { this.discard(); throw new InputError('The checked backup expired. Upload it again.', 409); }
    if (input.confirm !== 'RESTORE') throw new InputError('Type RESTORE to confirm.');
    mkdirSync(this.backups, { recursive: true, mode: 0o700 });
    const name = `before-restore-${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`;
    await this.store.backup(join(this.backups, name));
    try { return { audit: this.store.replaceFrom(this.pending.path), safetyBackup: name }; }
    finally { this.discard(); }
  }
}
