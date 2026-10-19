import { InputError } from './validation.js';

export class Photos {
  constructor(store) { this.store = store; }

  async fetch(asset, variant, config = this.store.settings().immich) {
    if (!config?.baseUrl) throw new InputError('Photo source is not configured.', 503);
    const base = config.baseUrl.replace(/\/+$/, '');
    const id = encodeURIComponent(asset);
    const headers = {}; const query = new URLSearchParams();
    let url;
    if (config.provider === 'photoprism') {
      if (!config.apiKey) throw new InputError('PhotoPrism token is not configured.', 503);
      headers.Authorization = `Bearer ${config.apiKey}`;
      if (variant === 'original') url = `${base}/api/v1/photos/${id}/dl`;
      else {
        const q = new URLSearchParams({ count: '1', offset: '0', merged: 'true', q: `uid:${asset} primary:true` });
        const response = await fetch(`${base}/api/v1/photos?${q}`, { headers, signal: AbortSignal.timeout(15000), redirect: 'error' });
        if (!response.ok) throw new InputError('Photo source lookup failed.', 502);
        const rows = await response.json(); const photo = rows?.[0];
        const hash = photo?.Files?.find(f => f.Primary)?.Hash || photo?.Files?.[0]?.Hash || photo?.Hash;
        const token = response.headers.get('x-preview-token');
        if (!hash || !token) throw new InputError('Photo preview is unavailable.', 404);
        url = `${base}/api/v1/t/${encodeURIComponent(hash)}/${encodeURIComponent(token)}/tile_500`;
      }
    } else if (!config.provider || config.provider === 'immich') {
      if (config.accessMode === 'shareKey') {
        if (!config.shareKey) throw new InputError('Immich share key is not configured.', 503);
        query.set('key', config.shareKey);
      } else {
        if (!config.apiKey) throw new InputError('Immich API key is not configured.', 503);
        headers['x-api-key'] = config.apiKey;
      }
      const preview = ['thumbnail', 'analysis', 'preview'].includes(variant);
      query.set(preview ? 'size' : 'edited', preview ? (variant === 'thumbnail' ? 'thumbnail' : 'preview') : 'true');
      url = `${base}/api/assets/${id}/${preview ? 'thumbnail' : 'original'}?${query}`;
    } else throw new InputError('This photo provider is not implemented.', 503);
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(20000), redirect: 'error' });
    if (!response.ok) throw new InputError('Photo source could not return the image.', response.status === 404 ? 404 : 502);
    const mime = (response.headers.get('content-type') || '').split(';')[0];
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'].includes(mime)) {
      await response.body?.cancel(); throw new InputError('Unsupported photo content type.', 502);
    }
    const max = (variant === 'thumbnail' ? 2 : ['analysis', 'preview'].includes(variant) ? 8 : 32) * 1024 * 1024;
    const chunks = []; let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > max) throw new InputError('Photo exceeds the size limit.', 413);
      chunks.push(chunk);
    }
    return { bytes: Buffer.concat(chunks), mime };
  }
}
