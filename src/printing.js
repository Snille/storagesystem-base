import { randomUUID, createHash } from 'node:crypto';
import { InputError, object, validatePrinting } from './validation.js';
import { sourceRevision } from './settings.js';
import { CupsPrinter } from './ipp.js';
import { defaultLabelStyle, labelMedia, labelMediaPresets, labelLayout, labelPostScript, testLabel } from './labels.js';
import { readDymoRoll } from './dymo-roll.js';
const hash = input => createHash('sha256').update(input).digest('hex');
const fingerprint = box => sourceRevision({ boxId: box.boxId, sessionId: box.sessionId, label: box.label, locationId: box.locationId, summary: box.summary });

export class Printing {
  constructor(inventory, { printerFactory = config => new CupsPrinter(config), rollReader = readDymoRoll } = {}) {
    this.inventory = inventory; this.store = inventory.store; this.printerFactory = printerFactory; this.previews = new Map(); this.busy = false;
    this.rollReader = rollReader; this.lastRollCheck = 0;
  }
  config() { return this.store.settings().printing || { enabled: false, serverUrl: '', queue: '', mediaKey: labelMedia.key, style: defaultLabelStyle }; }
  view() { return { config: this.config(), revision: sourceRevision(this.config()), media: labelMediaPresets.find(p => p.key === this.config().mediaKey), mediaPresets: labelMediaPresets, jobs: this.store.printJobs().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 20) }; }
  assertRevision(revision) { if (revision !== sourceRevision(this.config())) throw new InputError('Print settings changed. Create a new preview before printing.', 409); }
  save(input) {
    object(input);
    if (Object.keys(input).some(k => !['revision', 'config'].includes(k))) throw new InputError('Unsupported print setting.');
    return this.store.transaction(() => {
      this.assertRevision(input.revision); const config = validatePrinting(input.config);
      this.store.writeSettings({ printing: config }); return this.view();
    });
  }
  printer(config = this.config()) { if (!config.enabled) throw new InputError('Printing is disabled. Save and enable the CUPS connection first.', 409); return this.printerFactory(config); }
  async status() {
    const config = this.config(), revision = sourceRevision(config);
    const status = await this.printer(config).status(); this.assertRevision(revision);
    return { ...status, revision, queue: config.queue };
  }
  async readRoll(input) {
    object(input);
    if (Object.keys(input).some(k => k !== 'revision')) throw new InputError('Unsupported roll-reading request.');
    this.assertRevision(input.revision); const config = this.config();
    if (!config.rollReader?.enabled) throw new InputError('Enable and save the DYMO roll reader first.', 409);
    if (this.busy || Date.now() - this.lastRollCheck < 5000) throw new InputError('Wait before reading the roll again.', 429);
    this.busy = true; this.lastRollCheck = Date.now();
    try {
      const queue = await this.printer(config).status(); this.assertRevision(input.revision);
      if (queue.state !== 'idle' || queue.queuedJobs !== 0) throw new InputError('Read the roll only while the CUPS queue is idle and empty.', 409);
      const roll = await this.rollReader(config.rollReader); this.assertRevision(input.revision);
      return { roll, revision: input.revision };
    } finally { this.busy = false; }
  }
  preview(input, language) {
    object(input);
    if (Object.keys(input).some(k => !['revision', 'test', 'boxId', 'fields'].includes(k)) || (input.test !== undefined && typeof input.test !== 'boolean')) throw new InputError('Unsupported label preview request.');
    this.assertRevision(input.revision);
    let box, fields;
    if (input.test === true) {
      if (input.boxId || input.fields) throw new InputError('Test labels use fixed sample text.');
      const media = this.view().media;
      fields = { ...testLabel, location: `TEST - ${media.widthMm} x ${media.heightMm} mm` };
    }
    else {
      if (typeof input.boxId !== 'string') throw new InputError('Choose an inventory box or a test label.');
      box = this.inventory.get(input.boxId, language); if (!box) throw new InputError('Box not found.', 404);
      fields = input.fields || { title: box.label, description: box.summary || '', location: Object.values(box.location).filter(Boolean).join(', ') };
    }
    const config = this.config(), layout = labelLayout(fields, config.style, config.mediaKey), token = randomUUID();
    const now = Date.now(); for (const [id, p] of this.previews) if (p.expires <= now) this.previews.delete(id);
    if (this.previews.size >= 100) throw new InputError('Too many label previews. Wait for an older preview to expire.', 429);
    this.previews.set(token, { config, revision: input.revision, fields, layout, document: labelPostScript(layout),
      expires: now + 10 * 60 * 1000, boxId: box?.boxId, boxFingerprint: box ? fingerprint(box) : null, language });
    return { token, revision: input.revision, layout, fields, boxId: box?.boxId, test: input.test === true };
  }
  assertPreview(preview) {
    this.assertRevision(preview.revision);
    if (Date.now() >= preview.expires) throw new InputError('Label preview expired. Create a new preview.', 409);
    if (preview.boxId) {
      const current = this.inventory.get(preview.boxId, preview.language);
      if (!current || fingerprint(current) !== preview.boxFingerprint) throw new InputError('Box contents or location changed. Create a new label preview.', 409);
    }
  }
  async submit(input) {
    object(input);
    if (Object.keys(input).some(k => !['token', 'requestId'].includes(k)) || !/^[a-f0-9-]{36}$/.test(input.requestId)
      || typeof input.token !== 'string' || !/^[a-f0-9-]{36}$/.test(input.token)) throw new InputError('Use a valid preview token and print request identifier.');
    const tokenHash = hash(input.token), existing = this.store.printJobs().find(j => j.id === input.requestId);
    if (existing) {
      if (existing.tokenHash !== tokenHash) throw new InputError('Print request identifier is already used by another preview.', 409);
      return existing;
    }
    const preview = this.previews.get(input.token); if (!preview) throw new InputError('Create a new label preview before printing.', 409);
    this.assertPreview(preview);
    if (preview.layout.warnings.length) throw new InputError('Label text does not fit. Shorten the label text or reduce font sizes before printing.', 409);
    if (this.busy) throw new InputError('Another print submission is in progress. Check its status first.', 429);
    this.busy = true; let claimed = false, sent = false;
    try {
      const printer = this.printer(preview.config), status = await printer.status(); this.assertPreview(preview);
      if (!status.acceptingJobs || status.state === 'stopped' || !status.formats.includes('application/postscript')) throw new InputError('The queue is stopped, not accepting jobs or does not support PostScript.', 409);
      await printer.validate(preview.config.mediaKey, 'Storage System Base label'); this.assertPreview(preview);
      const claim = this.store.claimPrint({ id: input.requestId, tokenHash, documentHash: hash(preview.document), settingsRevision: preview.revision,
        serverUrl: preview.config.serverUrl, queue: preview.config.queue, mediaKey: preview.config.mediaKey, createdAt: new Date().toISOString(), state: 'submitting',
        ...(preview.boxId ? { boxId: preview.boxId } : {}) });
      if (!claim.claimed) return claim.job;
      claimed = true; sent = true;
      const jobId = await printer.print(preview.config.mediaKey, 'Storage System Base label', preview.document);
      return this.store.updatePrint(input.requestId, { state: 'submitted', jobId });
    } catch (error) {
      if (claimed) {
        // A lost response may follow a successful physical submission. Never retry it.
        return this.store.updatePrint(input.requestId, { state: sent ? 'unknown' : 'rejected' });
      }
      throw error;
    } finally { this.busy = false; }
  }
  async job(id) {
    const record = this.store.printJobs().find(job => job.id === id); if (!record) throw new InputError('Print job not found.', 404);
    if (!record.jobId) return { record, status: null };
    const status = await this.printerFactory(record).job(record.jobId);
    return { record, status };
  }
}
