// Lumen front-end: quick prompts, as in Microsoft 365 Copilot. Topic tabs under the home message box, the Prompt Lab
// (dialog and page), and the "fill the message box, don't send" behaviour with [blanks] you Tab between.
// Quick prompts are plain text: built-ins from defaults/prompts.json, your own saved ones, and one made automatically
// from every guided task (recipe) by turning its {{fields}} into [blanks].
import { icon } from './icons.js';
import { $, api, esc, toast } from './utils.js';
import { S, assistantById } from './state.js';
import { go, setNav } from './router.js';
import { modal } from './modal.js';
import { renderHome } from './home.js';
import { openRecipeRunner } from './prompts.js';
import { refreshAttach } from './composer.js';

const TOPICS = ['Analyze', 'Ask', 'Catch up', 'Create', 'Edit', 'Learn', 'Plan', 'Prepare', 'Review', 'Summarize', 'Track'];
const TOPIC_RULES = [
  [/summar|digest|recap|key points/i, 'Summarize'],
  [/draft|write|create|generate|build|make|assemble|publish|pack\b|materials|document/i, 'Create'],
  [/check|review|qa\b|triage|gap|health|audit|readiness|validate|evidence/i, 'Review'],
  [/update|refine|consolidate|edit|polish|rewrite/i, 'Edit'],
  [/plan|look-ahead|schedule|cutover|scenario|prepare/i, 'Plan'],
  [/status|progress|track|log|variance|budget|capacity/i, 'Track'],
  [/ask|question|explain/i, 'Ask'],
];
const topicOf = (r) => (TOPIC_RULES.find(([re]) => re.test(`${r.name} ${r.description || ''}`)) || [0, 'Analyze'])[1];

// A guided task as a one-line prompt: file and text fields become [label], choices become [a / b].
function quickFromRecipe(r) {
  const blank = (f) => {
    if (!f) return '[detail]';
    if (f.type === 'select' && f.options?.length) return `[${f.options.map((o) => (typeof o === 'string' ? o : o.label || o.value)).join(' / ')}]`;
    return `[${String(f.label || f.key).replace(/[[\]]/g, '').replace(/\?$/, '').replace(/^optional\s*[—-]\s*/i, '')}]`;
  };
  const text = String(r.template || '').replace(/\{\{(\w+)\}\}/g, (_, k) => blank((r.fields || []).find((f) => f.key === k)));
  return { id: `task:${r.id}`, title: r.name, text, topic: topicOf(r), group: r.category || 'Other', agentId: r.assistantId, access: r.access, recipeId: r.id, builtin: true };
}

const quickPrompts = () => [...(S.prompts || []), ...S.recipes.map(quickFromRecipe)];
const findPrompt = (id) => {
  if (id.startsWith('starter:')) { const [, aid, i] = id.split(':'); const s = assistantById(aid).starters?.[+i]; return s ? { id, text: s, agentId: aid } : null; }
  return quickPrompts().find((p) => p.id === id);
};

