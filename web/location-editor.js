import { parseLocation, buildLocationId, locationKey } from './locations.js';
import { t, tr } from './i18n.js';

export function mountLocationEditor(getPositions, onChange = () => {}) {
  const $ = id => document.getElementById(id);
  const kind = $('position-kind'), unit = $('position-unit'), row = $('position-row');
  const slot = $('position-slot'), variant = $('position-variant');
  const output = $('box-form').elements.currentLocationId;
  const controls = [kind, unit, row, slot, variant];
  let saved = '', editing = true;

  function occupied(id) {
    const key = locationKey(id);
    const count = getPositions().filter(p => locationKey(p.locationId) === key).reduce((sum, p) => sum + p.boxCount, 0);
    return count > (saved && locationKey(saved) === key ? 1 : 0);
  }

  function markOccupancy() {
    for (const [select, part] of [[slot, 'slot'], [variant, 'variant']]) {
      for (const option of select.options) {
        const label = option.value || (part === 'variant' ? t('None') : t('Choose position…'));
        let taken = false;
        try { taken = occupied(buildLocationId({ kind: kind.value, unit: unit.value, row: row.value, slot: slot.value, variant: variant.value, [part]: option.value })); } catch { }
        option.disabled = taken; option.textContent = `${label}${taken ? t(' · occupied') : ''}`;
      }
    }
    const takenSlots = [...slot.options].filter(o => o.disabled).map(o => o.value);
    $('position-availability').textContent = takenSlots.length ? tr('Occupied positions for letter {0}: {1}. Choose another position or letter.', variant.value || t('None'), takenSlots.join(', ')) : '';
  }

  function numbers(select, placeholder, value = '') {
    select.replaceChildren(new Option(placeholder, ''));
    const values = [...new Set([...Array.from({ length: 12 }, (_, i) => String(i + 1)), ...(value ? [value] : [])])];
    values.sort((a, b) => Number(a) - Number(b));
    for (const value of values) select.add(new Option(value, value));
    select.value = value;
  }

  function category(rowValue = '') {
    const name = { ivar: t('Shelving unit'), bench: t('Bench'), cabinet: t('Cabinet') }[kind.value];
    $('position-unit-label').textContent = name;
    unit.placeholder = t({ ivar: 'Choose or enter a shelving unit', bench: 'Choose or enter a bench', cabinet: 'Choose or enter a cabinet' }[kind.value]);
    $('position-row-label').textContent = kind.value === 'bench' ? t('Surface') : t('Shelf');
    if (kind.value === 'bench') {
      row.replaceChildren(new Option(t('On top'), 'TOP'), new Option(t('Under'), 'UNDER'));
      row.value = ['TOP', 'UNDER'].includes(rowValue) ? rowValue : 'TOP';
    } else numbers(row, t('Choose shelf…'), rowValue);
    const units = new Set(kind.value === 'ivar' ? ['A', 'B', 'C', 'D', 'E', 'F', 'G'] : []);
    for (const position of getPositions()) {
      const p = parseLocation(position.locationId);
      if (p?.kind === kind.value) units.add(p.unit);
    }
    if (unit.value) units.add(unit.value);
    $('position-units').replaceChildren(...[...units].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).map(value => new Option(value, value)));
  }

  function update() {
    unit.setCustomValidity('');
    if (!editing) { output.value = saved; $('position-status').textContent = tr('Saved location: {0}', saved); return; }
    try {
      output.value = buildLocationId({ kind: kind.value, unit: unit.value, row: row.value, slot: slot.value, variant: variant.value });
      if (occupied(output.value)) { output.value = ''; throw new Error(t('This location is occupied. Choose a different position or letter.')); }
      $('position-status').textContent = tr('Selected location: {0}', output.value);
    } catch (error) {
      output.value = ''; $('position-status').textContent = t(error.message);
      if (unit.value.trim() && !unit.value.normalize('NFKD').match(/[A-Za-z0-9]/)) unit.setCustomValidity(t(error.message));
    }
    markOccupancy();
    onChange(output.value);
  }

  function setEditing(value) {
    editing = value;
    $('position-fields').hidden = !editing;
    $('change-position').hidden = editing;
    $('cancel-position').hidden = !saved;
    for (const control of controls) control.disabled = !editing;
    for (const control of [unit, row, slot]) control.required = editing;
    update();
  }

  function reset(value = '') {
    saved = value;
    const p = parseLocation(value);
    kind.value = p?.kind || 'ivar'; unit.value = p?.unit || ''; unit.setCustomValidity('');
    category(p ? String(p.row) : ''); numbers(slot, t('Choose position…'), p?.slot || '');
    variant.replaceChildren(new Option(t('None'), ''), ...Array.from({ length: 26 }, (_, i) => new Option(String.fromCharCode(65 + i), String.fromCharCode(65 + i))));
    variant.value = p?.variant.toUpperCase() || '';
    setEditing(!saved);
  }

  kind.addEventListener('change', () => { category(); update(); });
  for (const control of [unit, row, slot, variant]) control.addEventListener('input', update);
  $('change-position').addEventListener('click', () => setEditing(true));
  $('cancel-position').addEventListener('click', () => reset(saved));
  return { reset, refresh: update, validate() {
    update();
    if (output.value) return true;
    $('save-error').textContent = t('Choose an available current location before saving.');
    return false;
  } };
}
