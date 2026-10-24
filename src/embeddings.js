// Explicit native Ollama adapter. The compatible route cannot reject truncation.
import { InputError } from './validation.js';

export function unitVector(vector, dimensions) {
  if (!Array.isArray(vector) || vector.length !== dimensions || vector.some(n => typeof n !== 'number' || !Number.isFinite(n))) {
    throw new InputError('Invalid embedding vector.');
  }
  const norm = Math.hypot(...vector);
  if (!Number.isFinite(norm) || norm === 0) throw new InputError('Invalid embedding magnitude.');
  return vector.map(n => n / norm);
}

export class OllamaEmbeddings {
  constructor({ baseUrl, model, modelRevision, dimensions = 1024, apiKey = '', timeoutMs = 15000 }) {
    let url;
    try { url = new URL(baseUrl); } catch { throw new InputError('Invalid embedding endpoint.'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash
      || url.pathname.replace(/\/+$/, '') !== '') throw new InputError('Embedding endpoint must be an HTTP origin.');
    if (![model, modelRevision].every(s => typeof s === 'string' && s.trim() && s.length <= 200)
      || !/^[a-f0-9]{64}$/.test(modelRevision)
      || !Number.isInteger(dimensions) || dimensions < 1 || dimensions > 8192
      || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 90000
      || typeof apiKey !== 'string' || /[\r\n]/.test(apiKey)) throw new InputError('Invalid embedding configuration.');
    this.baseUrl = url.origin; this.model = model; this.modelRevision = modelRevision;
    this.dimensions = dimensions; this.apiKey = apiKey; this.timeoutMs = timeoutMs;
    this.profile = { endpoint: this.baseUrl, model, modelRevision, dimensions, protocol: 'ollama-native-no-truncation-v1' };
  }

  async embed(input) {
    if (typeof input !== 'string' || !input.trim() || Buffer.byteLength(input) > 65536) {
      throw new InputError('Embedding input must contain 1-65536 UTF-8 bytes.', 413);
    }
    try {
      // An alias may be overwritten with different weights. Refuse to mix its
      // new query vectors with a cache carrying the previous model digest.
      const tags = await this.request('/api/tags');
      if (!Array.isArray(tags.models) || !tags.models.some(row => row.name === this.model && row.digest === this.modelRevision)) {
        throw new Error('Embedding model revision changed.');
      }
      const payload = await this.request('/api/embed', { model: this.model, input, truncate: false });
      if (payload.model !== this.model || !Array.isArray(payload.embeddings) || payload.embeddings.length !== 1) {
        throw new Error('Invalid embedding response.');
      }
      return unitVector(payload.embeddings[0], this.dimensions);
    } catch {
      // Hide upstream errors, keys, response bodies and URLs from callers.
      throw new InputError('Embedding service unavailable, model changed or input rejected; no text was truncated.', 503);
    }
  }

  async request(path, body) {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(this.timeoutMs),
        headers: { 'content-type': 'application/json', ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {})
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error('Provider rejected embedding request.');
      }
      const reader = response.body.getReader(); const chunks = []; let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read(); if (done) break;
          size += value.length;
          if (size > 1024 * 1024) { await reader.cancel(); throw new Error('Oversized embedding response.'); }
          chunks.push(Buffer.from(value));
        }
      } finally { reader.releaseLock(); }
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  }
}
