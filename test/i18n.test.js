import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import english from '../web/locales/en.js';
import swedish from '../web/locales/sv.js';

const web = new URL('../web/', import.meta.url);
// Names, addresses and sample input stay the same in every language.
const untranslated = new Set(['Storage System', 'Svenska', 'Immich', 'PhotoPrism', 'OpenRouter', 'http://10.0.0.25:3230', 'https://photos.example.com',
  'https://openrouter.ai/api/v1', 'https://storage.example.com','http://ollama-host:11434', 'bge-m3:cpu4', 'Ska det vara en färdig nätverkskabel?', 'Var finns tejpen?']);

function interfaceStrings() {
  const found = new Set();
  for (const file of readdirSync(web).filter(f => f.endsWith('.js'))) {
    for (const m of readFileSync(new URL(file, web), 'utf8').matchAll(/\b(?:t|tr)\(\s*(['"`])((?:\\.|(?!\1).)*)\1/g)) if (!m[2].includes('${')) found.add(m[2].replace(/\\'/g, "'"));
  }
  const html = readFileSync(new URL('index.html', web), 'utf8').replace(/<script[\s\S]*?<\/script>/g, '');
  const decode = s => s.replace(/&amp;/g, '&');
  for (const m of html.matchAll(/>([^<>]+)</g)) { const s = m[1].trim(); if (/[A-Za-z]/.test(s) && !s.includes('{{')) found.add(decode(s)); }
  for (const m of html.matchAll(/(?:placeholder|aria-label|title)="([^"]+)"/g)) found.add(decode(m[1]));
  return [...found].filter(s => !untranslated.has(s));
}

test('every interface string is in the English and Swedish language files', () => {
  const missing = interfaceStrings().filter(s => !(s in english) || !(s in swedish));
  assert.deepEqual(missing, []);
});

test('English and Swedish language files have the same keys and no empty texts', () => {
  assert.deepEqual(Object.keys(english).sort(), Object.keys(swedish).sort());
  for (const catalog of [english, swedish]) for (const [key, value] of Object.entries(catalog)) assert.ok(typeof value === 'string' && value.trim(), key);
});
