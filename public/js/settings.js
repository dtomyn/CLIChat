// Lumen front-end: Settings dialog.
import { icon } from './icons.js';
import { $, $$, api, esc, toast } from './utils.js';
import { ACCESS, S, provider } from './state.js';
import { applyTheme, openShortcuts, renderUser, saveSettings } from './main.js';
import { go } from './router.js';
import { modal } from './modal.js';
import { rerenderCurrent } from './chat-actions.js';
import { pickFolder } from './folder.js';
import { adoReady, openAdoSettings, openWorkiqSettings } from './connections.js';

function providerCards(selected) {
  return S.providers.map((p) => `
    <button class="option-card ${p.id === selected ? 'active' : ''}" data-provider="${esc(p.id)}">
      <span class="oc-icon">${p.id.startsWith('claude') ? '🟣' : p.id.startsWith('copilot') ? '🐙' : '🔌'}</span>
      <span class="oc-text"><span class="oc-title">${esc(p.name)} ${p.available ? `<span class="status-tag ok"><i class="dot ok" style="box-shadow:none"></i>Installed</span>` : `<span class="status-tag bad">Not set up</span>`}</span>
      <span class="oc-desc">${esc(p.available ? `${p.vendor}${p.version ? ` · ${p.version}` : ''}` : p.message || p.description)}</span></span>
    </button>`).join('');
}

