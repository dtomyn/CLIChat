// Lumen front-end: Sending messages and folding the streamed reply.
import { icon } from './icons.js';
import { $, api, baseName, toast } from './utils.js';
import { highlight } from './markdown.js';
import { S, assistantById } from './state.js';
import { renderConvList } from './sidebar.js';
import { bindComposer, composerHTML } from './composer.js';
import { assistantInner, renderChat } from './chat.js';

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

export { sendMessage, stopConv };
