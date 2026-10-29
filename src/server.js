import { createServer } from 'node:http';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Store } from './store.js';
import { Inventory } from './inventory.js';
import { Photos } from './photos.js';
import { Catalog } from './catalog.js';
import { Ai } from './ai.js';
import { SearchService } from './search-service.js';
import { SearchHistory } from './search-history.js';
import { Printing } from './printing.js';
import { RestoreService } from './restore.js';
import { InputError, object, text } from './validation.js';
import { equal, requestKey, publicKey, assetUrl, signature } from './auth.js';
import { handleMcp } from './mcp.js';

export const version = readFileSync(new URL('../VERSION', import.meta.url), 'utf8').trim();
const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/ai.js', ['ai.js', 'text/javascript; charset=utf-8']],
  ['/appearance.js', ['appearance.js', 'text/javascript; charset=utf-8']],
  ['/overview.js', ['overview.js', 'text/javascript; charset=utf-8']],
  ['/security.js', ['security.js', 'text/javascript; charset=utf-8']],
  ['/search-settings.js', ['search-settings.js', 'text/javascript; charset=utf-8']],
  ['/printing.js', ['printing.js', 'text/javascript; charset=utf-8']],
  ['/box-draft.js', ['box-draft.js', 'text/javascript; charset=utf-8']],
  ['/location-editor.js', ['location-editor.js', 'text/javascript; charset=utf-8']],
  ['/storage-map.js', ['storage-map.js', 'text/javascript; charset=utf-8']],
  ['/i18n.js', ['i18n.js', 'text/javascript; charset=utf-8']],
  ['/locales/en.js', ['locales/en.js', 'text/javascript; charset=utf-8']],
  ['/locales/sv.js', ['locales/sv.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
  ['/favicon.ico', ['favicon.ico', 'image/x-icon']],
  ['/favicon-32.png', ['favicon-32.png', 'image/png']],
  ['/apple-touch-icon.png', ['apple-touch-icon.png', 'image/png']],
  ['/vendor/pannellum/pannellum.js', ['vendor/pannellum/pannellum.js', 'text/javascript; charset=utf-8']],
  ['/vendor/pannellum/pannellum.css', ['vendor/pannellum/pannellum.css', 'text/css; charset=utf-8']],
  ...['hills', 'pegboard', 'blueprint'].map(name => [`/backgrounds/${name}.svg`, [`backgrounds/${name}.svg`, 'image/svg+xml']])
]);

async function body(req) {
  const chunks = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 10 * 1024 * 1024) throw new InputError('Request exceeds 10 MiB.', 413);
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new InputError('Invalid JSON.'); }
}