function openSettings(focus) {
  const s = { ...S.settings };
  const m = modal({
    title: 'Settings', sub: 'Make Lumen work the way you like.', wide: false,
    body: `
      <div class="field"><label>Your name</label><input class="input" id="sName" value="${esc(s.userName || '')}" placeholder="What should Lumen call you?"></div>
      <div class="field" id="engineField"><label style="display:flex;align-items:center;justify-content:space-between">AI engine <button class="link" id="refreshEngines" style="font-weight:500">${icon('refresh')} Check again</button></label>
        <div class="option-cards" id="providerCards">${providerCards(s.providerId)}</div>
        <div class="help">Lumen is pluggable — it runs on whichever AI tool is installed on this computer. Add more engines by dropping a file into the <code>providers</code> folder.</div></div>
      <div class="field" id="connectionsField"><label>Connections</label><div class="option-cards">
        <button type="button" class="option-card" id="sAdo"><span class="oc-icon">🔷</span><span class="oc-text"><span class="oc-title">Azure DevOps ${adoReady() ? `<span class="status-tag ok"><i class="dot ok" style="box-shadow:none"></i>Connected</span>` : '<span class="status-tag">Not set up</span>'}</span>
          <span class="oc-desc">${adoReady() ? esc(`${S.settings.ado.project}${S.settings.ado.team ? ` · ${S.settings.ado.team}` : ''} · ${S.settings.ado.orgUrl.replace(/^https:\/\//, '')}`) : 'Search and update work items and wiki pages. Every change waits for your approval.'}</span></span></button>
        <button type="button" class="option-card" id="sWorkiq"><span class="oc-icon">🟦</span><span class="oc-text"><span class="oc-title">SharePoint &amp; Microsoft 365 ${S.settings.workiq?.enabled ? `<span class="status-tag ok"><i class="dot ok" style="box-shadow:none"></i>On</span>` : '<span class="status-tag">Off</span>'}</span>
          <span class="oc-desc">Find and read documents on SharePoint, plus your email, meetings and Teams. Read only.</span></span></button></div></div>
      <div class="field"><label>Default file access</label><div class="seg" id="sAccess">${Object.entries(ACCESS).map(([k, v]) => `<button data-v="${k}" class="${s.access === k ? 'active' : ''}">${v.emoji} ${esc(v.label)}</button>`).join('')}</div></div>
      <div class="field"><label>Default notebook (project folder)</label><div class="row" style="align-items:center"><input class="input" id="sFolder" value="${esc(s.workspace)}" readonly style="flex:1"><button class="btn soft" id="sFolderBtn" style="flex:0 0 auto">${icon('folder')}Change</button></div><div class="help">Your notebook: where Lumen reads and saves documents unless a chat uses a different folder. Keep it in OneDrive so Microsoft 365 Copilot can find the same files later.</div></div>
      <div class="field"><label>Appearance</label><div class="seg" id="sTheme">${[['system', 'Match system'], ['light', 'Light'], ['dark', 'Dark']].map(([k, l]) => `<button data-v="${k}" class="${(s.theme || 'system') === k ? 'active' : ''}">${l}</button>`).join('')}</div></div>
      <details class="advanced"><summary>${icon('settings')} Advanced</summary>
        <div class="field"><label>Reply details</label><button type="button" class="option-card skill-toggle ${s.showCost ? 'active' : ''}" id="sShowCost"><span class="oc-icon">💲</span><span class="oc-text"><span class="oc-title">Show the cost of each reply</span><span class="oc-desc">When the AI engine reports it. Leave off if you're on a subscription.</span></span><span class="switch"></span></button></div>
        <div class="field"><label>Reset built-in content</label><div class="help" style="margin:0 0 8px">Restores the original agents and prompts. Your chats are not affected.</div><button class="btn soft sm" id="sReset">${icon('refresh')}Restore defaults</button></div>
      </details>`,
    leftAction: { label: 'Keyboard shortcuts', icon: 'keyboard', run: () => { openShortcuts(); return false; } },
    actions: [{ label: 'Close' }, { label: 'Save', primary: true, run: async (el) => {
      await saveSettings({ userName: $('#sName', el).value.trim(), providerId: s.providerId, access: s.access, workspace: s.workspace, theme: s.theme, showCost: !!s.showCost, model: s.providerId !== S.settings.providerId ? 'default' : S.settings.model });
      applyTheme(s.theme); rerenderCurrent(); toast('Settings saved');
    } }],
  });
  const el = m.el;
  const seg = (id, key, after) => $(`#${id}`, el).addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (!b) return; s[key] = b.dataset.v; $$(`#${id} button`, el).forEach((x) => x.classList.toggle('active', x === b)); after?.(); });
  seg('sAccess', 'access'); seg('sTheme', 'theme', () => applyTheme(s.theme));
  $('#sShowCost', el).addEventListener('click', (e) => { s.showCost = !s.showCost; e.currentTarget.classList.toggle('active', s.showCost); });
  $('#sAdo', el).addEventListener('click', () => { m.close(); openAdoSettings(); });
  $('#sWorkiq', el).addEventListener('click', () => { m.close(); openWorkiqSettings(s.providerId); });
  $('#providerCards', el).addEventListener('click', (e) => { const b = e.target.closest('[data-provider]'); if (!b) return; s.providerId = b.dataset.provider; $('#providerCards', el).innerHTML = providerCards(s.providerId); });
  $('#refreshEngines', el).addEventListener('click', async () => { $('#providerCards', el).style.opacity = .5; const st = await api('/api/status?refresh=1'); S.providers = st.providers; $('#providerCards', el).innerHTML = providerCards(s.providerId); $('#providerCards', el).style.opacity = 1; renderUser(); });
  $('#sFolderBtn', el).addEventListener('click', async () => { const p = await pickFolder(s.workspace); if (p) { s.workspace = p; $('#sFolder', el).value = p; } });
  $('#sReset', el).addEventListener('click', () => modal({ title: 'Restore defaults?', sub: 'Built-in agents and prompts go back to how they shipped. Ones you created are removed.', actions: [{ label: 'Cancel' }, { label: 'Restore', danger: true, run: async () => { await api('/api/reset', { method: 'POST' }).catch(() => {}); toast('Defaults restored'); location.reload(); } }] }));
  if (focus === 'engine') setTimeout(() => $('#engineField', el).scrollIntoView({ block: 'center' }), 50);
}

export { openSettings, providerCards };
