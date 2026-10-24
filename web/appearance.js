import { t } from './i18n.js';

// The page background is public and applied before anyone enters a management key.
let state = null;
const $ = id => document.getElementById(id);
const imageUrl = revision => `/api/appearance/background-image?v=${revision}`;

export function applyAppearance(next) {
  state = next; const root = document.documentElement;
  root.dataset.background = next.background;
  if (next.background === 'custom' && next.imageRevision) root.style.setProperty('--page-image', `url("${imageUrl(next.imageRevision)}")`);
  else root.style.removeProperty('--page-image');
}

export async function loadAppearance() {
  try { const response = await fetch('/api/appearance'); if (response.ok) applyAppearance(await response.json()); } catch { /* The page works without a background. */ }
}

export function mountAppearance(request) {
  const status = (text, error = false) => { $('background-status').textContent = text; $('background-status').classList.toggle('error', error); };
  function show() {
    for (const input of document.querySelectorAll('input[name="background"]')) input.checked = input.value === state.background;
    $('background-custom').disabled = !state.imageRevision; $('background-remove').disabled = !state.imageRevision;
    if (state.imageRevision) $('background-custom-preview').src = imageUrl(state.imageRevision); else $('background-custom-preview').removeAttribute('src');
  }
  async function save(change) {
    try {
      const response = await request('appearance', { method: 'PUT', body: JSON.stringify({ revision: state.revision, ...change }) });
      applyAppearance(await response.json()); show(); status(t('Background saved.'));
    } catch (error) { status(error.message, true); await loadAppearance(); show(); }
  }
  for (const input of document.querySelectorAll('input[name="background"]')) input.addEventListener('change', () => save({ background: input.value }));
  $('background-file').addEventListener('change', async () => {
    const file = $('background-file').files[0]; $('background-file').value = '';
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { status(t('Use a JPEG, PNG or WebP image of at most 5 MiB.'), true); return; }
    const bytes = new Uint8Array(await file.arrayBuffer()); let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    status(t('Uploading image…')); await save({ image: { mime: file.type, data: btoa(binary) } });
  });
  $('background-remove').addEventListener('click', () => save({ clearImage: true }));
  return { async refresh() { await loadAppearance(); status(''); if (state) show(); } };
}
