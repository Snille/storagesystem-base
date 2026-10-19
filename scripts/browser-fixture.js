// Isolated, in-memory browser acceptance environment. No external services or real credentials.
import { createServer } from 'node:http';
import { once } from 'node:events';
import { Store } from '../src/store.js';
import { createApp } from '../src/server.js';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB1sAAAAASUVORK5CYII=', 'base64');
const assets = ['contents.png', 'label.png', 'location.png'].map((name, i) => ({ id: `fixture-${i + 1}`, originalFileName: name, type: 'IMAGE', fileCreatedAt: '2026-01-01T00:00:00Z' }));
const source = createServer(async (req, res) => {
  if (req.url === '/v1/models') {
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ data: [{ id: 'fixture-vision', name: 'Fixture image model', architecture: { input_modalities: ['image', 'text'], output_modalities: ['text'] } }] }));
  }
  if (req.url === '/v1/chat/completions') {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString()); const content = body.messages[1].content;
    const batch = content[0].text.startsWith('Build one draft');
    const photos = content.filter(p => p.type === 'text' && p.text.startsWith('Photo ')).map((p, i) => ({ index: i + 1, role: p.text.match(/Assigned role: (\w+)/)?.[1] || 'inside', description: 'Synthetic per-photo description.' }));
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ ...(batch ? { photos } : { role: 'inside' }), label: 'Fixture fasteners', summary: 'Synthetic browser acceptance result, not a real image analysis.', keywords: ['fixture', 'screws'], uncertainties: 'Fixture output only.' }) }, finish_reason: 'stop' }] }));
  }
  if (req.headers['x-api-key'] !== 'fixture-photo-key') { res.writeHead(403); return res.end('{}'); }
  res.setHeader('Content-Type', 'application/json');
  if (req.url === '/api/albums') return res.end(JSON.stringify([{ id: 'fixture-album', albumName: 'Browser acceptance fixtures', assetCount: assets.length }]));
  if (req.url === '/api/search/metadata' && req.method === 'POST') {
    req.resume(); return res.end(JSON.stringify({ assets: { items: assets, nextPage: null } }));
  }
  if (req.url.startsWith('/api/assets/')) { res.setHeader('Content-Type', 'image/png'); return res.end(png); }
  res.writeHead(404); res.end('{}');
});
source.listen(0, '127.0.0.1'); await once(source, 'listening');
const store = new Store(':memory:');
store.writeSettings({ immich: { provider: 'immich', baseUrl: `http://127.0.0.1:${source.address().port}`, apiKey: 'fixture-photo-key', accessMode: 'apiKey', albumId: 'fixture-album' }, aiWorkspace: {
  connections: [{ id: 'fixture', name: 'Browser fixture service', provider: 'compatible', baseUrl: `http://127.0.0.1:${source.address().port}/v1` }],
  imageInventory: { connectionId: 'fixture', model: 'fixture-vision', language: 'en', extraInstructions: '' }
} });
const app = createApp({ store, env: { STORAGE_ADMIN_KEY: 'ui-fixture-admin', STORAGE_API_KEY: 'ui-fixture-read' } });
app.listen(Number(process.env.FIXTURE_PORT || 3212), '127.0.0.1', () => console.log(`Isolated browser fixture listening on http://127.0.0.1:${app.address().port}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
  app.closeAllConnections(); source.closeAllConnections();
  app.close(() => source.close(() => { store.close(); process.exit(0); }));
});
