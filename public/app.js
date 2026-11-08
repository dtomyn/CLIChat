/* Lumen front-end — no build step, no framework. */
(() => {
'use strict';

// ---------------------------------------------------------------- icons
const P = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  send: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  stop: '<rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" stroke="none"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  wand: '<path d="m15 4-1 2-2 1 2 1 1 2 1-2 2-1-2-1zM5 15l-1 2-2 1 2 1 1 2 1-2 2-1-2-1z"/><path d="m21 3-9 9M14.5 12.5 4 23"/>',
  folder: '<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  sidebar: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 3v18"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  paperclip: '<path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  right: '<path d="m9 18 6-6-6-6"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  file: '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><path d="M14 2v6h6"/>',
  pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  terminal: '<path d="m4 17 6-6-6-6M12 19h8"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  spark: '<path d="M12 3l1.9 5.6L19.5 10.5 13.9 12.4 12 18l-1.9-5.6L4.5 10.5l5.6-1.9z"/>',
  trash: '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  edit: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z"/>',
  pin: '<path d="M12 17v5M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/>',
  dots: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
  external: '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
  alert: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8M21 3v5h-5M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16M8 16H3v5"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  gauge: '<path d="m12 14 4-4M3.34 19a10 10 0 1 1 17.32 0"/>',
  code: '<path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/>',
  retry: '<path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2m-7.07-2.93 1.41-1.41M17.66 6.34l1.41-1.41M2 12h2m16 0h2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41"/>',
  play: '<path d="m6 3 14 9-14 9V3z"/>',
  sheet: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/>',
  gantt: '<path d="M3 3v18h18"/><rect x="7" y="6" width="8" height="3" rx="1"/><rect x="10" y="11" width="9" height="3" rx="1"/><rect x="6" y="16" width="5" height="2.5" rx="1"/>',
  package: '<path d="m7.5 4.27 9 5.15M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5M12 22V12"/>',
  branch: '<path d="M6 3v12"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>',
  keyboard: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
  save: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  thumbUp: '<path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"/>',
  thumbDown: '<path d="M17 14V2"/><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z"/>',
  chart: '<path d="M3 3v18h18"/><path d="M18 17V9M13 17V5M8 17v-3"/>',
  chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  book: '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/><path d="M8 7h8M8 11h6"/>',
  board: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 7v6M12 7v10M16 7v4"/>',
  at: '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><path d="M14 2v6h6M9 15l6-6"/>',
};
const icon = (n, cls = '') => `<span class="ico ${cls}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${P[n] || P.spark}</svg></span>`;
const hydrateIcons = (root = document) => root.querySelectorAll('[data-icon]:not([data-icon-done])').forEach((el) => { el.insertAdjacentHTML('afterbegin', icon(el.dataset.icon)); el.dataset.iconDone = '1'; });

// ---------------------------------------------------------------- utils
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const api = async (url, opts = {}) => {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts, body: opts.body && typeof opts.body !== 'string' && !(opts.body instanceof Blob) ? JSON.stringify(opts.body) : opts.body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
};
const baseName = (p) => String(p || '').split(/[\\/]/).filter(Boolean).pop() || p;
const extOf = (p) => (baseName(p).match(/\.([a-z0-9]+)$/i) || [, 'file'])[1].slice(0, 4);
const fmtSize = (n) => n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`;
const timeAgo = (t) => { const s = (Date.now() - t) / 1000; if (s < 60) return 'just now'; if (s < 3600) return `${Math.floor(s / 60)}m ago`; if (s < 86400) return `${Math.floor(s / 3600)}h ago`; return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); };
const firstName = () => (S.settings.userName || '').split(' ')[0];

function toast(text, ic = 'check') {
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `${icon(ic)}<span>${esc(text)}</span>`;
  $('#toasts').appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 260); }, 2800);
}

// ---------------------------------------------------------------- markdown
marked.use({ gfm: true, breaks: false });
const renderer = new marked.Renderer();
renderer.code = ({ text, lang }) => {
  const l = (lang || '').split(/\s/)[0];
  return `<pre><div class="code-head"><span>${esc(l || 'text')}</span><button data-copy-code>${icon('copy')}Copy</button></div><code class="${l ? `language-${esc(l)}` : ''}">${esc(text)}</code></pre>`;
};
renderer.table = function (token) {
  const head = token.header.map((c) => `<th${c.align ? ` style="text-align:${c.align}"` : ''}>${this.parser.parseInline(c.tokens)}</th>`).join('');
  const body = token.rows.map((r) => `<tr>${r.map((c) => `<td${c.align ? ` style="text-align:${c.align}"` : ''}>${this.parser.parseInline(c.tokens)}</td>`).join('')}</tr>`).join('');
  return `<div class="table-wrap"><div class="table-tools"><button data-copy-table title="Copy for Excel, Word or Outlook">${icon('copy')}Copy table</button></div><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
};
DOMPurify.addHook('afterSanitizeAttributes', (n) => { if (n.tagName === 'A') { n.setAttribute('target', '_blank'); n.setAttribute('rel', 'noopener noreferrer'); } });
// AI replies can carry text from documents and web pages. The app's click handlers are keyed on data-* attributes
// (Apply, open file, send suggestion…), so replies may not carry data attributes other than the two copy buttons,
// ids that could shadow the app's own elements (#input…), or forms.
const md = (text, cursor = false) => DOMPurify.sanitize(marked.parse(String(text || ''), { renderer }) + (cursor ? '<span class="cursor"></span>' : ''), {
  ALLOW_DATA_ATTR: false, ADD_ATTR: ['target', 'data-copy-code', 'data-copy-table'],
  FORBID_TAGS: ['form', 'textarea', 'select', 'option', 'style'], FORBID_ATTR: ['id', 'name', 'form', 'formaction'],
});
const highlight = (root) => { if (window.hljs) $$('pre code[class*="language-"]:not(.hljs)', root).forEach((b) => { try { hljs.highlightElement(b); } catch {} }); };

// ---------------------------------------------------------------- state
const S = {
  settings: {}, providers: [], assistants: [], recipes: [], convs: [], pipelines: [], runs: [], schedules: [],
  view: 'home', current: null, search: '',
  live: new Map(), // conversationId -> { ac, msg }
  draft: { text: '', attachments: [], assistantId: null, access: null },
  openSteps: new Set(), recipeTab: 'All',
  editing: null, // id of the user message being edited inline
};
const isLive = (conv) => !!conv && [...S.live.values()].some((l) => l.conv === conv);
const assistantById = (id) => S.assistants.find((a) => a.id === id) || S.assistants[0] || { id: 'lumen', name: 'Lumen', emoji: '✨', color: 'violet' };
const provider = () => S.providers.find((p) => p.id === S.settings.providerId) || S.providers[0];
const ACCESS = {
  chat: { emoji: '💬', label: 'Just chat', short: 'Chat only', desc: "Answers questions and can search the web. Won't look at your files." },
  read: { emoji: '👀', label: 'Read my files', short: 'Can read files', desc: 'Can open and read documents in your project folder.' },
  edit: { emoji: '✍️', label: 'Create & edit files', short: 'Can edit files', desc: 'Can write new documents and update files in your project folder.' },
};
const COLORS = ['violet', 'teal', 'amber', 'rose', 'blue', 'green', 'slate'];
const EMOJIS = ['✨', '🧭', '📋', '🪶', '📊', '🧠', '🚀', '🎯', '💡', '🛠️', '📈', '🧾', '🗂️', '🤝', '🔍', '🧪', '📣', '🏗️', '💬', '🌱', '⚖️', '🗓️', '🦉', '🎨'];

// ---------------------------------------------------------------- boot
async function boot() {
  hydrateIcons();
  const [status, assistants, recipes, convs, skills, pipelines, runs, schedules] = await Promise.all([api('/api/status'), api('/api/assistants'), api('/api/recipes'), api('/api/conversations'), api('/api/skills'), api('/api/pipelines'), api('/api/runs'), api('/api/schedules')]);
  S.pipelines = pipelines; S.runs = runs;
  S.schedules = schedules;
  S.skills = skills;
  S.settings = status.settings; S.providers = status.providers; S.assistants = assistants; S.recipes = recipes; S.convs = convs; S.osUser = status.user;
  applyTheme(S.settings.theme);
  if (innerWidth <= 860) $('#app').classList.add('collapsed'); // the chats panel overlays the page on small screens
  renderUser();
  renderConvList();
  bindChrome();
  route();
  window.addEventListener('hashchange', route);
  setInterval(pollSchedules, 60000);
  if (!S.settings.onboarded) openOnboarding();
}

function applyTheme(t) {
  if (!t || t === 'system') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
  try { localStorage.setItem('lumen-theme', t || 'system'); } catch {}
}

async function saveSettings(patch) {
  S.settings = await api('/api/settings', { method: 'PUT', body: patch });
  renderUser();
}

function renderUser() {
  const name = S.settings.userName || 'Welcome';
  $('#userName').textContent = name;
  $('#userAvatar').textContent = (S.settings.userName || '✦').trim().charAt(0).toUpperCase();
  const p = provider();
  const ok = p && p.available;
  $('#engineStatus').innerHTML = `<i class="dot ${ok ? 'ok' : 'bad'}"></i><span>${p ? esc(p.name) : 'No engine'} · ${ok ? 'Ready' : 'Not set up'}</span>`;
}

// ---------------------------------------------------------------- routing
function route() {
  const h = location.hash.replace(/^#\/?/, '');
  $('#view').onclick = null;
  closeMenu();
  if (h.startsWith('c/')) return openConversation(h.slice(2));
  if (h.startsWith('run/')) { S.current = null; return renderRun(h.slice(4)); }
  S.current = null;
  if (h === 'runs') return renderRuns();
  if (h === 'assistants' || h === 'agents') return renderAssistantsPage();
  if (h === 'recipes' || h === 'prompts') return renderRecipesPage();
  if (h === 'insights') return renderInsightsPage();
  if (h === 'samples') return renderSamplesPage();
  renderHome();
}
const go = (h) => { if (location.hash === `#/${h}`) route(); else location.hash = `/${h}`; };
function setNav(name) { $$('.nav-item').forEach((n) => n.classList.toggle('active', n.dataset.nav === name || (n.dataset.nav === 'home' && name === 'chat'))); renderConvList(); }

// ---------------------------------------------------------------- sidebar
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

// ---------------------------------------------------------------- menus
let menuEl = null;
function openMenu(anchor, items, { align = 'left', title } = {}) {
  closeMenu();
  menuEl = document.createElement('div');
  menuEl.className = 'menu';
  menuEl.innerHTML = (title ? `<div class="menu-title">${esc(title)}</div>` : '') + items.map((it, i) => it.sep ? '<div class="menu-sep"></div>' : it.heading ? `<div class="menu-title">${esc(it.heading)}</div>` : `
    <button class="menu-item ${it.selected ? 'selected' : ''} ${it.danger ? 'danger' : ''}" data-i="${i}">
      ${it.emoji ? `<span style="font-size:17px;width:20px;text-align:center">${it.emoji}</span>` : it.icon ? icon(it.icon) : ''}
      <span class="mi-text"><span>${esc(it.label)}</span>${it.hint ? `<span class="mi-hint">${esc(it.hint)}</span>` : ''}</span>
      ${it.selected !== undefined ? icon('check', 'check') : ''}
    </button>`).join('');
  document.body.appendChild(menuEl);
  const r = anchor.getBoundingClientRect();
  const mw = menuEl.offsetWidth, mh = menuEl.offsetHeight;
  let top = r.bottom + 6; if (top + mh > innerHeight - 8) top = r.top - mh - 6;
  let left = align === 'right' ? r.right - mw : r.left; left = Math.max(8, Math.min(left, innerWidth - mw - 8));
  Object.assign(menuEl.style, { top: `${Math.max(8, top)}px`, left: `${left}px` });
  menuEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-i]'); if (!b) return;
    const it = items[+b.dataset.i]; closeMenu(); it.run && it.run();
  });
  setTimeout(() => document.addEventListener('mousedown', outside), 0);
  function outside(e) { if (menuEl && !menuEl.contains(e.target)) { closeMenu(); } }
  menuEl._off = () => document.removeEventListener('mousedown', outside);
}
function closeMenu() { if (menuEl) { menuEl._off?.(); menuEl.remove(); menuEl = null; } }

// ---------------------------------------------------------------- modal
function modal({ title, sub, body = '', actions = [], wide = false, onOpen, head, leftAction, dismissable = true }) {
  const root = $('#modalRoot');
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = `
    <div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">
      ${head ?? `<div class="modal-head"><div><h2>${esc(title)}</h2>${sub ? `<p>${esc(sub)}</p>` : ''}</div>${dismissable ? `<button class="icon-btn" data-x>${icon('x')}</button>` : ''}</div>`}
      ${body ? `<div class="modal-body">${body}</div>` : ''}
      ${actions.length || leftAction ? `<div class="modal-foot">${leftAction ? `<button class="btn ${leftAction.danger ? 'danger' : 'ghost'} left" data-left>${leftAction.icon ? icon(leftAction.icon) : ''}${esc(leftAction.label)}</button>` : ''}${actions.map((a, i) => `<button class="btn ${a.primary ? 'primary' : a.grad ? 'grad' : a.danger ? 'primary' : 'ghost'}" data-a="${i}" ${a.danger ? 'style="background:var(--danger);color:#fff"' : ''}>${a.icon ? icon(a.icon) : ''}${esc(a.label)}</button>`).join('')}</div>` : ''}
    </div>`;
  root.appendChild(wrap);
  const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape' && dismissable && root.lastElementChild === wrap) close(); };
  document.addEventListener('keydown', onKey);
  wrap.addEventListener('mousedown', (e) => { if (e.target === wrap && dismissable) close(); });
  wrap.querySelector('[data-x]')?.addEventListener('click', close);
  wrap.querySelector('[data-left]')?.addEventListener('click', async () => { if ((await leftAction.run?.(wrap)) !== false) close(); });
  $$('[data-a]', wrap).forEach((b) => b.addEventListener('click', async () => {
    const a = actions[+b.dataset.a];
    if (!a.run) return close();
    b.disabled = true;
    try { if ((await a.run(wrap)) !== false) close(); } catch (e) { toast(e.message, 'alert'); }
    b.disabled = false;
  }));
  onOpen?.(wrap, close);
  return { el: wrap, close };
}

// ---------------------------------------------------------------- composer
function composerHTML({ home = false, conv = null } = {}) {
  const d = S.draft;
  const a = assistantById(conv ? conv.assistantId : d.assistantId || 'lumen');
  const access = conv ? (conv.access || S.settings.access) : (d.access || a.access || S.settings.access);
  const p = provider();
  const model = (p?.models || []).find((m) => m.id === S.settings.model) || p?.models?.[0];
  const live = isLive(conv);
  const placeholder = home ? `Message ${a.id === 'lumen' ? 'Lumen' : a.name} · type / to add a file` : `Message ${a.name}…`;
  return `
    <div class="composer-wrap">
      <div class="pinned-strip" id="pinnedStrip">${pinnedHTML(conv)}</div>
      <div class="composer" id="composer">
        <div class="attach-list" id="attachList">${attachChips()}</div>
        <textarea id="input" rows="1" placeholder="${esc(placeholder)}">${esc(d.text)}</textarea>
        <div class="composer-row">
          <button class="pill round" id="attachBtn" title="Add content">${icon('plus')}</button>
          ${home ? `<button class="pill outline" id="assistantPill" data-color="${esc(a.color)}"><span class="a-badge sm">${esc(a.emoji)}</span><span class="lbl">${esc(a.name)}</span>${icon('chevron', 'caret')}</button>` : ''}
          <button class="pill" id="accessPill" title="What Lumen is allowed to do">${ACCESS[access]?.emoji || '👀'} <span class="lbl">${esc(ACCESS[access]?.short || 'Can read files')}</span>${icon('chevron', 'caret')}</button>
          <span class="spacer"></span>
          ${model && p.models.length > 1 ? `<button class="pill" id="modelPill" title="Response mode">${icon('gauge')}<span class="lbl">${esc(model.label)}</span>${icon('chevron', 'caret')}</button>` : ''}
          <button class="send-btn ${live ? 'stop' : ''}" id="sendBtn" title="${live ? 'Stop' : 'Send (Enter)'}">${icon(live ? 'stop' : 'send')}</button>
        </div>
        <input type="file" id="fileInput" multiple hidden>
      </div>
      <div class="composer-hint">${!home && !live && suggestedNextStep(conv) ? `<span class="suggest-hint"><kbd>↑</kbd> fills in the suggested next step · </span>` : ''}${boundaryNote()}</div>
    </div>`;
}

// Lumen looks like Microsoft 365 Copilot on purpose, so say plainly which tool (and which AI service) this is.
function boundaryNote() {
  const p = provider();
  return `<span class="boundary-note" title="Lumen sends your messages and files to ${esc(p?.name || 'the AI engine')} through ${esc(p?.vendor || 'its command-line tool')}. Microsoft 365 Copilot's data protections don't apply here.">${icon('shield')}<span>You're in <b>Lumen</b>, powered by ${esc(p?.name || 'your AI engine')}. This isn't Microsoft 365 Copilot.</span></span>`;
}

