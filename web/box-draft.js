export function mountBoxDraft(request, apply) {
  const $ = id => document.getElementById(id);
  let photos = []; let settings; let sourceRevision; let draft; let generation = 0; let running = false;
  const roles = { auto: 'Suggest a role', label: 'Label', inside: 'Inside a box', spread: 'Spread-out contents', location: 'Storage location', detail: 'Detail / close-up' };
  const node = (tag, value, className) => { const n = document.createElement(tag); if (value !== undefined) n.textContent = value; if (className) n.className = className; return n; };
  function state() {
    const c = settings?.connections.find(c => c.id === settings.imageInventory.connectionId);
    $('box-draft-run').disabled = running || !photos.length || !c || !settings.imageInventory.model;
    $('box-draft-apply').disabled = running || !draft;
    $('box-draft-disclosure').textContent = c ? `Send ${photos.length} preview images to ${c.name} (${c.baseUrl}) using ${settings.imageInventory.model || 'a model selected in AI assistance'}. These photos must show the same box or its contents. This service may process them remotely and may charge for the request. No inventory is saved by analysis.` : 'Configure an image connection and model in AI assistance first. Your photo selection is kept here.';
  }
  function invalidate() {
    if (draft) $('box-draft-status').textContent = 'Photos or roles changed. Analyze again to build an updated suggestion.';
    draft = null; $('box-draft-result').hidden = true; state();
  }
  function renderPhotos() {
    const area = $('box-draft-photos'); area.replaceChildren();
    for (const photo of photos) {
      const row = node('div', undefined, 'session-photo'); const image = node('img'); image.src = photo.thumbnailUrl; image.alt = photo.fileName;
      const info = node('div'); info.append(node('p', photo.fileName, 'hint'));
      const label = node('label', 'Photo role'); const select = node('select'); select.disabled = running; select.setAttribute('aria-label', `Draft role for ${photo.fileName}`);
      for (const [value, name] of Object.entries(roles)) select.add(new Option(name, value)); select.value = photo.role;
      const help = node('p', settings?.roleHelp[photo.role] || 'Suggest the main purpose of this photo.', 'hint');
      select.addEventListener('change', () => { photo.role = select.value; help.textContent = settings?.roleHelp[photo.role] || 'Suggest the main purpose of this photo.'; invalidate(); });
      label.append(select); info.append(label, help);
      const remove = node('button', 'Remove', 'quiet'); remove.type = 'button'; remove.disabled = running; remove.setAttribute('aria-label', `Remove ${photo.fileName} from AI draft`);
      remove.addEventListener('click', () => { photos = photos.filter(p => p !== photo); invalidate(); renderPhotos(); });
      row.append(image, info, remove); area.append(row);
    }
  }
  $('box-draft-close').addEventListener('click', () => $('box-draft-dialog').close());
  $('box-draft-dialog').addEventListener('close', () => { generation++; });
  $('box-draft-run').addEventListener('click', async () => {
    if (running || !photos.length || !settings) return;
    const current = generation; running = true; state(); renderPhotos();
    $('box-draft-status').textContent = 'Reading the selected photos and building one box draft… The AI request can take up to 90 seconds.';
    try {
      const response = await (await request('ai/draft', { method: 'POST', body: JSON.stringify({ revision: settings.revision, sourceRevision, photos: photos.map(p => ({ assetId: p.id, role: p.role })) }) })).json();
      if (current !== generation) return;
      draft = response;
      for (const field of ['label', 'summary', 'keywords', 'uncertainties']) $(`box-draft-${field}`).textContent = (field === 'keywords' ? draft.result[field].join(', ') : draft.result[field]) || 'None provided';
      $('box-draft-meta').textContent = `${draft.connection.name} · ${draft.connection.model} · ${draft.result.photos.length} photos · ${(draft.elapsedMs / 1000).toFixed(1)} s`;
      const perPhoto = $('box-draft-photo-notes'); perPhoto.replaceChildren();
      for (const photo of draft.result.photos) {
        const item = node('div', undefined, 'history-entry'); item.append(node('strong', `${roles[photo.role]} · ${photo.fileName}`), node('p', photo.description, 'hint')); perPhoto.append(item);
      }
      $('box-draft-result').hidden = false; $('box-draft-status').textContent = 'Draft ready. Review the combined description, then continue to the box form. Nothing has been saved.';
    } catch (error) { if (current === generation) $('box-draft-status').textContent = `${error.message} Your selected photos and any previous draft are kept.`; }
    finally { running = false; state(); renderPhotos(); }
  });
  $('box-draft-apply').addEventListener('click', () => {
    if (!draft || running) return;
    const selected = draft.result.photos.map(p => ({ ...p, thumbnailUrl: photos.find(photo => photo.id === p.assetId).thumbnailUrl }));
    $('box-draft-dialog').close(); apply({ ...draft, result: { ...draft.result, photos: selected } });
  });
  return {
    async open(selected, revision) {
      if (running) throw new Error('A box analysis is still running. Wait for it to finish before opening another draft.');
      const current = ++generation; sourceRevision = revision; settings = null; draft = null;
      photos = selected.map(p => ({ ...p, role: 'auto' })); $('box-draft-result').hidden = true;
      $('box-draft-status').textContent = 'Loading the saved image-analysis settings…'; state(); renderPhotos(); $('box-draft-dialog').showModal();
      try {
        const next = await (await request('ai/settings')).json();
        if (current !== generation) return;
        settings = next; renderPhotos(); state(); $('box-draft-status').textContent = 'Choose the purpose of each photo. Manual roles take precedence over suggestions.';
      } catch (error) { if (current === generation) $('box-draft-status').textContent = error.message; }
    }
  };
}
