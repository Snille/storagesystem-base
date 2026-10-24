import { t, tr, uiLanguage } from './i18n.js';

export function mountPrinting(request, message) {
  const $ = id => document.getElementById(id);
  const api = async (path, body, method = 'POST') => (await request(`printing${path}${path === "/preview" ? `?lang=${uiLanguage()}` : ""}`, body === undefined ? {} : { method, body: JSON.stringify(body) })).json();
  let state, preview, requestId, lastJob, roll, busy = false, generation = 0;
  const status = text => { $('print-status').textContent = text; };
  const config = () => ({ enabled: $('print-enabled').checked, serverUrl: $('print-server').value.trim(), queue: $('print-queue').value.trim(), mediaKey: $('print-media').value,
    style: Object.fromEntries(['title', 'description', 'location'].map(key => [`${key}Size`, Number($(`print-${key}-size`).value)])),
    rollReader: { enabled: $('print-roll-enabled').checked, host: $('print-roll-host').value.trim(), port: Number($('print-roll-port').value) } });
  const dirty = () => state && JSON.stringify(config()) !== JSON.stringify({ ...state.config, rollReader: state.config.rollReader || { enabled: false, host: '', port: 9100 } });
  function history() {
    const list = $('print-history'); list.replaceChildren();
    for (const job of state.jobs) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'quiet';
      button.textContent = `${new Date(job.createdAt).toLocaleString()} · ${job.state}${job.jobId ? ` · CUPS ${job.jobId}` : ''}`;
      button.addEventListener('click', () => run(async () => {
        lastJob = job; const result = await api(`/jobs/${job.id}`);
        status(`${t('Print submission')}: ${job.state} · CUPS: ${result.status?.state || t('unknown')}`);
      })); list.append(button);
    }
  }
  function controls() {
    $('print-submit').disabled = busy || dirty() || !state?.config.enabled || !preview || preview.layout.warnings.length > 0 || Boolean(lastJob);
    $('print-preview').disabled = busy || dirty(); $('print-check').disabled = busy || dirty() || !state?.config.enabled;
    $('print-save').disabled = busy; $('print-job-check').disabled = busy || !lastJob;
    $('print-read-roll').disabled = busy || dirty() || !state?.config.enabled || !state?.config.rollReader?.enabled;
    $('print-use-roll').disabled = busy || !roll?.media || dirty();
  }
  function invalidate() { generation++; preview = null; requestId = null; lastJob = null; $('print-paper').replaceChildren(); controls(); }
  function populate() {
    $('print-enabled').checked = state.config.enabled; $('print-server').value = state.config.serverUrl; $('print-queue').value = state.config.queue;
    $('print-media').replaceChildren(...state.mediaPresets.map(media => new Option(media.name, media.key))); $('print-media').value = state.config.mediaKey;
    const reader = state.config.rollReader || { enabled: false, host: '', port: 9100 };
    $('print-roll-enabled').checked = reader.enabled; $('print-roll-host').value = reader.host; $('print-roll-port').value = reader.port;
    for (const key of ['title', 'description', 'location']) $(`print-${key}-size`).value = state.config.style[`${key}Size`];
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
    const caption = document.createElement('p'); caption.className = 'hint'; caption.textContent = layout.name;
    $('print-paper').replaceChildren(caption, svg);
  }
  async function run(action) { busy = true; controls(); try { await action(); } catch (error) { status(error.message); } finally { busy = false; controls(); } }
  $('open-printing').addEventListener('click', () => run(async () => {
    state = await api(''); const { boxes } = await (await request('boxes')).json();
    $('print-box').replaceChildren(new Option(t('Test label'), ''), ...boxes.map(box => new Option(box.label, box.boxId)));
    invalidate(); populate(); history(); $('print-fields').hidden = true; $('print-device-result').hidden = true; $('print-roll-result').hidden = true; roll = null; status(''); $('printing-dialog').showModal();
  }));
  $('close-printing').addEventListener('click', () => $('printing-dialog').close());
  $('print-config').addEventListener('input', () => { invalidate(); roll = null; $('print-roll-result').hidden = true; $('print-device-result').hidden = true; status(t('Save settings before preparing a label.')); });
  $('print-config').addEventListener('submit', event => { event.preventDefault(); run(async () => {
    state = await api('', { revision: state.revision, config: config() }, 'PUT'); invalidate(); populate(); status(t('Print settings saved.'));
  }); });
  $('print-check').addEventListener('click', () => run(async () => {
    const stamp = ++generation, result = $('print-device-result'); result.hidden = true;
    const s = await api('/status'); if (stamp !== generation) return;
    const heading = document.createElement('h3'); heading.textContent = t('CUPS queue status');
    const list = document.createElement('dl');
    for (const [key, value] of [
      ['Queue name', s.queue], ['Printer', s.model || t('unknown')], ['Queue state', t(s.state)],
      ['Accepting jobs', t(s.acceptingJobs ? 'Yes' : 'No')], ['Queued jobs', s.queuedJobs === undefined ? t('unknown') : String(s.queuedJobs)],
      ['Queue reasons', s.reasons.length ? s.reasons.join(', ') : t('unknown')],
      ['Queue default media', s.defaultMedia || t('unknown')], ['Label format for this application', state.media.name],
      ['Observed at', new Date().toLocaleString()]
    ]) {
      const term = document.createElement('dt'), text = document.createElement('dd'); term.textContent = t(key); text.textContent = value; list.append(term, text);
    }
    const note = document.createElement('p'); note.className = 'hint';
    note.textContent = t('Queue status comes from CUPS. It does not confirm the physical printer lamp, loaded roll, temperature or labels remaining.');
    result.replaceChildren(heading, list, note); result.hidden = false; status('');
  }));
  $('print-read-roll').addEventListener('click', () => run(async () => {
    const stamp = ++generation; roll = null; $('print-roll-result').hidden = true;
    const result = await api('/roll', { revision: state.revision }); if (stamp !== generation) return;
    roll = result.roll;
    $('print-roll-summary').textContent = `${roll.sku} · ${tr('{0} labels remaining', roll.labelsRemaining)} · ${roll.media ? roll.media.name : t('Unknown label format')}`;
    $('print-roll-observed').textContent = `${t('Observed at')}: ${new Date(roll.observedAt).toLocaleString()}`;
    $('print-roll-note').textContent = t(!roll.media ? 'The article is recognized, but its size has no preset. Do not infer size from the queue default.'
      : roll.media.key !== state.config.mediaKey ? 'The loaded roll differs from the selected label format. Use its format and save before preparing a label.'
        : 'The loaded roll matches the selected format. This is a snapshot; read again after changing rolls.');
    $('print-roll-result').hidden = false; status(t('Roll read; release requested. No label was printed or fed.'));
  }));
  $('print-use-roll').addEventListener('click', () => {
    if (!roll?.media) return;
    $('print-media').value = roll.media.key; invalidate(); status(t('Save print settings to use the detected format.'));
  });
  $('print-box').addEventListener('change', () => { invalidate(); $('print-fields').hidden = true; status(''); });
  $('print-fields').addEventListener('input', invalidate);
  $('print-preview').addEventListener('click', () => run(async () => {
    const stamp = ++generation, boxId = $('print-box').value;
    const fields = Object.fromEntries(['title', 'description', 'location'].map(key => [key, $(`print-${key}`).value]));
    const result = await api('/preview', { revision: state.revision, ...(boxId ? { boxId, ...($('print-fields').hidden ? {} : { fields }) } : { test: true }) });
    if (stamp !== generation) return;
    preview = result; requestId = crypto.randomUUID(); lastJob = null; draw(result.layout);
    for (const key of ['title', 'description', 'location']) $(`print-${key}`).value = result.fields[key];
    $('print-fields').hidden = !boxId;
    status(t(result.layout.warnings.length ? 'Text does not fit. Shorten the label text before printing.' : 'Preview ready. Print sends one label.'));
  }));
  $('print-submit').addEventListener('click', () => run(async () => {
    $('print-roll-result').hidden = true; roll = null;
    $('print-device-result').hidden = true;
    // Keep the same identifier after a lost HTTP response: a retry can only inspect the original submission.
    lastJob = await api('/submit', { token: preview.token, requestId });
    state.jobs = [lastJob, ...state.jobs.filter(job => job.id !== lastJob.id)].slice(0, 20); history();
    status(`${t('Print submission')}: ${lastJob.state}${lastJob.jobId ? ` · CUPS ${lastJob.jobId}` : ''}. ${t('Check the job and the physical label before printing again.')}`);
  }));
  $('print-job-check').addEventListener('click', () => run(async () => {
    const job = await api(`/jobs/${lastJob.id}`); status(`${t('Print submission')}: ${job.record.state} · CUPS: ${job.status?.state || t('unknown')}`);
  }));
}