// Pull up to 3 suggested next steps out of the latest assistant reply: a "Suggested next step(s):" line or list,
// or a "Next steps" / "What's next" heading followed by a list or a sentence. The last such section wins.
function suggestedNextSteps(conv) {
  const last = conv?.messages?.[conv.messages.length - 1];
  if (!last || last.role !== 'assistant' || !last.content) return [];
  const text = last.content;
  const head = /(?:suggested next steps?\b|(?:^|\n)[ \t]*(?:#{1,6}[ \t]+)?[*_]*(?:next steps?|what(?:['’]s| is)? next\??)[*_]*[ \t]*(?=[:\n]|$))[*_]*[ \t]*[:\-–—]?[*_]*[ \t]*/gi;
  const LIST = /^\s*(?:[-*+]|\d+[.)])\s+/;
  const clean = (s) => s.replace(LIST, '').replace(/\*\*|__|`/g, '').replace(/^\[[ x]\]\s*/i, '').replace(/^["“'‘]+|["”'’]+$/g, '').trim();
  let m, found = [];
  while ((m = head.exec(text))) {
    const lines = text.slice(head.lastIndex).split('\n').map((l) => l.replace(/^\s*>\s?/, ''));
    const items = []; let lead = '';
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (/^\s*#{1,6}\s/.test(l)) break;
      if (!l.trim()) {
        if (!items.length && !lead) continue;
        const next = lines.slice(i + 1).find((x) => x.trim());
        if (items.length && next && LIST.test(next)) continue; // loose list
        break;
      }
      if (LIST.test(l)) items.push(clean(l));
      else if (items.length) { if (/^\s{2,}/.test(l)) items[items.length - 1] += ` ${clean(l)}`; else break; }
      else lead += `${lead ? ' ' : ''}${l.trim()}`;
    }
    const steps = (items.length ? items : lead ? [clean(lead)] : []).filter(Boolean).slice(0, 3);
    if (steps.length) found = steps;
  }
  return found;
}
const suggestedNextStep = (conv) => suggestedNextSteps(conv)[0] || '';

function attachChips() {
  return S.draft.attachments.map((f, i) => `
    <span class="attach-chip ${f.uploading ? 'uploading' : ''}">${f.uploading ? '<span class="spinner" style="width:13px;height:13px"></span>' : icon('file')}<span class="name">${esc(f.name)}</span><button data-rm-attach="${i}" title="Remove">${icon('x')}</button></span>`).join('');
}

const pinsFor = (conv) => conv ? (conv.pinned_files || []) : (S.draft.pinned || []);
function pinnedHTML(conv) {
  const pins = pinsFor(conv);
  return `<span class="pinned-label">Pinned files</span>${pins.map((p) => `<span class="attach-chip" data-pin-path="${esc(p)}" title="${esc(p)}">📌 <span class="name">${esc(baseName(p))}</span><small class="pin-missing"></small><button data-unpin="${esc(p)}" title="Unpin">${icon('x')}</button></span>`).join('')}<button class="btn ghost sm" data-pick-pin title="Pin a file">+ Add</button>`;
}
async function checkPinnedFiles(conv, root) {
  const pins = pinsFor(conv).slice();
  if (!pins.length) return;
  try {
    const r = await api('/api/file-status', { method: 'POST', body: { workspace: conv?.workspace || S.settings.workspace, paths: pins } });
    $$('#pinnedStrip [data-pin-path]', root).forEach((el) => {
      const i = pins.indexOf(el.dataset.pinPath);
      if (i >= 0 && !r.exists[i]) { el.classList.add('missing'); $('.pin-missing', el).textContent = 'missing'; }
    });
  } catch (e) { toast(e.message, 'alert'); }
}
async function setPins(conv, pins) {
  if (conv) {
    if (conv.id) {
      try { await api(`/api/conversations/${conv.id}`, { method: 'PATCH', body: { pinned_files: pins } }); }
      catch (e) { toast(e.message, 'alert'); return; }
    }
    conv.pinned_files = pins;
  } else S.draft.pinned = pins;
  const strip = $('#pinnedStrip');
  if (strip) { strip.innerHTML = pinnedHTML(conv); checkPinnedFiles(conv, $('#view')); }
}
async function chooseWorkspaceFiles(workspace, title, onChoose, multiple = true) {
  const { files } = await api(`/api/folder/files?workspace=${encodeURIComponent(workspace)}&all=1`);
  modal({ title, wide: true, body: files.length ? `<div class="file-picker">${files.map((f, i) => `<label><input type="${multiple ? 'checkbox' : 'radio'}" name="picked-file" value="${i}"> ${esc(f.rel)}</label>`).join('')}</div>` : '<p>No files found in this project folder.</p>',
    actions: [{ label: 'Cancel' }, { label: 'Choose', primary: true, run: (el) => {
      const selected = $$('input[name="picked-file"]:checked', el).map((x) => files[+x.value]);
      if (!selected.length) { toast('Choose at least one file', 'alert'); return false; }
      return onChoose(selected);
    } }] });
}
function pickPinnedFiles(conv) {
  chooseWorkspaceFiles(conv?.workspace || S.settings.workspace, 'Pin files to this chat', (files) => setPins(conv, [...new Set([...pinsFor(conv), ...files.map((f) => f.path)])])).catch((e) => toast(e.message, 'alert'));
}

function bindComposer(root, { conv = null } = {}) {
  const input = $('#input', root);
  const send = $('#sendBtn', root);
  $('#pinnedStrip', root).addEventListener('click', (e) => {
    const b = e.target.closest('[data-unpin],[data-pick-pin]'); if (!b) return;
    if ('pickPin' in b.dataset) pickPinnedFiles(conv);
    else setPins(conv, pinsFor(conv).filter((p) => p !== b.dataset.unpin));
  });
  checkPinnedFiles(conv, root);
  const autosize = () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 280) + 'px'; };
  const syncSend = () => {
    const live = isLive(conv);
    const ready = input.value.trim() || S.draft.attachments.some((a) => !a.uploading);
    send.disabled = !live && !ready;
    send.classList.toggle('go', !live && !!ready);
  };
  autosize(); syncSend();
  const mention = fileMention(input, () => conv?.workspace || currentWorkspace());
  input.addEventListener('input', () => { S.draft.text = input.value; autosize(); syncSend(); mention.update(); });
  input.addEventListener('keydown', (e) => {
    if (mention.key(e)) return;
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); if (!isLive(conv)) submit(); return; }
    if (e.key === 'ArrowUp' && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey && !input.value.trim() && !isLive(conv)) {
      const s = suggestedNextStep(conv); if (!s) return;
      e.preventDefault();
      input.value = S.draft.text = s;
      autosize(); syncSend();
      input.setSelectionRange(s.length, s.length);
    }
  });
  input.addEventListener('paste', (e) => { const files = [...(e.clipboardData?.files || [])]; if (files.length) { e.preventDefault(); uploadFiles(files); } });
  send.addEventListener('click', () => { if (isLive(conv)) stopConv(conv); else submit(); });
  $('#attachBtn', root).addEventListener('click', (e) => openMenu(e.currentTarget, [
    { heading: 'Add content' },
    { icon: 'upload', label: 'Upload from this device', hint: 'Saved to your notebook’s Attachments folder', run: () => $('#fileInput', root).click() },
    { icon: 'book', label: 'Reference a file in your notebook', hint: 'Or type / in the message box', run: () => mention.start() },
    { icon: 'pin', label: 'Pin a file to this chat', hint: 'Included with every message', run: () => pickPinnedFiles(conv) },
  ]));
  $('#fileInput', root).addEventListener('change', (e) => { uploadFiles([...e.target.files]); e.target.value = ''; });
  $('#attachList', root).addEventListener('click', (e) => { const b = e.target.closest('[data-rm-attach]'); if (b) { S.draft.attachments.splice(+b.dataset.rmAttach, 1); refreshAttach(); } });
  $('#assistantPill', root)?.addEventListener('click', (e) => openMenu(e.currentTarget, [
    { heading: 'Who should help?' },
    ...S.assistants.map((a) => ({ emoji: a.emoji, label: a.name, hint: a.tagline, selected: (S.draft.assistantId || 'lumen') === a.id, run: () => { S.draft.assistantId = a.id; if (a.access) S.draft.access = a.access; renderHome(); } })),
    { sep: true }, { icon: 'plus', label: 'Create an agent', run: () => openAssistantBuilder() },
  ]));
  $('#accessPill', root).addEventListener('click', (e) => {
    const cur = conv ? (conv.access || S.settings.access) : (S.draft.access || assistantById(S.draft.assistantId).access || S.settings.access);
    openMenu(e.currentTarget, [{ heading: 'What can Lumen do?' }, ...Object.entries(ACCESS).map(([k, v]) => ({ emoji: v.emoji, label: v.label, hint: v.desc, selected: cur === k, run: async () => {
      if (conv) { conv.access = k; if (conv.id) await api(`/api/conversations/${conv.id}`, { method: 'PATCH', body: { access: k } }); renderChat(); } else { S.draft.access = k; renderHome(); }
      toast(`${v.label} — ${k === 'edit' ? 'Lumen can now save files' : k === 'read' ? 'Lumen can read your folder' : 'files are off-limits'}`, 'shield');
    } }))]);
  });
  $('#modelPill', root)?.addEventListener('click', (e) => openMenu(e.currentTarget, [{ heading: 'Response mode' }, ...provider().models.map((m) => ({ label: m.label, hint: m.hint, selected: S.settings.model === m.id, run: async () => { await saveSettings({ model: m.id }); rerenderCurrent(); } }))], { align: 'right' }));
  root._sync = syncSend;
}

// "/" in the message box: pick a file from the notebook (project folder), the way "/" references a file in
// Microsoft 365 Copilot. The chosen file is attached by reference: nothing is copied.
const fileCache = { ws: '', at: 0, files: [] };
async function notebookFiles(ws) {
  if (fileCache.ws === ws && Date.now() - fileCache.at < 30000) return fileCache.files;
  const { files } = await api(`/api/folder/files?workspace=${encodeURIComponent(ws)}&all=1`);
  Object.assign(fileCache, { ws, at: Date.now(), files });
  return files;
}
function fileMention(input, workspace) {
  const st = { el: null, items: [], i: 0, files: null };
  const TRIGGER = /(^|\s)\/([^\s/\\]*)$/;
  const query = () => { const m = TRIGGER.exec(input.value.slice(0, input.selectionStart)); return m ? m[2] : null; };
  const close = () => { st.el?.remove(); st.el = null; st.items = []; };
  const pick = (f) => {
    const caret = input.selectionStart, q = query();
    if (q !== null) input.value = input.value.slice(0, caret - q.length - 1) + input.value.slice(caret);
    const pos = caret - (q === null ? 0 : q.length + 1);
    S.draft.text = input.value;
    if (!S.draft.attachments.some((a) => a.path === f.path)) S.draft.attachments.push({ name: f.name, path: f.path });
    close(); refreshAttach();
    input.focus(); input.setSelectionRange(pos, pos);
  };
  const draw = () => {
    const q = query();
    if (q === null || !st.files) return close();
    const ql = q.toLowerCase();
    st.items = st.files.filter((f) => f.rel.toLowerCase().includes(ql))
      .sort((a, b) => (b.name.toLowerCase().startsWith(ql) - a.name.toLowerCase().startsWith(ql)) || b.mtime - a.mtime).slice(0, 8);
    st.i = Math.min(st.i, Math.max(0, st.items.length - 1));
    if (!st.el) {
      st.el = document.createElement('div'); st.el.className = 'menu mention-menu'; st.el.setAttribute('role', 'listbox');
      st.el.addEventListener('mousedown', (e) => { e.preventDefault(); const b = e.target.closest('[data-mi]'); if (b) pick(st.items[+b.dataset.mi]); });
      document.body.appendChild(st.el);
    }
    st.el.innerHTML = `<div class="menu-title">Files in your notebook</div>` + (st.items.length ? st.items.map((f, i) => `
      <button class="menu-item ${i === st.i ? 'focus' : ''}" data-mi="${i}" role="option" aria-selected="${i === st.i}">${icon('file')}<span class="mi-text"><span>${esc(f.name)}</span>${f.rel !== f.name ? `<span class="mi-hint">${esc(f.rel.slice(0, -f.name.length - 1))}</span>` : ''}</span></button>`).join('')
      : `<div class="conv-empty" style="padding:10px">No files match “${esc(q)}”.</div>`);
    const r = (input.closest('.composer') || input).getBoundingClientRect();
    Object.assign(st.el.style, { left: `${Math.max(8, r.left)}px`, bottom: `${innerHeight - r.top + 6}px`, top: 'auto', width: `${Math.min(r.width, 440)}px`, maxWidth: 'none' });
  };
  const update = async () => {
    if (query() === null) return close();
    if (!st.files) { try { st.files = await notebookFiles(workspace()); } catch (e) { toast(e.message, 'alert'); return close(); } }
    draw();
  };
  input.addEventListener('blur', () => setTimeout(close, 120));
  return {
    update,
    // Open the picker from the "+" menu: insert a "/" at the caret.
    start() {
      const s = input.selectionStart ?? input.value.length;
      const pre = s && !/\s$/.test(input.value.slice(0, s)) ? ' /' : '/';
      input.value = input.value.slice(0, s) + pre + input.value.slice(s);
      input.focus(); input.setSelectionRange(s + pre.length, s + pre.length);
      input.dispatchEvent(new Event('input'));
    },
    // Keyboard handling while the picker is open. Returns true when it used the key.
    key(e) {
      if (!st.el) return false;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (st.items.length) { st.i = (st.i + (e.key === 'ArrowDown' ? 1 : -1) + st.items.length) % st.items.length; draw(); } return true; }
      if ((e.key === 'Enter' || e.key === 'Tab') && st.items.length) { e.preventDefault(); pick(st.items[st.i]); return true; }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return true; }
      return false;
    },
  };
}

function refreshAttach() { const l = $('#attachList'); if (l) l.innerHTML = attachChips(); syncAnySend(); }
function syncAnySend() { const s = $('#sendBtn'), i = $('#input'); if (!s || !i || s.classList.contains('stop')) return; const ready = i.value.trim() || S.draft.attachments.some((a) => !a.uploading); s.disabled = !ready; s.classList.toggle('go', !!ready); }
const currentWorkspace = () => S.current?.workspace || S.settings.workspace;

async function uploadFiles(files) {
  for (const f of files) {
    const entry = { name: f.name, uploading: true };
    S.draft.attachments.push(entry); refreshAttach();
    try {
      const r = await fetch(`/api/upload?workspace=${encodeURIComponent(currentWorkspace())}&name=${encodeURIComponent(f.name)}`, { method: 'POST', body: f });
      const data = await r.json(); if (!r.ok) throw new Error(data.error);
      Object.assign(entry, { path: data.path, name: data.name, uploading: false });
    } catch (e) { S.draft.attachments.splice(S.draft.attachments.indexOf(entry), 1); toast(`Couldn't attach ${f.name}`, 'alert'); }
    refreshAttach();
  }
  $('#input')?.focus();
}

function submit(textOverride) {
  const text = (textOverride ?? S.draft.text).trim();
  const attachments = S.draft.attachments.filter((a) => !a.uploading && a.path);
  if (!text && !attachments.length) return;
  const p = provider();
  if (!p?.available) { openSettings('engine'); toast('Connect an AI engine first', 'alert'); return; }
  S.draft.text = ''; S.draft.attachments = [];
  sendMessage({ text: text || 'Please take a look at the attached file(s).', attachments });
}

// ---------------------------------------------------------------- home
function greetingWord() { const h = new Date().getHours(); return h < 5 ? 'Burning the midnight oil' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; }

function renderHome() {
  S.view = 'home'; setNav('home');
  const a = assistantById(S.draft.assistantId || 'lumen');
  const recipes = S.recipes.slice(0, 6);
  $('#view').innerHTML = `
    <div class="home">
      <div class="home-inner">
        <div class="greeting">
          ${a.id === 'lumen' ? '' : `<span class="a-badge md" data-color="${esc(a.color)}">${esc(a.emoji)}</span>`}
          <h1>${a.id === 'lumen' ? `${greetingWord()}${firstName() ? `, ${esc(firstName())}` : ''}` : esc(a.name)}</h1>
        </div>
        <p class="home-sub">${a.id === 'lumen' ? 'How can I help today?' : esc(a.tagline || '')}</p>
        ${composerHTML({ home: true })}

        ${a.starters?.length ? `<div class="prompt-chips" aria-label="Suggested prompts">${a.starters.map((s) => `<button class="prompt-chip" data-starter="${esc(s)}" title="${esc(s)}">${icon('spark')}<span>${esc(s)}</span></button>`).join('')}</div>` : ''}

        ${demoBanner()}

        <div class="section-label"><span>Agents</span><a data-go="assistants">See all agents</a></div>
        <div class="assistant-row">
          ${S.assistants.map((x) => `<button class="a-chip ${x.id === (S.draft.assistantId || 'lumen') ? 'selected' : ''}" data-color="${esc(x.color)}" data-pick-assistant="${esc(x.id)}" title="${esc(x.tagline || '')}"><span class="a-badge">${esc(x.emoji)}</span>${esc(x.name)}</button>`).join('')}
          <button class="a-chip" data-new-assistant><span class="a-badge" style="background:var(--panel-2)">${icon('plus')}</span>Create an agent</button>
        </div>

        <div class="section-label"><span>From the prompt gallery</span><a data-go="recipes">See all prompts</a></div>
        <div class="recipe-grid">${recipes.map(recipeCard).join('')}</div>

        <div class="section-label"><span>Guided delivery ${lumenOnlyBadge()}</span><a data-go="runs">View lifecycle runs</a></div>
        <button class="starter" data-go="runs"><span>🧬 Requirements to stories: guided stages with approval gates</span>${icon('right')}</button>
      </div>
    </div>`;
  const root = $('#view');
  bindComposer(root);
  root.firstElementChild.addEventListener('click', homeClicks);
  setTimeout(() => { if (!$('#modalRoot').children.length) $('#input')?.focus(); }, 50);
}

// Sample packs: one list drives the Samples page (rail) and the "You're in the …" banner on the home screen.
const SAMPLE_PACKS = [
  { id: 'crm', emoji: '📦', name: 'PM demo', title: 'Contoso CRM Migration demo', agent: 'schedule-analyst',
    summary: 'A Microsoft Project plan with an Excel budget tracker, RAID log, timesheets and a weekly progress update.',
    inside: 'A Microsoft Project plan plus a budget tracker, RAID log, timesheets and a progress update in Excel. Try one:',
    prompts: [['plan-health-check', '🩺 Health check'], ['plan-status-report', '📣 Status report'], ['plan-update-progress', '🔄 Update the plan'], ['budget-variance', '💰 Budget review']] },
  { id: 'aidlc', emoji: '🧬', name: 'AIDLC sample', title: 'Online Permit Renewal AIDLC sample', agent: 'traceability-analyst',
    summary: 'Program documents (BRD, design, Ways of Working) and a traceability workbook for the requirements, design, story and traceability agents.',
    inside: 'Synthetic program documents (PID, BRD, Solution Blueprint, Ways of Working, data model) and a traceability workbook. Try one:',
    prompts: [['aidlc-knowledge-inventory', '📚 Knowledge inventory'], ['aidlc-refine-requirements', '🔬 Refine requirements'], ['aidlc-trace-check', '🔗 Traceability check'], ['aidlc-change-impact', '🌊 Change impact']] },
  { id: 'data', emoji: '📊', name: 'Data sample', title: 'Permit Applications data sample', agent: 'data-profiler',
    summary: 'A source extract, schemas and a data dictionary for profiling, mapping and pipeline code.',
    inside: 'A synthetic source extract with seeded data quality problems, the source tables, a Silver canonical model, a Gold model and a data dictionary. Try them in order:',
    prompts: [['data-profile', '📊 Profile a dataset'], ['data-compare-schemas', '🔀 Compare schemas'], ['data-draft-sttm', '🗺️ Draft the STTM'], ['data-generate-code', '🧱 Generate pipeline code']] },
  { id: 'security', emoji: '🛡️', name: 'Security sample', title: 'Permit Renewal security sample', agent: 'security-control-mapper',
    summary: 'A control catalogue, a partly filled SCTM and an evidence folder for security assessment work.',
    inside: 'A synthetic control catalogue, a partly filled SCTM, the security design and an evidence folder with a missing, a stale and an orphan file. Try one:',
    prompts: [['security-draft-sctm', '🛡️ Draft the SCTM'], ['security-evidence-gaps', '🗂️ Evidence gap check'], ['security-design-document', '📘 Security design document']] },
  { id: 'change', emoji: '🔄', name: 'Change sample', title: 'Permit Renewal change sample', agent: 'change-impact-analyst',
    summary: 'Interview transcripts, change impact assessments and an English/French guide for change, training and bilingual work.',
    inside: 'Two interview transcripts, change impact assessments, a role list, an English/French glossary and a guide in both languages. Try one:',
    prompts: [['change-interview-impacts', '🔄 Interview → change impacts'], ['change-consolidate-cia', '🧩 Consolidate the CIA'], ['change-training-materials', '🎓 Training materials'], ['bilingual-qa', '🔍 Bilingual QA']] },
];
const samplePack = (id) => SAMPLE_PACKS.find((p) => p.id === id) || SAMPLE_PACKS[0];
const activeSamplePack = () => (S.settings.demoInstalled && S.settings.workspace === S.settings.demoInstalled ? samplePack(S.settings.demoPack || 'crm') : null);
const samplePromptButtons = (p) => p.prompts.map(([id, label]) => `<button class="btn soft sm" data-recipe="${esc(id)}">${esc(label)}</button>`).join('');

// Home: only the "You're in the …" banner while a sample is the notebook. The offer itself lives on the Samples page
// (rail), plus a one-line hint for someone who has never chatted or tried a sample.
function demoBanner() {
  const p = activeSamplePack();
  if (p) {
    return `<div class="demo-banner active">
      <div class="demo-icon">${p.emoji}</div>
      <div class="demo-text"><b>You're in the ${esc(p.title)}</b><span>${esc(p.inside)}</span>
        <div class="demo-actions">
          ${samplePromptButtons(p)}
          <button class="btn ghost sm" data-open-drawer>${icon('folder')}See the files</button>
        </div>
      </div></div>`;
  }
  if (S.settings.demoDismissed || S.settings.demoInstalled || S.convs.length) return '';
  return `<div class="sample-hint">${icon('package')}<span>New to Lumen? <a data-go="samples">Try it on sample data</a> first. You can always find it under <b>Samples</b> on the left.</span><button class="icon-btn" data-dismiss-demo title="Hide">${icon('x')}</button></div>`;
}

function renderSamplesPage() {
  S.view = 'samples'; setNav('samples');
  const active = activeSamplePack();
  $('#view').innerHTML = `
    <div class="page"><div class="page-inner">
      <div class="page-head"><div><h1>Sample data</h1><p>Realistic, made-up project files to try the agents and prompts on before using your own documents. Each sample is copied into a new folder inside your notebook, which then becomes your project folder.</p></div></div>
      <div class="card-grid">
        ${SAMPLE_PACKS.map((p, i) => {
          const a = assistantById(p.agent), here = active?.id === p.id;
          return `<div class="a-card sample-card${here ? ' here' : ''}" data-color="${esc(a.color)}" style="animation-delay:${i * 40}ms">
            <div class="a-card-top"><span class="a-badge lg">${p.emoji}</span>${here ? '<span class="badge accent">You’re here</span>' : ''}</div>
            <div><h3>${esc(p.name)}</h3></div>
            <p class="tagline">${esc(p.summary)}</p>
            <p class="sample-agent">Starts with <span class="a-badge sm" data-color="${esc(a.color)}">${esc(a.emoji)}</span>${esc(a.name)}</p>
            ${here ? `<div class="demo-actions">${samplePromptButtons(p)}</div>` : ''}
            <div class="a-card-actions">
              ${here ? `<button class="btn soft sm" data-open-drawer>${icon('folder')}See the files</button>`
                : `<button class="btn primary sm" data-install-demo="${esc(p.id)}">${icon('package')}Use this sample</button>`}
            </div>
          </div>`;
        }).join('')}
      </div>
    </div></div>`;
  $('#view').firstElementChild.addEventListener('click', homeClicks);
}

async function installDemo(btn) {
  const pack = btn?.dataset.installDemo || 'crm';
  const label = btn?.innerHTML;
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>Setting up…'; }
  try {
    const r = await api('/api/demo/install', { method: 'POST', body: { pack } });
    const st = await api('/api/status'); S.settings = st.settings;
    S.draft.assistantId = samplePack(pack).agent; S.draft.access = 'read';
    celebrate(); toast(`${pack === 'crm' ? 'Demo' : 'Sample'} ready — your project folder is now “${baseName(r.path)}”`, 'package');
    go('');
  } catch (e) { toast(e.message, 'alert'); if (btn) { btn.disabled = false; btn.innerHTML = label; } }
}

function homeClicks(e) {
  const t = e.target.closest('[data-pick-assistant],[data-new-assistant],[data-starter],[data-recipe],[data-go],[data-install-demo],[data-dismiss-demo],[data-open-drawer]');
  if (!t) return;
  if ('installDemo' in t.dataset) installDemo(t);
  else if ('dismissDemo' in t.dataset) { saveSettings({ demoDismissed: true }).then(renderHome); }
  else if ('openDrawer' in t.dataset) openDrawer();
  else if (t.dataset.pickAssistant) { S.draft.assistantId = t.dataset.pickAssistant; const a = assistantById(t.dataset.pickAssistant); S.draft.access = a.access || null; renderHome(); }
  else if ('newAssistant' in t.dataset) openAssistantBuilder();
  else if (t.dataset.starter) { S.draft.text = t.dataset.starter; const i = $('#input'); i.value = t.dataset.starter; i.dispatchEvent(new Event('input')); i.focus(); }
  else if (t.dataset.recipe) openRecipeRunner(t.dataset.recipe);
  else if (t.dataset.go) go(t.dataset.go);
}

function recipeCard(r) {
  const a = assistantById(r.assistantId);
  return `<button class="recipe-card" data-recipe="${esc(r.id)}" data-color="${esc(a.color)}">
    <span class="recipe-emoji">${esc(r.emoji || '✨')}</span>
    <span class="recipe-name">${esc(r.name)}</span>
    <span class="recipe-desc">${esc(r.description || '')}</span>
    <span class="recipe-meta"><span class="a-badge sm" data-color="${esc(a.color)}" style="width:18px;height:18px;font-size:10px">${esc(a.emoji)}</span>${esc(a.name)}${r.access === 'edit' ? ' · <span class="badge accent">Saves a file</span>' : ''}${needsLocalTools(r) ? ` ${lumenOnlyBadge('This prompt relies on Lumen’s local document tools (saving files, or reading Microsoft Project plans). In Microsoft 365 Copilot you’d do those steps by hand.')}` : ''}</span>
  </button>`;
}

// Marks features that won't be in Microsoft 365 Copilot, so nobody builds a habit that breaks on switch-over day.
const LUMEN_ONLY_TIP = 'Lumen only: this runs on your computer and isn’t part of Microsoft 365 Copilot.';
// A prompt is Lumen-only when it saves or updates files, or works from Microsoft Project plans. Reading Word or
// Excel files and writing a reply is something Copilot does too.
const needsLocalTools = (r) => r.access === 'edit' || (r.fields || []).some((f) => /\.(mpp|xml)\b/i.test(f.accept || ''));
const lumenOnlyBadge = (tip = LUMEN_ONLY_TIP) => `<span class="badge lumen-only" title="${esc(tip)}">Lumen only</span>`;

// ---------------------------------------------------------------- chat
async function openConversation(id) {
  if (S.current?.id !== id) {
    const live = S.live.get(id);
    if (live) S.current = live.conv; // in-flight: keep the live object so streaming keeps painting
    else {
      try { S.current = await api(`/api/conversations/${id}`); }
      catch { toast('That chat could not be found', 'alert'); return go(''); }
    }
    S.draft = { text: '', attachments: [], assistantId: null, access: null };
    S.editing = null;
  }
  if (S.current.unread) {
    try { await api(`/api/conversations/${id}`, { method: 'PATCH', body: { unread: false } }); S.current.unread = false; await refreshConvs(); }
    catch (e) { toast(`Couldn't mark this chat as read: ${e.message}`, 'alert'); }
  }
  renderChat();
  if (S.current.running && !S.live.has(id)) waitForBackground(id);
}

// A reply that kept running on the server after a refresh: show a placeholder and poll until it lands.
async function waitForBackground(id) {
  const c = S.current;
  const placeholder = { id: `bg${Date.now()}`, role: 'assistant', content: '', tools: [] };
  const fake = { ac: { abort: () => api(`/api/chat/${id}/stop`, { method: 'POST' }) }, msg: placeholder, conv: c };
  c.messages.push(placeholder); S.live.set(id, fake); renderChat(); renderConvList();
  while (S.current === c) {
    await new Promise((r) => setTimeout(r, 2000));
    const fresh = await api(`/api/conversations/${id}`).catch(() => null);
    if (!fresh || !fresh.running) {
      S.live.delete(id);
      if (fresh && S.current === c) { S.current = fresh; renderChat(); }
      renderConvList();
      return;
    }
  }
  S.live.delete(id);
}

function renderChat() {
  const c = S.current; if (!c) return;
  S.view = 'chat'; setNav('chat');
  const a = assistantById(c.assistantId);
  $('#view').innerHTML = `
    <div class="chat">
      <div class="chat-head" id="chatHead">
        <span class="a-badge md" data-color="${esc(a.color)}">${esc(a.emoji)}</span>
        <button class="chat-title" id="chatTitle" title="Click to rename">${esc(c.title)}</button>
        <span class="grow"></span>
        <button class="pill outline" id="folderPill" title="${esc(c.workspace || '')}">${icon('folder')}<span class="lbl">${esc(baseName(c.workspace) || 'Project folder')}</span></button>
        <button class="icon-btn" id="chatMenuBtn" title="More">${icon('dots')}</button>
      </div>
      <div class="messages ${isLive(c) ? 'is-live' : ''}" id="messages"><div class="messages-inner" id="msgInner">
        ${forkedFromHTML(c)}
        ${c.messages.length ? c.messages.map((m) => msgHTML(m, c)).join('') : emptyChatHTML(a)}
      </div></div>
      <div class="chat-foot">${composerHTML({ conv: c })}</div>
    </div>`;
  const root = $('#view');
  bindComposer(root, { conv: c });
  highlight(root);
  const msgs = $('#messages');
  msgs.scrollTop = msgs.scrollHeight;
  msgs.addEventListener('scroll', () => $('#chatHead')?.classList.toggle('scrolled', msgs.scrollTop > 4));
  $('#chatTitle').addEventListener('click', () => c.id && renameConv(c.id));
  $('#folderPill').addEventListener('click', (e) => folderMenu(e.currentTarget));
  $('#chatMenuBtn').addEventListener('click', (e) => openMenu(e.currentTarget, [
    { icon: 'edit', label: 'Rename', run: () => renameConv(c.id) },
    { icon: 'copy', label: 'Copy whole conversation', run: () => { navigator.clipboard.writeText(c.messages.map((m) => `${m.role === 'user' ? 'You' : a.name}:\n${m.content}`).join('\n\n---\n\n')); toast('Conversation copied'); } },
    { icon: 'book', label: 'Open notebook', run: () => openDrawer() },
    { sep: true },
    { icon: 'trash', label: 'Delete chat', danger: true, run: () => deleteConv(c.id) },
  ], { align: 'right' }));
  root.firstElementChild.addEventListener('click', chatClicks);
  $('#msgInner').addEventListener('keydown', (e) => {
    if (e.target.id !== 'editInput') return;
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); saveEdit(S.editing); }
    else if (e.key === 'Escape') { e.stopPropagation(); setEditing(null); }
  });
  if (!$('#modalRoot').children.length) $('#input')?.focus();
}

