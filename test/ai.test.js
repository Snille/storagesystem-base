import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { Store } from '../src/store.js';
import { createApp } from '../src/server.js';
import { Inventory } from '../src/inventory.js';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB1sAAAAASUVORK5CYII=', 'base64');
const result = { role: 'detail', label: 'Fasteners', summary: 'Visible screws and washers.', keywords: ['screws', 'washers'], uncertainties: 'Size is not readable.' };

async function setup(t) {
  const calls = []; let completion = (req, res) => res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(result) }, finish_reason: 'stop' }] }));
  const upstream = createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : undefined;
    calls.push({ path: req.url, key: req.headers.authorization, photoKey: req.headers['x-api-key'], body });
    res.setHeader('content-type', 'application/json');
    if (req.url === '/v1/models') return res.end(JSON.stringify({ data: [
      { id: 'fixture-vision', name: 'Image fixture', architecture: { input_modalities: ['text', 'image'], output_modalities: ['text'] } }, { id: 'unknown-capabilities' }
    ] }));
    if (req.url === '/v1/chat/completions') return completion(req, res);
    if (req.url === '/api/search/metadata') return res.end(JSON.stringify({ assets: { items: [{ id: 'one', type: 'IMAGE', originalFileName: 'screws.png' }, { id: 'two', type: 'IMAGE', originalFileName: 'label.png' }], nextPage: null } }));
    if (req.url.startsWith('/api/assets/')) { res.setHeader('content-type', 'image/png'); return res.end(png); }
    res.writeHead(404); res.end('{}');
  });
  upstream.listen(0, '127.0.0.1'); await once(upstream, 'listening');
  const source = `http://127.0.0.1:${upstream.address().port}`;
  const store = new Store(':memory:');
  store.writeSettings({ immich: { provider: 'immich', baseUrl: source, apiKey: 'private-photo-key', albumId: 'album' }, appearance: { language: 'sv' }, ai: { legacy: 'preserved' } });
  const app = createApp({ store, env: { STORAGE_ADMIN_KEY: 'admin-fixture', STORAGE_API_KEY: 'read-fixture' } });
  app.listen(0, '127.0.0.1'); await once(app, 'listening');
  const base = `http://127.0.0.1:${app.address().port}`;
  t.after(async () => {
    app.closeAllConnections(); upstream.closeAllConnections();
    await Promise.all([new Promise(r => app.close(r)), new Promise(r => upstream.close(r))]); store.close();
  });
  const request = (path, input, method = 'POST', key = 'admin-fixture') => fetch(base + '/api/manage/' + path, { method, headers: { 'x-api-key': key, 'content-type': 'application/json' }, body: input === undefined ? undefined : JSON.stringify(input) });
  const view = () => request('ai/settings', undefined, 'GET').then(r => r.json());
  const save = (config) => request('ai/settings', config, 'PUT');
  const config = { connections: [{ id: 'local', name: 'Fixture AI', provider: 'compatible', baseUrl: source + '/v1', apiKey: 'private-ai-key' }], imageInventory: { connectionId: 'local', model: 'fixture-vision', language: 'app', extraInstructions: 'Keep codes exactly.' } };
  const configure = async () => { const r = await save({ revision: (await view()).revision, ...config }); assert.equal(r.status, 200); return r.json(); };
  const previewInput = async state => ({ revision: state.revision, sourceRevision: (await (await request('settings', undefined, 'GET')).json()).sourceRevision, assetId: 'one', role: 'auto' });
  return { store, calls, source, request, view, save, config, configure, previewInput, setCompletion: fn => { completion = fn; } };
}

test('AI settings require management auth, redact secrets, retain legacy values and guard stale edits/credential destinations', async t => {
  const c = await setup(t); const empty = await c.view(); const state = await c.configure();
  assert.equal((await c.request('ai/settings', undefined, 'GET', 'read-fixture')).status, 401);
  assert.ok(!JSON.stringify(state).includes('private-ai-key')); assert.equal(state.connections[0].apiKeyConfigured, true);
  assert.equal(state.imageInventory.resolvedLanguage, 'sv'); assert.equal(state.legacySettingsPresent, true);
  assert.equal((await c.save({ ...c.config, revision: empty.revision })).status, 409);
  const blank = { ...c.config, connections: [{ ...c.config.connections[0], apiKey: '' }], revision: state.revision };
  assert.equal((await c.save(blank)).status, 200); assert.equal(c.store.settings().aiWorkspace.connections[0].apiKey, 'private-ai-key');
  assert.deepEqual(c.store.settings().ai, { legacy: 'preserved' });
  const moved = { ...blank, revision: (await c.view()).revision, connections: [{ ...blank.connections[0], baseUrl: 'http://127.0.0.1:1/v1' }] };
  assert.equal((await c.save(moved)).status, 200); assert.equal(c.store.settings().aiWorkspace.connections[0].apiKey, undefined);
  assert.equal(c.store.audit().ok, true);
  const invalid = { ...c.config, revision: (await c.view()).revision, connections: [{ ...c.config.connections[0], provider: 'openrouter' }] };
  assert.equal((await c.save(invalid)).status, 400);
});

