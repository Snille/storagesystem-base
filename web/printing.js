import { t, uiLanguage } from './i18n.js';

// Labels are previewed and printed by the label service; this dialog chooses the content and the connection.
export function mountPrinting(request) {
  const $ = id => document.getElementById(id);
  const api = async (path, body, method = 'POST') => (await request(`printing${path}${path === "/preview" ? `?lang=${uiLanguage()}` : ""}`, body === undefined ? {} : { method, body: JSON.stringify(body) })).json();
  let state, preview, requestId, lastJob, busy = false, generation = 0;
  const status = text => { $('print-status').textContent = text; };
  const config = () => ({ enabled: $('print-enabled').checked, url: $('print-url').value.trim(), clearKey: $('print-clear-key').checked,
    ...($('print-key').value.trim() ? { apiKey: $('print-key').value.trim() } : {}) });
  const dirty = () => state && ($('print-enabled').checked !== state.config.enabled || $('print-url').value.trim() !== state.config.url
    || Boolean($('print-key').value.trim()) || $('print-clear-key').checked);
  const kind = () => $('print-kind').value;
  function sources() {
    const options = kind() === 'location' ? state.locations.map(id => new Option(id, id)) : state.boxes.map(box => new Option(box.label, box.boxId));
    $('print-box').replaceChildren(new Option(t('Test label'), ''), ...options);
  }
  const jobText = job => `${new Date(job.createdAt).toLocaleString()} · ${t(job.kind === 'location' ? 'Location label' : 'Box label')} · ${job.state}${job.jobId ? ` · CUPS ${job.jobId}` : ''}`;
  async function history() {
    const list = $('print-history'); list.replaceChildren();
    if (!state.config.enabled) return;
    const jobs = await api('/jobs');
    for (const job of jobs.jobs.slice(0, 20)) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'quiet'; button.textContent = jobText(job);
      button.addEventListener('click', () => run(async () => {
        lastJob = job; const result = await api(`/jobs/${job.id}`);
        status(`${t('Print submission')}: ${result.record.state} · CUPS: ${result.status?.state || t('unknown')}`);
      })); list.append(button);
    }
  }
  function controls() {
    const ready = state?.config.enabled && !dirty();
    $('print-submit').disabled = busy || !ready || !preview?.printable || Boolean(lastJob);
    $('print-preview').disabled = busy || !ready; $('print-check').disabled = busy || !ready;
    $('print-save').disabled = busy; $('print-job-check').disabled = busy || !lastJob;
  }
  function invalidate() { generation++; preview = null; requestId = null; lastJob = null; $('print-paper').replaceChildren(); controls(); }
  function populate() {
    $('print-enabled').checked = state.config.enabled; $('print-url').value = state.config.url; $('print-key').value = ''; $('print-clear-key').checked = false;
    $('print-key').placeholder = t(state.config.apiKeyConfigured ? 'Leave blank to keep the saved key' : 'Enter the client key');
    $('print-admin').hidden = !state.config.url; if (state.config.url) $('print-admin').href = state.config.url;
    controls();
  }
  function draw(layout) {
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
    const caption = document.createElement('p'); caption.className = 'hint'; caption.textContent = `${layout.name} · ${t(layout.orientation === 'landscape' ? 'Landscape' : 'Portrait')}${layout.rotated ? ` · ${t('rotated on the label')}` : ''}`;
    $('print-paper').replaceChildren(caption, svg);
  }
  async function run(action) { busy = true; controls(); try { await action(); } catch (error) { status(error.message); } finally { busy = false; controls(); } }
  $('open-printing').addEventListener('click', () => run(async () => {
    state = await api(''); state.boxes = (await (await request('boxes')).json()).boxes;
    sources(); populate(); invalidate(); $('print-fields').hidden = true; $('print-device-result').hidden = true; status(''); $('printing-dialog').showModal();
    await history();
  }));
  $('close-printing').addEventListener('click', () => $('printing-dialog').close());
  $('print-config').addEventListener('input', () => { invalidate(); $('print-device-result').hidden = true; status(t('Save settings before preparing a label.')); });
  $('print-config').addEventListener('submit', event => { event.preventDefault(); run(async () => {
    state = { ...await api('', { revision: state.revision, config: config() }, 'PUT'), boxes: state.boxes }; invalidate(); populate(); status(t('Print settings saved.'));
    await history();
  }); });
  $('print-check').addEventListener('click', () => run(async () => {
    const stamp = ++generation, result = $('print-device-result'); result.hidden = true;
    const s = await api('/status'); if (stamp !== generation) return;
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
    result.replaceChildren(heading, list, note); result.hidden = false; status('');
  }));
  $('print-box').addEventListener('change', () => { invalidate(); $('print-fields').hidden = true; status(''); });
  $('print-kind').addEventListener('change', () => { sources(); invalidate(); $('print-fields').hidden = true; status(''); });
  $('print-fields').addEventListener('input', invalidate);
  $('print-preview').addEventListener('click', () => run(async () => {
    const stamp = ++generation, source = $('print-box').value, labelKind = kind();
    const names = labelKind === 'location' ? ['location'] : ['title', 'description', 'location'];
    const fields = Object.fromEntries(names.map(key => [key, $(`print-${key}`).value]));
    const target = labelKind === 'location' ? { locationId: source } : { boxId: source };
    const result = await api('/preview', { revision: state.revision, kind: labelKind, ...(source ? { ...target, ...($('print-fields').hidden ? {} : { fields }) } : { test: true }) });
    if (stamp !== generation) return;
    preview = result; requestId = crypto.randomUUID(); lastJob = null; draw(result.layout);
    for (const key of names) $(`print-${key}`).value = result.fields[key];
    $('print-title-row').hidden = $('print-description-row').hidden = labelKind === 'location';
    $('print-fields').hidden = !source;
    status(t(result.printable ? 'Preview ready. Print sends one label.' : 'Text does not fit. Shorten the label text before printing.'));
  }));
  $('print-submit').addEventListener('click', () => run(async () => {
    $('print-device-result').hidden = true;
    // Keep the same identifier after a lost HTTP response: the label service returns the original job instead of printing again.
    lastJob = await api('/submit', { token: preview.token, requestId });
    status(`${t('Print submission')}: ${lastJob.state}${lastJob.jobId ? ` · CUPS ${lastJob.jobId}` : ''}. ${t('Check the job and the physical label before printing again.')}`);
    await history();
  }));
  $('print-job-check').addEventListener('click', () => run(async () => {
    const job = await api(`/jobs/${lastJob.id}`); status(`${t('Print submission')}: ${job.record.state} · CUPS: ${job.status?.state || t('unknown')}`);
  }));
}
