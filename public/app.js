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
  return `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
};
DOMPurify.addHook('afterSanitizeAttributes', (n) => { if (n.tagName === 'A') { n.setAttribute('target', '_blank'); n.setAttribute('rel', 'noopener noreferrer'); } });
const md = (text, cursor = false) => DOMPurify.sanitize(marked.parse(String(text || ''), { renderer }) + (cursor ? '<span class="cursor"></span>' : ''), { ADD_ATTR: ['target', 'data-copy-code'] });
const highlight = (root) => { if (window.hljs) $$('pre code[class*="language-"]:not(.hljs)', root).forEach((b) => { try { hljs.highlightElement(b); } catch {} }); };

// ---------------------------------------------------------------- state
const S = {
  settings: {}, providers: [], assistants: [], recipes: [], convs: [],
  view: 'home', current: null, search: '',
  live: new Map(), // conversationId -> { ac, msg }
  draft: { text: '', attachments: [], assistantId: null, access: null },
  openSteps: new Set(), recipeTab: 'All',
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
  const [status, assistants, recipes, convs, skills] = await Promise.all([api('/api/status'), api('/api/assistants'), api('/api/recipes'), api('/api/conversations'), api('/api/skills')]);
  S.skills = skills;
  S.settings = status.settings; S.providers = status.providers; S.assistants = assistants; S.recipes = recipes; S.convs = convs; S.osUser = status.user;
  applyTheme(S.settings.theme);
  renderUser();
  renderConvList();
  bindChrome();
  route();
  window.addEventListener('hashchange', route);
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
  closeMenu();
  if (h.startsWith('c/')) return openConversation(h.slice(2));
  S.current = null;
  if (h === 'assistants') return renderAssistantsPage();
  if (h === 'recipes') return renderRecipesPage();
  renderHome();
}
const go = (h) => { if (location.hash === `#/${h}`) route(); else location.hash = `/${h}`; };
function setNav(name) { $$('.nav-item').forEach((n) => n.classList.toggle('active', n.dataset.nav === name)); renderConvList(); }

// ---------------------------------------------------------------- sidebar
function renderConvList() {
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
      <div class="conv ${S.current?.id === c.id ? 'active' : ''}" data-cid="${c.id}" title="${esc(c.title)}">
        <span class="conv-emoji">${esc(assistantById(c.assistantId).emoji)}</span>
        <span class="conv-title">${esc(c.title)}</span>
        ${S.live.has(c.id) ? '<i class="live-dot"></i>' : ''}
        <span class="conv-actions"><button data-conv-menu="${c.id}" title="More">${icon('dots')}</button></span>
      </div>`).join('')}`).join('');
}

async function refreshConvs() { S.convs = await api('/api/conversations'); renderConvList(); }

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
  const placeholder = home ? `How can I help${firstName() ? `, ${firstName()}` : ''} today?` : `Reply to ${a.name}…`;
  return `
    <div class="composer-wrap">
      <div class="composer" id="composer">
        <div class="attach-list" id="attachList">${attachChips()}</div>
        <textarea id="input" rows="1" placeholder="${esc(placeholder)}">${esc(d.text)}</textarea>
        <div class="composer-row">
          <button class="pill round" id="attachBtn" title="Attach files">${icon('paperclip')}</button>
          ${home ? `<button class="pill outline" id="assistantPill" data-color="${a.color}"><span class="a-badge sm">${esc(a.emoji)}</span><span class="lbl">${esc(a.name)}</span>${icon('chevron', 'caret')}</button>` : ''}
          <button class="pill" id="accessPill" title="What Lumen is allowed to do">${ACCESS[access]?.emoji || '👀'} <span class="lbl">${esc(ACCESS[access]?.short || 'Can read files')}</span>${icon('chevron', 'caret')}</button>
          <span class="spacer"></span>
          ${model && p.models.length > 1 ? `<button class="pill" id="modelPill" title="Response style">${icon('gauge')}<span class="lbl">${esc(model.label)}</span>${icon('chevron', 'caret')}</button>` : ''}
          <button class="send-btn ${live ? 'stop' : ''}" id="sendBtn" title="${live ? 'Stop' : 'Send (Enter)'}">${icon(live ? 'stop' : 'send')}</button>
        </div>
        <input type="file" id="fileInput" multiple hidden>
      </div>
      ${home ? '' : `<div class="composer-hint">Lumen can make mistakes — double-check important details.</div>`}
    </div>`;
}

function attachChips() {
  return S.draft.attachments.map((f, i) => `
    <span class="attach-chip ${f.uploading ? 'uploading' : ''}">${f.uploading ? '<span class="spinner" style="width:13px;height:13px"></span>' : icon('file')}<span class="name">${esc(f.name)}</span><button data-rm-attach="${i}" title="Remove">${icon('x')}</button></span>`).join('');
}

