import { randomUUID } from 'node:crypto';
import { InputError, object, text } from './validation.js';

const labels = {
  en: { ivar: 'Shelving unit', bench: 'Bench', cabinet: 'Cabinet', shelf: 'Shelf', slot: 'Slot', surface: 'Surface', top: 'On top', under: 'Under' },
  sv: { ivar: 'Lagerhylla', bench: 'Bänk', cabinet: 'Skåp', shelf: 'Hylla', slot: 'Plats', surface: 'Yta', top: 'Ovanpå', under: 'Under' },
  de: { ivar: 'Lagerregal', bench: 'Werkbank', cabinet: 'Schrank', shelf: 'Regal', slot: 'Platz', surface: 'Fläche', top: 'Oben', under: 'Unten' }
};

const normalize = value => value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

export function parseLocation(id, boxId = '') {
  let match = id.match(/^(IVAR|CABINET):([A-Z0-9-]+):H(\d+):P(\d+)(?::([A-Z]))?$/i);
  if (match) return { kind: match[1].toLowerCase() === 'ivar' ? 'ivar' : 'cabinet', unit: match[2].toUpperCase(), row: Number(match[3]), slot: match[4], variant: match[5] || '' };
  match = id.match(/^([A-Z])-H(\d+)-P(\d+)(?:-([A-Z]))?$/i);
  if (match) return { kind: 'ivar', unit: match[1].toUpperCase(), row: Number(match[2]), slot: match[3], variant: match[4] || '' };
  match = id.match(/^BENCH:([A-Z0-9-]+):(TOP|UNDER):P(\d+)(?::([A-Z]))?$/i);
  if (match) return { kind: 'bench', unit: match[1].toUpperCase(), row: match[2].toUpperCase(), slot: match[3], variant: match[4] || '' };
  match = boxId.match(/^(IVAR|CABINET)-([A-Z0-9-]+)-H(\d+)-P(\d+)-([A-Z])$/i);
  if (match) return parseLocation(`${match[1]}:${match[2]}:H${match[3]}:P${match[4]}:${match[5]}`);
  match = boxId.match(/^BENCH-([A-Z0-9-]+)-(TOP|UNDER)-P(\d+)-([A-Z])$/i);
  if (match) return parseLocation(`BENCH:${match[1]}:${match[2]}:P${match[3]}:${match[4]}`);
  return null;
}

const unitName = p => p.kind === 'ivar' ? p.unit : p.unit.toLowerCase().split('-').map(s => s[0]?.toUpperCase() + s.slice(1)).join(' ');
const slug = p => `${p.kind === 'ivar' ? '' : p.kind + '-'}${p.unit.toLowerCase()}`;

export function presentLocation(id, boxId, language = 'en') {
  const p = parseLocation(id, boxId); const l = labels[language] || labels.en;
  if (!p) return { system: id || boxId || '', shelf: '', slot: '' };
  return {
    system: `${l[p.kind]}: ${unitName(p)}`,
    shelf: p.kind === 'bench' ? `${l.surface}: ${p.row === 'TOP' ? l.top : l.under}` : `${l.shelf} ${p.row}`,
    slot: `${l.slot}: ${p.slot}${p.variant.toUpperCase()}`
  };
}

export function currentSession(data, boxId) {
  const counts = new Map();
  for (const p of data.photos) counts.set(p.sessionId, (counts.get(p.sessionId) || 0) + 1);
  return data.sessions.filter(s => s.boxId === boxId).sort((a, b) => Number(b.isCurrent) - Number(a.isCurrent)
    || (counts.get(b.sessionId) || 0) - (counts.get(a.sessionId) || 0) || b.createdAt.localeCompare(a.createdAt))[0];
}

export class Inventory {
  constructor(store) { this.store = store; }
  language(language) { return language?.trim() || this.store.settings().appearance?.language || 'en'; }

  get(boxId, language, data = this.store.read()) {
    const box = data.boxes.find(b => b.boxId === boxId);
    if (!box) return null;
    const session = currentSession(data, boxId);
    const photos = data.photos.filter(p => p.sessionId === session?.sessionId);
    const preferred = photos.find(p => p.immichAssetId === box.coverAssetId);
    const cover = preferred || ['inside', 'spread', 'detail', 'label', 'location'].map(role => photos.find(p => p.photoRole === role)).find(Boolean);
    return {
      boxId, label: box.label, locationId: box.currentLocationId,
      coverAssetId: cover?.immichAssetId || null, coverIsAutomatic: !preferred,
      location: presentLocation(box.currentLocationId, boxId, this.language(language)), boxNotes: box.notes,
      sessionId: session?.sessionId, sessionCreatedAt: session?.createdAt, summary: session?.summary,
      sessionNotes: session?.notes, itemKeywords: session?.itemKeywords || [],
      photos: data.photos.filter(p => p.sessionId === session?.sessionId).map(p => ({
        photoId: p.photoId, immichAssetId: p.immichAssetId, role: p.photoRole, capturedAt: p.capturedAt, notes: p.notes, originalFileName: p.originalFileName
      })), score: 0
    };
  }

  list(language) {
    const data = this.store.read();
    return data.boxes.map(b => this.get(b.boxId, language, data));
  }

  setCover(boxId, assetId) {
    if (assetId !== null) text(assetId, 'assetId');
    this.store.mutate(data => {
      const box = data.boxes.find(b => b.boxId === boxId);
      if (!box) throw new InputError('Box not found.', 404);
      const session = currentSession(data, boxId);
      if (assetId !== null && !data.photos.some(p => p.sessionId === session?.sessionId && p.immichAssetId === assetId)) throw new InputError('Choose a photo from this box\'s current inventory.', 409);
      if (assetId === null) delete box.coverAssetId;
      else box.coverAssetId = assetId;
    });
    return this.get(boxId);
  }

