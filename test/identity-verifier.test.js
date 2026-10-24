import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { IdentityVerifier } from '../src/identity-verifier.js';

const box = { boxId: 'CURRENT', sessionId: 'SESSION', label: 'Inspection camera', summary: 'Optical inspection camera.', itemKeywords: ['camera', 'inspection'] };
async function fixture(t) {
  const state = { requests: [], status: 200, delay: 0, answer: { supported: true, relation: 'same_item', field: 'summary', quote: box.summary }, finish: 'stop' };
  const server = createServer(async (req, res) => {
    let body = ''; for await (const part of req) body += part;
    state.requests.push({ url: req.url, input: JSON.parse(body) });
    const send = () => { res.writeHead(state.status, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ finish_reason: state.finish, message: { content: JSON.stringify(state.answer) } }] })); };
    if (state.delay) setTimeout(send, state.delay); else send();
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  return { state, config: { baseUrl: `http://127.0.0.1:${server.address().port}/v1`, apiKey: 'synthetic-only', model: 'fixture', timeoutMs: 500 } };
}

test('identity verifier sends only bounded text and returns source-bound application IDs', async t => {
  const { state, config } = await fixture(t); const verifier = new IdentityVerifier(config);
  state.answer.boxId = 'INVENTED';
  const result = await verifier.verify('inspection device', box);
  assert.deepEqual(result, { query: 'inspection device', boxId: 'CURRENT', sessionId: 'SESSION', field: 'summary', quote: box.summary });
  const request = state.requests[0];
  assert.equal(request.url, '/v1/chat/completions');
  assert.equal(request.input.temperature, 0);
  assert.equal(request.input.chat_template_kwargs.enable_thinking, false);
  assert.deepEqual(JSON.parse(request.input.messages[1].content), { query: 'inspection device', source: { label: box.label, summary: box.summary, keywords: 'camera\ninspection', photoNotes: '' } });
  assert.equal(JSON.stringify(request.input).includes('synthetic-only'), false);
});

test('unsupported, malformed and fabricated identity responses cannot authorize answers', async t => {
  const { state, config } = await fixture(t); const verifier = new IdentityVerifier(config);
  for (const answer of [
    { supported: false, relation: 'related_item', field: 'summary', quote: '' },
    { supported: 'true', relation: 'same_item', field: 'summary', quote: box.summary },
    { supported: true, relation: 'same_item', field: 'summary', quote: 'Invented contents' },
    { supported: true, relation: 'same_item', field: 'location', quote: 'A-H1-P1' },
    { supported: true, relation: 'related_item', field: 'summary', quote: box.summary }
  ]) { state.answer = answer; assert.equal(await verifier.verify('test item', box), null); }
  state.finish = 'length'; assert.equal(await verifier.verify('test item', box), null);
  state.status = 401; assert.equal(await verifier.verify('test item', box), null);
});

test('identity timeouts, busy guard and oversized sources fail closed without additional calls', async t => {
  const { state, config } = await fixture(t); state.delay = 150;
  const verifier = new IdentityVerifier({ ...config, timeoutMs: 30 });
  const first = verifier.verify('inspection device', box);
  assert.equal(await verifier.verify('concurrent query', box), null);
  assert.equal(verifier.lastOutcome, 'busy');
  assert.equal(await first, null);
  assert.equal(verifier.busy, false);
  const count = state.requests.length;
  assert.equal(await verifier.verify('test', { ...box, summary: 'x'.repeat(12001) }), null);
  assert.equal(state.requests.length, count);
  assert.equal(verifier.lastOutcome, 'oversized');
});

test('near item-name substitutions require an explicitly confirmed intent instead of automatic correction', async t => {
  const { state, config } = await fixture(t); const verifier = new IdentityVerifier(config);
  const source = { ...box, label: 'Ljudnivåmätare', summary: 'Ljudnivåmätare för decibel.', itemKeywords: ['ljudnivåmätare'] };
  assert.equal(await verifier.verify('Ljusnivåmätare', source), null);
  assert.equal(state.requests.length, 0);
  state.answer = { supported: true, relation: 'same_item', field: 'summary', quote: source.summary };
  const proof = await verifier.verify('Ljusnivåmätare', source, 'Ljudnivåmätare');
  assert.equal(proof.confirmedIntent, 'Ljudnivåmätare');
  assert.deepEqual(JSON.parse(state.requests[0].input.messages[1].content).query, 'Ljudnivåmätare');
});

test('negative property constraints cannot be replaced by an opposite or unspecified property', async t => {
  const { state, config } = await fixture(t); const verifier = new IdentityVerifier(config);
  for (const [query, label, summary] of [
    ['Borstlös motor', 'Borstad motor', 'Motor med kolborstar.'],
    ['Rostfria skruvar', 'Förzinkade skruvar', 'Skruvar av förzinkat stål.'],
    ['Wireless keyboard', 'Wired keyboard', 'USB wired keyboard.'],
    ['Leadfree solder', 'Solder', 'Tin and lead solder.']
  ]) assert.equal(await verifier.verify(query, { ...box, label, summary }), null, query);
  assert.equal(state.requests.length, 0);
  const exact = { ...box, label: 'Trådlös mus', summary: 'Trådlös mus för dator.' };
  state.answer = { supported: true, relation: 'same_item', field: 'summary', quote: exact.summary };
  assert.ok(await verifier.verify('Trådlös mus', exact));
});
