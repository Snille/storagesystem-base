// Offline decision preview: no network, inference, runtime settings or writes.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { Store } from '../src/store.js';
import { Inventory } from '../src/inventory.js';

const auditMode = process.argv[2] === '--audit';
const saved = auditMode ? JSON.parse(readFileSync(resolve(process.argv[4], 'report.json'))) : null;
const [rootArg, datasetArg, denseArg, outputArg, rulesArg] = auditMode
  ? [process.argv[3], saved.inputs.dataset, saved.inputs.dense, process.argv[4], saved.inputs.rules]
  : process.argv.slice(2);
if (!outputArg) throw new Error('Usage: node scripts/evaluate-answer-policy.js ROOT DATASET DENSE_REPORT OUTPUT_DIRECTORY [RULES_JSON]');
const root = resolve(rootArg), output = resolve(outputArg);
const read = file => readFileSync(resolve(root, file));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const dataset = JSON.parse(read(datasetArg)), dense = JSON.parse(read(denseArg));
assert.ok(['user_reviewed_frozen', 'source_evidence_frozen'].includes(dataset.status));
assert.equal(hash(read('search-corpus.json')), dataset.source.corpusSha256);
assert.equal(hash(read('inventory.json')), dataset.source.inventorySha256);
assert.equal(dense.sourceHashes[datasetArg], hash(read(datasetArg)));
const rules = rulesArg ? JSON.parse(read(rulesArg)) : [];
const prior = JSON.parse(read('user-ollama-20261022T213348Z/report.json'));
const thresholds = { similarity: prior.fixedPolicy.similarityThreshold, margin: prior.fixedPolicy.marginThreshold };
const rows = dense.results.semantic || dense.results;
assert.equal(rows.length, dataset.questions.length);
const store = new Store(resolve(root, 'inventory.sqlite'), { readOnly: true });
try {
  const inventory = new Inventory(store);
  const before = JSON.stringify(store.read());
  const current = new Map(inventory.list('sv').map(box => [box.boxId, box]));
  const corpus = new Map(JSON.parse(read('search-corpus.json')).map(doc => [doc.boxId, doc]));
  for (const [id, box] of current) assert.equal(box.sessionId, corpus.get(id).sessionId);
  const results = dataset.questions.map((question, index) => {
    assert.equal(rows[index].id, question.id);
    const semanticMatches = rows[index].matches.map(match => ({ boxId: match.boxId,
      similarity: match.similarity, sessionId: corpus.get(match.boxId).sessionId }));
    const response = inventory.previewAnswer(question.query, { thresholds, semanticMatches, rules }, question.language);
    const valid = question.expected.kind === 'answer'
      ? response.decision === 'answer' && response.selectedBoxIds.every(id => question.expected.acceptableBoxIds.includes(id))
        && (question.expected.requiredMentionBoxIds || []).every(id => response.selectedBoxIds.includes(id))
      : response.decision === question.expected.kind;
    return { id: question.id, query: question.query, expected: question.expected.kind,
      decision: response.decision, selectedBoxIds: response.selectedBoxIds, reason: response.reason,
      answer: response.answer, correct: valid, ruleId: response.ruleId,
      incorrectConfidentAnswer: response.decision === 'answer' && !valid,
      top1: response.matches[0]?.boxId, top1Correct: question.expected.kind === 'answer'
        && question.expected.acceptableBoxIds.includes(response.matches[0]?.boxId) };
  });
  assert.equal(JSON.stringify(store.read()), before);
  assert.equal(store.audit().ok, true);
  const answerCases = results.filter(row => row.expected === 'answer');
  const summary = { cases: results.length, correctDecisions: results.filter(row => row.correct).length,
    incorrectConfidentAnswers: results.filter(row => row.incorrectConfidentAnswer).length,
    answerCases: answerCases.length, top1Correct: answerCases.filter(row => row.top1Correct).length,
    correctAnswers: results.filter(row => row.correct && row.decision === 'answer').length };
  const sources = [...new Set([datasetArg, denseArg, 'search-corpus.json', 'inventory.json',
    'user-ollama-20261022T213348Z/report.json', ...(rulesArg ? [rulesArg] : [])])];
  const code = ['src/answer-policy.js', 'src/inventory.js', 'src/locations.js', 'src/search.js', 'scripts/evaluate-answer-policy.js'];
  const report = { inputs: { dataset: datasetArg, dense: denseArg, rules: rulesArg || null },
    sourceHashes: Object.fromEntries(sources.map(file => [file, hash(read(file))])),
    codeHashes: Object.fromEntries(code.map(file => [file, hash(readFileSync(file))])),
    thresholds, configuredRuleCount: rules.length, summary, results,
    datasetStatus: dataset.status,
    limitations: ['Development/regression evidence after inspecting failures, not fresh acceptance.',
      ...(dataset.limitations || []),
      'Explicit owner rules scored separately from generic evidence logic.', 'No runtime semantic route or physical speech acceptance.'] };
  if (auditMode) {
    assert.deepEqual(JSON.parse(JSON.stringify(report)), saved);
    for (const [file, expected] of Object.entries(saved.codeHashes)) assert.equal(hash(readFileSync(resolve(output, file.replaceAll('/', '--')))), expected);
    console.log('AUDIT PASS: frozen inputs, archived code, all decisions/selected destinations and full metrics reproduce; SQLite audit PASS.');
    process.exitCode = 0;
  } else {
    mkdirSync(output);
    for (const file of code) writeFileSync(resolve(output, file.replaceAll('/', '--')), readFileSync(file), { flag: 'wx' });
    writeFileSync(resolve(output, 'report.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
    console.log(JSON.stringify({ output, summary, failures: results.filter(row => !row.correct) }, null, 2));
  }
} finally { store.close(); }