  search(query, limit = 10, language) {
    const q = normalize(query);
    if (!q) return [];
    const tokens = q.split(' ').filter(t => t.length > 1 && !['var', 'finns', 'den', 'det', 'och', 'med', 'where', 'are', 'the'].includes(t));
    return this.list(language).map(box => {
      const fields = [box.label, box.locationId, box.boxId, box.summary || '', box.boxNotes || '', box.sessionNotes || '', ...box.itemKeywords, ...box.photos.flatMap(p => [p.notes || '', p.originalFileName || ''])].map(normalize);
      const haystack = fields.join(' ');
      const overlaps = tokens.filter(t => haystack.includes(t)).length;
      const phrase = haystack.includes(q);
      if (!phrase && !overlaps) return null;
      return { ...box, score: overlaps + (phrase ? 3 : 0) + (fields[0].includes(q) ? 6 : 0) + (normalize(box.summary || '').includes(q) ? 4 : 0) + (box.itemKeywords.some(k => normalize(k).includes(q)) ? 7 : 0) };
    }).filter(Boolean).sort((a, b) => b.score - a.score || a.boxId.localeCompare(b.boxId)).slice(0, Math.max(1, Math.min(25, Number.isFinite(limit) ? Math.trunc(limit) : 10)));
  }

  ask(query, language) {
    const lang = this.language(language); const matches = this.search(query, 5, lang);
    const location = b => Object.values(b.location).filter(Boolean).join(', ');
    let answer;
    if (!matches.length) answer = lang === 'sv' ? `Jag hittade ingen tydlig träff för "${query}".` : lang === 'de' ? `Keine eindeutigen Treffer für "${query}".` : `I found no clear match for "${query}".`;
    else if (matches.length === 1) answer = lang === 'sv' ? `${matches[0].label} finns i ${location(matches[0])}.` : lang === 'de' ? `${matches[0].label} befindet sich in ${location(matches[0])}.` : `${matches[0].label} is in ${location(matches[0])}.`;
    else answer = matches.slice(0, 3).map(b => `${b.label}: ${location(b)}`).join('; ') + '.';
    return { query, answer, source: 'search', count: matches.length, matches };
  }

  locations(language) {
    const l = labels[this.language(language)] || labels.en;
    const grouped = new Map();
    for (const box of this.list(language)) {
      const p = parseLocation(box.locationId, box.boxId); if (!p) continue;
      const key = slug(p);
      const group = grouped.get(key) || { location: key, title: `${l[p.kind]} ${unitName(p)}`, kind: p.kind, boxCount: 0, boxes: [] };
      group.boxCount++; group.boxes.push({ box, p }); grouped.set(key, group);
    }
    return [...grouped.values()].sort((a, b) => a.location.localeCompare(b.location));
  }

  save(payload) {
    object(payload); object(payload.box, 'box'); object(payload.session, 'session');
    const { box, session } = payload;
    if (payload.expectNewBox !== undefined && typeof payload.expectNewBox !== 'boolean') throw new InputError('expectNewBox must be a boolean.');
    for (const key of ['boxId', 'label', 'currentLocationId']) text(box[key], key);
    if (session.boxId !== box.boxId) throw new InputError('The session must belong to the submitted box.');
    text(session.summary, 'summary', { empty: true });
    if (!Array.isArray(session.itemKeywords)) throw new InputError('itemKeywords must be an array.');
    const now = new Date().toISOString(); const sessionId = session.sessionId || randomUUID();
    text(sessionId, 'sessionId');
    if (!Array.isArray(payload.photos ?? [])) throw new InputError('photos must be an array.');
    const assetIds = (payload.photos || []).map(p => p?.immichAssetId);
    if (new Set(assetIds).size !== assetIds.length) throw new InputError('The same image cannot be added twice to a session.');
    this.store.mutate(data => {
      const owners = new Map(data.sessions.map(s => [s.sessionId, s.boxId]));
      for (const photo of payload.photos || []) if (data.photos.some(p => p.immichAssetId === photo?.immichAssetId && owners.get(p.sessionId) !== box.boxId)) throw new InputError('A selected image is already linked to another box.', 409);
      const old = data.boxes.find(b => b.boxId === box.boxId);
      if (payload.expectNewBox && old) throw new InputError('This box ID already exists. Choose a new ID or open the existing box to update it.', 409);
      const prior = data.sessions.find(s => s.sessionId === sessionId);
      if (prior && prior.boxId !== box.boxId) throw new InputError('A session cannot be reassigned to another box.', 409);
      const next = { ...old, ...box, createdAt: old?.createdAt || now, updatedAt: now };
      if (next.coverAssetId && !(payload.photos || []).some(p => p.immichAssetId === next.coverAssetId)) delete next.coverAssetId;
      data.boxes = data.boxes.filter(b => b.boxId !== box.boxId); data.boxes.push(next);
      for (const entry of data.sessions) if (entry.boxId === box.boxId) entry.isCurrent = false;
      data.sessions = data.sessions.filter(s => s.sessionId !== sessionId);
      data.sessions.push({ ...session, sessionId, createdAt: prior?.createdAt || now, isCurrent: true });
      data.photos = data.photos.filter(p => p.sessionId !== sessionId);
      data.photos.push(...(payload.photos || []).map((p, i) => ({ ...p, photoId: p.photoId || `${sessionId}:${i + 1}`, sessionId })));
    });
    return this.get(box.boxId);
  }
}
