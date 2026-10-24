import { normalizeText } from './search.js';

export const answerIgnoredWords = new Set('var vart finns ligger har jag behover den det de en ett och med i pa av till where is are the do you have need wo ist sind der die das'.split(' '));

export class InputError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

export function object(value, name = 'payload') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new InputError(`${name} must be an object.`);
  return value;
}

export function text(value, name, { optional = false, empty = false } = {}) {
  if (optional && value === undefined) return;
  if (typeof value !== 'string' || (!empty && !value.trim()) || value.length > 100000) {
    throw new InputError(`${name} must be ${empty ? 'a' : 'a non-empty'} string (maximum 100000 characters).`);
  }
}

export function validateInventory(input) {
  object(input);
  for (const table of ['boxes', 'sessions', 'photos']) {
    if (!Array.isArray(input[table])) throw new InputError(`${table} must be an array.`);
  }
  const ids = {};
  for (const [table, id] of [['boxes', 'boxId'], ['sessions', 'sessionId'], ['photos', 'photoId']]) {
    ids[table] = new Set();
    for (const row of input[table]) {
      object(row, table); text(row[id], id);
      if (ids[table].has(row[id])) throw new InputError(`Duplicate ${id}: ${row[id]}`);
      ids[table].add(row[id]);
      text(row.notes, 'notes', { optional: true, empty: true });
    }
  }
  for (const box of input.boxes) {
    text(box.coverAssetId, 'coverAssetId', { optional: true });
    for (const key of ['label', 'currentLocationId', 'createdAt', 'updatedAt']) text(box[key], key);
  }
  const current = new Set();
  for (const session of input.sessions) {
    for (const key of ['boxId', 'createdAt']) text(session[key], key);
    text(session.summary, 'summary', { empty: true });
    if (!ids.boxes.has(session.boxId)) throw new InputError(`Orphan session: ${session.sessionId}`);
    if (!Array.isArray(session.itemKeywords) || session.itemKeywords.some(k => typeof k !== 'string')) throw new InputError('itemKeywords must be an array of strings.');
    if (typeof session.isCurrent !== 'boolean') throw new InputError('isCurrent must be a boolean.');
    if (session.isCurrent && current.has(session.boxId)) throw new InputError(`Multiple current sessions: ${session.boxId}`);
    if (session.isCurrent) current.add(session.boxId);
  }
  for (const photo of input.photos) {
    text(photo.sessionId, 'sessionId'); text(photo.immichAssetId, 'immichAssetId');
    text(photo.capturedAt, 'capturedAt', { optional: true, empty: true });
    text(photo.originalFileName, 'originalFileName', { optional: true, empty: true });
    if (!ids.sessions.has(photo.sessionId)) throw new InputError(`Orphan photo: ${photo.photoId}`);
    if (!['label', 'location', 'inside', 'spread', 'detail'].includes(photo.photoRole)) throw new InputError(`Invalid photo role: ${photo.photoRole}`);
  }
  return input;
}

