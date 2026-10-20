// Explicit live acceptance using a read-only settings database and isolated inventory.
// Sends one test-album Spread photo and synthetic context to the configured llama.cpp.
import assert from 'node:assert/strict';
import { Store } from '../src/store.js';
import { Inventory } from '../src/inventory.js';
import { Photos } from '../src/photos.js';
import { Catalog } from '../src/catalog.js';
import { Ai } from '../src/ai.js';

let source; let store;
try {
  assert.ok(process.argv[2], 'Supply the settings database path (opened read-only).');
  source = new Store(process.argv[2], { readOnly: true });
  const settings = source.settings();
  const before = JSON.stringify([source.read(), settings, source.locationIds()]);
  const task = settings.aiWorkspace?.imageInventory;
  const connection = settings.aiWorkspace?.connections.find(c => c.id === task?.connectionId);
  assert.equal(connection?.provider, 'llamacpp', 'This check requires the configured local llama.cpp connection.');
  store = new Store(':memory:'); store.writeSettings(settings);
  const inventory = new Inventory(store); const photos = new Photos(store);
  const catalog = new Catalog(store, photos, inventory); const ai = new Ai(store, catalog, photos);
  const album = await catalog.album(true);
  const asset = album.assets.find(a => a.fileName === 'PXL_20260426_171534733.MP.jpg');
  assert.ok(asset, 'The documented Spread test image must be present.');
  const context = { label: 'Test storage devices', summary: 'SSD/HDD devices and adapters previously inventoried.', keywords: ['SSD', 'HDD', 'adapters'] };
  const seed = { box: { boxId: 'AI-UPDATE-FIXTURE', currentLocationId: 'AI-TEST-H1-P1', label: context.label, notes: 'Preserve manual note.' }, session: { boxId: 'AI-UPDATE-FIXTURE', summary: context.summary, itemKeywords: context.keywords }, photos: [] };
  const original = inventory.save(seed);
  const snapshot = JSON.stringify(store.read());
  const result = await ai.draft({ revision: ai.view().revision, sourceRevision: album.sourceRevision, boxId: original.boxId, expectedSessionId: original.sessionId, context, photos: [{ assetId: asset.id, role: 'spread' }] });
  assert.equal(result.saved, false); assert.ok(result.result.summary.trim());
  assert.equal(result.result.photos[0].role, 'spread');
  assert.equal(JSON.stringify(store.read()), snapshot, 'Analysis must not write inventory.');
  const updated = inventory.save({ ...seed, session: { ...seed.session, summary: result.result.summary, itemKeywords: result.result.keywords }, expectedSessionId: original.sessionId, photos: result.result.photos.map(p => ({ immichAssetId: p.assetId, originalFileName: p.fileName, photoRole: p.role, notes: p.description })) });
  assert.equal(updated.boxId, original.boxId); assert.equal(updated.locationId, original.locationId);
  assert.equal(updated.label, original.label); assert.equal(updated.boxNotes, original.boxNotes);
  assert.equal(store.read().sessions.length, 2); assert.equal(store.audit().ok, true);
  assert.equal(JSON.stringify([source.read(), source.settings(), source.locationIds()]), before, 'Source database must remain unchanged.');
  console.log(`PASS: live local AI update in ${result.elapsedMs} ms; language=${result.language}; Spread role retained; analysis read-only; explicit isolated save preserves identity, notes and two-session history; audits passed. Review content accuracy separately.`);
} catch (error) {
  console.error('FAIL: live AI update acceptance did not complete.', error instanceof assert.AssertionError ? error.message : `${error.name}${error.code ? ' (' + error.code + ')' : ''}`);
  process.exitCode = 1;
} finally { store?.close(); source?.close(); }
