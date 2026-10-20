import { parseLocation, suggestBoxId, locationKey } from './locations.js';
export { parseLocation } from './locations.js';
import { randomUUID } from 'node:crypto';
import { InputError, object, text } from './validation.js';
import { searchBoxes } from './search.js';
import { buildStorageMap } from './storage-map.js';

const labels = {
  en: { ivar: 'Shelving unit', bench: 'Bench', cabinet: 'Cabinet', shelf: 'Shelf', slot: 'Slot', surface: 'Surface', top: 'On top', under: 'Under' },
  sv: { ivar: 'Lagerhylla', bench: 'Bänk', cabinet: 'Skåp', shelf: 'Hylla', slot: 'Plats', surface: 'Yta', top: 'Ovanpå', under: 'Under' },
  de: { ivar: 'Lagerregal', bench: 'Werkbank', cabinet: 'Schrank', shelf: 'Regal', slot: 'Platz', surface: 'Fläche', top: 'Oben', under: 'Unten' }
};



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

  positions(language) {
    const counts = new Map();
    for (const box of this.store.read().boxes) counts.set(box.currentLocationId, (counts.get(box.currentLocationId) || 0) + 1);
    return this.store.locationIds().map(locationId => ({
      locationId, location: presentLocation(locationId, '', this.language(language)), boxCount: counts.get(locationId) || 0
    })).sort((a, b) => a.locationId.localeCompare(b.locationId, undefined, { numeric: true }));
  }

  addPosition(payload, language) {
    object(payload); text(payload.locationId, 'locationId');
    const id = payload.locationId.trim();
    if (id.length > 200) throw new InputError('Location IDs must be at most 200 characters.');
    this.store.addLocation(id);
    return this.positions(language).find(p => p.locationId === id);
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
    const data = this.store.read();
    const owners = new Map(data.sessions.map(session => [session.sessionId, session.boxId]));
    const historical = new Map();
    for (const photo of data.photos) {
      const boxId = owners.get(photo.sessionId);
      if (photo.originalFileName && boxId) { if (!historical.has(boxId)) historical.set(boxId, []); historical.get(boxId).push(photo.originalFileName); }
    }
    const boxes = data.boxes.map(box => this.get(box.boxId, language, data));
    return searchBoxes(boxes, query, historical).slice(0, Math.max(1, Math.min(25, Number.isFinite(limit) ? Math.trunc(limit) : 10)));
  }

  storageMap(language) { return buildStorageMap(this.list(language), this.positions(language)); }

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
    const box = { ...payload.box }, session = { ...payload.session };
    if (payload.expectNewBox !== undefined && typeof payload.expectNewBox !== 'boolean') throw new InputError('expectNewBox must be a boolean.');
    for (const key of ['label', 'currentLocationId']) text(box[key], key);
    text(box.boxId, 'boxId', { optional: true, empty: true });
    const generateId = box.boxId === undefined || box.boxId === '';
    if (session.boxId !== box.boxId) throw new InputError('The session must belong to the submitted box.');
    text(session.summary, 'summary', { empty: true });
    if (!Array.isArray(session.itemKeywords)) throw new InputError('itemKeywords must be an array.');
    const now = new Date().toISOString(); const sessionId = session.sessionId || randomUUID();
    text(sessionId, 'sessionId');
    if (!Array.isArray(payload.photos ?? [])) throw new InputError('photos must be an array.');
    const assetIds = (payload.photos || []).map(p => p?.immichAssetId);
    if (new Set(assetIds).size !== assetIds.length) throw new InputError('The same image cannot be added twice to a session.');
    this.store.mutate(data => {
      const occupied = data.boxes.find(b => b.boxId !== box.boxId && locationKey(b.currentLocationId) === locationKey(box.currentLocationId));
      if (occupied) throw new InputError(`This location is occupied by ${occupied.label}. Choose a different position or letter.`, 409);
      if (generateId) {
        box.boxId = suggestBoxId(box.currentLocationId, data.boxes.map(b => b.boxId)) || `BOX-${randomUUID()}`;
        session.boxId = box.boxId;
      }
      const owners = new Map(data.boxes.map(b => [currentSession(data, b.boxId)?.sessionId, b.boxId]));
      for (const photo of payload.photos || []) if (data.photos.some(p => p.immichAssetId === photo?.immichAssetId && owners.has(p.sessionId) && owners.get(p.sessionId) !== box.boxId)) throw new InputError('A selected image is already linked to another box.', 409);
      const old = data.boxes.find(b => b.boxId === box.boxId);
      if (payload.expectedSessionId !== undefined && (currentSession(data, box.boxId)?.sessionId || null) !== payload.expectedSessionId) throw new InputError('The box inventory changed. Reopen the box before saving your update.', 409);
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