export function validateSettings(settings) {
  object(settings, 'settings');
  if (settings.appearance?.uiLanguage !== undefined && !['en', 'sv'].includes(settings.appearance.uiLanguage)) throw new InputError('Unsupported interface language.');
  if (settings.aiWorkspace !== undefined) validateAiWorkspace(settings.aiWorkspace);
  if (settings.searchWorkspace !== undefined) validateSearchWorkspace(settings.searchWorkspace);
  if (settings.printing !== undefined) validatePrinting(settings.printing);
  for (const [section, fields] of Object.entries({
    appearance: ['language'], security: ['publicApiKey', 'appBaseUrl'],
    immich: ['provider', 'baseUrl', 'accountLabel', 'accessMode', 'apiKey', 'shareKey', 'albumId']
  })) {
    if (settings[section] === undefined) continue;
    object(settings[section], section);
    for (const field of fields) text(settings[section][field], `${section}.${field}`, { optional: true, empty: true });
  }
  for (const value of [settings.security?.appBaseUrl, settings.immich?.baseUrl]) {
    if (!value) continue;
    let url;
    try { url = new URL(value); } catch { throw new InputError('Configured base URLs must be absolute HTTP(S) URLs.'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new InputError('Configured base URLs must be HTTP(S) URLs without credentials, query strings or fragments.');
  }
  return settings;
}

export function validateAiWorkspace(config) {
  object(config, 'aiWorkspace');
  for (const field of Object.keys(config)) if (!['connections', 'imageInventory'].includes(field)) throw new InputError(`Unsupported AI workspace setting: ${field}`);
  if (!Array.isArray(config.connections) || config.connections.length > 10) throw new InputError('Configure at most 10 AI connections.');
  const ids = new Set();
  for (const connection of config.connections) {
    object(connection, 'connection');
    for (const field of Object.keys(connection)) if (!['id', 'name', 'provider', 'baseUrl', 'apiKey'].includes(field)) throw new InputError(`Unsupported AI connection setting: ${field}`);
    for (const field of ['id', 'name', 'provider', 'baseUrl']) text(connection[field], field);
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(connection.id) || ids.has(connection.id)) throw new InputError('AI connection identifiers must be unique (letters, digits, hyphen or underscore).');
    ids.add(connection.id);
    if (connection.name.length > 80) throw new InputError('Connection name is too long.');
    if (!['openrouter', 'compatible', 'llamacpp'].includes(connection.provider)) throw new InputError('Choose OpenRouter, llama.cpp or an OpenAI-compatible service.');
    text(connection.apiKey, 'apiKey', { optional: true, empty: true });
    if (connection.apiKey && /[\r\n]/.test(connection.apiKey)) throw new InputError('API keys cannot contain line breaks.');
    let url;
    try { url = new URL(connection.baseUrl); } catch { throw new InputError('Enter an absolute HTTP(S) API base URL.'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new InputError('AI API base URLs must use HTTP(S) without credentials, query strings or fragments.');
    if (connection.provider === 'openrouter' && connection.baseUrl !== 'https://openrouter.ai/api/v1') throw new InputError('OpenRouter uses https://openrouter.ai/api/v1. Use a compatible connection for another server.');
  }
  const task = object(config.imageInventory, 'imageInventory');
  for (const field of Object.keys(task)) if (!['connectionId', 'model', 'language', 'extraInstructions'].includes(field)) throw new InputError(`Unsupported image task setting: ${field}`);
  for (const field of ['connectionId', 'model', 'language', 'extraInstructions']) text(task[field], field, { empty: true });
  if (task.connectionId && !ids.has(task.connectionId)) throw new InputError('The image task must use an existing connection.');
  if (task.model.length > 200 || task.extraInstructions.length > 4000) throw new InputError('Use a model ID up to 200 characters and extra instructions up to 4000 characters.');
  if (!['app', 'en', 'sv', 'de'].includes(task.language)) throw new InputError('Choose app, en, sv or de for the image output language.');
  return config;
}

export function validateAnswerRules(rules) {
  if (!Array.isArray(rules) || rules.length > 100) throw new InputError('Configure at most 100 answer rules.');
  const ids = new Set();
  for (const rule of rules) {
    object(rule, 'rule');
    for (const key of Object.keys(rule)) if (!['id', 'queries', 'action', 'boxIds', 'question'].includes(key)) throw new InputError('Unsupported answer rule field.');
    if (typeof rule.id !== 'string' || !rule.id.trim() || rule.id.length > 100 || ids.has(rule.id)
      || !Array.isArray(rule.queries) || !rule.queries.length || rule.queries.length > 30
      || rule.queries.some(q => typeof q !== 'string' || !q.trim() || q.length > 240
        || !normalizeText(q).split(' ').some(word => word && !answerIgnoredWords.has(word)))
      || !['clarify', 'any', 'all'].includes(rule.action)
      || !Array.isArray(rule.boxIds) || rule.boxIds.length < 2 || rule.boxIds.length > 25
      || new Set(rule.boxIds).size !== rule.boxIds.length || rule.boxIds.some(id => typeof id !== 'string' || !id.trim() || id.length > 200)
      || (rule.action === 'all' && rule.boxIds.length > 2)) throw new InputError('Invalid answer rule: choose queries and distinct boxes; return at most two locations.');
    if (rule.question !== undefined) {
      object(rule.question, 'question');
      if (Object.keys(rule.question).some(key => !['en', 'sv', 'de'].includes(key))
        || Object.values(rule.question).some(q => typeof q !== 'string' || !q.trim() || q.length > 240)) throw new InputError('Use short English, Swedish or German clarification questions.');
    }
    if (rule.action === 'clarify' && !Object.keys(rule.question || {}).length) throw new InputError('Clarification rules need a question in at least one language.');
    ids.add(rule.id);
  }
  return rules;
}

export function validateSearchWorkspace(config) {
  object(config, 'searchWorkspace');
  for (const key of Object.keys(config)) if (!['embedding', 'rules'].includes(key)) throw new InputError('Unsupported search setting.');
  const e = object(config.embedding, 'embedding');
  for (const key of Object.keys(e)) if (!['enabled', 'baseUrl', 'model', 'modelRevision', 'dimensions', 'apiKey'].includes(key)) throw new InputError('Unsupported embedding setting.');
  if (typeof e.enabled !== 'boolean' || !Number.isInteger(e.dimensions) || e.dimensions < 1 || e.dimensions > 8192) throw new InputError('Choose a valid embedding dimension and preview mode.');
  for (const key of ['baseUrl', 'model', 'modelRevision']) {
    text(e[key], key, { empty: true });
    if (e[key].length > (key === 'baseUrl' ? 1000 : 200)) throw new InputError('Embedding setting is too long.');
  }
  text(e.apiKey, 'apiKey', { optional: true, empty: true });
  if (e.apiKey && (e.apiKey.length > 4096 || /[\r\n]/.test(e.apiKey))) throw new InputError('Use an API key without line breaks.');
  if (e.baseUrl) {
    let url; try { url = new URL(e.baseUrl); } catch { throw new InputError('Enter the native Ollama HTTP(S) origin without /v1.'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash
      || url.pathname !== '/') throw new InputError('Enter the native Ollama HTTP(S) origin without paths or credentials.');
  }
  if (e.modelRevision && !/^[a-f0-9]{64}$/.test(e.modelRevision)) throw new InputError('Choose the model digest from the saved server model list.');
  if (e.enabled && (!e.baseUrl || !e.model.trim() || !e.modelRevision)) throw new InputError('Save a server, model and immutable digest before enabling embeddings.');
  validateAnswerRules(config.rules);
  return config;
}

export function validatePrinting(config) {
  object(config, 'printing');
  if (Object.keys(config).some(key => !['enabled', 'serverUrl', 'queue', 'mediaKey', 'style', 'styles', 'rollReader'].includes(key))) throw new InputError('Unsupported printing setting.');
  if (typeof config.enabled !== 'boolean' || !labelMediaPresets.some(p => p.key === config.mediaKey)) throw new InputError('Choose a supported label format.');
  for (const key of ['serverUrl', 'queue']) text(config[key], key, { empty: !config.enabled });
  if (config.serverUrl.length > 1000) throw new InputError('CUPS server URL is too long.');
  if (config.serverUrl) {
    let url; try { url = new URL(config.serverUrl); } catch { throw new InputError('Enter a CUPS HTTP(S) origin.'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new InputError('Use a CUPS origin without paths or credentials.');
  }
  if (config.queue && !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,79}$/.test(config.queue)) throw new InputError('Invalid CUPS queue name.');
  // Settings saved before 0.14 hold one shared `style`; newer settings hold one style per label format.
  if ((config.style === undefined) === (config.styles === undefined)) throw new InputError('Save text sizes for each label format.');
  const sizes = (style, keys, extra = []) => {
    object(style, 'style');
    if (Object.keys(style).sort().join(',') !== [...keys, ...extra].sort().join(',')
      || keys.some(key => !Number.isInteger(style[key]) || style[key] < 6 || style[key] > 16)) throw new InputError('Label font sizes must be 6-16 points.');
  };
  if (config.style !== undefined) sizes(config.style, labelSizeKeys.filter(key => key !== 'locationLabelSize'));
  else {
    object(config.styles, 'styles');
    if (Object.keys(config.styles).sort().join(',') !== labelMediaPresets.map(p => p.key).sort().join(',')) throw new InputError('Save text sizes for each label format.');
    for (const style of Object.values(config.styles)) {
      sizes(style, labelSizeKeys, ['orientation']);
      if (!labelOrientations.includes(style.orientation)) throw new InputError('Choose portrait or landscape label orientation.');
    }
  }
  if (config.rollReader !== undefined) {
    const r = object(config.rollReader, 'rollReader');
    if (Object.keys(r).sort().join(',') !== 'enabled,host,port' || typeof r.enabled !== 'boolean' || typeof r.host !== 'string'
      || r.host.length > 253 || (r.host && !/^[A-Za-z0-9][A-Za-z0-9.-]*$/.test(r.host)) || (r.enabled && !r.host)
      || !Number.isInteger(r.port) || r.port < 1 || r.port > 65535) throw new InputError('Use a roll-reader hostname or IPv4 address and a valid TCP port.');
  }
  return config;
}

export function validatePrintJob(record) {
  object(record, 'print job');
  if (!/^[a-f0-9-]{36}$/.test(record.id) || !/^[a-f0-9]{64}$/.test(record.tokenHash) || !/^[a-f0-9]{64}$/.test(record.documentHash)
    || !/^[a-f0-9]{64}$/.test(record.settingsRevision) || typeof record.createdAt !== 'string' || !Number.isFinite(Date.parse(record.createdAt))
    || !['submitting', 'submitted', 'unknown', 'rejected'].includes(record.state)
    || (record.jobId !== undefined && (!Number.isInteger(record.jobId) || record.jobId < 1))) throw new InputError('Invalid print job record.');
  validatePrinting({ enabled: true, serverUrl: record.serverUrl, queue: record.queue, mediaKey: record.mediaKey, styles: defaultLabelStyles() });
  if (record.kind !== undefined && !['box', 'location'].includes(record.kind)) throw new InputError('Invalid print job record.');
  return record;
}
import { labelMediaPresets, labelSizeKeys, labelOrientations, defaultLabelStyles } from './label-media.js';
