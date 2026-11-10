// Lumen front-end: Message box: attachments, access level, "/" file picker.
import { icon } from './icons.js';
import { $, $$, api, baseName, esc, toast } from './utils.js';
import { ACCESS, S, assistantById, isLive, provider } from './state.js';
import { saveSettings } from './main.js';
import { go } from './router.js';
import { openMenu } from './menu.js';
import { modal } from './modal.js';
import { renderHome } from './home.js';
import { renderChat } from './chat.js';
import { rerenderCurrent, switchAgent } from './chat-actions.js';
import { openPromptPicker } from './prompts.js';
import { sendMessage, stopConv } from './streaming.js';
import { openAssistantBuilder } from './agents.js';
import { openSettings } from './settings.js';
import { pinnedAgentIds } from './sidebar.js';

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
          ${home || conv ? `<button class="pill outline" id="assistantPill" title="Which agent answers" data-color="${esc(a.color)}"><span class="a-badge sm">${esc(a.emoji)}</span><span class="lbl">${esc(a.name)}</span>${icon('chevron', 'caret')}</button>` : ''}
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
    { icon: 'wand', label: 'Use a prompt', hint: conv ? 'Fill in a prompt from the gallery and send it here' : 'Start this chat from a prompt in the gallery', run: () => openPromptPicker(conv) },
  ]));
  $('#fileInput', root).addEventListener('change', (e) => { uploadFiles([...e.target.files]); e.target.value = ''; });
  $('#attachList', root).addEventListener('click', (e) => { const b = e.target.closest('[data-rm-attach]'); if (b) { S.draft.attachments.splice(+b.dataset.rmAttach, 1); refreshAttach(); } });
  // Many agents: a filter box, then the sidebar's pinned agents, then everyone else (A–Z), in a scrolling list.
  $('#assistantPill', root)?.addEventListener('click', (e) => {
    const cur = conv ? conv.assistantId : S.draft.assistantId || 'lumen';
    const item = (a) => ({ emoji: a.emoji, label: a.name, hint: a.tagline, selected: cur === a.id, run: () => pickAgent(a) });
    const top = S.assistants.filter((a) => a.id === 'lumen' || pinnedAgentIds().includes(a.id));
    const rest = S.assistants.filter((a) => !top.includes(a)).sort((a, b) => a.name.localeCompare(b.name));
    openMenu(e.currentTarget, [
      { heading: 'Pinned' }, ...top.map(item),
      ...(rest.length ? [{ heading: 'All agents' }, ...rest.map(item)] : []),
      { sep: true }, { icon: 'plus', label: 'Create an agent', keep: true, run: () => openAssistantBuilder() },
    ], { title: 'Who should help?', search: 'Search agents' });
  });
  async function pickAgent(a) {
    if (!conv) { S.draft.assistantId = a.id; if (a.access) S.draft.access = a.access; renderHome(); return; }
    await switchAgent(conv, a);
  }
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

export { bindComposer, chooseWorkspaceFiles, composerHTML, currentWorkspace, setPins, submit, suggestedNextSteps, uploadFiles };
