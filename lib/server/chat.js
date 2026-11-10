// Lumen server: One chat turn: prompts, history replay, streaming the engine's events into the saved reply.
const fs = require('fs');
const path = require('path');
const store = require('../store');
const registry = require('../../providers');
const skills = require('../skills');
const workiq = require('../workiq');
const changesets = require('../../tools/ado/changesets');
const { cleanAccess, resolveWorkspace, workspaceFile } = require('./workspace');
const { labelUnapproved } = require('./stage-output');

// Conversations with a reply in progress.
const running = new Map(); // conversationId -> AbortController


function buildSystemPrompt(assistant, settings, activeSkills = [], access = 'read', skillCtx = {}) {
  const parts = [];
  if (assistant?.instructions) parts.push(assistant.instructions);
  if (settings.userName) parts.push(`The user's name is ${settings.userName}.`);
  parts.push(`You are running inside Lumen, a chat app for non-technical business users. Format answers in GitHub-flavored Markdown. Never ask the user to run terminal commands; do the work yourself or explain in plain language. Refer to the working directory as "your project folder". Today is ${new Date().toDateString()}.`);
  // Suggestion chips (plan 01, optional): a predictable closing line makes the UI's "suggested next step" extraction reliable.
  // Remove this push to revert.
  parts.push('When it genuinely helps, end a substantive reply with a final line in the form "**Suggested next step:** <one short imperative sentence>". Skip it for quick factual answers and small talk.');
  const sk = skills.promptFor(activeSkills, access, skillCtx);
  if (sk) parts.push(sk);
  return parts.join('\n\n');
}

// Replays only the last 12 messages, so after a rewind or engine switch older context is dropped.
function historyPrompt(conv, message) {
  const recent = conv.messages.slice(-12).map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n\n');
  return recent ? `Conversation so far:\n\n${recent}\n\n---\n\nUser: ${message}` : message;
}

