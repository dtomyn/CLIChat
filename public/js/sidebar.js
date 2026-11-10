// Lumen front-end: Sidebar: pinned agents and the chats list.
import { icon } from './icons.js';
import { $, api, esc, toast } from './utils.js';
import { S, assistantById } from './state.js';
import { saveSettings } from './main.js';
import { go } from './router.js';
import { openMenu } from './menu.js';
import { modal } from './modal.js';
import { renderRecipesPage } from './prompts.js';

// Pinned agents, like the agent list in Microsoft 365 Copilot. Until someone pins their own, show the agents they
// used most recently (topped up with the first built-ins).
function pinnedAgentIds() {
  if (Array.isArray(S.settings.pinnedAgents)) return S.settings.pinnedAgents.filter((id) => S.assistants.some((a) => a.id === id));
  const recent = [...new Set(S.convs.map((c) => c.assistantId))].filter((id) => id !== 'lumen' && S.assistants.some((a) => a.id === id));
  const fill = S.assistants.map((a) => a.id).filter((id) => id !== 'lumen' && !recent.includes(id));
  return [...recent, ...fill].slice(0, 4);
}
async function togglePinAgent(id) {
  const ids = pinnedAgentIds();
  await saveSettings({ pinnedAgents: ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id] });
  renderConvList();
  toast(ids.includes(id) ? 'Removed from the sidebar' : 'Pinned to the sidebar', 'pin');
}
function renderAgentList() {
  const el = $('#agentList'); if (!el) return;
  const ids = pinnedAgentIds();
  const sel = S.view === 'home' ? (S.draft.assistantId || 'lumen') : S.view === 'chat' ? S.current?.assistantId : null;
  el.innerHTML = ids.length ? ids.map((id) => { const a = assistantById(id); return `<button class="agent-item ${sel === id ? 'active' : ''}" data-agent="${esc(id)}" data-color="${esc(a.color)}" title="${esc(a.tagline || a.name)}"><span class="a-badge sm">${esc(a.emoji)}</span><span class="conv-title">${esc(a.name)}</span></button>`; }).join('')
    : '<div class="conv-empty" style="padding:6px 10px;text-align:left">Pin agents here from the Agents page.</div>';
}

function renderConvList() {
  renderAgentList();
  const q = S.search.toLowerCase();
  const list = S.convs.filter((c) => !q || c.title.toLowerCase().includes(q) || (c.preview || '').toLowerCase().includes(q));
  const el = $('#convList');
  if (!list.length) { el.innerHTML = `<div class="conv-empty">${q ? 'No chats match your search.' : 'Your conversations will show up here.'}</div>`; return; }
  const day = 86400000; const today = new Date(); today.setHours(0, 0, 0, 0);
  const groups = [['Pinned', []], ['Today', []], ['Yesterday', []], ['Previous 7 days', []], ['Older', []]];
  for (const c of list) {
    const g = c.pinned ? 0 : c.updatedAt >= +today ? 1 : c.updatedAt >= +today - day ? 2 : c.updatedAt >= +today - 7 * day ? 3 : 4;
    groups[g][1].push(c);
  }
  el.innerHTML = groups.filter(([, items]) => items.length).map(([name, items]) => `
    <div class="conv-group">${name}</div>
    ${items.map((c) => `
      <div class="conv ${S.current?.id === c.id ? 'active' : ''}" data-cid="${esc(c.id)}" title="${esc(c.title)}">
        <span class="conv-emoji">${esc(assistantById(c.assistantId).emoji)}</span>
        <span class="conv-title">${esc(c.title)}</span>
        ${c.scheduled ? '<span title="Scheduled chat" aria-label="Scheduled chat">🕘</span>' : ''}
        ${c.unread ? '<i class="unread-dot" title="Unread" aria-label="Unread"></i>' : ''}
        ${S.live.has(c.id) ? '<i class="live-dot"></i>' : ''}
        <span class="conv-actions"><button data-conv-menu="${esc(c.id)}" title="More">${icon('dots')}</button></span>
      </div>`).join('')}`).join('');
}

async function refreshConvs() { S.convs = await api('/api/conversations'); renderConvList(); }

async function pollSchedules() {
  if (!S.schedules.length) return;
  try {
    const schedules = await api('/api/schedules');
    for (const s of schedules) {
      const previous = S.schedules.find((p) => p.id === s.id);
      if (previous && ['ok', 'late'].includes(s.lastStatus) && (previous.lastRunAt !== s.lastRunAt || previous.lastStatus === 'running')) {
        const recipe = S.recipes.find((r) => r.id === s.recipeId);
        toast(`Your ${recipe?.name || 'scheduled prompt'} is ready`, 'spark');
      }
    }
    S.schedules = schedules;
    await refreshConvs();
    if (S.view === 'recipes' && S.recipeTab === 'Scheduled') renderRecipesPage();
  } catch (e) { toast(`Couldn't refresh scheduled prompts: ${e.message}`, 'alert'); }
}

function convMenu(cid, anchor) {
  const c = S.convs.find((x) => x.id === cid);
  if (!c) return;
  openMenu(anchor, [
    { icon: 'edit', label: 'Rename', run: () => renameConv(cid) },
    { icon: 'pin', label: c.pinned ? 'Unpin' : 'Pin to top', run: async () => { await api(`/api/conversations/${cid}`, { method: 'PATCH', body: { pinned: !c.pinned } }); refreshConvs(); } },
    { sep: true },
    { icon: 'trash', label: 'Delete', danger: true, run: () => deleteConv(cid) },
  ]);
}

function renameConv(cid) {
  const c = S.convs.find((x) => x.id === cid);
  modal({
    title: 'Rename chat',
    body: `<input class="input" id="renameInput" value="${esc(c.title)}" maxlength="80">`,
    actions: [{ label: 'Cancel' }, { label: 'Save', primary: true, run: async () => {
      const title = $('#renameInput').value.trim(); if (!title) return false;
      await api(`/api/conversations/${cid}`, { method: 'PATCH', body: { title } });
      if (S.current?.id === cid) { S.current.title = title; const t = $('.chat-title'); if (t) t.textContent = title; }
      refreshConvs();
    } }],
    onOpen: () => { const i = $('#renameInput'); i.focus(); i.select(); },
  });
}

function deleteConv(cid) {
  modal({
    title: 'Delete this chat?', sub: "This can't be undone. Files it created in your project folder are kept.",
    actions: [{ label: 'Cancel' }, { label: 'Delete', danger: true, run: async () => {
      S.live.get(cid)?.ac.abort();
      await api(`/api/conversations/${cid}`, { method: 'DELETE' });
      await refreshConvs();
      if (S.current?.id === cid) go('');
      toast('Chat deleted', 'trash');
    } }],
  });
}

export { convMenu, deleteConv, pinnedAgentIds, pollSchedules, refreshConvs, renameConv, renderConvList, togglePinAgent };
