import { mountAi } from './ai.js';
import { mountBoxDraft } from './box-draft.js';

const $ = id => document.getElementById(id);
let key = ''; let boxes = []; let selected = null;
let sessionPhotos = []; let photoSourceRevision = null;
let aiDraftActive = false;

function element(tag, content, className) {
  const el = document.createElement(tag);
  if (content !== undefined) el.textContent = content;
  if (className) el.className = className;
  return el;
}

function message(value, error = false) {
  $('message').textContent = value; $('message').classList.toggle('error', error);
}

async function request(path, options = {}) {
  const response = await fetch(`/api/manage/${path}`, { ...options, headers: { 'x-api-key': key, ...(options.body ? { 'content-type': 'application/json' } : {}), ...options.headers } });
  if (!response.ok) { const payload = await response.json(); throw new Error(payload.error || 'The request failed.'); }
  return response;
}

mountAi(request, message, () => showAlbum());
const boxDraft = mountBoxDraft(request, draft => {
  edit(); aiDraftActive = true;
  $('editor-title').textContent = 'Review AI box draft'; $('ai-editor-note').hidden = false;
  const fields = $('box-form').elements;
  fields.label.value = draft.result.label; fields.summary.value = draft.result.summary; fields.keywords.value = draft.result.keywords.join(', ');
  fields.notes.value = draft.result.uncertainties ? `AI uncertainty to review:\n${draft.result.uncertainties}` : '';
  photoSourceRevision = draft.sourceRevision;
  sessionPhotos = draft.result.photos.map(p => ({ immichAssetId: p.assetId, photoRole: p.role, capturedAt: p.capturedAt, originalFileName: p.fileName, notes: p.description, thumbnailUrl: p.thumbnailUrl }));
  renderSessionPhotos();
});

async function load() {
  const [payload, audit] = await Promise.all([
    request('boxes').then(r => r.json()), request('audit').then(r => r.json())
  ]);
  boxes = payload.boxes;
  $('box-count').textContent = audit.counts.boxes;
  $('session-count').textContent = audit.counts.sessions;
  $('photo-count').textContent = audit.counts.photos;
  $('location-count').textContent = new Set(boxes.map(b => b.locationId)).size;
  const prior = $('location').value;
  $('location').replaceChildren(new Option('All locations', ''));
  const locations = [...new Map(boxes.map(b => [b.locationId, Object.values(b.location).filter(Boolean).join(' · ')])).entries()].sort((a, b) => a[1].localeCompare(b[1], undefined, { numeric: true }));
  for (const [id, label] of locations) $('location').add(new Option(label, id));
  $('location').value = prior;
  $('workspace').hidden = false; $('connect').hidden = true;
  render();
}

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
  $('result-count').textContent = `${visible.length} ${visible.length === 1 ? 'box' : 'boxes'}${query ? ` matching “${query}”` : ''}`;
  if (!visible.length && boxes.length) $('boxes').append(element('p', 'No boxes match this search. Try another word or location.', 'muted'));
  for (const box of visible) {
    const card = element('button', undefined, 'box-card'); card.type = 'button';
    const cover = box.photos.find(p => p.immichAssetId === box.coverAssetId);
    if (cover) {
      const image = element('img', undefined, 'box-cover'); image.src = cover.thumbnailUrl; image.alt = `Photo of ${box.label}`; image.loading = 'lazy';
      image.addEventListener('error', () => image.replaceWith(element('span', 'Photo unavailable', 'hint')));
      card.append(image);
    } else card.append(element('span', '▦', 'box-icon'));
    card.append(element('h2', box.label), element('p', box.summary || 'No contents summary yet.'));
    const chips = element('div', undefined, 'chips');
    for (const keyword of box.itemKeywords.slice(0, 5)) chips.append(element('span', keyword, 'chip'));
    card.append(chips, element('div', Object.values(box.location).filter(Boolean).join(' · '), 'place'));
    card.addEventListener('click', () => details(box).catch(error => message(error.message, true)));
    $('boxes').append(card);
  }
}

