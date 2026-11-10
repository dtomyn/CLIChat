// Lumen front-end: SharePoint & Microsoft 365 (WorkIQ) and Azure DevOps connections.
import { icon } from './icons.js';
import { $, $$, api, esc, toast } from './utils.js';
import { S } from './state.js';
import { modal } from './modal.js';
import { rerenderCurrent } from './chat-actions.js';

function openWorkiqSettings(providerId = S.settings.providerId) {
  const cur = S.settings.workiq || {};
  const m = modal({
    title: 'SharePoint & Microsoft 365', sub: 'Let Lumen look up documents on SharePoint and OneDrive, and related email, meetings and Teams messages. Lumen only reads; it sees what you can already see.',
    body: `
      <div class="field"><button type="button" class="option-card skill-toggle ${cur.enabled ? 'active' : ''}" id="wqOn"><span class="oc-icon">🟦</span><span class="oc-text"><span class="oc-title">Allow Lumen to search Microsoft 365</span><span class="oc-desc">Available to every agent in new and existing chats. Requires file-read access. Not used in scheduled prompts.</span></span><span class="switch"></span></button></div>
      <div class="field"><label for="wqEngine">AI engine</label><select class="input" id="wqEngine">${S.providers.filter((p) => ['copilot-cli', 'claude-cli'].includes(p.id)).map((p) => `<option value="${esc(p.id)}" ${p.id === providerId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select><div class="help">Use the same AI engine as your chat. Copilot's managed connector and Claude's separate connection have different consent requirements.</div></div>
      <div class="row"><button class="btn soft" id="wqConnect" disabled>Sign in / check connection</button><button class="btn ghost" id="wqRefresh">Refresh status</button></div>
      <div class="field" id="wqStatus" role="status" aria-live="polite">Loading connection status…</div>
      <div class="help" id="wqConnectionHelp"></div>
      <div class="help">Lumen's status comes from your most recent chat, not a live check. After signing in, send a Microsoft 365 question, then refresh this status. A connection does not prove access to a particular document.</div>`,
    actions: [{ label: 'Cancel' }, { label: 'Save', primary: true, run: async (el) => {
      S.settings.workiq = await api('/api/connections/workiq', { method: 'PUT', body: { enabled: $('#wqOn', el).classList.contains('active') } });
      toast(S.settings.workiq.enabled ? 'Microsoft 365 search is on' : 'Microsoft 365 search is off'); rerenderCurrent();
    } }],
  });
  const el = m.el, status = $('#wqStatus', el), connect = $('#wqConnect', el), engine = $('#wqEngine', el);
  const endpoint = () => `/api/connections/workiq?providerId=${encodeURIComponent(engine.value)}`;
  const labels = { 'not-checked': 'Not checked in Lumen', 'sign-in-opened': 'Connection window opened — access not confirmed',
    connected: 'Engine connected to Microsoft 365', pending: 'Engine is checking the connection', 'needs-auth': 'Sign-in needed',
    failed: 'Connection failed', disabled: 'Connection disabled in the engine', stopped: 'Connection stopped', not_configured: 'Connection not loaded by the engine' };
  const show = (r) => {
    connect.disabled = !r.canSignIn;
    const managed = r.integration === 'connector';
    connect.textContent = managed ? 'Open Work IQ connector' : 'Sign in / check connection';
    $('#wqConnectionHelp', el).textContent = managed
      ? 'Uses GitHub Copilot’s existing Work IQ connector (workiqmcp) through GitHub, with your engine’s GitHub sign-in. The button opens the engine dashboard; choose the Connectors view, then Work IQ. If already connected, no separate Work IQ CLI sign-in is needed. Do not select m365, WorkIQ user servers or the workiq plugin.'
      : 'Claude uses the separate m365 connection. This is the Work IQ CLI application, not GitHub’s managed Work IQ connector, and it requires its own consent. If administrator approval is required, stop and request approval. Credentials stay with the engine, not Lumen.';
    const c = r.connection;
    status.innerHTML = `<b>${esc(labels[c.status] || 'Connection status unknown')}</b>${c.checkedAt ? `<div class="help">Last reported: ${esc(new Date(c.checkedAt).toLocaleString())}</div>` : ''}${Number.isInteger(c.toolCount) ? `<div class="help">Tools discovered: ${c.toolCount}</div>` : ''}${c.message ? `<div class="help">${esc(c.message)}</div>` : ''}${!r.canSignIn ? '<div class="help">Choose an installed Claude or GitHub Copilot engine. Opening a sign-in window is supported on Windows only.</div>' : ''}`;
  };
  let generation = 0;
  const refresh = async () => {
    const current = ++generation;
    connect.disabled = true;
    try { const r = await api(endpoint()); if (current === generation) show(r); }
    catch (e) { if (current === generation) status.textContent = e.message; }
  };
  $('#wqOn', el).addEventListener('click', (e) => e.currentTarget.classList.toggle('active'));
  engine.addEventListener('change', refresh);
  $('#wqRefresh', el).addEventListener('click', refresh);
  connect.addEventListener('click', async () => {
    const current = ++generation;
    const selected = engine.value;
    connect.disabled = true; engine.disabled = true; $('#wqRefresh', el).disabled = true;
    try {
      const r = await api(`/api/connections/workiq/connect?providerId=${encodeURIComponent(selected)}`, { method: 'POST' });
      if (current === generation) show(r);
    } catch (e) { if (current === generation) { status.textContent = e.message; connect.disabled = false; } }
    finally { engine.disabled = false; $('#wqRefresh', el).disabled = false; }
  });
  refresh();
}

// ---------------------------------------------------------------- Azure DevOps connection (plan 08)
const adoReady = () => !!(S.settings.ado?.orgUrl && S.settings.ado?.project && S.settings.ado?.enabled !== false);

async function openAdoSettings() {
  let conn;
  try { conn = await api('/api/connections/ado'); } catch (e) { return toast(e.message, 'alert'); }
  const f = { orgUrl: conn.orgUrl || '', auth: conn.auth || (conn.hasAz || !conn.patSupported ? 'azcli' : 'pat'), project: conn.project || '', team: conn.team || '', wikis: conn.wikis || [] };
  let found = null; // last successful check: { user, projects, teams, wikis }
  const opt = (v, cur, label = v) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(label)}</option>`;
  const m = modal({
    title: 'Azure DevOps', sub: 'Let Lumen search and read your work items and wiki. Lumen only proposes changes: each one waits for you to click Apply.',
    body: `
      <div class="field"><label>Organisation address</label><input class="input" id="adoOrg" placeholder="https://dev.azure.com/your-organisation" value="${esc(f.orgUrl)}"><div class="help">Copy it from your browser when you're in Azure DevOps. Cloud (dev.azure.com) only.</div></div>
      <div class="field"><label>How should Lumen sign in?</label><div class="seg" id="adoAuth"><button data-v="azcli" class="${f.auth === 'azcli' ? 'active' : ''}">Use my Azure sign-in</button><button data-v="pat" class="${f.auth === 'pat' ? 'active' : ''}" ${conn.patSupported ? '' : 'disabled title="Only available on Windows"'}>Use an access token</button></div>
        <div class="help" id="adoAuthHelp"></div><div id="adoPat"></div></div>
      <div class="row" style="align-items:center;gap:10px;margin:2px 0 14px"><button class="btn soft sm" id="adoCheck">${icon('refresh')}Check connection</button><span id="adoStatus" class="help" style="margin:0"></span></div>
      <div id="adoPick"></div>`,
    leftAction: conn.orgUrl ? { label: 'Disconnect', run: async () => { await api('/api/connections/ado', { method: 'PUT', body: { orgUrl: '', enabled: false } }); await api('/api/connections/ado/pat', { method: 'DELETE' }); S.settings.ado = { enabled: false }; toast('Azure DevOps disconnected. Any saved token was removed.'); } } : null,
    actions: [{ label: 'Cancel' }, { label: 'Save', primary: true, run: async (el) => {
      readForm(el);
      if (f.orgUrl && !f.project) throw new Error('Choose a project first (click Check connection).');
      S.settings.ado = await api('/api/connections/ado', { method: 'PUT', body: { ...f, enabled: true } });
      toast('Azure DevOps connected'); rerenderCurrent();
    } }],
  });
  const el = m.el;
  const readForm = () => {
    f.orgUrl = $('#adoOrg', el).value.trim();
    f.project = $('#adoProject', el)?.value ?? f.project;
    f.team = $('#adoTeam', el)?.value ?? f.team;
    if ($('#adoWikis', el)) f.wikis = $$('#adoWikis input:checked', el).map((x) => x.value);
  };
  const paintAuth = () => {
    $('#adoAuthHelp', el).innerHTML = f.auth === 'azcli'
      ? (conn.hasAz ? 'Uses the account you signed in to with the Azure CLI (<code>az login</code>). Nothing is stored by Lumen.' : 'The Azure CLI isn\'t installed on this computer. Install it and run <code>az login</code> once, or use an access token.')
      : 'Create a personal access token in Azure DevOps (User settings › Personal access tokens) with <b>Work Items: Read &amp; write</b> and <b>Wiki: Read &amp; write</b>. Lumen keeps it encrypted for your Windows account.';
    $('#adoPat', el).innerHTML = f.auth !== 'pat' ? '' : conn.hasPat
      ? `<div class="row" style="align-items:center;gap:10px;margin-top:8px"><span class="status-tag ok"><i class="dot ok" style="box-shadow:none"></i>A token is saved</span><button class="link" id="adoPatRemove">Remove it</button></div>`
      : `<div class="row" style="gap:8px;margin-top:8px"><input class="input" type="password" id="adoPatInput" placeholder="Paste the access token" autocomplete="off" style="flex:1"><button class="btn soft" id="adoPatSave" style="flex:0 0 auto">Save token</button></div>`;
  };
  const paintPick = () => {
    if (!found) { $('#adoPick', el).innerHTML = f.project ? `<div class="help">Project: <b>${esc(f.project)}</b>${f.team ? ` · Team: <b>${esc(f.team)}</b>` : ''}. Click Check connection to change them.</div>` : ''; return; }
    $('#adoPick', el).innerHTML = `
      <div class="field"><label>Project</label><select class="select" id="adoProject"><option value="">Choose a project…</option>${found.projects.map((p) => opt(p, f.project)).join('')}</select></div>
      ${f.project ? `<div class="field"><label>Team <span class="help" style="display:inline">(for "current sprint")</span></label><select class="select" id="adoTeam"><option value="">No team</option>${found.teams.map((t) => opt(t, f.team)).join('')}</select></div>
      ${found.wikis.length ? `<div class="field"><label>Wikis to search first</label><div id="adoWikis" class="ado-wikis">${found.wikis.map((w) => `<label class="check"><input type="checkbox" value="${esc(w.name)}" ${f.wikis.includes(w.name) ? 'checked' : ''}> ${esc(w.name)}${w.type === 'code' ? ' <span class="help" style="display:inline">(read-only: published from a repository)</span>' : ''}</label>`).join('')}</div></div>` : '<div class="help">This project has no wiki yet.</div>'}` : ''}`;
    $('#adoProject', el)?.addEventListener('change', () => { readForm(); f.team = ''; f.wikis = []; check(); });
  };
  const check = async () => {
    readForm();
    const st = $('#adoStatus', el);
    st.innerHTML = '<span class="spinner" style="width:13px;height:13px"></span> Checking…';
    try {
      const r = await api('/api/connections/ado/test', { method: 'POST', body: { orgUrl: f.orgUrl, auth: f.auth, project: f.project } });
      if (!r.ok) { found = null; st.innerHTML = `<span class="status-tag bad">${esc(r.error)}</span>`; paintPick(); return; }
      f.orgUrl = r.orgUrl; $('#adoOrg', el).value = r.orgUrl;
      if (f.project && !r.projects.includes(f.project)) f.project = '';
      found = r;
      st.innerHTML = `<span class="status-tag ok"><i class="dot ok" style="box-shadow:none"></i>Connected${r.user ? ` as ${esc(r.user)}` : ''}</span>`;
      paintPick();
    } catch (e) { st.innerHTML = `<span class="status-tag bad">${esc(e.message)}</span>`; }
  };
  $('#adoAuth', el).addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (!b || b.disabled) return; f.auth = b.dataset.v; $$('#adoAuth button', el).forEach((x) => x.classList.toggle('active', x === b)); paintAuth(); });
  $('#adoPat', el).addEventListener('click', async (e) => {
    if (e.target.closest('#adoPatSave')) {
      const pat = $('#adoPatInput', el).value.trim();
      if (!pat) return toast('Paste the access token first', 'alert');
      try { conn = await api('/api/connections/ado/pat', { method: 'POST', body: { pat } }); paintAuth(); toast('Token saved'); check(); } catch (err) { toast(err.message, 'alert'); }
    } else if (e.target.closest('#adoPatRemove')) {
      conn = await api('/api/connections/ado/pat', { method: 'DELETE' }); paintAuth(); toast('Token removed');
    }
  });
  $('#adoCheck', el).addEventListener('click', check);
  paintAuth(); paintPick();
  if (f.orgUrl) check();
}

export { adoReady, openAdoSettings, openWorkiqSettings };
