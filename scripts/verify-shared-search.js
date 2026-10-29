// Isolated transport acceptance on a read-only backup; never targets a deployed app.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { Store } from '../src/store.js';
import { SearchSettings } from '../src/search-settings.js';
import { createApp } from '../src/server.js';
import { locationKey } from '../src/locations.js';

const [backupArg, configArg, questionsArg, outputArg] = process.argv.slice(2);
if (!outputArg) throw new Error('Usage: node scripts/verify-shared-search.js BACKUP CONFIG_JSON QUESTIONS_JSON NEW_PRIVATE_OUTPUT');
const backup = resolve(backupArg), output = resolve(outputArg), hash = bytes => createHash('sha256').update(bytes).digest('hex');
const backupHash = hash(readFileSync(backup)), questionsBytes = readFileSync(resolve(questionsArg));
const questions = JSON.parse(questionsBytes), config = JSON.parse(readFileSync(resolve(configArg)));
if (!config.publicEnabled || config.embedding?.apiKey || config.verification?.apiKey) throw new Error('Explicit public test mode is required; keys belong in environment variables.');
if (!Array.isArray(questions) || !questions.length || questions.length > 100) throw new Error('Supply 1–100 frozen questions.');
mkdirSync(output);
const source = new Store(backup, { readOnly: true }), store = new Store(':memory:'); let app;
try {
  assert.equal(source.audit().ok, true); store.importLegacy(source.read());
  const inventoryHash = hash(JSON.stringify(store.read())), settings = new SearchSettings(store);
  settings.save({ revision: settings.revision(), ...config,
    embedding: { ...config.embedding, apiKey: process.env.STORAGE_EMBEDDING_KEY || '' },
    verification: { ...config.verification, apiKey: process.env.STORAGE_VERIFICATION_KEY || '' } });
  app = createApp({ store, env: { STORAGE_ADMIN_KEY: 'isolated-admin', STORAGE_API_KEY: 'isolated-read', STORAGE_EMBEDDING_CACHE: join(output, 'semantic.sqlite') } });
  app.listen(0, '127.0.0.1'); await once(app, 'listening');
  const base = `http://127.0.0.1:${app.address().port}`;
  const request = async (path, body, admin = false) => {
    const response = await fetch(base + path, { method: body ? 'POST' : 'GET', signal: AbortSignal.timeout(55000),
      headers: { 'content-type': 'application/json', 'x-api-key': admin ? 'isolated-admin' : 'isolated-read' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    assert.equal(response.status, 200); return response.json();
  };
  const started = performance.now();
  for (;;) {
    const status = await request('/api/manage/semantic', null, true);
    if (status.state === 'ready') break;
    if (['degraded', 'unavailable'].includes(status.state) || performance.now() - started > 180000) throw new Error('Isolated index unavailable.');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const results = [];
  for (const q of questions) {
    const expected = (q.expected?.requiredLocationIds || []).map(locationKey).sort();
    if (!['answer', 'clarify', 'no_supported_match'].includes(q.expected?.kind) || (q.expected.kind === 'answer' && !expected.length)) throw new Error('Supply an explicit expected decision and answer locations.');
    const responses = [];
    responses.push(await request(`/api/manage/search?q=${encodeURIComponent(q.query)}&lang=${q.language || 'sv'}`, null, true));
    responses.push(await request(`/api/public/search?q=${encodeURIComponent(q.query)}&limit=25&lang=${q.language || 'sv'}`));
    responses.push(await request('/api/public/ask', { query: q.query, language: q.language || 'sv' }));
    const rpc = await request('/api/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'search_inventory', arguments: { query: q.query, limit: 25, language: q.language || 'sv' } } });
    assert.notEqual(rpc.result?.isError, true); responses.push(rpc.result.structuredContent);
    const actual = responses[0].matches.map(b => b.boxId);
    const correct = responses.every(r => r.source === 'semantic' && r.decision === q.expected.kind && r.answer === responses[0].answer
      && (!q.expected.answer || r.answer === q.expected.answer)
      && JSON.stringify(r.matches.map(b => b.boxId)) === JSON.stringify(actual)
      && JSON.stringify(r.matches.map(b => locationKey(b.locationId || store.read().boxes.find(box => box.boxId === b.boxId).currentLocationId)).sort()) === JSON.stringify(expected));
    results.push({ id: q.id, query: q.query, correct, responses });
    console.log(`${q.id}: web / REST / ask / MCP ${correct ? 'PASS' : 'FAIL'}`);
  }
  let haClient = 'not_run';
  if (process.env.STORAGE_HA_SOURCE) {
    const child = spawn(process.env.STORAGE_TEST_PYTHON || 'python', ['scripts/verify-ha-client.py', '--source', process.env.STORAGE_HA_SOURCE,
      '--base-url', base, '--query', questions.find(q => q.expected.kind === 'answer').query, '--expected-source', 'semantic'],
    { env: { ...process.env, STORAGE_API_KEY: 'isolated-read' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let text = ''; child.stdout.on('data', b => { text += b; }); child.stderr.on('data', b => { text += b; });
    const [code] = await once(child, 'exit'); haClient = code === 0 ? 'pass' : 'fail';
    // Only store diagnostics in the private report, not in command output.
    writeFileSync(join(output, 'ha-client.txt'), text, { flag: 'wx' });
    assert.equal(code, 0, 'Real HA client failed; see private diagnostics.');
  }
  assert.equal(hash(readFileSync(backup)), backupHash); assert.equal(hash(JSON.stringify(store.read())), inventoryHash);
  assert.equal(store.audit().ok, true);
  const history = await request('/api/manage/search-history', null, true);
  assert.ok(history.entries.every(e => e.answerSource === 'semantic'));
  const summary = { cases: results.length, correct: results.filter(r => r.correct).length, transportChecks: results.length * 4, haClient };
  const code = ['src/server.js', 'src/search-service.js', 'src/search-settings.js', 'src/answer-policy.js', 'src/mcp.js', 'src/search-history.js', 'src/validation.js', 'scripts/verify-shared-search.js'];
  const codeHashes = Object.fromEntries(code.map(path => [path, hash(readFileSync(path))]));
  for (const path of code) writeFileSync(join(output, path.replaceAll('/', '__')), readFileSync(path), { flag: 'wx' });
  writeFileSync(join(output, 'report.json'), JSON.stringify({ createdAt: new Date().toISOString(), backupHash, inventoryHash,
    questionsHash: hash(questionsBytes), configuration: settings.view(), codeHashes, summary, results }, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify(summary)); if (summary.correct !== summary.cases) process.exitCode = 1;
} finally {
  if (app) { app.closeAllConnections(); await new Promise(resolve => app.close(resolve)); }
  store.close(); source.close();
}
