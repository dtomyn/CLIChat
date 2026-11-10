// Lumen front-end: Chat page and message rendering.
import { icon } from './icons.js';
import { $, $$, api, baseName, esc, extOf, toast } from './utils.js';
import { highlight, md } from './markdown.js';
import { S, assistantById, isLive } from './state.js';
import { go, setNav } from './router.js';
import { deleteConv, refreshConvs, renameConv, renderConvList } from './sidebar.js';
import { openMenu } from './menu.js';
import { bindComposer, composerHTML, suggestedNextSteps } from './composer.js';
import { LUMEN_ONLY_TIP } from './home.js';
import { chatClicks } from './chat-clicks.js';
import { approvalCard } from './ado-approvals.js';
import { saveEdit, setEditing } from './chat-actions.js';
import { folderMenu, openDrawer } from './folder.js';

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

function rerenderMsg(c, m) {
  const el = $(`[data-mid="${m.id}"]`); if (!el || S.current !== c) return;
  el.outerHTML = msgHTML(m, c);
  highlight($(`[data-mid="${m.id}"]`));
}

export { assistantInner, fmtDuration, hasMdSlides, hasMdTable, msgHTML, openConversation, renderChat, rerenderMsg };
