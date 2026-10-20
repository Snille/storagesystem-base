import { parseLocation } from './locations.js';

// Sparse geometry reflects registered positions, not invented capacity. Alias
// identifiers share one physical position; each letter remains a separate place.
export function buildStorageMap(boxes, positions) {
  const units = new Map(); const unplaced = [];
  function place(id, presentation, box) {
    const p = parseLocation(id, box?.boxId);
    if (!p) { if (box) unplaced.push(box.boxId); return; }
    const key = JSON.stringify([p.kind, p.unit]);
    if (!units.has(key)) units.set(key, { kind: p.kind, unit: p.unit, slug: `${p.kind === 'ivar' ? '' : p.kind + '-'}${p.unit.toLowerCase()}`, title: presentation.system, positions: new Map() });
    const unit = units.get(key); const positionKey = JSON.stringify([p.row, Number(p.slot), p.variant.toUpperCase()]);
    if (!unit.positions.has(positionKey)) unit.positions.set(positionKey, { row: p.row, rowLabel: presentation.shelf, slot: Number(p.slot), letter: p.variant.toUpperCase(), locationIds: [], boxIds: [] });
    const position = unit.positions.get(positionKey);
    if (!position.locationIds.includes(id)) position.locationIds.push(id);
    if (box && !position.boxIds.includes(box.boxId)) position.boxIds.push(box.boxId);
  }
  for (const position of positions) place(position.locationId, position.location);
  for (const box of boxes) place(box.locationId, box.location, box);
  const rowOrder = row => row === 'TOP' ? -2 : row === 'UNDER' ? -1 : Number(row);
  return { units: [...units.values()].map(unit => ({ ...unit, positions: [...unit.positions.values()].sort((a, b) => rowOrder(a.row) - rowOrder(b.row) || a.slot - b.slot || a.letter.localeCompare(b.letter)) })).sort((a, b) => a.slug.localeCompare(b.slug, 'en', { numeric: true })), unplaced };
}