function bindComposer(root, { conv = null } = {}) {
  const input = $('#input', root);
  const send = $('#sendBtn', root);
  const autosize = () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 280) + 'px'; };
  const syncSend = () => {
    const live = isLive(conv);
    const ready = input.value.trim() || S.draft.attachments.some((a) => !a.uploading);
    send.disabled = !live && !ready;
    send.classList.toggle('go', !live && !!ready);
  };
  autosize(); syncSend();
  input.addEventListener('input', () => { S.draft.text = input.value; autosize(); syncSend(); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); if (!isLive(conv)) submit(); } });
  input.addEventListener('paste', (e) => { const files = [...(e.clipboardData?.files || [])]; if (files.length) { e.preventDefault(); uploadFiles(files); } });
  send.addEventListener('click', () => { if (isLive(conv)) stopConv(conv); else submit(); });
  $('#attachBtn', root).addEventListener('click', () => $('#fileInput', root).click());
  $('#fileInput', root).addEventListener('change', (e) => { uploadFiles([...e.target.files]); e.target.value = ''; });
  $('#attachList', root).addEventListener('click', (e) => { const b = e.target.closest('[data-rm-attach]'); if (b) { S.draft.attachments.splice(+b.dataset.rmAttach, 1); refreshAttach(); } });
  $('#assistantPill', root)?.addEventListener('click', (e) => openMenu(e.currentTarget, [
    { heading: 'Who should help?' },
    ...S.assistants.map((a) => ({ emoji: a.emoji, label: a.name, hint: a.tagline, selected: (S.draft.assistantId || 'lumen') === a.id, run: () => { S.draft.assistantId = a.id; if (a.access) S.draft.access = a.access; renderHome(); } })),
    { sep: true }, { icon: 'plus', label: 'Create an assistant', run: () => openAssistantBuilder() },
  ]));
  $('#accessPill', root).addEventListener('click', (e) => {
    const cur = conv ? (conv.access || S.settings.access) : (S.draft.access || assistantById(S.draft.assistantId).access || S.settings.access);
    openMenu(e.currentTarget, [{ heading: 'What can Lumen do?' }, ...Object.entries(ACCESS).map(([k, v]) => ({ emoji: v.emoji, label: v.label, hint: v.desc, selected: cur === k, run: async () => {
      if (conv) { conv.access = k; if (conv.id) await api(`/api/conversations/${conv.id}`, { method: 'PATCH', body: { access: k } }); renderChat(); } else { S.draft.access = k; renderHome(); }
      toast(`${v.label} — ${k === 'edit' ? 'Lumen can now save files' : k === 'read' ? 'Lumen can read your folder' : 'files are off-limits'}`, 'shield');
    } }))]);
  });
  $('#modelPill', root)?.addEventListener('click', (e) => openMenu(e.currentTarget, [{ heading: 'Response style' }, ...provider().models.map((m) => ({ label: m.label, hint: m.hint, selected: S.settings.model === m.id, run: async () => { await saveSettings({ model: m.id }); rerenderCurrent(); } }))], { align: 'right' }));
  root._sync = syncSend;
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
          <svg class="greeting-spark" viewBox="0 0 40 40"><defs><linearGradient id="gs" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7c5cff"/><stop offset=".55" stop-color="#c757d6"/><stop offset="1" stop-color="#ff8a5b"/></linearGradient></defs><path d="M20 2l4.4 13.6L38 20l-13.6 4.4L20 38l-4.4-13.6L2 20l13.6-4.4z" fill="url(#gs)"/></svg>
          <h1>${greetingWord()}${firstName() ? `, <em>${esc(firstName())}</em>` : ''}</h1>
        </div>
        <p class="home-sub">${a.id === 'lumen' ? 'Ask anything, attach a document, or pick a quick start below.' : `You're working with <b>${esc(a.name)}</b> — ${esc(a.tagline || '')}`}</p>
        ${composerHTML({ home: true })}

        ${demoBanner()}

        <div class="section-label"><span>Who would you like to work with?</span><a data-go="assistants">Manage assistants</a></div>
        <div class="assistant-row">
          ${S.assistants.map((x) => `<button class="a-chip ${x.id === (S.draft.assistantId || 'lumen') ? 'selected' : ''}" data-color="${x.color}" data-pick-assistant="${x.id}" title="${esc(x.tagline || '')}"><span class="a-badge">${esc(x.emoji)}</span>${esc(x.name)}</button>`).join('')}
          <button class="a-chip" data-new-assistant><span class="a-badge" style="background:var(--panel-2)">${icon('plus')}</span>Create your own</button>
        </div>

        ${a.starters?.length ? `
        <div class="section-label"><span>Try asking ${esc(a.name)}</span></div>
        <div class="starter-list" style="max-width:none">${a.starters.map((s) => `<button class="starter" data-starter="${esc(s)}"><span>${esc(s)}</span>${icon('right')}</button>`).join('')}</div>` : ''}

        <div class="section-label"><span>Quick starts</span><a data-go="recipes">See all</a></div>
        <div class="recipe-grid">${recipes.map(recipeCard).join('')}</div>
      </div>
    </div>`;
  const root = $('#view');
  bindComposer(root);
  root.firstElementChild.addEventListener('click', homeClicks);
  setTimeout(() => { if (!$('#modalRoot').children.length) $('#input')?.focus(); }, 50);
}

function demoBanner() {
  const inDemo = S.settings.demoInstalled && S.settings.workspace === S.settings.demoInstalled;
  if (S.settings.demoDismissed && !inDemo) return '';
  if (inDemo && S.settings.demoPack === 'aidlc') {
    return `<div class="demo-banner active">
      <div class="demo-icon">🧬</div>
      <div class="demo-text"><b>You're in the Online Permit Renewal AIDLC sample</b><span>Synthetic program documents (PID, BRD, Solution Blueprint, Ways of Working, data model) and a traceability workbook. Try one:</span>
        <div class="demo-actions">
          <button class="btn soft sm" data-recipe="aidlc-knowledge-inventory">📚 Knowledge inventory</button>
          <button class="btn soft sm" data-recipe="aidlc-refine-requirements">🔬 Refine requirements</button>
          <button class="btn soft sm" data-recipe="aidlc-trace-check">🔗 Traceability check</button>
          <button class="btn soft sm" data-recipe="aidlc-change-impact">🌊 Change impact</button>
          <button class="btn ghost sm" data-open-drawer>${icon('folder')}See the files</button>
        </div>
      </div></div>`;
  }
  if (inDemo) {
    return `<div class="demo-banner active">
      <div class="demo-icon">📦</div>
      <div class="demo-text"><b>You're in the Contoso CRM Migration demo</b><span>A Microsoft Project plan plus a budget tracker, RAID log, timesheets and a progress update in Excel. Try one:</span>
        <div class="demo-actions">
          <button class="btn soft sm" data-recipe="plan-health-check">🩺 Health check</button>
          <button class="btn soft sm" data-recipe="plan-status-report">📣 Status report</button>
          <button class="btn soft sm" data-recipe="plan-update-progress">🔄 Update the plan</button>
          <button class="btn soft sm" data-recipe="budget-variance">💰 Budget review</button>
          <button class="btn ghost sm" data-open-drawer>${icon('folder')}See the files</button>
        </div>
      </div></div>`;
  }
  return `<div class="demo-banner">
    <div class="demo-icon">📦</div>
    <div class="demo-text"><b>Try it on sample data</b><span>A project manager demo (Microsoft Project plan with Excel budget, RAID log and timesheets), or a delivery-lifecycle sample (BRD, design and a traceability workbook) for the requirements, design, story and traceability assistants.</span></div>
    <div class="demo-cta"><button class="btn grad sm" data-install-demo="crm">${icon('package')}PM demo</button><button class="btn grad sm" data-install-demo="aidlc">${icon('package')}AIDLC sample</button><button class="icon-btn" data-dismiss-demo title="Hide">${icon('x')}</button></div>
  </div>`;
}

async function installDemo(btn) {
  const pack = btn?.dataset.installDemo || 'crm';
  const label = btn?.innerHTML;
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>Setting up…'; }
  try {
    const r = await api('/api/demo/install', { method: 'POST', body: { pack } });
    const st = await api('/api/status'); S.settings = st.settings;
    S.draft.assistantId = pack === 'aidlc' ? 'traceability-analyst' : 'schedule-analyst'; S.draft.access = 'read';
    celebrate(); toast(`${pack === 'aidlc' ? 'Sample' : 'Demo'} ready — your project folder is now “${baseName(r.path)}”`, 'package');
    renderHome();
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
  return `<button class="recipe-card" data-recipe="${r.id}" data-color="${a.color}">
    <span class="recipe-emoji">${esc(r.emoji || '✨')}</span>
    <span class="recipe-name">${esc(r.name)}</span>
    <span class="recipe-desc">${esc(r.description || '')}</span>
    <span class="recipe-meta"><span class="a-badge sm" data-color="${a.color}" style="width:18px;height:18px;font-size:10px">${esc(a.emoji)}</span>${esc(a.name)}${r.access === 'edit' ? ' · <span class="badge accent">Saves a file</span>' : ''}</span>
  </button>`;
}

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
        <span class="a-badge md" data-color="${a.color}">${esc(a.emoji)}</span>
        <button class="chat-title" id="chatTitle" title="Click to rename">${esc(c.title)}</button>
        <span class="grow"></span>
        <button class="pill outline" id="folderPill" title="${esc(c.workspace || '')}">${icon('folder')}<span class="lbl">${esc(baseName(c.workspace) || 'Project folder')}</span></button>
        <button class="icon-btn" id="chatMenuBtn" title="More">${icon('dots')}</button>
      </div>
      <div class="messages" id="messages"><div class="messages-inner" id="msgInner">
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
    { icon: 'folder', label: 'Show project files', run: () => openDrawer() },
    { sep: true },
    { icon: 'trash', label: 'Delete chat', danger: true, run: () => deleteConv(c.id) },
  ], { align: 'right' }));
  root.firstElementChild.addEventListener('click', chatClicks);
  if (!$('#modalRoot').children.length) $('#input')?.focus();
}

function emptyChatHTML(a) {
  return `<div class="chat-empty" style="min-height:50vh"><span class="a-badge lg" data-color="${a.color}">${esc(a.emoji)}</span><h2>${esc(a.name)}</h2><p>${esc(a.tagline || '')}</p></div>`;
}

function msgHTML(m, c) {
  if (m.role === 'user') {
    return `<div class="msg user" data-mid="${m.id}">
      ${m.attachments?.length ? `<div class="attach-list">${m.attachments.map((f) => `<span class="attach-chip">${icon('file')}<span class="name">${esc(f.name)}</span></span>`).join('')}</div>` : ''}
      <div class="bubble">${esc(m.content)}</div>
    </div>`;
  }
  const a = assistantById(c.assistantId);
  const live = [...S.live.values()].some((l) => l.msg === m);
  return `<div class="msg assistant" data-mid="${m.id}" data-color="${a.color}">
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
  return `
    ${tools.length ? `<div class="steps ${open ? 'open' : ''}" data-steps="${m.id}">
      <button class="steps-head" data-toggle-steps="${m.id}">${stepsHead}${icon('chevron', 'caret')}</button>
      <div class="steps-list">${tools.map((t) => `<div class="step ${t.ok === false ? 'fail' : ''}"><span class="step-state">${t.ok === undefined && live ? '<span class="spinner"></span>' : icon(t.ok === false ? 'x' : 'check')}</span>${icon(t.icon)}<span>${esc(t.label)}</span></div>`).join('')}</div>
    </div>` : ''}
    ${m.content ? `<div class="md">${md(m.content, live)}</div>` : live && !running ? `<div class="thinking"><span class="orb"></span><span class="shimmer">${esc(a.name)} is thinking…</span></div>` : ''}
    ${files.length ? `<div class="file-cards">${files.map((f) => `<button class="file-card" data-open-file="${esc(f)}" title="Open ${esc(f)}"><span class="file-icon">${esc(extOf(f))}</span><span class="file-info"><b>${esc(baseName(f))}</b><small>Saved to your project folder · Click to open</small></span></button>`).join('')}</div>` : ''}
    ${m.error ? `<div class="error-card">${icon('alert')}<div><b>Something went wrong.</b><div style="color:var(--text-2);font-size:13.5px">${esc(friendlyError(m.error))}</div><button class="btn soft sm" data-retry="${m.id}">${icon('retry')}Try again</button></div></div>` : ''}
    ${m.stopped ? `<div class="msg-meta" style="margin:6px 0 0">Stopped</div>` : ''}
    ${!live && (m.content || m.error) ? `<div class="msg-actions"><button data-copy-msg="${m.id}">${icon('copy')}Copy</button>${m.error ? '' : `<button data-retry="${m.id}">${icon('retry')}Retry</button>`}</div>` : ''}`;
}

