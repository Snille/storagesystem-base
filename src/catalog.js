import { createHmac, randomBytes } from 'node:crypto';
import { Settings, sourceRevision } from './settings.js';
import { InputError, object, text } from './validation.js';
import { currentSession } from './inventory.js';
import { equal } from './auth.js';

const MAX_PAGES = 100;
const PAGE_SIZE = 200;

export class Catalog {
  constructor(store, photos, inventory) {
    this.store = store; this.photos = photos; this.inventory = inventory;
    this.settings = new Settings(store); this.signingKey = randomBytes(32);
    this.cache = null;
  }

  config() {
    const config = this.settings.source();
    if (config.provider && !['immich', 'photoprism'].includes(config.provider)) throw new InputError('This photo provider is not implemented.', 503);
    if (!config.baseUrl) throw new InputError('Save a photo server URL in Settings first.', 503);
    const credential = config.accessMode === 'shareKey' ? config.shareKey : config.apiKey;
    if (!credential) throw new InputError('Configure photo source credentials in Settings first.', 503);
    return config;
  }

  async request(config, path, { method = 'GET', body } = {}) {
    const headers = {}; let url = config.baseUrl.replace(/\/+$/, '') + path;
    if (config.provider === 'photoprism') headers.Authorization = `Bearer ${config.apiKey}`;
    else if (config.accessMode === 'shareKey') url += `${path.includes('?') ? '&' : '?'}key=${encodeURIComponent(config.shareKey)}`;
    else headers['x-api-key'] = config.apiKey;
    if (body) headers['content-type'] = 'application/json';
    try {
      const response = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined, redirect: 'error', signal: AbortSignal.timeout(15000) });
      if (!response.ok) {
        await response.body?.cancel();
        const message = [401, 403].includes(response.status) ? 'Photo source rejected access. Check the key and its album/image read permissions.'
          : response.status === 404 ? 'Album or photo source endpoint was not found.'
          : response.status === 400 ? 'Photo source rejected the album request. Check album access and provider settings.' : 'Photo source request failed.';
        throw new InputError(message, 502);
      }
      const chunks = []; let bytes = 0;
      for await (const chunk of response.body) {
        bytes += chunk.length;
        if (bytes > 10 * 1024 * 1024) throw new InputError('Photo source metadata response exceeds 10 MiB.', 502);
        chunks.push(chunk);
      }
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch (error) {
      if (error instanceof InputError) throw error;
      throw new InputError('Photo source could not be reached or returned invalid metadata.', 502);
    }
  }

  assertCurrent(config) {
    if (sourceRevision(config) !== sourceRevision(this.settings.source())) throw new InputError('Photo settings changed. Reload the album and try again.', 409);
  }

  async albums() {
    const config = this.config(); let albums;
    if (config.provider === 'photoprism') {
      albums = []; let offset = 0;
      for (let page = 0; page < MAX_PAGES; page++) {
        const rows = await this.request(config, `/api/v1/albums?count=${PAGE_SIZE}&offset=${offset}&order=title`);
        if (!Array.isArray(rows)) throw new InputError('Invalid album list returned by the photo source.', 502);
        albums.push(...rows.map(a => ({ id: a.UID, label: a.Title || a.UID, assetCount: a.PhotoCount || 0 })));
        if (rows.length < PAGE_SIZE) break;
        if (page === MAX_PAGES - 1) throw new InputError('Too many albums to list in one request.', 502);
        offset += PAGE_SIZE;
      }
    } else if (config.accessMode === 'shareKey') {
      const shared = await this.request(config, '/api/shared-links/me');
      albums = shared.album ? [{ id: shared.album.id, label: shared.album.albumName || shared.album.id, assetCount: shared.assets?.length || 0 }] : [];
    } else {
      const rows = await this.request(config, '/api/albums');
      if (!Array.isArray(rows)) throw new InputError('Invalid album list returned by the photo source.', 502);
      albums = rows.map(a => ({ id: a.id, label: a.albumName || a.id, assetCount: a.assetCount || 0 }));
    }
    this.assertCurrent(config);
    return { albums: albums.filter(a => typeof a.id === 'string' && a.id), sourceRevision: sourceRevision(config) };
  }

  async assets(config = this.config(), { refresh = false } = {}) {
    if (!config.albumId) throw new InputError('Choose and save an album in Settings first.', 400);
    const revision = sourceRevision(config);
    if (!refresh && this.cache?.revision === revision && this.cache.expires > Date.now()) return this.cache.assets;
    const assets = []; const pages = new Set();
    if (config.provider === 'photoprism') {
      for (let page = 0; page < MAX_PAGES; page++) {
        const params = new URLSearchParams({ s: config.albumId, count: String(PAGE_SIZE), offset: String(page * PAGE_SIZE), order: 'oldest', merged: 'true', q: 'primary:true' });
        const rows = await this.request(config, `/api/v1/photos?${params}`);
        if (!Array.isArray(rows)) throw new InputError('Invalid album metadata.', 502);
        assets.push(...rows.map(p => ({ id: p.UID, fileName: p.OriginalName || p.FileName?.split(/[\\/]/).pop() || p.UID, type: p.Type === 'video' ? 'VIDEO' : 'IMAGE', capturedAt: p.TakenAt || '' })));
        if (rows.length < PAGE_SIZE) break;
        if (page === MAX_PAGES - 1) throw new InputError('Album exceeds the supported 20000 photo limit.', 502);
      }
    } else if (config.accessMode === 'shareKey') {
      const shared = await this.request(config, '/api/shared-links/me');
      if (shared.album?.id !== config.albumId) throw new InputError('The shared link does not refer to the selected album.', 409);
      if (!Array.isArray(shared.assets)) throw new InputError('The shared link returned no asset list.', 502);
      assets.push(...shared.assets.map(p => ({ id: p.id, fileName: p.originalFileName || p.id, type: p.type, capturedAt: p.fileCreatedAt || '' })));
    } else {
      let page = 1;
      for (let count = 0; count < MAX_PAGES; count++) {
        if (pages.has(String(page))) throw new InputError('Photo source returned a repeated pagination cursor.', 502);
        pages.add(String(page));
        const result = await this.request(config, '/api/search/metadata', { method: 'POST', body: { albumIds: [config.albumId], size: PAGE_SIZE, page: Number(page) } });
        if (!Array.isArray(result.assets?.items)) throw new InputError('Invalid album metadata.', 502);
        assets.push(...result.assets.items.map(p => ({ id: p.id, fileName: p.originalFileName || p.id, type: p.type, capturedAt: p.fileCreatedAt || '' })));
        const next = result.assets.nextPage;
        if (!next) break;
        if (count === MAX_PAGES - 1) throw new InputError('Album exceeds the supported 20000 photo limit.', 502);
        if (!Number.isInteger(Number(next)) || Number(next) < 1) throw new InputError('Invalid photo source pagination cursor.', 502);
        page = next;
      }
    }
    this.assertCurrent(config);
    const result = [...new Map(assets.filter(a => typeof a.id === 'string' && a.id && a.type === 'IMAGE').map(a => [a.id, a])).values()];
    this.cache = { revision, assets: result, expires: Date.now() + 10000 };
    return result;
  }

  grant(asset, expires, revision, variant = 'thumbnail') {
    return createHmac('sha256', this.signingKey).update(JSON.stringify([asset, expires, revision, variant])).digest('base64url');
  }

  // The album cover is the overview image, not a box photo, so album choices leave it out
  // unless a box already uses it. The cover lookup is cached like the asset list.
  async coverAssetId(config, refresh = false) {
    const revision = sourceRevision(config);
    if (!refresh && this.coverCache?.revision === revision && this.coverCache.expires > Date.now()) return this.coverCache.id;
    // Without cover information the album still lists every photo.
    const id = await this.overviewAlbum(config).then(album => album?.albumThumbnailAssetId, () => '');
    this.coverCache = { revision, id: typeof id === 'string' ? id : '', expires: Date.now() + 10000 };
    return this.coverCache.id;
  }
  async overviewAlbum(config) {
    if (config.provider === 'photoprism' || !config.albumId) return null;
    const album = config.accessMode === 'shareKey' ? (await this.request(config, '/api/shared-links/me')).album
      : await this.request(config, `/api/albums/${encodeURIComponent(config.albumId)}?withoutAssets=true`);
    this.assertCurrent(config);
    return album?.id === config.albumId ? album : null;
  }

  async album(refresh = false) {
    const config = this.config(); const revision = sourceRevision(config);
    const [all, cover] = await Promise.all([this.assets(config, { refresh }), this.coverAssetId(config, refresh)]);
    const used = new Set(this.store.read().photos.map(p => p.immichAssetId));
    const assets = all.filter(a => a.id !== cover || used.has(a.id));
    const data = this.store.read(); const sessionBoxes = new Map(data.boxes.map(b => [currentSession(data, b.boxId)?.sessionId, b.boxId]));
    const expires = String(Date.now() + 15 * 60 * 1000);
    const imageUrl = (asset, variant) => `/api/album-preview/${encodeURIComponent(asset)}?variant=${variant}&expires=${expires}&revision=${revision}&grant=${this.grant(asset, expires, revision, variant)}`;
    return { sourceRevision: revision, albumId: config.albumId, assets: assets.map(a => ({
      ...a, assignedBoxIds: [...new Set(data.photos.filter(p => p.immichAssetId === a.id && sessionBoxes.has(p.sessionId)).map(p => sessionBoxes.get(p.sessionId)))],
      thumbnailUrl: imageUrl(a.id, 'thumbnail'), previewUrl: imageUrl(a.id, 'preview'), originalUrl: imageUrl(a.id, 'original')
    })) };
  }

  // The album cover chosen in Immich is the workshop overview image on the start page.
  async overview() {
    const config = this.config(); const album = await this.overviewAlbum(config);
    const id = typeof album?.albumThumbnailAssetId === 'string' ? album.albumThumbnailAssetId : '';
    if (!id) return { image: null };
    const revision = sourceRevision(config), expires = String(Date.now() + 15 * 60 * 1000);
    const imageUrl = variant => `/api/album-preview/${encodeURIComponent(id)}?variant=${variant}&expires=${expires}&revision=${revision}&grant=${this.grant(id, expires, revision, variant)}`;
    return { image: { assetId: id, albumName: typeof album.albumName === 'string' ? album.albumName : '', previewUrl: imageUrl('preview'), originalUrl: imageUrl('original') },
      points: this.settings.overviewPoints(id) };
  }

  async preview(asset, url) {
    const expires = url.searchParams.get('expires') || ''; const revision = url.searchParams.get('revision') || '';
    const variant = url.searchParams.get('variant') || 'thumbnail';
    if (!/^\d+$/.test(expires) || Number(expires) <= Date.now() || Number(expires) > Date.now() + 15 * 60 * 1000
      || !['thumbnail', 'preview', 'original'].includes(variant)
      || !equal(url.searchParams.get('grant') || '', this.grant(asset, expires, revision, variant))
      || revision !== sourceRevision(this.settings.source())) throw new InputError('Album preview expired. Reload the album.', 401);
    return this.photos.fetch(asset, variant);
  }

  async saveSession(input) {
    object(input); object(input.box, 'box');
    if (!Array.isArray(input.photos || [])) throw new InputError('photos must be an array.');
    const photos = input.photos || []; const ids = new Set();
    for (const photo of photos) {
      object(photo, 'photo'); text(photo.immichAssetId, 'immichAssetId');
      if (ids.has(photo.immichAssetId)) throw new InputError('The same image cannot be added twice to a session.');
      ids.add(photo.immichAssetId);
    }
    const data = this.store.read(); const retainedSession = currentSession(data, input.box.boxId)?.sessionId;
    const retained = new Set(data.photos.filter(p => p.sessionId === retainedSession).map(p => p.immichAssetId));
    const added = photos.filter(p => !retained.has(p.immichAssetId));
    let config;
    if (added.length) {
      config = this.config();
      if (input.photoSourceRevision !== sourceRevision(config)) throw new InputError('Reload the album before saving selected photos.', 409);
      const assets = new Map((await this.assets(config, { refresh: true })).map(a => [a.id, a]));
      for (const photo of added) {
        const asset = assets.get(photo.immichAssetId);
        if (!asset) throw new InputError('A selected image is no longer in the configured album.', 409);
        photo.capturedAt = asset.capturedAt; photo.originalFileName = asset.fileName;
      }
      this.assertCurrent(config);
    }
    // Recheck assignments after network I/O. No await occurs between this check and the write.
    const latest = this.store.read(); const owners = new Map(latest.boxes.map(b => [currentSession(latest, b.boxId)?.sessionId, b.boxId]));
    for (const photo of photos) {
      if (latest.photos.some(p => p.immichAssetId === photo.immichAssetId && owners.has(p.sessionId) && owners.get(p.sessionId) !== input.box.boxId)) throw new InputError('A selected image is already linked to another box.', 409);
    }
    return this.inventory.save(input);
  }
}
