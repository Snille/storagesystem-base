import { createHash } from 'node:crypto';
import { InputError, object, text, validateSettings } from './validation.js';

export const sourceRevision = config => createHash('sha256').update(JSON.stringify(config || {})).digest('hex');
const baseUrl = value => value?.trim().replace(/\/+$/, '') || '';

export class Settings {
  constructor(store) { this.store = store; }
  source() { return this.store.settings().immich || {}; }
  view() {
    const settings = this.store.settings(); const config = settings.immich || {};
    return {
      appearance: { language: settings.appearance?.language || 'en' },
      photoSource: {
        provider: config.provider || 'immich', baseUrl: config.baseUrl || '',
        accessMode: config.accessMode || 'apiKey', albumId: config.albumId || '', accountLabel: config.accountLabel || '',
        apiKeyConfigured: Boolean(config.apiKey), shareKeyConfigured: Boolean(config.shareKey)
      }, sourceRevision: sourceRevision(config)
    };
  }

  save(input) {
    object(input);
    for (const field of Object.keys(input)) if (!['appearance', 'photoSource', 'sourceRevision'].includes(field)) throw new InputError(`Unsupported setting: ${field}`);
    // Read and write in one transaction so other settings sections and credentials survive edits.
    return this.store.transaction(() => {
      const before = this.store.settings(); const old = before.immich || {};
      if (input.sourceRevision !== sourceRevision(old)) throw new InputError('Settings changed. Reload settings before saving.', 409);
      const changes = {};
      if (input.appearance !== undefined) {
        object(input.appearance, 'appearance');
        if (!['en', 'sv', 'de'].includes(input.appearance.language)) throw new InputError('Choose en, sv or de for the API language.');
        changes.appearance = { ...before.appearance, language: input.appearance.language };
      }
      if (input.photoSource !== undefined) {
        const submitted = object(input.photoSource, 'photoSource');
        const allowed = ['provider', 'baseUrl', 'accessMode', 'albumId', 'accountLabel', 'apiKey', 'shareKey', 'clearCredentials'];
        for (const field of Object.keys(submitted)) if (!allowed.includes(field)) throw new InputError(`Unsupported photo setting: ${field}`);
        for (const field of allowed.filter(f => f !== 'clearCredentials')) text(submitted[field], field, { optional: true, empty: true });
        if (submitted.clearCredentials !== undefined && typeof submitted.clearCredentials !== 'boolean') throw new InputError('clearCredentials must be a boolean.');
        const next = { ...old };
        for (const field of ['provider', 'baseUrl', 'accessMode', 'albumId', 'accountLabel']) if (submitted[field] !== undefined) next[field] = submitted[field].trim();
        next.provider ||= 'immich'; next.accessMode ||= 'apiKey'; next.baseUrl = baseUrl(next.baseUrl);
        if (!['immich', 'photoprism'].includes(next.provider)) throw new InputError('Choose Immich or PhotoPrism.');
        if (!['apiKey', 'shareKey'].includes(next.accessMode) || (next.provider === 'photoprism' && next.accessMode !== 'apiKey')) throw new InputError('This access mode is not supported for the provider.');
        const moved = next.provider !== (old.provider || 'immich') || next.baseUrl !== baseUrl(old.baseUrl);
        if (old.baseUrl && moved && this.store.read().photos.length) throw new InputError('The photo server cannot change while inventory has photo references. Use a separate database for another photo server.', 409);
        const newIdentity = moved || next.accessMode !== (old.accessMode || 'apiKey');
        if (newIdentity || submitted.clearCredentials) { delete next.apiKey; delete next.shareKey; }
        if (newIdentity) next.albumId = submitted.albumId || '';
        for (const field of ['apiKey', 'shareKey']) if (submitted[field]?.trim()) next[field] = submitted[field].trim();
        if (next.accessMode === 'shareKey') delete next.apiKey;
        else delete next.shareKey;
        validateSettings({ immich: next }); changes.immich = next;
      }
      this.store.writeSettings(changes);
      return this.view();
    });
  }
}