async function details(box) {
  selected = box; $('detail-title').textContent = box.label;
  const area = $('detail-body'); area.replaceChildren();
  area.append(element('p', Object.values(box.location).filter(Boolean).join(' · '), 'muted'), element('p', box.summary || 'No contents summary.', 'detail-notes'));
  if (box.boxNotes) area.append(element('p', box.boxNotes, 'detail-notes'));
  area.append(element('p', `Box ID: ${box.boxId}`, 'hint'));
  if (box.photos.length) {
    area.append(element('p', 'Open a photo to browse this box’s images. Choose “Use as card image” in the viewer to set its cover.', 'hint'));
    const photos = element('div', undefined, 'photo-grid');
    for (const [index, photo] of box.photos.entries()) {
      const link = element('button', undefined, 'photo-open'); link.type = 'button'; link.setAttribute('aria-label', `View photo ${index + 1} of ${box.label}`);
      const img = element('img'); img.src = photo.previewUrl || photo.originalUrl; img.alt = `${photo.role} photo of ${box.label}`; img.loading = 'lazy';
      img.addEventListener('error', () => { img.replaceWith(element('p', 'Photo unavailable. Check the configured photo source.', 'hint')); });
      link.append(img); photos.append(link);
      link.addEventListener('click', () => openViewer(box, index));
    }
    area.append(photos);
  }
  const history = (await (await request(`history/${encodeURIComponent(box.boxId)}`)).json()).sessions;
  const historyArea = element('details', undefined, 'inventory-history');
  historyArea.append(element('summary', `Inventory history · ${history.length}`));
  for (const session of history) {
    const row = element('div', undefined, 'history-entry');
    row.append(element('small', `${new Date(session.createdAt).toLocaleString()}${session.isCurrent ? ' · Current' : ''}`), element('p', session.summary || 'No summary'));
    historyArea.append(row);
  }
  area.append(historyArea);
  $('detail').showModal();
}

let viewerBox; let viewerIndex = 0; let viewerGeneration = 0;
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
  $('viewer-zoom-level').textContent = `${Math.round(fit * viewerZoom * 100)}%${viewerZoom === 1 ? ' · Fit' : ''}`;
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
  const photo = viewerBox.photos[viewerIndex];
  $('viewer-cover').textContent = photo.immichAssetId === viewerBox.coverAssetId && !viewerBox.coverIsAutomatic ? 'Current card image' : 'Use as card image';
  $('viewer-cover').disabled = savingCover || (photo.immichAssetId === viewerBox.coverAssetId && !viewerBox.coverIsAutomatic);
  $('viewer-auto-cover').disabled = savingCover || viewerBox.coverIsAutomatic;
}
function showViewerPhoto() {
  viewerZoom = 1;
  const generation = ++viewerGeneration; const photo = viewerBox.photos[viewerIndex];
  $('viewer-title').textContent = viewerBox.label;
  $('viewer-caption').textContent = `${viewerIndex + 1} / ${viewerBox.photos.length} · ${photo.role} · ${photo.originalFileName || photo.immichAssetId}`;
  $('viewer-status').textContent = 'Loading image…';
  viewerCoverControls();
  $('viewer-previous').disabled = $('viewer-next').disabled = viewerBox.photos.length < 2;
  const image = element('img'); image.alt = `${photo.role} photo of ${viewerBox.label}`;
  image.addEventListener('load', () => { if (generation === viewerGeneration) { updateViewerZoom(true); $('viewer-status').textContent = ''; } });
  image.addEventListener('error', () => { if (generation === viewerGeneration) $('viewer-status').textContent = 'Image unavailable. You can still browse the other photos.'; });
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
function openViewer(box, index) { viewerBox = box; viewerIndex = index; $('photo-viewer').showModal(); showViewerPhoto(); }
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
  if (!viewerBox || savingCover) return;
  savingCover = true; const boxId = viewerBox.boxId;
  $('viewer-cover').disabled = $('viewer-auto-cover').disabled = true;
  try {
    const box = await (await request(`boxes/${encodeURIComponent(boxId)}/cover`, { method: 'PUT', body: JSON.stringify({ assetId: automatic ? null : viewerBox.photos[viewerIndex].immichAssetId }) })).json();
    boxes = boxes.map(b => b.boxId === boxId ? box : b); if (selected?.boxId === boxId) selected = box;
    await render();
    if (viewerBox?.boxId === boxId) { Object.assign(viewerBox, { coverAssetId: box.coverAssetId, coverIsAutomatic: box.coverIsAutomatic }); $('viewer-status').textContent = 'Card image saved.'; }
  } catch (error) { if (viewerBox?.boxId === boxId) { $('viewer-status').textContent = error.message; $('viewer-cover').disabled = $('viewer-auto-cover').disabled = false; } }
  finally { savingCover = false; viewerCoverControls(); }
}
$('viewer-cover').addEventListener('click', () => saveCover(false));
$('viewer-auto-cover').addEventListener('click', () => saveCover(true));

