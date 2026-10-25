import { t } from './i18n.js';

// The page background and accent colour are public and applied before anyone enters a management key.
let state = null;
const $ = id => document.getElementById(id);
const imageUrl = revision => `/api/appearance/background-image?v=${revision}`;
const defaultAccent = '#95c200';
const accents = [['#95c200', 'Green'], ['#2fb8ff', 'Blue'], ['#1fc7b0', 'Teal'], ['#f5c400', 'Yellow'], ['#ff8a2a', 'Orange'], ['#f0505a', 'Red'], ['#ff6fb5', 'Pink'], ['#a77bff', 'Purple']];

// Text on the accent colour is dark or white, whichever contrasts more.
function inkFor(hex) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return (luminance + 0.05) / 0.0576 >= 1.05 / (luminance + 0.05) ? '#101800' : '#ffffff';
}

function applyAccent(hex) {
  const root = document.documentElement;
  if (hex && hex !== defaultAccent) { root.style.setProperty('--accent', hex); root.style.setProperty('--ink', inkFor(hex)); }
  else { root.style.removeProperty('--accent'); root.style.removeProperty('--ink'); }
}

export function applyAppearance(next) {
  state = next; const root = document.documentElement;
  root.dataset.background = next.background;
  if (next.background === 'custom' && next.imageRevision) root.style.setProperty('--page-image', `url("${imageUrl(next.imageRevision)}")`);
  else root.style.removeProperty('--page-image');
  applyAccent(next.accent);
}

export async function loadAppearance() {
  try { const response = await fetch('/api/appearance'); if (response.ok) applyAppearance(await response.json()); } catch { /* The page works without a background. */ }
}

export function mountAppearance(request) {
  const status = (id, text, error = false) => { $(id).textContent = text; $(id).classList.toggle('error', error); };
  for (const [hex, name] of accents) {
    const label = document.createElement('label'); label.className = 'accent-choice'; label.title = t(name); label.style.setProperty('--swatch', hex);
    const input = document.createElement('input'); input.type = 'radio'; input.name = 'accent'; input.value = hex; input.setAttribute('aria-label', t(name));
    label.append(input); $('accent-choices').append(label);
  }
  function show() {
    for (const input of document.querySelectorAll('input[name="background"]')) input.checked = input.value === state.background;
    $('background-custom').disabled = !state.imageRevision; $('background-remove').disabled = !state.imageRevision;
    if (state.imageRevision) $('background-custom-preview').src = imageUrl(state.imageRevision); else $('background-custom-preview').removeAttribute('src');
    for (const input of document.querySelectorAll('input[name="accent"]')) input.checked = input.value === state.accent;
    $('accent-color').value = state.accent; $('accent-default').disabled = state.accent === defaultAccent;
  }
  async function save(change, statusId = 'background-status', done = 'Background saved.') {
    try {
      const response = await request('appearance', { method: 'PUT', body: JSON.stringify({ revision: state.revision, ...change }) });
      applyAppearance(await response.json()); show(); status(statusId, t(done));
    } catch (error) { status(statusId, error.message, true); await loadAppearance(); show(); }
  }
  const saveAccent = accent => save({ accent }, 'accent-status', 'Accent colour saved.');
  for (const input of document.querySelectorAll('input[name="background"]')) input.addEventListener('change', () => save({ background: input.value }));
  for (const input of document.querySelectorAll('input[name="accent"]')) input.addEventListener('change', () => saveAccent(input.value));
  // The colour picker previews while it moves and saves when it closes.
  $('accent-color').addEventListener('input', () => applyAccent($('accent-color').value));
  $('accent-color').addEventListener('change', () => saveAccent($('accent-color').value));
  $('accent-default').addEventListener('click', () => saveAccent(null));
  $('background-file').addEventListener('change', async () => {
    const file = $('background-file').files[0]; $('background-file').value = '';
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { status('background-status', t('Use a JPEG, PNG or WebP image of at most 5 MiB.'), true); return; }
    const bytes = new Uint8Array(await file.arrayBuffer()); let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    status('background-status', t('Uploading image…')); await save({ image: { mime: file.type, data: btoa(binary) } });
  });
  $('background-remove').addEventListener('click', () => save({ clearImage: true }));
  return { async refresh() { await loadAppearance(); status('background-status', ''); status('accent-status', ''); if (state) show(); } };
}