function forkedFromHTML(c) {
  if (!c.forkedFrom) return '';
  const src = S.convs.find((x) => x.id === c.forkedFrom.id);
  return `<div class="forked-from">${icon('branch')}<span>Branched from ${src ? `<a data-go-conv="${esc(src.id)}">${esc(src.title)}</a>` : `<i>${esc(c.forkedFrom.title || 'a deleted chat')}</i>`}</span></div>`;
}

function emptyChatHTML(a) {
  return `<div class="chat-empty" style="min-height:50vh"><span class="a-badge lg" data-color="${esc(a.color)}">${esc(a.emoji)}</span><h2>${esc(a.name)}</h2><p>${esc(a.tagline || '')}</p></div>`;
}

function msgHTML(m, c) {
  if (m.role === 'user') {
    const attach = m.attachments?.length ? `<div class="attach-list">${m.attachments.map((f) => `<span class="attach-chip">${icon('file')}<span class="name">${esc(f.name)}</span><button data-pin-file="${esc(f.path)}" title="Pin to this chat">📌</button></span>`).join('')}</div>` : '';
    if (S.editing === m.id) {
      return `<div class="msg user editing" data-mid="${m.id}">${attach}
        <div class="edit-box"><textarea class="textarea" id="editInput" rows="3">${esc(m.content)}</textarea>
          <div class="edit-actions"><button class="btn ghost sm" data-edit-cancel>Cancel</button><button class="btn primary sm" data-edit-save>${icon('send')}Save &amp; send</button></div></div>
      </div>`;
    }
    return `<div class="msg user" data-mid="${m.id}">${attach}
      <div class="bubble">${esc(m.content)}</div>
      <div class="msg-actions"><button data-edit-msg title="Edit and resend">${icon('pen')}Edit</button><button data-save-recipe title="Save this request to your prompt gallery">${icon('wand')}Save prompt</button></div>
    </div>`;
  }
  const a = assistantById(c.assistantId);
  const live = [...S.live.values()].some((l) => l.msg === m);
  return `<div class="msg assistant" data-mid="${m.id}" data-color="${esc(a.color)}">
    <span class="a-badge">${esc(a.emoji)}</span>
    <div class="msg-body">${assistantInner(m, a, live)}</div>
  </div>`;
}