async function autoTitle(conv, provider, firstMessage) {
  const fallback = firstMessage.replace(/\s+/g, ' ').trim().slice(0, 48) + (firstMessage.length > 48 ? '…' : '');
  conv.title = fallback;
  store.conversations.save(conv);
  const t = await provider.complete({ prompt: `Write a 2-5 word title (no quotes, no punctuation at the end) for a chat that starts with:\n\n${firstMessage.slice(0, 1500)}` }).catch(() => '');
  const clean = t.split('\n')[0].replace(/^["'#*\s]+|["'.*\s]+$/g, '').slice(0, 60);
  if (clean) { const fresh = store.conversations.get(conv.id); if (fresh) { fresh.title = clean; store.conversations.save(fresh); } return clean; }
  return fallback;
}

const modelLabel = (provider, id) => (provider.models || []).find((m) => m.id === id)?.label || id || 'Default';

async function runTurn(body, out = () => {}) {
  const settings = store.settings.get();
  const providerId = body.providerId || settings.providerId;
  const provider = registry.get(providerId);
  if (!provider) throw new Error(`Unknown provider ${providerId}`);

  let conv = body.conversationId ? store.conversations.get(body.conversationId) : null;
  const isNew = !conv;
  if (conv && body.truncateFrom) {
    // Rewind (edit / retry): drop the message and everything after it. The engine's own session still remembers the
    // dropped turns, so forget it; the next turn then replays the stored history through historyPrompt.
    if (running.has(conv.id)) throw new Error('Wait for the current reply to finish first.');
    const idx = conv.messages.findIndex((x) => x.id === body.truncateFrom);
    if (idx >= 0) { conv.messages = conv.messages.slice(0, idx); conv.sessions = {}; }
  }
  if (!conv) conv = store.conversations.create({ assistantId: typeof body.assistantId === 'string' && body.assistantId ? body.assistantId : 'lumen', workspace: resolveWorkspace(body.workspace), access: cleanAccess(body.access, cleanAccess(settings.access)), pinned_files: Array.isArray(body.pinned_files) ? body.pinned_files.filter((p) => typeof p === 'string') : [] });
  if (running.has(conv.id)) throw new Error('Wait for the current reply to finish first.');
  if (body.access) conv.access = cleanAccess(body.access, cleanAccess(conv.access));
  if (body.workspace) conv.workspace = resolveWorkspace(body.workspace);
  const assistant = store.assistants.get(conv.assistantId) || store.assistants.get('lumen');
  // Only the engine's own response modes reach its command line.
  const requestedModel = body.model || settings.model;
  const model = (provider.models || []).some((x) => x.id === requestedModel) ? requestedModel : 'default';

  let message = String(body.message || '').trim();
  // Only files inside this chat's notebook folder can be attached (uploads land in its Attachments/ folder).
  const attachments = (Array.isArray(body.attachments) ? body.attachments : []).filter((p) => workspaceFile(p, conv.workspace)).map((p) => path.resolve(conv.workspace, p));
  const rel = (p) => { const r = path.relative(conv.workspace, p); return r.startsWith('..') || path.isAbsolute(r) ? p : r; };
  if (attachments.length) message += `\n\n[Attached files: ${attachments.map((p) => `"${rel(p)}"`).join(', ')}]`;
  const pinned = (conv.pinned_files || []).filter((p) => workspaceFile(p, conv.workspace));
  let access = cleanAccess(conv.access);
  if ((attachments.length || pinned.length) && access === 'chat') access = 'read';
  // Files attached earlier in the chat keep their skills on, so follow-ups ("apply the approved changes") have the same tools.
  const earlier = (conv.messages || []).flatMap((m) => (m.attachments || []).map((a) => a.path)).filter(Boolean);
  const skillCtx = { ado: settings.ado, workiq: settings.workiq, providerId, dataDir: store.DATA, conversationId: conv.id, scheduled: !!conv.scheduled };
  const activeSkills = skills.resolve([
    ...(assistant?.skills || []), ...(conv.skills || []), skills.GUIDE, // every chat can answer questions about Lumen itself
    ...(skills.workiqReady(settings.workiq, skillCtx) ? ['microsoft-365'] : []),
  ], [...attachments, ...pinned, ...earlier]);
  const tools = skills.toolConfig(activeSkills, access, conv.workspace, skillCtx);
  // Outcomes of Azure DevOps change sets applied or discarded since the last turn, so the AI knows what really happened.
  const notes = (conv.adoNotes || []).slice();
  if (notes.length) message = `[Lumen update: ${notes.map((n) => n.text).join(' ')}]

${message}`;

  const userMsg = { id: store.id(), role: 'user', content: String(body.message || '').trim(), attachments: attachments.map((p) => ({ path: p, name: path.basename(p) })), createdAt: Date.now() };
  if (body.recipeId) userMsg.recipeId = String(body.recipeId);
  const asstMsg = { id: store.id(), role: 'assistant', content: '', tools: [], files: [], approvals: [], createdAt: Date.now(), providerId };
  if (tools?.servers?.office && (access === 'edit' || access === 'full')) tools.servers.office.env.LUMEN_SNAPSHOT_DIR = path.join(conv.workspace, '.lumen', 'snapshots', asstMsg.id);
  const priorMessages = conv.messages.slice();
  conv.messages.push(userMsg);
  store.conversations.save(conv);
  out({ type: 'conversation', conversation: { id: conv.id, title: conv.title, assistantId: conv.assistantId, isNew }, userMessageId: userMsg.id, assistantMessageId: asstMsg.id });

  const ac = new AbortController();
  running.set(conv.id, ac);
  // Note: closing the tab does NOT cancel the reply — it finishes and is saved. Use the Stop button (/api/chat/:id/stop) to cancel.

  const sessionId = provider.supportsResume ? conv.sessions?.[providerId] : null;
  // If this provider has no session yet but the conversation has history (e.g. switched engines), replay it.
  const prompt = (!sessionId && priorMessages.length) ? historyPrompt({ messages: priorMessages }, message) : message;

  let reported = null; // the engine's own { costUsd, durationMs }, when it reports one
  const emit = (ev) => {
    if (ev.type === 'connection' && ev.server === 'm365') { workiq.record(providerId, ev); return; }
    if (ev.type === 'session') { conv.sessions = { ...(conv.sessions || {}), [providerId]: ev.id }; return; }
    if (ev.type === 'text') asstMsg.content += ev.text;
    if (ev.type === 'tool') asstMsg.tools.push({ id: ev.id, icon: ev.icon, label: ev.label, file: ev.file });
    if (ev.type === 'tool' && ev.file && ev.writes) { const file = path.resolve(conv.workspace, ev.file); if (!asstMsg.files.includes(file)) asstMsg.files.push(file); }
    if (ev.type === 'tool_done') { const t = asstMsg.tools.find((x) => x.id === ev.id); if (t) t.ok = ev.ok; }
    if (ev.type === 'file' && ev.path) { const file = path.resolve(conv.workspace, ev.path); if (!asstMsg.files.includes(file)) asstMsg.files.push(file); }
    if (ev.type === 'error') asstMsg.error = ev.message;
    if (ev.type === 'approval') { if (!changesets.load(conv.id, ev.id) || asstMsg.approvals.includes(ev.id)) return; asstMsg.approvals.push(ev.id); }
    if (ev.type === 'usage') { reported = ev; return; }
    out(ev);
  };

  const titlePromise = isNew ? autoTitle(conv, provider, userMsg.content || 'New chat') : null;

  const started = Date.now();
  try {
    await provider.run({
      prompt, sessionId, cwd: conv.workspace, model, access, signal: ac.signal, tools,
      systemPrompt: [buildSystemPrompt(assistant, settings, activeSkills, access, skillCtx), pinned.length ? `Key files for this chat (read them when relevant): ${pinned.map((p) => JSON.stringify(rel(path.resolve(conv.workspace, p)))).join(', ')}` : ''].filter(Boolean).join('\n\n'),
    }, emit);
  } catch (e) { emit({ type: 'error', message: e.message }); }

  running.delete(conv.id);
  if (ac.signal.aborted) asstMsg.stopped = true;
  asstMsg.usage = reported
    ? { durationMs: reported.durationMs ?? Date.now() - started, costUsd: reported.costUsd, model: modelLabel(provider, model) }
    : { durationMs: Date.now() - started };
  const fresh = store.conversations.get(conv.id) || conv;
  fresh.sessions = conv.sessions; fresh.access = conv.access; fresh.workspace = conv.workspace;
  if (notes.length) fresh.adoNotes = (fresh.adoNotes || []).filter((n) => !notes.some((x) => x.id === n.id));
  // Take earlier messages from disk, so feedback given while this reply was running isn't lost.
  fresh.messages = [...priorMessages.map((pm) => fresh.messages.find((x) => x.id === pm.id) || pm), userMsg, asstMsg];
  store.conversations.save(fresh);
  for (const run of store.runs.list()) {
    const stage = run.stages.find((s) => s.conversationId === conv.id && s.status === 'rework');
    if (stage && !asstMsg.error && !asstMsg.stopped && workspaceFile(stage.outputPath, run.workspace)) {
      if (stage.unapprovedInputs) labelUnapproved(stage);
      stage.status = 'review'; store.runs.save(run);
    }
  }
  out({ type: 'done', message: { id: asstMsg.id, files: asstMsg.files.filter((f) => fs.existsSync(f)), usage: asstMsg.usage } });
  if (titlePromise) out({ type: 'title', title: await titlePromise });
  return { conversation: fresh, message: asstMsg };
}

// The "Suggested next step" line is a prompt for the chat UI, not part of the deliverable.
const stripSuggestion = (text) => String(text).replace(/\n+[ \t]*[*_]*suggested next steps?:?[*_]*:?[^\n]*\s*$/i, '').trimEnd();

module.exports = { runTurn, running, stripSuggestion };