// ---- the [blanks]
const BLANK = /\[[^[\]\n]{1,80}\](?!\()/g;
function selectBlank(input, from = 0) {
  const all = [...input.value.matchAll(BLANK)];
  if (!all.length) return false;
  const m = all.find((x) => x.index >= from) || all[0];
  input.focus(); input.setSelectionRange(m.index, m.index + m[0].length);
  return true;
}
const blankSelected = (input) => input.selectionEnd > input.selectionStart && /^\[[^[\]\n]{1,80}\]$/.test(input.value.slice(input.selectionStart, input.selectionEnd));

// Put a prompt in the message box (on the home page, or in the open chat). Nothing is sent.
function usePrompt(p, conv = S.view === 'chat' ? S.current : null) {
  if (!p) return;
  if (!conv) {
    if (p.agentId && p.agentId !== 'lumen' && p.agentId !== (S.draft.assistantId || 'lumen')) {
      S.draft.assistantId = p.agentId; const a = assistantById(p.agentId); S.draft.access = a.access || null;
    }
    const order = ['chat', 'read', 'edit'];
    const cur = S.draft.access || assistantById(S.draft.assistantId || 'lumen').access || S.settings.access;
    if (p.access && order.indexOf(p.access) > order.indexOf(cur)) S.draft.access = p.access;
    S.draft.text = p.text;
    if (S.view !== 'home') { S.current = null; go(''); } else renderHome();
  }
  const input = $('#input'); if (!input) return;
  refreshAttach();
  input.value = S.draft.text = p.text;
  input.dispatchEvent(new Event('input'));
  if (!selectBlank(input)) { input.focus(); input.setSelectionRange(p.text.length, p.text.length); }
  else {
    const hint = $('.composer-hint');
    if (hint && !$('.blank-hint', hint)) hint.insertAdjacentHTML('afterbegin', '<span class="blank-hint"><kbd>Tab</kbd> next blank · type <kbd>/</kbd> in a blank to pick a file · <kbd>Enter</kbd> sends · </span>');
  }
}

// ---- topic tabs under the home message box
function tabsFor(agentId) {
  const a = assistantById(agentId);
  if (a.id === 'lumen') {
    const groups = new Map();
    for (const p of (S.prompts || []).filter((x) => x.builtin && (x.agentId || 'lumen') === 'lumen' && x.group)) { if (!groups.has(p.group)) groups.set(p.group, []); groups.get(p.group).push(p); }
    return [...groups].slice(0, 4).map(([name, list]) => ({ name, list }));
  }
  const tabs = [];
  if (a.starters?.length) tabs.push({ name: 'Suggested', list: a.starters.map((s, i) => ({ id: `starter:${a.id}:${i}`, text: s })) });
  const own = quickPrompts().filter((p) => p.agentId === a.id && p.id.startsWith('task:'));
  const groups = new Map();
  for (const p of own) { if (!groups.has(p.topic)) groups.set(p.topic, []); groups.get(p.topic).push(p); }
  for (const [name, list] of groups) if (tabs.length < 4) tabs.push({ name, list });
  const saved = (S.prompts || []).filter((p) => !p.builtin && p.agentId === a.id);
  if (saved.length) tabs.push({ name: 'Yours', list: saved });
  return tabs.slice(0, 4);
}
const blankHTML = (text) => esc(text).replace(/\[[^[\]\n]{1,80}\]/g, (m) => `<span class="blank">${m}</span>`);

function promptTabsHTML(agentId) {
  const tabs = tabsFor(agentId);
  if (!tabs.length) return '';
  const cur = tabs.find((t) => t.name === S.promptTab) || tabs[0];
  return `<div class="qp" aria-label="Suggested prompts">
    <div class="qp-tabs" role="tablist">${tabs.map((t) => `<button class="qp-tab ${t === cur ? 'active' : ''}" role="tab" aria-selected="${t === cur}" data-qp-tab="${esc(t.name)}">${esc(t.name)}</button>`).join('')}<button class="qp-tab more" data-qp-more title="See more prompts (Prompt Lab)" aria-label="See more prompts">${icon('dots')}</button></div>
    <div class="qp-list">${cur.list.slice(0, 5).map((p) => `<button class="qp-item" data-qp="${esc(p.id)}" title="Put this in the message box">${blankHTML(p.text)}</button>`).join('')}</div>
  </div>`;
}
function bindPromptTabs(root, agentId) {
  const el = $('.qp', root); if (!el) return;
  el.addEventListener('click', (e) => {
    const t = e.target.closest('[data-qp-tab],[data-qp-more],[data-qp]'); if (!t) return;
    if (t.dataset.qpTab) { S.promptTab = t.dataset.qpTab; el.outerHTML = promptTabsHTML(agentId); bindPromptTabs(root, agentId); }
    else if ('qpMore' in t.dataset) openPromptLab();
    else usePrompt(findPrompt(t.dataset.qp));
  });
}

// ---- Prompt Lab (a dialog from "…" and "+ → Use a prompt"; a page from the rail)
function labNav(st) {
  const topics = [...new Set([...TOPICS, ...quickPrompts().map((p) => p.topic).filter(Boolean)])].sort((a, b) => a.localeCompare(b));
  const item = (key, label) => `<button class="lab-nav-item ${st.section === key && !st.q ? 'active' : ''}" data-lab-section="${esc(key)}">${esc(label)}</button>`;
  return `${item('saved', 'Your saved prompts')}${item('builtin', 'Built-in prompts')}${item('tasks', 'Guided tasks')}
    <div class="lab-nav-head">Prompt topics</div>${topics.map((t) => item(`topic:${t}`, t)).join('')}`;
}
function labList(st) {
  const words = st.q.toLowerCase().split(/\s+/).filter(Boolean);
  const hit = (s) => words.every((w) => s.toLowerCase().includes(w));
  let quick = quickPrompts(), tasks = S.recipes;
  if (words.length) { quick = quick.filter((p) => hit(`${p.title} ${p.text} ${p.topic} ${p.group || ''}`)); tasks = tasks.filter((r) => hit(`${r.name} ${r.description || ''} ${r.category || ''}`)); }
  else if (st.section === 'saved') { quick = quick.filter((p) => !p.builtin); tasks = []; }
  else if (st.section === 'builtin') { quick = quick.filter((p) => p.builtin); tasks = []; }
  else if (st.section === 'tasks') quick = [];
  else { const t = st.section.slice(6); quick = quick.filter((p) => p.topic === t); tasks = []; }
  const who = (p) => { const a = assistantById(p.agentId || 'lumen'); return a.id === 'lumen' ? '' : ` · ${esc(a.emoji)} ${esc(a.name)}`; };
  const q = quick.map((p) => `<div class="lab-item">
      <button class="lab-use" data-qp="${esc(p.id)}" title="Put this in the message box"><small class="lab-title">${esc(p.title || 'Prompt')}</small><span class="lab-text">${blankHTML(p.text)}</span><small class="lab-meta">${p.builtin ? 'Built-in' : 'Saved by you'}${who(p)}</small></button>
      <span class="lab-actions">${p.recipeId ? `<button class="btn ghost sm" data-pick-recipe="${esc(p.recipeId)}" title="Answer a few questions instead">Guided form</button>` : ''}${p.builtin ? '' : `<button class="icon-btn" data-qp-edit="${esc(p.id)}" title="Edit">${icon('edit')}</button><button class="icon-btn" data-qp-del="${esc(p.id)}" title="Delete">${icon('trash')}</button>`}</span>
    </div>`).join('');
  const t = tasks.map((r) => `<button class="prompt-pick" data-pick-recipe="${esc(r.id)}"><span class="recipe-emoji">${esc(r.emoji)}</span><span><b>${esc(r.name)}</b><small>${esc(r.description || '')}</small></span></button>`).join('');
  const empty = st.section === 'saved' && !words.length ? '<p class="muted">No saved prompts yet. Choose <b>Save prompt</b> under any message you sent, or <b>New prompt</b>.</p>' : '<p class="muted">No prompts match.</p>';
  return (q || t) ? `${q}${t && q ? '<div class="lab-nav-head">Guided tasks</div>' : ''}${t ? `<div class="prompt-pick-list">${t}</div>` : ''}` : empty;
}
function labHTML(st) {
  return `<div class="lab">
    <div class="lab-side"><div class="lab-nav">${labNav(st)}</div>
      <label class="lab-search">${icon('search')}<input class="input" id="promptSearch" placeholder="Search" autocomplete="off" value="${esc(st.q)}"></label></div>
    <div class="lab-main" id="labList">${labList(st)}</div>
  </div>`;
}
function bindLab(el, st, { conv = null, close = () => {} } = {}) {
  const redraw = () => { $('.lab-nav', el).innerHTML = labNav(st); $('#labList', el).innerHTML = labList(st); };
  $('#promptSearch', el).addEventListener('input', (e) => { st.q = e.target.value; redraw(); });
  el.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-lab-section],[data-qp],[data-pick-recipe],[data-qp-edit],[data-qp-del],[data-qp-new]'); if (!t || !el.contains(t)) return;
    if (t.dataset.labSection) { st.section = t.dataset.labSection; st.q = ''; $('#promptSearch', el).value = ''; redraw(); }
    else if (t.dataset.pickRecipe) { close(); openRecipeRunner(t.dataset.pickRecipe, conv ? { conv } : {}); }
    else if (t.dataset.qp) { const p = findPrompt(t.dataset.qp); close(); usePrompt(p, conv); }
    else if (t.dataset.qpEdit) openPromptEditor(findPrompt(t.dataset.qpEdit), {}, redraw);
    else if ('qpNew' in t.dataset) openPromptEditor(null, {}, () => { st.section = 'saved'; redraw(); });
    else if (t.dataset.qpDel) {
      try { await api(`/api/prompts/${t.dataset.qpDel}`, { method: 'DELETE' }); S.prompts = await api('/api/prompts'); redraw(); toast('Prompt deleted'); } catch (err) { toast(err.message, 'alert'); }
    }
  });
}