function edit(box = null) {
  aiDraftActive = false; $('ai-editor-note').hidden = true;
  selected = box; $('box-form').reset(); $('save-error').textContent = '';
  $('editor-title').textContent = box ? 'Update box inventory' : 'Add box';
  const fields = $('box-form').elements;
  fields.boxId.value = box?.boxId || ''; fields.boxId.readOnly = Boolean(box);
  fields.currentLocationId.value = box?.locationId || ''; fields.label.value = box?.label || '';
  fields.summary.value = box?.summary || ''; fields.notes.value = box?.boxNotes || '';
  fields.keywords.value = box?.itemKeywords.join(', ') || '';
  sessionPhotos = (box?.photos || []).map(p => ({ immichAssetId: p.immichAssetId, photoRole: p.role, capturedAt: p.capturedAt, notes: p.notes, originalFileName: p.originalFileName, thumbnailUrl: p.thumbnailUrl }));
  photoSourceRevision = null; renderSessionPhotos();
  $('editor').showModal();
}

$('connect-form').addEventListener('submit', async event => {
  event.preventDefault(); key = $('key').value.trim();
  try { await load(); $('key').value = ''; message(''); } catch (error) { message(error.message, true); }
});
$('new-box').addEventListener('click', () => edit()); $('empty-add').addEventListener('click', () => edit());
$('close-editor').addEventListener('click', () => $('editor').close());
$('close-detail').addEventListener('click', () => $('detail').close());
$('edit').addEventListener('click', () => { $('detail').close(); edit(selected); });
$('box-form').addEventListener('submit', async event => {
  event.preventDefault(); $('save').disabled = true; $('save-error').textContent = '';
  const form = new FormData(event.target); const boxId = form.get('boxId').trim();
  try {
    const payload = {
      box: { boxId, label: form.get('label').trim(), currentLocationId: form.get('currentLocationId').trim(), notes: form.get('notes') },
      session: { boxId, summary: form.get('summary'), notes: selected?.sessionNotes, itemKeywords: form.get('keywords').split(',').map(s => s.trim()).filter(Boolean) },
      // Retain photo associations in the new current session; old sessions stay intact.
      photos: sessionPhotos.map(({ thumbnailUrl, ...photo }) => photo), photoSourceRevision, ...(aiDraftActive ? { expectNewBox: true } : {})
    };
    await request('session', { method: 'POST', body: JSON.stringify(payload) });
    $('editor').close(); await load(); message('Inventory session saved.');
  } catch (error) { $('save-error').textContent = error.message; }
  finally { $('save').disabled = false; }
});
let timer;
$('search').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(render, 150); });
$('location').addEventListener('change', render);
$('refresh').addEventListener('click', () => load().then(() => message('Inventory refreshed.')).catch(e => message(e.message, true)));
$('audit').addEventListener('click', async () => {
  try { const audit = await (await request('audit')).json(); message(audit.ok ? 'Data integrity checks passed.' : audit.errors.join(' '), !audit.ok); }
  catch (error) { message(error.message, true); }
});
for (const [id, filename] of [['export', 'inventory.json'], ['backup', 'storage-backup.sqlite']]) {
  $(id).addEventListener('click', async () => {
    try {
      const blob = await (await request(id)).blob(); const url = URL.createObjectURL(blob);
      const link = element('a'); link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      message(`${filename} downloaded.`);
    } catch (error) { message(error.message, true); }
  });
}
$('import').addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file) return;
  try {
    if (file.size > 10 * 1024 * 1024) throw new Error('Import exceeds 10 MiB.');
    const payload = JSON.parse(await file.text());
    await request('import', { method: 'POST', body: JSON.stringify(payload) });
    await load(); message('Inventory imported and validated.');
  } catch (error) { message(error.message, true); }
  finally { event.target.value = ''; }
});
$('theme').addEventListener('click', () => {
  const dark = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.theme = dark ? 'light' : 'dark';
});

