// Client for the LAN label service, the only program that talks to the label printer.
import { InputError } from './validation.js';

export class LabelServiceClient {
  constructor({ url, apiKey }, { timeoutMs = 15000 } = {}) { this.url = url.replace(/\/+$/, ''); this.apiKey = apiKey; this.timeoutMs = timeoutMs; }
  async request(path, body) {
    let response;
    try {
      response = await fetch(this.url + path, { method: body === undefined ? 'GET' : 'POST', redirect: 'error', signal: AbortSignal.timeout(this.timeoutMs),
        headers: { 'x-api-key': this.apiKey, ...(body === undefined ? {} : { 'content-type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch { throw new InputError('The label service did not answer. Check its address and that it is running.', 502); }
    const text = await response.text();
    let data; try { data = JSON.parse(text); } catch { throw new InputError('The label service returned an invalid response.', 502); }
    if (response.ok) return data;
    // A wrong key is a configuration problem here, not the browser user's authentication.
    if ([401, 403].includes(response.status)) throw new InputError('The label service rejected the key. Check the label service key in the print settings.', 502);
    throw new InputError(typeof data.error === 'string' ? data.error : 'The label service refused the request.', [400, 404, 409, 413, 429].includes(response.status) ? response.status : 502);
  }
  formats() { return this.request('/api/v1/formats'); }
  status() { return this.request('/api/v1/status'); }
  preview(input) { return this.request('/api/v1/previews', input); }
  submit(input) { return this.request('/api/v1/jobs', input); }
  jobs() { return this.request('/api/v1/jobs'); }
  job(id) { return this.request(`/api/v1/jobs/${id}`); }
}
