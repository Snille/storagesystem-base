import { InputError, object, text } from './validation.js';
import { labelMediaPresets } from './label-media.js';
export { labelMediaPresets } from './label-media.js';

export const labelMedia = labelMediaPresets[0];
export const defaultLabelStyle = { titleSize: 11, descriptionSize: 8, locationSize: 8 };
export const testLabel = { title: 'Storage System TEST', description: 'ÅÄÖ åäö - en testetikett', location: 'TEST - 57 x 32 mm' };
const width = (text, size) => [...text.normalize('NFD').replace(/[\u0300-\u036f]/g, '')].reduce((sum, c) =>
  sum + (/^[ilI.,'!:;| ]$/.test(c) ? .26 : /^[MWmw@]$/.test(c) ? .85 : /^[A-Z0-9]$/.test(c) ? .62 : .51) * size, 0);

export function labelLayout(input, style = defaultLabelStyle, mediaKey = labelMedia.key) {
  const media = labelMediaPresets.find(preset => preset.key === mediaKey);
  if (!media) throw new InputError('Unsupported label format.');
  const availableWidth = media.widthPt - 17, heightScale = media.heightPt / 90;
  object(input);
  for (const name of Object.keys(input)) if (!['title', 'description', 'location'].includes(name)) throw new InputError('Unsupported label field.');
  for (const name of ['title', 'description', 'location']) {
    text(input[name], name, { empty: name === 'description' });
    if (input[name].length > (name === 'description' ? 2000 : 240) || /[^\x09\x0a\x0d\x20-\x7e\xa0-\xff]/u.test(input[name])) {
      throw new InputError('Label text supports Latin-1, including Swedish letters. Shorten text or replace unsupported characters.');
    }
  }
  const lines = [], warnings = [];
  for (const [field, top, height, configuredSize, bold] of [
    ['title', 6, 20, style.titleSize, true], ['description', 28.5, 39.5, style.descriptionSize, false], ['location', 71, 14, style.locationSize, true]
  ]) {
    let size = configuredSize;
    if (field !== 'description') while (size > 6 && width(input[field], size) > availableWidth) size--;
    const rows = [];
    for (const paragraph of input[field].replace(/\r\n?/g, '\n').split('\n')) {
      let row = '';
      for (const word of paragraph.trim().split(/\s+/).filter(Boolean)) {
        if (row && width(`${row} ${word}`, size) > availableWidth) { rows.push(row); row = ''; }
        row = row ? `${row} ${word}` : word;
      }
      if (row) rows.push(row);
    }
    const capacity = Math.floor(height * heightScale / (size * 1.2));
    if (rows.length > capacity || rows.some(row => width(row, size) > availableWidth)) warnings.push(field);
    for (const [index, row] of rows.slice(0, capacity).entries()) lines.push({ text: row, x: media.widthPt / 2, y: top * heightScale + size + index * size * 1.2,
      size, bold, width: Math.min(availableWidth, width(row, size)) });
  }
  return { ...media, lines, warnings };
}

function literal(value) {
  return [...Buffer.from(value, 'latin1')].map(byte => [40, 41, 92].includes(byte) ? `\\${String.fromCharCode(byte)}`
    : byte < 32 || byte > 126 ? `\\${byte.toString(8).padStart(3, '0')}` : String.fromCharCode(byte)).join('');
}

export function labelPostScript(layout) {
  const out = ['%!PS-Adobe-3.0', '%%Pages: 1', `%%BoundingBox: 0 0 ${layout.widthPt} ${layout.heightPt}`, `<< /PageSize [${layout.widthPt} ${layout.heightPt}] /NumCopies 1 >> setpagedevice`];
  for (const [name, font] of [['Regular', 'Helvetica'], ['Bold', 'Helvetica-Bold']]) out.push(`/${name} /${font} findfont dup length dict begin {1 index /FID ne {def} {pop pop} ifelse} forall /Encoding ISOLatin1Encoding def currentdict end definefont pop`);
  for (const line of layout.lines) out.push(`gsave /${line.bold ? 'Bold' : 'Regular'} findfont ${line.size} scalefont setfont`,
    `${line.x - line.width / 2} ${layout.heightPt - line.y} translate (${literal(line.text)}) dup stringwidth pop dup 0 gt { ${line.width} exch div 1 scale } { pop } ifelse 0 0 moveto show grestore`);
  out.push('showpage', '%%EOF');
  return Buffer.from(out.join('\n') + '\n', 'ascii');
}