function assistantInner(m, a, live) {
  const tools = m.tools || [];
  const running = tools.filter((t) => t.ok === undefined && live).length;
  const open = S.openSteps.has(m.id);
  const lastTool = tools[tools.length - 1];
  let stepsHead = '';
  if (tools.length) {
    stepsHead = live && running ? `<span class="spinner" style="width:14px;height:14px"></span><span class="shimmer">${esc(lastTool.label)}…</span>`
      : `${icon('check')}<span>${tools.length} step${tools.length > 1 ? 's' : ''} completed</span>`;
  }
  const files = m.files || [];
  const isLast = !live && S.current?.messages?.[S.current.messages.length - 1] === m;
  const steps = isLast ? suggestedNextSteps(S.current) : [];
  return `
    ${tools.length ? `<div class="steps ${open ? 'open' : ''}" data-steps="${m.id}">
      <button class="steps-head" data-toggle-steps="${m.id}">${stepsHead}${icon('chevron', 'caret')}</button>
      <div class="steps-list">${tools.map((t) => `<div class="step ${t.ok === false ? 'fail' : ''}"><span class="step-state">${t.ok === undefined && live ? '<span class="spinner"></span>' : icon(t.ok === false ? 'x' : 'check')}</span>${icon(t.icon)}<span>${esc(t.label)}</span></div>`).join('')}</div>
    </div>` : ''}
    ${m.content ? `<div class="md">${md(m.content, live)}</div>` : live && !running ? `<div class="thinking"><span class="orb"></span><span class="shimmer">${esc(a.name)} is thinking…</span></div>` : ''}
    ${files.length ? `<div class="file-cards">${files.map((f) => `<div><button class="file-card" data-open-file="${esc(f)}" title="Open ${esc(f)}"><span class="file-icon">${esc(extOf(f))}</span><span class="file-info"><b>${esc(baseName(f))}</b><small>Saved to your project folder · Click to open</small></span></button>${/\.(xlsx|xml)$/i.test(f) ? `<button class="btn ghost sm" data-diff-file="${esc(f)}" title="${esc(LUMEN_ONLY_TIP)}">See changes / Compare with…</button>` : ''}</div>`).join('')}</div>` : ''}
    ${(m.approvals || []).length ? `<div class="approval-cards">${m.approvals.map((id) => approvalCard(id, m)).join('')}</div>` : ''}
    ${m.error ? `<div class="error-card">${icon('alert')}<div><b>Something went wrong.</b><div style="color:var(--text-2);font-size:13.5px">${esc(friendlyError(m.error))}</div><button class="btn soft sm" data-retry="${m.id}">${icon('retry')}Try again</button></div></div>` : ''}
    ${m.stopped ? `<div class="msg-meta" style="margin:6px 0 0">Stopped</div>` : ''}
    ${!live && (m.content || m.error) ? `<div class="msg-actions"><button data-copy-msg="${m.id}">${icon('copy')}Copy</button>${m.error ? '' : `<button data-retry="${m.id}" title="Replace this reply with a new one">${icon('retry')}Retry</button>`}<button data-branch="${m.id}" title="Continue from here in a new chat">${icon('branch')}Branch</button>${m.content ? `<button data-save-as title="Export this reply to Word, Excel, PowerPoint or Markdown">${icon('save')}Export</button>${feedbackButtons(m)}` : ''}${usageMeta(m)}${m.content ? '<span class="ai-note">AI-generated content may be incorrect</span>' : ''}</div>` : ''}
    ${steps.length ? `<div class="suggest-chips">${steps.map((s) => `<button class="suggest-chip" data-suggest="${esc(s)}" title="${esc(s)}&#10;&#10;Click to send · Shift-click to edit first">${esc(s.length > 140 ? `${s.slice(0, 139)}…` : s)}</button>`).join('')}</div>` : ''}`;
}

const feedbackButtons = (m) => {
  const r = m.feedback?.rating;
  const tip = r === 'down' && (m.feedback.reason || m.feedback.note) ? ` — ${[m.feedback.reason, m.feedback.note].filter(Boolean).join(': ')}` : '';
  return `<button class="fb ${r === 'up' ? 'active' : ''}" data-rate="up" title="${r === 'up' ? 'You found this helpful · click to undo' : 'Helpful'}">${icon('thumbUp')}</button>`
    + `<button class="fb ${r === 'down' ? 'active' : ''}" data-rate="down" title="${r === 'down' ? esc(`You said this missed the mark${tip} · click to undo`) : 'Not helpful'}">${icon('thumbDown')}</button>`;
};
const fmtDuration = (ms) => { const s = Math.round(ms / 1000); return s < 60 ? `${Math.max(1, s)} s` : `${Math.floor(s / 60)} min${s % 60 ? ` ${s % 60} s` : ''}`; };
// "Most capable · 14 s" under a reply. Cost only when the user turned it on (subscription users find dollar amounts confusing).
function usageMeta(m) {
  const u = m.usage; if (!u?.durationMs) return '';
  const cost = S.settings.showCost && typeof u.costUsd === 'number' ? `$${u.costUsd < 0.01 ? u.costUsd.toFixed(3) : u.costUsd.toFixed(2)}` : '';
  return `<span class="msg-meta usage-meta">${esc([u.model, fmtDuration(u.durationMs), cost].filter(Boolean).join(' · '))}</span>`;
}
// A markdown pipe table: a |row| followed by a |---|---| separator row.
const hasMdTable = (text) => /^\s*\|.*\|\s*$\n^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/m.test(text || '');
// A deck outline: at least one "## Slide title" heading.
const hasMdSlides = (text) => /^##\s+\S/m.test(text || '');

function friendlyError(e) {
  if (/not found|ENOENT|spawn/i.test(e)) return 'The AI engine could not be started. Open Settings to check your connection.';
  if (/rate|limit|overloaded|529/i.test(e)) return 'The AI service is busy right now. Wait a moment and try again.';
  if (/auth|login|credential|401|403/i.test(e)) return 'You may need to sign in to the AI engine again. ' + e;
  return e;
}

// ---------------------------------------------------------------- Azure DevOps Approve cards (plan 08)
// The card is drawn from the change set the server stored, never from the AI's own words. Only Apply writes to Azure DevOps.
const approvalCache = new Map(); // change set id -> described change set
const approvalLoading = new Set();
const AP_STATUS = {
  pending: ['Waiting for your approval', 'warn'], applied: ['Applied', 'ok'], partial: ['Partly applied', 'warn'], discarded: ['Discarded', 'muted'],
  expired: ['Expired', 'muted'], conflict: ['Changed in Azure DevOps first', 'bad'], failed: ["Couldn't apply", 'bad'],
};

function loadApproval(id) {
  const conv = S.current;
  if (!conv?.id || approvalLoading.has(id)) return;
  approvalLoading.add(id);
  api(`/api/chat/${conv.id}/approvals/${id}`)
    .then((d) => { approvalCache.set(id, d); repaintApproval(id); })
    .catch((e) => { approvalCache.set(id, { id, status: 'failed', title: 'Proposed change', rows: [], missing: true, result: { message: e.message, links: [] } }); repaintApproval(id); })
    .finally(() => approvalLoading.delete(id));
}
// Repaints a card and the other cards of the same reply (their "Apply all" count depends on it).
function repaintApproval(id) {
  for (const el of $$(`[data-approval="${id}"]`)) {
    const mid = el.closest('[data-mid]')?.dataset.mid;
    const m = S.current?.messages?.find((x) => x.id === mid);
    for (const sib of m?.approvals || [id]) {
      const card = $(`[data-mid="${mid}"] [data-approval="${sib}"]`);
      if (card && approvalCache.has(sib)) card.outerHTML = approvalCard(sib, m);
    }
  }
}
const apVal = (v) => { const s = String(v ?? ''); return s ? `<div class="ap-val" title="${esc(s.length > 300 ? s.slice(0, 2000) : '')}">${esc(s)}</div>` : '<span class="ap-empty">—</span>'; };

function approvalCard(id, m) {
  const d = approvalCache.get(id);
  if (!d) { setTimeout(() => loadApproval(id)); return `<div class="approval-card loading" data-approval="${esc(id)}"><span class="spinner"></span><span>Loading the proposed change…</span></div>`; }
  const [label, tone] = AP_STATUS[d.status] || [d.status, 'muted'];
  const pending = d.status === 'pending';
  const siblings = (m?.approvals || []).filter((x) => approvalCache.get(x)?.status === 'pending');
  let last = '';
  const hasBefore = (d.rows || []).some((r) => r.before); // new items have no "Now" value: drop the column
  const rows = (d.rows || []).map((r) => { const same = r.target === last; last = r.target; return `<tr><td>${same ? '' : esc(r.target)}</td><td>${esc(r.field)}</td>${hasBefore ? `<td class="ap-now">${apVal(r.before)}</td>` : ''}<td>${apVal(r.after)}</td></tr>`; }).join('');
  const diff = d.diff ? `<details class="ap-diff" ${pending ? 'open' : ''}><summary>${d.diff.tooLarge ? 'The page is too large to compare line by line' : `Page changes: <span class="ap-add">+${d.diff.added}</span> <span class="ap-del">−${d.diff.removed}</span>`}</summary>${d.diff.tooLarge ? '' : `<pre>${d.diff.lines.map((l) => `<span class="dl ${l.t === '+' ? 'add' : l.t === '-' ? 'del' : l.t === '…' ? 'gap' : ''}">${esc(l.t === '…' ? `   ⋯ ${l.s}` : `${l.t} ${l.s}`)}</span>`).join('')}</pre>`}</details>` : '';
  const when = d.decidedAt ? `${d.decidedBy ? ` by ${esc(d.decidedBy)}` : ''} · ${esc(timeAgo(d.decidedAt))}` : pending && d.expiresAt ? ` · expires ${esc(new Date(d.expiresAt).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' }))}` : '';
  const result = d.result && !pending ? `<div class="ap-result ${tone}">${icon(tone === 'ok' ? 'check' : tone === 'bad' ? 'alert' : 'x')}<span>${esc(d.result.message || label)}</span></div>
    ${(d.result.links || []).length ? `<div class="ap-links">${d.result.links.map((l) => `<a href="${esc(/^https?:\/\//i.test(String(l.url)) ? l.url : '#')}" target="_blank" rel="noopener noreferrer">${icon('external')}${esc(l.label)}</a>`).join('')}</div>` : ''}` : '';
  return `<div class="approval-card ${esc(d.status)}" data-approval="${esc(id)}">
    <div class="ap-head">${icon(d.kind === 'wiki' ? 'book' : 'board')}<div class="ap-title"><b>${esc(d.title)}</b><small>Azure DevOps${d.project ? ` · ${esc(d.project)}` : ''}</small></div><span class="status-tag ${tone}">${esc(label)}${when}</span></div>
    ${d.reason ? `<div class="ap-reason"><b>Why:</b> ${esc(d.reason)}</div>` : ''}
    ${rows ? `<div class="ap-table-wrap"><table class="ap-table"><thead><tr><th>Item</th><th>Field</th>${hasBefore ? '<th>Now</th>' : ''}<th>Proposed</th></tr></thead><tbody>${rows}</tbody></table></div>` : ''}
    ${diff}
    ${pending ? `<div class="ap-actions"><button class="btn primary sm" data-ap-apply="${esc(id)}">${icon('check')}Apply</button><button class="btn ghost sm" data-ap-discard="${esc(id)}">Discard</button>${siblings.length > 1 ? `<button class="btn soft sm" data-ap-apply-all>${icon('check')}Apply all ${siblings.length}</button>` : ''}<span class="ap-note">Nothing changes in Azure DevOps until you click Apply.</span></div>` : result}
  </div>`;
}

async function decideApproval(btn, ids, discard = false) {
  const conv = S.current;
  if (!conv?.id) return;
  const card = btn.closest('.approval-card');
  $$('button', card).forEach((b) => { b.disabled = true; });
  if (!discard) btn.innerHTML = `<span class="spinner" style="width:13px;height:13px"></span>Applying…`;
  for (const id of ids) {
    try {
      const d = await api(`/api/chat/${conv.id}/approvals/${id}`, { method: discard ? 'DELETE' : 'POST' });
      approvalCache.set(id, d);
      if (!discard) toast(d.status === 'applied' ? d.result.message : d.result?.message || 'Done', d.status === 'applied' ? 'check' : 'alert');
    } catch (e) {
      if (/name in Settings/i.test(e.message)) { toast(e.message, 'alert'); openSettings(); }
      else toast(e.message, 'alert');
      approvalCache.delete(id); // reload the card's real state
      break;
    }
  }
  for (const id of ids) repaintApproval(id);
}

function chatClicks(e) {
  const ap = e.target.closest('[data-ap-apply],[data-ap-discard],[data-ap-apply-all]');
  if (ap) {
    if (ap.dataset.apApply) decideApproval(ap, [ap.dataset.apApply]);
    else if (ap.dataset.apDiscard) decideApproval(ap, [ap.dataset.apDiscard], true);
    else {
      const m = S.current?.messages?.find((x) => x.id === ap.closest('[data-mid]')?.dataset.mid);
      decideApproval(ap, (m?.approvals || []).filter((x) => approvalCache.get(x)?.status === 'pending'));
    }
    return;
  }
  const t = e.target.closest('[data-toggle-steps],[data-copy-msg],[data-retry],[data-open-file],[data-pin-file],[data-diff-file],[data-copy-code],[data-copy-table],[data-starter],[data-suggest],[data-edit-msg],[data-edit-save],[data-edit-cancel],[data-branch],[data-go-conv],[data-save-as],[data-rate],[data-save-recipe]');
  if (!t) return;
  const c = S.current;
  const mid = t.closest('[data-mid]')?.dataset.mid;
  if (t.dataset.pinFile) setPins(c, [...new Set([...pinsFor(c), t.dataset.pinFile])]);
  else if (t.dataset.diffFile) showDiff(t.dataset.diffFile, mid, c.workspace);
  else if (t.dataset.toggleSteps) { const id = t.dataset.toggleSteps; S.openSteps.has(id) ? S.openSteps.delete(id) : S.openSteps.add(id); t.parentElement.classList.toggle('open'); }
  else if ('saveAs' in t.dataset) saveReplyMenu(c, mid, t);
  else if (t.dataset.rate) rateReply(c, mid, t.dataset.rate);
  else if ('saveRecipe' in t.dataset) saveAsRecipe(c, mid);
  else if (t.dataset.copyMsg) { const m = c.messages.find((x) => x.id === t.dataset.copyMsg); navigator.clipboard.writeText(m.content); flash(t, 'Copied'); }
  else if ('copyCode' in t.dataset) { navigator.clipboard.writeText(t.closest('pre').querySelector('code').innerText); flash(t, 'Copied'); }
  else if ('copyTable' in t.dataset) copyTable(t);
  else if (t.dataset.suggest) {
    if (e.shiftKey) { const i = $('#input'); if (i) { i.value = t.dataset.suggest; i.dispatchEvent(new Event('input')); i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }
    else if (!isLive(c)) submit(t.dataset.suggest);
  }
  else if ('editMsg' in t.dataset) { if (!isLive(c)) setEditing(mid); }
  else if ('editCancel' in t.dataset) setEditing(null);
  else if ('editSave' in t.dataset) saveEdit(mid);
  else if (t.dataset.branch) { if (!isLive(c)) branchFrom(c, t.dataset.branch); }
  else if (t.dataset.goConv) go(`c/${t.dataset.goConv}`);
  else if (t.dataset.retry) {
    if (isLive(c)) return;
    const idx = c.messages.findIndex((x) => x.id === t.dataset.retry);
    const uIdx = c.messages.slice(0, idx).map((x) => x.role).lastIndexOf('user');
    if (uIdx < 0) return;
    const prevUser = c.messages[uIdx];
    rewind(c, uIdx, prevUser.content, { retryNote: true });
  }
  else if (t.dataset.openFile) api('/api/folder/open', { method: 'POST', body: { path: t.dataset.openFile, workspace: c.workspace } });
}
function flash(btn, text) { const html = btn.innerHTML; btn.innerHTML = `${icon('check')}${text}`; setTimeout(() => { btn.innerHTML = html; }, 1400); }

// Copy a rendered table as HTML (keeps the grid in Outlook/Word) and as tab-separated text (separate cells in Excel).
async function copyTable(btn) {
  const table = btn.closest('.table-wrap')?.querySelector('table'); if (!table) return;
  const tsv = [...table.rows].map((r) => [...r.cells].map((cell) => cell.innerText.replace(/[\t\r\n]+/g, ' ').trim()).join('\t')).join('\n');
  const clone = table.cloneNode(true);
  clone.setAttribute('border', '1');
  clone.style.cssText = 'border-collapse:collapse;font-family:Calibri,Arial,sans-serif;font-size:11pt';
  clone.querySelectorAll('th,td').forEach((cell) => Object.assign(cell.style, { border: '1px solid #999', padding: '4px 8px', verticalAlign: 'top' }));
  clone.querySelectorAll('th').forEach((cell) => Object.assign(cell.style, { background: '#f2f2f2', fontWeight: 'bold' }));
  try {
    if (window.ClipboardItem && navigator.clipboard.write) {
      await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([clone.outerHTML], { type: 'text/html' }), 'text/plain': new Blob([tsv], { type: 'text/plain' }) })]);
    } else await navigator.clipboard.writeText(tsv);
    flash(btn, 'Copied');
  } catch { toast("Couldn't copy the table", 'alert'); }
}

function rerenderMsg(c, m) {
  const el = $(`[data-mid="${m.id}"]`); if (!el || S.current !== c) return;
  el.outerHTML = msgHTML(m, c);
  highlight($(`[data-mid="${m.id}"]`));
}

