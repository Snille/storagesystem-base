import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/store.js';
import { Inventory } from '../src/inventory.js';

function setup() {
  const store = new Store(':memory:'), inventory = new Inventory(store);
  const save = (id, label, keywords, summary = '', location = `A-H1-P${inventory.list().length + 1}`) => inventory.save({
    box: { boxId: id, label, currentLocationId: location },
    session: { boxId: id, summary, itemKeywords: keywords }, photos: []
  });
  const scores = entries => entries.map(([id, similarity]) => ({ boxId: id, similarity, sessionId: inventory.get(id).sessionId }));
  const thresholds = { similarity: 0.6, margin: 0.05 };
  return { store, inventory, save, scores, thresholds };
}

test('direct whole-word evidence repairs a weak dense ranking without changing ordinary search or inventory', () => {
  const { store, inventory, save, scores, thresholds } = setup();
  try {
    save('WOOD', 'Wood screws', ['träskruv'], 'Screws for timber');
    save('NAILS', 'Fasteners', ['spik'], 'Steel nails', 'B-H3-P2-A');
    const before = store.read(), original = inventory.search('Spikar');
    const response = inventory.previewAnswer('Spikar', { semanticMatches: scores([['WOOD', 0.4], ['NAILS', 0.2]]), thresholds }, 'sv');
    assert.equal(response.decision, 'answer');
    assert.deepEqual(response.selectedBoxIds, ['NAILS']);
    assert.match(response.answer, /Lagerhylla: B, Hylla 3, Plats: 2A/);
    assert.doesNotMatch(response.answer, /WOOD/);
    assert.deepEqual(inventory.search('Spikar'), original);
    assert.deepEqual(store.read(), before);
    assert.equal(store.audit().ok, true);
  } finally { store.close(); }
});

test('exact labels, compounds, Swedish inflections and separate keywords support short queries; codes stay exact', () => {
  const { store, inventory, save, scores, thresholds } = setup();
  try {
    save('BAGS', 'Shopping-bags', ['bag']);
    save('BOLTS', 'Fasteners', ['bolt', 'M8']);
    save('OTHER', 'M80 fasteners', ['M80', 'bolt']);
    assert.deepEqual(inventory.previewAnswer('Shoppingbags').selectedBoxIds, ['BAGS']);
    assert.deepEqual(inventory.previewAnswer('M8 bolt').selectedBoxIds, ['BOLTS']);
    const wrongCode = inventory.previewAnswer('M9 bolt', { semanticMatches: scores([['BOLTS', 0.95], ['OTHER', 0.7]]), thresholds });
    assert.equal(wrongCode.decision, 'no_supported_match');
    assert.equal(wrongCode.matches.length, 0);
  } finally { store.close(); }
});

test('ambiguity, explicit equivalent destinations, two-place answers and localized questions remain distinct', () => {
  const { store, inventory, save } = setup();
  try {
    save('ONE', 'Connector stock', ['connector']);
    save('TWO', 'Connector packs', ['connector']);
    assert.equal(inventory.previewAnswer('connector').decision, 'clarify');
    const rule = { id: 'accepted-types', queries: ['connector'], boxIds: ['ONE', 'TWO'], action: 'all' };
    const both = inventory.previewAnswer('connector', { rules: [rule] });
    assert.deepEqual(both.selectedBoxIds, ['ONE', 'TWO']);
    assert.match(both.answer, /Connector stock.*; Connector packs/);
    const one = inventory.previewAnswer('connector', { rules: [{ ...rule, action: 'any' }] });
    assert.equal(one.selectedBoxIds.length, 1);
    const clarify = { ...rule, action: 'clarify', question: { sv: 'Behöver du en färdig kontakt?', en: 'Do you need a finished connector?' } };
    assert.equal(inventory.previewAnswer('connector', { rules: [clarify] }, 'sv').answer, clarify.question.sv);
    assert.equal(inventory.previewAnswer('connector', { rules: [clarify] }, 'de').answer, 'Welche Art brauchst du?');
    assert.equal(inventory.previewAnswer('connector adapter', { rules: [rule] }).decision, 'no_supported_match');
    assert.equal(inventory.previewAnswer('connector', { rules: [rule, { ...rule, id: 'other' }] }).reason, 'conflicting_rules');
    save('TWO', 'Empty', [], 'No contents');
    assert.equal(inventory.previewAnswer('connector', { rules: [rule] }).reason, 'rule_evidence_missing');
  } finally { store.close(); }
});

