// Explicit local-only model check over a private, frozen inventory snapshot.
// Writes a new result directory/cache, never changes the source or app settings.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { Store } from '../src/store.js';
import { Inventory } from '../src/inventory.js';
import { OllamaEmbeddings, unitVector } from '../src/embeddings.js';
import { SemanticCache, SemanticIndex, semanticDocument } from '../src/semantic-index.js';

if (process.argv[2] === '--audit') {
  const root = resolve(process.argv[3]), output = resolve(process.argv[4]);
  const hash = value => createHash('sha256').update(value).digest('hex');
  const report = JSON.parse(readFileSync(join(output, 'report.json'), 'utf8'));
  for (const [name, digest] of Object.entries(report.sourceHashes)) assert.equal(hash(readFileSync(join(root, name))), digest);
  for (const [name, digest] of Object.entries(report.codeHashes)) {
    assert.equal(hash(readFileSync(name)), digest); assert.equal(hash(readFileSync(join(output, name.replaceAll('/', '__')))), digest);
  }
  const db = new DatabaseSync(join(output, 'embeddings.sqlite'), { readOnly: true });
  const store = new Store(':memory:');
  try {
    store.importLegacy(JSON.parse(readFileSync(join(root, 'inventory.json'), 'utf8')));
    const rows = db.prepare('SELECT * FROM embeddings ORDER BY box_id').all();
    assert.equal(hash(JSON.stringify(rows)), report.cacheHash);
    const docs = new Inventory(store).list().map(semanticDocument);
    assert.equal(rows.length, docs.length);
    for (const doc of docs) {
      const row = rows.find(r => r.box_id === doc.boxId);
      assert.equal(row.session_id, doc.sessionId); assert.equal(row.document_hash, doc.documentHash);
      assert.equal(row.profile, report.profile); assert.equal(row.dimensions, 1024);
      assert.ok(Math.abs(Math.hypot(...JSON.parse(row.vector)) - 1) < 1e-6);
    }
    for (const result of report.results) {
      const dataset = JSON.parse(readFileSync(join(root, result.dataset), 'utf8'));
      assert.equal(result.rows.length, dataset.questions.length);
      for (const row of result.rows) {
        assert.equal(row.queryVector.length, 1024); assert.ok(row.queryVector.every(Number.isFinite));
        assert.ok(Math.abs(Math.hypot(...row.queryVector) - 1) < 1e-6);
        const ranked = rows.map(cached => ({ boxId: cached.box_id, ...(cached.session_id ? { sessionId: cached.session_id } : {}),
          similarity: Math.max(-1, Math.min(1, JSON.parse(cached.vector).reduce((sum, n, i) => sum + n * row.queryVector[i], 0))) }))
          .sort((a, b) => b.similarity - a.similarity || a.boxId.localeCompare(b.boxId));
        assert.deepEqual(row.matches, ranked);
      }
      const answers = dataset.questions.filter(q => q.expected.kind === 'answer');
      const hits = n => answers.filter(q => result.rows.find(row => row.id === q.id).matches.slice(0, n).some(m => q.expected.acceptableBoxIds.includes(m.boxId))).length;
      assert.equal(result.answerCases, answers.length); assert.equal(result.top1, hits(1)); assert.equal(result.top5, hits(5));
    }
    console.log('AUDIT PASS: source/code hashes, archived code, cached sessions/content/profiles, all vectors/rankings and metrics; no network.');
  } finally { db.close(); store.close(); }
  process.exit(0);
}

const [rootArg, outputArg, baseUrl, model, modelRevision] = process.argv.slice(2);
assert(rootArg && outputArg && baseUrl && model && modelRevision,
  'Usage: node scripts/verify-semantic-live.js ROOT NEW_OUTPUT OLLAMA_NATIVE_ORIGIN MODEL MODEL_REVISION');
