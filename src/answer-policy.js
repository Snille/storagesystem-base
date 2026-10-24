// A synchronous decision preview over current inventory and supplied retrieval.
// No inference, persistent configuration or inventory writes happen here.
import { normalizeText } from './search.js';
import { InputError, validateAnswerRules, answerIgnoredWords as ignored } from './validation.js';

const endings = ['orna', 'arna', 'erna', 'heten', 'heter', 'ningar', 'na', 'en', 'et', 'or', 'ar', 'er'];
const negatives = new Set('inte ingen inget inga utan saknas no not without kein keine keinen ohne'.split(' '));
function forms(word) {
  const values = new Set([word]);
  if (!/\d/.test(word)) for (const end of endings) {
    if (word.endsWith(end) && word.length - end.length >= 3) values.add(word.slice(0, -end.length));
  }
  // Swedish cable nouns drop the unstressed e in the plural: kabel/kablar.
  // This is a bounded inflection family, not a spelling correction or synonym.
  if (!/\d/.test(word) && /kabeln?$/.test(word)) values.add(word.replace(/kabeln?$/, 'kabl'));
  return values;
}
const normalizedContents = value => normalizeText((value || '').replace(/(\d)(mm|cm|kg|ml|hz)\b/gi, '$1 $2'));
const words = value => normalizedContents(value).split(' ').filter(word => word && !ignored.has(word));
const same = (a, b) => [...forms(a)].some(word => forms(b).has(word));
function covers(query, field) {
  const requested = words(query), available = words(field);
  return requested.length > 0 && requested.every(word => available.some(other => same(word, other)));
}
function denies(query, field) {
  return (field || '').split(/[.;!\n]/).some(clause => words(clause).some(word => negatives.has(word)) && covers(query, clause));
}
function labelMatch(query, label) {
  // Treat punctuation/compound spacing equivalently, without fuzzy code matching.
  const a = words(query), b = words(label);
  return a.length > 0 && b.length > 0 && (same(a.join(''), b.join(''))
    || (a.length === b.length && a.every((word, index) => same(word, b[index]))));
}
function evidence(query, box) {
  if (labelMatch(query, box.boxId) || labelMatch(query, box.locationId)) return 'identifier';
  if (labelMatch(query, box.label)) return 'label';
  if (covers(query, (box.itemKeywords || []).join(' '))) return 'keyword';
  if (covers(query, [box.label, box.summary, ...(box.itemKeywords || [])].join(' '))) return 'summary';
  return null;
}

const languageText = {
  en: { no: 'I found no supported match in the inventory.', clarify: 'Which type do you need?', at: 'is at' },
  sv: { no: 'Jag hittar ingen säker träff i inventeringen.', clarify: 'Vilken sort behöver du?', at: 'finns på' },
  de: { no: 'Ich finde keinen belegten Treffer im Inventar.', clarify: 'Welche Art brauchst du?', at: 'befindet sich bei' }
};

