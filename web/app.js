import { mountLocationEditor } from './location-editor.js';
import { suggestBoxId, parseLocation } from './locations.js';
import { mountAi } from './ai.js';
import { mountBoxDraft } from './box-draft.js';
import { mountStorageMap } from './storage-map.js';
import { mountSearchSettings } from './search-settings.js';
import { mountPrinting } from './printing.js';
import { initializeLanguage, setLanguage, clearLanguageOverride, uiLanguage, t, tr, roleName } from './i18n.js';
import { loadAppearance, mountAppearance } from './appearance.js';
import { mountOverview } from './overview.js';
import { mountSecurity } from './security.js';

await Promise.all([initializeLanguage(), loadAppearance()]);

const $ = id => document.getElementById(id);
let key = ''; let boxes = []; let positions = []; let selected = null;
let sessionPhotos = []; let photoSourceRevision = null;
let aiDraftActive = false;
let aiPhotoSelection = new Set(); let editorGeneration = 0;

function element(tag, content, className) {
  const el = document.createElement(tag);
  if (content !== undefined) el.textContent = content;
  if (className) el.className = className;
  return el;
}

function message(value, error = false) {
  $('message').textContent = t(value); $('message').classList.toggle('error', error);
}

async function request(path, options = {}) {
  if (/^(boxes|search|positions)(\?|$)/.test(path)) path += `${path.includes('?') ? '&' : '?'}lang=${uiLanguage()}`;
  const response = await fetch(`/api/manage/${path}`, { ...options, headers: { 'x-api-key': key, ...(options.body ? { 'content-type': 'application/json' } : {}), ...options.headers } });
  if (!response.ok) { const payload = await response.json(); const error = new Error(payload.error || t('The request failed.')); error.status = response.status; throw error; }
  return response;
}

let languageState;
const appearance = mountAppearance(request);
$('open-languages').addEventListener('click', async () => {
  if (!key) { message(t('Open inventory before changing shared language settings.'), true); return; }
  try {
    languageState = await (await request('languages')).json(); await appearance.refresh();
    $('ui-language').value = languageState.uiLanguage; $('response-language').value = languageState.responseLanguage;
    $('languages-error').textContent = ''; $('languages-dialog').showModal();
  } catch (error) { message(error.message, true); }
});
$('close-languages').addEventListener('click', () => $('languages-dialog').close());
$('languages-form').addEventListener('submit', async event => {
  event.preventDefault(); $('save-languages').disabled = true;
  try {
    languageState = await (await request('languages', { method: 'PUT', body: JSON.stringify({ revision: languageState.revision, uiLanguage: $('ui-language').value, responseLanguage: $('response-language').value }) })).json();
    clearLanguageOverride(); setLanguage(languageState.uiLanguage); $('languages-dialog').close(); await load(); message(t('Language settings saved.'));
  } catch (error) { $('languages-error').textContent = error.message; }
  finally { $('save-languages').disabled = false; }
});

mountAi(request, message, () => showAlbum());
mountSearchSettings(request, message);
const printing = mountPrinting(request, message);
mountSecurity(request, message);
const boxDraft = mountBoxDraft(request, draft => {
  if (draft.editorContext) {
    const context = draft.editorContext;
    if (!$('editor').open || context.generation !== editorGeneration || context.fingerprint !== editorFingerprint()) {
      if ($('editor').open) $('editor-ai-status').textContent = t('The editor changed. Analyze the selected photos again before applying a suggestion.');
      else message(t('The editor changed. Analyze the selected photos again before applying a suggestion.'), true);
      return;
    }
    const fields = $('box-form').elements;
    if (draft.updateName || !fields.label.value.trim()) fields.label.value = draft.result.label;
    fields.summary.value = draft.result.summary; fields.keywords.value = draft.result.keywords.join(', ');
    const interpretations = new Map(draft.result.photos.map(p => [p.assetId, p]));
    sessionPhotos = sessionPhotos.map(p => {
      const result = interpretations.get(p.immichAssetId);
      return result ? { ...p, photoRole: result.role, notes: result.description } : p;
    });
    renderSessionPhotos(); $('editor-ai-status').textContent = t('Suggestion applied to this draft. Review the fields, then save the inventory session. Nothing is saved yet.');
    return;
  }
  edit(); aiDraftActive = true;
  $('editor-title').textContent = t('Review AI box draft'); $('ai-editor-note').hidden = false;
  const fields = $('box-form').elements;
  fields.label.value = draft.result.label; fields.summary.value = draft.result.summary; fields.keywords.value = draft.result.keywords.join(', ');
  fields.notes.value = draft.result.uncertainties ? `${t('AI uncertainty to review:')}\n${draft.result.uncertainties}` : '';
  photoSourceRevision = draft.sourceRevision;
  sessionPhotos = draft.result.photos.map(p => ({ immichAssetId: p.assetId, photoRole: p.role, capturedAt: p.capturedAt, originalFileName: p.fileName, notes: p.description, thumbnailUrl: p.thumbnailUrl, previewUrl: p.previewUrl, originalUrl: p.originalUrl }));
  renderSessionPhotos();
});

