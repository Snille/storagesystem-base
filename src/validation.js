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

// Built-in page backgrounds live in web/backgrounds; custom uses the uploaded image.
export const backgrounds = ['hills', 'pegboard', 'blueprint', 'none', 'custom'];
// Buttons, links and highlights use the accent colour, a #rrggbb value.
export const defaultAccent = '#95c200';
export const accentPattern = /^#[0-9a-f]{6}$/;

// Clickable points in the 3D overview, per overview image: a direction and a storage unit.
export function validateOverviewPoints(value) {
  object(value, 'overviewPoints');
  for (const [assetId, points] of Object.entries(value)) {
    if (!assetId || assetId.length > 200 || !Array.isArray(points) || points.length > 100) throw new InputError('Invalid overview points.');
    for (const point of points) {
      object(point, 'point');
      if (Object.keys(point).some(k => !['yaw', 'pitch', 'unit'].includes(k)) || !Number.isFinite(point.yaw) || point.yaw < -180 || point.yaw > 180
        || !Number.isFinite(point.pitch) || point.pitch < -90 || point.pitch > 90 || typeof point.unit !== 'string' || !/^[a-z0-9-]{1,100}$/.test(point.unit)) throw new InputError('Invalid overview point.');
    }
  }
  return value;
}

export function validateSettings(settings) {
  object(settings, 'settings');
  if (settings.appearance?.uiLanguage !== undefined && !['en', 'sv'].includes(settings.appearance.uiLanguage)) throw new InputError('Unsupported interface language.');
  if (settings.appearance?.background !== undefined && !backgrounds.includes(settings.appearance.background)) throw new InputError('Unsupported background.');
  if (settings.appearance?.accent !== undefined && !accentPattern.test(settings.appearance.accent)) throw new InputError('Unsupported accent colour.');
  if (settings.overviewPoints !== undefined) validateOverviewPoints(settings.overviewPoints);
  if (settings.overviewPointsSource !== undefined) { object(settings.overviewPointsSource, 'overviewPointsSource'); text(settings.overviewPointsSource.assetId, 'overviewPointsSource.assetId'); }
  if (settings.aiWorkspace !== undefined) validateAiWorkspace(settings.aiWorkspace);
  if (settings.searchWorkspace !== undefined) validateSearchWorkspace(settings.searchWorkspace);
  if (settings.printing !== undefined) validateLegacyPrinting(settings.printing);
  if (settings.labelService !== undefined) validateLabelService(settings.labelService);
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
  for (const field of Object.keys(task)) if (!['connectionId', 'model', 'language', 'extraInstructions', 'fallbackConnectionId', 'fallbackModel'].includes(field)) throw new InputError(`Unsupported image task setting: ${field}`);
  for (const field of ['connectionId', 'model', 'language', 'extraInstructions']) text(task[field], field, { empty: true });
  // The fallback is optional: a second connection and model used when the first one fails.
  for (const field of ['fallbackConnectionId', 'fallbackModel']) text(task[field], field, { optional: true, empty: true });
  if (task.connectionId && !ids.has(task.connectionId)) throw new InputError('The image task must use an existing connection.');
  if (task.fallbackConnectionId && !ids.has(task.fallbackConnectionId)) throw new InputError('The fallback must use an existing connection.');
  if (Boolean(task.fallbackConnectionId) !== Boolean(task.fallbackModel)) throw new InputError('Choose both a fallback connection and a fallback model, or neither.');
  if (task.model.length > 200 || (task.fallbackModel || '').length > 200 || task.extraInstructions.length > 4000) throw new InputError('Use a model ID up to 200 characters and extra instructions up to 4000 characters.');
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

// Printer settings now live in the label service. Databases from 0.12-0.14 still hold the old CUPS settings and
// journal; they stay readable for audit, backup and restore, but nothing uses or writes them any more.
export function validateLegacyPrinting(config) {
  object(config, 'printing');
  if (Object.keys(config).some(key => !['enabled', 'serverUrl', 'queue', 'mediaKey', 'style', 'styles', 'rollReader'].includes(key))
    || typeof config.enabled !== 'boolean' || typeof config.serverUrl !== 'string' || typeof config.queue !== 'string' || typeof config.mediaKey !== 'string') {
    throw new InputError('Invalid legacy printing settings.');
  }
  return config;
}

export function validateLabelService(config) {
  object(config, 'labelService');
  if (Object.keys(config).some(key => !['enabled', 'url', 'apiKey'].includes(key)) || typeof config.enabled !== 'boolean') throw new InputError('Unsupported label service setting.');
  text(config.url, 'url', { empty: !config.enabled });
  if (config.url.length > 1000) throw new InputError('Label service URL is too long.');
  if (config.url) {
    let url; try { url = new URL(config.url); } catch { throw new InputError('Enter the label service as an HTTP(S) origin, for example http://10.0.0.25:3230.'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new InputError('Use a label service origin without paths or credentials.');
  }
  if (config.apiKey !== undefined && (typeof config.apiKey !== 'string' || config.apiKey.length < 16 || config.apiKey.length > 500)) throw new InputError('The label service key must be 16-500 characters.');
  if (config.enabled && !config.apiKey) throw new InputError('Save the label service key before enabling printing.');
  return config;
}

export function validatePrintJob(record) {
  object(record, 'print job');
  if (!/^[a-f0-9-]{36}$/.test(record.id) || !/^[a-f0-9]{64}$/.test(record.tokenHash) || !/^[a-f0-9]{64}$/.test(record.documentHash)
    || !/^[a-f0-9]{64}$/.test(record.settingsRevision) || typeof record.createdAt !== 'string' || !Number.isFinite(Date.parse(record.createdAt))
    || !['submitting', 'submitted', 'unknown', 'rejected'].includes(record.state)
    || (record.jobId !== undefined && (!Number.isInteger(record.jobId) || record.jobId < 1))
    || typeof record.serverUrl !== 'string' || typeof record.queue !== 'string' || typeof record.mediaKey !== 'string'
    || (record.kind !== undefined && !['box', 'location'].includes(record.kind))) throw new InputError('Invalid print job record.');
  return record;
}