// Lumen front-end: Reply actions: save as file, feedback, quick starts, edit/retry/branch.
import { icon } from './icons.js';
import { $, $$, api, esc, toast } from './utils.js';
import { md } from './markdown.js';
import { S, assistantById, isLive } from './state.js';
import { go } from './router.js';
import { refreshConvs } from './sidebar.js';
import { openMenu } from './menu.js';
import { modal } from './modal.js';
import { renderHome } from './home.js';
import { hasMdSlides, hasMdTable, msgHTML, renderChat, rerenderMsg } from './chat.js';
import { sendMessage } from './streaming.js';
import { openRecipeBuilder } from './prompts.js';
import { openPromptEditor } from './prompt-lab.js';

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

// --- turn a prompt that worked into a quick prompt (attached files become [blanks]), or a guided task
function saveAsPrompt(c, mid) {
  const m = c.messages.find((x) => x.id === mid); if (!m) return;
  let text = m.content || '';
  (m.attachments || []).forEach((f, i) => {
    const name = f.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const before = text;
    text = text.replace(new RegExp(`["“]?${name}["”]?`, 'g'), `[file ${i + 1}]`);
    if (text === before) text += ` [file ${i + 1}]`;
  });
  openPromptEditor(null, { title: c.title && c.title !== 'New chat' ? c.title : '', text, agentId: c.assistantId || 'lumen' }, () => {}, { guided: () => saveAsRecipe(c, mid) });
}
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

// Switch the agent of an open chat. The server forgets the engine's session so the next turn replays the history.
async function switchAgent(conv, a) {
  if (conv.assistantId === a.id) return true;
  if (isLive(conv)) { toast('Wait for the current reply to finish first.', 'alert'); return false; }
  if (conv.id) {
    try { await api(`/api/conversations/${conv.id}`, { method: 'PATCH', body: { assistantId: a.id } }); }
    catch (e) { toast(e.message, 'alert'); return false; }
  }
  conv.assistantId = a.id; conv.sessions = {};
  const listed = S.convs.find((x) => x.id === conv.id); if (listed) listed.assistantId = a.id;
  renderChat();
  toast(`${a.name} will answer from now on. It can see the conversation so far.`, 'check');
  return true;
}

export { saveAsPrompt, switchAgent, branchFrom, rateReply, rerenderCurrent, rewind, saveAsRecipe, saveEdit, saveReplyMenu, setEditing };