// --- save a reply as Word / Excel / PowerPoint / Markdown
function saveReplyMenu(c, mid, anchor) {
  const m = c.messages.find((x) => x.id === mid); if (!m?.content || !c.id) return;
  openMenu(anchor, [
    { heading: 'Export to your notebook' },
    { icon: 'file', label: 'Word document (.docx)', hint: 'Headings, lists and tables, ready to edit', run: () => exportReply(c, m, 'docx') },
    ...(hasMdTable(m.content) ? [{ icon: 'sheet', label: 'Excel workbook (.xlsx)', hint: 'One sheet per table', run: () => exportReply(c, m, 'xlsx') }] : []),
    ...(hasMdSlides(m.content) ? [{ icon: 'file', label: 'PowerPoint deck (.pptx)', hint: 'One slide per ## heading, speaker notes from Notes:', run: () => exportReply(c, m, 'pptx') }] : []),
    { icon: 'file', label: 'Markdown (.md)', hint: 'The reply as plain text with its formatting marks', run: () => exportReply(c, m, 'md') },
  ]);
}

async function exportReply(c, m, format) {
  try {
    const r = await api('/api/export', { method: 'POST', body: { conversationId: c.id, messageId: m.id, format } });
    m.files = [...new Set([...(m.files || []), r.path])];
    rerenderMsg(c, m);
    toast(`Saved ${r.name} to your folder`, 'file');
  } catch (e) { toast(e.message, 'alert'); }
}

// --- feedback (stays on this computer)
const DOWN_REASONS = ['Wrong', 'Not what I asked', 'Too long', "Didn't use my file"];

async function rateReply(c, mid, rating) {
  const m = c.messages.find((x) => x.id === mid); if (!m || !c.id) return;
  const save = async (feedback) => {
    const r = await api(`/api/conversations/${c.id}/messages/${m.id}`, { method: 'PATCH', body: { feedback } });
    if (r.feedback) m.feedback = r.feedback; else delete m.feedback;
    rerenderMsg(c, m);
  };
  try {
    if (m.feedback?.rating === rating) return await save(null); // clicking the active thumb undoes it
    if (rating === 'up') { await save({ rating: 'up' }); return toast('Thanks for the feedback', 'thumbUp'); }
  } catch (e) { return toast(e.message, 'alert'); }
  let reason = '';
  modal({
    title: 'What went wrong?', sub: 'Optional, and it stays on this computer. It helps your team see which agents need work.',
    body: `<div class="chip-list" id="fbReasons" style="margin-bottom:12px">${DOWN_REASONS.map((x) => `<button class="chip" data-reason="${esc(x)}">${esc(x)}</button>`).join('')}</div>
      <textarea class="textarea" id="fbNote" rows="3" maxlength="2000" placeholder="Anything else? (optional)"></textarea>`,
    actions: [{ label: 'Cancel' }, { label: 'Send feedback', primary: true, run: async (el) => { await save({ rating: 'down', reason, note: $('#fbNote', el).value }); toast('Thanks — noted', 'thumbDown'); } }],
    onOpen: (el) => $('#fbReasons', el).addEventListener('click', (e) => {
      const b = e.target.closest('[data-reason]'); if (!b) return;
      reason = reason === b.dataset.reason ? '' : b.dataset.reason;
      $$('[data-reason]', el).forEach((x) => x.classList.toggle('active', x.dataset.reason === reason));
    }),
  });
}

// --- turn a prompt that worked into a quick start
function saveAsRecipe(c, mid) {
  const m = c.messages.find((x) => x.id === mid); if (!m) return;
  const a = assistantById(c.assistantId);
  let template = m.content || '';
  const fields = (m.attachments || []).map((f, i) => {
    const key = `file${i + 1}`;
    const name = f.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    template = template.replace(new RegExp(`["“]?${name}["”]?`, 'g'), `{{${key}}}`);
    const ext = (f.name.match(/\.[a-z0-9]+$/i) || [''])[0].toLowerCase();
    return { key, label: `File ${i + 1}`, type: 'file', ...(ext ? { accept: ext } : {}) };
  });
  openRecipeBuilder(null, { name: c.title || '', emoji: a.emoji || '⚡', description: '', category: 'My prompts', assistantId: a.id, access: c.access || '', fields, template });
}

// --- edit, retry and branch
function setEditing(id) {
  const c = S.current;
  const prev = S.editing; S.editing = id;
  for (const mid of [prev, id]) {
    const m = mid && c.messages.find((x) => x.id === mid);
    const el = m && $(`[data-mid="${esc(mid)}"]`);
    if (el) el.outerHTML = msgHTML(m, c);
  }
  const ta = $('#editInput');
  if (ta) { ta.style.height = `${Math.min(ta.scrollHeight + 2, 320)}px`; ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
}

function saveEdit(id) {
  const c = S.current;
  const idx = c.messages.findIndex((x) => x.id === id);
  const text = $('#editInput')?.value.trim();
  if (idx < 0 || !text || isLive(c)) return;
  rewind(c, idx, text);
}

// Resend from the user message at `idx` with new text, dropping it and everything after. If later turns would be
// lost, offer to branch into a new chat instead.
function rewind(c, idx, text, { retryNote } = {}) {
  const attachments = (c.messages[idx].attachments || []).map((a) => ({ path: a.path, name: a.name }));
  const replace = () => {
    const truncateFrom = c.messages[idx].id;
    S.editing = null;
    c.messages.splice(idx);
    sendMessage({ text, attachments, retryNote, truncateFrom });
  };
  const laterTurns = c.messages.slice(idx + 1).some((x) => x.role === 'user');
  if (!laterTurns) return replace();
  modal({
    title: 'Replace the rest of this chat?', sub: 'Everything after this message will be replaced. Want to branch instead?',
    actions: [{ label: 'Cancel' }, { label: 'Branch instead', icon: 'branch', run: () => branchAndSend(c, idx, text, attachments) }, { label: 'Replace', primary: true, run: replace }],
  });
}

const forkConversation = (convId, uptoMessageId) => api(`/api/conversations/${convId}/fork`, { method: 'POST', body: { uptoMessageId } });

async function openBranch(conv) {
  await refreshConvs();
  S.current = conv; S.view = 'chat'; S.editing = null;
  S.draft = { text: '', attachments: [], assistantId: null, access: null };
  go(`c/${conv.id}`);
  toast('Branched into a new chat', 'branch');
}

async function branchFrom(c, messageId) {
  try { await openBranch(await forkConversation(c.id, messageId)); } catch (e) { toast(e.message, 'alert'); }
}

// Branch from just before the user message at `idx`, then send the new text in the branch.
async function branchAndSend(c, idx, text, attachments) {
  try {
    await openBranch(await forkConversation(c.id, c.messages[idx - 1]?.id));
    sendMessage({ text, attachments });
  } catch (e) { toast(e.message, 'alert'); }
}

function rerenderCurrent() { if (S.view === 'chat') renderChat(); else if (S.view === 'home') renderHome(); }

// --- streaming
async function sendMessage({ text, attachments = [], assistantId, access, retryNote, truncateFrom, recipeId }) {
  let conv = S.view === 'chat' ? S.current : null;
  const aId = conv ? conv.assistantId : (assistantId || S.draft.assistantId || 'lumen');
  const a = assistantById(aId);
  const acc = conv ? (conv.access || S.settings.access) : (access || S.draft.access || a.access || S.settings.access);
  const userMsg = { id: `u${Date.now()}`, role: 'user', content: text, attachments: attachments.map((f) => ({ name: f.name, path: f.path })), createdAt: Date.now(), ...(recipeId ? { recipeId } : {}) };
  const msg = { id: `a${Date.now()}`, role: 'assistant', content: '', tools: [], files: [], createdAt: Date.now() };
  const ac = new AbortController();

  if (!conv) {
    conv = { id: null, title: text.slice(0, 48), assistantId: aId, access: acc, workspace: S.settings.workspace, pinned_files: [...(S.draft.pinned || [])], messages: [] };
    S.current = conv;
  }
  conv.messages.push(userMsg, msg);
  const tempKey = conv.id || `pending-${Date.now()}`;
  let key = tempKey;
  S.live.set(key, { ac, msg, userMsg, conv });
  S.draft = { text: '', attachments: [], assistantId: null, access: null };
  S.editing = null;
  renderChat();

  let frame = 0;
  const paint = () => {
    frame = 0;
    if (S.current !== conv) return;
    const el = $(`[data-mid="${msg.id}"] .msg-body`);
    if (!el) return;
    const msgs = $('#messages');
    const atBottom = msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight < 120;
    el.innerHTML = assistantInner(msg, a, S.live.has(key));
    if (atBottom) msgs.scrollTop = msgs.scrollHeight;
  };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(paint); };

  try {
    const res = await fetch('/api/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ac.signal,
      body: JSON.stringify({ conversationId: conv.id, message: text, attachments: attachments.map((f) => f.path), pinned_files: conv.pinned_files || [], assistantId: aId, access: acc, workspace: conv.workspace, providerId: S.settings.providerId, model: S.settings.model, truncateFrom, recipeId }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Request failed (${res.status})`);
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
        if (!line.trim()) continue;
        const ev = JSON.parse(line);
        if (ev.type === 'conversation') {
          // Adopt the server's message ids so edit / retry / branch can point at them later.
          for (const [m, id] of [[userMsg, ev.userMessageId], [msg, ev.assistantMessageId]]) {
            if (!id) continue;
            const el = $(`[data-mid="${m.id}"]`); if (el) el.dataset.mid = id;
            m.id = id;
          }
          if (!conv.id) {
            conv.id = ev.conversation.id;
            S.live.delete(key); key = conv.id; S.live.set(key, { ac, msg, userMsg, conv });
            history.replaceState(null, '', `#/c/${conv.id}`);
            S.convs.unshift({ id: conv.id, title: conv.title, assistantId: aId, updatedAt: Date.now(), preview: text });
          }
          renderConvList();
        } else if (ev.type === 'text') { msg.content += ev.text; schedule(); }
        else if (ev.type === 'tool') { msg.tools.push({ id: ev.id, icon: ev.icon, label: ev.label }); if (ev.writes && ev.file && !msg.files.includes(ev.file)) msg.files.push(ev.file); schedule(); }
        else if (ev.type === 'tool_done') { const t = msg.tools.find((x) => x.id === ev.id); if (t) t.ok = ev.ok; schedule(); }
        else if (ev.type === 'file') { if (!msg.files.includes(ev.path)) msg.files.push(ev.path); schedule(); }
        else if (ev.type === 'approval') { msg.approvals = [...new Set([...(msg.approvals || []), ev.id])]; schedule(); }
        else if (ev.type === 'error') { msg.error = ev.message; schedule(); }
        else if (ev.type === 'done') { msg.files = ev.message.files || []; if (ev.message.usage) msg.usage = ev.message.usage; }
        else if (ev.type === 'title') {
          conv.title = ev.title;
          const item = S.convs.find((x) => x.id === conv.id); if (item) item.title = ev.title;
          renderConvList();
          if (S.current === conv) { const t = $('#chatTitle'); if (t) t.textContent = ev.title; }
        }
      }
    }
  } catch (err) {
    if (!ac.signal.aborted) msg.error = err.message || 'Connection lost';
    else msg.stopped = true;
  }
  S.live.delete(key);
  if (frame) cancelAnimationFrame(frame);
  if (S.current === conv) {
    $('#messages')?.classList.remove('is-live');
    const el = $(`[data-mid="${msg.id}"] .msg-body`);
    if (el) { el.innerHTML = assistantInner(msg, a, false); highlight(el); }
    const foot = $('.chat-foot');
    if (foot) { foot.innerHTML = composerHTML({ conv }); bindComposer($('#view'), { conv }); $('#input')?.focus(); }
    if (msg.files?.length) toast(`Saved ${msg.files.length === 1 ? baseName(msg.files[0]) : `${msg.files.length} files`} to your folder`, 'file');
  }
  const item = S.convs.find((x) => x.id === conv.id); if (item) item.updatedAt = Date.now();
  renderConvList();
}

function stopConv(conv) {
  const l = [...S.live.values()].find((x) => x.conv === conv); if (!l) return;
  if (conv.id) api(`/api/chat/${conv.id}/stop`, { method: 'POST' }).catch(() => {});
  l.ac.abort();
}

// ---------------------------------------------------------------- folder
// In-app folder browser. (A native dialog started by the server can open behind the browser or on another
// screen, which looks like a dead button, so Lumen browses folders itself.)
function pickFolder(start = currentWorkspace(), opts = {}) {
  return new Promise((resolve) => {
    let current = '';
    let settled = false;
    const finish = (p) => { if (!settled) { settled = true; resolve(p); } };
    modal({
      title: opts.title || 'Choose a project folder', sub: opts.sub || 'Open the folder Lumen should work in, then choose “Use this folder”.', wide: true,
      body: `<div class="fp">
        <div class="fp-places" id="fpPlaces"></div>
        <div class="fp-main">
          <div class="row" style="gap:6px;align-items:center"><button class="btn ghost sm" id="fpUp" title="Up one level">${icon('right', 'fp-up')}Up</button><input class="input" id="fpPath" spellcheck="false" placeholder="Type or paste a folder path and press Enter"></div>
          <div class="fp-list" id="fpList"><div class="fp-empty"><span class="spinner"></span></div></div>
          <div class="row" style="gap:6px;align-items:center"><input class="input" id="fpNew" placeholder="New folder name (optional)"><button class="btn soft sm" id="fpMk" style="flex:0 0 auto">${icon('plus')}Create folder</button></div>
        </div></div>`,
      actions: [{ label: 'Cancel', run: () => finish(null) }, { label: opts.action || 'Use this folder', primary: true, run: () => {
        if (!current) { toast('Open a folder first', 'alert'); return false; }
        finish(current);
      } }],
      onOpen: (el) => {
        // Closing with ×, Escape or the backdrop counts as Cancel.
        new MutationObserver((_, obs) => { if (!el.isConnected) { obs.disconnect(); finish(null); } }).observe($('#modalRoot'), { childList: true });
        const go = async (p) => {
          const list = $('#fpList', el);
          let r;
          try { r = await api(`/api/folder/browse?path=${encodeURIComponent(p || '')}`); } catch (e) { toast(e.message, 'alert'); return false; }
          current = r.path;
          $('#fpPath', el).value = r.path;
          $('#fpUp', el).disabled = r.parent === null;
          $('#fpUp', el).onclick = () => go(r.parent);
          $('#fpPlaces', el).innerHTML = [...r.places, { name: 'Drives', path: '' }]
            .map((x) => `<button class="fp-place ${x.path === r.path ? 'active' : ''}" data-fp="${esc(x.path)}">${icon('folder')}<span>${esc(x.name)}</span></button>`).join('');
          list.innerHTML = r.dirs.length ? r.dirs.map((d) => `<button class="fp-item" data-fp="${esc(d.path)}">${icon('folder')}<span>${esc(d.name)}</span>${icon('right', 'fp-go')}</button>`).join('')
            : `<div class="fp-empty">${r.path ? 'No folders inside. You can use this one, or create a new folder below.' : 'No drives found.'}</div>`;
          list.scrollTop = 0;
          return true;
        };
        el.addEventListener('click', (e) => { const b = e.target.closest('[data-fp]'); if (b) go(b.dataset.fp); });
        $('#fpPath', el).addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(e.target.value.trim()); } });
        $('#fpMk', el).addEventListener('click', async () => {
          const name = $('#fpNew', el).value.trim();
          if (!current) return toast('Open a folder first', 'alert');
          try { const r = await api('/api/folder/mkdir', { method: 'POST', body: { parent: current, name } }); $('#fpNew', el).value = ''; go(r.path); } catch (e) { toast(e.message, 'alert'); }
        });
        go(start).then((ok) => { if (!ok) go(''); });
      },
    });
  });
}

async function changeFolder() {
  const p = await pickFolder(); if (!p) return;
  if (S.current?.id) {
    S.current.workspace = p;
    await api(`/api/conversations/${S.current.id}`, { method: 'PATCH', body: { workspace: p } });
  } else await saveSettings({ workspace: p });
  toast(`Now working in ${baseName(p)}`, 'folder');
  rerenderCurrent();
  if ($('#filesDrawer').classList.contains('open')) openDrawer();
}

function folderMenu(anchor) {
  openMenu(anchor, [
    { heading: currentWorkspace() },
    { icon: 'list', label: 'Show files', run: () => openDrawer() },
    { icon: 'external', label: 'Open in Explorer', run: () => api('/api/folder/open', { method: 'POST', body: { workspace: currentWorkspace() } }) },
    { icon: 'folder', label: 'Change folder…', run: changeFolder },
  ], { align: 'right' });
}

