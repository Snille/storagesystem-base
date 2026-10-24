import english from './locales/en.js';
import swedish from './locales/sv.js';

let language = 'en';
const staticText = [], staticAttributes = [];
export const uiLanguage = () => language;
export function t(value) { return (language === 'sv' ? swedish : english)[value] ?? value; }
export function tr(source, ...values) { return t(source).replace(/\{(\d+)\}/g, (_, index) => String(values[Number(index)] ?? '')); }
export function roleName(role) { return t({ label: 'Label photo', location: 'Storage location', inside: 'Inside', spread: 'Spread', detail: 'Detail', auto: 'Suggest a role' }[role] || role); }

// Only capture application-owned markup once. Inventory content and model output
// inserted later are never run through the translation catalog.
export async function initializeLanguage() {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.textContent.trim()) staticText.push({ node, source: node.textContent, rendered: node.textContent });
  }
  for (const node of document.querySelectorAll('[placeholder], [aria-label], [title]')) {
    for (const attribute of ['placeholder', 'aria-label', 'title']) if (node.hasAttribute(attribute)) {
      const source = node.getAttribute(attribute); staticAttributes.push({ node, attribute, source, rendered: source });
    }
  }
  try { const response = await fetch('/api/interface-language'); if (response.ok) setLanguage((await response.json()).language); } catch { }
}

export function setLanguage(next) {
  language = next === 'sv' ? 'sv' : 'en'; document.documentElement.lang = language;
  for (const item of staticText) {
    if (!item.node.isConnected || item.node.textContent !== item.rendered) continue;
    item.rendered = item.source.replace(/\S(?:[\s\S]*\S)?/, source => t(source));
    item.node.textContent = item.rendered;
  }
  for (const item of staticAttributes) {
    if (!item.node.isConnected || item.node.getAttribute(item.attribute) !== item.rendered) continue;
    item.rendered = t(item.source); item.node.setAttribute(item.attribute, item.rendered);
  }
}