test('negated and historical contents cannot authorize rules or confident semantic answers', () => {
  const { store, inventory, save, scores, thresholds } = setup();
  try {
    save('EMPTY', 'Nails', ['nails'], 'No nails remain.');
    save('HISTORY', 'Tape', ['tape'], 'Adhesive tape');
    save('HISTORY', 'Empty', [], 'No contents');
    const response = inventory.previewAnswer('nails', { semanticMatches: scores([['EMPTY', 0.99], ['HISTORY', 0.2]]), thresholds });
    assert.equal(response.decision, 'no_supported_match');
    assert.ok(!response.matches.some(box => box.boxId === 'EMPTY'));
    assert.equal(inventory.previewAnswer('Tape').decision, 'no_supported_match');
  } finally { store.close(); }
});

test('unknown, stale, duplicate or invalid semantic candidates and malformed rules fail closed', () => {
  const { store, inventory, save, scores } = setup();
  try {
    save('A', 'Tools', ['tool']);
    const old = scores([['A', 0.9]]);
    save('A', 'Moved tools', ['tool']);
    assert.throws(() => inventory.previewAnswer('tool', { semanticMatches: old }), /current inventory/);
    assert.throws(() => inventory.previewAnswer('tool', { semanticMatches: [{ boxId: 'missing', sessionId: 'x', similarity: 0.9 }] }), /current inventory/);
    for (const similarity of [NaN, Infinity, 1.1]) assert.throws(() => inventory.previewAnswer('tool', { semanticMatches: scores([['A', similarity]]) }), /score/);
    assert.throws(() => inventory.previewAnswer('tool', { semanticMatches: scores([['A', 0.9], ['A', 0.8]]) }), /duplicate/);
    assert.throws(() => inventory.previewAnswer('tool', { thresholds: { similarity: NaN, margin: 0 } }), /thresholds/);
    assert.throws(() => inventory.previewAnswer('tool', { rules: [{ id: 'bad' }] }), /rule/);
    assert.equal(inventory.previewAnswer('var finns det på').decision, 'no_supported_match');
    // A no-match answer names what was searched for, so a mishearing is audible.
    assert.equal(inventory.previewAnswer('Var finns skruvmejseln?', {}, 'sv').answer, 'Jag hittar ingen säker träff för "skruvmejseln" i inventeringen.');
    assert.equal(inventory.previewAnswer('var finns det på', {}, 'sv').answer, 'Jag hittar ingen säker träff i inventeringen.');
  } finally { store.close(); }
});

test('code and dimension filters preserve exact values and attached units without promoting semantic-only matches', () => {
  const { store, inventory, save, scores, thresholds } = setup();
  try {
    save('SMALL', 'Sleeve kit', ['sleeve'], 'Diameter 3-12mm. Model ZQ-741.');
    save('LARGE', 'Sleeve kit', ['sleeve'], 'Diameter 30-120mm. Model ZQ-7410.');
    const filtered = inventory.previewAnswer('find ZQ-741', { semanticMatches: scores([['SMALL', 0.8], ['LARGE', 0.79]]), thresholds });
    assert.equal(filtered.decision, 'clarify');
    assert.deepEqual(filtered.matches.map(box => box.boxId), ['SMALL']);
    const safe = inventory.previewAnswer('find ZQ-741', { semanticMatches: scores([['SMALL', 0.9], ['LARGE', 0.7]]), thresholds });
    assert.equal(safe.decision, 'no_supported_match');
    assert.deepEqual(inventory.previewAnswer('ZQ-741').selectedBoxIds, ['SMALL']);
    assert.deepEqual(inventory.previewAnswer('sleeve 3 12').selectedBoxIds, ['SMALL']);
    assert.equal(inventory.previewAnswer('sleeve 4 12').decision, 'no_supported_match');
  } finally { store.close(); }
});