function renderSessionPhotos() {
  const area = $('session-photos'); area.replaceChildren();
  if (!sessionPhotos.length) area.append(element('p', 'No photos selected.', 'hint'));
  for (const photo of sessionPhotos) {
    const row = element('div', undefined, 'session-photo');
    const image = element('img'); image.src = photo.thumbnailUrl; image.alt = photo.originalFileName || photo.immichAssetId;
    const info = element('div'); info.append(element('p', photo.originalFileName || photo.immichAssetId, 'hint'));
    const label = element('label', 'Photo role'); const role = element('select'); role.setAttribute('aria-label', `Role for ${photo.originalFileName || photo.immichAssetId}`);
    for (const value of ['inside', 'spread', 'detail', 'label', 'location']) role.add(new Option(value[0].toUpperCase() + value.slice(1), value));
    role.value = photo.photoRole; role.addEventListener('change', () => { photo.photoRole = role.value; });
    label.append(role); info.append(label);
    const remove = element('button', 'Remove', 'quiet'); remove.type = 'button';
    remove.setAttribute('aria-label', `Remove ${photo.originalFileName || photo.immichAssetId} from this session`);
    remove.addEventListener('click', () => { sessionPhotos = sessionPhotos.filter(p => p !== photo); renderSessionPhotos(); });
    row.append(image, info, remove); area.append(row);
  }
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
  fields.language.value = settingsState.appearance.language;
  for (const name of ['provider', 'baseUrl', 'accessMode']) fields[name].value = settingsState.photoSource[name];
  fields.albumId.replaceChildren(new Option('Choose an album…', ''));
  if (settingsState.photoSource.albumId) fields.albumId.add(new Option(`Saved album · ${settingsState.photoSource.albumId}`, settingsState.photoSource.albumId));
  fields.albumId.value = settingsState.photoSource.albumId;
  $('credential-status').textContent = settingsState.photoSource.apiKeyConfigured || settingsState.photoSource.shareKeyConfigured ? 'Credentials are saved. Leave the password field blank to keep them.' : 'No photo credentials saved yet.';
  $('settings-status').textContent = ''; credentialFields(); $('settings-dialog').showModal();
}

async function saveSettings() {
  const fields = $('settings-form').elements;
  const photoSource = {};
  for (const name of ['provider', 'baseUrl', 'accessMode', 'albumId', 'apiKey', 'shareKey']) photoSource[name] = fields[name].value;
  photoSource.clearCredentials = fields.clearCredentials.checked;
  const payload = { sourceRevision: settingsState.sourceRevision, appearance: { language: fields.language.value }, photoSource };
  const next = await (await request('settings', { method: 'PUT', body: JSON.stringify(payload) })).json();
  settingsState = next; fields.apiKey.value = ''; fields.shareKey.value = ''; fields.clearCredentials.checked = false;
  $('credential-status').textContent = next.photoSource.apiKeyConfigured || next.photoSource.shareKeyConfigured ? 'Credentials are saved.' : 'No photo credentials saved yet.';
  return next;
}

$('open-settings').addEventListener('click', () => showSettings().catch(e => message(e.message, true)));
$('close-settings').addEventListener('click', () => { $('settings-dialog').close(); $('settings-form').elements.apiKey.value = ''; $('settings-form').elements.shareKey.value = ''; });
$('settings-dialog').addEventListener('close', () => { $('settings-form').elements.apiKey.value = ''; $('settings-form').elements.shareKey.value = ''; });
$('settings-form').elements.provider.addEventListener('change', credentialFields);
$('settings-form').elements.accessMode.addEventListener('change', credentialFields);
$('settings-form').addEventListener('submit', async event => {
  event.preventDefault(); $('save-settings').disabled = true;
  try { await saveSettings(); $('settings-dialog').close(); await load(); message('Settings saved.'); }
  catch (error) { $('settings-status').textContent = error.message; }
  finally { $('save-settings').disabled = false; }
});
$('load-albums').addEventListener('click', async () => {
  $('load-albums').disabled = true; $('settings-status').textContent = 'Saving settings and reading albums…';
  try {
    const next = await saveSettings(); const response = await (await request('albums')).json();
    const select = $('settings-form').elements.albumId;
    select.replaceChildren(new Option('Choose an album…', ''));
    for (const album of response.albums) select.add(new Option(`${album.label} (${album.assetCount} photos)`, album.id));
    select.value = next.photoSource.albumId;
    $('settings-status').textContent = `${response.albums.length} albums found. Select one and save settings.`;
  } catch (error) { $('settings-status').textContent = error.message; }
  finally { $('load-albums').disabled = false; }
});

