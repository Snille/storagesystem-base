// Shared location identifiers for inventory presentation and browser editing.
export function locationKey(id) {
  const p = parseLocation(id);
  return p ? JSON.stringify([p.kind, p.unit.toUpperCase(), String(p.row).toUpperCase(), Number(p.slot), p.variant.toUpperCase()]) : id.trim();
}

export function suggestBoxId(locationId, usedIds = []) {
  const p = parseLocation(locationId);
  if (!p) return '';
  const prefix = p.kind === 'bench' ? `BENCH-${p.unit}-${p.row}-P${p.slot}` : `${p.kind === 'ivar' ? 'IVAR' : 'CABINET'}-${p.unit}-H${p.row}-P${p.slot}`;
  const used = new Set(usedIds);
  const letters = [...new Set([p.variant.toUpperCase(), ...Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i))].filter(Boolean))];
  for (const letter of letters) if (!used.has(`${prefix}-${letter}`)) return `${prefix}-${letter}`;
  // Keep every existing identifier, including those of boxes that have moved away.
  for (let suffix = 2; ; suffix++) if (!used.has(`${prefix}-A-${suffix}`)) return `${prefix}-A-${suffix}`;
}

export function parseLocation(id, boxId = '') {
  let match = id.match(/^(IVAR|CABINET):([A-Z0-9-]+):H(\d+):P(\d+)(?::([A-Z]))?$/i);
  if (match) return { kind: match[1].toLowerCase() === 'ivar' ? 'ivar' : 'cabinet', unit: match[2].toUpperCase(), row: Number(match[3]), slot: match[4], variant: match[5] || '' };
  match = id.match(/^([A-Z0-9-]+)-H(\d+)-P(\d+)(?:-([A-Z]))?$/i);
  if (match) return { kind: 'ivar', unit: match[1].toUpperCase(), row: Number(match[2]), slot: match[3], variant: match[4] || '' };
  match = id.match(/^BENCH:([A-Z0-9-]+):(TOP|UNDER):P(\d+)(?::([A-Z]))?$/i);
  if (match) return { kind: 'bench', unit: match[1].toUpperCase(), row: match[2].toUpperCase(), slot: match[3], variant: match[4] || '' };
  match = boxId.match(/^(IVAR|CABINET)-([A-Z0-9-]+)-H(\d+)-P(\d+)-([A-Z])$/i);
  if (match) return parseLocation(`${match[1]}:${match[2]}:H${match[3]}:P${match[4]}:${match[5]}`);
  match = boxId.match(/^BENCH-([A-Z0-9-]+)-(TOP|UNDER)-P(\d+)-([A-Z])$/i);
  if (match) return parseLocation(`BENCH:${match[1]}:${match[2]}:P${match[3]}:${match[4]}`);
  return null;
}


export function buildLocationId({ kind, unit, row, slot, variant = '' }) {
  if (!['ivar', 'bench', 'cabinet'].includes(kind)) throw new Error('Choose a location category.');
  const normalizedUnit = unit.trim().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').toUpperCase();
  if (!normalizedUnit) throw new Error('Enter a storage unit name.');
  if (!/^\d+$/.test(slot) || Number(slot) < 1) throw new Error('Choose a position.');
  if (variant && !/^[A-Z]$/.test(variant)) throw new Error('Choose a letter from A to Z, or None.');
  if (kind === 'bench') {
    if (!['TOP', 'UNDER'].includes(row)) throw new Error('Choose a bench surface.');
    return `BENCH:${normalizedUnit}:${row}:P${slot}${variant ? ':' + variant : ''}`;
  }
  if (!/^\d+$/.test(row) || Number(row) < 1) throw new Error('Choose a shelf.');
  return kind === 'ivar' ? `${normalizedUnit}-H${row}-P${slot}${variant ? '-' + variant : ''}`
    : `CABINET:${normalizedUnit}:H${row}:P${slot}${variant ? ':' + variant : ''}`;
}
