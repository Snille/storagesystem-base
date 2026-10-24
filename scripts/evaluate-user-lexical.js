// Score frozen user questions through the unchanged shared search, read-only.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { Store } from '../src/store.js';
import { Inventory } from '../src/inventory.js';

const root = resolve(process.argv[2]);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const datasetName = 'questions-v2.user-reviewed.json';
const bytes = readFileSync(resolve(root, datasetName));
const dataset = JSON.parse(bytes);
assert.equal(dataset.status, 'user_reviewed_frozen');
for (const [file, key] of [['inventory.json', 'inventorySha256'], ['search-corpus.json', 'corpusSha256']]) {
  assert.equal(hash(readFileSync(resolve(root, file))), dataset.source[key]);
}
const store = new Store(resolve(root, 'inventory.sqlite'), { readOnly: true });
try {
  const inventory = new Inventory(store);
  const results = dataset.questions.map(question => {
    const matches = inventory.search(question.query, 25, 'sv')
      .map(({ boxId, locationId, score, label }) => ({ boxId, locationId, score, label }));
    return { id: question.id, matches };
  });
  assert.equal(store.audit().ok, true);
  const report = { datasetSha256: hash(bytes),
    codeSha256: Object.fromEntries(['src/search.js', 'src/inventory.js', 'src/store.js', 'scripts/evaluate-user-lexical.js']
      .map(file => [file, hash(readFileSync(file))])), results };
  writeFileSync(resolve(root, 'lexical-user-v2.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log('Read-only user-question lexical rankings saved; SQLite audit PASS.');
} finally { store.close(); }
