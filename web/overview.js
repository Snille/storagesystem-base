import { t } from './i18n.js';

// The overview image as a panorama you can turn and zoom (vendored Pannellum, MIT).
// A 2:1 image is a full 360 x 180 degree sphere; a wider image is treated as a
// 180 degree panorama whose vertical angle follows from its proportions.
const $ = id => document.getElementById(id);

export function panoramaAngles(width, height) {
  const ratio = width / height;
  if (ratio >= 1.9 && ratio <= 2.1) return { haov: 360, vaov: 180 };
  return { haov: 180, vaov: Math.min(180, 180 / ratio) };
}

// The widest view whose vertical angle still fits inside the image, for a box of this aspect ratio.
// Pannellum's avoidShowingBackground applies the same limit, but only once the zoom changes.
export function fittingHfov(vaov, aspect) {
  return 360 * Math.atan(Math.tan(vaov / 360 * Math.PI) * aspect) / Math.PI;
}

function textureLimit() {
  const gl = document.createElement('canvas').getContext('webgl');
  return Math.min(gl ? gl.getParameter(gl.MAX_TEXTURE_SIZE) : 4096, 16384);
}

// Large panoramas are scaled down in the browser to what the graphics card can hold.
async function fitted(url) {
  const image = new Image(); image.src = url; await image.decode();
  const limit = textureLimit(), scale = Math.min(1, limit / image.naturalWidth, limit / image.naturalHeight);
  const size = { width: image.naturalWidth, height: image.naturalHeight };
  if (scale === 1) return { url, ...size };
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(size.width * scale); canvas.height = Math.round(size.height * scale);
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92));
  return { url: URL.createObjectURL(blob), ...size };
}

// Clickable points open a storage unit on the storage map. In edit mode a click in the
// image adds a point and a click on a point removes it; points are saved per image.
export function mountOverview({ request, units, title, openUnit }) {
  let viewer = null, observer = null, current = null, blobUrl = null, points = null, ready = false;
  let editing = false, pending = null, down = null, labels = new Map(), shown = 0;
  function reset() {
    observer?.disconnect(); observer = null; viewer?.destroy(); viewer = null; ready = false; shown = 0;
    if (blobUrl) URL.revokeObjectURL(blobUrl); blobUrl = null;
    setEditing(false);
  }
  const status = text => { $('overview-point-status').textContent = text; };
  function hint() {
    if (editing) $('overview-hint').textContent = t('Click in the image to add a point at that place. Click a point to remove it.');
  }
  function setEditing(on) {
    editing = on; pending = null; $('overview-point-form').hidden = true; status('');
    $('overview-edit').textContent = t(on ? 'Done' : 'Edit points'); $('overview-pano').classList.toggle('is-editing', on);
    if (on) hint(); else if (viewer) $('overview-hint').textContent = t('Drag to look around. Scroll or pinch to zoom. Click a point to open that storage unit.');
  }
  async function loadLabels() {
    try { labels = new Map((await units()).map(unit => [unit.slug, title(unit)])); } catch { labels = new Map(); }
  }
  function drawPoints() {
    if (!viewer || !ready) return;
    for (let i = 0; i < shown; i++) viewer.removeHotSpot(`point-${i}`);
    points.points.forEach((point, i) => viewer.addHotSpot({
      id: `point-${i}`, pitch: point.pitch, yaw: point.yaw, cssClass: 'overview-point',
      createTooltipFunc: (div, label) => { const span = document.createElement('span'); span.textContent = label; div.append(span); },
      createTooltipArgs: labels.get(point.unit) || point.unit,
      clickHandlerFunc: () => editing ? removePoint(i) : openUnit(point.unit)
    }));
    shown = points.points.length;
  }
  async function save(next) {
    try {
      points = await (await request('overview/points', { method: 'PUT', body: JSON.stringify({ assetId: current.assetId, revision: points.revision, points: next }) })).json();
      drawPoints(); status(t('Points saved.'));
    } catch (error) { status(t(error.message)); }
  }
  function removePoint(index) {
    const point = points.points[index];
    if (confirm(t('Remove the point for {0}?').replace('{0}', labels.get(point.unit) || point.unit))) save(points.points.filter((_, i) => i !== index));
  }
  $('overview-edit').addEventListener('click', async () => { if (!editing) await loadLabels(); setEditing(!editing); });
  $('overview-pano').addEventListener('pointerdown', event => { down = { x: event.clientX, y: event.clientY }; });
  $('overview-pano').addEventListener('click', event => {
    // A drag to look around also ends in a click; only a still click adds a point.
    if (!editing || !viewer || !down || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 5 || event.target.closest('.overview-point, .pnlm-controls-container')) return;
    const [pitch, yaw] = viewer.mouseEventToCoords(event);
    pending = { pitch: Math.round(pitch * 100) / 100, yaw: Math.round(yaw * 100) / 100 };
    $('overview-point-unit').replaceChildren(...[...labels].map(([slug, label]) => new Option(label, slug)));
    $('overview-point-form').hidden = false; status('');
  });
  $('overview-point-cancel').addEventListener('click', () => { pending = null; $('overview-point-form').hidden = true; });
  $('overview-point-save').addEventListener('click', () => {
    if (!pending || !$('overview-point-unit').value) return;
    $('overview-point-form').hidden = true; save([...points.points, { ...pending, unit: $('overview-point-unit').value }]); pending = null;
  });
  async function build(image) {
    if (current !== image || !window.pannellum) return;
    $('overview-hint').textContent = t('Loading the overview…');
    try {
      const pano = await fitted(image.originalUrl); if (current !== image) return;
      if (pano.url !== image.originalUrl) blobUrl = pano.url;
      const { haov, vaov } = panoramaAngles(pano.width, pano.height);
      const box = $('overview-pano'), fit = fittingHfov(vaov, box.clientWidth / box.clientHeight);
      box.replaceChildren();
      viewer = window.pannellum.viewer($('overview-pano'), {
        type: 'equirectangular', panorama: pano.url, autoLoad: true, haov, vaov, vOffset: 0,
        hfov: Math.min(100, haov, fit), minHfov: 20, maxHfov: Math.min(120, haov), showZoomCtrl: true, showFullscreenCtrl: true,
        // A partial panorama limits zoom and tilt so the empty area outside the image never shows.
        avoidShowingBackground: true, minPitch: -vaov / 2, maxPitch: vaov / 2,
        ...(haov < 360 ? { minYaw: -haov / 2, maxYaw: haov / 2 } : {}),
        strings: { loadingLabel: t('Loading…'), genericWebGLError: t('This browser cannot show the 3D view.'),
          textureSizeError: t('The image is too large for this device.'), unknownError: t('The 3D view could not be shown.') }
      });
      viewer.on('load', async () => { ready = true; await loadLabels(); drawPoints(); });
      $('overview-hint').textContent = t(haov === 360 ? 'Drag to look around. Scroll or pinch to zoom. Click a point to open that storage unit.'
        : 'Drag to look around. Scroll or pinch to zoom. This is a 180 degree image; a 360 degree image shows the whole room.');
    } catch { if (current === image) $('overview-hint').textContent = t('The 3D view could not be shown.'); }
  }
  return {
    show(image, imagePoints) {
      if (current?.assetId === image?.assetId && viewer) { points = imagePoints; drawPoints(); return; }
      reset(); current = image; points = imagePoints; if (!image) return;
      // Load the full image only when the overview is on screen.
      observer = new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting)) { observer.disconnect(); build(image); } });
      observer.observe($('overview-pano'));
    }
  };
}
