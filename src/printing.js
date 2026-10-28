import { InputError, object, validateLabelService, validateLabelTemplates, labelFunctions, labelTemplateId } from './validation.js';
import { sourceRevision } from './settings.js';
import { presentLocation } from './inventory.js';
import { LabelServiceClient } from './label-client.js';

const fingerprint = box => sourceRevision({ boxId: box.boxId, sessionId: box.sessionId, label: box.label, locationId: box.locationId, summary: box.summary });
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
// The fields each label function can fill. A template suits a function when it asks only for these fields.
const provided = { box: ['title', 'description', 'location', 'boxId'], location: ['location', 'locationId'], unit: ['unit', 'kind', 'name', 'unitId'] };
const editable = ['title', 'description', 'location', 'unit', 'kind', 'name'];
// The label service's built-in templates carry the function's name; they are the standard until another is chosen.
const builtInChoice = Object.fromEntries(labelFunctions.map(f => [f, { default: f, extra: [] }]));

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
    return { config: { ...config, apiKeyConfigured: Boolean(apiKey) }, revision: this.revision(), locations: this.store.locationIds(), functions: this.functions(),
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
  functions() { return { ...builtInChoice, ...this.store.settings().labelTemplates }; }
  saveFunctions(input) {
    object(input);
    if (Object.keys(input).some(k => k !== 'functions')) throw new InputError('Unsupported label template setting.');
    return this.store.transaction(() => { this.store.writeSettings({ labelTemplates: validateLabelTemplates(input.functions) }); return this.functions(); });
  }
  // Every template the label service offers this system, with the functions it suits and whether it fits the loaded roll.
  async templates() {
    const client = this.client(), [list, formats] = await Promise.all([client.templates(), client.formats()]);
    const templates = list.templates.filter(t => labelTemplateId.test(t.id)).map(t => {
      const fields = Object.keys(t.fields || {}), media = t.media || ['*'];
      return { id: t.id, name: t.name, builtIn: Boolean(t.builtIn), fields, functions: labelFunctions.filter(f => fields.every(k => provided[f].includes(k))),
        fitsRoll: media.includes('*') || media.includes(formats.mediaKey) };
    });
    return { templates, functions: this.functions(), media: formats.media };
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
    if (Object.keys(input).some(k => !['revision', 'kind', 'template', 'test', 'boxId', 'locationId', 'unitId', 'fields'].includes(k)) || (input.test !== undefined && typeof input.test !== 'boolean')
      || (input.kind !== undefined && !labelFunctions.includes(input.kind))
      || (input.template !== undefined && (typeof input.template !== 'string' || !labelTemplateId.test(input.template)))) throw new InputError('Unsupported label preview request.');
    if (input.fields !== undefined && Object.entries(object(input.fields, 'fields')).some(([k, v]) => !editable.includes(k) || typeof v !== 'string')) throw new InputError('Unsupported label field.');
    this.assertRevision(input.revision);
    const kind = input.kind || 'box';
    let box, locationId, unitId, fields, reference;
    if (input.test === true) {
      if (input.boxId || input.locationId || input.unitId || input.fields) throw new InputError('Test labels use fixed sample text.');
    } else if (kind === 'unit') {
      if (input.boxId !== undefined || input.locationId !== undefined || typeof input.unitId !== 'string') throw new InputError('Choose a storage unit.');
      const unit = this.inventory.storageMap(language).units.find(u => u.slug === input.unitId);
      if (!unit) throw new InputError('Storage unit not found.', 404);
      // The unit's title reads "Shelving unit: B"; its two parts are also fields of their own.
      const [kindName, ...rest] = unit.title.split(': ');
      unitId = unit.slug; reference = `unit:${unitId}`.slice(0, 200);
      fields = { unit: unit.title, kind: rest.length ? kindName : '', name: rest.length ? rest.join(': ') : unit.title, unitId };
    } else if (input.unitId !== undefined) {
      throw new InputError('Unsupported label preview request.');
    } else if (kind === 'location') {
      if (input.boxId !== undefined || typeof input.locationId !== 'string') throw new InputError('Choose a registered location or a test label.');
      if (!this.store.locationIds().includes(input.locationId)) throw new InputError('Location not found.', 404);
      locationId = input.locationId; reference = `location:${locationId}`.slice(0, 200);
      fields = { location: Object.values(presentLocation(locationId, '', this.inventory.language(language))).filter(Boolean).join(', '), locationId };
    } else {
      if (input.locationId !== undefined || typeof input.boxId !== 'string') throw new InputError('Choose an inventory box or a test label.');
      box = this.inventory.get(input.boxId, language); if (!box) throw new InputError('Box not found.', 404);
      reference = `box:${box.boxId}`.slice(0, 200);
      fields = { title: box.label, description: box.summary || '', location: Object.values(box.location).filter(Boolean).join(', '), boxId: box.boxId };
    }
    // An explicit choice prints that template. Otherwise the box's remembered template, then the function's standard
    // template, then the built-in one; a template removed from the label service falls through to the next.
    const client = this.client(), choice = this.functions()[kind];
    const candidates = input.template ? [input.template] : [...new Set([box?.labelTemplate, choice.default, kind].filter(Boolean))];
    const known = (await client.templates()).templates, template = candidates.find(id => known.some(t => t.id === id));
    if (!template) throw new InputError(kind === 'unit' && !input.template ? 'Make a storage unit label template in the label service and choose it under Printing.'
      : 'The label template is not available in the label service. Choose another template.', 409);
    if (input.test !== true) {
      const wanted = Object.keys(known.find(t => t.id === template).fields || {});
      if (wanted.some(k => !provided[kind].includes(k))) throw new InputError('This template asks for fields that this label type cannot fill.');
      fields = Object.fromEntries(wanted.map(k => [k, input.fields?.[k] ?? fields[k]]));
    }
    const result = await client.preview({ template, ...(input.test === true ? { test: true } : { fields, reference }) });
    this.assertRevision(input.revision);
    const now = Date.now(); for (const [id, p] of this.previews) if (p.expires <= now) this.previews.delete(id);
    if (this.previews.size >= 100) throw new InputError('Too many label previews. Wait for an older preview to expire.', 429);
    // A box label printed with the template it was meant to use is remembered for that box; a fallback is not.
    this.previews.set(result.token, { revision: input.revision, boxId: box?.boxId, boxFingerprint: box ? fingerprint(box) : null, locationId, unitId, language,
      kind, remember: box && template === candidates[0] ? template : undefined, expires: Math.min(Date.parse(result.expiresAt) || now, now + 10 * 60 * 1000) });
    return { token: result.token, kind, template, fallback: template !== candidates[0], fields: result.fields, layout: result.layout, svg: result.svg,
      printable: result.printable, warnings: result.warnings, boxId: box?.boxId, locationId, unitId, test: input.test === true };
  }
  assertPreview(preview) {
    this.assertRevision(preview.revision);
    if (Date.now() >= preview.expires) throw new InputError('Label preview expired. Create a new preview.', 409);
    if (preview.locationId && !this.store.locationIds().includes(preview.locationId)) throw new InputError('Location is no longer registered. Create a new label preview.', 409);
    if (preview.unitId && !this.inventory.storageMap(preview.language).units.some(u => u.slug === preview.unitId)) throw new InputError('Storage unit no longer exists. Create a new label preview.', 409);
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
    const job = await this.client().submit({ token: input.token, requestId: input.requestId });
    if (preview.remember) {
      // The standard template needs no memory, so printing it again forgets an earlier choice.
      const next = preview.remember === this.functions()[preview.kind].default ? null : preview.remember;
      if (next !== (this.inventory.get(preview.boxId)?.labelTemplate || null)) {
        try { this.inventory.setLabelTemplate(preview.boxId, next); } catch { /* The label is printed; a lost preference must not report a failed print. */ }
      }
    }
    return job;
  }
  async jobs() { return (await this.client().jobs()).jobs; }
  async job(id) { return this.client().job(id); }
}