async function load() {
  const [payload, audit, places] = await Promise.all([
    request('boxes').then(r => r.json()), request('audit').then(r => r.json()), request('positions').then(r => r.json())
  ]);
  boxes = payload.boxes; positions = places.positions;
  $('box-count').textContent = audit.counts.boxes;
  $('session-count').textContent = audit.counts.sessions;
  $('photo-count').textContent = audit.counts.photos;
  // Storage units are counted from where boxes are now, like the reference application.
  const units = { ivar: new Set(), bench: new Set(), cabinet: new Set() };
  for (const box of boxes) { const p = parseLocation(box.locationId, box.boxId); if (p) units[p.kind].add(p.unit); }
  $('unit-count').textContent = units.ivar.size + units.bench.size + units.cabinet.size;
  $('unit-kinds').textContent = tr('{0} shelving · {1} benches · {2} cabinets', units.ivar.size, units.bench.size, units.cabinet.size);
  const withPhotos = boxes.filter(box => box.photos.length).length;
  $('photo-box-count').textContent = withPhotos; $('no-photo-count').textContent = tr('{0} without photos', boxes.length - withPhotos);
  renderPositionFilter();
  $('workspace').hidden = false; $('connect').hidden = true;
  render(); loadOverview();
}

let overviewImage = null; const overview = mountOverview();
async function loadOverview() {
  try { overviewImage = (await (await request('overview')).json()).image; } catch { overviewImage = null; }
  $('overview').hidden = !overviewImage; overview.show(overviewImage);
}
$('overview-open').addEventListener('click', () => openViewer({ label: overviewImage.albumName || t('Overview image'),
  photos: [{ role: 'location', originalUrl: overviewImage.originalUrl, originalFileName: t('Album cover'), immichAssetId: overviewImage.assetId }] }, 0, true));

function positionLabel(position) {
  const label = Object.values(position.location).filter(Boolean).join(' · ');
  return `${label === position.locationId ? position.locationId : `${label} [${position.locationId}]`} · ${tr(position.boxCount === 1 ? '{0} box' : '{0} boxes', position.boxCount)}`;
}

function renderPositionFilter() {
  $('location-count').textContent = positions.length;
  const prior = $('location').value;
  $('location').replaceChildren(new Option(t('All locations'), ''));
  for (const position of positions) $('location').add(new Option(positionLabel(position), position.locationId));
  $('location').value = prior;
}

const locationEditor = mountLocationEditor(() => positions, locationId => {
  if (!selected) $('box-identity').value = suggestBoxId(locationId, boxes.map(b => b.boxId)) || t('Assigned automatically on save');
});

const storageMap = mountStorageMap(request, () => boxes, box => details(box).catch(error => message(error.message, true)), locationId => printing.open({ locationId }));
$('open-storage-map').addEventListener('click', async () => {
  try {
    await load();
    const query = $('search').value.trim();
    const matches = query ? (await (await request(`search?q=${encodeURIComponent(query)}`)).json()).matches.map(box => box.boxId) : null;
    await storageMap.open(matches);
  } catch (error) { message(error.message, true); }
});

const normalized = value => value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
let renderGeneration = 0;
async function render() {
  const generation = ++renderGeneration;
  const query = $('search').value.trim(); const location = $('location').value;
  let visible = boxes;
  // Use the application search service for the same matching as REST and MCP.
  if (query) {
    // The management listing includes full box data, but public search may use a different key.
    // A management search endpoint keeps the read API key separate from this tab's key.
    try { visible = (await (await request(`search?q=${encodeURIComponent(query)}`)).json()).matches; }
    catch (error) { message(error.message, true); return; }
  }
  if (generation !== renderGeneration) return;
  visible = visible.filter(b => !location || b.locationId === location);
  $('boxes').replaceChildren(); $('empty').hidden = boxes.length > 0;
  $('result-count').textContent = query ? tr('{0} matching “{1}”', tr(visible.length === 1 ? '{0} box' : '{0} boxes', visible.length), query) : tr(visible.length === 1 ? '{0} box' : '{0} boxes', visible.length);
  if (!visible.length && boxes.length) $('boxes').append(element('p', t('No boxes match this search. Try another word or location.'), 'muted'));
  for (const box of visible) {
    const card = element('button', undefined, 'box-card'); card.type = 'button';
    const cover = box.photos.find(p => p.immichAssetId === box.coverAssetId);
    if (cover) {
      const image = element('img', undefined, 'box-cover'); image.src = cover.thumbnailUrl; image.alt = tr('Photo of {0}', box.label); image.loading = 'lazy';
      image.addEventListener('error', () => image.replaceWith(element('span', t('Photo unavailable'), 'hint')));
      const frame = element('span', undefined, 'box-cover-frame'); frame.append(image, ...noteMarks(cover).slice(0, 1)); card.append(frame);
    } else card.append(element('span', '▦', 'box-icon'));
    card.append(element('h2', box.label), element('p', box.summary || t('No contents summary yet.')));
    const chips = element('div', undefined, 'chips');
    for (const keyword of box.itemKeywords.slice(0, 5)) chips.append(element('span', keyword, 'chip'));
    card.append(chips, element('div', Object.values(box.location).filter(Boolean).join(' · '), 'place'));
    card.addEventListener('click', () => details(box).catch(error => message(error.message, true)));
    $('boxes').append(card);
  }
}