const root = resolve(rootArg), output = resolve(outputArg);
const hash = value => createHash('sha256').update(value).digest('hex');
const names = ['inventory.json', 'questions-v1.reviewed.json', 'questions-v2.user-reviewed.json'];
const sourceHashes = Object.fromEntries(names.map(name => [name, hash(readFileSync(join(root, name)))]));
const code = ['src/embeddings.js', 'src/semantic-index.js', 'src/semantic-runtime.js', 'src/store.js', 'src/inventory.js', 'src/server.js', 'scripts/verify-semantic-live.js'];
const codeHashes = Object.fromEntries(code.map(name => [name, hash(readFileSync(name))]));
const save = (name, value) => writeFileSync(join(output, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
mkdirSync(output); // Refuse to overwrite previous evidence.
save('preflight.json', { sourceHashes, codeHashes, model, modelRevision, baseUrl, started: new Date().toISOString() });
for (const name of code) writeFileSync(join(output, name.replaceAll('/', '__')), readFileSync(name), { flag: 'wx' });
const store = new Store(':memory:'); store.importLegacy(JSON.parse(readFileSync(join(root, 'inventory.json'), 'utf8')));
const inventory = new Inventory(store), before = hash(JSON.stringify(store.read()));
const cache = new SemanticCache(join(output, 'embeddings.sqlite'));
const embedder = new OllamaEmbeddings({ baseUrl, model, modelRevision, dimensions: 1024 });
const embed = embedder.embed.bind(embedder); let lastVector;
embedder.embed = async text => { const vector = await embed(text); lastVector = unitVector(vector, 1024); return vector; };
const index = new SemanticIndex({ inventory, cache, embedder });
try {
  const start = performance.now(); await index.start(); const buildMs = performance.now() - start;
  assert.equal(index.status().state, 'ready'); assert.equal(cache.audit().ok, true);
  const results = [];
  for (const name of names.slice(1)) {
    const dataset = JSON.parse(readFileSync(join(root, name), 'utf8'));
    const rows = [];
    for (const question of dataset.questions) {
      const started = performance.now(); const result = await index.search(question.query);
      assert.equal(result.available, true); assert.equal(result.semanticMatches.length, inventory.list().length);
      rows.push({ id: question.id, latencyMs: performance.now() - started, matches: result.semanticMatches, queryVector: lastVector });
    }
    const answers = dataset.questions.filter(q => q.expected.kind === 'answer');
    const correct = (q, n) => rows.find(row => row.id === q.id).matches.slice(0, n).some(m => q.expected.acceptableBoxIds.includes(m.boxId));
    results.push({ dataset: name, answerCases: answers.length, top1: answers.filter(q => correct(q, 1)).length,
      top5: answers.filter(q => correct(q, 5)).length, rows });
  }
  // Native API must reject, rather than embed a silently truncated prefix.
  await assert.rejects(embedder.embed('ord '.repeat(10000)), { status: 503 });
  const rejection = await fetch(`${baseUrl}/api/embed`, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model, input: 'ord '.repeat(10000), truncate: false }), signal: AbortSignal.timeout(15000) });
  assert.equal(rejection.status, 400);
  assert.match((await rejection.json()).error, /length|context/i);
  const nativeOverlengthRejected = true;
  assert.equal(hash(JSON.stringify(store.read())), before); assert.equal(store.audit().ok, true);
  for (const [name, digest] of Object.entries(sourceHashes)) assert.equal(hash(readFileSync(join(root, name))), digest);
  for (const [name, digest] of Object.entries(codeHashes)) assert.equal(hash(readFileSync(name)), digest);
  save('report.json', { sourceHashes, codeHashes, model, modelRevision, buildMs, status: index.status(), profile: index.profile, cacheHash: hash(JSON.stringify(cache.rows())),
    nativeOverlengthRejected, unchangedInventory: true, audit: cache.audit(), results });
  console.log(JSON.stringify({ buildMs, status: index.status(), nativeOverlengthRejected,
    retrieval: results.map(({ dataset, answerCases, top1, top5 }) => ({ dataset, answerCases, top1, top5 })) }, null, 2));
} finally { await index.stop(); cache.close(); store.close(); }
