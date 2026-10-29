import { InputError, object, validateSearchWorkspace } from './validation.js';
import { sourceRevision } from './settings.js';
import { OllamaEmbeddings } from './embeddings.js';

const verificationDefaults = () => ({ enabled: false, baseUrl: '', model: '', timeoutMs: 15000, similarity: null, margin: null });

export class SearchSettings {
  constructor(store, env = {}) { this.store = store; this.env = env; this.busy = false; }
  config() {
    const saved = this.store.settings().searchWorkspace;
    return saved ? { ...saved, verification: saved.verification || verificationDefaults() } : { embedding: {
      enabled: this.env.STORAGE_SEMANTIC_PREVIEW === '1', baseUrl: this.env.STORAGE_EMBEDDING_URL || '',
      model: this.env.STORAGE_EMBEDDING_MODEL || '', modelRevision: this.env.STORAGE_EMBEDDING_REVISION || '',
      dimensions: Number(this.env.STORAGE_EMBEDDING_DIMENSIONS || 1024),
      ...(this.env.STORAGE_EMBEDDING_KEY ? { apiKey: this.env.STORAGE_EMBEDDING_KEY } : {})
    }, rules: [], verification: verificationDefaults() };
  }
  revision() { return sourceRevision(this.config()); }
  assertCurrent(revision) {
    if (revision !== this.revision()) throw new InputError('Search settings changed. Reopen Search & answers before saving or testing.', 409);
  }
  view() {
    const config = this.config(), { apiKey, ...embedding } = config.embedding;
    const { apiKey: verifierKey, ...verification } = config.verification;
    return { revision: this.revision(), embedding: { ...embedding, apiKeyConfigured: Boolean(apiKey) },
      verification: { ...verification, apiKeyConfigured: Boolean(verifierKey) }, rules: config.rules,
      usingEnvironment: !this.store.settings().searchWorkspace && this.env.STORAGE_SEMANTIC_PREVIEW === '1' };
  }
  save(input) {
    object(input);
    if (Object.keys(input).some(key => !['revision', 'embedding', 'rules', 'verification'].includes(key))) throw new InputError('Unsupported search setting.');
    return this.store.transaction(() => {
      this.assertCurrent(input.revision);
      const old = this.config(), submitted = object(input.embedding, 'embedding');
      if (Object.keys(submitted).some(key => !['enabled', 'baseUrl', 'model', 'modelRevision', 'dimensions', 'apiKey', 'clearCredentials'].includes(key))) throw new InputError('Unsupported embedding setting.');
      if (submitted.clearCredentials !== undefined && typeof submitted.clearCredentials !== 'boolean') throw new InputError('clearCredentials must be a boolean.');
      if (submitted.apiKey !== undefined && typeof submitted.apiKey !== 'string') throw new InputError('Invalid API key.');
      const embedding = Object.fromEntries(['enabled', 'baseUrl', 'model', 'modelRevision', 'dimensions'].map(key => [key, submitted[key]]));
      for (const key of ['baseUrl', 'model', 'modelRevision']) if (typeof embedding[key] === 'string') embedding[key] = embedding[key].trim();
      if (typeof embedding.baseUrl === 'string') embedding.baseUrl = embedding.baseUrl.replace(/\/+$/, '');
      if (old.embedding.baseUrl.replace(/\/+$/, '') === embedding.baseUrl && !submitted.clearCredentials && old.embedding.apiKey) embedding.apiKey = old.embedding.apiKey;
      if (submitted.apiKey?.trim()) embedding.apiKey = submitted.apiKey.trim();
      let verification = old.verification;
      if (input.verification !== undefined) {
        const submittedVerifier = object(input.verification, 'verification');
        if (Object.keys(submittedVerifier).some(key => !['enabled', 'baseUrl', 'model', 'timeoutMs', 'similarity', 'margin', 'apiKey', 'clearCredentials'].includes(key))) throw new InputError('Unsupported identity verification setting.');
        if (submittedVerifier.clearCredentials !== undefined && typeof submittedVerifier.clearCredentials !== 'boolean') throw new InputError('clearCredentials must be a boolean.');
        if (submittedVerifier.apiKey !== undefined && typeof submittedVerifier.apiKey !== 'string') throw new InputError('Invalid API key.');
        verification = Object.fromEntries(['enabled', 'baseUrl', 'model', 'timeoutMs', 'similarity', 'margin'].map(key => [key, submittedVerifier[key]]));
        for (const key of ['baseUrl', 'model']) if (typeof verification[key] === 'string') verification[key] = verification[key].trim();
        if (typeof verification.baseUrl === 'string') verification.baseUrl = verification.baseUrl.replace(/\/+$/, '');
        if (old.verification.baseUrl === verification.baseUrl && !submittedVerifier.clearCredentials && old.verification.apiKey) verification.apiKey = old.verification.apiKey;
        if (submittedVerifier.apiKey?.trim()) verification.apiKey = submittedVerifier.apiKey.trim();
      }
      const config = validateSearchWorkspace({ embedding, rules: input.rules, verification });
      const ids = new Set(this.store.read().boxes.map(box => box.boxId));
      for (const rule of config.rules) {
        const unchanged = old.rules.some(before => JSON.stringify(before) === JSON.stringify(rule));
        if (!unchanged && rule.boxIds.some(id => !ids.has(id))) throw new InputError('An answer rule refers to a box that no longer exists. Reload the inventory.', 409);
      }
      this.store.writeSettings({ searchWorkspace: config });
      return this.view();
    });
  }
  async models(input) {
    object(input); this.assertCurrent(input.revision);
    if (this.busy) throw new InputError('A model-list request is already running.', 429);
    this.busy = true;
    try {
      const e = this.config().embedding;
      const client = new OllamaEmbeddings({ ...e, model: e.model || 'discovery', modelRevision: e.modelRevision || '0'.repeat(64) });
      const payload = await client.request('/api/tags');
      this.assertCurrent(input.revision);
      if (!Array.isArray(payload.models) || payload.models.length > 5000) throw new Error();
      const models = payload.models.filter(row => typeof row.name === 'string' && row.name.length <= 200 && /^[a-f0-9]{64}$/.test(row.digest))
        .map(row => ({ name: row.name, digest: row.digest }));
      return { revision: input.revision, models };
    } catch (error) {
      if (error instanceof InputError && error.status === 409) throw error;
      throw new InputError('Could not load native Ollama models. Check the saved server, key and access to /api/tags.', 502);
    } finally { this.busy = false; }
  }
}