test('verified semantic evidence is bound to exact query, current session and primary source quotes', async () => {
  const { store, inventory, save, scores, thresholds } = setup();
  try {
    save('A', 'Microscope', ['microscope'], 'Optical inspection instrument.');
    save('B', 'Lamp', ['lamp']);
    const options = { semanticMatches: scores([['A', 0.9], ['B', 0.2]]), thresholds };
    const verifier = { verify: async (query, box) => ({ query, boxId: box.boxId, sessionId: box.sessionId,
      field: 'summary', quote: box.summary }) };
    const before = store.read();
    const response = await inventory.verifiedPreviewAnswer('inspection device', options, verifier);
    assert.deepEqual(response.selectedBoxIds, ['A']);
    assert.equal(response.reason, 'verified_semantic_evidence');
    assert.deepEqual(store.read(), before);
    const proof = await verifier.verify('inspection device', inventory.get('A'));
    assert.throws(() => inventory.previewAnswer('different request', { ...options, identityEvidence: [proof] }), /query\/current session/);
    assert.throws(() => inventory.previewAnswer('inspection device', { ...options, identityEvidence: [{ ...proof, confirmedIntent: 'another object' }] }), /query\/current session/);
    assert.throws(() => inventory.previewAnswer('inspection device', { ...options, identityEvidence: [{ ...proof, quote: 'Invented text' }] }), /current inventory/);
    assert.equal((await inventory.verifiedPreviewAnswer('inspection device', options, { verify: async () => { throw new Error('private upstream failure'); } })).decision, 'no_supported_match');
    assert.equal((await inventory.verifiedPreviewAnswer('inspection device', options, { verify: async () => null })).decision, 'no_supported_match');
    await assert.rejects(inventory.verifiedPreviewAnswer('inspection device', { ...options, identityEvidence: [proof] }, verifier), /only by the verifier/);
    await assert.rejects(inventory.verifiedPreviewAnswer('inspection device', options, { verify: async (query, box) => {
      save('A', 'Empty', [], 'Removed');
      return { query, boxId: box.boxId, sessionId: box.sessionId, field: 'summary', quote: box.summary };
    } }), /current session/);
  } finally { store.close(); }
});

test('identity evidence can quote only current-session photo notes, never retired photos', () => {
  const { store, inventory, save, scores, thresholds } = setup();
  try {
    const attach = notes => inventory.save({ box: { boxId: 'CAMERA', label: 'Inspection kit', currentLocationId: 'A-H1-P1' },
      session: { boxId: 'CAMERA', summary: '', itemKeywords: [] },
      photos: [{ immichAssetId: 'asset-current', photoRole: 'inside', notes }] });
    attach('Retired camera description.');
    attach('Optical inspection device.');
    save('OTHER', 'Lamp', ['lamp']);
    const options = { semanticMatches: scores([['CAMERA', 0.9], ['OTHER', 0.2]]), thresholds };
    const proof = { query: 'inspection device', boxId: 'CAMERA', sessionId: inventory.get('CAMERA').sessionId,
      field: 'photoNotes', quote: 'Optical inspection device.' };
    assert.deepEqual(inventory.previewAnswer('inspection device', { ...options, identityEvidence: [proof] }).selectedBoxIds, ['CAMERA']);
    assert.throws(() => inventory.previewAnswer('inspection device', { ...options, identityEvidence: [{ ...proof, quote: 'Retired camera description.' }] }), /current inventory/);
    assert.equal(store.audit().ok, true);
  } finally { store.close(); }
});

test('high semantic similarity cannot substitute a related object with a different identity', () => {
  const { store, inventory, save, scores, thresholds } = setup();
  try {
    save('METER', 'Ljudnivåmätare', ['ljudnivåmätare', 'batteri'], 'Measures sound levels.');
    save('LIGHT', 'Arbetslampa', ['lampa'], 'Lighting for a workbench.');
    for (const query of ['Ljusnivåmätare', 'Liten ljusnivåmätare', 'Okänd mätare', 'ljusnivåmätare batteri']) {
      const response = inventory.previewAnswer(query, { semanticMatches: scores([['METER', 0.99], ['LIGHT', 0.2]]), thresholds }, 'sv');
      assert.equal(response.decision, 'no_supported_match', query);
      assert.deepEqual(response.selectedBoxIds, [], query);
      assert.equal(response.reason, 'unverified_item_identity', query);
    }
  } finally { store.close(); }
});

test('unverified spellings and unknown qualifiers cannot create object evidence or rewrite codes', () => {
  const { store, inventory, save, scores, thresholds } = setup();
  try {
    save('SCOPE', 'Mikroskop', ['mikroskop'], 'Model CX900.');
    save('OTHER', 'Lamp', ['lampa']);
    const options = { semanticMatches: scores([['SCOPE', 0.95], ['OTHER', 0.3]]), thresholds };
    assert.equal(inventory.previewAnswer('mikroskob', options).decision, 'no_supported_match');
    assert.deepEqual(inventory.previewAnswer('mikroskop', options).selectedBoxIds, ['SCOPE']);
    assert.equal(inventory.previewAnswer('mikrofon', options).decision, 'no_supported_match');
    assert.equal(inventory.previewAnswer('mikroskob CX901', options).decision, 'no_supported_match');
    assert.equal(inventory.previewAnswer('okänd mikroskob', options).decision, 'no_supported_match');
    save('SCOPE', 'Empty', [], 'Empty inventory');
    assert.throws(() => inventory.previewAnswer('mikroskob', options), /current inventory/);
  } finally { store.close(); }
});
