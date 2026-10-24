// Verify unchanged policy against new source-derived cases; never fit thresholds.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { Store } from '../src/store.js';
import { Inventory } from '../src/inventory.js';

const auditMode = process.argv[2] === '--audit';
const saved = auditMode ? JSON.parse(readFileSync(resolve(process.argv[4], 'report.json'))) : null;
const [rootArg, denseArg, outputArg] = auditMode
  ? [process.argv[3], saved.inputs.dense, process.argv[4]] : process.argv.slice(2);
if (!outputArg) throw new Error('Usage: node scripts/verify-source-acceptance.js ROOT DENSE_REPORT OUTPUT_DIRECTORY');
const root = resolve(rootArg), output = resolve(outputArg);
const read = file => readFileSync(resolve(root, file));
const load = file => JSON.parse(read(file));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const freeze = load('acceptance-v3/freeze.json'), dataset = load('acceptance-v3/questions.json');
assert.equal(dataset.status, 'source_evidence_frozen');
for (const [file, digest] of Object.entries(freeze.codeHashes)) assert.equal(hash(readFileSync(file)), digest);
for (const [file, key] of [['search-corpus.json', 'corpusSha256'], ['inventory.json', 'inventorySha256']]) assert.equal(hash(read(file)), dataset.source[key]);
const dense = load(denseArg);
for (const [file, digest] of Object.entries(dense.sourceHashes)) assert.equal(hash(read(file)), digest);
const denseDirectory = denseArg.replace(/[/\\]report\.json$/, '');
assert.equal(hash(read(`${denseDirectory}/queries.npz`)), dense.vectorSha256);
assert.equal(hash(read(`${denseDirectory}/evaluator.py`)), dense.scriptSha256);
const corpus = new Map(load('search-corpus.json').map(doc => [doc.boxId, doc]));
for (const question of dataset.questions) {
  for (const entry of question.evidence) assert.deepEqual(entry, corpus.get(entry.boxId));
  for (const term of question.expected.absentLiteralTerms || []) assert.ok([...corpus.values()].every(doc => !doc.text.toLowerCase().includes(term.toLowerCase())));
}
const scores = dense.results;
assert.equal(scores.length, dataset.questions.length);
const thresholds = { similarity: freeze.thresholds.similarityThreshold, margin: freeze.thresholds.marginThreshold };
const store = new Store(resolve(root, 'inventory.sqlite'), { readOnly: true });
try {
  const inventory = new Inventory(store), before = store.read();
  const cases = dataset.questions.map((q, index) => {
    assert.equal(scores[index].id, q.id);
    const semanticMatches = scores[index].matches.map(m => ({ boxId: m.boxId, similarity: m.similarity, sessionId: corpus.get(m.boxId).sessionId }));
    const response = inventory.previewAnswer(q.query, { thresholds, semanticMatches }, 'sv');
    const correct = q.expected.kind === 'answer'
      ? response.decision === 'answer' && response.selectedBoxIds.length > 0 && response.selectedBoxIds.every(id => q.expected.acceptableBoxIds.includes(id))
      : response.decision === q.expected.kind;
    return { id: q.id, query: q.query, expected: q.expected.kind, decision: response.decision,
      selectedBoxIds: response.selectedBoxIds, answer: response.answer, reason: response.reason,
      correct, incorrectConfidentAnswer: response.decision === 'answer' && !correct,
      top1: response.matches[0]?.boxId };
  });
  assert.deepEqual(store.read(), before);
  assert.equal(store.audit().ok, true);
  const summary = { cases: cases.length, correctDecisions: cases.filter(c => c.correct).length,
    incorrectConfidentAnswers: cases.filter(c => c.incorrectConfidentAnswer).length,
    byExpectedKind: Object.fromEntries(['answer', 'clarify', 'no_supported_match'].map(kind => {
      const group = cases.filter(c => c.expected === kind);
      return [kind, { cases: group.length, correct: group.filter(c => c.correct).length }];
    })) };
  const criteria = dataset.preRegisteredCriteria;
  const passed = summary.incorrectConfidentAnswers <= criteria.maxIncorrectConfidentAnswers && summary.correctDecisions >= criteria.minimumCorrectDecisions;
  const sources = ['acceptance-v3/freeze.json', 'acceptance-v3/questions.json', denseArg, 'search-corpus.json', 'inventory.json'];
  const report = { inputs: { dense: denseArg }, sourceHashes: Object.fromEntries(sources.map(file => [file, hash(read(file))])),
    verifierSha256: hash(readFileSync('scripts/verify-source-acceptance.js')),
    codeHashes: freeze.codeHashes, thresholds, configuredRuleCount: 0, criteria, passed, summary, cases,
    limitations: dataset.limitations, unchangedPolicy: true, noInventoryWrites: true, sqliteAuditPassed: true };
  if (auditMode) {
    assert.deepEqual(JSON.parse(JSON.stringify(report)), saved);
    for (const [file, digest] of Object.entries(freeze.codeHashes)) assert.equal(hash(readFileSync(resolve(output, file.replaceAll('/', '--')))), digest);
    assert.equal(hash(readFileSync(resolve(output, 'scripts--verify-source-acceptance.js'))), saved.verifierSha256);
    console.log(`AUDIT PASS: frozen policy, sources, all decisions/answers and database integrity reproduce. Product gate remains ${passed ? 'PASS' : 'FAIL'}.`);
  } else {
    mkdirSync(output);
    for (const file of [...Object.keys(freeze.codeHashes), 'scripts/verify-source-acceptance.js']) writeFileSync(resolve(output, file.replaceAll('/', '--')), readFileSync(file), { flag: 'wx' });
    writeFileSync(resolve(output, 'report.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
    console.log(JSON.stringify({ output, passed, summary, failures: cases.filter(c => !c.correct) }, null, 2));
    if (!passed) process.exitCode = 1;
  }
} finally { store.close(); }
