import { t, tr } from './i18n.js';

export function mountStorageMap(request, getBoxes, openBox, printLocation, printUnit, showPhoto) {
  const $ = id => document.getElementById(id);
  const node = (tag, text, className) => { const el = document.createElement(tag); if (text !== undefined) el.textContent = text; if (className) el.className = className; return el; };
  let model = { units: [], unplaced: [] }; let matches = null;
  const category = kind => t({ ivar: 'Shelving unit', bench: 'Bench', cabinet: 'Cabinet' }[kind]);
  const title = unit => `${category(unit.kind)} ${unit.unit}`;
  function render() {
    const area = $('storage-map-body'); area.replaceChildren();
    const boxes = new Map(getBoxes().map(box => [box.boxId, box]));
    const showUnplaced = () => {
      if (!model.unplaced.length) return;
      area.append(node('h3', t('Boxes with unrecognized locations')));
      for (const id of model.unplaced) { const box = boxes.get(id); if (!box) continue; const button = node('button', box.label, 'quiet'); button.addEventListener('click', () => openBox(box)); area.append(button); }
    };
    const unit = model.units.find(unit => unit.slug === $('storage-map-unit').value);
    unitPhoto(unit);
    $('storage-map-print-unit').hidden = !unit;
    if (!unit) { area.append(node('p', t('No registered storage positions yet.'), 'hint')); showUnplaced(); return; }
    const occupied = unit.positions.filter(position => position.boxIds.length).length;
    $('storage-map-status').textContent = tr('{0} occupied · {1} registered free positions', occupied, unit.positions.length - occupied);
    const wrapper = node('div', undefined, 'storage-map-scroll');
    const table = node('table', undefined, 'storage-map-table'); table.setAttribute('aria-label', title(unit));
    const slots = [...new Set(unit.positions.map(position => position.slot))].sort((a, b) => a - b);
    const rows = [...new Set(unit.positions.map(position => position.row))];
    const head = node('tr'); head.append(node('th', t(unit.kind === 'bench' ? 'Surface' : 'Shelf')));
    for (const slot of slots) head.append(node('th', tr('Position {0}', slot)));
    const thead = node('thead'); thead.append(head); table.append(thead);
    const body = node('tbody');
    for (const row of rows) {
      const line = node('tr'); const heading = node('th', unit.kind === 'bench' ? t(row === 'TOP' ? 'On top' : 'Under') : String(row)); heading.scope = 'row'; line.append(heading);
      for (const slot of slots) {
        const cell = node('td'); const positions = unit.positions.filter(position => position.row === row && position.slot === slot);
        if (!positions.length) cell.append(node('span', t('Not registered'), 'hint'));
        for (const position of positions) {
          const place = node('div', undefined, 'map-position');
          place.append(node('span', position.letter ? tr('Letter {0}', position.letter) : t('No letter'), 'hint'));
          if (!position.boxIds.length) place.append(node('span', t('Free'), 'map-free'));
          for (const id of position.boxIds) {
            const box = boxes.get(id); if (!box) continue;
            const button = node('button', box.label, 'quiet map-box'); button.type = 'button';
            button.classList.toggle('map-match', matches?.has(id) || false);
            button.classList.toggle('map-muted', matches !== null && !matches.has(id));
            button.append(node('small', id)); button.title = box.summary || box.label;
            button.addEventListener('click', () => openBox(box)); place.append(button);
          }
          // Aliases share one physical place; the first registered identifier names it on the label.
          const print = node('button', t('Print location label'), 'quiet map-print'); print.type = 'button';
          print.addEventListener('click', () => printLocation(position.locationIds[0])); place.append(print);
          cell.append(place);
        }
        line.append(cell);
      }
      body.append(line);
    }
    table.append(body); wrapper.append(table); area.append(wrapper);
    showUnplaced();
  }
  // The unit's photo is an album photo; the map stores only which one.
  function unitPhoto(unit) {
    const photo = unit && model.unitPhotos?.[unit.slug], button = $('storage-map-photo');
    $('storage-map-photo-picker').hidden = true;
    $('storage-map-choose-photo').hidden = !unit; $('storage-map-choose-photo').textContent = t(photo ? 'Change photo' : 'Choose photo');
    $('storage-map-remove-photo').hidden = !photo; button.hidden = !photo; button.replaceChildren();
    if (!photo) return;
    const image = node('img'); image.src = photo.previewUrl; image.alt = tr('Photo of {0}', title(unit)); button.append(image);
    button.title = t('Show the photo');
    image.addEventListener('error', () => { button.hidden = true; });
  }
  const current = () => model.units.find(unit => unit.slug === $('storage-map-unit').value);
  async function savePhoto(assetId) {
    const unit = current(); if (!unit) return;
    const response = await request(`storage-units/${encodeURIComponent(unit.slug)}/photo`, { method: 'PUT', body: JSON.stringify({ assetId }) });
    const result = await response.json();
    model.unitPhotos = { ...model.unitPhotos }; if (result.photo) model.unitPhotos[unit.slug] = result.photo; else delete model.unitPhotos[unit.slug];
    unitPhoto(unit);
  }
  $('storage-map-photo').addEventListener('click', () => { const unit = current(); if (unit && model.unitPhotos?.[unit.slug]) showPhoto(title(unit), model.unitPhotos[unit.slug]); });
  $('storage-map-remove-photo').addEventListener('click', () => savePhoto(null).catch(error => { $('storage-map-status').textContent = error.message; }));
  $('storage-map-photo-cancel').addEventListener('click', () => { $('storage-map-photo-picker').hidden = true; });
  // Album photos not used by a box or another unit come first; used ones say where they are used.
  $('storage-map-choose-photo').addEventListener('click', async () => {
    const picker = $('storage-map-photo-picker'), list = $('storage-map-photo-list'), unit = current(); if (!unit) return;
    picker.hidden = false; list.replaceChildren(); $('storage-map-photo-status').textContent = t('Loading album…');
    try {
      const album = await (await request('album')).json();
      const used = asset => asset.assignedBoxIds.length + asset.assignedUnits.filter(slug => slug !== unit.slug).length;
      const assets = [...album.assets].sort((a, b) => used(a) - used(b));
      $('storage-map-photo-status').textContent = assets.length ? '' : t('No photos to show. Add photos to the album or turn off the unassigned filter.');
      for (const asset of assets) {
        const button = node('button'); button.type = 'button';
        const image = node('img'); image.src = asset.thumbnailUrl; image.alt = asset.fileName; image.loading = 'lazy';
        const where = [...asset.assignedBoxIds, ...asset.assignedUnits.map(slug => (unit => unit ? title(unit) : slug)(model.units.find(u => u.slug === slug)))];
        button.append(image, node('span', where.length ? tr('Linked to {0}', where.join(', ')) : asset.fileName));
        button.addEventListener('click', () => savePhoto(asset.id).catch(error => { $('storage-map-photo-status').textContent = error.message; }));
        list.append(button);
      }
    } catch (error) { $('storage-map-photo-status').textContent = error.message; }
  });
  $('storage-map-print-unit').addEventListener('click', () => { const unit = current(); if (unit) printUnit(unit.slug, title(unit)); });
  $('close-storage-map').addEventListener('click', () => $('storage-map-dialog').close());
  $('storage-map-unit').addEventListener('change', render);
  // Units are listed alphabetically by their shown name, with numbers in numeric order.
  async function fetchModel() {
    const lang = document.documentElement.lang;
    model = await (await request(`storage-map?lang=${lang}`)).json();
    model.units.sort((a, b) => title(a).localeCompare(title(b), lang, { numeric: true, sensitivity: 'base' }));
    return model;
  }
  return { units: () => model.units, title, async load() { return (await fetchModel()).units; },
    async open(highlightIds = null, focusedBox = null, focusedUnit = null) {
    await fetchModel(); matches = highlightIds === null ? null : new Set(highlightIds);
    const previous = $('storage-map-unit').value; $('storage-map-unit').replaceChildren();
    for (const unit of model.units) $('storage-map-unit').add(new Option(title(unit), unit.slug));
    const focused = model.units.find(unit => unit.positions.some(position => position.boxIds.some(id => focusedBox ? id === focusedBox : matches?.has(id))));
    const chosen = model.units.some(unit => unit.slug === focusedUnit) ? focusedUnit : focused?.slug;
    $('storage-map-unit').value = chosen || (model.units.some(unit => unit.slug === previous) ? previous : model.units[0]?.slug || '');
    $('storage-map-status').textContent = '';
    $('storage-map-query').textContent = matches === null ? t('Choose a storage unit. Click a box to open it. Only registered positions are shown.') : tr('{0} search matches highlighted. Other boxes remain visible for orientation.', matches.size);
    render(); if (!$('storage-map-dialog').open) $('storage-map-dialog').showModal();
  } };
}
