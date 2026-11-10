// Lumen front-end: Agents page and agent editor.
import { icon } from './icons.js';
import { $, $$, api, esc, toast } from './utils.js';
import { ACCESS, COLORS, EMOJIS, S, assistantById } from './state.js';
import { saveSettings } from './main.js';
import { go, setNav } from './router.js';
import { pinnedAgentIds, renderConvList, togglePinAgent } from './sidebar.js';
import { openMenu } from './menu.js';
import { modal } from './modal.js';
import { currentWorkspace } from './composer.js';
import { lumenOnlyBadge } from './home.js';
import { rerenderCurrent } from './chat-actions.js';
import { pickFolder } from './folder.js';

function renderAssistantsPage() {
  S.view = 'assistants'; setNav('assistants');
  $('#view').innerHTML = `
    <div class="page"><div class="page-inner">
      <div class="page-head">
        <div><h1>Agents</h1><p>Agents are helpers with their own expertise and instructions, the same idea as agents in Microsoft 365 Copilot. Pick one to start a chat, or create your own in under a minute.</p></div>
        <div class="row" style="flex:0 0 auto;gap:8px"><button class="btn soft" data-export-engineering title="Save the developer, test automation and pipeline packs into a code repository for VS Code">${icon('code')}Engineering packs</button><button class="btn soft" data-export-all title="Save every agent in a form Microsoft 365 Copilot can use">${icon('external')}Export all to Copilot</button><button class="btn grad" data-new-assistant>${icon('plus')}Create agent</button></div>
      </div>
      <div class="agent-toolbar">
        <div class="search-wrap agent-search">${icon('search')}<input id="agentSearch" type="search" placeholder="Search agents by name, what they do or skill" autocomplete="off" aria-label="Search agents" value="${esc(S.agentSearch || '')}"></div>
        <label class="agent-sort"><span>Sort by</span><select class="select" id="agentSort">${Object.entries(AGENT_SORTS).map(([k, v]) => `<option value="${k}" ${k === agentSortKey() ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}</select></label>
      </div>
      <p class="agent-search-empty" hidden>No agents match your search.</p>
      <div class="card-grid">
        ${sortedAgents().map((a, i) => `
          <div class="a-card" data-color="${esc(a.color)}" data-agent-text="${esc(agentSearchText(a))}" style="animation-delay:${i * 40}ms">
            <div class="a-card-top"><span class="a-badge lg">${esc(a.emoji)}</span>
              <button class="icon-btn" data-assistant-menu="${esc(a.id)}" title="More">${icon('dots')}</button></div>
            <div><h3>${esc(a.name)}</h3></div>
            <p class="tagline">${esc(a.tagline || '')}</p>
            ${skillChips(a)}
            <div class="a-card-actions">
              <button class="btn primary sm" data-chat-with="${esc(a.id)}">${icon('spark')}Start chat</button>
              <button class="btn soft sm" data-edit-assistant="${esc(a.id)}">${icon('edit')}Customize</button>
            </div>
          </div>`).join('')}
        <button class="a-card new-card" data-new-assistant>
          <span class="plus">${icon('plus')}</span><b>Create an agent</b><span style="font-size:13px">Describe it in a sentence and Lumen sets it up</span>
        </button>
      </div>
    </div></div>`;
  $('#agentSort').addEventListener('change', (e) => { saveSettings({ agentSort: e.target.value }).then(() => { if (S.view === 'assistants') renderAssistantsPage(); }); });
  const search = $('#agentSearch');
  search.addEventListener('input', () => { S.agentSearch = search.value; filterAgentCards(); });
  search.addEventListener('keydown', (e) => { if (e.key === 'Escape' && search.value) { e.preventDefault(); e.stopPropagation(); search.value = ''; S.agentSearch = ''; filterAgentCards(); } });
  filterAgentCards();
  setTimeout(() => { if (!$('#modalRoot').children.length) search.focus(); }, 50);
  $('#view').firstElementChild.addEventListener('click', (e) => {
    const t = e.target.closest('[data-new-assistant],[data-chat-with],[data-edit-assistant],[data-assistant-menu],[data-export-all],[data-export-engineering]'); if (!t) return;
    if ('exportAll' in t.dataset) exportToCopilot(null, t);
    else if ('exportEngineering' in t.dataset) exportEngineeringPacks();
    else if ('newAssistant' in t.dataset) openAssistantBuilder();
    else if (t.dataset.chatWith) { S.draft.assistantId = t.dataset.chatWith; S.draft.access = assistantById(t.dataset.chatWith).access || null; go(''); }
    else if (t.dataset.editAssistant) openAssistantBuilder(assistantById(t.dataset.editAssistant));
    else if (t.dataset.assistantMenu) {
      const a = assistantById(t.dataset.assistantMenu);
      openMenu(t, [
        { icon: 'edit', label: 'Customize', run: () => openAssistantBuilder(a) },
        { icon: 'pin', label: pinnedAgentIds().includes(a.id) ? 'Unpin from sidebar' : 'Pin to sidebar', run: () => togglePinAgent(a.id) },
        { icon: 'copy', label: 'Duplicate', run: async () => { const { id, builtin, createdAt, updatedAt, ...rest } = a; await api('/api/assistants', { method: 'POST', body: { ...rest, name: `${a.name} (copy)` } }); await reloadAssistants(); toast('Agent duplicated'); } },
        { sep: true },
        ...(a.id === 'lumen' ? [] : [{ icon: 'external', label: 'Export to Microsoft 365 Copilot', hint: 'For Agent Builder, or as an app package for IT', run: () => exportToCopilot(a) }]),
        { icon: 'code', label: 'Use in VS Code', hint: 'Save for Claude Code & GitHub Copilot', run: () => exportAssistant(a) },
        { sep: true },
        { icon: 'trash', label: 'Delete', danger: true, run: () => modal({ title: `Delete ${a.name}?`, sub: 'Existing chats with this agent are kept.', actions: [{ label: 'Cancel' }, { label: 'Delete', danger: true, run: async () => { await api(`/api/assistants/${a.id}`, { method: 'DELETE' }); await reloadAssistants(); toast('Agent deleted', 'trash'); } }] }) },
      ], { align: 'right' });
    }
  });
}

// Agents page sort orders. Usage comes from the chats on this computer; ties fall back to the name.
const AGENT_SORTS = {
  name: { label: 'Name (A to Z)' },
  recent: { label: 'Recently used' },
  most: { label: 'Most used' },
  pinned: { label: 'Pinned first' },
  mine: { label: 'My agents first' },
  original: { label: 'Original order' },
};
const agentSortKey = () => (Object.hasOwn(AGENT_SORTS, S.settings.agentSort || '') ? S.settings.agentSort : 'name');
function sortedAgents() {
  const key = agentSortKey();
  if (key === 'original') return [...S.assistants]; // the order they were added to Lumen, then the user's own
  const byName = (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  const last = {}, count = {};
  for (const c of S.convs) { count[c.assistantId] = (count[c.assistantId] || 0) + 1; last[c.assistantId] = Math.max(last[c.assistantId] || 0, c.updatedAt || 0); }
  const pins = pinnedAgentIds();
  const rank = {
    name: () => 0,
    recent: (a) => -(last[a.id] || 0),
    most: (a) => -(count[a.id] || 0),
    pinned: (a) => (pins.includes(a.id) ? pins.indexOf(a.id) - pins.length : 0),
    mine: (a) => (a.builtin ? 1 : 0),
  }[key];
  return [...S.assistants].sort((a, b) => rank(a) - rank(b) || byName(a, b));
}

// What the Agents page search looks at: name, tagline, description and skill titles.
function agentSearchText(a) {
  const skills = (a.skills || []).map((id) => S.skills.find((s) => s.id === id)?.title).filter(Boolean).sort((x, y) => x.localeCompare(y, undefined, { sensitivity: 'base' }));
  return [a.name, a.tagline, a.description, ...skills].filter(Boolean).join(' ').toLowerCase();
}

// Every word typed must appear somewhere; "Create an agent" always stays visible.
function filterAgentCards() {
  const words = (S.agentSearch || '').toLowerCase().split(/\s+/).filter(Boolean);
  let shown = 0;
  $('#view .card-grid')?.classList.toggle('searching', words.length > 0);
  $$('#view .a-card[data-agent-text]').forEach((c) => {
    const hit = words.every((w) => c.dataset.agentText.includes(w));
    c.hidden = !hit; if (hit) shown++;
    // Agents whose name matches come first.
    const name = c.querySelector('h3').textContent.toLowerCase();
    c.style.order = hit && words.length && !words.every((w) => name.includes(w)) ? 1 : '';
  });
  $('#view .new-card')?.style.setProperty('order', words.length ? 2 : '');
  const empty = $('#view .agent-search-empty'); if (empty) empty.hidden = shown > 0;
}

async function reloadAssistants() { S.assistants = (await api('/api/assistants')).sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })); if (S.view === 'assistants') renderAssistantsPage(); else rerenderCurrent(); renderConvList(); }

async function exportAssistant(a) {
  const r = await api(`/api/assistants/${a.id}/export`, { method: 'POST', body: { workspace: currentWorkspace() } });
  modal({
    title: `${a.name} is ready for VS Code`,
    sub: 'Open your project folder in VS Code and this assistant will be available as a custom agent.',
    body: `<div class="option-cards">
      <div class="option-card"><span class="oc-icon">🟣</span><div class="oc-text"><div class="oc-title">Claude Code</div><div class="oc-desc" style="word-break:break-all">${esc(r.claude || r.files[0])}</div></div></div>
      <div class="option-card"><span class="oc-icon">🐙</span><div class="oc-text"><div class="oc-title">GitHub Copilot</div><div class="oc-desc" style="word-break:break-all">${esc(r.github || r.files[1])}</div></div></div>
    </div>`,
    actions: [{ label: 'Open folder', icon: 'external', run: () => api('/api/folder/open', { method: 'POST', body: { workspace: r.workspace } }) }, { label: 'Done', primary: true }],
  });
}

// The developer, test automation and pipeline skill packs, saved into a code repository for VS Code.
async function exportEngineeringPacks() {
  const folder = await pickFolder(currentWorkspace(), { title: 'Choose the code repository', sub: 'The packs are saved in its .github and .claude folders, ready to commit for the whole team.', action: 'Save packs here' });
  if (!folder) return;
  let r;
  try { r = await api('/api/assistants/export-engineering', { method: 'POST', body: { folder } }); } catch (e) { toast(e.message, 'alert'); return; }
  modal({
    title: 'Engineering packs are ready for VS Code',
    sub: `${r.agents.join(', ')}: saved with their skills and reference files. Commit the .github and .claude folders so every developer gets the same standards.`,
    body: `<div class="option-cards">
      <div class="option-card"><span class="oc-icon">🐙</span><div class="oc-text"><div class="oc-title">GitHub Copilot</div><div class="oc-desc">Open the folder in VS Code, open Copilot Chat and pick the agent from the agent list.</div></div></div>
      <div class="option-card"><span class="oc-icon">🟣</span><div class="oc-text"><div class="oc-title">Claude Code</div><div class="oc-desc">The same agents and skills are in the .claude folder.</div></div></div>
    </div>
    <div class="help" style="margin-top:12px;word-break:break-all">${esc(r.readme)}</div>`,
    actions: [{ label: 'Open folder', icon: 'external', run: () => { api('/api/folder/open', { method: 'POST', body: { workspace: r.folder } }); return false; } }, { label: 'Done', primary: true }],
  });
}

// Export one agent (or all of them when `a` is null) for Microsoft 365 Copilot.
async function exportToCopilot(a, btn) {
  const label = btn?.innerHTML;
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner" style="border-color:var(--border-strong);border-top-color:var(--accent)"></span>Exporting…'; }
  let r;
  try { r = await api(a ? `/api/assistants/${a.id}/export-copilot` : '/api/assistants/export-copilot', { method: 'POST', body: { workspace: currentWorkspace() } }); }
  catch (e) { toast(e.message, 'alert'); return; }
  finally { if (btn) { btn.disabled = false; btn.innerHTML = label; } }
  const one = r.agents.length === 1 ? r.agents[0] : null;
  const notes = r.agents.filter((x) => x.lumenOnly.length);
  modal({
    title: one ? `${one.agent} is ready for Microsoft 365 Copilot` : `${r.agents.length} agents are ready for Microsoft 365 Copilot`,
    sub: 'Saved in your notebook. Pick whichever way in suits you.', wide: true,
    body: `<div class="option-cards">
      <div class="option-card"><span class="oc-icon">📝</span><div class="oc-text"><div class="oc-title">Paste into Agent Builder</div><div class="oc-desc">In Microsoft 365 Copilot, open <b>Agents › Create agent › Configure</b> and paste the name, description, instructions and starter prompts from <b>Copy into Agent Builder.txt</b>. No IT help needed.</div></div></div>
      <div class="option-card"><span class="oc-icon">📦</span><div class="oc-text"><div class="oc-title">App package for IT</div><div class="oc-desc">Each agent also has a <b>(Teams app).zip</b> with a declarative agent manifest. Your Microsoft 365 admin fills in the developer details, validates it and publishes it for the team.</div></div></div>
      ${notes.length ? `<div class="option-card"><span class="oc-icon">⚠️</span><div class="oc-text"><div class="oc-title">Not carried over ${lumenOnlyBadge()}</div><div class="oc-desc">${notes.map((x) => `<b>${esc(x.agent)}</b>: ${esc(x.lumenOnly.join('; '))}`).join('<br>')}</div></div></div>` : ''}
    </div>
    <div class="help" style="margin-top:12px;word-break:break-all">${esc(r.folder)}</div>`,
    actions: [
      ...(one ? [{ label: 'Copy Agent Builder text', icon: 'copy', run: async () => { try { await navigator.clipboard.writeText(one.text); toast('Copied. Paste it into Agent Builder'); } catch { toast("Couldn't copy. Open the file instead", 'alert'); } return false; } }] : []),
      { label: 'Open folder', icon: 'external', run: () => { api('/api/folder/open', { method: 'POST', body: { workspace: one ? one.folder : r.folder } }); return false; } },
      { label: 'Done', primary: true },
    ],
  });
}

function skillChips(a) {
  const list = (a.skills || []).map((id) => S.skills.find((s) => s.id === id)).filter(Boolean).sort((x, y) => (x.title || '').localeCompare(y.title || '', undefined, { sensitivity: 'base' }));
  return list.length ? `<div class="skill-chips">${list.map((s) => `<span class="skill-chip" title="${esc(s.description)}">${esc(s.emoji)} ${esc(s.title)}</span>`).join('')}${lumenOnlyBadge('These skills use Lumen’s local document tools and aren’t part of Microsoft 365 Copilot.')}</div>` : '';
}

function openAssistantBuilder(existing) {
  const a = existing ? { ...existing, starters: [...(existing.starters || [])], skills: [...(existing.skills || [])] } : { name: '', emoji: '🧠', color: COLORS[Math.floor(Math.random() * COLORS.length)], tagline: '', instructions: '', starters: ['', '', ''], access: '', skills: [] };
  while (a.starters.length < 3) a.starters.push('');
  const preview = () => `
    <div class="preview-label">Preview</div>
    <div class="a-card" data-color="${esc(a.color)}" style="animation:none">
      <div class="a-card-top"><span class="a-badge lg">${esc(a.emoji)}</span></div>
      <div><h3>${esc(a.name || 'Your agent')}</h3></div>
      <p class="tagline">${esc(a.tagline || 'A short line about what it helps with')}</p>
      ${skillChips(a)}
      <div class="starter-list">${a.starters.filter(Boolean).slice(0, 3).map((s) => `<div class="starter" style="font-size:12.5px;padding:8px 10px">${esc(s)}</div>`).join('')}</div>
    </div>`;
  const m = modal({
    title: existing ? `Customize ${existing.name}` : 'Create an agent', sub: existing ? 'Change how this agent looks and behaves.' : 'The same fields as Agent Builder in Microsoft 365 Copilot, so it exports cleanly later.', wide: true,
    body: `<div class="builder">
      <div>
        ${existing ? '' : `<div class="magic-box">
          <div class="label">${icon('wand')} Describe: tell Lumen what you need and it fills in the rest</div>
          <div class="magic-row"><input class="input" id="magicInput" placeholder="e.g. Helps me write clear test plans for our HR system"><button class="btn grad" id="magicBtn">${icon('spark')}Draft it</button></div>
        </div><div class="divider-text">or configure it yourself</div>`}
        <div class="row">
          <div class="field" style="flex:2"><label>Name</label><input class="input" id="fName" value="${esc(a.name)}" placeholder="e.g. Test Plan Pro" maxlength="40"></div>
          <div class="field"><label>Color</label><div class="chip-list" id="fColors" style="padding-top:4px">${COLORS.map((c) => `<button class="color-opt ${c === a.color ? 'active' : ''}" data-color="${c}" data-set-color="${c}" title="${c}"></button>`).join('')}</div></div>
        </div>
        <div class="field"><label>Icon</label><div class="emoji-grid" id="fEmojis">${EMOJIS.map((e) => `<button class="emoji-opt ${e === a.emoji ? 'active' : ''}" data-set-emoji="${e}">${e}</button>`).join('')}</div></div>
        <div class="field"><label>Description</label><input class="input" id="fTagline" value="${esc(a.tagline)}" placeholder="What does it help with? One short line" maxlength="80"></div>
        <div class="field"><label>Instructions</label><textarea class="textarea" id="fInstr" rows="6" placeholder="Describe its expertise, tone and the format you like. e.g. You are a QA lead. Write test cases as tables with steps, expected result and priority. Keep language simple.">${esc(a.instructions)}</textarea><div class="help">Write it like you'd brief a new colleague. Plain English is perfect.</div></div>
        <div class="field"><label>Starter prompts <span style="color:var(--muted);font-weight:400">(shown as suggestions)</span></label>${a.starters.slice(0, 3).map((s, i) => `<input class="input" data-starter-i="${i}" value="${esc(s)}" placeholder="Example ${i + 1}" style="margin-bottom:8px">`).join('')}</div>
        ${S.skills.length ? `<div class="field"><label>Capabilities ${lumenOnlyBadge('These skills use Lumen’s local document tools and won’t carry over to Microsoft 365 Copilot.')}</label>
          <div class="option-cards" id="fSkills">${S.skills.map((s) => `
            <button type="button" class="option-card skill-toggle ${a.skills.includes(s.id) ? 'active' : ''}" data-toggle-skill="${s.id}">
              <span class="oc-icon">${esc(s.emoji)}</span>
              <span class="oc-text"><span class="oc-title">${esc(s.title)}</span><span class="oc-desc">${esc(s.description)}</span></span>
              <span class="switch"></span>
            </button>`).join('')}</div></div>` : ''}
        <details class="advanced"><summary>${icon('shield')} File access</summary>
          <div class="seg" id="fAccess">${[['', 'Use my default'], ...Object.entries(ACCESS).map(([k, v]) => [k, v.label])].map(([k, l]) => `<button data-set-access="${k}" class="${(a.access || '') === k ? 'active' : ''}">${esc(l)}</button>`).join('')}</div>
        </details>
      </div>
      <div class="preview-pane" id="previewPane">${preview()}</div>
    </div>`,
    leftAction: existing && !existing.builtin ? { label: 'Delete', icon: 'trash', danger: true, run: async () => { await api(`/api/assistants/${existing.id}`, { method: 'DELETE' }); await reloadAssistants(); toast('Agent deleted', 'trash'); } } : null,
    actions: [{ label: 'Cancel' }, { label: existing ? 'Save changes' : 'Create agent', grad: true, run: async () => {
      collect();
      if (!a.name.trim()) { toast('Give your agent a name', 'alert'); $('#fName').focus(); return false; }
      if (!a.instructions.trim()) a.instructions = `You are ${a.name}, a helpful assistant. ${a.tagline}`;
      a.starters = a.starters.filter((s) => s.trim());
      const { builtin, ...body } = a;
      const saved = existing ? await api(`/api/assistants/${existing.id}`, { method: 'PUT', body }) : await api('/api/assistants', { method: 'POST', body });
      await reloadAssistants();
      toast(existing ? 'Changes saved' : `${saved.name} is ready!`, 'spark');
      if (!existing) { S.draft.assistantId = saved.id; S.draft.access = saved.access || null; go(''); }
    } }],
  });
  const el = m.el;
  const collect = () => {
    a.name = $('#fName', el).value; a.tagline = $('#fTagline', el).value; a.instructions = $('#fInstr', el).value;
    $$('[data-starter-i]', el).forEach((i) => { a.starters[+i.dataset.starterI] = i.value; });
  };
  const refresh = () => { collect(); $('#previewPane', el).innerHTML = preview(); };
  el.addEventListener('input', refresh);
  el.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-set-color],[data-set-emoji],[data-set-access],[data-toggle-skill],#magicBtn'); if (!t) return;
    if (t.dataset.toggleSkill) {
      const id = t.dataset.toggleSkill;
      a.skills = a.skills.includes(id) ? a.skills.filter((x) => x !== id) : [...a.skills, id];
      t.classList.toggle('active', a.skills.includes(id));
      refresh();
    } else if (t.dataset.setColor) { a.color = t.dataset.setColor; $$('.color-opt', el).forEach((b) => b.classList.toggle('active', b === t)); }
    else if (t.dataset.setEmoji) { a.emoji = t.dataset.setEmoji; $$('.emoji-opt', el).forEach((b) => b.classList.toggle('active', b === t)); }
    else if (t.dataset.setAccess !== undefined) { a.access = t.dataset.setAccess; $$('#fAccess button', el).forEach((b) => b.classList.toggle('active', b === t)); }
    else if (t.id === 'magicBtn') {
      const desc = $('#magicInput', el).value.trim();
      if (!desc) { $('#magicInput', el).focus(); return; }
      t.disabled = true; t.innerHTML = '<span class="spinner"></span>Drafting…';
      try {
        const d = await api('/api/assistants/draft', { method: 'POST', body: { description: desc } });
        $('#fName', el).value = d.name || ''; $('#fTagline', el).value = d.tagline || ''; $('#fInstr', el).value = d.instructions || '';
        (d.starters || []).slice(0, 3).forEach((s, i) => { const inp = $(`[data-starter-i="${i}"]`, el); if (inp) inp.value = s; });
        if (Array.isArray(d.skills)) { a.skills = d.skills.filter((id) => S.skills.some((s) => s.id === id)); $$('[data-toggle-skill]', el).forEach((b) => b.classList.toggle('active', a.skills.includes(b.dataset.toggleSkill))); }
        if (d.emoji) { a.emoji = d.emoji; const match = $(`[data-set-emoji="${d.emoji}"]`, el); $$('.emoji-opt', el).forEach((b) => b.classList.toggle('active', b === match)); }
        refresh();
        toast('Drafted! Tweak anything you like.', 'spark');
      } catch (err) { toast(err.message, 'alert'); }
      t.disabled = false; t.innerHTML = `${icon('spark')}Draft it`;
    }
  });
  setTimeout(() => ($('#magicInput', el) || $('#fName', el)).focus(), 60);
}

export { openAssistantBuilder, renderAssistantsPage };
