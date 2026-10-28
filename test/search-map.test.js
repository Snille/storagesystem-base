import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { Store } from '../src/store.js';
import { Inventory } from '../src/inventory.js';
import { createApp } from '../src/server.js';

function seed() {
  const store = new Store(':memory:'); const inventory = new Inventory(store);
  const save = (boxId, label, location, summary, photos = []) => inventory.save({ box: { boxId, label, currentLocationId: location }, session: { boxId, summary, itemKeywords: [] }, photos });
  save('RC', 'Radiostyrd bil', 'A-H2-P1-A', 'Motor och hjul för en radiostyrd car.');
  save('SCREWS', 'Träskruvar', 'BENCH:SVARV:UNDER:P2:B', 'Träskruvar och brickor.', [{ immichAssetId: 'photo-1', photoRole: 'inside', originalFileName: 'PXL_20260101_123456.jpg' }]);
  save('DRILL', 'Borr', 'CABINET:TOOLS:H1:P1', 'Borr och bits.');
  save('SOLDER', 'Lödtenn', 'A-H2-P1-B', 'Lödtenn och lödfett.');
  return { store, inventory, save };
}

test('search restores Swedish variants, question stop words, RC synonyms and short transpositions without matching historical contents', () => {
  const { store, inventory, save } = seed();
  try {
    for (const query of ['Var finns träskruvarna?', 'träskruven', 'skruv']) assert.equal(inventory.search(query)[0].boxId, 'SCREWS', query);
    assert.equal(inventory.search('rc')[0].boxId, 'RC');
    assert.equal(inventory.search('rcbil')[0].boxId, 'RC');
    assert.equal(inventory.search('bro')[0].boxId, 'DRILL');
    assert.equal(inventory.search('lodtenn')[0].boxId, 'SOLDER');
    assert.deepEqual(inventory.search('var finns det på'), []);
    assert.deepEqual(inventory.search('???'), []);
    save('CHIPS', 'ESP32 and MCP3008', 'A-H3-P1', 'Electronics ESP32 boards.');
    assert.equal(inventory.search('ESP32')[0].boxId, 'CHIPS');
    assert.equal(inventory.search('MCP3008')[0].boxId, 'CHIPS');
    save('SOLDER', 'Empty box', 'A-H2-P1-B', 'Empty.');
    assert.deepEqual(inventory.search('lödtenn'), []);
    assert.equal(store.audit().ok, true);
  } finally { store.close(); }
});

test('filename lookup prioritizes exact names and retains historical references while returning current inventory', () => {
  const { store, inventory, save } = seed();
  try {
    save('SCREWS', 'Empty box', 'BENCH:SVARV:UNDER:P2:B', 'Empty.');
    save('PARTIAL', 'Partial filename', 'A-H3-P1', '', [{ immichAssetId: 'other', photoRole: 'inside', originalFileName: 'PXL_20260101_123456.jpg.backup.jpg' }]);
    assert.deepEqual(inventory.search('PXL_20260101_123456.jpg').map(box => box.boxId), ['SCREWS']);
    assert.equal(inventory.search('PXL_20260101_123456.jpg')[0].summary, 'Empty.');
    assert.equal(inventory.search('PXL_20260101').length, 2);
    assert.deepEqual(inventory.search('unknown.jpg'), []);
    assert.equal(inventory.search('Empty box')[0].label, 'Empty box');
  } finally { store.close(); }
});

test('storage map groups aliases, variants and registered free positions; moved boxes use current destinations', () => {
  const { store, inventory, save } = seed();
  try {
    inventory.addPosition({ locationId: 'IVAR:A:H2:P1:A' });
    inventory.addPosition({ locationId: 'A-H4-P3' });
    save('UNKNOWN', 'Unmapped', 'Corner', 'Unknown location');
    let map = inventory.storageMap('sv');
    const unit = map.units.find(unit => unit.slug === 'a');
    assert.equal(unit.title, 'Lagerhylla: A');
    assert.equal(unit.positions.filter(position => position.row === 2 && position.slot === 1).length, 2);
    assert.deepEqual(unit.positions.find(position => position.letter === 'A').boxIds, ['RC']);
    assert.equal(unit.positions.find(position => position.letter === 'A').locationIds.length, 2);
    assert.deepEqual(unit.positions.find(position => position.row === 4).boxIds, []);
    assert.deepEqual(map.unplaced, ['UNKNOWN']);
    save('RC', 'Radiostyrd bil', 'BENCH:SVARV:TOP:P1', 'Moved.');
    map = inventory.storageMap();
    assert.deepEqual(map.units.find(unit => unit.slug === 'a').positions.find(position => position.letter === 'A').boxIds, []);
    assert.equal(map.units.find(unit => unit.slug === 'bench-svarv').positions[0].row, 'TOP');
    assert.equal(store.audit().ok, true);
  } finally { store.close(); }
});

test('management, public search and MCP share ranking; storage map requires management and preserves data', async t => {
  const { store, inventory } = seed(); const before = store.read();
  const app = createApp({ store, env: { STORAGE_ADMIN_KEY: 'admin', STORAGE_API_KEY: 'read' } });
  app.listen(0, '127.0.0.1'); await once(app, 'listening');
  t.after(async () => { app.closeAllConnections(); await new Promise(resolve => app.close(resolve)); store.close(); });
  const request = (path, key, body) => fetch(`http://127.0.0.1:${app.address().port}${path}`, { method: body ? 'POST' : 'GET', headers: { 'x-api-key': key }, body: body && JSON.stringify(body) });
  const query = encodeURIComponent('Var finns träskruvarna?');
  const management = await (await request(`/api/manage/search?q=${query}`, 'admin')).json();
  const publicSearch = await (await request(`/api/public/search?q=${query}`, 'read')).json();
  const mcp = await (await request('/api/mcp', 'read', { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'search_inventory', arguments: { query: 'Var finns träskruvarna?' } } })).json();
  assert.deepEqual(management.matches.map(box => [box.boxId, box.score]), publicSearch.matches.map(box => [box.boxId, box.score]));
  assert.equal(mcp.result.structuredContent.matches[0].boxId, 'SCREWS');
  assert.equal((await request('/api/manage/storage-map', 'read')).status, 401);
  assert.deepEqual(await (await request('/api/manage/storage-map?lang=en', 'admin')).json(), { ...inventory.storageMap('en'), unitPhotos: {} });
  assert.deepEqual(store.read(), before);
});
