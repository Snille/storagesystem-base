import { t } from './i18n.js';

// Public base URL and public API key. Keys are never shown after saving; only their source is.
export function mountSecurity(request, message) {
  const $ = id => document.getElementById(id);
  let state;
  function show() {
    $('security-base-url').value = state.appBaseUrlFromEnvironment ? state.environmentBaseUrl : state.appBaseUrl;
    $('security-base-url').disabled = state.appBaseUrlFromEnvironment;
    $('security-base-url-note').textContent = t(state.appBaseUrlFromEnvironment
      ? 'The server sets this address with APP_BASE_URL. Change it there.' : 'Photo links sent to Home Assistant start with this address.');
    $('security-key-status').textContent = t({ settings: 'A public API key is saved in this application.',
      environment: 'The public API key comes from the server setting STORAGE_API_KEY.', none: 'No public API key is set. Anyone on the network can read the inventory.' }[state.publicKeySource]);
    $('security-clear-key').disabled = state.publicKeySource !== 'settings';
    $('security-key').value = ''; $('security-key').type = 'password'; $('security-show').textContent = t('Show');
    $('security-clear-key').checked = false; $('security-error').textContent = '';
  }
  $('open-security').addEventListener('click', async () => {
    try { state = await (await request('security')).json(); show(); $('security-dialog').showModal(); }
    catch (error) { message(error.message, true); }
  });
  $('close-security').addEventListener('click', () => $('security-dialog').close());
  $('security-generate').addEventListener('click', () => {
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    $('security-key').value = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_');
    $('security-key').type = 'text'; $('security-show').textContent = t('Hide');
  });
  $('security-show').addEventListener('click', () => {
    const hidden = $('security-key').type === 'password';
    $('security-key').type = hidden ? 'text' : 'password'; $('security-show').textContent = t(hidden ? 'Hide' : 'Show');
  });
  $('security-form').addEventListener('submit', async event => {
    event.preventDefault(); $('save-security').disabled = true;
    try {
      const key = $('security-key').value.trim();
      const body = { revision: state.revision, ...(state.appBaseUrlFromEnvironment ? {} : { appBaseUrl: $('security-base-url').value.trim() }),
        ...(key ? { publicApiKey: key } : {}), ...($('security-clear-key').checked ? { clearPublicApiKey: true } : {}) };
      state = await (await request('security', { method: 'PUT', body: JSON.stringify(body) })).json();
      $('security-dialog').close(); message(t(key ? 'Security settings saved. Update the key in Home Assistant.' : 'Security settings saved.'));
    } catch (error) { $('security-error').textContent = t(error.message); }
    finally { $('save-security').disabled = false; }
  });
}