export function createApp({ store, env = process.env }) {
  const inventory = new Inventory(store); const photos = new Photos(store);
  const catalog = new Catalog(store, photos, inventory);
  const ai = new Ai(store, catalog, photos);
  const search = new SearchService(inventory, env);
  const history = new SearchHistory(store);
  const printing = new Printing(inventory, { env });
  const restoring = new RestoreService(store);
  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
    // data: and blob: images are for the vendored panorama viewer's icons and loaded panoramas.
    res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: blob: http: https:; style-src 'self'; script-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    const json = (value, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); };
    try {
      const url = new URL(req.url, 'http://localhost'); const path = url.pathname;
      if (path === '/api/interface-language' && req.method === 'GET') return json({ language: catalog.settings.languages().uiLanguage });
      if (path === '/api/appearance' && req.method === 'GET') return json(catalog.settings.appearance());
      if (path === '/api/appearance/background-image' && req.method === 'GET') {
        const image = store.media('background');
        if (!image) return json({ error: 'No background image.' }, 404);
        res.writeHead(200, { 'Content-Type': image.mime, 'Content-Length': image.data.length }); return res.end(image.data);
      }
      if (path === '/locations.js' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
        return res.end(readFileSync(new URL('./locations.js', import.meta.url)));
      }
      if (path === '/healthz' && req.method === 'GET') {
        store.db.prepare('SELECT 1').get(); return json({ ok: true, version });
      }
      if (assets.has(path) && req.method === 'GET') {
        const [file, type] = assets.get(path);
        res.writeHead(200, { 'Content-Type': type });
        const content = readFileSync(new URL(`../web/${file}`, import.meta.url));
        // VERSION is the only version source; the page header shows it.
        return res.end(file === 'index.html' ? content.toString('utf8').replaceAll('{{version}}', version) : content);
      }
      const previewMatch = path.match(/^\/api\/album-preview\/([^/]+)$/);
      if (previewMatch && req.method === 'GET') {
        const { bytes, mime } = await catalog.preview(decodeURIComponent(previewMatch[1]), url);
        res.writeHead(200, { 'Content-Type': mime }); return res.end(bytes);
      }
      const admin = path.startsWith('/api/manage/');
      if (!admin && !path.startsWith('/api/public/') && path !== '/api/mcp') throw new InputError('Not found.', 404);
      const allowed = path === '/api/mcp' || path === '/api/public/ask' ? 'POST'
        : path === '/api/public/health' || path === '/api/public/search' || /^\/api\/public\/(boxes\/[^/]+|assets\/[^/]+\/(thumbnail|original|preview))$/.test(path) ? 'GET' : null;
      if (allowed && req.method !== allowed) {
        res.writeHead(405, { Allow: allowed }); return res.end();
      }
      const key = publicKey(store, env);
      const imageMatch = path.match(/^\/api\/public\/assets\/([^/]+)\/(thumbnail|original|preview)$/);
      // Hosts this application answers to. A configured list also stops DNS rebinding: a foreign
      // name pointed at this server cannot read or change data through a visitor's browser.
      // The check applies only when APP_ALLOWED_HOSTS is set, so existing deployments keep working.
      const listed = (env.APP_ALLOWED_HOSTS || '').split(',').map(h => h.trim().toLowerCase()).filter(Boolean);
      const hosts = listed.length ? [...listed, ...(env.APP_BASE_URL ? [new URL(env.APP_BASE_URL).host.toLowerCase()] : [])] : [];
      if (hosts.length && !hosts.includes(String(req.headers.host).toLowerCase())) throw new InputError('Host is not allowed.', 403);
      // Open management trusts the network and the proxy in front (for example Authelia), like the
      // reference application; the host list and the origin check below still block other websites.
      const open = admin && env.STORAGE_MANAGEMENT_ACCESS === 'open';
      if (open && !hosts.length) throw new InputError('Open management requires APP_ALLOWED_HOSTS.', 503);
      const expected = admin ? env.STORAGE_ADMIN_KEY?.trim() : key;
      if (admin && !expected && !open) throw new InputError('Management is disabled. Configure STORAGE_ADMIN_KEY.', 503);
      const authenticated = open || !expected || equal(requestKey(req, url, !admin), expected);
      const signed = imageMatch && key && equal(url.searchParams.get('sig') || '', signature(decodeURIComponent(imageMatch[1]), imageMatch[2], key));
      if (!authenticated && !signed) throw new InputError('Invalid or missing API key.', 401);
      if (req.headers.origin) {
        const allowed = hosts.length ? hosts : [new URL(env.APP_BASE_URL || `http://${req.headers.host}`).host.toLowerCase()];
        if (!allowed.includes(new URL(req.headers.origin).host.toLowerCase())) throw new InputError('Origin is not allowed.', 403);
      }
      const base = (env.APP_BASE_URL || store.settings().security?.appBaseUrl || '').replace(/\/+$/, '');
      const withUrls = box => ({ ...box, photos: box.photos.map(p => ({ ...p, thumbnailUrl: assetUrl(p.immichAssetId, 'thumbnail', key, base), previewUrl: assetUrl(p.immichAssetId, 'preview', key, base), originalUrl: assetUrl(p.immichAssetId, 'original', key, base) })) });
      const lang = url.searchParams.get('lang') || undefined;
      const method = req.method;
      if (path === '/api/manage/printing' && method === 'GET') return json(printing.view());
      if (path === '/api/manage/printing' && method === 'PUT') return json(printing.save(await body(req)));
      if (path === '/api/manage/printing/status' && method === 'GET') return json(await printing.status());
      if (path === '/api/manage/printing/templates' && method === 'GET') return json(await printing.templates());
      if (path === '/api/manage/printing/templates' && method === 'PUT') return json({ functions: printing.saveFunctions(await body(req)) });
      if (path === '/api/manage/printing/preview' && method === 'POST') return json(await printing.preview(await body(req), lang));
      if (path === '/api/manage/printing/submit' && method === 'POST') return json(await printing.submit(await body(req)));
      if (path === '/api/manage/printing/jobs' && method === 'GET') return json({ jobs: await printing.jobs() });
      const printJobMatch = path.match(/^\/api\/manage\/printing\/jobs\/([a-f0-9-]{36})$/);
      if (printJobMatch && method === 'GET') return json(await printing.job(printJobMatch[1]));
      if (path === '/api/manage/search-settings' && method === 'GET') return json(search.settings.view());
      if (path === '/api/manage/search-history' && method === 'GET') return json(history.list({
        before: url.searchParams.get('before') ?? undefined, source: url.searchParams.get('source') || undefined, query: url.searchParams.get('q') || ''
      }));
      if (path === '/api/manage/search-settings' && method === 'PUT') return json(search.settings.save(await body(req)));
      if (path === '/api/manage/search-settings/models' && method === 'POST') return json(await search.settings.models(await body(req)));
      if (path === '/api/manage/semantic' && method === 'GET') return json(search.status());
      if (path === '/api/manage/semantic/rebuild' && method === 'POST') {
        return json(search.retry(), 202);
      }
      if (path === '/api/manage/semantic/preview' && method === 'POST') {
        const input = object(await body(req)); text(input.query, 'query');
        const preview = await history.run({ source: 'preview', mode: 'preview', query: input.query, language: inventory.language(lang) }, () => search.preview(input, lang));
        return json({ ...preview, matches: preview.matches.map(withUrls), lexicalFallback: preview.lexicalFallback.map(withUrls) });
      }
      if (path === '/api/public/health' && method === 'GET') return json({ ok: true, service: 'lagersystem', date: new Date().toISOString() });
      if (path === '/api/public/search' && method === 'GET') {
        const query = url.searchParams.get('q')?.trim() || '';
        if (!query) throw new InputError('The q parameter is required.');
        const result = await history.run({ source: 'api', mode: 'search', query, language: inventory.language(lang) },
          () => search.search(query, Number(url.searchParams.get('limit') ?? 10), lang));
        return json({ ...result, matches: result.matches.map(withUrls) });
      }
      if (path === '/api/public/ask' && method === 'POST') {
        const input = object(await body(req)); text(input.query, 'query'); text(input.language, 'language', { optional: true });
        const result = await history.run({ source: 'api', mode: 'ask', query: input.query.trim(), language: inventory.language(input.language) }, async () => {
          const found = await search.ask(input.query.trim(), input.language);
          const phrased = found.source === 'semantic' ? null : await ai.phraseAnswer(found.query, found.matches, inventory.language(input.language));
          return { ...found, ...(phrased ? { answer: phrased.answer, source: 'ai' } : {}) };
        });
        return json({ ...result, matches: result.matches.map(withUrls) });
      }
      const boxMatch = path.match(/^\/api\/public\/boxes\/([^/]+)$/);
      if (boxMatch && method === 'GET') {
        const box = inventory.get(decodeURIComponent(boxMatch[1]), lang);
        if (!box) throw new InputError(inventory.language(lang) === 'sv' ? 'Lådan kunde inte hittas.' : 'The box could not be found.', 404);
        return json(withUrls(box));
      }
      if (imageMatch && method === 'GET') {
        const asset = decodeURIComponent(imageMatch[1]);
        if (!store.read().photos.some(p => p.immichAssetId === asset)) throw new InputError('Photo not found.', 404);
        const { bytes, mime } = await photos.fetch(asset, imageMatch[2]);
        res.writeHead(200, { 'Content-Type': mime }); return res.end(bytes);
      }
      if (path === '/api/mcp') {
        if (method !== 'POST') { res.setHeader('Allow', 'POST'); res.writeHead(405); return res.end(); }
        let input;
        try { input = await body(req); }
        catch (error) {
          if (error.status === 413) throw error;
          return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error.' } }, 400);
        }
        const list = Array.isArray(input) ? input : [input];
        const results = (await Promise.all(list.map(m => handleMcp(m, inventory, photos, version, history, search)))).filter(Boolean);
        if (!results.length) { res.writeHead(202); return res.end(); }
        return json(Array.isArray(input) ? results : results[0]);
      }
      if (path === '/api/manage/boxes' && method === 'GET') return json({ boxes: inventory.list(lang).map(withUrls) });
      if (path === '/api/manage/positions' && method === 'GET') return json({ positions: inventory.positions(lang) });
      if (path === '/api/manage/storage-map' && method === 'GET') return json({ ...inventory.storageMap(lang), unitPhotos: catalog.unitPhotos() });
      const unitPhotoMatch = path.match(/^\/api\/manage\/storage-units\/([^/]+)\/photo$/);
      if (unitPhotoMatch && method === 'PUT') return json(await catalog.setUnitPhoto(decodeURIComponent(unitPhotoMatch[1]), await body(req)));
      if (path === '/api/manage/positions' && method === 'POST') return json(inventory.addPosition(await body(req), lang));
      const coverMatch = path.match(/^\/api\/manage\/boxes\/([^/]+)\/cover$/);
      if (coverMatch && method === 'PUT') {
        const input = object(await body(req));
        return json(withUrls(inventory.setCover(decodeURIComponent(coverMatch[1]), input.assetId)));
      }
      const labelMatch = path.match(/^\/api\/manage\/boxes\/([^/]+)\/label-template$/);
      if (labelMatch && method === 'PUT') {
        const input = object(await body(req));
        return json(withUrls(inventory.setLabelTemplate(decodeURIComponent(labelMatch[1]), input.templateId)));
      }
      if (path === '/api/manage/search' && method === 'GET') {
        const query = url.searchParams.get('q')?.trim() || '';
        if (!query) throw new InputError('The q parameter is required.');
        const result = await history.run({ source: 'web', mode: 'search', query, language: inventory.language(lang) }, () => search.search(query, 25, lang));
        return json({ ...result, matches: result.matches.map(withUrls) });
      }
      if (path === '/api/manage/settings' && method === 'GET') return json(catalog.settings.view());
      if (path === '/api/manage/security' && method === 'GET') return json(catalog.settings.security(env));
      if (path === '/api/manage/security' && method === 'PUT') return json(catalog.settings.saveSecurity(await body(req), env));
      if (path === '/api/manage/overview' && method === 'GET') return json(await catalog.overview());
      if (path === '/api/manage/overview/points' && method === 'PUT') return json(catalog.settings.saveOverviewPoints(await body(req)));
      if (path === '/api/manage/appearance' && method === 'PUT') return json(catalog.settings.saveBackground(await body(req)));
      if (path === '/api/manage/languages' && method === 'GET') return json(catalog.settings.languages());
      if (path === '/api/manage/languages' && method === 'PUT') return json(catalog.settings.saveLanguages(await body(req)));
      if (path === '/api/manage/ai/settings' && method === 'GET') return json(ai.view());
      if (path === '/api/manage/ai/settings' && method === 'PUT') return json(ai.save(await body(req)));
      if (path === '/api/manage/ai/models' && method === 'POST') return json(await ai.models(await body(req)));
      if (path === '/api/manage/ai/preview' && method === 'POST') return json(await ai.preview(await body(req)));
      if (path === '/api/manage/ai/draft' && method === 'POST') return json(await ai.draft(await body(req)));
      if (path === '/api/manage/settings' && method === 'PUT') return json(catalog.settings.save(await body(req)));
      if (path === '/api/manage/albums' && method === 'GET') return json(await catalog.albums());
      if (path === '/api/manage/album' && method === 'GET') return json(await catalog.album(url.searchParams.get('refresh') === 'true'));
      if (path === '/api/manage/session' && method === 'POST') return json(withUrls(await catalog.saveSession(await body(req))));
      if (path === '/api/manage/audit' && method === 'GET') { const audit = store.audit(); return json(audit, audit.ok ? 200 : 500); }
      if (path === '/api/manage/export' && method === 'GET') {
        res.setHeader('Content-Disposition', 'attachment; filename="inventory.json"'); return json(store.read());
      }
      if (path === '/api/manage/import' && method === 'POST') {
        // This deliberately imports inventory only. Settings with credentials use the offline CLI.
        return json({ imported: store.importLegacy(await body(req)) }, 201);
      }
      // The upload is the raw SQLite file, not JSON.
      if (path === '/api/manage/restore/upload' && method === 'POST') return json(await restoring.upload(req));
      if (path === '/api/manage/restore' && method === 'POST') return json(await restoring.apply(await body(req)));
      if (path === '/api/manage/backup' && method === 'GET') {
        const temp = mkdtempSync(join(tmpdir(), 'storage-backup-'));
        try {
          const file = join(temp, 'backup.sqlite'); await store.backup(file);
          res.writeHead(200, { 'Content-Type': 'application/vnd.sqlite3', 'Content-Disposition': 'attachment; filename="storage-backup.sqlite"' });
          return res.end(readFileSync(file));
        } finally { rmSync(temp, { recursive: true, force: true }); }
      }
      const historyMatch = path.match(/^\/api\/manage\/history\/([^/]+)$/);
      if (historyMatch && method === 'GET') {
        const boxId = decodeURIComponent(historyMatch[1]);
        if (!inventory.get(boxId)) throw new InputError('Box not found.', 404);
        const data = store.read(); const sessions = data.sessions.filter(s => s.boxId === boxId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        return json({ sessions, photos: data.photos.filter(p => sessions.some(s => s.sessionId === p.sessionId)) });
      }
      throw new InputError('Not found or unsupported method.', 404);
    } catch (error) {
      if (res.headersSent) { res.destroy(); return; }
      if (error instanceof InputError) return json({ error: error.message }, error.status);
      // Never send provider URLs, SQL, credentials, or exception payloads to the browser.
      console.error('Request failed:', error.name);
      return json({ error: 'The request could not be completed.' }, 500);
    }
  });
  server.requestTimeout = 30000; server.headersTimeout = 10000;
  server.once('close', () => { void search.close(); });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const store = new Store(process.env.STORAGE_DB || './data/storage.sqlite');
  const audit = store.audit();
  if (!audit.ok) { console.error('Startup data audit failed.', audit.errors); store.close(); process.exit(1); }
  const app = createApp({ store });
  app.listen(Number(process.env.PORT || 3210), process.env.HOST || '127.0.0.1', () => console.log(`Storage System ${version} listening on port ${app.address().port}.`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => app.close(() => { store.close(); process.exit(0); }));
}
