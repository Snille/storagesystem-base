// Reference behavior: Storagesystem/lib/search.ts (a92ed1d), adapted to shared
// current-box records and locally retained filenames. No photo-server I/O.
export const normalizeText = value => value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const filenameKey = value => value.toLowerCase().replace(/[^a-z0-9]+/g, '');
const stopWords = new Set('var finns finnsdet vilka vilken vilket jag behover har den det de en ett och eller med i pa av till om where are is the do you have'.split(' '));
const endings = ['orna', 'arna', 'erna', 'ande', 'ning', 'ningar', 'heten', 'heter', 'na', 'en', 'et', 'or', 'ar', 'er', 'a', 'n', 't'];
const synonyms = { rc: ['radiostyrd', 'rccar', 'rccars'], radiostyrd: ['rc', 'rccar'], rcbil: ['rc', 'radiostyrd', 'bil', 'bilar'], bil: ['car'], bilar: ['bil', 'car'], car: ['bil', 'bilar'] };
function variants(token) {
  const words = new Set([token, ...(synonyms[token] || [])]);
  for (const ending of endings) if (token.length > ending.length + 2 && token.endsWith(ending)) words.add(token.slice(0, -ending.length));
  if (token.length >= 2 && token.length <= 4) for (let i = 0; i < token.length - 1; i++) words.add(token.slice(0, i) + token[i + 1] + token[i] + token.slice(i + 2));
  return [...words].filter(word => word.length > 1);
}

export function searchBoxes(boxes, query, historicalFilenames = new Map()) {
  const normalized = normalizeText(query);
  if (!normalized) return [];
  const fileQuery = /[._]/.test(query) || /^[a-z]{2,}\d/i.test(query) || /^[a-z]{2,}-\d{3,}/i.test(query);
  if (fileQuery) {
    const key = filenameKey(query);
    if (!key) return [];
    const candidates = boxes.map(box => {
      const names = [...box.photos.map(p => p.originalFileName || ''), ...(historicalFilenames.get(box.boxId) || [])].filter(Boolean).map(filenameKey);
      return { ...box, score: names.includes(key) ? 10000 : names.some(name => name.includes(key)) ? 5000 : 0 };
    }).filter(box => box.score);
    // A filename query is an explicit lookup: prefer exact matches exclusively.
    const exact = candidates.some(box => box.score === 10000);
    if (candidates.length) return candidates.filter(box => !exact || box.score === 10000).sort((a, b) => b.score - a.score || a.boxId.localeCompare(b.boxId));
    // Product codes such as ESP32 and MCP3008 resemble camera filenames too.
    // Preserve ordinary content lookup when no retained filename matches.
    if (/[._]/.test(query) && !boxes.some(box => [box.boxId, box.label, box.summary || '', ...box.itemKeywords].some(value => normalizeText(value).includes(normalized)))) return [];
  }
  const tokens = normalized.split(' ').filter(token => token.length > 1 && !stopWords.has(token));
  if (!tokens.length && !boxes.some(box => [box.boxId, box.locationId, box.label].some(value => normalizeText(value) === normalized))) return [];
  const expanded = [...new Set(tokens.flatMap(variants))];
  return boxes.flatMap(box => {
    const label = normalizeText(box.label), location = normalizeText(box.locationId), summary = normalizeText(box.summary || '');
    const keywords = box.itemKeywords.map(normalizeText);
    const notes = box.photos.map(p => normalizeText(p.notes || ''));
    const filenames = box.photos.map(p => normalizeText(p.originalFileName || ''));
    const haystack = [normalizeText(box.boxId), label, location, normalizeText(box.boxNotes || ''), normalizeText(box.sessionNotes || ''), summary, ...keywords, ...notes, ...filenames].join(' ');
    const overlaps = expanded.filter(token => haystack.includes(token)).length;
    const phrase = haystack.includes(normalized);
    if (!phrase && !overlaps) return [];
    let score = overlaps + (phrase ? 3 : 0);
    for (const [fields, weight] of [[[label], 6], [[location], 3], [[summary], 4], [keywords, 7], [notes, 3], [filenames, 8]]) if (fields.some(value => value.includes(normalized))) score += weight;
    for (const token of expanded) {
      if (label.includes(token)) score += 3;
      if (keywords.some(value => value.includes(token))) score += 3;
      if (summary.includes(token)) score += 2;
      if (notes.some(value => value.includes(token))) score++;
      if (filenames.some(value => value.includes(token))) score += 4;
    }
    return [{ ...box, score }];
  }).sort((a, b) => b.score - a.score || a.boxId.localeCompare(b.boxId));
}
