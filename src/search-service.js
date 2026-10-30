import { sourceRevision } from './settings.js';
import { SearchSettings } from './search-settings.js';
import { createSemanticRuntime } from './semantic-runtime.js';
import { InputError, object, text } from './validation.js';
import { IdentityVerifier } from './identity-verifier.js';
import { semanticDocument } from './semantic-index.js';

export class SearchService {
  constructor(inventory, env) {
    this.inventory = inventory; this.env = env; this.settings = new SearchSettings(inventory.store, env);
    this.runtime = null; this.active = null; this.transition = null; this.closed = false; this.dirty = false; this.failed = false;
    this.verifier = null; this.verifierRevision = null;
    // Pending clarifications per voice conversation: id -> { query, expires }.
    this.clarifications = new Map();
    const seconds = Number(env.STORAGE_CLARIFICATION_SECONDS ?? 120);
    this.clarificationMs = Number.isFinite(seconds) && seconds >= 0 ? Math.min(seconds, 3600) * 1000 : 120000;
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
  async search(query, limit = 10, language) {
    text(query, 'query');
    const size = Math.max(1, Math.min(25, Number.isFinite(limit) ? Math.trunc(limit) : 10));
    const lexical = this.inventory.search(query, 25, language);
    if (!this.settings.config().publicEnabled) {
      const matches = lexical.slice(0, size);
      return { query, count: matches.length, matches };
    }
    // Retained filenames are explicit current-box lookups, not semantic guesses.
    if (lexical[0]?.score >= 5000) {
      const matches = lexical.slice(0, size);
      return { ...this.inventory.ask(query, language), source: 'semantic', decision: 'answer',
        reason: 'retained_filename', count: matches.length, matches, semanticAvailable: false };
    }
    const result = await this.preview({ query }, language);
    this.settings.assertCurrent(result.revision);
    const clarificationRule = result.reason === 'item_type_distinction' ? this.settings.config().rules.find(rule => rule.id === result.ruleId) : null;
    const candidates = result.decision === 'answer' ? result.selectedBoxIds.map(id => this.inventory.get(id, language))
      : clarificationRule ? clarificationRule.boxIds.map(id => this.inventory.get(id, language))
      : result.decision === 'clarify' ? result.matches.filter(box => box.evidence
        || (result.reason === 'semantic_margin' && box.similarity >= this.settings.config().verification.similarity)).slice(0, 5) : [];
    const matches = candidates.slice(0, size);
    return { query, count: matches.length, matches, answer: result.answer, source: 'semantic',
      decision: result.decision, reason: result.reason, semanticAvailable: result.retrieval.available,
      ...(!result.retrieval.available ? { fallback: result.retrieval.reason } : {}) };
  }
  async ask(query, language, conversationId) {
    if (!this.settings.config().publicEnabled) return this.inventory.ask(query, language);
    const pending = this.pendingClarification(conversationId);
    if (pending) {
      // Read a reply together with the question it answers. A reply that does
      // not settle it is treated as a new question instead.
      const combined = await this.search(`${pending} ${query}`.slice(0, 2000), 25, language);
      if (combined.decision === 'answer') return { ...combined, followUpOf: pending };
    }
    const result = await this.search(query, 25, language);
    this.rememberClarification(conversationId, result.decision === 'clarify' ? query : null);
    return result;
  }
  pendingClarification(conversationId) {
    const now = Date.now();
    for (const [id, item] of this.clarifications) if (item.expires <= now) this.clarifications.delete(id);
    const item = conversationId && this.clarifications.get(conversationId);
    if (item) this.clarifications.delete(conversationId);
    return item?.query;
  }
  rememberClarification(conversationId, query) {
    if (!conversationId || !query || !this.clarificationMs) return;
    if (this.clarifications.size >= 200) this.clarifications.delete(this.clarifications.keys().next().value);
    this.clarifications.set(conversationId, { query, expires: Date.now() + this.clarificationMs });
  }
  async preview(input, language) {
    object(input); text(input.query, 'query');
    if (Object.keys(input).some(key => !['query', 'revision'].includes(key))) throw new InputError('Preview accepts only a query and saved settings revision.');
    const revision = input.revision ?? this.settings.revision(); this.settings.assertCurrent(revision);
    const config = this.settings.config();
    const contentsRevision = () => sourceRevision(this.inventory.list(language).map(semanticDocument));
    const contents = contentsRevision();
    let retrieval = { available: false, reason: config.embedding.enabled ? 'index_not_ready' : 'disabled', semanticMatches: [] };
    if (!this.transition && this.runtime && this.active === sourceRevision(config.embedding)) retrieval = await this.runtime.index.search(input.query);
    this.settings.assertCurrent(revision);
    const v = config.verification;
    const options = { semanticMatches: retrieval.semanticMatches, rules: config.rules };
    let result, verification = { enabled: v.enabled, outcome: 'not_required' };
    if (v.enabled && retrieval.available) {
      const verifierRevision = sourceRevision(v);
      if (this.verifierRevision !== verifierRevision) {
        this.verifier = new IdentityVerifier(v); this.verifierRevision = verifierRevision;
      }
      const verifier = this.verifier;
      result = await this.inventory.verifiedPreviewAnswer(input.query, { ...options,
        thresholds: { similarity: v.similarity, margin: v.margin } }, {
        verify: async (...args) => {
          if (verifier.busy) { verification.outcome = 'busy'; return null; }
          const proof = await verifier.verify(...args);
          verification.outcome = verifier.lastOutcome;
          return proof;
        }
      }, language);
    } else result = this.inventory.previewAnswer(input.query, options, language);
    this.settings.assertCurrent(revision);
    if (retrieval.available && contents !== contentsRevision()) throw new InputError('Inventory changed during semantic verification. Try the question again.', 409);
    return { ...result, revision, retrieval, verification,
      lexicalFallback: retrieval.available ? [] : this.inventory.search(input.query, 5, language) };
  }
  async close() {
    this.closed = true; this.unsubscribe(); await this.transition;
    if (this.runtime) { await this.runtime.index.stop(); this.runtime.cache.close(); this.runtime = null; }
  }
}