// A green check marks photos with saved analysis text; the text shows on hover or keyboard focus,
// and in the photo viewer for touch screens.
function noteMarks(photo) {
  if (!photo.notes?.trim()) return [];
  const check = element('span', '✓', 'photo-check'); check.title = t('Analysis text saved'); check.setAttribute('aria-label', t('Analysis text saved'));
  return [check, element('span', photo.notes, 'photo-note')];
}

async function details(box) {
  selected = box; $('detail-title').textContent = box.label;
  const area = $('detail-body'); area.replaceChildren();
  area.append(element('p', Object.values(box.location).filter(Boolean).join(' · '), 'muted'), element('p', box.summary || t('No contents summary.'), 'detail-notes'));
  if (box.boxNotes) area.append(element('p', box.boxNotes, 'detail-notes'));
  area.append(element('p', tr('Box ID: {0}', box.boxId), 'hint'));
  if (box.photos.length) {
    area.append(element('p', t('Open a photo to browse this box’s images. Choose “Use as card image” in the viewer to set its cover.'), 'hint'));
    const photos = element('div', undefined, 'photo-grid');
    for (const [index, photo] of box.photos.entries()) {
      const link = element('button', undefined, 'photo-open'); link.type = 'button'; link.setAttribute('aria-label', tr('View photo {0} of {1}', index + 1, box.label));
      const img = element('img'); img.src = photo.previewUrl || photo.originalUrl; img.alt = tr('{0} photo of {1}', roleName(photo.role), box.label); img.loading = 'lazy';
      img.addEventListener('error', () => { img.replaceWith(element('p', t('Photo unavailable. Check the configured photo source.'), 'hint')); });
      link.append(img, ...noteMarks(photo)); photos.append(link);
      link.addEventListener('click', () => openViewer(box, index));
    }
    area.append(photos);
  }
  const history = (await (await request(`history/${encodeURIComponent(box.boxId)}`)).json()).sessions;
  const historyArea = element('details', undefined, 'inventory-history');
  historyArea.append(element('summary', tr('Inventory history · {0}', history.length)));
  for (const session of history) {
    const row = element('div', undefined, 'history-entry');
    row.append(element('small', `${new Date(session.createdAt).toLocaleString()}${session.isCurrent ? t(' · Current') : ''}`), element('p', session.summary || t('No summary')));
    historyArea.append(row);
  }
  area.append(historyArea);
  $('detail').showModal();
}

