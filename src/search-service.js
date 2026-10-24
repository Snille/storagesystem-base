import { sourceRevision } from './settings.js';
import { SearchSettings } from './search-settings.js';
import { createSemanticRuntime } from './semantic-runtime.js';
import { InputError, object, text } from './validation.js';

export class SearchService {
  constructor(inventory, env) {
    this.inventory = inventory; this.env = env; this.settings = new SearchSettings(inventory.store, env);
    this.runtime = null; this.active = null; this.transition = null; this.closed = false; this.dirty = false; this.failed = false;
    this.unsubscribe = inventory.store.subscribe(() => this.refresh());
    this.refresh();
  }
  refresh() {
    if (this.closed) return;
    this.dirty = true;
    if (!this.transition) this.transition = Promise.resolve().then(async () => {
      while (this.dirty && !this.closed) {
        this.dirty = false;
        let e = this.settings.config().embedding, revision = sourceRevision(e);
        if (revision === this.active) continue;
        const old = this.runtime; this.runtime = null; this.active = null;
        if (old) { await old.index.stop(); old.cache.close(); }
        if (this.closed) return;
        e = this.settings.config().embedding; revision = sourceRevision(e);
        this.failed = false;
        try {
          this.runtime = createSemanticRuntime(this.inventory, { ...this.env,
            STORAGE_SEMANTIC_PREVIEW: e.enabled ? '1' : '0', STORAGE_EMBEDDING_URL: e.baseUrl,
            STORAGE_EMBEDDING_MODEL: e.model, STORAGE_EMBEDDING_REVISION: e.modelRevision,
            STORAGE_EMBEDDING_DIMENSIONS: String(e.dimensions), STORAGE_EMBEDDING_KEY: e.apiKey || '' });
        } catch { this.failed = true; }
        this.active = revision;
      }
    }).catch(() => { this.failed = true; }).finally(() => { this.transition = null; });
  }
  status() {
    const e = this.settings.config().embedding;
    if (!e.enabled) return { enabled: false };
    if (this.transition || this.active !== sourceRevision(e)) return { enabled: true, state: 'configuring' };
    if (!this.runtime || this.failed) return { enabled: true, state: 'unavailable' };
    return { enabled: true, ...this.runtime.index.status(), audit: this.runtime.cache.audit() };
  }
  retry() {
    if (!this.settings.config().embedding.enabled) throw new InputError('Semantic preview is disabled.', 409);
    if (this.runtime && this.active === sourceRevision(this.settings.config().embedding)) this.runtime.index.schedule();
    else { this.active = null; this.refresh(); }
    return { scheduled: true };
  }
  async preview(input, language) {
    object(input); text(input.query, 'query');
    if (Object.keys(input).some(key => !['query', 'revision'].includes(key))) throw new InputError('Preview accepts only a query and saved settings revision.');
    const revision = input.revision ?? this.settings.revision(); this.settings.assertCurrent(revision);
    const config = this.settings.config();
    let retrieval = { available: false, reason: config.embedding.enabled ? 'index_not_ready' : 'disabled', semanticMatches: [] };
    if (!this.transition && this.runtime && this.active === sourceRevision(config.embedding)) retrieval = await this.runtime.index.search(input.query);
    this.settings.assertCurrent(revision);
    const result = this.inventory.previewAnswer(input.query, { semanticMatches: retrieval.semanticMatches, rules: config.rules }, language);
    return { ...result, revision, retrieval,
      lexicalFallback: retrieval.available ? [] : this.inventory.search(input.query, 5, language) };
  }
  async close() {
    this.closed = true; this.unsubscribe(); await this.transition;
    if (this.runtime) { await this.runtime.index.stop(); this.runtime.cache.close(); this.runtime = null; }
  }
}
