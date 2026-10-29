import { randomUUID } from 'node:crypto';
import { InputError } from './validation.js';

export const historySources = ['web', 'api', 'mcp', 'preview'];
export const historyLimit = 10000;
export const historyDays = 90;
const cut = (value, max) => String(value ?? '').slice(0, max);
export const historyQueryKey = query => query.normalize('NFKC').toLowerCase();

export function validateSearchEntry(entry) {
  if (!entry || typeof entry !== 'object' || !/^[a-f0-9-]{36}$/.test(entry.id)
    || !Number.isFinite(Date.parse(entry.createdAt)) || !historySources.includes(entry.source)
    || !['search', 'ask', 'preview'].includes(entry.mode) || !['complete', 'error'].includes(entry.outcome)
    || !Number.isSafeInteger(entry.durationMs) || entry.durationMs < 0
    || typeof entry.query !== 'string' || !entry.query.trim() || entry.query.length > 2000
    || typeof entry.language !== 'string' || entry.language.length > 20
    || typeof entry.answer !== 'string' || entry.answer.length > 4000
    || !['', 'search', 'ai', 'decision-preview', 'semantic'].includes(entry.answerSource)
    || typeof entry.queryTruncated !== 'boolean' || typeof entry.answerTruncated !== 'boolean'
    || !Array.isArray(entry.matches) || entry.matches.length > 25
    || !Number.isSafeInteger(entry.count) || entry.count < entry.matches.length
    || entry.matches.some(m => !m || typeof m.boxId !== 'string' || m.boxId.length > 500
      || typeof m.label !== 'string' || m.label.length > 500 || typeof m.location !== 'string' || m.location.length > 1500)) {
    throw new InputError('Invalid search history entry.');
  }
  return entry;
}

// Capture the final transport result once, rather than internal inventory lookups.
export class SearchHistory {
  constructor(store) { this.store = store; }

  async run({ source, mode, query, language }, work) {
    const started = Date.now();
    let result, outcome = 'complete';
    try { result = await work(); return result; }
    catch (error) { outcome = 'error'; throw error; }
    finally {
      const answer = String(result?.answer ?? ''), receivedQuery = String(query).trim();
      const entry = {
        id: randomUUID(), createdAt: new Date().toISOString(), source, mode,
        query: cut(receivedQuery, 2000), queryTruncated: receivedQuery.length > 2000,
        language: cut(language, 20), outcome, durationMs: Math.max(0, Date.now() - started),
        answer: cut(answer, 4000), answerTruncated: answer.length > 4000,
        answerSource: ['search', 'ai', 'decision-preview', 'semantic'].includes(result?.source) ? result.source : '',
        count: result?.matches?.length || 0,
        matches: (result?.matches || []).slice(0, 25).map(m => ({ boxId: cut(m.boxId, 500), label: cut(m.label, 500),
          location: cut(Object.values(m.location || {}).filter(Boolean).join(', '), 1500) }))
      };
      // Logging must not break a working search or leak queries/provider errors to console.
      try { this.store.addSearchEntry(validateSearchEntry(entry)); }
      catch { console.warn('Search history could not be saved.'); }
    }
  }

  list({ before, source, query = '' } = {}) {
    if (before !== undefined && (!/^[1-9]\d*$/.test(String(before)) || !Number.isSafeInteger(Number(before)))) throw new InputError('Invalid search history page.');
    if (source && !historySources.includes(source)) throw new InputError('Invalid search history source.');
    if (typeof query !== 'string' || query.length > 2000) throw new InputError('Invalid search history filter.');
    const params = [new Date(Date.now() - historyDays * 86400000).toISOString()];
    let where = 'created_at >= ?';
    if (before !== undefined) { where += ' AND sequence < ?'; params.push(Number(before)); }
    if (source) { where += ' AND source = ?'; params.push(source); }
    if (query.trim()) { where += ' AND instr(query_key, ?) > 0'; params.push(historyQueryKey(query.trim())); }
    const rows = this.store.db.prepare(`SELECT sequence, record FROM search_history WHERE ${where} ORDER BY sequence DESC LIMIT 51`).all(...params);
    const page = rows.slice(0, 50);
    return { entries: page.map(r => JSON.parse(r.record)), next: rows.length > 50 ? page.at(-1).sequence : null,
      retentionDays: historyDays, maxEntries: historyLimit };
  }
}