let viewerBox; let viewerIndex = 0; let viewerGeneration = 0; let viewerReadOnly = false;
let viewerZoom = 1;
function updateViewerZoom(reset = false) {
  const viewport = $('viewer-image'); const image = viewport.querySelector('img');
  const ready = image?.complete && image.naturalWidth > 0;
  for (const id of ['viewer-zoom-in', 'viewer-zoom-out', 'viewer-actual', 'viewer-fit']) $(id).disabled = !ready;
  if (!ready) { $('viewer-zoom-level').textContent = ''; return; }
  const fit = Math.min(1, viewport.clientWidth / image.naturalWidth, viewport.clientHeight / image.naturalHeight);
  viewerZoom = Math.max(1, Math.min(viewerZoom, Math.max(8, 1 / fit)));
  image.style.width = `${Math.round(image.naturalWidth * fit * viewerZoom)}px`;
  image.style.height = `${Math.round(image.naturalHeight * fit * viewerZoom)}px`;
  image.classList.toggle('is-zoomed', viewerZoom > 1);
  $('viewer-zoom-level').textContent = `${Math.round(fit * viewerZoom * 100)}%${viewerZoom === 1 ? t(' · Fit') : ''}`;
  $('viewer-zoom-out').disabled = $('viewer-fit').disabled = viewerZoom === 1;
  if (reset) { viewport.scrollLeft = 0; viewport.scrollTop = 0; }
}
function changeViewerZoom(value, point) {
  const viewport = $('viewer-image'); const image = viewport.querySelector('img');
  if (!image?.naturalWidth) return;
  const viewportBounds = viewport.getBoundingClientRect(); const before = image.getBoundingClientRect();
  const anchor = point || { x: viewportBounds.left + viewport.clientWidth / 2, y: viewportBounds.top + viewport.clientHeight / 2 };
  const fractionX = Math.max(0, Math.min(1, (anchor.x - before.left) / before.width));
  const fractionY = Math.max(0, Math.min(1, (anchor.y - before.top) / before.height));
  const fit = Math.min(1, viewport.clientWidth / image.naturalWidth, viewport.clientHeight / image.naturalHeight);
  viewerZoom = value === 'fit' ? 1 : value === 'actual' ? 1 / fit : viewerZoom * value;
  updateViewerZoom(value === 'fit');
  if (value !== 'fit') {
    const after = image.getBoundingClientRect();
    viewport.scrollLeft += after.left + fractionX * after.width - anchor.x;
    viewport.scrollTop += after.top + fractionY * after.height - anchor.y;
  }
}
let savingCover = false;
function viewerCoverControls() {
  if (!viewerBox) return;
  $('viewer-cover').hidden = $('viewer-auto-cover').hidden = viewerReadOnly;
  if (viewerReadOnly) return;
  const photo = viewerBox.photos[viewerIndex];
  $('viewer-cover').textContent = photo.immichAssetId === viewerBox.coverAssetId && !viewerBox.coverIsAutomatic ? t('Current card image') : t('Use as card image');
  $('viewer-cover').disabled = savingCover || (photo.immichAssetId === viewerBox.coverAssetId && !viewerBox.coverIsAutomatic);
  $('viewer-auto-cover').disabled = savingCover || viewerBox.coverIsAutomatic;
}
function showViewerPhoto() {
  viewerZoom = 1;
  const generation = ++viewerGeneration; const photo = viewerBox.photos[viewerIndex];
  $('viewer-title').textContent = viewerBox.label;
  $('viewer-caption').textContent = `${viewerIndex + 1} / ${viewerBox.photos.length} · ${roleName(photo.role)} · ${photo.originalFileName || photo.immichAssetId}`;
  $('viewer-status').textContent = t('Loading image…');
  $('viewer-notes').textContent = photo.notes || ''; $('viewer-notes').hidden = !photo.notes?.trim();
  viewerCoverControls();
  $('viewer-previous').disabled = $('viewer-next').disabled = viewerBox.photos.length < 2;
  const image = element('img'); image.alt = tr('{0} photo of {1}', roleName(photo.role), viewerBox.label);
  image.addEventListener('load', () => { if (generation === viewerGeneration) { updateViewerZoom(true); $('viewer-status').textContent = ''; } });
  image.addEventListener('error', () => { if (generation === viewerGeneration) $('viewer-status').textContent = t('Image unavailable. You can still browse the other photos.'); });
  image.draggable = false;
  let pan;
  image.addEventListener('pointerdown', event => {
    if (viewerZoom <= 1 || event.button !== 0 || !event.isPrimary) return;
    const viewport = $('viewer-image');
    pan = { id: event.pointerId, x: event.clientX, y: event.clientY, left: viewport.scrollLeft, top: viewport.scrollTop };
    image.setPointerCapture(event.pointerId);
    image.classList.add('is-dragging');
    event.preventDefault();
  });
  image.addEventListener('pointermove', event => {
    if (!pan || pan.id !== event.pointerId) return;
    const viewport = $('viewer-image');
    viewport.scrollLeft = pan.left - (event.clientX - pan.x);
    viewport.scrollTop = pan.top - (event.clientY - pan.y);
  });
  const endPan = event => {
    if (!pan || pan.id !== event.pointerId) return;
    pan = null; image.classList.remove('is-dragging');
    if (image.hasPointerCapture(event.pointerId)) image.releasePointerCapture(event.pointerId);
  };
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) image.addEventListener(type, endPan);
  image.addEventListener('click', event => { if (viewerZoom === 1) changeViewerZoom('actual', { x: event.clientX, y: event.clientY }); });
  const stage = element('div', undefined, 'viewer-stage'); stage.append(image);
  $('viewer-image').replaceChildren(stage); image.src = photo.originalUrl; updateViewerZoom(true);
}
function openViewer(box, index, readOnly = false) { viewerReadOnly = readOnly; viewerBox = box; viewerIndex = index; $('photo-viewer').showModal(); showViewerPhoto(); }
function moveViewer(offset) { if (viewerBox?.photos.length) { viewerIndex = (viewerIndex + offset + viewerBox.photos.length) % viewerBox.photos.length; showViewerPhoto(); } }
$('viewer-previous').addEventListener('click', () => moveViewer(-1));
$('viewer-next').addEventListener('click', () => moveViewer(1));
$('viewer-close').addEventListener('click', () => $('photo-viewer').close());
for (const [id, value] of [['viewer-zoom-in', 1.5], ['viewer-zoom-out', 1 / 1.5], ['viewer-fit', 'fit'], ['viewer-actual', 'actual']]) $(id).addEventListener('click', () => changeViewerZoom(value));
window.addEventListener('resize', () => { if ($('photo-viewer').open) updateViewerZoom(); });
$('photo-viewer').addEventListener('keydown', event => {
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); moveViewer(event.key === 'ArrowLeft' ? -1 : 1); }
});
$('photo-viewer').addEventListener('close', () => { viewerGeneration++; viewerBox = null; $('viewer-image').replaceChildren(); });
async function saveCover(automatic) {
  if (!viewerBox || viewerReadOnly || savingCover) return;
  savingCover = true; const boxId = viewerBox.boxId;
  $('viewer-cover').disabled = $('viewer-auto-cover').disabled = true;
  try {
    const box = await (await request(`boxes/${encodeURIComponent(boxId)}/cover`, { method: 'PUT', body: JSON.stringify({ assetId: automatic ? null : viewerBox.photos[viewerIndex].immichAssetId }) })).json();
    boxes = boxes.map(b => b.boxId === boxId ? box : b); if (selected?.boxId === boxId) selected = box;
    await render();
    if (viewerBox?.boxId === boxId) { Object.assign(viewerBox, { coverAssetId: box.coverAssetId, coverIsAutomatic: box.coverIsAutomatic }); $('viewer-status').textContent = t('Card image saved.'); }
  } catch (error) { if (viewerBox?.boxId === boxId) { $('viewer-status').textContent = error.message; $('viewer-cover').disabled = $('viewer-auto-cover').disabled = false; } }
  finally { savingCover = false; viewerCoverControls(); }
}
$('viewer-cover').addEventListener('click', () => saveCover(false));
$('viewer-auto-cover').addEventListener('click', () => saveCover(true));

