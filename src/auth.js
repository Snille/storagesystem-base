import { createHmac, timingSafeEqual } from 'node:crypto';

export function equal(a, b) {
  const left = Buffer.from(a); const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export const signature = (asset, variant, key) => createHmac('sha256', key).update(`public-asset:${variant}:${asset}`).digest('base64url');

export function requestKey(req, url, allowQuery = true) {
  return req.headers['x-api-key']?.trim() || req.headers.authorization?.replace(/^Bearer\s+/i, '').trim()
    || (allowQuery ? url.searchParams.get('key')?.trim() : '') || '';
}

export function publicKey(store, env) {
  return store.settings().security?.publicApiKey?.trim() || env.STORAGE_API_KEY?.trim() || env.LAGERSYSTEM_API_KEY?.trim() || '';
}

export function assetUrl(asset, variant, key, base) {
  return `${base}/api/public/assets/${encodeURIComponent(asset)}/${variant}${key ? `?sig=${signature(asset, variant, key)}` : ''}`;
}