async function openDrawer() {
  const d = $('#filesDrawer');
  d.classList.add('open'); d.setAttribute('aria-hidden', 'false');
  $('#drawerFiles').innerHTML = '<div class="conv-empty"><span class="spinner" style="width:18px;height:18px"></span></div>';
  const r = await api(`/api/folder/files?workspace=${encodeURIComponent(currentWorkspace())}`);
  $('#drawerPath').textContent = `Project folder · ${r.workspace}`;
  $('#drawerTip').innerHTML = /onedrive/i.test(r.workspace) ? ''
    : `${icon('alert')}<span>This folder isn't in OneDrive. Keep your notebook in OneDrive so Microsoft 365 Copilot can find these files later.</span>`;
  const changed = new Map();
  for (const msg of S.current?.messages || []) for (const file of msg.files || []) changed.set(file, msg.id);
  const paths = [...changed.keys()];
  const status = paths.length ? await api('/api/file-status', { method: 'POST', body: { workspace: r.workspace, paths } }) : { mtime: [] };
  const section = paths.length ? `<div class="conv-group">Files changed in this chat</div>` + paths.map((p, i) => `<button class="file-row" data-jump-message="${esc(changed.get(p))}" title="Go to the reply that changed this file"><span class="file-icon">${esc(extOf(p))}</span><span class="file-info"><b>${esc(baseName(p))}</b><small>${status.mtime[i] ? esc(timeAgo(status.mtime[i])) : 'Missing'} · Go to reply</small></span></button>`).join('') : '';
  $('#drawerFiles').innerHTML = section + (r.files.length ? `<div class="conv-group" style="padding-top:4px">Recently changed</div>` + r.files.map((f) => `
    <div class="drawer-file"><button class="file-row" data-open-file="${esc(f.path)}" title="${esc(f.rel)}"><span class="file-icon">${esc(extOf(f.name))}</span><span class="file-info"><b>${esc(f.name)}</b><small>${esc(f.rel.includes('\\') || f.rel.includes('/') ? f.rel.replace(/[\\/][^\\/]+$/, '') + ' · ' : '')}${fmtSize(f.size)} · ${timeAgo(f.mtime)}</small></span></button><button class="btn ghost sm" data-pin-file="${esc(f.path)}" title="Pin to this chat">📌</button></div>`).join('')
    : `<div class="conv-empty">This notebook is empty.<br>Files Lumen creates will appear here.</div>`);
}
function closeDrawer() { const d = $('#filesDrawer'); d.classList.remove('open'); d.setAttribute('aria-hidden', 'true'); }

async function renderRuns() {
  S.view = 'runs'; setNav('runs');
  try { S.runs = await api('/api/runs'); }
  catch (e) { toast(e.message, 'alert'); return; }
  if (S.view !== 'runs') return;
  $('#view').innerHTML = `<div class="page"><div class="page-inner"><div class="page-head"><div><h1>Lifecycle runs ${lumenOnlyBadge()}</h1>
    <p>Move from requirements to stories, reviewing each stage before the next.</p></div></div>
    <button class="btn primary" id="newRun">🧬 Start requirements to stories</button>
    <div class="lifecycle-list">${S.runs.length ? S.runs.map((r) => `<button class="starter" data-run="${esc(r.id)}"><span><b>${esc(r.name)}</b> · ${r.stages.filter((s) => s.status === 'approved').length}/${r.stages.length} approved</span>${icon('right')}</button>`).join('') : '<p>No runs yet.</p>'}</div></div></div>`;
  $('#newRun').addEventListener('click', startNewRun);
  $('#view').onclick = (e) => { const b = e.target.closest('[data-run]'); if (b) go(`run/${b.dataset.run}`); };
}

async function startNewRun() {
  try {
    const pipeline = S.pipelines.find((p) => p.id === 'aidlc');
    if (!pipeline) throw new Error('The lifecycle pipeline is not available.');
    const { files } = await api(`/api/folder/files?workspace=${encodeURIComponent(S.settings.workspace)}&all=1`);
    modal({ title: 'Start requirements to stories', sub: 'Choose a unique run name and the source documents in your project folder.', wide: true,
      body: `<label>Run name<input class="input" id="runName" maxlength="80"></label><div class="section-label"><span>Source files</span></div><div class="file-picker">${files.map((f, i) => `<label><input type="checkbox" name="run-source" value="${i}"> ${esc(f.rel)}</label>`).join('') || 'No files found.'}</div>`,
      actions: [{ label: 'Cancel' }, { label: 'Create run', primary: true, run: async (el) => {
        const name = $('#runName', el).value.trim();
        const sources = $$('input[name="run-source"]:checked', el).map((x) => files[+x.value].path);
        if (!name || !sources.length) { toast('Enter a name and choose source files', 'alert'); return false; }
        const run = await api('/api/runs', { method: 'POST', body: { pipelineId: pipeline.id, name, sources, workspace: S.settings.workspace } });
        go(`run/${run.id}`);
      } }] });
  } catch (e) { toast(e.message, 'alert'); }
}