function edit(box = null) {
  editorGeneration++; aiPhotoSelection = new Set();
  aiDraftActive = false; $('ai-editor-note').hidden = true;
  selected = box; $('box-form').reset(); $('save-error').textContent = '';
  $('editor-title').textContent = box ? t('Update box inventory') : t('Add box');
  const fields = $('box-form').elements;
  $('box-identity').value = box?.boxId || t('Assigned automatically on save');
  locationEditor.reset(box?.locationId || ''); fields.label.value = box?.label || '';
  fields.summary.value = box?.summary || ''; fields.notes.value = box?.boxNotes || '';
  fields.keywords.value = box?.itemKeywords.join(', ') || '';
  sessionPhotos = (box?.photos || []).map(p => ({ immichAssetId: p.immichAssetId, photoRole: p.role, capturedAt: p.capturedAt, notes: p.notes, originalFileName: p.originalFileName, thumbnailUrl: p.thumbnailUrl, previewUrl: p.previewUrl, originalUrl: p.originalUrl }));
  photoSourceRevision = null; renderSessionPhotos();
  $('editor').showModal();
}

$('connect-form').addEventListener('submit', async event => {
  event.preventDefault(); key = $('key').value.trim();
  try { await load(); $('key').value = ''; message(''); } catch (error) { message(error.message, true); }
});
$('new-box').addEventListener('click', () => edit()); $('empty-add').addEventListener('click', () => edit());
$('close-editor').addEventListener('click', () => $('editor').close());
$('editor').addEventListener('close', () => { editorGeneration++; });
$('close-detail').addEventListener('click', () => $('detail').close());
$('edit').addEventListener('click', () => { $('detail').close(); edit(selected); });
$('print-label').addEventListener('click', () => { $('detail').close(); printing.open({ boxId: selected.boxId }); });
$('box-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (!locationEditor.validate()) return;
  $('save').disabled = true; $('save').setAttribute('aria-busy', 'true'); $('save-error').textContent = '';
  const form = new FormData(event.target); const boxId = selected?.boxId || '';
  try {
    const payload = {
      box: { boxId, label: form.get('label').trim(), currentLocationId: form.get('currentLocationId').trim(), notes: form.get('notes') },
      session: { boxId, summary: form.get('summary'), notes: selected?.sessionNotes, itemKeywords: form.get('keywords').split(',').map(s => s.trim()).filter(Boolean) },
      // Retain photo associations in the new current session; old sessions stay intact.
      photos: sessionPhotos.map(({ thumbnailUrl, previewUrl, originalUrl, ...photo }) => photo), photoSourceRevision, ...(selected ? { expectedSessionId: selected.sessionId || null } : {}), ...(aiDraftActive ? { expectNewBox: true } : {})
    };
    await request('session', { method: 'POST', body: JSON.stringify(payload) });
    $('editor').close(); await load(); message(t('Inventory session saved.'));
  } catch (error) {
    $('save-error').textContent = t(error.message);
    if (error.status === 409) {
      try { positions = (await (await request('positions')).json()).positions; locationEditor.refresh(); } catch { }
    }
  }
  finally { $('save').disabled = false; $('save').setAttribute('aria-busy', 'false'); }
});
let timer;
$('search').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(render, 150); });
$('location').addEventListener('change', render);
$('refresh').addEventListener('click', () => load().then(() => message(t('Inventory refreshed.'))).catch(e => message(e.message, true)));
$('audit').addEventListener('click', async () => {
  try { const audit = await (await request('audit')).json(); message(audit.ok ? t('Data integrity checks passed.') : audit.errors.join(' '), !audit.ok); }
  catch (error) { message(error.message, true); }
});
for (const [id, filename] of [['export', 'inventory.json'], ['backup', 'storage-backup.sqlite']]) {
  $(id).addEventListener('click', async () => {
    try {
      const blob = await (await request(id)).blob(); const url = URL.createObjectURL(blob);
      const link = element('a'); link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      message(tr('{0} downloaded.', filename));
    } catch (error) { message(error.message, true); }
  });
}
$('import').addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file) return;
  try {
    if (file.size > 10 * 1024 * 1024) throw new Error(t('Import exceeds 10 MiB.'));
    const payload = JSON.parse(await file.text());
    await request('import', { method: 'POST', body: JSON.stringify(payload) });
    await load(); message(t('Inventory imported and validated.'));
  } catch (error) { message(error.message, true); }
  finally { event.target.value = ''; }
});
$('theme').addEventListener('click', () => {
  const dark = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.theme = dark ? 'light' : 'dark';
});