function friendlyError(e) {
  if (/not found|ENOENT|spawn/i.test(e)) return 'The AI engine could not be started. Open Settings to check your connection.';
  if (/rate|limit|overloaded|529/i.test(e)) return 'The AI service is busy right now. Wait a moment and try again.';
  if (/auth|login|credential|401|403/i.test(e)) return 'You may need to sign in to the AI engine again. ' + e;
  return e;
}

function chatClicks(e) {
  const t = e.target.closest('[data-toggle-steps],[data-copy-msg],[data-retry],[data-open-file],[data-copy-code],[data-starter]');
  if (!t) return;
  const c = S.current;
  if (t.dataset.toggleSteps) { const id = t.dataset.toggleSteps; S.openSteps.has(id) ? S.openSteps.delete(id) : S.openSteps.add(id); t.parentElement.classList.toggle('open'); }
  else if (t.dataset.copyMsg) { const m = c.messages.find((x) => x.id === t.dataset.copyMsg); navigator.clipboard.writeText(m.content); flash(t, 'Copied'); }
  else if ('copyCode' in t.dataset) { navigator.clipboard.writeText(t.closest('pre').querySelector('code').innerText); flash(t, 'Copied'); }
  else if (t.dataset.retry) {
    const idx = c.messages.findIndex((x) => x.id === t.dataset.retry);
    const prevUser = [...c.messages.slice(0, idx)].reverse().find((x) => x.role === 'user');
    if (prevUser) sendMessage({ text: prevUser.content, attachments: (prevUser.attachments || []).map((a) => ({ path: a.path, name: a.name })), retryNote: true });
  }
  else if (t.dataset.openFile) api('/api/folder/open', { method: 'POST', body: { path: t.dataset.openFile, workspace: c.workspace } });
}
function flash(btn, text) { const html = btn.innerHTML; btn.innerHTML = `${icon('check')}${text}`; setTimeout(() => { btn.innerHTML = html; }, 1400); }

