// Explicit native-gateway/runtime check on a read-only backup imported into memory.
// Inputs/reports are private data. This never enables a deployed application.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { Store } from '../src/store.js';
import { Inventory } from '../src/inventory.js';
import { SearchService } from '../src/search-service.js';
import { locationKey } from '../src/locations.js';

const [backupArg, configArg, questionsArg, outputArg] = process.argv.slice(2);
if (!outputArg) throw new Error('Usage: node scripts/verify-runtime-preview.js BACKUP CONFIG_JSON QUESTIONS_JSON NEW_PRIVATE_OUTPUT');
const backup = resolve(backupArg), output = resolve(outputArg);
const config = JSON.parse(readFileSync(resolve(configArg), 'utf8'));
const questions = JSON.parse(readFileSync(resolve(questionsArg), 'utf8'));
if (config.embedding?.apiKey || config.verification?.apiKey) throw new Error('Pass keys through STORAGE_EMBEDDING_KEY and STORAGE_VERIFICATION_KEY, not config JSON.');
if (!config.embedding?.enabled || !Array.isArray(questions) || !questions.length || questions.length > 100
  || questions.some(q => !q.id || typeof q.query !== 'string' || !q.query.trim() || q.query.length > 2000)) throw new Error('Explicit enabled embedding configuration and 1-100 bounded questions are required.');
if (new Set(questions.map(q => q.id)).size !== questions.length) throw new Error('Question IDs must be unique.');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const originalHash = hash(readFileSync(backup));
const source = new Store(backup, { readOnly: true }), store = new Store(':memory:');
let service;
try {
  assert.equal(source.audit().ok, true);
  store.importLegacy(source.read()); // Deliberately excludes credentials and settings from the backup.
  const inventoryHash = hash(JSON.stringify(store.read()));
  mkdirSync(output); // Refuse existing output, including previous evidence.
  const inventory = new Inventory(store);
  service = new SearchService(inventory, { STORAGE_EMBEDDING_CACHE: join(output, 'semantic.sqlite') });
  const saved = service.settings.save({ revision: service.settings.revision(), ...config,
    embedding: { ...config.embedding, apiKey: process.env.STORAGE_EMBEDDING_KEY || '' },
    ...(config.verification ? { verification: { ...config.verification, apiKey: process.env.STORAGE_VERIFICATION_KEY || '' } } : {}) });
  const started = performance.now();
  while (service.status().state !== 'ready') {
    if (service.status().state === 'degraded' || service.status().state === 'unavailable' || performance.now() - started > 180000) throw new Error('Isolated index did not become ready.');
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  const buildMs = Math.round(performance.now() - started), results = [];
  for (const question of questions) {
    const before = performance.now();
    const result = config.publicEnabled ? await service.search(question.query, 25, question.language || 'sv')
      : await service.preview({ query: question.query, revision: saved.revision }, question.language || 'sv');
    let correct;
    if (question.expected) {
      const expected = question.expected;
      if (!['answer', 'clarify', 'no_supported_match'].includes(expected.kind)) throw new Error('Invalid expected decision.');
      const actual = result.decision === 'answer' ? (result.selectedBoxIds || result.matches.map(box => box.boxId))
        .map(id => locationKey(inventory.get(id).locationId)).sort() : [];
      const required = (expected.requiredLocationIds || []).map(locationKey).sort();
      const candidates = config.publicEnabled && result.decision === 'clarify' ? result.matches.map(box => locationKey(box.locationId)).sort() : actual;
      correct = result.decision === expected.kind && (!expected.answer || result.answer === expected.answer)
        && (expected.kind !== 'answer' || required.length > 0)
        && (!required.length || (required.every(id => candidates.includes(id)) && (expected.allowExtraLocations || candidates.length === required.length)));
    }
    results.push({ ...question, ...(correct === undefined ? {} : { correct }), latencyMs: Math.round(performance.now() - before), result });
    console.log(`${question.id}: ${result.decision} / ${result.reason}${correct === undefined ? '' : correct ? ' / PASS' : ' / FAIL'} (${results.at(-1).latencyMs} ms)`);
  }
  assert.equal(hash(JSON.stringify(store.read())), inventoryHash);
  assert.equal(hash(readFileSync(backup)), originalHash);
  assert.equal(store.audit().ok, true);
  assert.equal(service.runtime.cache.audit().ok, true);
  const codeFiles = ['src/search-service.js', 'src/search-settings.js', 'src/identity-verifier.js', 'src/answer-policy.js',
    'src/validation.js', 'src/inventory.js', 'src/search.js', 'src/locations.js', 'src/settings.js',
    'src/semantic-runtime.js', 'src/semantic-index.js', 'src/embeddings.js', 'src/store.js', 'scripts/verify-runtime-preview.js'];
  const codeHashes = Object.fromEntries(codeFiles.map(path => [path, hash(readFileSync(path))]));
  for (const path of codeFiles) writeFileSync(join(output, path.replaceAll('/', '__')), readFileSync(path), { flag: 'wx' });
  const summary = { boxes: store.read().boxes.length, buildMs, cases: results.length,
    semanticAvailable: results.filter(r => r.result.retrieval?.available || r.result.semanticAvailable).length,
    labelledCases: results.filter(r => r.correct !== undefined).length, correct: results.filter(r => r.correct === true).length,
    verifiedAnswers: results.filter(r => r.result.reason === 'verified_semantic_evidence').length };
  writeFileSync(join(output, 'report.json'), JSON.stringify({ createdAt: new Date().toISOString(), backupHash: originalHash,
    inventoryHash, codeHashes, configuration: saved, summary, results,
    limitations: ['Development runtime/latency check; not independent decision acceptance.',
      'No deployed search activation, production settings changes, speech test or inventory writes.'] }, null, 2) + '\n', { flag: 'wx' });
  if (results.some(row => row.correct === false)) process.exitCode = 1;
  console.log(JSON.stringify(summary));
} finally {
  await service?.close(); store.close(); source.close();
}