function editorFingerprint() {
  const fields = $('box-form').elements;
  return JSON.stringify({ boxId: selected?.boxId || '', label: fields.label.value, summary: fields.summary.value, keywords: fields.keywords.value, notes: fields.notes.value, location: fields.currentLocationId.value, photos: sessionPhotos.map(p => [p.immichAssetId, p.photoRole, p.notes]) });
}

function updateEditorAiState() {
  const count = sessionPhotos.filter(p => aiPhotoSelection.has(p.immichAssetId)).length;
  $('editor-ai-analyze').disabled = count < 1 || count > 6;
  $('editor-ai-status').textContent = count > 6 ? t('Select at most 6 photos for one analysis.') : count ? tr('{0} photos selected for AI. The current description is included for an update suggestion.', count) : t('Select 1–6 photos for AI analysis. You can choose existing photos or newly added photos.');
}

$('editor-ai-analyze').addEventListener('click', async () => {
  const chosen = sessionPhotos.filter(p => aiPhotoSelection.has(p.immichAssetId));
  if (!chosen.length || chosen.length > 6) return;
  const fields = $('box-form').elements;
  const context = { generation: editorGeneration, fingerprint: editorFingerprint(), boxId: selected?.boxId, expectedSessionId: selected?.sessionId || null,
    context: { label: fields.label.value, summary: fields.summary.value, keywords: fields.keywords.value.split(',').map(s => s.trim()).filter(Boolean) } };
  $('editor-ai-analyze').disabled = true;
  try {
    const revision = photoSourceRevision || (await (await request('settings')).json()).sourceRevision;
    if (!$('editor').open || editorGeneration !== context.generation || editorFingerprint() !== context.fingerprint) return;
    await boxDraft.open(chosen.map(p => ({ id: p.immichAssetId, role: p.photoRole, fileName: p.originalFileName || p.immichAssetId, thumbnailUrl: p.thumbnailUrl, previewUrl: p.previewUrl, originalUrl: p.originalUrl })), revision, context);
  } catch (error) { $('editor-ai-status').textContent = t(error.message); }
  finally { $('editor-ai-analyze').disabled = !aiPhotoSelection.size || aiPhotoSelection.size > 6; }
});

function renderSessionPhotos() {
  const area = $('session-photos'); area.replaceChildren();
  if (!sessionPhotos.length) area.append(element('p', t('No photos selected.'), 'hint'));
  for (const [index, photo] of sessionPhotos.entries()) {
    const row = element('div', undefined, 'session-photo');
    const view = element('button', undefined, 'session-photo-view'); view.type = 'button';
    view.setAttribute('aria-label', tr('Enlarge {0}', photo.originalFileName || photo.immichAssetId));
    view.title = t('Open photo · zoom and inspect');
    const image = element('img'); image.src = photo.thumbnailUrl; image.alt = photo.originalFileName || photo.immichAssetId;
    view.append(image);
    view.addEventListener('click', () => openViewer({ label: $('box-form').elements.label.value || t('Draft photos'), photos: sessionPhotos.map(p => ({ ...p, role: p.photoRole, originalUrl: p.originalUrl || p.previewUrl || p.thumbnailUrl })) }, index, true));
    const info = element('div'); info.append(element('p', photo.originalFileName || photo.immichAssetId, 'hint'));
    const selectionLabel = element('label', undefined, 'check-label');
    const selection = element('input'); selection.type = 'checkbox'; selection.checked = aiPhotoSelection.has(photo.immichAssetId);
    selection.setAttribute('aria-label', tr('Analyze {0} with AI', photo.originalFileName || photo.immichAssetId));
    selection.addEventListener('change', () => { if (selection.checked) aiPhotoSelection.add(photo.immichAssetId); else aiPhotoSelection.delete(photo.immichAssetId); updateEditorAiState(); });
    selectionLabel.append(selection, element('span', t('Include in AI analysis'))); info.append(selectionLabel);
    const label = element('label', t('Photo role')); const role = element('select'); role.setAttribute('aria-label', tr('Role for {0}', photo.originalFileName || photo.immichAssetId));
    for (const value of ['inside', 'spread', 'detail', 'label', 'location']) role.add(new Option(roleName(value), value));
    role.value = photo.photoRole; role.addEventListener('change', () => { photo.photoRole = role.value; });
    label.append(role); info.append(label);
    const remove = element('button', t('Remove'), 'quiet'); remove.type = 'button';
    remove.setAttribute('aria-label', tr('Remove {0} from this session', photo.originalFileName || photo.immichAssetId));
    remove.addEventListener('click', () => { aiPhotoSelection.delete(photo.immichAssetId); sessionPhotos = sessionPhotos.filter(p => p !== photo); renderSessionPhotos(); });
    row.append(view, info, remove); area.append(row);
  }
  updateEditorAiState();
}