let runTimer = null;
async function renderRun(id, selected = null) {
  clearTimeout(runTimer);
  S.view = 'run'; setNav('runs');
  try {
    const run = await api(`/api/runs/${encodeURIComponent(id)}`);
    if (location.hash.replace(/^#\/?/, '') !== `run/${id}`) return;
    const pipeline = S.pipelines.find((p) => p.id === run.pipelineId);
    if (!pipeline) throw new Error('The pipeline definition is missing.');
    const stage = run.stages.find((s) => s.id === selected) || run.stages.find((s) => s.status !== 'approved') || run.stages[run.stages.length - 1];
    const def = pipeline.stages.find((s) => s.id === stage.id);
    const index = run.stages.indexOf(stage), prev = run.stages[index - 1];
    $('#view').innerHTML = `<div class="page"><div class="page-inner">
      <a data-back-runs>← Lifecycle runs</a><h1>${esc(run.name)}</h1><p>${esc(pipeline.name)} · ${esc(run.workspace)}</p>
      <div class="run-stepper">${run.stages.map((s, i) => `<button class="run-step ${s.id === stage.id ? 'selected' : ''}" data-stage="${esc(s.id)}"><b>${i + 1}. ${esc(pipeline.stages[i]?.name || s.id)}${pipeline.stages[i]?.optional ? ' (optional)' : ''}</b><span>${esc(s.status)}</span></button>`).join('')}</div>
      <h2>${esc(def.name)}</h2><p>Status: <b>${esc(stage.status)}</b>${stage.unapprovedInputs ? ' · Based on unapproved inputs' : ''}</p>
      ${stage.error ? `<p class="run-error">${esc(stage.error)}</p>` : ''}
      ${stage.approvedAt ? `<p>Approved by ${esc(stage.approvedBy)} on ${esc(new Date(stage.approvedAt).toLocaleString())}</p>` : ''}
      <div class="run-actions">
        ${['pending', 'rework'].includes(stage.status) ? `<button class="btn primary" data-run-action="start">${stage.status === 'rework' ? 'Run again' : 'Start stage'}</button>` : ''}
        ${stage.conversationId ? `<button class="btn soft" data-open-chat="${esc(stage.conversationId)}">Open stage chat</button>` : ''}
        ${['review', 'approved'].includes(stage.status) ? `<button class="btn soft" data-run-file="${esc(stage.outputPath)}">Open output</button>` : ''}
        ${stage.status === 'review' ? `<button class="btn soft" data-run-action="check" ${stage.checkRunning ? 'disabled' : ''}>${stage.checkRunning ? 'Checking…' : 'Traceability check'}</button><button class="btn primary" data-run-action="approve">Approve</button>` : ''}
        ${stage.status === 'approved' ? `<button class="btn soft" data-run-word title="${def.wordTemplate ? `Uses ${esc(def.wordTemplate)}` : "Uses Lumen's built-in Word styles"}">${def.wordTemplate ? 'Save as Word (program template)' : 'Save as Word'}</button>` : ''}
        ${['review', 'approved'].includes(stage.status) ? '<button class="btn soft" data-run-action="rework">Send back</button>' : ''}
        ${stage.status === 'approved' && adoReady() ? `<button class="btn soft" data-run-ado="${stage.id === 'stories' ? 'workitems' : 'wiki'}">${icon(stage.id === 'stories' ? 'board' : 'book')}${stage.id === 'stories' ? 'Create work items in Azure DevOps' : 'Publish to the Azure DevOps wiki'}</button>` : ''}
      </div>
      ${stage.checkSummary ? `<div class="run-findings"><h3>Traceability findings</h3><div class="md">${md(stage.checkSummary)}</div>${stage.gateConversationId ? `<button class="btn ghost sm" data-open-chat="${esc(stage.gateConversationId)}">Open check chat</button>` : ''}</div>` : ''}
      ${prev && prev.status !== 'approved' && stage.status === 'pending' ? '<p>Previous stage is not approved. Starting requires an explicit override and the output will be labelled.</p>' : ''}
      </div></div>`;
    highlight($('#view'));
    $('#view').onclick = async (e) => {
      const b = e.target.closest('[data-back-runs],[data-stage],[data-run-action],[data-open-chat],[data-run-file],[data-run-ado],[data-run-word]'); if (!b) return;
      if ('backRuns' in b.dataset) return go('runs');
      if (b.dataset.runAdo) {
        b.disabled = true;
        try {
          const r = await api(`/api/runs/${id}/stages/${stage.id}/azure-devops`, { method: 'POST', body: { target: b.dataset.runAdo } });
          await refreshConvs();
          toast('Lumen is preparing the changes. You approve them in the chat.', 'spark');
          return go(`c/${r.conversationId}`);
        } catch (err) { toast(err.message, 'alert'); b.disabled = false; return; }
      }
      if (b.dataset.stage) return renderRun(id, b.dataset.stage);
      if (b.dataset.openChat) return go(`c/${b.dataset.openChat}`);
      if (b.dataset.runFile) return api('/api/folder/open', { method: 'POST', body: { path: b.dataset.runFile, workspace: run.workspace } });
      if ('runWord' in b.dataset) {
        b.disabled = true;
        try {
          const r = await api(`/api/runs/${id}/stages/${stage.id}/word`, { method: 'POST', body: {} });
          if (r.warning) toast(r.warning, 'alert');
          modal({ title: 'Saved as Word', sub: `${r.name}${r.template ? ` · ${r.template}` : ''}`, actions: [{ label: 'Close' }, { label: 'Open', primary: true, run: () => api('/api/folder/open', { method: 'POST', body: { path: r.path, workspace: run.workspace } }) }] });
        } catch (err) { toast(err.message, 'alert'); }
        b.disabled = false;
        return;
      }
      const operation = b.dataset.runAction;
      const act = async (override = false) => {
        await api(`/api/runs/${id}/stages/${stage.id}/${operation}`, { method: 'POST', body: { override } });
        if (operation === 'start' || operation === 'check') await refreshConvs();
        if (operation === 'rework' && stage.conversationId) return go(`c/${stage.conversationId}`);
        renderRun(id, stage.id);
      };
      if (operation === 'start' && prev && prev.status !== 'approved') {
        return modal({ title: 'Use unapproved inputs?', sub: 'The output will be labelled as based on unapproved inputs.', actions: [{ label: 'Cancel' }, { label: 'Start anyway', primary: true, run: () => act(true) }] });
      }
      b.disabled = true;
      try { await act(); } catch (err) { toast(err.message, 'alert'); b.disabled = false; }
    };
    if (run.stages.some((s) => s.status === 'running' || s.checkRunning)) runTimer = setTimeout(() => { if (S.view === 'run') renderRun(id, stage.id); }, 2000);
  } catch (e) { toast(e.message, 'alert'); }
}

async function showDiff(file, mid, workspace) {
  try {
    const r = await api(`/api/file-pair?workspace=${encodeURIComponent(workspace)}&file=${encodeURIComponent(file)}&message=${encodeURIComponent(mid || '')}`);
    const compare = async (other) => {
      const currentIsOriginal = !/ \(updated\)\.[^.]+$/i.test(file) && / \(updated\)\.[^.]+$/i.test(other);
      const a = currentIsOriginal ? file : other, b = currentIsOriginal ? other : file;
      const result = await api(`/api/diff?workspace=${encodeURIComponent(workspace)}&a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`);
      modal({ title: 'File changes', sub: `${baseName(a)} → ${baseName(b)} · Up to 500 changes`, wide: true,
        body: result.changes.length ? `<div class="diff-table"><table><thead><tr><th>Sheet / section</th><th>Cell / field</th><th>Before</th><th>After</th></tr></thead><tbody>${result.changes.map((c) => `<tr><td>${esc(c.sheet)}</td><td>${esc(c.cell)}</td><td>${esc(c.before)}</td><td>${esc(c.after)}</td></tr>`).join('')}</tbody></table></div>` : '<p>No cell or task changes found.</p>', actions: [{ label: 'Done', primary: true }] });
    };
    if (r.pair) await compare(r.pair);
    else await chooseWorkspaceFiles(workspace, 'Compare with…', (files) => compare(files[0].path), false);
  } catch (e) { toast(e.message, 'alert'); }
}
// ---------------------------------------------------------------- assistants page
function renderAssistantsPage() {
  S.view = 'assistants'; setNav('assistants');
  $('#view').innerHTML = `
    <div class="page"><div class="page-inner">
      <div class="page-head">
        <div><h1>Agents</h1><p>Agents are helpers with their own expertise and instructions, the same idea as agents in Microsoft 365 Copilot. Pick one to start a chat, or create your own in under a minute.</p></div>
        <div class="row" style="flex:0 0 auto;gap:8px"><button class="btn soft" data-export-engineering title="Save the developer, test automation and pipeline packs into a code repository for VS Code">${icon('code')}Engineering packs</button><button class="btn soft" data-export-all title="Save every agent in a form Microsoft 365 Copilot can use">${icon('external')}Export all to Copilot</button><button class="btn grad" data-new-assistant>${icon('plus')}Create agent</button></div>
      </div>
      <div class="search-wrap agent-search">${icon('search')}<input id="agentSearch" type="search" placeholder="Search agents by name, what they do or skill" autocomplete="off" aria-label="Search agents" value="${esc(S.agentSearch || '')}"></div>
      <p class="agent-search-empty" hidden>No agents match your search.</p>
      <div class="card-grid">
        ${S.assistants.map((a, i) => `
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

// What the Agents page search looks at: name, tagline, description and skill titles.
function agentSearchText(a) {
  const skills = (a.skills || []).map((id) => S.skills.find((s) => s.id === id)?.title).filter(Boolean);
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

async function reloadAssistants() { S.assistants = await api('/api/assistants'); if (S.view === 'assistants') renderAssistantsPage(); else rerenderCurrent(); renderConvList(); }

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
  const list = (a.skills || []).map((id) => S.skills.find((s) => s.id === id)).filter(Boolean);
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

// ---------------------------------------------------------------- recipes
function renderRecipesPage() {
  S.view = 'recipes'; setNav('recipes');
  const cats = ['All', ...new Set(S.recipes.map((r) => r.category || 'Other').filter((c) => c !== 'Scheduled')), 'Scheduled'];
  if (!cats.includes(S.recipeTab)) S.recipeTab = 'All';
  const list = S.recipes.filter((r) => S.recipeTab === 'All' || (r.category || 'Other') === S.recipeTab);
  $('#view').innerHTML = `
    <div class="page"><div class="page-inner">
      <div class="page-head">
        <div><h1>Prompt gallery</h1><p>Saved prompts that ask you a few simple questions, then hand the work to the right agent. Save your own from any chat with <b>Save prompt</b>, just like in Microsoft 365 Copilot.</p></div>
        <div class="row" style="flex:0 0 auto;gap:8px"><button class="btn soft" data-export-prompts title="Save every prompt as plain text you can use in Microsoft 365 Copilot">${icon('external')}Export to Copilot</button><button class="btn grad" data-new-recipe>${icon('plus')}New prompt</button></div>
      </div>
      <div class="tabs">${cats.map((c) => `<button class="tab ${c === S.recipeTab ? 'active' : ''}" data-tab="${esc(c)}">${esc(c === 'Scheduled' ? 'Scheduled prompts' : c)}</button>`).join('')}</div>
      ${S.recipeTab === 'Scheduled' ? `<div class="help schedule-notice">Scheduled prompts run only while Lumen is running. Missed runs happen once when Lumen starts again. Monthly dates that don't exist in a month are skipped.</div>
      <div class="schedule-list">${S.schedules.length ? S.schedules.map((s) => {
        const r = S.recipes.find((x) => x.id === s.recipeId);
        const result = s.running ? 'Running or waiting' : s.lastStatus === 'error' ? `Error: ${s.lastError || 'The check failed.'}` : s.lastStatus === 'late' ? 'Ran late' : s.lastStatus === 'ok' ? 'Ready' : 'Not run yet';
        return `<div class="schedule-card"><div><strong>${esc(r?.name || 'Deleted prompt')}</strong><div class="help">${!s.enabled ? 'Paused' : s.nextRunAt ? `Next run: ${esc(new Date(s.nextRunAt).toLocaleString())}` : 'Window finished'} · ${esc(result)}</div>${s.lastConversationId ? `<button class="schedule-link" data-schedule-chat="${esc(s.lastConversationId)}">Open last chat</button>` : ''}</div>
          <div class="schedule-actions"><button class="btn soft sm" data-schedule-toggle="${esc(s.id)}">${s.enabled ? 'Pause' : 'Resume'}</button><button class="btn soft sm" data-schedule-run="${esc(s.id)}" ${s.running ? 'disabled' : ''}>Run now</button><button class="btn soft sm" data-schedule-delete="${esc(s.id)}">Delete</button></div></div>`;
      }).join('') : '<div class="conv-empty">No scheduled prompts yet. Open a prompt and choose Repeat…</div>'}</div>` : `<div class="recipe-grid" style="grid-template-columns:repeat(auto-fill,minmax(240px,1fr))">
        ${list.map(recipeCard).join('')}
        <button class="recipe-card new-card" data-new-recipe style="min-height:170px"><span class="plus" style="width:40px;height:40px">${icon('plus')}</span><b>Create a prompt</b></button>
      </div>`}
    </div></div>`;
  $('#view').firstElementChild.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-tab],[data-recipe],[data-new-recipe],[data-schedule-toggle],[data-schedule-run],[data-schedule-delete],[data-schedule-chat],[data-export-prompts]'); if (!t) return;
    if ('exportPrompts' in t.dataset) exportPromptsToCopilot();
    else if (t.dataset.tab) { S.recipeTab = t.dataset.tab; renderRecipesPage(); }
    else if (t.dataset.recipe) openRecipeRunner(t.dataset.recipe);
    else if (t.dataset.scheduleChat) go(`c/${t.dataset.scheduleChat}`);
    else if (t.dataset.scheduleDelete) modal({ title: 'Delete this schedule?', sub: 'Existing chats and files are kept.', actions: [{ label: 'Cancel' }, { label: 'Delete', danger: true, run: async () => { await api(`/api/schedules/${t.dataset.scheduleDelete}`, { method: 'DELETE' }); S.schedules = await api('/api/schedules'); renderRecipesPage(); } }] });
    else if (t.dataset.scheduleToggle || t.dataset.scheduleRun) {
      try {
        const id = t.dataset.scheduleToggle || t.dataset.scheduleRun;
        if (t.dataset.scheduleToggle) await api(`/api/schedules/${id}`, { method: 'PUT', body: { enabled: !S.schedules.find((s) => s.id === id).enabled } });
        else await api(`/api/schedules/${id}/run-now`, { method: 'POST' });
        S.schedules = await api('/api/schedules'); renderRecipesPage();
      } catch (err) { toast(err.message, 'alert'); }
    } else openRecipeBuilder();
  });
}

function openRecipeRunner(id) {
  const r = S.recipes.find((x) => x.id === id); if (!r) return;
  const a = assistantById(r.assistantId);
  const files = {};
  const readValues = (el, filePaths = false) => {
    const vals = {};
    for (const f of r.fields || []) vals[f.key] = f.type === 'file' ? (files[f.key] ? (filePaths ? files[f.key].path : `"${files[f.key].name}"`) : '') : ($(`[data-field="${f.key}"]`, el)?.value || '').trim();
    const required = (r.fields || []).filter((f) => !f.optional && !/optional/i.test(f.placeholder || '')).find((f) => !vals[f.key]);
    if (required) { toast(`Please ${required.type === 'file' ? 'choose' : 'fill in'} “${required.label}”`, 'alert'); $(`[data-field="${required.key}"],[data-file-select="${required.key}"]`, el)?.focus(); return null; }
    return vals;
  };
  const m = modal({
    head: `<div class="modal-head"><span class="recipe-emoji" style="font-size:24px;width:48px;height:48px;border-radius:14px;margin:0">${esc(r.emoji)}</span><div><h2>${esc(r.name)}</h2><p>${esc(r.description || '')}</p></div><button class="icon-btn" data-x>${icon('x')}</button></div>`,
    body: `${(r.fields || []).map((f) => `<div class="field"><label>${esc(f.label)}</label>${fieldInput(f)}</div>`).join('')}
      <div style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--muted);margin-top:4px" data-color="${esc(a.color)}"><span class="a-badge sm">${esc(a.emoji)}</span>${esc(a.name)} will take it from here${r.access === 'edit' ? ' and save the result to your project folder' : ''}.</div>`,
    leftAction: { label: 'Edit', icon: 'edit', run: () => openRecipeBuilder(r) },
    actions: [{ label: 'Cancel' }, { label: 'Copy for Copilot', icon: 'copy', run: async (el) => {
      // Answers filled in so far go in; anything blank stays as a [placeholder]. Files become "/name", the way
      // you'd reference them in Microsoft 365 Copilot.
      const text = r.template.replace(/\{\{(\w+)\}\}/g, (_, k) => {
        const f = (r.fields || []).find((x) => x.key === k);
        const v = f?.type === 'file' ? (files[k]?.name ? `/${files[k].name}` : '') : ($(`[data-field="${k}"]`, el)?.value || '').trim();
        return v || `[${f?.label || k}]`;
      });
      try { await navigator.clipboard.writeText(text); toast('Copied. Paste it into Microsoft 365 Copilot and choose Save prompt'); } catch { toast("Couldn't copy the prompt", 'alert'); }
      return false;
    } }, { label: 'Repeat…', run: (el) => {
      const values = readValues(el, true); if (!values) return false;
      openScheduleForm(r, values, () => m.close()); return false;
    } }, { label: 'Start', icon: 'play', grad: true, run: (el) => {
      const vals = readValues(el); if (!vals) return false;
      const text = r.template.replace(/\{\{(\w+)\}\}/g, (_, k) => vals[k] || '(not specified)');
      const attachments = Object.values(files).filter(Boolean);
      const order = ['chat', 'read', 'edit'];
      const access = order[Math.max(order.indexOf(r.access || 'chat'), order.indexOf(S.settings.access), attachments.length ? 1 : 0)];
      S.current = null; S.view = 'home';
      sendMessage({ text, attachments, assistantId: r.assistantId, access, recipeId: r.id });
    } }],
  });
  // File fields: offer matching files from the project folder (best guess pre-selected), or upload one.
  const fileFields = (r.fields || []).filter((f) => f.type === 'file');
  if (fileFields.length) {
    api(`/api/folder/files?workspace=${encodeURIComponent(S.settings.workspace)}&all=1`).then(({ files: found }) => {
      for (const f of fileFields) {
        const sel = $(`[data-file-select="${f.key}"]`, m.el); if (!sel) continue;
        const exts = (f.accept || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
        const words = `${f.key} ${f.label}`.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 2 && !['the', 'file', 'workbook', 'your'].includes(w));
        const score = (x) => words.reduce((s, w) => s + (x.name.toLowerCase().includes(w) ? 2 : 0), 0) - (/\(updated\)/i.test(x.name) ? 0 : 0);
        const matches = found.filter((x) => !exts.length || exts.includes(`.${x.name.split('.').pop().toLowerCase()}`)).sort((a, b) => score(b) - score(a) || b.mtime - a.mtime);
        const used = new Set(Object.values(files).filter(Boolean).map((x) => x.path));
        // No name clue? Still preselect when every match is a version of one file (plan and its "(updated)" copy): the newest is first.
        const family = (x) => x.name.replace(/\s*\((updated|proposed)\)(?=\.[^.]+$)/i, '').toLowerCase();
        const oneFamily = matches.length > 0 && matches.every((x) => family(x) === family(matches[0]));
        const pick = matches.find((x) => !used.has(x.path) && (score(x) > 0 || matches.length === 1 || oneFamily));
        sel.innerHTML = `<option value="">${f.optional ? 'None' : matches.length ? 'Choose a file…' : `No ${exts.join('/') || ''} files in your project folder`}</option>`
          + matches.map((x) => `<option value="${esc(x.path)}" ${pick === x ? 'selected' : ''}>${esc(x.rel)}</option>`).join('')
          + '<option value="__upload">⬆ Upload from my computer…</option>';
        if (pick) files[f.key] = { path: pick.path, name: pick.name };
      }
    }).catch(() => {});
  }
  m.el.addEventListener('change', (e) => {
    const sel = e.target.closest('[data-file-select]'); if (!sel) return;
    const key = sel.dataset.fileSelect;
    if (sel.value !== '__upload') { files[key] = sel.value ? { path: sel.value, name: sel.selectedOptions[0].textContent.split(/[\\/]/).pop() } : null; return; }
    const input = document.createElement('input'); input.type = 'file';
    const f = fileFields.find((x) => x.key === key); if (f?.accept) input.accept = f.accept;
    input.onchange = async () => {
      const file = input.files[0]; if (!file) { sel.value = ''; return; }
      const res = await fetch(`/api/upload?workspace=${encodeURIComponent(S.settings.workspace)}&name=${encodeURIComponent(file.name)}`, { method: 'POST', body: file });
      const data = await res.json();
      files[key] = data;
      sel.insertAdjacentHTML('afterbegin', `<option value="${esc(data.path)}">${esc(data.name)}</option>`);
      sel.value = data.path;
    };
    input.click();
  });
  setTimeout(() => $('[data-field]', m.el)?.focus(), 60);
}

function openScheduleForm(recipe, values, onSaved) {
  const m = modal({
    title: `Repeat ${recipe.name}`, sub: 'Scheduled prompts run only while Lumen is running. Missed runs happen once when Lumen starts again.',
    body: `<div class="field"><label>Repeat</label><select class="select" id="scheduleKind"><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="interval">Every few minutes, between two times</option></select></div>
      <div id="scheduleWindow" hidden><div class="field"><label>Every</label><select class="select" id="scheduleEvery"><option value="15">15 minutes</option><option value="30" selected>30 minutes</option><option value="45">45 minutes</option><option value="60">Hour</option></select></div>
        <div class="field"><label>From</label><input class="input" type="datetime-local" id="scheduleStart"></div>
        <div class="field"><label>Until</label><input class="input" type="datetime-local" id="scheduleEnd"><div class="help">For a cutover or other busy window. It runs only between these times, and runs missed while Lumen was closed are not made up after the window ends.</div></div></div>
      <div class="field" id="scheduleDays" hidden><label>Days</label><div class="schedule-days">${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => `<label><input type="checkbox" value="${i}" ${i === 1 ? 'checked' : ''}> ${d}</label>`).join('')}</div></div>
      <div class="field" id="scheduleMonth" hidden><label>Day of month</label><input class="input" type="number" min="1" max="31" value="1" id="scheduleDay"><div class="help">Months without this date are skipped.</div></div>
      <div class="field" id="scheduleTimeField"><label>Time (local)</label><input class="input" type="time" value="09:00" id="scheduleTime"></div>
      ${recipe.access === 'edit' ? '<label class="schedule-permission"><input type="checkbox" id="scheduleAllow"> Allow this schedule to save files</label>' : ''}`,
    actions: [{ label: 'Cancel' }, { label: 'Save schedule', primary: true, run: async (el) => {
      const kind = $('#scheduleKind', el).value, time = $('#scheduleTime', el).value;
      const when = kind === 'interval' ? { kind, minutes: Number($('#scheduleEvery', el).value), start: $('#scheduleStart', el).value, end: $('#scheduleEnd', el).value } : { kind, time };
      if (kind === 'weekly') when.days = $$('#scheduleDays input:checked', el).map((x) => Number(x.value));
      if (kind === 'monthly') when.day = Number($('#scheduleDay', el).value);
      await api('/api/schedules', { method: 'POST', body: { recipeId: recipe.id, values, workspace: S.settings.workspace, when, allowEdit: !!$('#scheduleAllow', el)?.checked } });
      S.schedules = await api('/api/schedules'); onSaved(); toast('Schedule saved');
    } }],
  });
  $('#scheduleKind', m.el).addEventListener('change', (e) => { $('#scheduleDays', m.el).hidden = e.target.value !== 'weekly'; $('#scheduleMonth', m.el).hidden = e.target.value !== 'monthly'; $('#scheduleWindow', m.el).hidden = e.target.value !== 'interval'; $('#scheduleTimeField', m.el).hidden = e.target.value === 'interval'; });
}

function fieldInput(f) {
  if (f.type === 'textarea') return `<textarea class="textarea" data-field="${f.key}" placeholder="${esc(f.placeholder || '')}" rows="4"></textarea>`;
  if (f.type === 'select') return `<div class="seg" data-seg="${f.key}">${(f.options || []).map((o) => `<button type="button" class="${o === (f.default || f.options[0]) ? 'active' : ''}" onclick="this.parentElement.querySelectorAll('button').forEach(b=>b.classList.remove('active'));this.classList.add('active');this.parentElement.nextElementSibling.value=this.textContent">${esc(o)}</button>`).join('')}</div><input type="hidden" data-field="${f.key}" value="${esc(f.default || f.options?.[0] || '')}">`;
  if (f.type === 'file') return `<select class="select" data-file-select="${f.key}"><option value="">Looking in your project folder…</option></select>${f.optional ? '<div class="help">Optional</div>' : ''}`;
  return `<input class="input" data-field="${f.key}" placeholder="${esc(f.placeholder || '')}">`;
}

function openRecipeBuilder(existing, prefill) {
  const r = existing || prefill ? JSON.parse(JSON.stringify(existing || prefill)) : { name: '', emoji: '⚡', description: '', category: 'My prompts', assistantId: S.assistants[0]?.id || 'lumen', access: '', fields: [{ key: 'topic', label: 'What is it about?', type: 'textarea' }], template: '' };
  const TYPES = { text: 'Short answer', textarea: 'Long answer', select: 'Pick one', file: 'A file' };
  const keyOf = (label, i) => (label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 24) || `field${i + 1}`);
  const fieldsHTML = () => r.fields.map((f, i) => `
    <div class="field-row"><input class="input" data-fl="${i}" value="${esc(f.label)}" placeholder="Question to ask">
      <select class="select" data-ft="${i}">${Object.entries(TYPES).map(([k, v]) => `<option value="${k}" ${f.type === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
      <button class="icon-btn" data-rmf="${i}" title="Remove">${icon('trash')}</button></div>
    ${f.type === 'select' ? `<input class="input" data-fo="${i}" value="${esc((f.options || []).join(', '))}" placeholder="Choices, separated by commas" style="margin:-2px 0 10px">` : ''}`).join('');
  const chipsHTML = () => r.fields.map((f) => `<button class="chip" data-insert="${f.key}">+ ${esc(f.label || f.key)}</button>`).join('');
  const m = modal({
    title: existing ? 'Edit prompt' : 'New prompt', sub: 'Ask a few questions, then send a prompt built from the answers.', wide: true,
    body: `
      <div class="row">
        <div class="field" style="flex:0 0 90px"><label>Icon</label><input class="input" id="rEmoji" value="${esc(r.emoji)}" maxlength="4" style="text-align:center;font-size:20px;padding:6px"></div>
        <div class="field" style="flex:2"><label>Name</label><input class="input" id="rName" value="${esc(r.name)}" placeholder="e.g. Prepare for a stakeholder interview"></div>
        <div class="field"><label>Category</label><input class="input" id="rCat" value="${esc(r.category || '')}"></div>
      </div>
      <div class="field"><label>Short description</label><input class="input" id="rDesc" value="${esc(r.description || '')}" placeholder="What does it produce?"></div>
      <div class="row">
        <div class="field"><label>Agent</label><select class="select" id="rAsst">${S.assistants.map((a) => `<option value="${esc(a.id)}" ${a.id === r.assistantId ? 'selected' : ''}>${esc(a.emoji)} ${esc(a.name)}</option>`).join('')}</select></div>
        <div class="field"><label>File access</label><select class="select" id="rAccess"><option value="">Use my default</option>${Object.entries(ACCESS).map(([k, v]) => `<option value="${k}" ${r.access === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select></div>
      </div>
      <div class="field"><label>Questions to ask</label><div id="rFields">${fieldsHTML()}</div><button class="btn ghost sm" id="addField">${icon('plus')}Add a question</button></div>
      <div class="field"><label>The request to send</label>
        <div class="chip-list" id="rChips" style="margin-bottom:8px">${chipsHTML()}</div>
        <textarea class="textarea" id="rTemplate" rows="6" placeholder="Write the request. Click the chips above to drop in the answers. e.g. Prepare 10 interview questions about {{topic}}...">${esc(r.template)}</textarea>
        <div class="help">Answers are inserted wherever you see {{like_this}}.</div></div>`,
    leftAction: existing && !existing.builtin ? { label: 'Delete', icon: 'trash', danger: true, run: async () => { await api(`/api/recipes/${existing.id}`, { method: 'DELETE' }); S.recipes = await api('/api/recipes'); rerenderPage(); toast('Prompt deleted', 'trash'); } } : null,
    actions: [{ label: 'Cancel' }, { label: existing ? 'Save' : 'Create', grad: true, run: async (el) => {
      collect(el);
      if (!r.name.trim()) { toast('Give it a name', 'alert'); return false; }
      if (!r.template.trim()) r.template = r.fields.map((f) => `${f.label}: {{${f.key}}}`).join('\n');
      const { builtin, ...body } = r;
      if (existing) await api(`/api/recipes/${existing.id}`, { method: 'PUT', body }); else await api('/api/recipes', { method: 'POST', body });
      S.recipes = await api('/api/recipes'); rerenderPage();
      toast(existing ? 'Prompt saved' : 'Prompt saved to your gallery', 'spark');
    } }],
  });
  const el = m.el;
  function collect() {
    r.emoji = $('#rEmoji', el).value || '⚡'; r.name = $('#rName', el).value; r.category = $('#rCat', el).value || 'My prompts';
    r.description = $('#rDesc', el).value; r.assistantId = $('#rAsst', el).value; r.access = $('#rAccess', el).value; r.template = $('#rTemplate', el).value;
    r.fields.forEach((f, i) => {
      const l = $(`[data-fl="${i}"]`, el); if (l) f.label = l.value;
      const t = $(`[data-ft="${i}"]`, el); if (t) f.type = t.value;
      const o = $(`[data-fo="${i}"]`, el); if (o) f.options = o.value.split(',').map((s) => s.trim()).filter(Boolean);
      if (f.type === 'select' && !f.options?.length) f.options = ['Option A', 'Option B'];
      if (!existing || !f.key) { const old = f.key; f.key = keyOf(f.label, i); if (old && old !== f.key) r.template = r.template.split(`{{${old}}}`).join(`{{${f.key}}}`); }
    });
    $('#rTemplate', el).value = r.template;
  }
  const redraw = () => { collect(); $('#rFields', el).innerHTML = fieldsHTML(); $('#rChips', el).innerHTML = chipsHTML(); };
  el.addEventListener('change', (e) => { if (e.target.matches('[data-ft]')) redraw(); });
  el.addEventListener('focusout', (e) => { if (e.target.matches('[data-fl]')) { collect(); $('#rChips', el).innerHTML = chipsHTML(); } });
  el.addEventListener('click', (e) => {
    const t = e.target.closest('#addField,[data-rmf],[data-insert]'); if (!t) return;
    if (t.id === 'addField') { collect(); r.fields.push({ key: '', label: '', type: 'text' }); redraw(); $(`[data-fl="${r.fields.length - 1}"]`, el).focus(); }
    else if (t.dataset.rmf) { collect(); r.fields.splice(+t.dataset.rmf, 1); redraw(); }
    else if (t.dataset.insert) { const ta = $('#rTemplate', el); const tok = `{{${t.dataset.insert}}}`; const s = ta.selectionStart ?? ta.value.length; ta.value = ta.value.slice(0, s) + tok + ta.value.slice(ta.selectionEnd ?? s); ta.focus(); ta.selectionStart = ta.selectionEnd = s + tok.length; }
  });
}
async function exportPromptsToCopilot() {
  try {
    const r = await api('/api/recipes/export-copilot', { method: 'POST', body: { workspace: currentWorkspace() } });
    modal({
      title: `${r.count} prompts are ready for Microsoft 365 Copilot`,
      sub: 'Saved as Prompts.md in your notebook. Fill in the [blanks], paste into Copilot, then choose Save prompt to keep the ones you use often.',
      body: `<div class="help" style="word-break:break-all">${esc(r.file)}</div>`,
      actions: [{ label: 'Open file', icon: 'external', run: () => { api('/api/folder/open', { method: 'POST', body: { path: r.file, workspace: currentWorkspace() } }); return false; } }, { label: 'Done', primary: true }],
    });
  } catch (e) { toast(e.message, 'alert'); }
}

function rerenderPage() { if (S.view === 'recipes') renderRecipesPage(); else rerenderCurrent(); }

// ---------------------------------------------------------------- insights
async function renderInsightsPage() {
  S.view = 'insights'; setNav('insights');
  $('#view').innerHTML = `<div class="page"><div class="page-inner"><div class="page-head"><div><h1>Insights</h1><p>Which agents and prompts are working, from the 👍 and 👎 people give replies. Everything here comes from chats on this computer and isn't sent anywhere.</p></div></div><div id="insightsBody"><div class="conv-empty"><span class="spinner" style="width:18px;height:18px"></span></div></div></div></div>`;
  let d;
  try { d = await api('/api/insights'); } catch (e) { $('#insightsBody').innerHTML = `<div class="conv-empty">${esc(e.message)}</div>`; return; }
  if (S.view !== 'insights') return;
  const thumbs = (x) => `<td class="num">${x.up || ''}</td><td class="num">${x.down || ''}</td>`;
  const table = (head, rows, empty) => rows.length ? `<div class="table-wrap"><table class="insights-table"><thead><tr>${head}</tr></thead><tbody>${rows.join('')}</tbody></table></div>` : `<p class="insights-empty">${empty}</p>`;
  $('#insightsBody').innerHTML = `
    <div class="section-label"><span>Agents</span></div>
    ${table('<th>Agent</th><th class="num">Chats</th><th class="num">Replies</th><th class="num">👍</th><th class="num">👎</th><th class="num">Typical reply time</th>',
      d.assistants.map((a) => `<tr><td>${esc(a.emoji)} ${esc(a.name)}</td><td class="num">${a.chats}</td><td class="num">${a.replies}</td>${thumbs(a)}<td class="num">${a.medianMs ? fmtDuration(a.medianMs) : '—'}</td></tr>`),
      'No chats yet.')}
    <div class="section-label"><span>Prompts</span></div>
    ${table('<th>Prompt</th><th class="num">Runs</th><th class="num">👍</th><th class="num">👎</th>',
      d.recipes.map((r) => `<tr><td>${esc(r.emoji)} ${esc(r.name)}</td><td class="num">${r.runs}</td>${thumbs(r)}</tr>`),
      'No prompts have been run yet.')}
    <div class="section-label"><span>Recent 👎 replies</span></div>
    ${table('<th>Chat</th><th>Reason</th><th>Note</th><th>When</th>',
      d.recentDown.map((x) => `<tr><td><a data-go-conv="${esc(x.conversationId)}" title="${esc(x.excerpt)}">${esc(assistantById(x.assistantId).emoji)} ${esc(x.title)}</a></td><td>${esc(x.reason) || '—'}</td><td>${esc(x.note) || '—'}</td><td class="nowrap">${timeAgo(x.at)}</td></tr>`),
      "No 👎 yet. When someone marks a reply as not helpful, it shows up here with their note.")}`;
  $('#insightsBody').addEventListener('click', (e) => { const a = e.target.closest('[data-go-conv]'); if (a) go(`c/${a.dataset.goConv}`); });
}

// ---------------------------------------------------------------- settings
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
          <span class="oc-desc">${adoReady() ? esc(`${S.settings.ado.project}${S.settings.ado.team ? ` · ${S.settings.ado.team}` : ''} · ${S.settings.ado.orgUrl.replace(/^https:\/\//, '')}`) : 'Search and update work items and wiki pages. Every change waits for your approval.'}</span></span></button></div></div>
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
  $('#providerCards', el).addEventListener('click', (e) => { const b = e.target.closest('[data-provider]'); if (!b) return; s.providerId = b.dataset.provider; $('#providerCards', el).innerHTML = providerCards(s.providerId); });
  $('#refreshEngines', el).addEventListener('click', async () => { $('#providerCards', el).style.opacity = .5; const st = await api('/api/status?refresh=1'); S.providers = st.providers; $('#providerCards', el).innerHTML = providerCards(s.providerId); $('#providerCards', el).style.opacity = 1; renderUser(); });
  $('#sFolderBtn', el).addEventListener('click', async () => { const p = await pickFolder(s.workspace); if (p) { s.workspace = p; $('#sFolder', el).value = p; } });
  $('#sReset', el).addEventListener('click', () => modal({ title: 'Restore defaults?', sub: 'Built-in agents and prompts go back to how they shipped. Ones you created are removed.', actions: [{ label: 'Cancel' }, { label: 'Restore', danger: true, run: async () => { await api('/api/reset', { method: 'POST' }).catch(() => {}); toast('Defaults restored'); location.reload(); } }] }));
  if (focus === 'engine') setTimeout(() => $('#engineField', el).scrollIntoView({ block: 'center' }), 50);
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

// ---------------------------------------------------------------- onboarding
function openOnboarding() {
  let step = 0;
  const draft = { userName: S.settings.userName || '', providerId: S.settings.providerId, workspace: S.settings.workspace };
  const steps = [
    () => `<div class="welcome"><div class="welcome-orb"><svg viewBox="0 0 32 32"><path d="M16 4l2.6 7.4L26 14l-7.4 2.6L16 24l-2.6-7.4L6 14l7.4-2.6z" fill="#fff"/></svg></div>
      <h2>Welcome to Lumen</h2><p>Your AI workspace for writing, analysis and planning. It works like Microsoft 365 Copilot (agents, prompts, notebooks), so what you learn here carries over when your Copilot licence arrives.</p>
      <input class="input" id="obName" placeholder="Your first name" value="${esc(draft.userName)}"></div>`,
    () => `<div class="welcome" style="padding-bottom:10px"><h2>Choose your AI engine</h2><p>Lumen works with the AI tools installed on this computer. We picked the one that's ready.</p>
      <div class="option-cards" id="obProviders" style="text-align:left;max-width:440px;margin:0 auto">${providerCards(draft.providerId)}</div></div>`,
    () => `<div class="welcome"><h2>Where do you keep your work?</h2><p>Pick a folder for your notebook. Lumen reads documents there and saves new ones, but only when you allow it. A folder in OneDrive means Microsoft 365 Copilot can find them later too.</p>
      <div class="option-card active" style="max-width:420px;margin:0 auto 12px;text-align:left"><span class="oc-icon">📁</span><span class="oc-text"><span class="oc-title" id="obFolderName">${esc(baseName(draft.workspace))}</span><span class="oc-desc" id="obFolder" style="word-break:break-all">${esc(draft.workspace)}</span></span></div>
      <button class="btn soft sm" id="obFolderBtn">${icon('folder')}Choose a different folder</button>
      <div class="feature-list" style="margin-top:22px">
        <div class="feature"><span class="fi">🤝</span><div><b>Agents</b><span>Specialists for requirements, status reports, writing and data.</span></div></div>
        <div class="feature"><span class="fi">⚡</span><div><b>Prompt gallery</b><span>Answer a few questions, get a finished deliverable.</span></div></div>
        <div class="feature"><span class="fi">🛡️</span><div><b>Not Microsoft 365 Copilot</b><span>Lumen runs on ${esc(S.providers.find((p) => p.id === draft.providerId)?.name || 'your AI engine')}, so Copilot's data protections don't apply. Follow your organisation's rules on what you share.</span></div></div>
      </div></div>`,
  ];
  const m = modal({ head: '', body: '<div id="obBody"></div>', dismissable: false, actions: [] });
  const modalEl = m.el.querySelector('.modal');
  const foot = document.createElement('div'); foot.className = 'modal-foot'; modalEl.appendChild(foot);
  const draw = () => {
    $('#obBody', m.el).innerHTML = steps[step]() + `<div class="welcome-steps" style="margin-top:0">${steps.map((_, i) => `<i class="${i === step ? 'on' : ''}"></i>`).join('')}</div>`;
    foot.innerHTML = `${step ? `<button class="btn ghost left" data-back>Back</button>` : ''}<button class="btn grad" data-next>${step === steps.length - 1 ? `${icon('spark')}Start using Lumen` : 'Continue'}</button>`;
    const nameInput = $('#obName', m.el);
    if (nameInput) { nameInput.focus(); nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') foot.querySelector('[data-next]').click(); }); }
    $('#obProviders', m.el)?.addEventListener('click', (e) => { const b = e.target.closest('[data-provider]'); if (b) { draft.providerId = b.dataset.provider; $('#obProviders', m.el).innerHTML = providerCards(draft.providerId); } });
    $('#obFolderBtn', m.el)?.addEventListener('click', async () => { const p = await pickFolder(draft.workspace); if (p) { draft.workspace = p; $('#obFolder', m.el).textContent = p; $('#obFolderName', m.el).textContent = baseName(p); } });
  };
  foot.addEventListener('click', async (e) => {
    if (e.target.closest('[data-back]')) { step--; draw(); return; }
    if (!e.target.closest('[data-next]')) return;
    if (step === 0) draft.userName = $('#obName', m.el).value.trim();
    if (step < steps.length - 1) { step++; draw(); return; }
    await saveSettings({ ...draft, onboarded: true });
    m.close(); celebrate(); rerenderCurrent();
  });
  if (!S.providers.find((p) => p.id === draft.providerId)?.available) { const ready = S.providers.find((p) => p.available); if (ready) draft.providerId = ready.id; }
  draw();
}

function celebrate() {
  const colors = ['#0f6cbd', '#479ef5', '#7c5cff', '#12a594', '#f59e0b'];
  for (let i = 0; i < 34; i++) {
    const s = document.createElement('span');
    const angle = Math.random() * Math.PI * 2, dist = 120 + Math.random() * 260;
    Object.assign(s.style, { position: 'fixed', left: '50%', top: '42%', width: '9px', height: '9px', borderRadius: Math.random() > .5 ? '50%' : '2px', background: colors[i % colors.length], zIndex: 100, pointerEvents: 'none' });
    document.body.appendChild(s);
    s.animate([{ transform: 'translate(-50%,-50%) scale(1)', opacity: 1 }, { transform: `translate(calc(-50% + ${Math.cos(angle) * dist}px), calc(-50% + ${Math.sin(angle) * dist + 120}px)) rotate(${Math.random() * 540}deg) scale(.6)`, opacity: 0 }], { duration: 1100 + Math.random() * 600, easing: 'cubic-bezier(.2,.8,.2,1)' }).onfinish = () => s.remove();
  }
}

// ---------------------------------------------------------------- chrome bindings
function newChat() { S.draft = { text: '', attachments: [], assistantId: null, access: null }; S.current = null; go(''); }

function openShortcuts() {
  const MOD = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';
  const rows = [
    ['Start a new chat', [MOD, 'K']],
    ['Send your message', ['Enter']],
    ['New line in your message', ['Shift', 'Enter']],
    ['Fill in the suggested next step (empty message box)', ['↑']],
    ['Jump to the message box', ['/']],
    ['Reference a file in your notebook (in the message box)', ['/']],
    ['Stop the reply', ['Esc']],
    ['Copy the last reply', [MOD, 'Shift', 'C']],
    ['Show this list', [MOD, '/']],
  ];
  modal({
    title: 'Keyboard shortcuts', sub: 'Handy keys for working faster. Clicking works just as well.',
    body: `<div class="kbd-list">${rows.map(([label, keys]) => `<span>${esc(label)}</span><span class="kbd-keys">${keys.map((k) => `<kbd>${esc(k)}</kbd>`).join('')}</span>`).join('')}</div>`,
    actions: [{ label: 'Done', primary: true }],
  });
}

function bindChrome() {
  $('#newChatBtn').addEventListener('click', newChat);
  $$('[data-nav]').forEach((n) => n.addEventListener('click', () => go(n.dataset.nav === 'home' ? '' : n.dataset.nav)));
  $('#filesNavBtn').addEventListener('click', openDrawer);
  $('#settingsBtn').addEventListener('click', () => openSettings());
  $('#collapseBtn').addEventListener('click', () => $('#app').classList.toggle('collapsed'));
  $('#agentList').addEventListener('click', (e) => {
    const b = e.target.closest('[data-agent]'); if (!b) return;
    const a = assistantById(b.dataset.agent);
    S.draft = { text: '', attachments: [], assistantId: a.id, access: a.access || null }; S.current = null; go('');
  });
  $('#searchInput').addEventListener('input', (e) => { S.search = e.target.value; renderConvList(); });
  $('#convList').addEventListener('click', (e) => {
    const menu = e.target.closest('[data-conv-menu]');
    if (menu) { e.stopPropagation(); return convMenu(menu.dataset.convMenu, menu); }
    const c = e.target.closest('[data-cid]'); if (c) go(`c/${c.dataset.cid}`);
  });
  $('[data-close-drawer]').addEventListener('click', closeDrawer);
  $('#drawerOpenFolder').addEventListener('click', () => api('/api/folder/open', { method: 'POST', body: { workspace: currentWorkspace() } }));
  $('#drawerChangeFolder').addEventListener('click', changeFolder);
  $('#drawerFiles').addEventListener('click', (e) => {
    const pin = e.target.closest('[data-pin-file]'); if (pin) return setPins(S.current, [...new Set([...pinsFor(S.current), pin.dataset.pinFile])]);
    const jump = e.target.closest('[data-jump-message]'); if (jump) { closeDrawer(); const el = $$('[data-mid]').find((x) => x.dataset.mid === jump.dataset.jumpMessage); el?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    const f = e.target.closest('[data-open-file]'); if (f) api('/api/folder/open', { method: 'POST', body: { path: f.dataset.openFile, workspace: currentWorkspace() } });
  });

  document.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    const typing = e.target.closest?.('input,textarea,select,[contenteditable="true"]');
    const modalOpen = $('#modalRoot').children.length > 0;
    if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); newChat(); }
    else if (e.key === 'Escape') {
      const open = menuEl || modalOpen || $('#filesDrawer').classList.contains('open');
      closeMenu(); closeDrawer();
      if (!open && S.view === 'chat' && isLive(S.current)) { e.preventDefault(); stopConv(S.current); }
    }
    else if (mod && e.shiftKey && e.code === 'KeyC') {
      e.preventDefault();
      const m = S.view === 'chat' && [...(S.current?.messages || [])].reverse().find((x) => x.role === 'assistant' && x.content);
      if (!m) return toast('No reply to copy yet', 'alert');
      navigator.clipboard.writeText(m.content).then(() => toast('Last reply copied'), () => toast("Couldn't copy the reply", 'alert'));
    }
    else if (mod && e.key === '/') { e.preventDefault(); if (!modalOpen) openShortcuts(); }
    else if (e.key === '/' && !mod && !e.altKey && !typing && !modalOpen) { const i = $('#input'); if (i) { e.preventDefault(); i.focus(); } }
  });

  // drag & drop anywhere
  let depth = 0;
  const overlay = $('#dropOverlay');
  const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
  window.addEventListener('dragenter', (e) => { if (!hasFiles(e) || !$('#input')) return; depth++; overlay.classList.add('show'); });
  window.addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); if (!depth) overlay.classList.remove('show'); });
  window.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
  window.addEventListener('drop', (e) => { if (!hasFiles(e)) return; e.preventDefault(); depth = 0; overlay.classList.remove('show'); if ($('#input')) uploadFiles([...e.dataTransfer.files]); });
}

boot().catch((e) => { document.body.innerHTML = `<div style="padding:40px;font-family:system-ui"><h2>Lumen couldn't start</h2><p>${esc(e.message)}</p></div>`; });
})();