test('one explicit image preview sends only selected bytes, honors language/manual roles and never saves inventory', async t => {
  const c = await setup(t); c.config.connections[0].provider = 'llamacpp'; const state = await c.configure();
  const models = await (await c.request('ai/models', { revision: state.revision, connectionId: 'local' })).json();
  assert.equal(models.models[0].imageInput, true); assert.equal(models.models[1].imageInput, null);
  assert.equal((await c.view()).connections[0].lastTest.modelCount, 2);
  assert.equal(c.calls.some(call => call.path.endsWith('completions')), false);
  const input = await c.previewInput(state);
  const response = await c.request('ai/preview', { ...input, role: 'label' }); assert.equal(response.status, 200);
  const preview = await response.json(); assert.equal(preview.saved, false); assert.equal(preview.result.role, 'label');
  assert.equal(preview.language, 'sv'); assert.equal(preview.input.assetId, 'one');
  assert.ok(!JSON.stringify(preview).includes('private-ai-key')); assert.ok(!JSON.stringify(preview).includes('private-photo-key'));
  const call = c.calls.find(call => call.path.endsWith('completions'));
  assert.equal(call.key, 'Bearer private-ai-key'); assert.equal(call.photoKey, undefined);
  assert.deepEqual(call.body.chat_template_kwargs, { enable_thinking: false });
  assert.match(call.body.messages[0].content, /Swedish/); assert.match(call.body.messages[0].content, /Keep codes exactly/);
  assert.equal(call.body.messages[1].content.filter(p => p.type === 'image_url').length, 1);
  assert.equal(call.body.messages[1].content.find(p => p.type === 'image_url').image_url.url, `data:image/png;base64,${png.toString('base64')}`);
  assert.equal(c.calls.filter(call => call.path.startsWith('/api/assets/')).length, 1);
  assert.ok(c.calls.some(call => call.path === '/api/assets/one/thumbnail?size=preview'));
  assert.equal(preview.input.imageVariant, 'preview');
  assert.deepEqual(c.store.read(), { boxes: [], sessions: [], photos: [] }); assert.equal(c.store.audit().ok, true);
});

const combined = { label: 'Fastener box', summary: 'One box with screws and washers.', keywords: ['screws', 'washers'], uncertainties: 'Label claims sizes not visible in the contents.', photos: [
  { index: 2, role: 'detail', description: 'The label shows fastener sizes.' }, { index: 1, role: 'detail', description: 'Screws visible inside.' }
] };
const completion = value => (req, res) => res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(value) }, finish_reason: 'stop' }] }));

