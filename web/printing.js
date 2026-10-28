import { t, tr, uiLanguage } from './i18n.js';

// Labels are previewed and printed by the label service. The Printing dialog holds the connection and which templates
// each label type uses; the label dialog prints one box or location with one of those templates.
export function mountPrinting(request) {
  const $ = id => document.getElementById(id);
  const api = async (path, body, method = 'POST') => (await request(`printing${path}${path === "/preview" ? `?lang=${uiLanguage()}` : ""}`, body === undefined ? {} : { method, body: JSON.stringify(body) })).json();
  let state, target, preview, requestId, lastJob, busy = false, generation = 0, templates = [];
  const settingsStatus = text => { $('print-settings-status').textContent = text; };
  const status = text => { $('print-status').textContent = text; };
  const config = () => ({ enabled: $('print-enabled').checked, url: $('print-url').value.trim(), clearKey: $('print-clear-key').checked,
    ...($('print-key').value.trim() ? { apiKey: $('print-key').value.trim() } : {}) });
  const dirty = () => state && ($('print-enabled').checked !== state.config.enabled || $('print-url').value.trim() !== state.config.url
    || Boolean($('print-key').value.trim()) || $('print-clear-key').checked);
  const functionName = name => t(name === 'location' ? 'Location label' : 'Box label');
  // The label service names its built-in templates in English, so those names are translated here.
  const templateName = id => { const found = templates.find(x => x.id === id); return found ? (found.builtIn ? t(found.name) : found.name) : id; };
  // The name with what the operator needs to know before choosing it.
  function templateLabel(id, standard) {
    const found = templates.find(x => x.id === id);
    const notes = [standard && t('standard'), !found && templates.length && t('missing in the label service'), found && !found.fitsRoll && t('not for the loaded roll')].filter(Boolean);
    return `${templateName(id)}${notes.length ? ` (${notes.join(', ')})` : ''}`;
  }
  async function load() {
    state = await api(''); templates = [];
    if (state.config.enabled) { const result = await api('/templates'); templates = result.templates; state.functions = result.functions; }
  }

  // --- Printing: connection, label templates per label type and recent submissions ---

  // Per label type a standard template and other templates offered when printing, from those that suit the type.
  function functionSettings() {
    const list = $('print-function-list'); list.replaceChildren();
    for (const name of ['box', 'location']) {
      const choice = state.functions[name], suitable = templates.filter(x => x.functions.includes(name));
      const ids = [...new Set([...suitable.map(x => x.id), choice.default, ...choice.extra])];
      const set = document.createElement('fieldset'), legend = document.createElement('legend'); legend.textContent = functionName(name);
      const label = document.createElement('label'); label.textContent = t('Standard template');
      const select = document.createElement('select'); select.name = `${name}-default`;
      select.append(...ids.map(id => new Option(templateLabel(id), id))); select.value = choice.default; label.append(select);
      const extras = document.createElement('div'); extras.append(Object.assign(document.createElement('p'), { className: 'hint', textContent: t('Other templates to offer when printing') }));
      for (const id of ids) {
        const row = document.createElement('label'), box = document.createElement('input'); row.className = 'check-label';
        box.type = 'checkbox'; box.name = `${name}-extra`; box.value = id; box.checked = choice.extra.includes(id);
        row.append(box, templateLabel(id)); extras.append(row);
      }
      // The standard template is always offered, so it is not also an extra one.
      const sync = () => { for (const box of extras.querySelectorAll('input')) { box.disabled = box.value === select.value; if (box.disabled) box.checked = false; } };
      select.addEventListener('change', sync); sync();
      set.append(legend, label, extras); list.append(set);
    }
  }
  // jobId is the printer queue's job number inside the label service.
  const jobText = job => `${new Date(job.createdAt).toLocaleString()} · ${job.template ? templateName(job.template.id) : functionName(job.kind)} · ${job.state}${job.jobId ? ` · ${tr('printer job {0}', job.jobId)}` : ''}`;
  const jobStatus = (state, printer) => `${t('Print submission')}: ${state} · ${t('Printer')}: ${printer || t('unknown')}`;
  async function history() {
    const list = $('print-history'); list.replaceChildren();
    if (!state.config.enabled) return;
    const jobs = await api('/jobs');
    for (const job of jobs.jobs.slice(0, 20)) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'quiet'; button.textContent = jobText(job);
      button.addEventListener('click', () => run(settingsStatus, async () => {
        const result = await api(`/jobs/${job.id}`); settingsStatus(jobStatus(result.record.state, result.status?.state));
      })); list.append(button);
    }
  }
  function populate() {
    $('print-enabled').checked = state.config.enabled; $('print-url').value = state.config.url; $('print-key').value = ''; $('print-clear-key').checked = false;
    $('print-key').placeholder = t(state.config.apiKeyConfigured ? 'Leave blank to keep the saved key' : 'Enter the client key');
    $('print-admin').hidden = !state.config.url; if (state.config.url) $('print-admin').href = state.config.url;
    functionSettings(); controls();
  }
  function controls() {
    const ready = state?.config.enabled && !dirty();
    $('print-check').disabled = busy || !ready; $('print-save').disabled = busy; $('print-functions-save').disabled = busy || !ready;
    $('print-submit').disabled = busy || !preview?.printable || Boolean(lastJob);
    $('print-preview').disabled = busy || !state?.config.enabled; $('print-job-check').disabled = busy || !lastJob;
  }
  async function run(report, action) { busy = true; controls(); try { await action(); } catch (error) { report(error.message); } finally { busy = false; controls(); } }
  const openSettings = () => run(settingsStatus, async () => {
    settingsStatus(''); $('print-device-result').hidden = true; $('printing-dialog').showModal();
    await load(); populate(); await history();
  });
  $('open-printing').addEventListener('click', openSettings);
  $('close-printing').addEventListener('click', () => $('printing-dialog').close());
  $('print-config').addEventListener('input', () => { controls(); $('print-device-result').hidden = true; settingsStatus(t('Save settings before preparing a label.')); });
  $('print-config').addEventListener('submit', event => { event.preventDefault(); run(settingsStatus, async () => {
    await api('', { revision: state.revision, config: config() }, 'PUT'); await load(); populate(); settingsStatus(t('Print settings saved.'));
    await history();
  }); });
  $('print-check').addEventListener('click', () => run(settingsStatus, async () => {
    const result = $('print-device-result'); result.hidden = true;
    const s = await api('/status');
    const heading = document.createElement('h3'); heading.textContent = t('Label service and printer queue');
    const list = document.createElement('dl');
    for (const [key, value] of [
      ['Queue name', s.queue], ['Printer', s.model || t('unknown')], ['Queue state', t(s.state)],
      ['Accepting jobs', t(s.acceptingJobs ? 'Yes' : 'No')], ['Queued jobs', s.queuedJobs === undefined ? t('unknown') : String(s.queuedJobs)],
      ['Queue reasons', s.reasons.length ? s.reasons.join(', ') : t('unknown')],
      ['Selected label format', s.media?.name || t('unknown')], ['Observed at', new Date().toLocaleString()]
    ]) {
      const term = document.createElement('dt'), text = document.createElement('dd'); term.textContent = t(key); text.textContent = value; list.append(term, text);
    }
    const note = document.createElement('p'); note.className = 'hint';
    note.textContent = t('The selected format must match the loaded roll. Read the roll and change the format on the label service page.');
    result.replaceChildren(heading, list, note); result.hidden = false; settingsStatus('');
  }));
  $('print-functions').addEventListener('submit', event => { event.preventDefault(); run(settingsStatus, async () => {
    const form = new FormData($('print-functions'));
    const functions = Object.fromEntries(['box', 'location'].map(name => [name, { default: form.get(`${name}-default`), extra: form.getAll(`${name}-extra`) }]));
    state.functions = (await api('/templates', { functions }, 'PUT')).functions; functionSettings(); settingsStatus(t('Label templates saved.'));
  }); });

  // --- Print a label: one box or location, with one of its label type's templates ---

  const chosenTemplate = () => $('print-template').querySelector('input:checked')?.value;
  // The standard template first, then the others; a box starts on the template it was last printed with.
  function templateChoices(remembered) {
    const choice = state.functions[target.kind], ids = [choice.default, ...choice.extra];
    const selected = ids.includes(remembered) ? remembered : choice.default;
    $('print-template').replaceChildren(...ids.map(id => {
      const row = document.createElement('label'), radio = document.createElement('input'); row.className = 'choice';
      radio.type = 'radio'; radio.name = 'print-template'; radio.value = id; radio.checked = id === selected;
      row.append(radio, templateLabel(id, id === choice.default)); return row;
    }));
    // With a single template there is nothing to choose.
    $('print-template-row').hidden = ids.length < 2;
  }
  function invalidate() { generation++; preview = null; requestId = null; lastJob = null; $('print-paper').replaceChildren(); controls(); }
  function draw(layout, svgText) {
    if (svgText) {
      // An image element shows the label service's drawing without running anything inside it.
      const image = new Image(); image.alt = t('Label preview'); image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
      $('print-paper').replaceChildren(caption(layout), image); return;
    }
    const ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', `0 0 ${layout.widthPt} ${layout.heightPt}`); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', t('Label preview'));
    const scale = Math.min(570 / layout.widthPt, 360 / layout.heightPt);
    svg.style.width = `${layout.widthPt * scale}px`;
    const paper = document.createElementNS(ns, 'rect'); paper.setAttribute('width', '100%'); paper.setAttribute('height', '100%'); paper.setAttribute('fill', 'white'); svg.append(paper);
    for (const line of layout.lines) {
      const text = document.createElementNS(ns, 'text'); text.textContent = line.text;
      for (const [key, value] of Object.entries({ x: line.x, y: line.y, 'font-size': line.size, 'font-family': 'Arial, sans-serif', 'font-weight': line.bold ? 'bold' : 'normal', fill: 'black', 'text-anchor': 'middle', textLength: line.width, lengthAdjust: 'spacingAndGlyphs' })) text.setAttribute(key, value);
      svg.append(text);
    }
    $('print-paper').replaceChildren(caption(layout), svg);
  }
  function caption(layout) {
    const text = document.createElement('p'); text.className = 'hint';
    text.textContent = [templateName(preview?.template || chosenTemplate()), layout.name, t(layout.orientation === 'landscape' ? 'Landscape' : 'Portrait'), layout.rotated && t('rotated on the label')].filter(Boolean).join(' · ');
    return text;
  }
  // Edited fields are sent only after the first preview has shown which fields the template prints.
  async function showPreview(edited) {
    const stamp = ++generation;
    const fields = edited ? Object.fromEntries(['title', 'description', 'location'].filter(key => !$(`print-${key}-row`).hidden).map(key => [key, $(`print-${key}`).value])) : undefined;
    const result = await api('/preview', { revision: state.revision, kind: target.kind, template: chosenTemplate(),
      ...(target.kind === 'location' ? { locationId: target.id } : { boxId: target.id }), ...(fields ? { fields } : {}) });
    if (stamp !== generation) return;
    preview = result; requestId = crypto.randomUUID(); lastJob = null; draw(result.layout, result.svg);
    for (const key of ['title', 'description', 'location']) {
      $(`print-${key}-row`).hidden = typeof result.fields?.[key] !== 'string';
      if (!$(`print-${key}-row`).hidden) $(`print-${key}`).value = result.fields[key];
    }
    $('print-fields').hidden = false;
    status([result.fallback && tr('The chosen template is missing in the label service, so {0} was used.', templateName(result.template)),
      t(result.printable ? 'Preview ready. Print sends one label.' : 'Text does not fit. Shorten the label text before printing.')].filter(Boolean).join(' '));
  }
  // Opens the label dialog for a box ({boxId}) or a registered location ({locationId}) and shows the standard preview at once.
  const open = ({ boxId, locationId } = {}) => run(status, async () => {
    target = locationId ? { kind: 'location', id: locationId } : { kind: 'box', id: boxId };
    status(''); invalidate(); $('print-fields').hidden = true; $('print-edit').open = false; $('print-template').replaceChildren(); $('print-template-row').hidden = true;
    $('label-dialog-title').textContent = locationId ? `${t('Location label')}: ${locationId}` : t('Box label'); $('label-dialog').showModal();
    await load();
    if (!state.config.enabled) throw new Error(t('Printing is disabled. Save the label service address and key first.'));
    const box = target.kind === 'box' ? (await (await request('boxes')).json()).boxes.find(b => b.boxId === boxId) : null;
    if (box) $('label-dialog-title').textContent = `${t('Box label')}: ${box.label}`;
    templateChoices(box?.labelTemplate); await showPreview(false);
  });
  $('close-label').addEventListener('click', () => $('label-dialog').close());
  $('print-template').addEventListener('change', () => run(status, async () => { invalidate(); await showPreview(false); }));
  $('print-fields').addEventListener('input', invalidate);
  $('print-preview').addEventListener('click', () => run(status, () => showPreview(true)));
  $('print-submit').addEventListener('click', () => run(status, async () => {
    // Keep the same identifier after a lost HTTP response: the label service returns the original job instead of printing again.
    lastJob = await api('/submit', { token: preview.token, requestId });
    status(`${t('Print submission')}: ${lastJob.state}${lastJob.jobId ? ` · ${tr('printer job {0}', lastJob.jobId)}` : ''}. ${t('Check the job and the physical label before printing again.')}`);
  }));
  $('print-job-check').addEventListener('click', () => run(status, async () => {
    const job = await api(`/jobs/${lastJob.id}`); status(jobStatus(job.record.state, job.status?.state));
  }));
  return { open };
}