let albumState = null; let albumChosen = new Set(); let pickerFromEditor = false; let albumGeneration = 0;
async function showAlbum(fromEditor = false, refresh = false) {
  const generation = ++albumGeneration;
  pickerFromEditor = fromEditor; $('album-error').textContent = '';
  $('create-ai-draft').hidden = fromEditor; $('create-ai-draft').disabled = true;
  $('album-status').textContent = 'Reading the configured album…'; $('use-photos').disabled = true;
  albumChosen = new Set(); albumState = null; $('album-photos').replaceChildren(); $('selection-count').textContent = '0 selected';
  if (!$('album-dialog').open) $('album-dialog').showModal();
  try {
    const next = await (await request(`album${refresh ? '?refresh=true' : ''}`)).json();
    if (generation !== albumGeneration) return;
    albumState = next;
    renderAlbum();
  } catch (error) { if (generation === albumGeneration) { $('album-error').textContent = `${error.message} Open Settings to configure the photo source.`; $('album-status').textContent = 'Album is unavailable.'; } }
}

function renderAlbum() {
  if (!albumState) return;
  const area = $('album-photos'); area.replaceChildren();
  const visible = albumState.assets.filter(a => !$('unused-only').checked || !a.assignedBoxIds.length);
  $('album-status').textContent = `${visible.length} visible of ${albumState.assets.length} images. Select images to inventory.`;
  if (!visible.length) area.append(element('p', 'No photos to show. Add photos to the album or turn off the unassigned filter.', 'hint'));
  for (const asset of visible) {
    const retained = pickerFromEditor && sessionPhotos.some(p => p.immichAssetId === asset.id);
    const elsewhere = asset.assignedBoxIds.some(id => !pickerFromEditor || id !== selected?.boxId);
    const card = element('button', undefined, 'album-photo'); card.type = 'button'; card.disabled = retained || elsewhere;
    card.setAttribute('aria-label', `Select ${asset.fileName}`); card.setAttribute('aria-pressed', String(albumChosen.has(asset.id)));
    const image = element('img'); image.src = asset.thumbnailUrl; image.alt = asset.fileName; image.loading = 'lazy';
    image.addEventListener('error', () => image.replaceWith(element('span', 'Preview unavailable. Refresh the album to renew previews.', 'photo-failure')));
    card.append(image, element('span', asset.fileName, 'photo-name'));
    if (retained || asset.assignedBoxIds.length) card.append(element('span', retained ? 'Already in this session' : `Linked to ${asset.assignedBoxIds.join(', ')}`, 'photo-state'));
    card.addEventListener('click', () => {
      if (albumChosen.has(asset.id)) albumChosen.delete(asset.id); else albumChosen.add(asset.id);
      card.setAttribute('aria-pressed', String(albumChosen.has(asset.id)));
      $('selection-count').textContent = `${albumChosen.size} selected`; $('use-photos').disabled = !albumChosen.size;
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
  for (const asset of chosen) if (!sessionPhotos.some(p => p.immichAssetId === asset.id)) sessionPhotos.push({
    immichAssetId: asset.id, originalFileName: asset.fileName, capturedAt: asset.capturedAt, photoRole: 'inside', thumbnailUrl: asset.thumbnailUrl
  });
  renderSessionPhotos();
});
$('create-ai-draft').addEventListener('click', () => {
  if (!albumState || !albumChosen.size || albumChosen.size > 6) return;
  const chosen = albumState.assets.filter(a => albumChosen.has(a.id)); const revision = albumState.sourceRevision;
  $('album-dialog').close(); boxDraft.open(chosen, revision).catch(error => message(error.message, true));
});
