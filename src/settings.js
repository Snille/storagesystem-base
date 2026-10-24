import { createHash } from 'node:crypto';
import { InputError, object, text, validateSettings, backgrounds } from './validation.js';

export const sourceRevision = config => createHash('sha256').update(JSON.stringify(config || {})).digest('hex');
const baseUrl = value => value?.trim().replace(/\/+$/, '') || '';

export class Settings {
  constructor(store) { this.store = store; }
  source() { return this.store.settings().immich || {}; }
  languages() {
    const appearance = this.store.settings().appearance || {};
    const value = { uiLanguage: appearance.uiLanguage || 'en', responseLanguage: appearance.language || 'en' };
    return { ...value, revision: sourceRevision(value) };
  }
  saveLanguages(input) {
    object(input);
    for (const field of Object.keys(input)) if (!['uiLanguage', 'responseLanguage', 'revision'].includes(field)) throw new InputError(`Unsupported language setting: ${field}`);
    if (!['en', 'sv'].includes(input.uiLanguage)) throw new InputError('Choose English or Swedish for the interface.');
    if (!['en', 'sv', 'de'].includes(input.responseLanguage)) throw new InputError('Choose English, Swedish or German for external responses.');
    return this.store.transaction(() => {
      if (input.revision !== this.languages().revision) throw new InputError('Language settings changed. Reopen Languages before saving.', 409);
      this.store.writeSettings({ appearance: { ...this.store.settings().appearance, uiLanguage: input.uiLanguage, language: input.responseLanguage } });
      return this.languages();
    });
  }
  // The page background is public: the page shows it before anyone enters a key.
  appearance() {
    const appearance = this.store.settings().appearance || {}; const image = this.store.media('background');
    const value = { uiLanguage: appearance.uiLanguage || 'en', background: appearance.background || 'hills', imageRevision: image?.sha256 || null };
    return { ...value, revision: sourceRevision(value) };
  }
  saveBackground(input) {
    object(input);
    for (const field of Object.keys(input)) if (!['revision', 'background', 'image', 'clearImage'].includes(field)) throw new InputError(`Unsupported background setting: ${field}`);
    if (input.background !== undefined && !backgrounds.includes(input.background)) throw new InputError('Choose one of the listed backgrounds.');
    if (input.clearImage !== undefined && typeof input.clearImage !== 'boolean') throw new InputError('clearImage must be a boolean.');
    let image;
    if (input.image !== undefined) {
      object(input.image, 'image'); text(input.image.mime, 'image.mime'); text(input.image.data, 'image.data');
      if (!/^[A-Za-z0-9+/]+={0,2}$/.test(input.image.data)) throw new InputError('The image must be base64 encoded.');
      image = { mime: input.image.mime, data: Buffer.from(input.image.data, 'base64') };
    }
    return this.store.transaction(() => {
      if (input.revision !== this.appearance().revision) throw new InputError('Appearance settings changed. Reopen Appearance before saving.', 409);
      if (image) this.store.setMedia('background', image.mime, image.data);
      if (input.clearImage) this.store.deleteMedia('background');
      // Uploading an image selects it; removing the selected image falls back to the default.
      let background = input.background ?? (image ? 'custom' : this.appearance().background);
      if (background === 'custom' && !this.store.media('background')) {
        if (input.background === 'custom') throw new InputError('Upload an image before choosing your own background.');
        background = 'hills';
      }
      this.store.writeSettings({ appearance: { ...this.store.settings().appearance, background } });
      return this.appearance();
    });
  }
  // Points belong to one overview image; a new cover starts without points, and the old
  // image's points stay saved in case it comes back.
  overviewPoints(assetId) {
    const points = this.store.settings().overviewPoints?.[assetId] || [];
    return { assetId, points, revision: sourceRevision(points) };
  }
  saveOverviewPoints(input) {
    object(input);
    for (const field of Object.keys(input)) if (!['assetId', 'revision', 'points'].includes(field)) throw new InputError(`Unsupported overview setting: ${field}`);
    text(input.assetId, 'assetId');
    return this.store.transaction(() => {
      if (input.revision !== this.overviewPoints(input.assetId).revision) throw new InputError('The points changed. Reload the overview before saving.', 409);
      const all = { ...this.store.settings().overviewPoints, [input.assetId]: input.points };
      this.store.writeSettings({ overviewPoints: all });
      return this.overviewPoints(input.assetId);
    });
  }
  // Keys are never returned, only where the active one comes from. A saved public key and
  // base URL take precedence over the environment like in the reference application,
  // except APP_BASE_URL, which deployment sets on purpose.
  security(env = {}) {
    const saved = this.store.settings().security || {};
    const value = {
      appBaseUrl: saved.appBaseUrl || '', appBaseUrlFromEnvironment: Boolean(env.APP_BASE_URL), environmentBaseUrl: env.APP_BASE_URL || '',
      publicKeySource: saved.publicApiKey?.trim() ? 'settings' : env.STORAGE_API_KEY?.trim() || env.LAGERSYSTEM_API_KEY?.trim() ? 'environment' : 'none'
    };
    return { ...value, revision: sourceRevision({ ...value, key: saved.publicApiKey ? sourceRevision(saved.publicApiKey) : '' }) };
  }
  saveSecurity(input, env = {}) {
    object(input);
    for (const field of Object.keys(input)) if (!['revision', 'appBaseUrl', 'publicApiKey', 'clearPublicApiKey'].includes(field)) throw new InputError(`Unsupported security setting: ${field}`);
    text(input.appBaseUrl, 'appBaseUrl', { optional: true, empty: true });
    text(input.publicApiKey, 'publicApiKey', { optional: true });
    if (input.clearPublicApiKey !== undefined && typeof input.clearPublicApiKey !== 'boolean') throw new InputError('clearPublicApiKey must be a boolean.');
    if (input.publicApiKey !== undefined && (input.publicApiKey.length < 16 || input.publicApiKey.length > 200 || /\s/.test(input.publicApiKey))) throw new InputError('Use a public API key of 16 to 200 characters without spaces.');
    return this.store.transaction(() => {
      if (input.revision !== this.security(env).revision) throw new InputError('Security settings changed. Reopen Security before saving.', 409);
      const next = { ...this.store.settings().security };
      if (input.appBaseUrl !== undefined) next.appBaseUrl = baseUrl(input.appBaseUrl);
      if (input.clearPublicApiKey) delete next.publicApiKey;
      if (input.publicApiKey !== undefined) next.publicApiKey = input.publicApiKey;
      this.store.writeSettings({ security: next });
      return this.security(env);
    });
  }
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
