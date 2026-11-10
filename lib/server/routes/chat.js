// Lumen server: Chats: sending, stopping, conversations and Azure DevOps approvals.
const store = require('../../store');
const registry = require('../../../providers');
const changesets = require('../../../tools/ado/changesets');
const { json, send } = require('../http-util');
const { runTurn, running } = require('../chat');
const { decideChangeSet } = require('../ado-decisions');
const { cleanAccess, isDir } = require('../workspace');

async function handleChat(req, res) {
  const body = await json(req);
  if (body.providerId && !registry.get(body.providerId)) return send(res, 400, { error: `Unknown provider ${body.providerId}` });
  if (body.conversationId && running.has(body.conversationId)) return send(res, 409, { error: 'Wait for the current reply to finish first.' });
  if (body.conversationId && store.runs.list().some((r) => r.stages.some((s) => s.conversationId === body.conversationId && s.status === 'approved'))) return send(res, 409, { error: 'Send this approved stage back before changing it.' });
  if (body.conversationId) {
    for (const run of store.runs.list()) {
      const index = run.stages.findIndex((s) => s.conversationId === body.conversationId);
      if (index < 0) continue;
      const stage = run.stages[index], later = run.stages.slice(index + 1);
      if (stage.status === 'skipped') return send(res, 409, { error: 'Add this optional stage back to the run before continuing its chat.' });
      if (stage.checkRunning || later.some((s) => s.status === 'running' || s.checkRunning || running.has(s.conversationId))) return send(res, 409, { error: 'Wait for the traceability check and later stages to finish first.' });
      if (stage.status === 'review' && later.some((s) => s.status !== 'pending')) return send(res, 409, { error: 'Send this stage back before changing inputs used by later stages.' });
      stage.checkSummary = ''; stage.gateConversationId = null; store.runs.save(run);
    }
  }
  res.writeHead(200, { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' });
  try { await runTurn(body, (ev) => { if (!res.destroyed) res.write(JSON.stringify(ev) + '\n'); }); }
  catch (e) { res.write(JSON.stringify({ type: 'error', message: e.message }) + '\n'); }
  res.end();
}

/** Handles the request if it is one of these routes; otherwise returns without responding. */
module.exports = async function route(req, res, url, { resource, rid, action, sub, m, parts }) {
  // Approve cards for proposed Azure DevOps changes. Only these endpoints write to Azure DevOps (decision D3).
  if (resource === 'chat' && rid && action === 'approvals') {
    const conv = store.conversations.get(rid);
    if (!conv) return send(res, 404, { error: 'That chat could not be found.' });
    if (m === 'GET' && !sub) return send(res, 200, changesets.list(rid).map(changesets.describe));
    if (m === 'GET' && sub) { const cs = changesets.load(rid, sub); return cs ? send(res, 200, changesets.describe(cs)) : send(res, 404, { error: 'That proposal could not be found.' }); }
    if (m === 'POST' && sub === 'apply-all') {
      const body = await json(req);
      const ids = Array.isArray(body.ids) ? body.ids.map(String) : changesets.list(rid).filter((x) => x.status === 'pending').map((x) => x.id);
      const out = [];
      for (const id of ids) {
        const r = await decideChangeSet(rid, id, 'apply');
        out.push(r.body);
        if (r.code === 400) return send(res, 400, r.body);
      }
      return send(res, 200, out);
    }
    if ((m === 'POST' || m === 'DELETE') && sub) {
      const r = await decideChangeSet(rid, sub, m === 'POST' ? 'apply' : 'discard');
      return send(res, r.code, r.body);
    }
  }

  if (resource === 'conversations') {
    if (m === 'GET' && !rid) return send(res, 200, store.conversations.list());
    if (m === 'POST' && rid && action === 'fork') {
      const c = store.conversations.get(rid); if (!c) return send(res, 404, { error: 'Not found' });
      const { uptoMessageId } = await json(req);
      // No uptoMessageId → an empty branch (used when branching before the first message).
      const idx = uptoMessageId ? c.messages.findIndex((x) => x.id === uptoMessageId) : -1;
      if (uptoMessageId && idx < 0) return send(res, 400, { error: "That message isn't in this chat any more." });
      const messages = JSON.parse(JSON.stringify(c.messages.slice(0, idx + 1))).map(({ feedback, ...x }) => ({ ...x, id: store.id(), copied: true })); // copied: insights skip them
      const fork = store.conversations.create({ assistantId: c.assistantId, access: c.access, workspace: c.workspace, pinned_files: c.pinned_files || [], title: `${c.title} (branch)`, messages, sessions: {}, forkedFrom: { id: c.id, messageId: uptoMessageId || null, title: c.title } });
      return send(res, 200, fork);
    }
    if (m === 'GET' && rid) { const c = store.conversations.get(rid); return c ? send(res, 200, { ...c, running: running.has(c.id) }) : send(res, 404, { error: 'Not found' }); }
    if (m === 'PATCH' && rid && action === 'messages' && sub) {
      const c = store.conversations.get(rid); if (!c) return send(res, 404, { error: 'Not found' });
      const msg = c.messages.find((x) => x.id === sub); if (!msg || msg.role !== 'assistant') return send(res, 404, { error: "That reply isn't in this chat any more." });
      const { feedback } = await json(req);
      if (!feedback || !feedback.rating) delete msg.feedback;
      else if (['up', 'down'].includes(feedback.rating)) {
        msg.feedback = { rating: feedback.rating, at: Date.now() };
        const reason = String(feedback.reason || '').trim().slice(0, 80), note = String(feedback.note || '').trim().slice(0, 2000);
        if (reason) msg.feedback.reason = reason;
        if (note) msg.feedback.note = note;
      } else return send(res, 400, { error: 'Unknown rating.' });
      store.conversations.save(c);
      return send(res, 200, { feedback: msg.feedback || null });
    }
    if (m === 'PATCH' && rid) { const c = store.conversations.get(rid); if (!c) return send(res, 404, {}); const p = await json(req); if ('pinned_files' in p && (!Array.isArray(p.pinned_files) || p.pinned_files.some((x) => typeof x !== 'string'))) return send(res, 400, { error: 'Pinned files must be a list of paths.' }); if ('unread' in p && typeof p.unread !== 'boolean') return send(res, 400, { error: 'Unread must be true or false.' }); if ('access' in p) p.access = cleanAccess(p.access, cleanAccess(c.access)); if ('workspace' in p && !isDir(p.workspace)) return send(res, 400, { error: 'Choose an existing project folder.' }); if ('title' in p) p.title = String(p.title ?? '').slice(0, 200); for (const k of ['title', 'pinned', 'pinned_files', 'access', 'workspace', 'unread']) if (k in p) c[k] = p[k]; return send(res, 200, store.conversations.save(c)); }
    if (m === 'DELETE' && rid) { store.conversations.remove(rid); changesets.removeConversation(rid); return send(res, 200, { ok: true }); }
  }

  if (resource === 'chat' && m === 'POST' && !rid) return handleChat(req, res);
  if (resource === 'chat' && action === 'stop' && m === 'POST') { running.get(rid)?.abort(); return send(res, 200, { ok: true }); }
};
