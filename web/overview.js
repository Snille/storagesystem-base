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

export function mountOverview() {
  let viewer = null, observer = null, current = null, blobUrl = null;
  function reset() {
    observer?.disconnect(); observer = null; viewer?.destroy(); viewer = null;
    if (blobUrl) URL.revokeObjectURL(blobUrl); blobUrl = null;
  }
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
      $('overview-hint').textContent = t(haov === 360 ? 'Drag to look around. Scroll or pinch to zoom.'
        : 'Drag to look around. Scroll or pinch to zoom. This is a 180 degree image; a 360 degree image shows the whole room.');
    } catch { if (current === image) $('overview-hint').textContent = t('The 3D view could not be shown.'); }
  }
  return {
    show(image) {
      if (current?.assetId === image?.assetId && viewer) return;
      reset(); current = image; if (!image) return;
      // Load the full image only when the overview is on screen.
      observer = new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting)) { observer.disconnect(); build(image); } });
      observer.observe($('overview-pano'));
    }
  };
}
