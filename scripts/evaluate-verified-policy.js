// Optional live local verification, or offline replay of saved identity evidence.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { Store } from '../src/store.js';
import { Inventory } from '../src/inventory.js';
import { IdentityVerifier } from '../src/identity-verifier.js';

const audit = process.argv[2] === '--audit';
const saved = audit ? JSON.parse(readFileSync(resolve(process.argv[4], 'report.json'))) : null;
const [rootArg, datasetArg, denseArg, outputArg, keyPath, baseUrl, model, rulesArg] = audit
  ? [process.argv[3], saved.inputs.dataset, saved.inputs.dense, process.argv[4], null, saved.verifier.baseUrl, saved.verifier.model, saved.inputs.rules]
  : process.argv.slice(2);
if (!outputArg || !model || (!audit && !keyPath)) throw new Error('Usage: ROOT DATASET DENSE_REPORT OUTPUT_DIRECTORY KEY_FILE LOCAL_BASE_URL MODEL [RULES_JSON], or --audit ROOT OUTPUT_DIRECTORY');
const root = resolve(rootArg), output = resolve(outputArg);
const read = name => readFileSync(resolve(root, name));
const load = name => JSON.parse(read(name));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const dataset = load(datasetArg), dense = load(denseArg), prior = load('user-ollama-20261022T213348Z/report.json');
assert.ok(['user_reviewed_frozen', 'source_evidence_frozen'].includes(dataset.status));
assert.equal(hash(read('search-corpus.json')), dataset.source.corpusSha256);
assert.equal(hash(read('inventory.json')), dataset.source.inventorySha256);
assert.equal(dense.sourceHashes[datasetArg], hash(read(datasetArg)));
const corpus = new Map(load('search-corpus.json').map(doc => [doc.boxId, doc]));
const thresholds = { similarity: prior.fixedPolicy.similarityThreshold, margin: prior.fixedPolicy.marginThreshold };
const rules = rulesArg ? load(rulesArg) : [];
const sources = [...new Set([datasetArg, denseArg, 'search-corpus.json', 'inventory.json', 'user-ollama-20261022T213348Z/report.json', ...(rulesArg ? [rulesArg] : [])])];
const code = ['src/answer-policy.js', 'src/identity-verifier.js', 'src/inventory.js', 'src/validation.js', 'src/locations.js', 'src/search.js', 'scripts/evaluate-verified-policy.js'];
const sourceHashes = Object.fromEntries(sources.map(name => [name, hash(read(name))]));
const codeHashes = Object.fromEntries(code.map(name => [name, hash(readFileSync(name))]));
if (!audit) {
  mkdirSync(output);
  for (const name of code) writeFileSync(resolve(output, name.replaceAll('/', '--')), readFileSync(name), { flag: 'wx' });
  writeFileSync(resolve(output, 'preflight.json'), JSON.stringify({ sourceHashes, codeHashes, thresholds, verifier: { baseUrl, model, timeoutMs: 60000 } }, null, 2) + '\n', { flag: 'wx' });
}
const verifier = audit ? null : new IdentityVerifier({ baseUrl, model, apiKey: readFileSync(keyPath, 'utf8').trim(), timeoutMs: 60000 });
const store = new Store(resolve(root, 'inventory.sqlite'), { readOnly: true });
try {
  const inventory = new Inventory(store), before = store.read();
  const rows = dense.results.semantic || dense.results, results = [];
  assert.equal(rows.length, dataset.questions.length);
  for (const [index, question] of dataset.questions.entries()) {
    assert.equal(rows[index].id, question.id);
    const semanticMatches = rows[index].matches.map(m => ({ boxId: m.boxId, similarity: m.similarity, sessionId: corpus.get(m.boxId).sessionId }));
    let proof = null, outcome = 'not_needed';
    const started = performance.now();
    const options = { semanticMatches, thresholds, rules,
      ...(question.confirmedIntent && dataset.status === 'user_reviewed_frozen' ? { confirmedIntent: question.confirmedIntent } : {}) };
    const response = audit ? inventory.previewAnswer(question.query, { ...options, identityEvidence: saved.results[index].identityEvidence }, question.language)
      : await inventory.verifiedPreviewAnswer(question.query, options, { verify: async (query, box, intent) => {
        proof = await verifier.verify(query, box, intent); outcome = verifier.lastOutcome; return proof;
      } }, question.language);
    const correct = question.expected.kind === 'answer'
      ? response.decision === 'answer' && response.selectedBoxIds.length > 0 && response.selectedBoxIds.every(id => question.expected.acceptableBoxIds.includes(id))
        && (question.expected.requiredMentionBoxIds || []).every(id => response.selectedBoxIds.includes(id))
      : response.decision === question.expected.kind;
    const result = { id: question.id, query: question.query, expected: question.expected.kind,
      decision: response.decision, selectedBoxIds: response.selectedBoxIds, answer: response.answer, reason: response.reason,
      correct, incorrectConfidentAnswer: response.decision === 'answer' && !correct,
      identityEvidence: audit ? saved.results[index].identityEvidence : proof ? [proof] : [],
      verifierOutcome: audit ? saved.results[index].verifierOutcome : outcome,
      latencyMs: audit ? saved.results[index].latencyMs : performance.now() - started };
    results.push(result);
    if (!audit && outcome !== 'not_needed') console.log(`${question.id}: identity ${outcome} (${Math.round(result.latencyMs)} ms)`);
  }
  assert.deepEqual(store.read(), before); assert.equal(store.audit().ok, true);
  const summary = { cases: results.length, correctDecisions: results.filter(r => r.correct).length,
    incorrectConfidentAnswers: results.filter(r => r.incorrectConfidentAnswer).length,
    verifierCalls: results.filter(r => r.verifierOutcome !== 'not_needed').length,
    verificationUnavailable: results.filter(r => ['unavailable', 'busy', 'invalid', 'oversized'].includes(r.verifierOutcome)).length };
  const report = { inputs: { dataset: datasetArg, dense: denseArg, rules: rulesArg || null }, sourceHashes, codeHashes, thresholds,
    verifier: { baseUrl, model, timeoutMs: 60000 }, configuredRuleCount: rules.length, summary, results,
    limitations: ['Development regression after inspecting failures, not independent acceptance.', 'Model identity checking is probabilistic; quoted source validates provenance, not logical truth.', 'No runtime/public interface activation, inventory writes or speech testing.'] };
  if (audit) {
    assert.deepEqual(report, saved);
    for (const [name, digest] of Object.entries(codeHashes)) assert.equal(hash(readFileSync(resolve(output, name.replaceAll('/', '--')))), digest);
    console.log('AUDIT PASS: current source/evidence/session guards, all decisions and archived code reproduce without inference.');
  } else {
    writeFileSync(resolve(output, 'report.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
    console.log(JSON.stringify({ output, summary, failures: results.filter(r => !r.correct) }, null, 2));
  }
} finally { store.close(); }