function rerenderCurrent() { if (S.view === 'chat') renderChat(); else if (S.view === 'home') renderHome(); }

// --- streaming
async function sendMessage({ text, attachments = [], assistantId, access, retryNote }) {
  let conv = S.view === 'chat' ? S.current : null;
  const aId = conv ? conv.assistantId : (assistantId || S.draft.assistantId || 'lumen');
  const a = assistantById(aId);
  const acc = conv ? (conv.access || S.settings.access) : (access || S.draft.access || a.access || S.settings.access);
  const userMsg = { id: `u${Date.now()}`, role: 'user', content: text, attachments: attachments.map((f) => ({ name: f.name, path: f.path })), createdAt: Date.now() };
  const msg = { id: `a${Date.now()}`, role: 'assistant', content: '', tools: [], files: [], createdAt: Date.now() };
  const ac = new AbortController();

  if (!conv) {
    conv = { id: null, title: text.slice(0, 48), assistantId: aId, access: acc, workspace: S.settings.workspace, messages: [] };
    S.current = conv;
  }
  conv.messages.push(userMsg, msg);
  const tempKey = conv.id || `pending-${Date.now()}`;
  let key = tempKey;
  S.live.set(key, { ac, msg, userMsg, conv });
  S.draft = { text: '', attachments: [], assistantId: null, access: null };
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
      body: JSON.stringify({ conversationId: conv.id, message: text, attachments: attachments.map((f) => f.path), assistantId: aId, access: acc, workspace: conv.workspace, providerId: S.settings.providerId, model: S.settings.model }),
    });
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
        else if (ev.type === 'error') { msg.error = ev.message; schedule(); }
        else if (ev.type === 'done') { msg.files = ev.message.files || []; }
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
async function pickFolder() {
  const r = await api('/api/folder/pick', { method: 'POST' });
  if (r.path) return r.path;
  if (r.native && r.path === '') return null; // user cancelled
  return new Promise((resolve) => {
    modal({
      title: 'Choose a project folder', sub: 'Paste the full path of the folder Lumen should work in.',
      body: `<input class="input" id="folderInput" placeholder="e.g. C:\\Users\\you\\Documents\\Project X" value="${esc(currentWorkspace())}">`,
      actions: [{ label: 'Cancel', run: () => resolve(null) }, { label: 'Use this folder', primary: true, run: async () => {
        const p = $('#folderInput').value.trim();
        const { ok } = await api('/api/folder/check', { method: 'POST', body: { path: p } });
        if (!ok) { toast("That folder doesn't exist", 'alert'); return false; }
        resolve(p);
      } }],
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
  $('#drawerPath').textContent = r.workspace;
  $('#drawerFiles').innerHTML = r.files.length ? `<div class="conv-group" style="padding-top:4px">Recently changed</div>` + r.files.map((f) => `
    <button class="file-row" data-open-file="${esc(f.path)}" title="${esc(f.rel)}"><span class="file-icon">${esc(extOf(f.name))}</span><span class="file-info"><b>${esc(f.name)}</b><small>${esc(f.rel.includes('\\') || f.rel.includes('/') ? f.rel.replace(/[\\/][^\\/]+$/, '') + ' · ' : '')}${fmtSize(f.size)} · ${timeAgo(f.mtime)}</small></span></button>`).join('')
    : `<div class="conv-empty">This folder is empty.<br>Files Lumen creates will appear here.</div>`;
}
function closeDrawer() { const d = $('#filesDrawer'); d.classList.remove('open'); d.setAttribute('aria-hidden', 'true'); }

// ---------------------------------------------------------------- assistants page
function renderAssistantsPage() {
  S.view = 'assistants'; setNav('assistants');
  $('#view').innerHTML = `
    <div class="page"><div class="page-inner">
      <div class="page-head">
        <div><h1>Assistants</h1><p>Assistants are helpers with their own expertise and personality. Pick one to start a chat, or create your own in under a minute — no technical setup needed.</p></div>
        <button class="btn grad" data-new-assistant>${icon('plus')}Create assistant</button>
      </div>
      <div class="card-grid">
        ${S.assistants.map((a, i) => `
          <div class="a-card" data-color="${a.color}" style="animation-delay:${i * 40}ms">
            <div class="a-card-top"><span class="a-badge lg">${esc(a.emoji)}</span>
              <button class="icon-btn" data-assistant-menu="${a.id}" title="More">${icon('dots')}</button></div>
            <div><h3>${esc(a.name)}</h3></div>
            <p class="tagline">${esc(a.tagline || '')}</p>
            ${skillChips(a)}
            <div class="a-card-actions">
              <button class="btn primary sm" data-chat-with="${a.id}">${icon('spark')}Start chat</button>
              <button class="btn soft sm" data-edit-assistant="${a.id}">${icon('edit')}Customize</button>
            </div>
          </div>`).join('')}
        <button class="a-card new-card" data-new-assistant>
          <span class="plus">${icon('plus')}</span><b>Create an assistant</b><span style="font-size:13px">Describe it in a sentence — Lumen sets it up</span>
        </button>
      </div>
    </div></div>`;
  $('#view').firstElementChild.addEventListener('click', (e) => {
    const t = e.target.closest('[data-new-assistant],[data-chat-with],[data-edit-assistant],[data-assistant-menu]'); if (!t) return;
    if ('newAssistant' in t.dataset) openAssistantBuilder();
    else if (t.dataset.chatWith) { S.draft.assistantId = t.dataset.chatWith; S.draft.access = assistantById(t.dataset.chatWith).access || null; go(''); }
    else if (t.dataset.editAssistant) openAssistantBuilder(assistantById(t.dataset.editAssistant));
    else if (t.dataset.assistantMenu) {
      const a = assistantById(t.dataset.assistantMenu);
      openMenu(t, [
        { icon: 'edit', label: 'Customize', run: () => openAssistantBuilder(a) },
        { icon: 'copy', label: 'Duplicate', run: async () => { const { id, builtin, createdAt, updatedAt, ...rest } = a; await api('/api/assistants', { method: 'POST', body: { ...rest, name: `${a.name} (copy)` } }); await reloadAssistants(); toast('Assistant duplicated'); } },
        { icon: 'code', label: 'Use in VS Code', hint: 'Save for Claude Code & Copilot', run: () => exportAssistant(a) },
        { sep: true },
        { icon: 'trash', label: 'Delete', danger: true, run: () => modal({ title: `Delete ${a.name}?`, sub: 'Existing chats with this assistant are kept.', actions: [{ label: 'Cancel' }, { label: 'Delete', danger: true, run: async () => { await api(`/api/assistants/${a.id}`, { method: 'DELETE' }); await reloadAssistants(); toast('Assistant deleted', 'trash'); } }] }) },
      ], { align: 'right' });
    }
  });
}

async function reloadAssistants() { S.assistants = await api('/api/assistants'); if (S.view === 'assistants') renderAssistantsPage(); else rerenderCurrent(); renderConvList(); }

async function exportAssistant(a) {
  const r = await api(`/api/assistants/${a.id}/export`, { method: 'POST', body: { workspace: currentWorkspace() } });
  modal({
    title: `${a.name} is ready for VS Code`,
    sub: 'Open your project folder in VS Code and this assistant will be available as a custom agent.',
    body: `<div class="option-cards">
      <div class="option-card"><span class="oc-icon">🟣</span><div class="oc-text"><div class="oc-title">Claude Code</div><div class="oc-desc" style="word-break:break-all">${esc(r.files[0])}</div></div></div>
      <div class="option-card"><span class="oc-icon">🐙</span><div class="oc-text"><div class="oc-title">GitHub Copilot</div><div class="oc-desc" style="word-break:break-all">${esc(r.files[1])}</div></div></div>
    </div>`,
    actions: [{ label: 'Open folder', icon: 'external', run: () => api('/api/folder/open', { method: 'POST', body: { workspace: r.workspace } }) }, { label: 'Done', primary: true }],
  });
}

function skillChips(a) {
  const list = (a.skills || []).map((id) => S.skills.find((s) => s.id === id)).filter(Boolean);
  return list.length ? `<div class="skill-chips">${list.map((s) => `<span class="skill-chip" title="${esc(s.description)}">${esc(s.emoji)} ${esc(s.title)}</span>`).join('')}</div>` : '';
}

function openAssistantBuilder(existing) {
  const a = existing ? { ...existing, starters: [...(existing.starters || [])], skills: [...(existing.skills || [])] } : { name: '', emoji: '🧠', color: COLORS[Math.floor(Math.random() * COLORS.length)], tagline: '', instructions: '', starters: ['', '', ''], access: '', skills: [] };
  while (a.starters.length < 3) a.starters.push('');
  const preview = () => `
    <div class="preview-label">Preview</div>
    <div class="a-card" data-color="${a.color}" style="animation:none">
      <div class="a-card-top"><span class="a-badge lg">${esc(a.emoji)}</span></div>
      <div><h3>${esc(a.name || 'Your assistant')}</h3></div>
      <p class="tagline">${esc(a.tagline || 'A short line about what it helps with')}</p>
      ${skillChips(a)}
      <div class="starter-list">${a.starters.filter(Boolean).slice(0, 3).map((s) => `<div class="starter" style="font-size:12.5px;padding:8px 10px">${esc(s)}</div>`).join('')}</div>
    </div>`;
  const m = modal({
    title: existing ? `Customize ${existing.name}` : 'Create an assistant', sub: existing ? 'Change how this assistant looks and behaves.' : 'Give it a job and a personality. You can change everything later.', wide: true,
    body: `<div class="builder">
      <div>
        ${existing ? '' : `<div class="magic-box">
          <div class="label">${icon('wand')} Describe it and let Lumen do the setup</div>
          <div class="magic-row"><input class="input" id="magicInput" placeholder="e.g. Helps me write clear test plans for our HR system"><button class="btn grad" id="magicBtn">${icon('spark')}Draft it</button></div>
        </div><div class="divider-text">or fill it in yourself</div>`}
        <div class="row">
          <div class="field" style="flex:2"><label>Name</label><input class="input" id="fName" value="${esc(a.name)}" placeholder="e.g. Test Plan Pro" maxlength="40"></div>
          <div class="field"><label>Color</label><div class="chip-list" id="fColors" style="padding-top:4px">${COLORS.map((c) => `<button class="color-opt ${c === a.color ? 'active' : ''}" data-color="${c}" data-set-color="${c}" title="${c}"></button>`).join('')}</div></div>
        </div>
        <div class="field"><label>Icon</label><div class="emoji-grid" id="fEmojis">${EMOJIS.map((e) => `<button class="emoji-opt ${e === a.emoji ? 'active' : ''}" data-set-emoji="${e}">${e}</button>`).join('')}</div></div>
        <div class="field"><label>What does it help with?</label><input class="input" id="fTagline" value="${esc(a.tagline)}" placeholder="One short line" maxlength="80"></div>
        <div class="field"><label>How should it behave?</label><textarea class="textarea" id="fInstr" rows="6" placeholder="Describe its expertise, tone and the format you like. e.g. You are a QA lead. Write test cases as tables with steps, expected result and priority. Keep language simple.">${esc(a.instructions)}</textarea><div class="help">Write it like you'd brief a new colleague. Plain English is perfect.</div></div>
        <div class="field"><label>Example requests <span style="color:var(--muted);font-weight:400">(shown as suggestions)</span></label>${a.starters.slice(0, 3).map((s, i) => `<input class="input" data-starter-i="${i}" value="${esc(s)}" placeholder="Example ${i + 1}" style="margin-bottom:8px">`).join('')}</div>
        ${S.skills.length ? `<div class="field"><label>Skills <span style="color:var(--muted);font-weight:400">(what it can work with)</span></label>
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
    leftAction: existing && !existing.builtin ? { label: 'Delete', icon: 'trash', danger: true, run: async () => { await api(`/api/assistants/${existing.id}`, { method: 'DELETE' }); await reloadAssistants(); toast('Assistant deleted', 'trash'); } } : null,
    actions: [{ label: 'Cancel' }, { label: existing ? 'Save changes' : 'Create assistant', grad: true, run: async () => {
      collect();
      if (!a.name.trim()) { toast('Give your assistant a name', 'alert'); $('#fName').focus(); return false; }
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
  const cats = ['All', ...new Set(S.recipes.map((r) => r.category || 'Other'))];
  if (!cats.includes(S.recipeTab)) S.recipeTab = 'All';
  const list = S.recipes.filter((r) => S.recipeTab === 'All' || (r.category || 'Other') === S.recipeTab);
  $('#view').innerHTML = `
    <div class="page"><div class="page-inner">
      <div class="page-head">
        <div><h1>Quick starts</h1><p>Ready-made tasks that ask you a few simple questions, then hand the work to the right assistant. Make your own for anything you do often.</p></div>
        <button class="btn grad" data-new-recipe>${icon('plus')}New quick start</button>
      </div>
      <div class="tabs">${cats.map((c) => `<button class="tab ${c === S.recipeTab ? 'active' : ''}" data-tab="${esc(c)}">${esc(c)}</button>`).join('')}</div>
      <div class="recipe-grid" style="grid-template-columns:repeat(auto-fill,minmax(240px,1fr))">
        ${list.map(recipeCard).join('')}
        <button class="recipe-card new-card" data-new-recipe style="min-height:170px"><span class="plus" style="width:40px;height:40px">${icon('plus')}</span><b>Create a quick start</b></button>
      </div>
    </div></div>`;
  $('#view').firstElementChild.addEventListener('click', (e) => {
    const t = e.target.closest('[data-tab],[data-recipe],[data-new-recipe]'); if (!t) return;
    if (t.dataset.tab) { S.recipeTab = t.dataset.tab; renderRecipesPage(); }
    else if (t.dataset.recipe) openRecipeRunner(t.dataset.recipe);
    else openRecipeBuilder();
  });
}

function openRecipeRunner(id) {
  const r = S.recipes.find((x) => x.id === id); if (!r) return;
  const a = assistantById(r.assistantId);
  const files = {};
  const m = modal({
    head: `<div class="modal-head"><span class="recipe-emoji" style="font-size:24px;width:48px;height:48px;border-radius:14px;margin:0">${esc(r.emoji)}</span><div><h2>${esc(r.name)}</h2><p>${esc(r.description || '')}</p></div><button class="icon-btn" data-x>${icon('x')}</button></div>`,
    body: `${(r.fields || []).map((f) => `<div class="field"><label>${esc(f.label)}</label>${fieldInput(f)}</div>`).join('')}
      <div style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--muted);margin-top:4px" data-color="${a.color}"><span class="a-badge sm">${esc(a.emoji)}</span>${esc(a.name)} will take it from here${r.access === 'edit' ? ' and save the result to your project folder' : ''}.</div>`,
    leftAction: { label: 'Edit', icon: 'edit', run: () => openRecipeBuilder(r) },
    actions: [{ label: 'Cancel' }, { label: 'Start', icon: 'play', grad: true, run: (el) => {
      const vals = {};
      for (const f of r.fields || []) vals[f.key] = f.type === 'file' ? (files[f.key] ? `"${files[f.key].name}"` : '') : ($(`[data-field="${f.key}"]`, el)?.value || '').trim();
      const required = (r.fields || []).filter((f) => !f.optional && !/optional/i.test(f.placeholder || '')).find((f) => !vals[f.key]);
      if (required) { toast(`Please ${required.type === 'file' ? 'choose' : 'fill in'} “${required.label}”`, 'alert'); $(`[data-field="${required.key}"],[data-file-select="${required.key}"]`, el)?.focus(); return false; }
      const text = r.template.replace(/\{\{(\w+)\}\}/g, (_, k) => vals[k] || '(not specified)');
      const attachments = Object.values(files).filter(Boolean);
      const order = ['chat', 'read', 'edit'];
      const access = order[Math.max(order.indexOf(r.access || 'chat'), order.indexOf(S.settings.access), attachments.length ? 1 : 0)];
      S.current = null; S.view = 'home';
      sendMessage({ text, attachments, assistantId: r.assistantId, access });
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
        const pick = matches.find((x) => !used.has(x.path) && (score(x) > 0 || matches.length === 1));
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

function fieldInput(f) {
  if (f.type === 'textarea') return `<textarea class="textarea" data-field="${f.key}" placeholder="${esc(f.placeholder || '')}" rows="4"></textarea>`;
  if (f.type === 'select') return `<div class="seg" data-seg="${f.key}">${(f.options || []).map((o) => `<button type="button" class="${o === (f.default || f.options[0]) ? 'active' : ''}" onclick="this.parentElement.querySelectorAll('button').forEach(b=>b.classList.remove('active'));this.classList.add('active');this.parentElement.nextElementSibling.value=this.textContent">${esc(o)}</button>`).join('')}</div><input type="hidden" data-field="${f.key}" value="${esc(f.default || f.options?.[0] || '')}">`;
  if (f.type === 'file') return `<select class="select" data-file-select="${f.key}"><option value="">Looking in your project folder…</option></select>${f.optional ? '<div class="help">Optional</div>' : ''}`;
  return `<input class="input" data-field="${f.key}" placeholder="${esc(f.placeholder || '')}">`;
}

function openRecipeBuilder(existing) {
  const r = existing ? JSON.parse(JSON.stringify(existing)) : { name: '', emoji: '⚡', description: '', category: 'My quick starts', assistantId: S.assistants[0]?.id || 'lumen', access: '', fields: [{ key: 'topic', label: 'What is it about?', type: 'textarea' }], template: '' };
  const TYPES = { text: 'Short answer', textarea: 'Long answer', select: 'Pick one', file: 'A file' };
  const keyOf = (label, i) => (label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 24) || `field${i + 1}`);
  const fieldsHTML = () => r.fields.map((f, i) => `
    <div class="field-row"><input class="input" data-fl="${i}" value="${esc(f.label)}" placeholder="Question to ask">
      <select class="select" data-ft="${i}">${Object.entries(TYPES).map(([k, v]) => `<option value="${k}" ${f.type === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
      <button class="icon-btn" data-rmf="${i}" title="Remove">${icon('trash')}</button></div>
    ${f.type === 'select' ? `<input class="input" data-fo="${i}" value="${esc((f.options || []).join(', '))}" placeholder="Choices, separated by commas" style="margin:-2px 0 10px">` : ''}`).join('');
  const chipsHTML = () => r.fields.map((f) => `<button class="chip" data-insert="${f.key}">+ ${esc(f.label || f.key)}</button>`).join('');
  const m = modal({
    title: existing ? 'Edit quick start' : 'New quick start', sub: 'Ask a few questions, then send a prompt built from the answers.', wide: true,
    body: `
      <div class="row">
        <div class="field" style="flex:0 0 90px"><label>Icon</label><input class="input" id="rEmoji" value="${esc(r.emoji)}" maxlength="4" style="text-align:center;font-size:20px;padding:6px"></div>
        <div class="field" style="flex:2"><label>Name</label><input class="input" id="rName" value="${esc(r.name)}" placeholder="e.g. Prepare for a stakeholder interview"></div>
        <div class="field"><label>Category</label><input class="input" id="rCat" value="${esc(r.category || '')}"></div>
      </div>
      <div class="field"><label>Short description</label><input class="input" id="rDesc" value="${esc(r.description || '')}" placeholder="What does it produce?"></div>
      <div class="row">
        <div class="field"><label>Assistant</label><select class="select" id="rAsst">${S.assistants.map((a) => `<option value="${a.id}" ${a.id === r.assistantId ? 'selected' : ''}>${esc(a.emoji)} ${esc(a.name)}</option>`).join('')}</select></div>
        <div class="field"><label>File access</label><select class="select" id="rAccess"><option value="">Use my default</option>${Object.entries(ACCESS).map(([k, v]) => `<option value="${k}" ${r.access === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select></div>
      </div>
      <div class="field"><label>Questions to ask</label><div id="rFields">${fieldsHTML()}</div><button class="btn ghost sm" id="addField">${icon('plus')}Add a question</button></div>
      <div class="field"><label>The request to send</label>
        <div class="chip-list" id="rChips" style="margin-bottom:8px">${chipsHTML()}</div>
        <textarea class="textarea" id="rTemplate" rows="6" placeholder="Write the request. Click the chips above to drop in the answers. e.g. Prepare 10 interview questions about {{topic}}...">${esc(r.template)}</textarea>
        <div class="help">Answers are inserted wherever you see {{like_this}}.</div></div>`,
    leftAction: existing && !existing.builtin ? { label: 'Delete', icon: 'trash', danger: true, run: async () => { await api(`/api/recipes/${existing.id}`, { method: 'DELETE' }); S.recipes = await api('/api/recipes'); rerenderPage(); toast('Quick start deleted', 'trash'); } } : null,
    actions: [{ label: 'Cancel' }, { label: existing ? 'Save' : 'Create', grad: true, run: async (el) => {
      collect(el);
      if (!r.name.trim()) { toast('Give it a name', 'alert'); return false; }
      if (!r.template.trim()) r.template = r.fields.map((f) => `${f.label}: {{${f.key}}}`).join('\n');
      const { builtin, ...body } = r;
      if (existing) await api(`/api/recipes/${existing.id}`, { method: 'PUT', body }); else await api('/api/recipes', { method: 'POST', body });
      S.recipes = await api('/api/recipes'); rerenderPage();
      toast(existing ? 'Quick start saved' : 'Quick start created', 'spark');
    } }],
  });
  const el = m.el;
  function collect() {
    r.emoji = $('#rEmoji', el).value || '⚡'; r.name = $('#rName', el).value; r.category = $('#rCat', el).value || 'My quick starts';
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
function rerenderPage() { if (S.view === 'recipes') renderRecipesPage(); else rerenderCurrent(); }

// ---------------------------------------------------------------- settings
function providerCards(selected) {
  return S.providers.map((p) => `
    <button class="option-card ${p.id === selected ? 'active' : ''}" data-provider="${p.id}">
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
      <div class="field"><label>Default file access</label><div class="seg" id="sAccess">${Object.entries(ACCESS).map(([k, v]) => `<button data-v="${k}" class="${s.access === k ? 'active' : ''}">${v.emoji} ${esc(v.label)}</button>`).join('')}</div></div>
      <div class="field"><label>Default project folder</label><div class="row" style="align-items:center"><input class="input" id="sFolder" value="${esc(s.workspace)}" readonly style="flex:1"><button class="btn soft" id="sFolderBtn" style="flex:0 0 auto">${icon('folder')}Change</button></div><div class="help">Where Lumen reads and saves documents unless a chat uses a different folder.</div></div>
      <div class="field"><label>Appearance</label><div class="seg" id="sTheme">${[['system', 'Match system'], ['light', 'Light'], ['dark', 'Dark']].map(([k, l]) => `<button data-v="${k}" class="${(s.theme || 'system') === k ? 'active' : ''}">${l}</button>`).join('')}</div></div>
      <details class="advanced"><summary>${icon('settings')} Advanced</summary>
        <div class="field"><label>Reset built-in content</label><div class="help" style="margin:0 0 8px">Restores the original assistants and quick starts. Your chats are not affected.</div><button class="btn soft sm" id="sReset">${icon('refresh')}Restore defaults</button></div>
      </details>`,
    actions: [{ label: 'Close' }, { label: 'Save', primary: true, run: async (el) => {
      await saveSettings({ userName: $('#sName', el).value.trim(), providerId: s.providerId, access: s.access, workspace: s.workspace, theme: s.theme, model: s.providerId !== S.settings.providerId ? 'default' : S.settings.model });
      applyTheme(s.theme); rerenderCurrent(); toast('Settings saved');
    } }],
  });
  const el = m.el;
  const seg = (id, key, after) => $(`#${id}`, el).addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (!b) return; s[key] = b.dataset.v; $$(`#${id} button`, el).forEach((x) => x.classList.toggle('active', x === b)); after?.(); });
  seg('sAccess', 'access'); seg('sTheme', 'theme', () => applyTheme(s.theme));
  $('#providerCards', el).addEventListener('click', (e) => { const b = e.target.closest('[data-provider]'); if (!b) return; s.providerId = b.dataset.provider; $('#providerCards', el).innerHTML = providerCards(s.providerId); });
  $('#refreshEngines', el).addEventListener('click', async () => { $('#providerCards', el).style.opacity = .5; const st = await api('/api/status?refresh=1'); S.providers = st.providers; $('#providerCards', el).innerHTML = providerCards(s.providerId); $('#providerCards', el).style.opacity = 1; renderUser(); });
  $('#sFolderBtn', el).addEventListener('click', async () => { const p = await pickFolder(); if (p) { s.workspace = p; $('#sFolder', el).value = p; } });
  $('#sReset', el).addEventListener('click', () => modal({ title: 'Restore defaults?', sub: 'Built-in assistants and quick starts go back to how they shipped. Ones you created are removed.', actions: [{ label: 'Cancel' }, { label: 'Restore', danger: true, run: async () => { await api('/api/reset', { method: 'POST' }).catch(() => {}); toast('Defaults restored'); location.reload(); } }] }));
  if (focus === 'engine') setTimeout(() => $('#engineField', el).scrollIntoView({ block: 'center' }), 50);
}

// ---------------------------------------------------------------- onboarding
function openOnboarding() {
  let step = 0;
  const draft = { userName: S.settings.userName || '', providerId: S.settings.providerId, workspace: S.settings.workspace };
  const steps = [
    () => `<div class="welcome"><div class="welcome-orb"><svg viewBox="0 0 32 32"><path d="M16 4l2.6 7.4L26 14l-7.4 2.6L16 24l-2.6-7.4L6 14l7.4-2.6z" fill="#fff"/></svg></div>
      <h2>Welcome to Lumen</h2><p>Your AI workspace for writing, analysis and planning — right on your computer. Let's get you set up in three quick steps.</p>
      <input class="input" id="obName" placeholder="Your first name" value="${esc(draft.userName)}"></div>`,
    () => `<div class="welcome" style="padding-bottom:10px"><h2>Choose your AI engine</h2><p>Lumen works with the AI tools installed on this computer. We picked the one that's ready.</p>
      <div class="option-cards" id="obProviders" style="text-align:left;max-width:440px;margin:0 auto">${providerCards(draft.providerId)}</div></div>`,
    () => `<div class="welcome"><h2>Where do you keep your work?</h2><p>Pick a project folder. Lumen can read documents there and save new ones — only when you allow it.</p>
      <div class="option-card active" style="max-width:420px;margin:0 auto 12px;text-align:left"><span class="oc-icon">📁</span><span class="oc-text"><span class="oc-title" id="obFolderName">${esc(baseName(draft.workspace))}</span><span class="oc-desc" id="obFolder" style="word-break:break-all">${esc(draft.workspace)}</span></span></div>
      <button class="btn soft sm" id="obFolderBtn">${icon('folder')}Choose a different folder</button>
      <div class="feature-list" style="margin-top:22px">
        <div class="feature"><span class="fi">🤝</span><div><b>Assistants</b><span>Specialists for requirements, status reports, writing and data.</span></div></div>
        <div class="feature"><span class="fi">⚡</span><div><b>Quick starts</b><span>Answer a few questions, get a finished deliverable.</span></div></div>
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
    $('#obFolderBtn', m.el)?.addEventListener('click', async () => { const p = await pickFolder(); if (p) { draft.workspace = p; $('#obFolder', m.el).textContent = p; $('#obFolderName', m.el).textContent = baseName(p); } });
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
  const colors = ['#7c5cff', '#c757d6', '#ff8a5b', '#12a594', '#f59e0b'];
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

function bindChrome() {
  $('#newChatBtn').addEventListener('click', newChat);
  $$('[data-nav]').forEach((n) => n.addEventListener('click', () => go(n.dataset.nav === 'home' ? '' : n.dataset.nav)));
  $('#filesNavBtn').addEventListener('click', openDrawer);
  $('#settingsBtn').addEventListener('click', () => openSettings());
  $('#collapseBtn').addEventListener('click', () => $('#app').classList.add('collapsed'));
  $('#expandBtn').addEventListener('click', () => $('#app').classList.remove('collapsed'));
  $('#searchInput').addEventListener('input', (e) => { S.search = e.target.value; renderConvList(); });
  $('#convList').addEventListener('click', (e) => {
    const menu = e.target.closest('[data-conv-menu]');
    if (menu) { e.stopPropagation(); return convMenu(menu.dataset.convMenu, menu); }
    const c = e.target.closest('[data-cid]'); if (c) go(`c/${c.dataset.cid}`);
  });
  $('[data-close-drawer]').addEventListener('click', closeDrawer);
  $('#drawerOpenFolder').addEventListener('click', () => api('/api/folder/open', { method: 'POST', body: { workspace: currentWorkspace() } }));
  $('#drawerChangeFolder').addEventListener('click', changeFolder);
  $('#drawerFiles').addEventListener('click', (e) => { const f = e.target.closest('[data-open-file]'); if (f) api('/api/folder/open', { method: 'POST', body: { path: f.dataset.openFile, workspace: currentWorkspace() } }); });

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); newChat(); }
    if (e.key === 'Escape') { closeMenu(); closeDrawer(); }
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