function openPromptLab(conv = null) {
  const st = { section: 'builtin', q: '' };
  const m = modal({ title: 'Prompt Lab', sub: 'Pick a prompt, fill in the [blanks] and send. Guided tasks ask a few questions instead.', wide: true, className: 'lab-modal', body: labHTML(st),
    leftAction: { label: 'New prompt', icon: 'plus', run: () => { openPromptEditor(null, {}, () => { st.section = 'saved'; $('.lab-nav', m.el).innerHTML = labNav(st); $('#labList', m.el).innerHTML = labList(st); }); return false; } } });
  bindLab(m.el, st, { conv, close: () => m.close() });
  $('#promptSearch', m.el).focus();
}

function renderPromptsPage() {
  S.view = 'prompts'; setNav('prompts');
  const st = { section: 'builtin', q: '' };
  $('#view').innerHTML = `<div class="page"><div class="page-inner">
    <div class="page-head">
      <div><h1>Prompts</h1><p>Ready-made prompts you can change before sending, like the Prompt Lab in Microsoft 365 Copilot. Click one to put it in the message box. For a finished deliverable, use a <a data-go-tasks>guided task</a>.</p></div>
      <div class="row" style="flex:0 0 auto;gap:8px"><button class="btn soft" data-export-quick title="Save every prompt as plain text you can use in Microsoft 365 Copilot">${icon('external')}Export to Copilot</button><button class="btn grad" data-qp-new>${icon('plus')}New prompt</button></div>
    </div>
    ${labHTML(st)}
  </div></div>`;
  const el = $('#view').firstElementChild;
  bindLab(el, st);
  el.addEventListener('click', async (e) => {
    if (e.target.closest('[data-go-tasks]')) go('recipes');
    else if (e.target.closest('[data-export-quick]')) {
      try { const r = await api('/api/prompts/export-copilot', { method: 'POST', body: { workspace: S.settings.workspace } }); toast(`Saved ${r.count} prompts to ${r.file}`); } catch (err) { toast(err.message, 'alert'); }
    }
  });
}

