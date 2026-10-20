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