test('multi-photo draft maps indexed interpretations to source assets; explicit save uses shared inventory and rejects accidental replacement', async t => {
  const c = await setup(t); const state = await c.configure(); c.setCompletion(completion(combined));
  const first = await c.previewInput(state);
  const input = { revision: state.revision, sourceRevision: first.sourceRevision, photos: [{ assetId: 'one', role: 'inside' }, { assetId: 'two', role: 'label' }] };
  const response = await c.request('ai/draft', input); assert.equal(response.status, 200);
  const draft = await response.json();
  assert.equal(draft.saved, false); assert.equal(draft.result.boxId, undefined);
  assert.deepEqual(draft.result.photos.map(p => [p.assetId, p.role]), [['one', 'inside'], ['two', 'label']]);
  assert.equal(draft.result.photos[0].description, 'Screws visible inside.');
  assert.deepEqual(c.store.read(), { boxes: [], sessions: [], photos: [] });
  const call = c.calls.find(call => call.path.endsWith('completions'));
  assert.equal(call.body.chat_template_kwargs, undefined); assert.deepEqual(call.body.response_format, { type: 'json_object' }); assert.equal(call.body.provider, undefined);
  assert.equal(call.body.messages[1].content.filter(p => p.type === 'image_url').length, 2);
  // Evaluation rules: names and keywords describe contents, never the container or shelf.
  assert.match(call.body.messages[0].content, /Never use only a product code/); assert.match(call.body.messages[0].content, /Do not add words about the container or the storage place/);
  assert.match(call.body.messages[0].content, /inside: Shows the contents: inside an open box, or items standing directly on a shelf/);
  assert.equal(c.calls.filter(call => call.path.startsWith('/api/assets/')).length, 2);
  const payload = { expectNewBox: true, box: { boxId: 'REVIEWED-BOX', label: 'User corrected label', currentLocationId: 'A-H1-P1-A' }, session: { boxId: 'REVIEWED-BOX', summary: draft.result.summary, itemKeywords: draft.result.keywords }, photos: draft.result.photos.map(p => ({ immichAssetId: p.assetId, photoRole: p.role, notes: p.description })), photoSourceRevision: draft.sourceRevision };
  assert.equal((await c.request('session', payload)).status, 200);
  assert.equal((await c.request('session', payload)).status, 409); assert.equal(c.store.read().sessions.length, 1);
  const search = await (await c.request('../public/search?q=screws', undefined, 'GET', 'read-fixture')).json();
  assert.equal(search.matches[0].label, 'User corrected label'); assert.equal(search.matches[0].photos.length, 2);
  const mcp = await (await c.request('../mcp', { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_box', arguments: { box_id: 'REVIEWED-BOX' } } }, 'POST', 'read-fixture')).json();
  assert.equal(mcp.result.isError, undefined); assert.ok(JSON.stringify(mcp.result).includes('User corrected label'));
  assert.equal(c.store.audit().ok, true);
});

test('OpenRouter drafts request the strict schema; duplicate keywords, empty names and CJK text are handled without writes', async t => {
  const c = await setup(t);
  // Settings pin OpenRouter to its real address; route those requests to the fixture.
  const realFetch = globalThis.fetch; t.after(() => { globalThis.fetch = realFetch; });
  globalThis.fetch = (url, init) => realFetch(String(url).replace('https://openrouter.ai/api/v1', c.source + '/v1'), init);
  c.config.connections[0] = { ...c.config.connections[0], provider: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1' };
  const state = await c.configure(); const first = await c.previewInput(state);
  const input = { revision: state.revision, sourceRevision: first.sourceRevision, photos: [{ assetId: 'one', role: 'inside' }, { assetId: 'two', role: 'label' }] };
  c.setCompletion(completion({ ...combined, keywords: ['LED', ' led ', 'kondensator', 'LED', ''] }));
  const response = await c.request('ai/draft', input); assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).result.keywords, ['LED', 'kondensator']);
  const call = c.calls.find(call => call.path.endsWith('completions'));
  assert.equal(call.body.response_format.type, 'json_schema'); assert.equal(call.body.response_format.json_schema.strict, true);
  assert.deepEqual(call.body.response_format.json_schema.schema.required, ['label', 'summary', 'keywords', 'uncertainties', 'photos']);
  assert.deepEqual(call.body.provider, { require_parameters: true });
  for (const bad of [{ ...combined, label: '  ' }, { ...combined, summary: 'Blandade 集成电路 och kondensatorer.' }, { ...combined, photos: [combined.photos[0], { ...combined.photos[1], description: 'ström接触are' }] }]) {
    c.setCompletion(completion(bad)); assert.equal((await c.request('ai/draft', input)).status, 502);
  }
  assert.deepEqual(c.store.read(), { boxes: [], sessions: [], photos: [] });
});

test('multi-photo draft rejects duplicate/missing assets, bad roles, excess photos and mismatched model photo rows without writes', async t => {
  const c = await setup(t); const state = await c.configure(); const first = await c.previewInput(state);
  const input = { revision: state.revision, sourceRevision: first.sourceRevision, photos: [{ assetId: 'one', role: 'inside' }, { assetId: 'two', role: 'label' }] };
  for (const photos of [[], [{ assetId: 'one', role: 'wrong' }], [input.photos[0], input.photos[0]], Array(7).fill(input.photos[0])]) assert.equal((await c.request('ai/draft', { ...input, photos })).status, 400);
  assert.equal((await c.request('ai/draft', { ...input, photos: [{ assetId: 'not-in-album', role: 'inside' }] })).status, 409);
  assert.equal(c.calls.some(call => call.path.endsWith('completions')), false);
  for (const photos of [[combined.photos[0]], [combined.photos[0], combined.photos[0]], [{ ...combined.photos[0], index: 8 }, combined.photos[1]]]) {
    c.setCompletion(completion({ ...combined, photos })); assert.equal((await c.request('ai/draft', input)).status, 502);
  }
  assert.deepEqual(c.store.read(), { boxes: [], sessions: [], photos: [] });
});

test('existing-box analysis combines selected retained/new photos with editor context; explicit save retains identifiers and history', async t => {
  const c = await setup(t); const state = await c.configure(); const source = await c.previewInput(state);
  const seed = { box: { boxId: 'EXISTING', label: 'User box name', currentLocationId: 'A-H1-P1-A', notes: 'User notes' }, session: { boxId: 'EXISTING', summary: 'Existing screws.', itemKeywords: ['screws'] }, photos: [{ immichAssetId: 'one', photoRole: 'inside' }], photoSourceRevision: source.sourceRevision };
  const saved = await (await c.request('session', seed)).json(); const before = c.store.read();
  c.setCompletion(completion({ ...combined, summary: 'Existing screws and newly visible washers.' }));
  const input = { revision: state.revision, sourceRevision: source.sourceRevision, boxId: saved.boxId, expectedSessionId: saved.sessionId, context: { label: saved.label, summary: 'Manual editor description: screws.', keywords: ['manual-code'] }, photos: [{ assetId: 'one', role: 'inside' }, { assetId: 'two', role: 'spread' }] };
  const response = await c.request('ai/draft', input); assert.equal(response.status, 200); const update = await response.json();
  assert.equal(update.saved, false); assert.deepEqual(c.store.read(), before);
  assert.deepEqual(update.result.photos.map(p => p.role), ['inside', 'spread']);
  // The model did not return the saved keyword; the update keeps it first anyway.
  assert.deepEqual(update.result.keywords, ['manual-code', 'screws', 'washers']);
  const call = c.calls.find(call => call.path.endsWith('completions'));
  assert.match(call.body.messages[0].content, /absence|Absence/); assert.match(call.body.messages[0].content, /Preserve useful existing facts/);
  assert.match(call.body.messages[0].content, /owner often adds facts that photos cannot show/);
  assert.ok(call.body.messages[1].content[0].text.includes('Manual editor description: screws.'));
  assert.ok(call.body.messages[1].content[0].text.includes('manual-code'));
  const commit = { ...seed, expectedSessionId: saved.sessionId, session: { ...seed.session, summary: update.result.summary, itemKeywords: update.result.keywords }, photos: update.result.photos.map(p => ({ immichAssetId: p.assetId, photoRole: p.role, notes: p.description })) };
  const updated = await (await c.request('session', commit)).json();
  assert.equal(updated.boxId, saved.boxId); assert.equal(updated.locationId, saved.locationId); assert.equal(updated.label, saved.label); assert.equal(updated.boxNotes, 'User notes');
  assert.equal(c.store.read().sessions.length, 2); assert.equal(c.store.read().photos.length, 3);
  assert.ok(c.store.read().sessions.some(s => s.sessionId === saved.sessionId && s.summary === 'Existing screws.' && !s.isCurrent));
  const after = c.store.read();
  assert.equal((await c.request('session', commit)).status, 409); assert.deepEqual(c.store.read(), after);
  assert.equal((await c.request('ai/draft', input)).status, 409);
  assert.equal(c.calls.filter(call => call.path.endsWith('completions')).length, 1);
  const mcp = await (await c.request('../mcp', { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_box', arguments: { box_id: saved.boxId } } }, 'POST', 'read-fixture')).json();
  assert.equal(mcp.result.structuredContent.summary, update.result.summary); assert.equal(mcp.result.structuredContent.photos.length, 2);
  assert.equal(c.store.audit().ok, true);
});

test('current box photos outside the album can be analyzed, while missing ownership and in-flight inventory changes reject results', async t => {
  const c = await setup(t); const state = await c.configure(); const source = await c.previewInput(state);
  const inventory = new Inventory(c.store);
  const payload = { box: { boxId: 'ARCHIVED-PHOTOS', label: 'Old photo box', currentLocationId: 'B-H1-P1-A' }, session: { boxId: 'ARCHIVED-PHOTOS', summary: 'Original items.', itemKeywords: ['original'] }, photos: [{ immichAssetId: 'not-in-album', photoRole: 'spread', originalFileName: 'retained.png' }] };
  const saved = inventory.save(payload); const before = c.store.read();
  c.setCompletion(completion({ ...combined, photos: [{ index: 1, role: 'detail', description: 'Retained visible items.' }] }));
  const input = { revision: state.revision, sourceRevision: source.sourceRevision, boxId: saved.boxId, expectedSessionId: saved.sessionId, context: { label: saved.label, summary: saved.summary, keywords: saved.itemKeywords }, photos: [{ assetId: 'not-in-album', role: 'spread' }] };
  const response = await c.request('ai/draft', input); assert.equal(response.status, 200); assert.equal((await response.json()).result.photos[0].role, 'spread');
  assert.equal(c.calls.some(call => call.path === '/api/search/metadata'), false); assert.deepEqual(c.store.read(), before);
  assert.equal((await c.request('ai/draft', { ...input, photos: [{ assetId: 'unowned-outside-album', role: 'inside' }] })).status, 409);
  assert.equal((await c.request('ai/draft', { ...input, context: { ...input.context, unexpected: 'not sent' } })).status, 400);
  assert.equal((await c.request('ai/draft', { ...input, context: { ...input.context, summary: 'a'.repeat(12001) } })).status, 400);
  assert.equal(c.calls.filter(call => call.path.endsWith('completions')).length, 1);
  let release, arrived; const waiting = new Promise(resolve => { arrived = resolve; });
  c.setCompletion((req, res) => { release = () => completion({ ...combined, photos: [{ index: 1, role: 'spread', description: 'Late answer.' }] })(req, res); arrived(); });
  const pending = c.request('ai/draft', input); await waiting;
  inventory.save({ ...payload, session: { ...payload.session, summary: 'Another client changed the inventory.' } }); const changed = c.store.read();
  release(); assert.equal((await pending).status, 409); assert.deepEqual(c.store.read(), changed); assert.equal(c.store.audit().ok, true);
});

test('changing the photo source during a multi-photo request rejects the result and shared busy guard bounds concurrent calls', async t => {
  const c = await setup(t); const state = await c.configure(); const first = await c.previewInput(state);
  const input = { revision: state.revision, sourceRevision: first.sourceRevision, photos: [{ assetId: 'one', role: 'inside' }, { assetId: 'two', role: 'label' }] };
  let release; let arrived; const waiting = new Promise(r => { arrived = r; });
  c.setCompletion((req, res) => { release = () => completion(combined)(req, res); arrived(); });
  const pending = c.request('ai/draft', input); await waiting;
  assert.equal((await c.request('ai/preview', first)).status, 429);
  c.store.writeSettings({ immich: { ...c.store.settings().immich, apiKey: 'changed-fixture-key' } });
  release(); assert.equal((await pending).status, 409); assert.equal(c.store.read().sessions.length, 0);
});

test('stale source, non-album images and malformed AI results cannot become inventory or leak upstream bodies', async t => {
  const c = await setup(t); const state = await c.configure(); const input = await c.previewInput(state);
  assert.equal((await c.request('ai/preview', { ...input, sourceRevision: 'stale' })).status, 409);
  assert.equal((await c.request('ai/preview', { ...input, assetId: 'not-in-album' })).status, 409);
  assert.equal(c.calls.some(call => call.path.endsWith('completions')), false);
  c.setCompletion((req, res) => { res.writeHead(403); res.end('private-ai-key provider body'); });
  const denied = await c.request('ai/preview', input); assert.equal(denied.status, 502); assert.ok(!(await denied.text()).includes('private-ai-key'));
  c.setCompletion((req, res) => res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ ...result, keywords: [8] }) } }] })));
  assert.equal((await c.request('ai/preview', input)).status, 502);
  assert.equal(c.store.read().boxes.length, 0);
});

test('settings changes during analysis reject outdated results, and concurrent requests cannot multiply calls', async t => {
  const c = await setup(t); const state = await c.configure(); const input = await c.previewInput(state);
  let release; let arrived;
  const waiting = new Promise(r => { arrived = r; });
  c.setCompletion((req, res) => { release = () => res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(result) } }] })); arrived(); });
  const pending = c.request('ai/preview', input); await waiting;
  assert.equal((await c.request('ai/preview', input)).status, 429);
  assert.equal((await c.save({ ...c.config, revision: state.revision, imageInventory: { ...c.config.imageInventory, model: 'another-model' } })).status, 200);
  release(); assert.equal((await pending).status, 409);
  assert.equal(c.calls.filter(call => call.path.endsWith('completions')).length, 1);
  assert.equal(c.store.read().sessions.length, 0);
});