// New or edited quick prompt. prefill: { title, text, agentId } (e.g. from "Save prompt" under a message).
function openPromptEditor(existing, prefill = {}, onSaved = () => {}, { guided } = {}) {
  const p = { title: '', text: '', topic: 'Ask', agentId: 'lumen', ...prefill, ...(existing || {}) };
  const topics = [...new Set([...TOPICS, p.topic].filter(Boolean))];
  modal({ title: existing ? 'Edit prompt' : 'Save a prompt', sub: 'Put anything people should fill in inside [square brackets], e.g. [file] or [audience].', wide: true,
    body: `<div class="field"><label>Title</label><input class="input" data-pe="title" value="${esc(p.title)}" placeholder="e.g. Summarize for my sponsor"></div>
      <div class="field"><label>Prompt</label><textarea class="input" data-pe="text" rows="5" placeholder="Summarize [file] for [audience] in five bullets">${esc(p.text)}</textarea></div>
      <div class="row" style="gap:12px"><div class="field" style="flex:1"><label>Topic</label><select class="input" data-pe="topic">${topics.map((t) => `<option ${t === p.topic ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></div>
      <div class="field" style="flex:1"><label>Agent</label><select class="input" data-pe="agentId">${S.assistants.map((a) => `<option value="${esc(a.id)}" ${a.id === p.agentId ? 'selected' : ''}>${esc(a.emoji)} ${esc(a.name)}</option>`).join('')}</select></div></div>`,
    ...(guided ? { leftAction: { label: 'Make it a guided task instead', run: () => guided() } } : {}),
    actions: [{ label: 'Cancel' }, { label: 'Save', primary: true, run: async (el) => {
      const v = (k) => $(`[data-pe="${k}"]`, el).value.trim();
      if (!v('text')) { toast('Please write the prompt', 'alert'); return false; }
      const item = { title: v('title') || v('text').slice(0, 60), text: v('text'), topic: v('topic'), agentId: v('agentId') };
      try {
        await api(existing ? `/api/prompts/${existing.id}` : '/api/prompts', { method: existing ? 'PUT' : 'POST', body: item });
        S.prompts = await api('/api/prompts');
        toast(existing ? 'Prompt saved' : 'Saved to Your saved prompts');
        onSaved();
      } catch (e) { toast(e.message, 'alert'); return false; }
    } }] });
}

export { blankSelected, bindPromptTabs, openPromptEditor, openPromptLab, promptTabsHTML, quickFromRecipe, renderPromptsPage, selectBlank, usePrompt };
