import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLocationId, parseLocation, suggestBoxId } from '../src/locations.js';
import { Store } from '../src/store.js';
import { Inventory } from '../src/inventory.js';

test('structured choices produce reference-compatible IDs for shelving, benches, cabinets and optional letters', () => {
  for (const [input, expected] of [
    [{ kind: 'ivar', unit: 'A', row: '2', slot: '1', variant: 'A' }, 'A-H2-P1-A'],
    [{ kind: 'ivar', unit: 'A', row: '12', slot: '12' }, 'A-H12-P12'],
    [{ kind: 'bench', unit: 'Svarv', row: 'TOP', slot: '2' }, 'BENCH:SVARV:TOP:P2'],
    [{ kind: 'bench', unit: 'Svarv', row: 'UNDER', slot: '2', variant: 'Z' }, 'BENCH:SVARV:UNDER:P2:Z'],
    [{ kind: 'cabinet', unit: '3D-print', row: '3', slot: '4', variant: 'B' }, 'CABINET:3D-PRINT:H3:P4:B'],
    [{ kind: 'ivar', unit: 'Lång hylla', row: '2', slot: '1' }, 'LANG-HYLLA-H2-P1']
  ]) {
    assert.equal(buildLocationId(input), expected);
    const parsed = parseLocation(expected); assert.equal(parsed.kind, input.kind); assert.equal(parsed.slot, input.slot);
    assert.equal(buildLocationId({ ...parsed, row: String(parsed.row) }), expected);
  }
  for (const changes of [{ kind: 'bad' }, { unit: ' ' }, { unit: '---' }, { row: '' }, { row: '0' }, { slot: '' }, { variant: 'AA' }]) {
    assert.throws(() => buildLocationId({ kind: 'ivar', unit: 'A', row: '1', slot: '1', ...changes }));
  }
});

test('structured destinations use the ordinary inventory save and retain imported aliases until explicitly moved', () => {
  const store = new Store(':memory:'); const inventory = new Inventory(store);
  try {
    const payload = { box: { boxId: 'BOX-1', label: 'Test', currentLocationId: 'IVAR:A:H2:P1:A' }, session: { boxId: 'BOX-1', summary: '', itemKeywords: [] } };
    inventory.save(payload); inventory.save(payload);
    assert.equal(inventory.get('BOX-1').locationId, 'IVAR:A:H2:P1:A');
    payload.box.currentLocationId = buildLocationId({ kind: 'bench', unit: 'Svarv', row: 'UNDER', slot: '3', variant: 'C' });
    inventory.save(payload);
    assert.equal(inventory.get('BOX-1').locationId, 'BENCH:SVARV:UNDER:P3:C');
    assert.equal(store.read().sessions.length, 3); assert.equal(store.audit().ok, true);
    assert.equal(inventory.positions().find(p => p.locationId === 'IVAR:A:H2:P1:A').boxCount, 0);
  } finally { store.close(); }
});

test('automatic ID suggestions honor preferred letters and remain unique after all letter variants are used', () => {
  assert.equal(suggestBoxId('BENCH:SVARV:UNDER:P1:C'), 'BENCH-SVARV-UNDER-P1-C');
  assert.equal(suggestBoxId('CABINET:3D-PRINT:H1:P3'), 'CABINET-3D-PRINT-H1-P3-A');
  assert.equal(suggestBoxId('Unmapped corner'), '');
  const used = Array.from({ length: 26 }, (_, i) => `IVAR-A-H1-P1-${String.fromCharCode(65 + i)}`);
  assert.equal(suggestBoxId('A-H1-P1-A', used), 'IVAR-A-H1-P1-A-2');
  assert.equal(suggestBoxId('A-H1-P1-A', [...used, 'IVAR-A-H1-P1-A-2']), 'IVAR-A-H1-P1-A-3');
});
