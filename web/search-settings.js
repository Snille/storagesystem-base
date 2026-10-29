import { t, tr, uiLanguage } from './i18n.js';

export function mountSearchSettings(request, message) {
  const $ = id => document.getElementById(id);
  let state, boxes = [], models = [], editingId = null, generation = 0, busy = false, timer;
  let historyNext = null, historyGeneration = 0;
  const dialog = $('search-settings-dialog');
  const node = (tag, value, className) => { const e = document.createElement(tag); if (value !== undefined) e.textContent = value; if (className) e.className = className; return e; };
  const api = async (path, payload, method = 'POST') => (await request(path, payload === undefined ? {} : { method, body: JSON.stringify(payload) })).json();
  const status = (value, error = false) => { $('search-settings-status').textContent = value; $('search-settings-status').classList.toggle('error', error); };
  const location = box => Object.values(box.location || {}).filter(Boolean).join(' · ');
  const boxName = id => { const box = boxes.find(b => b.boxId === id); return box ? `${box.label} · ${location(box)}` : tr('Unavailable box: {0}', id); };
  const actionNames = { any: 'Either location is fine', all: 'Return both locations', clarify: 'Ask which type', prefer: 'Use this location' };
  const fields = () => ({ enabled: $('search-enabled').checked, baseUrl: $('search-server').value.trim().replace(/\/+$/, ''), model: $('search-model').value.trim(),
    modelRevision: $('search-model-revision').value.trim(), dimensions: Number($('search-dimensions').value) });
  const savedFields = () => Object.fromEntries(Object.keys(fields()).map(key => [key, state.embedding[key]]));
  const verificationFields = () => ({ enabled: $('search-verification-enabled').checked, baseUrl: $('search-verification-server').value.trim().replace(/\/+$/, ''),
    model: $('search-verification-model').value.trim(), timeoutMs: Number($('search-verification-timeout').value),
    similarity: $('search-verification-similarity').value === '' ? null : Number($('search-verification-similarity').value),
    margin: $('search-verification-margin').value === '' ? null : Number($('search-verification-margin').value) });
  const savedVerificationFields = () => Object.fromEntries(Object.keys(verificationFields()).map(key => [key, state.verification[key]]));
  const modelDirty = () => state && (JSON.stringify(fields()) !== JSON.stringify(savedFields()) || $('search-key').value !== '' || $('search-clear-key').checked
    || JSON.stringify(verificationFields()) !== JSON.stringify(savedVerificationFields()) || $('search-verification-key').value !== '' || $('search-verification-clear-key').checked
    || $('search-public-enabled').checked !== state.publicEnabled);
  function updateDirty() {
    const dirty = modelDirty();
    for (const button of dialog.querySelectorAll('button[type="submit"]')) button.disabled = busy;
    $('search-load-models').disabled = busy || dirty || !state?.embedding.baseUrl;
    $('search-run-preview').disabled = busy || dirty;
    $('search-retry-index').disabled = busy || dirty || !state?.embedding.enabled;
    for (const button of document.querySelectorAll('[data-rule-action], #search-add-rule')) button.disabled = busy || dirty;
    if (dirty) { generation++; $('search-preview-result').hidden = true; }
  }
  function page(name) {
    for (const id of ['history', 'rules', 'model', 'preview']) $(`search-page-${id}`).hidden = name !== id;
    for (const button of document.querySelectorAll('[data-search-page]')) {
      const active = button.dataset.searchPage === name; button.classList.toggle('quiet', !active);
      if (active) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
    }
    if (name === 'history') loadHistory();
  }
  async function loadHistory(before) {
    const token = ++historyGeneration;
    const params = new URLSearchParams({ q: $('search-history-query').value.trim(), source: $('search-history-source').value });
    if (before) params.set('before', before);
    $('search-history-status').textContent = t('Loading search log…');
    $('search-history-older').disabled = true;
    try {
      const result = await api(`search-history?${params}`);
      if (!dialog.open || token !== historyGeneration) return;
      historyNext = result.next;
      const sources = { web: 'Web', api: 'API / Home Assistant', mcp: 'MCP', preview: 'Preview' };
      const modes = { search: 'Search', ask: 'Question and answer', preview: 'Preview' };
      const cards = result.entries.map(entry => {
        const card = node('article', undefined, 'search-history-entry');
        const date = new Date(entry.createdAt).toLocaleString(uiLanguage() === 'sv' ? 'sv-SE' : 'en-GB');
        card.append(node('h4', entry.query), node('p', `${date} · ${t(sources[entry.source])} · ${t(modes[entry.mode])} · ${entry.count === 1 ? t('1 match') : tr('{0} matches', entry.count)} · ${entry.durationMs} ms`, 'hint'));
        if (entry.outcome === 'error') card.append(node('p', t('The request failed.'), 'error'));
        else if (entry.answer) {
          card.append(node('p', entry.answer), node('p', t(entry.answerSource === 'ai' ? 'AI answer' : entry.answerSource === 'decision-preview' ? 'Decision preview' : entry.answerSource === 'semantic' ? 'Semantic inventory answer' : 'Local answer'), 'hint'));
        } else card.append(node('p', t('Search results only; no answer was generated.'), 'hint'));
        if (entry.queryTruncated || entry.answerTruncated) card.append(node('p', t('Stored text was shortened.'), 'hint'));
        if (entry.matches.length) {
          const details = node('details'); details.append(node('summary', t('Matching boxes')));
          const list = node('ul'); list.append(...entry.matches.map(m => node('li', `${m.label} · ${m.location}`)));
          details.append(list); card.append(details);
        }
        return card;
      });
      $('search-history-list').replaceChildren(...cards);
      $('search-history-status').textContent = cards.length === 1 ? t('Showing 1 search.') : cards.length ? tr('Showing {0} searches, newest first.', cards.length) : t('No searches recorded for this filter.');
      $('search-history-older').disabled = !historyNext;
    } catch (error) {
      if (dialog.open && token === historyGeneration) {
        historyNext = null; $('search-history-list').replaceChildren(); $('search-history-status').textContent = t(error.message);
      }
    }
  }
  async function refreshStatus() {
    clearTimeout(timer);
    if (!dialog.open) return;
    try {
      const result = await api('semantic');
      if (!dialog.open) return;
      $('search-index-status').textContent = !result.enabled ? t('Embeddings are disabled. Saved answer rules can still be tried.')
        : result.ready !== undefined ? tr('Index: {0} · {1} of {2} boxes current.', t(result.state), result.ready, result.total)
          : tr('Index: {0}', t(result.state));
      if (result.enabled && ['building', 'configuring', 'pending'].includes(result.state)) timer = setTimeout(refreshStatus, 1000);
    } catch (error) { if (dialog.open) $('search-index-status').textContent = t(error.message); }
  }
  function ruleList() {
    const list = $('search-rules-list'); list.replaceChildren();
    if (!state.rules.length) list.append(node('p', t('No answer rules saved yet.'), 'hint'));
    for (const rule of state.rules) {
      const card = node('article', undefined, 'search-rule-card');
      card.append(node('h4', rule.queries.join(' / ')), node('p', t(actionNames[rule.action])), node('p', rule.boxIds.map(boxName).join('\n'), 'hint'));
      if (rule.question) card.append(node('p', rule.question[uiLanguage()] || rule.question.en || Object.values(rule.question)[0]));
      const actions = node('div', undefined, 'actions');
      for (const [action, text] of [['edit', 'Edit rule'], ['remove', 'Remove rule']]) {
        const button = node('button', t(text), 'quiet'); button.type = 'button'; button.dataset.ruleAction = action;
        button.addEventListener('click', async () => {
          if (modelDirty()) return status(t('Save embedding changes before editing rules.'), true);
          if (action === 'edit') { editRule(rule); return; }
          try { await save(savedFields(), state.rules.filter(r => r.id !== rule.id)); status(t('Answer rule removed.')); }
          catch (error) { status(t(error.message), true); }
        }); actions.append(button);
      }
      card.append(actions); list.append(card);
    }
  }
  function populate() {
    const e = state.embedding;
    $('search-public-enabled').checked = state.publicEnabled;
    $('search-enabled').checked = e.enabled; $('search-server').value = e.baseUrl; $('search-model').value = e.model;
    $('search-model-revision').value = e.modelRevision; $('search-dimensions').value = e.dimensions;
    $('search-key').value = ''; $('search-clear-key').checked = false;
    $('search-key-status').textContent = t(e.apiKeyConfigured ? 'A key is saved. Its value is never returned to this page.' : 'No key saved for this connection.');
    const v = state.verification;
    $('search-verification-enabled').checked = v.enabled; $('search-verification-server').value = v.baseUrl;
    $('search-verification-model').value = v.model; $('search-verification-timeout').value = v.timeoutMs;
    $('search-verification-similarity').value = v.similarity ?? ''; $('search-verification-margin').value = v.margin ?? '';
    $('search-verification-key').value = ''; $('search-verification-clear-key').checked = false;
    $('search-verification-key-status').textContent = t(v.apiKeyConfigured ? 'A key is saved. Its value is never returned to this page.' : 'No key saved for this connection.');
    $('search-environment-note').hidden = !state.usingEnvironment;
    $('search-rule-form').hidden = true; $('search-preview-result').hidden = true; editingId = null;
    ruleList(); updateDirty();
  }
  async function save(embedding, rules, verification = savedVerificationFields(), publicEnabled = state.publicEnabled) {
    busy = true; updateDirty(); generation++;
    try {
      state = await api('search-settings', { revision: state.revision, embedding, rules, verification, publicEnabled }, 'PUT');
      models = []; $('search-models').replaceChildren(); populate(); await refreshStatus();
    } finally { busy = false; updateDirty(); }
  }
  function editRule(rule) {
    editingId = rule?.id || crypto.randomUUID(); $('search-rule-form').reset();
    $('search-rule-queries').value = (rule?.queries || []).join('\n'); $('search-rule-action').value = rule?.action || 'any';
    for (const lang of ['sv', 'en', 'de']) $(`search-rule-${lang}`).value = rule?.question?.[lang] || '';
    $('search-rule-questions').hidden = $('search-rule-action').value !== 'clarify';
    const choices = $('search-rule-boxes'); choices.replaceChildren();
    const ids = [...new Set([...boxes.map(box => box.boxId), ...(rule?.boxIds || [])])];
    for (const id of ids) {
      const label = node('label', undefined, 'check-label'); const input = node('input'); input.type = 'checkbox'; input.value = id;
      input.checked = Boolean(rule?.boxIds.includes(id)); label.append(input, node('span', boxName(id))); choices.append(label);
    }
    $('search-rule-form').hidden = false; $('search-rule-queries').focus();
  }
  $('open-search-settings').addEventListener('click', async () => {
    try {
      [state, { boxes }] = await Promise.all([api('search-settings'), api('boxes')]);
      generation++; models = []; $('search-models').replaceChildren(); status(''); populate();
      dialog.showModal(); page('history'); await refreshStatus();
    } catch (error) { message(error.message, true); }
  });
  $('close-search-settings').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => { generation++; historyGeneration++; clearTimeout(timer); $('search-key').value = ''; $('search-verification-key').value = ''; });
  $('search-history-filter').addEventListener('submit', event => { event.preventDefault(); loadHistory(); });
  $('search-history-source').addEventListener('change', () => loadHistory());
  $('search-history-newest').addEventListener('click', () => loadHistory());
  $('search-history-older').addEventListener('click', () => { if (historyNext) loadHistory(historyNext); });
  for (const button of document.querySelectorAll('[data-search-page]')) button.addEventListener('click', () => page(button.dataset.searchPage));
  $('search-model-form').addEventListener('input', () => { status(t('Save changes before loading models or trying a question.')); updateDirty(); });
  $('search-model').addEventListener('change', () => {
    const model = models.find(m => m.name === $('search-model').value);
    if (model) $('search-model-revision').value = model.digest;
    updateDirty();
  });
  $('search-model-form').addEventListener('submit', async event => {
    event.preventDefault();
    try {
      await save({ ...fields(), apiKey: $('search-key').value, clearCredentials: $('search-clear-key').checked }, state.rules,
        { ...verificationFields(), apiKey: $('search-verification-key').value, clearCredentials: $('search-verification-clear-key').checked }, $('search-public-enabled').checked);
      status(t('Search model settings saved.'));
    }
    catch (error) { status(t(error.message), true); }
  });
  $('search-load-models').addEventListener('click', async () => {
    const token = ++generation; busy = true; updateDirty(); status(t('Loading models…'));
    try {
      const result = await api('search-settings/models', { revision: state.revision });
      if (!dialog.open || token !== generation) return;
      models = result.models; $('search-models').replaceChildren(...models.map(model => new Option(model.name, model.name)));
      const current = models.find(model => model.name === $('search-model').value);
      if (current) $('search-model-revision').value = current.digest;
      status(tr('{0} models loaded. Choose an embedding model and save its settings.', models.length));
    } catch (error) { if (dialog.open && token === generation) status(t(error.message), true); }
    finally { busy = false; updateDirty(); }
  });
  $('search-retry-index').addEventListener('click', async () => {
    try { await api('semantic/rebuild', {}); await refreshStatus(); } catch (error) { status(t(error.message), true); }
  });
  $('search-add-rule').addEventListener('click', () => editRule());
  $('search-cancel-rule').addEventListener('click', () => { $('search-rule-form').hidden = true; editingId = null; });
  $('search-rule-action').addEventListener('change', () => { $('search-rule-questions').hidden = $('search-rule-action').value !== 'clarify'; });
  $('search-rule-filter').addEventListener('input', () => {
    const query = $('search-rule-filter').value.toLocaleLowerCase();
    for (const label of $('search-rule-boxes').children) label.hidden = !label.textContent.toLocaleLowerCase().includes(query);
  });
  $('search-rule-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (modelDirty()) return status(t('Save embedding changes before editing rules.'), true);
    const action = $('search-rule-action').value;
    const rule = { id: editingId, queries: $('search-rule-queries').value.split('\n').map(q => q.trim()).filter(Boolean), action,
      boxIds: [...$('search-rule-boxes').querySelectorAll('input:checked')].map(input => input.value) };
    if (action === 'clarify') rule.question = Object.fromEntries(['en', 'sv', 'de'].map(lang => [lang, $(`search-rule-${lang}`).value.trim()]).filter(([, q]) => q));
    try {
      await save(savedFields(), [...state.rules.filter(r => r.id !== rule.id), rule]); status(t('Answer rule saved.'));
    } catch (error) { status(t(error.message), true); }
  });
  $('search-preview-query').addEventListener('input', () => { generation++; $('search-preview-result').hidden = true; });
  $('search-preview-form').addEventListener('submit', async event => {
    event.preventDefault(); const token = ++generation; busy = true; updateDirty(); status(t('Checking saved rules…'));
    try {
      const result = await api(`semantic/preview?lang=${uiLanguage()}`, { query: $('search-preview-query').value, revision: state.revision });
      if (!dialog.open || token !== generation) return;
      $('search-preview-answer').textContent = result.answer;
      const decisions = { answer: 'Supported answer', clarify: 'Clarification needed', no_supported_match: 'No supported match' };
      $('search-preview-meta').textContent = `${t(decisions[result.decision])} · ${t(result.retrieval.available ? 'Embeddings available' : 'Direct evidence and saved rules only')}`;
      const reasons = { conflicting_rules: 'Several saved rules match this question. Review their questions.',
        rule_evidence_missing: 'A selected box no longer supports this rule. Review its contents.' };
      if (reasons[result.reason]) $('search-preview-meta').textContent += ` · ${t(reasons[result.reason])}`;
      const verificationOutcomes = { supported: 'Identity supported by current inventory', unsupported: 'Item identity was not supported',
        unavailable: 'Identity verification unavailable or timed out', invalid: 'Invalid identity response', busy: 'Identity verifier busy', oversized: 'Inventory text exceeds the verification limit' };
      if (verificationOutcomes[result.verification?.outcome]) $('search-preview-meta').textContent += ` · ${t(verificationOutcomes[result.verification.outcome])}`;
      $('search-preview-matches').replaceChildren(...result.matches.map(box => node('li', `${box.label} · ${location(box)}`)));
      $('search-preview-result').hidden = false; status(t('Preview complete. No inventory was changed.'));
    } catch (error) { if (dialog.open && token === generation) status(t(error.message), true); }
    finally { busy = false; updateDirty(); }
  });
}
