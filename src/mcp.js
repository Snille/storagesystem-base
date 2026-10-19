import { object, text, InputError } from './validation.js';

const language = { type: 'string', description: 'Language code, for example en or sv.' };
const definitions = [
  ['search_inventory', 'Search inventory', 'Find boxes by their contents.', { query: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 25 }, language }, ['query']],
  ['get_box', 'Get box', 'Read one box and its current inventory session.', { box_id: { type: 'string' }, language }, ['box_id']],
  ['list_locations', 'List locations', 'List storage units with box counts.', { language }, []],
  ['list_boxes_at_location', 'List boxes at location', 'List boxes in a storage unit, in shelf and slot order.', { location: { type: 'string' }, language }, ['location']],
  ['get_box_photo', 'Get box photo', 'Return a box thumbnail.', { box_id: { type: 'string' }, photo_id: { type: 'string' }, role: { type: 'string', enum: ['inside', 'spread', 'detail', 'label', 'location'] } }, ['box_id']]
];
const tools = definitions.map(([name, title, description, properties, required]) => ({
  name, title, description, inputSchema: { type: 'object', properties, required }
}));
const versions = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const result = payload => ({ content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }], structuredContent: payload });
const toolError = message => ({ content: [{ type: 'text', text: message }], isError: true });
const failure = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });

function toToolBox(box) {
  const { boxId, label, location, boxNotes, summary, sessionNotes, itemKeywords, sessionCreatedAt, photos, score } = box;
  return { boxId, label, location, boxNotes, summary, sessionNotes, itemKeywords, updatedAt: sessionCreatedAt,
    photos: photos.map(({ photoId, role, notes }) => ({ photoId, role, notes })), ...(score ? { score } : {}) };
}

export async function handleMcp(message, inventory, photos, version) {
  if (!message || typeof message !== 'object' || Array.isArray(message) || message.jsonrpc !== '2.0') return failure(null, -32600, 'Invalid JSON-RPC message.');
  if (message.id === undefined || typeof message.method !== 'string') return null;
  const { id, method } = message;
  const success = value => ({ jsonrpc: '2.0', id, result: value });
  if (method === 'initialize') return success({
    protocolVersion: versions.includes(message.params?.protocolVersion) ? message.params.protocolVersion : versions[0],
    capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'storagesystem', title: 'Storage system', version },
    instructions: 'Search inventory first, then get_box for details. Browse with list_locations and list_boxes_at_location. Use human-readable locations when answering people.'
  });
  if (method === 'ping') return success({});
  if (method === 'tools/list') return success({ tools });
  if (method !== 'tools/call') return failure(id, -32601, `Method not found: ${method}`);
  const name = message.params?.name;
  const definition = tools.find(t => t.name === name);
  if (!definition) return failure(id, -32602, 'Unknown tool.');
  try {
    const args = object(message.params?.arguments ?? {}, 'arguments');
    for (const key of definition.inputSchema.required) text(args[key], key);
    for (const key of ['language', 'photo_id']) text(args[key], key, { optional: true });
    if (args.limit !== undefined && (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > 25)) throw new InputError('limit must be an integer from 1 to 25.');
    if (name === 'search_inventory') {
      const matches = inventory.search(args.query, args.limit, args.language).map(toToolBox);
      return success(result({ query: args.query, count: matches.length, matches }));
    }
    if (name === 'get_box') {
      const box = inventory.get(args.box_id, args.language);
      return success(box ? result(toToolBox(box)) : toolError(`No box with boxId "${args.box_id}".`));
    }
    if (name === 'list_locations') {
      const locations = inventory.locations(args.language).map(({ boxes, ...unit }) => unit);
      return success(result({ count: locations.length, locations }));
    }
    if (name === 'list_boxes_at_location') {
      const unit = inventory.locations(args.language).find(u => u.location === args.location.trim().toLowerCase());
      if (!unit) return success(toolError(`Unknown location "${args.location}". Call list_locations for valid values.`));
      const row = p => p.row === 'TOP' ? 1 : p.row === 'UNDER' ? 2 : p.row;
      const boxes = unit.boxes.sort((a, b) => row(a.p) - row(b.p) || Number(a.p.slot) - Number(b.p.slot) || a.p.variant.localeCompare(b.p.variant))
        .map(({ box }) => ({ boxId: box.boxId, label: box.label, location: box.location, summary: box.summary, itemKeywords: box.itemKeywords }));
      return success(result({ location: unit.location, title: unit.title, count: boxes.length, boxes }));
    }
    if (args.role !== undefined && !definition.inputSchema.properties.role.enum.includes(args.role)) throw new InputError('Invalid photo role.');
    const box = inventory.get(args.box_id);
    if (!box) return success(toolError(`No box with boxId "${args.box_id}".`));
    const preferences = args.role ? [args.role] : ['inside', 'spread', 'detail', 'label', 'location'];
    const photo = args.photo_id ? box.photos.find(p => p.photoId === args.photo_id) : preferences.map(role => box.photos.find(p => p.role === role)).find(Boolean);
    if (!photo) return success(toolError(`Box "${args.box_id}" has no matching photo.`));
    const { bytes, mime } = await photos.fetch(photo.immichAssetId, 'thumbnail');
    return success({ content: [{ type: 'image', data: bytes.toString('base64'), mimeType: mime }, { type: 'text', text: `Photo ${photo.photoId} (${photo.role}) of box ${box.boxId}, ${box.label}.` }] });
  } catch (error) {
    return success(toolError(error instanceof InputError ? error.message : 'The tool failed.'));
  }
}
