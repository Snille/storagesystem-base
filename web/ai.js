import { t, tr, roleName } from './i18n.js';

export function mountAi(request, message, chooseBoxPhotos) {
  const $ = id => document.getElementById(id);
  let state; let editingId; let album; let chosen; let running = false; let generation = 0;
  const modelLists = new Map();
  const data = async (path, payload, method = 'POST') => (await request(`ai/${path}`, payload === undefined ? {} : { method, body: JSON.stringify(payload) })).json();
  const fail = error => { $('ai-status').textContent = t(error.message); $('ai-status').classList.add('error'); };
  const status = value => { $('ai-status').textContent = value; $('ai-status').classList.remove('error'); };
  const connectionFields = c => ({ id: c.id, name: c.name, provider: c.provider, baseUrl: c.baseUrl });
  const taskValue = () => ({ connectionId: $('ai-task-connection').value, model: $('ai-model').value.trim(), language: $('ai-language').value, extraInstructions: $('ai-extra').value,
    fallbackConnectionId: $('ai-fallback-connection').value, fallbackModel: $('ai-fallback-model').value.trim() });
  const taskFields = ['connectionId', 'model', 'language', 'extraInstructions', 'fallbackConnectionId', 'fallbackModel'];
  const taskDirty = () => JSON.stringify(taskValue()) !== JSON.stringify({ fallbackConnectionId: '', fallbackModel: '', ...state.imageInventory }, taskFields);
  function page(name) {
    for (const id of ['overview', 'connections', 'images']) $(`ai-${id}`).hidden = id !== name;
    for (const button of document.querySelectorAll('[data-ai-page]')) {
      const active = button.dataset.aiPage === name;
      button.classList.toggle('quiet', !active); if (active) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
    }
    status('');
  }
  function selectConnection(id) {
    editingId = id || crypto.randomUUID();
    const c = state.connections.find(c => c.id === id);
    $('ai-connection-form').reset(); $('ai-connection-picker').value = id || '';
    $('ai-connection-name').value = c?.name || '';
    $('ai-provider').value = c?.provider || 'openrouter'; $('ai-base-url').value = c?.baseUrl || 'https://openrouter.ai/api/v1';
    $('ai-base-url').readOnly = $('ai-provider').value === 'openrouter';
    $('ai-key-status').textContent = c?.apiKeyConfigured ? t('A key is saved. Its value is never returned to this page.') : t('No key saved for this connection.');
    $('ai-connection-test').textContent = c?.lastTest ? tr('Model list loaded at {0}. This does not verify image analysis.', new Date(c.lastTest.at).toLocaleString()) : t('This connection has not been tested with its current saved settings during this server session.');
    $('ai-test-connection').disabled = !c;
  }
  function populate() {
    const task = state.imageInventory;
    $('ai-connection-picker').replaceChildren(new Option(t('New connection…'), ''));
    $('ai-task-connection').replaceChildren(new Option(t('Choose a connection…'), ''));
    $('ai-fallback-connection').replaceChildren(new Option(t('No fallback'), ''));
    for (const c of state.connections) {
      $('ai-connection-picker').add(new Option(c.name, c.id)); $('ai-task-connection').add(new Option(c.name, c.id)); $('ai-fallback-connection').add(new Option(c.name, c.id));
    }
    $('ai-task-connection').value = task.connectionId; $('ai-model').value = task.model; $('ai-language').value = task.language; $('ai-extra').value = task.extraInstructions;
    $('ai-fallback-connection').value = task.fallbackConnectionId || ''; $('ai-fallback-model').value = task.fallbackModel || '';
    $('ai-default-instructions').textContent = state.defaultInstructions;
    $('ai-legacy').hidden = !state.legacySettingsPresent;
    const c = state.connections.find(c => c.id === task.connectionId);
    $('ai-overview-model').textContent = c && task.model ? `${c.name} · ${task.model}` : t('Start by saving a connection and choosing an image model.');
    updateModels(); updateTask();
  }
  function updateModels() {
    const list = modelLists.get(`${state.revision}:${$('ai-task-connection').value}`);
    $('ai-models').replaceChildren();
    for (const model of list || []) if (model.imageInput !== false && model.textOutput !== false) $('ai-models').append(new Option(model.name, model.id));
    $('ai-model-help').textContent = list ? tr('{0} models listed with image support or unreported capabilities. A successful image test is still required.', $('ai-models').options.length) : t('Load models or enter an exact model ID. Image support is confirmed only by an image test.');
  }
  function updateTask() {
    if (!state) return;
    const dirty = taskDirty(); const c = state.connections.find(c => c.id === state.imageInventory.connectionId);
    $('ai-custom').textContent = $('ai-extra').value.trim() ? t('· Custom') : t('· Default');
    const names = { en: t('English'), sv: t('Swedish'), de: t('German') };
    $('ai-language-help').textContent = $('ai-language').value === 'app' ? tr('New AI descriptions use the external response language: {0}. Interface language is independent.', names[state.responseLanguage] || state.responseLanguage) : tr('New AI descriptions and keywords use {0}. This does not change the interface or existing inventory.', names[$('ai-language').value]);
    $('ai-task-state').textContent = dirty ? t('Unsaved changes. Save before trying a photo.') : t('Using the saved settings.');
    $('ai-run-preview').disabled = running || dirty || !chosen || !c || !state.imageInventory.model;
    $('ai-role-help').textContent = t(state.roleHelp[$('ai-photo-role').value] || t('The model suggests a role for this test. Choosing a role yourself takes precedence.'));
    $('ai-send-description').textContent = c && chosen ? tr('Send a preview image of “{0}” to {1} ({2}) using {3}. This service may process it remotely and may charge for the request. No inventory is saved.', chosen.fileName, c.name, c.baseUrl, state.imageInventory.model || t('a model selected in AI assistance')) : t('Choose a saved connection, a model and a test photo first. No photos are sent until you run analysis.');
  }
  async function save(connections, task) {
    state = await data('settings', { revision: state.revision, connections, imageInventory: task }, 'PUT');
    modelLists.clear(); populate();
  }
  async function loadModels(id) {
    if (!id) throw new Error(t('Save and choose a connection first.'));
    const response = await data('models', { revision: state.revision, connectionId: id });
    modelLists.set(`${state.revision}:${id}`, response.models); updateModels();
    const c = state.connections.find(c => c.id === id); c.lastTest = response.tested;
    return tr('Connection responded with {0} models in {1} ms. Image analysis has not been tested by this check.', response.models.length, response.tested.elapsedMs);
  }
  $('open-ai').addEventListener('click', async () => {
    try {
      state = await data('settings'); album = null; chosen = null; generation++;
      $('ai-test-photos').replaceChildren(); $('ai-photos-status').textContent = ''; $('ai-result').hidden = true;
      $('ai-preview-status').textContent = ''; populate(); selectConnection(state.connections[0]?.id); page('overview'); $('ai-dialog').showModal();
    } catch (error) { message(error.message, true); }
  });
  $('close-ai').addEventListener('click', () => $('ai-dialog').close());
  $('ai-dialog').addEventListener('close', () => { $('ai-api-key').value = ''; generation++; });
  for (const button of document.querySelectorAll('[data-ai-page]')) button.addEventListener('click', () => page(button.dataset.aiPage));
  $('ai-go-images').addEventListener('click', () => page('images'));
  $('ai-go-box').addEventListener('click', () => { $('ai-dialog').close(); chooseBoxPhotos(); });
  $('ai-connection-picker').addEventListener('change', () => selectConnection($('ai-connection-picker').value));
  $('ai-new-connection').addEventListener('click', () => selectConnection());
  $('ai-provider').addEventListener('change', () => {
    $('ai-base-url').readOnly = $('ai-provider').value === 'openrouter';
    $('ai-base-url').value = $('ai-provider').value === 'openrouter' ? 'https://openrouter.ai/api/v1' : '';
    $('ai-api-key').value = ''; $('ai-key-status').textContent = t('Supply credentials for the new destination, if required.');
  });
  $('ai-connection-form').addEventListener('submit', async event => {
    event.preventDefault(); $('ai-save-connection').disabled = true;
    try {
      const submitted = { id: editingId, name: $('ai-connection-name').value, provider: $('ai-provider').value, baseUrl: $('ai-base-url').value, apiKey: $('ai-api-key').value, clearCredentials: $('ai-clear-key').checked };
      const list = state.connections.filter(c => c.id !== editingId).map(connectionFields); list.push(submitted);
      const { resolvedLanguage, ...task } = state.imageInventory;
      if (!task.connectionId) task.connectionId = editingId;
      await save(list, task); selectConnection(editingId); status(t('Connection saved. Test it before choosing an image model.'));
    } catch (error) { fail(error); } finally { $('ai-save-connection').disabled = false; }
  });
  $('ai-test-connection').addEventListener('click', async () => {
    $('ai-test-connection').disabled = true; $('ai-connection-test').textContent = t('Testing the saved connection…');
    try { $('ai-connection-test').textContent = await loadModels(editingId); } catch (error) { $('ai-connection-test').textContent = error.message; }
    finally { $('ai-test-connection').disabled = false; }
  });
  $('ai-load-models').addEventListener('click', async () => {
    $('ai-load-models').disabled = true;
    try { status(await loadModels($('ai-task-connection').value)); } catch (error) { fail(error); }
    finally { $('ai-load-models').disabled = false; }
  });
  $('ai-task-connection').addEventListener('change', updateModels);
  $('ai-image-form').addEventListener('input', updateTask); $('ai-image-form').addEventListener('change', updateTask);
  $('ai-reset-instructions').addEventListener('click', () => { $('ai-extra').value = ''; updateTask(); });
  $('ai-image-form').addEventListener('submit', async event => {
    event.preventDefault(); $('ai-save-task').disabled = true;
    try { await save(state.connections.map(connectionFields), taskValue()); status(t('Image settings saved. You can now try a photo.')); }
    catch (error) { fail(error); } finally { $('ai-save-task').disabled = false; }
  });
  $('ai-photo-role').addEventListener('change', updateTask);
  $('ai-load-photos').addEventListener('click', async () => {
    const current = ++generation; $('ai-load-photos').disabled = true; $('ai-photos-status').textContent = t('Reading the configured album…');
    chosen = null; album = null; $('ai-test-photos').replaceChildren(); updateTask();
    try {
      const response = await (await request('album?refresh=true')).json();
      if (current !== generation) return;
      album = response; $('ai-photos-status').textContent = tr('{0} photos available. Select one to try. Existing photo assignments are not changed.', album.assets.length);
      for (const asset of album.assets) {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'album-photo';
        button.setAttribute('aria-label', tr('Test {0}', asset.fileName)); button.setAttribute('aria-pressed', 'false');
        const img = document.createElement('img'); img.src = asset.previewUrl || asset.thumbnailUrl; img.alt = asset.fileName; img.loading = 'lazy';
        const name = document.createElement('span'); name.className = 'photo-name'; name.textContent = asset.fileName;
        button.append(img, name); button.addEventListener('click', () => {
          chosen = asset; for (const peer of $('ai-test-photos').children) peer.setAttribute('aria-pressed', String(peer === button)); updateTask();
        }); $('ai-test-photos').append(button);
      }
    } catch (error) { if (current === generation) $('ai-photos-status').textContent = error.message; }
    finally { $('ai-load-photos').disabled = false; }
  });
  $('ai-run-preview').addEventListener('click', async () => {
    if (running || taskDirty() || !chosen || !album) return;
    const current = generation; running = true; updateTask(); $('ai-result').hidden = true;
    $('ai-preview-status').textContent = t('Reading the photo and asking the selected model… This can take up to 90 seconds.');
    try {
      const response = await data('preview', { revision: state.revision, sourceRevision: album.sourceRevision, assetId: chosen.id, role: $('ai-photo-role').value });
      if (current !== generation) return;
      for (const field of ['role', 'label', 'summary', 'keywords', 'uncertainties']) $('ai-result-' + field).textContent = (field === 'role' ? roleName(response.result.role) : field === 'keywords' ? response.result[field].join(', ') : response.result[field]) || t('None provided');
      $('ai-result-meta').textContent = `${response.input.fileName} · ${response.connection.name} · ${response.connection.model} · ${response.language} · ${(response.elapsedMs / 1000).toFixed(1)} s${response.fallback ? ` · ${tr('fallback used: {0}', t(response.fallback.reason))}` : ''}`;
      $('ai-result').hidden = false; $('ai-preview-status').textContent = t('Analysis complete. Nothing has been saved to inventory.');
    } catch (error) { if (current === generation) $('ai-preview-status').textContent = error.message; }
    finally { running = false; updateTask(); }
  });
}
