import { InputError, object, validateLabelService } from './validation.js';
import { sourceRevision } from './settings.js';
import { presentLocation } from './inventory.js';
import { LabelServiceClient } from './label-client.js';

const fingerprint = box => sourceRevision({ boxId: box.boxId, sessionId: box.sessionId, label: box.label, locationId: box.locationId, summary: box.summary });
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;

// Labels are laid out, previewed and printed by the label service. This side chooses the content
// (a box or a registered location) and makes sure it has not changed between preview and print.
export class Printing {
  constructor(inventory, { env = {}, clientFactory = config => new LabelServiceClient(config) } = {}) {
    this.inventory = inventory; this.store = inventory.store; this.env = env; this.clientFactory = clientFactory; this.previews = new Map();
  }
  config() {
    return this.store.settings().labelService || {
      enabled: Boolean(this.env.LABEL_SERVICE_URL && this.env.LABEL_SERVICE_KEY), url: this.env.LABEL_SERVICE_URL || '',
      ...(this.env.LABEL_SERVICE_KEY ? { apiKey: this.env.LABEL_SERVICE_KEY } : {})
    };
  }
  revision() { return sourceRevision(this.config()); }
  view() {
    const { apiKey, ...config } = this.config();
    return { config: { ...config, apiKeyConfigured: Boolean(apiKey) }, revision: this.revision(), locations: this.store.locationIds(),
      usingEnvironment: !this.store.settings().labelService && Boolean(this.env.LABEL_SERVICE_URL) };
  }
  assertRevision(revision) { if (revision !== this.revision()) throw new InputError('Print settings changed. Create a new preview before printing.', 409); }
  save(input) {
    object(input);
    if (Object.keys(input).some(k => !['revision', 'config'].includes(k))) throw new InputError('Unsupported print setting.');
    const submitted = object(input.config, 'config');
    if (Object.keys(submitted).some(k => !['enabled', 'url', 'apiKey', 'clearKey'].includes(k))) throw new InputError('Unsupported label service setting.');
    if (submitted.apiKey !== undefined && typeof submitted.apiKey !== 'string') throw new InputError('Invalid label service key.');
    return this.store.transaction(() => {
      this.assertRevision(input.revision);
      const old = this.config(), url = typeof submitted.url === 'string' ? submitted.url.trim().replace(/\/+$/, '') : submitted.url;
      const config = { enabled: submitted.enabled, url };
      // Keep the saved key for the same service unless a new one is typed or it is cleared on purpose.
      if (old.apiKey && old.url === url && !submitted.clearKey) config.apiKey = old.apiKey;
      if (submitted.apiKey?.trim()) config.apiKey = submitted.apiKey.trim();
      this.store.writeSettings({ labelService: validateLabelService(config) });
      return this.view();
    });
  }
  client(config = this.config()) {
    if (!config.enabled || !config.url || !config.apiKey) throw new InputError('Printing is disabled. Save the label service address and key first.', 409);
    return this.clientFactory(config);
  }
  async status() {
    const client = this.client(), [status, formats] = await Promise.all([client.status(), client.formats()]);
    return { ...status, media: formats.media };
  }
  async preview(input, language) {
    object(input);
    if (Object.keys(input).some(k => !['revision', 'kind', 'test', 'boxId', 'locationId', 'fields'].includes(k)) || (input.test !== undefined && typeof input.test !== 'boolean')
      || (input.kind !== undefined && !['box', 'location'].includes(input.kind))) throw new InputError('Unsupported label preview request.');
    this.assertRevision(input.revision);
    const kind = input.kind || 'box';
    let box, locationId, fields, reference;
    if (input.test === true) {
      if (input.boxId || input.locationId || input.fields) throw new InputError('Test labels use fixed sample text.');
    } else if (kind === 'location') {
      if (input.boxId !== undefined || typeof input.locationId !== 'string') throw new InputError('Choose a registered location or a test label.');
      if (!this.store.locationIds().includes(input.locationId)) throw new InputError('Location not found.', 404);
      locationId = input.locationId; reference = `location:${locationId}`.slice(0, 200);
      fields = input.fields || { location: Object.values(presentLocation(locationId, '', this.inventory.language(language))).filter(Boolean).join(', ') };
    } else {
      if (input.locationId !== undefined || typeof input.boxId !== 'string') throw new InputError('Choose an inventory box or a test label.');
      box = this.inventory.get(input.boxId, language); if (!box) throw new InputError('Box not found.', 404);
      reference = `box:${box.boxId}`.slice(0, 200);
      fields = input.fields || { title: box.label, description: box.summary || '', location: Object.values(box.location).filter(Boolean).join(', ') };
    }
    const result = await this.client().preview({ kind, ...(input.test === true ? { test: true } : { fields, reference }) });
    this.assertRevision(input.revision);
    const now = Date.now(); for (const [id, p] of this.previews) if (p.expires <= now) this.previews.delete(id);
    if (this.previews.size >= 100) throw new InputError('Too many label previews. Wait for an older preview to expire.', 429);
    this.previews.set(result.token, { revision: input.revision, boxId: box?.boxId, boxFingerprint: box ? fingerprint(box) : null, locationId, language,
      expires: Math.min(Date.parse(result.expiresAt) || now, now + 10 * 60 * 1000) });
    return { token: result.token, kind, fields: result.fields, layout: result.layout, printable: result.printable, boxId: box?.boxId, locationId, test: input.test === true };
  }
  assertPreview(preview) {
    this.assertRevision(preview.revision);
    if (Date.now() >= preview.expires) throw new InputError('Label preview expired. Create a new preview.', 409);
    if (preview.locationId && !this.store.locationIds().includes(preview.locationId)) throw new InputError('Location is no longer registered. Create a new label preview.', 409);
    if (preview.boxId) {
      const current = this.inventory.get(preview.boxId, preview.language);
      if (!current || fingerprint(current) !== preview.boxFingerprint) throw new InputError('Box contents or location changed. Create a new label preview.', 409);
    }
  }
  async submit(input) {
    object(input);
    if (Object.keys(input).some(k => !['token', 'requestId'].includes(k)) || typeof input.requestId !== 'string' || !uuid.test(input.requestId)
      || typeof input.token !== 'string' || !uuid.test(input.token)) throw new InputError('Use a valid preview token and print request identifier.');
    const preview = this.previews.get(input.token); if (!preview) throw new InputError('Create a new label preview before printing.', 409);
    this.assertPreview(preview);
    // The label service deduplicates by request identifier, so resending after a lost response cannot print twice.
    return this.client().submit({ token: input.token, requestId: input.requestId });
  }
  async jobs() { return (await this.client().jobs()).jobs; }
  async job(id) { return this.client().job(id); }
}