export function previewAnswerDecision(query, boxes, { semanticMatches = [], thresholds, rules = [], identityEvidence = [], confirmedIntent } = {}, language = 'en') {
  if (typeof query !== 'string' || !query.trim() || query.length > 2000) throw new InputError('A bounded nonempty query is required.');
  if (!Array.isArray(semanticMatches) || semanticMatches.length > 1000) throw new InputError('Invalid semantic candidates.');
  if (thresholds !== undefined && (!thresholds || !Number.isFinite(thresholds.similarity)
    || !Number.isFinite(thresholds.margin) || thresholds.similarity < -1 || thresholds.similarity > 1
    || thresholds.margin < 0 || thresholds.margin > 2)) throw new InputError('Invalid semantic thresholds.');
  validateAnswerRules(rules);
  if (confirmedIntent !== undefined && (typeof confirmedIntent !== 'string' || !confirmedIntent.trim() || confirmedIntent.length > 2000)) throw new InputError('Invalid confirmed query intent.');
  if (!Array.isArray(identityEvidence) || identityEvidence.length > 25) throw new InputError('Invalid item identity evidence.');
  const text = languageText[language] || languageText.en;
  const byId = new Map(boxes.map(box => [box.boxId, box]));
  const verified = new Set();
  for (const proof of identityEvidence) {
    const box = byId.get(proof?.boxId);
    if (!box || proof.query !== query || proof.sessionId !== box.sessionId || proof.confirmedIntent !== confirmedIntent) throw new InputError('Item evidence does not match the query/current session.', 409);
    const source = proof.field === 'label' ? box.label : proof.field === 'summary' ? box.summary
      : proof.field === 'keywords' ? (box.itemKeywords || []).join('\n')
      : proof.field === 'photoNotes' ? (box.photos || []).map(photo => photo.notes || '').join('\n') : null;
    if (typeof source !== 'string' || typeof proof.quote !== 'string' || proof.quote.trim().length < 3
      || proof.quote.length > 500 || !source.includes(proof.quote) || verified.has(box.boxId)) throw new InputError('Item evidence must quote a current inventory field.');
    verified.add(box.boxId);
  }
  const scores = new Map();
  for (const match of semanticMatches) {
    const box = byId.get(match?.boxId);
    if (!box || match.sessionId !== box.sessionId) throw new InputError('Semantic candidates do not match the current inventory sessions.', 409);
    if (!Number.isFinite(match.similarity) || match.similarity < -1 || match.similarity > 1 || scores.has(match.boxId)) throw new InputError('Invalid or duplicate semantic score.');
    scores.set(match.boxId, match.similarity);
  }
  const requiredCodes = [...query.toLowerCase().matchAll(/\b(?:[a-z]+[-_]\d[a-z0-9_-]*|[a-z]*\d[a-z0-9]*|\d+(?:[.,]\d+)?)\b/g)]
    .map(match => normalizeText(match[0]));
  const retainsCodes = box => {
    const contents = ` ${normalizedContents([box.label, box.summary, ...(box.itemKeywords || []), ...(box.photos || []).map(photo => photo.notes || '')].join(' '))} `;
    return labelMatch(query, box.boxId) || labelMatch(query, box.locationId)
      || requiredCodes.every(code => contents.includes(` ${code} `));
  };
  const candidates = boxes.filter(box => !denies(query, box.summary)
    && !(box.itemKeywords || []).some(keyword => denies(query, keyword)) && retainsCodes(box))
    .map(box => ({ box, similarity: scores.get(box.boxId), evidence: evidence(query, box) }));
  const weight = { identifier: 4, label: 3, keyword: 2, summary: 1 };
  const direct = candidates.filter(item => item.evidence).sort((a, b) => (weight[b.evidence] - weight[a.evidence])
    || (b.similarity ?? -1) - (a.similarity ?? -1) || a.box.boxId.localeCompare(b.box.boxId));
  const dense = candidates.filter(item => item.similarity !== undefined)
    .sort((a, b) => b.similarity - a.similarity || a.box.boxId.localeCompare(b.box.boxId));
  const matches = [...direct, ...dense.filter(item => !direct.some(d => d.box.boxId === item.box.boxId))].slice(0, 25)
    .map(item => ({ ...item.box, evidence: item.evidence, ...(item.similarity !== undefined ? { similarity: item.similarity } : {}) }));
  const finish = (decision, selected, reason, rule) => {
    const selectedBoxes = selected.map(id => byId.get(id));
    const answer = decision === 'answer' ? selectedBoxes.map(box => `${box.label} ${text.at} ${Object.values(box.location).filter(Boolean).join(', ')}`).join('; ') + '.'
      : decision === 'clarify' ? (rule?.question?.[language] || text.clarify) : text.no;
    return { query, answer, source: 'decision-preview', decision, reason, selectedBoxIds: selected,
      ...(rule ? { ruleId: rule.id } : {}), count: matches.length, matches };
  };
  if (!words(query).length) return finish('no_supported_match', [], 'empty_search_terms');
  const activeRules = rules.filter(rule => rule.queries.some(alias => labelMatch(query, alias)));
  if (activeRules.length > 1) return finish('clarify', [], 'conflicting_rules');
  if (activeRules.length) {
    const rule = activeRules[0];
    // A configured destination cannot create evidence or override stale data.
    // Photo-only mentions and low semantic scores cannot authorize a rule.
    const relevant = rule.boxIds.map(id => direct.find(item => item.box.boxId === id));
    if (relevant.some(item => !item)) return finish('clarify', [], 'rule_evidence_missing');
    if (rule.action === 'clarify') return finish('clarify', [], 'item_type_distinction', rule);
    if (rule.action === 'all') return finish('answer', rule.boxIds, 'confirmed_compatible_destinations', rule);
    const chosen = direct.find(item => rule.boxIds.includes(item.box.boxId));
    return finish('answer', [chosen.box.boxId], 'confirmed_equivalent_destinations', rule);
  }
  if (direct.length) {
    const best = direct[0];
    const peers = direct.filter(item => weight[item.evidence] === weight[best.evidence]);
    if (peers.length === 1 || best.evidence === 'identifier') return finish('answer', [best.box.boxId], 'direct_current_evidence');
    return finish('clarify', [], 'multiple_direct_matches');
  }
  if (!thresholds || !dense.length || dense[0].similarity < thresholds.similarity) return finish('no_supported_match', [], 'insufficient_semantic_evidence');
  const competitors = [...scores].filter(([id]) => id !== dense[0].box.boxId).map(([, score]) => score);
  if (!competitors.length) return finish('no_supported_match', [], 'missing_semantic_comparison');
  if (dense[0].similarity - Math.max(...competitors) < thresholds.margin) return finish('clarify', [], 'semantic_margin');
  if (verified.has(dense[0].box.boxId)) return finish('answer', [dense[0].box.boxId], 'verified_semantic_evidence');
  // A score/margin alone cannot establish object identity. Only a trusted
  // application verifier may supply evidence; never accept this from public input.
  return finish('no_supported_match', [], 'unverified_item_identity');
}