let settingsState;
function credentialFields() {
  const fields = $('settings-form').elements;
  if (fields.provider.value === 'photoprism') fields.accessMode.value = 'apiKey';
  fields.accessMode.disabled = fields.provider.value === 'photoprism';
  const shared = fields.accessMode.value === 'shareKey';
  $('api-key-label').hidden = shared; $('share-key-label').hidden = !shared;
}

async function showSettings() {
  settingsState = await (await request('settings')).json();
  const fields = $('settings-form').elements; $('settings-form').reset();
  for (const name of ['provider', 'baseUrl', 'accessMode']) fields[name].value = settingsState.photoSource[name];
  fields.albumId.replaceChildren(new Option(t('Choose an album…'), ''));
  if (settingsState.photoSource.albumId) fields.albumId.add(new Option(tr('Saved album · {0}', settingsState.photoSource.albumId), settingsState.photoSource.albumId));
  fields.albumId.value = settingsState.photoSource.albumId;
  $('credential-status').textContent = settingsState.photoSource.apiKeyConfigured || settingsState.photoSource.shareKeyConfigured ? t('Credentials are saved. Leave the password field blank to keep them.') : t('No photo credentials saved yet.');
  $('settings-status').textContent = ''; credentialFields(); $('settings-dialog').showModal();
}

async function saveSettings() {
  const fields = $('settings-form').elements;
  const photoSource = {};
  for (const name of ['provider', 'baseUrl', 'accessMode', 'albumId', 'apiKey', 'shareKey']) photoSource[name] = fields[name].value;
  photoSource.clearCredentials = fields.clearCredentials.checked;
  const payload = { sourceRevision: settingsState.sourceRevision, photoSource };
  const next = await (await request('settings', { method: 'PUT', body: JSON.stringify(payload) })).json();
  settingsState = next; fields.apiKey.value = ''; fields.shareKey.value = ''; fields.clearCredentials.checked = false;
  $('credential-status').textContent = next.photoSource.apiKeyConfigured || next.photoSource.shareKeyConfigured ? t('Credentials are saved.') : t('No photo credentials saved yet.');
  return next;
}

$('open-settings').addEventListener('click', () => showSettings().catch(e => message(e.message, true)));
$('close-settings').addEventListener('click', () => { $('settings-dialog').close(); $('settings-form').elements.apiKey.value = ''; $('settings-form').elements.shareKey.value = ''; });
$('settings-dialog').addEventListener('close', () => { $('settings-form').elements.apiKey.value = ''; $('settings-form').elements.shareKey.value = ''; });
$('settings-form').elements.provider.addEventListener('change', credentialFields);
$('settings-form').elements.accessMode.addEventListener('change', credentialFields);
$('settings-form').addEventListener('submit', async event => {
  event.preventDefault(); $('save-settings').disabled = true;
  try { await saveSettings(); $('settings-dialog').close(); await load(); message(t('Settings saved.')); }
  catch (error) { $('settings-status').textContent = error.message; }
  finally { $('save-settings').disabled = false; }
});
$('load-albums').addEventListener('click', async () => {
  $('load-albums').disabled = true; $('settings-status').textContent = t('Saving settings and reading albums…');
  try {
    const next = await saveSettings(); const response = await (await request('albums')).json();
    const select = $('settings-form').elements.albumId;
    select.replaceChildren(new Option(t('Choose an album…'), ''));
    for (const album of response.albums) select.add(new Option(tr('{0} ({1} photos)', album.label, album.assetCount), album.id));
    select.value = next.photoSource.albumId;
    $('settings-status').textContent = tr('{0} albums found. Select one and save settings.', response.albums.length);
  } catch (error) { $('settings-status').textContent = error.message; }
  finally { $('load-albums').disabled = false; }
});

