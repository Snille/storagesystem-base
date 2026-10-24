// Read-only bridge to the real shared search, not a Python reimplementation.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { Store } from '../src/store.js';
import { Inventory } from '../src/inventory.js';

const directory = resolve(process.argv[2]);
const read = name => readFileSync(resolve(directory, name));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const dataset = JSON.parse(read('questions-v1.reviewed.json'));
const baseline = JSON.parse(read('lexical-baseline-v1.reviewed.json'));
assert.equal(baseline.datasetSha256, hash(read('questions-v1.reviewed.json')));
assert.equal(dataset.source.corpusSha256, hash(read('search-corpus.json')));
assert.equal(dataset.source.inventorySha256, hash(read('inventory.json')));
const store = new Store(resolve(directory, 'inventory.sqlite'), { readOnly: true });
try {
  const inventory = new Inventory(store);
  const results = dataset.questions.map((question, index) => {
    const start = performance.now();
    const matches = inventory.search(question.query, 25, question.language)
      .map(({ boxId, locationId, score, label }) => ({ boxId, locationId, score, label }));
    const latencyMs = performance.now() - start;
    assert.deepEqual(matches.slice(0, 5), baseline.results[index].matches);
    return { id: question.id, matches, latencyMs };
  });
  assert.equal(store.audit().ok, true);
  writeFileSync(resolve(directory, 'lexical-top25.json'), JSON.stringify({
    datasetSha256: baseline.datasetSha256, corpusSha256: baseline.corpusSha256,
    codeSha256: Object.fromEntries(['src/search.js', 'src/inventory.js', 'src/store.js', 'scripts/evaluation-lexical.js']
      .map(file => [file, hash(readFileSync(file))])), results,
  }, null, 2) + '\n', { flag: 'wx' });
  console.log('Frozen top-5 reproduced; top-25 and local query timings saved privately.');
} finally { store.close(); }
