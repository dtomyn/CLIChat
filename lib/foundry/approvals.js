// Approval pauses from Contoso Foundry agents. When a hosted agent needs a person's decision it pauses and returns an
// `mcp_approval_request`; Lumen stores it as data/foundry-pending/<conversation>/<id>.json and shows an Approve card.
// The decision is sent back to the agent on the next turn as an `mcp_approval_response` (see providers/foundry-agents.js).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PREFIX = 'fa-';
const TTL = 7 * 24 * 60 * 60 * 1000;
const dataDir = () => process.env.LUMEN_DATA || path.join(__dirname, '..', '..', 'data');
const safe = (s) => String(s || '').replace(/[^a-zA-Z0-9-]/g, '');
const dirFor = (conv) => path.join(dataDir(), 'foundry-pending', safe(conv));
const fileFor = (conv, id) => path.join(dirFor(conv), `${safe(id)}.json`);

const isFoundryId = (id) => String(id || '').startsWith(PREFIX);

function stage(conversationId, { agent, responseId, requestId, value }) {
  const item = { id: PREFIX + crypto.randomUUID(), conversationId: safe(conversationId), agent, responseId, requestId, value: value ?? null,
    createdAt: Date.now(), expiresAt: Date.now() + TTL, status: 'pending' };
  fs.mkdirSync(dirFor(conversationId), { recursive: true });
  fs.writeFileSync(fileFor(conversationId, item.id), JSON.stringify(item, null, 1));
  return item;
}

function load(conversationId, id) {
  if (!isFoundryId(id)) return null;
  try {
    const a = JSON.parse(fs.readFileSync(fileFor(conversationId, id), 'utf8'));
    if (a.status === 'pending' && Date.now() > a.expiresAt) { a.status = 'expired'; save(a); }
    return a;
  } catch { return null; }
}
function save(a) { fs.writeFileSync(fileFor(a.conversationId, a.id), JSON.stringify(a, null, 1)); return a; }
function list(conversationId) {
  try { return fs.readdirSync(dirFor(conversationId)).filter((f) => f.endsWith('.json')).map((f) => load(conversationId, f.slice(0, -5))).filter(Boolean).sort((a, b) => a.createdAt - b.createdAt); }
  catch { return []; }
}
function removeConversation(conversationId) { fs.rmSync(dirFor(conversationId), { recursive: true, force: true }); }

/** Marks a pending pause approved or rejected. The agent itself is resumed by the next chat turn. */
function decide(conversationId, id, approve, by) {
  const a = load(conversationId, id);
  if (!a) return { code: 404, body: { error: 'That approval request could not be found.' } };
  if (a.status !== 'pending') return { code: 409, body: describe(a) };
  a.status = approve ? 'approved' : 'rejected';
  a.decidedAt = Date.now();
  if (by) a.decidedBy = by;
  save(a);
  return { code: 200, body: describe(a) };
}

/** The card the UI draws: same shape as an Azure DevOps change set card, with kind "foundry". */
function describe(a) {
  const v = a.value && typeof a.value === 'object' ? a.value : {};
  const props = Array.isArray(v.proposals) ? v.proposals : [];
  const rows = props.flatMap((p) => {
    const target = [p.target_system, p.target_id].filter(Boolean).join(' · ') || p.id || 'Change';
    const fields = Object.entries(p.payload || {}).filter(([, x]) => x != null && typeof x !== 'object').slice(0, 4);
    const base = [{ target, field: humanOp(p.operation), after: p.rationale || '' }];
    return [...base, ...fields.map(([k, x]) => ({ target, field: k, after: String(x) }))];
  });
  const extra = !props.length ? Object.entries(v).filter(([k, x]) => !['type', 'agent', 'run_id', 'summary', 'reviewer_group', 'proposals'].includes(k) && x != null && typeof x !== 'object')
    .slice(0, 6).map(([k, x]) => ({ target: 'Details', field: k.replace(/_/g, ' '), after: String(x) })) : [];
  const status = a.status === 'approved' ? 'applied' : a.status === 'rejected' ? 'discarded' : a.status;
  return {
    id: a.id, kind: 'foundry', status, title: v.summary || 'The agent needs your decision to continue',
    project: a.agent, reason: v.reviewer_group ? `Reviewer group: ${v.reviewer_group}` : '', rows: [...rows, ...extra],
    createdAt: a.createdAt, expiresAt: a.expiresAt, decidedAt: a.decidedAt, decidedBy: a.decidedBy,
    result: a.status === 'approved' ? { message: 'Approved. The agent is continuing.', links: [] }
      : a.status === 'rejected' ? { message: 'Rejected. The agent stopped and nothing was changed.', links: [] } : null,
  };
}
const humanOp = (op) => ({ create: 'Create', update: 'Update', upsert: 'Create or update', link: 'Link', comment: 'Comment', upload: 'Upload', delete: 'Delete' }[op] || 'Change');

module.exports = { PREFIX, isFoundryId, stage, load, save, list, decide, describe, removeConversation };