let albumState = null; let albumChosen = new Set(); let pickerFromEditor = false; let albumGeneration = 0;
async function showAlbum(fromEditor = false, refresh = false) {
  const generation = ++albumGeneration;
  pickerFromEditor = fromEditor; $('album-error').textContent = '';
  $('create-ai-draft').hidden = fromEditor; $('create-ai-draft').disabled = true;
  $('album-status').textContent = t('Reading the configured album…'); $('use-photos').disabled = true;
  albumChosen = new Set(); albumState = null; $('album-photos').replaceChildren(); $('selection-count').textContent = t('Select at least one photo to continue.');
  if (!$('album-dialog').open) $('album-dialog').showModal();
  try {
    const next = await (await request(`album${refresh ? '?refresh=true' : ''}`)).json();
    if (generation !== albumGeneration) return;
    albumState = next;
    renderAlbum();
  } catch (error) { if (generation === albumGeneration) { $('album-error').textContent = tr('{0} Open Settings to configure the photo source.', t(error.message)); $('album-status').textContent = t('Album is unavailable.'); } }
}

function renderAlbum() {
  if (!albumState) return;
  const area = $('album-photos'); area.replaceChildren();
  const visible = albumState.assets.filter(a => !$('unused-only').checked || !a.assignedBoxIds.length);
  $('album-status').textContent = tr('{0} visible of {1} images. Select images to inventory.', visible.length, albumState.assets.length);
  if (!visible.length) area.append(element('p', t('No photos to show. Add photos to the album or turn off the unassigned filter.'), 'hint'));
  for (const asset of visible) {
    const retained = pickerFromEditor && sessionPhotos.some(p => p.immichAssetId === asset.id);
    const elsewhere = asset.assignedBoxIds.some(id => !pickerFromEditor || id !== selected?.boxId);
    const card = element('button', undefined, 'album-photo'); card.type = 'button'; card.disabled = retained || elsewhere;
    card.setAttribute('aria-label', tr('Select {0}', asset.fileName)); card.setAttribute('aria-pressed', String(albumChosen.has(asset.id)));
    const image = element('img'); image.src = asset.previewUrl || asset.thumbnailUrl; image.alt = asset.fileName; image.loading = 'lazy';
    image.addEventListener('error', () => image.replaceWith(element('span', t('Preview unavailable. Refresh the album to renew previews.'), 'photo-failure')));
    card.append(image, element('span', asset.fileName, 'photo-name'));
    if (retained || asset.assignedBoxIds.length) card.append(element('span', retained ? t('Already in this session') : tr('Linked to {0}', asset.assignedBoxIds.join(', ')), 'photo-state'));
    card.addEventListener('click', () => {
      if (albumChosen.has(asset.id)) albumChosen.delete(asset.id); else albumChosen.add(asset.id);
      card.setAttribute('aria-pressed', String(albumChosen.has(asset.id)));
      $('selection-count').textContent = albumChosen.size ? tr('{0} selected.', albumChosen.size) + t(albumChosen.size > 6 ? ' AI drafts accept up to 6 photos; deselect photos to use AI.' : pickerFromEditor ? ' Choose Use selected photos to continue.' : ' Choose Use selected photos or Create AI draft to continue.') : t('Select at least one photo to continue.'); $('use-photos').disabled = !albumChosen.size;
      $('create-ai-draft').disabled = !albumChosen.size || albumChosen.size > 6;
    });
    area.append(card);
  }
}

$('open-album').addEventListener('click', () => showAlbum());
$('choose-photos').addEventListener('click', () => showAlbum(true));
$('close-album').addEventListener('click', () => $('album-dialog').close());
$('album-dialog').addEventListener('close', () => { albumGeneration++; });
$('refresh-album').addEventListener('click', () => showAlbum(pickerFromEditor, true));
$('unused-only').addEventListener('change', renderAlbum);
$('use-photos').addEventListener('click', () => {
  if (!albumState || !albumChosen.size) return;
  const chosen = albumState.assets.filter(a => albumChosen.has(a.id));
  $('album-dialog').close();
  if (!pickerFromEditor) edit();
  photoSourceRevision = albumState.sourceRevision;
  for (const asset of chosen) if (!sessionPhotos.some(p => p.immichAssetId === asset.id)) {
    aiPhotoSelection.add(asset.id);
    sessionPhotos.push({ immichAssetId: asset.id, originalFileName: asset.fileName, capturedAt: asset.capturedAt, photoRole: 'inside', thumbnailUrl: asset.thumbnailUrl, previewUrl: asset.previewUrl, originalUrl: asset.originalUrl });
  }
  renderSessionPhotos();
});
$('create-ai-draft').addEventListener('click', () => {
  if (!albumState || !albumChosen.size || albumChosen.size > 6) return;
  const chosen = albumState.assets.filter(a => albumChosen.has(a.id)); const revision = albumState.sourceRevision;
  $('album-dialog').close(); boxDraft.open(chosen, revision).catch(error => message(error.message, true));
});
