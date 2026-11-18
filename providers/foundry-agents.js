// Microsoft Foundry engine: runs Contoso agents that are hosted in a Foundry project (LangGraph hosted agents).
// Unlike the CLI engines it is chosen automatically for agents whose file has a `foundry` section, and it is hidden from
// the engine picker (agentOnly). Each turn calls the agent's Responses (or Invocations) endpoint; conversation memory is
// the agent's previous response id, kept as this chat's session. Approval pauses become Approve cards
// (lib/foundry/approvals.js) and the decision is sent back on the next turn.
const path = require('path');
const auth = require('../lib/foundry/auth');
const client = require('../lib/foundry/client');
const { buildPayload } = require('../lib/foundry/inputs');
const { renderReply } = require('../lib/foundry/render');
const approvals = require('../lib/foundry/approvals');

function endpoint() {
  let s = {};
  try { s = require('../lib/store').settings.get() || {}; } catch { /* store unavailable in some tests */ }
  return process.env.LUMEN_FOUNDRY_ENDPOINT || s.foundry?.endpoint || '';
}

function outputText(data) {
  if (!data) return '';
  if (typeof data.output_text === 'string' && data.output_text) return data.output_text;
  if (typeof data.response === 'string') return data.response; // invocations
  return (data.output || []).flatMap((it) => (it.type === 'message' ? (it.content || []) : []))
    .map((c) => (typeof c === 'string' ? c : c.text || '')).join('');
}

const pauses = (data) => (data?.output || []).filter((it) => it.type === 'mcp_approval_request');

function pauseValue(item) {
  try { const a = JSON.parse(item.arguments || '{}'); return a.value ?? a; } catch { return null; }
}

module.exports = {
  id: 'foundry',
  name: 'Microsoft Foundry',
  vendor: 'Microsoft',
  description: 'Runs the Contoso agents hosted in your Microsoft Foundry project',
  models: [{ id: 'default', label: 'Agent default', hint: 'Each Contoso agent uses the model set for it in Foundry' }],
  supportsResume: true,
  agentOnly: true,

  async detect() {
    if (!endpoint()) return { available: false, message: 'Add your Microsoft Foundry project address in Settings to use the Contoso agents.' };
    if (!client.validEndpoint(endpoint())) return { available: false, message: 'The Microsoft Foundry project address in Settings doesn\'t look right.' };
    return auth.detect();
  },

  async run({ sessionId, signal, assistant, message, attachments = [], conversationId, approval }, emit) {
    const cfg = assistant?.foundry;
    if (!cfg?.agent) { emit({ type: 'error', message: 'Pick one of the Contoso agents to use Microsoft Foundry.' }); return; }
    const ep = endpoint();
    if (!client.validEndpoint(ep)) { emit({ type: 'error', message: 'Add your Microsoft Foundry project address in Settings first.' }); return; }
    const protocol = cfg.protocol === 'invocations' ? 'invocations' : 'responses';

    let body;
    let note = '';
    if (approval?.id) {
      const a = approvals.load(conversationId, approval.id);
      if (!a) { emit({ type: 'error', message: 'That approval request could not be found.' }); return; }
      if (protocol !== 'responses') { emit({ type: 'error', message: 'This agent can\'t be resumed from Lumen yet. Use the Foundry portal to approve it.' }); return; }
      body = { previous_response_id: a.responseId, stream: false,
        input: [{ type: 'mcp_approval_response', approval_request_id: a.requestId, approve: !!approval.approve }] };
    } else {
      let built;
      try { built = buildPayload(cfg, message, attachments); } catch (e) { emit({ type: 'error', message: e.message }); return; }
      if (built.unused.length) note = `_Not sent to the agent (it doesn't use these files): ${built.unused.map((f) => `"${path.basename(f)}"`).join(', ')}._\n\n`;
      const input = JSON.stringify(built.payload);
      body = protocol === 'responses'
        ? { input, stream: false, ...(sessionId ? { previous_response_id: sessionId } : {}) }
        : { message: input, stream: false };
    }

    let url = client.agentUrl(ep, cfg.agent, protocol);
    if (protocol === 'invocations' && sessionId) url += `&agent_session_id=${encodeURIComponent(sessionId)}`;
    const started = Date.now();
    emit({ type: 'tool', id: 'foundry', icon: 'spark', label: `${assistant.name || 'The agent'} is working in Microsoft Foundry` });
    let r;
    try { r = await client.post(url, body, { signal }); }
    catch (e) { emit({ type: 'tool_done', id: 'foundry', ok: false }); if (!e.stopped) emit({ type: 'error', message: e.message }); return; }

    const data = r.data;
    const failed = r.status >= 400 || data?.status === 'failed' || (protocol === 'invocations' && data?.error);
    emit({ type: 'tool_done', id: 'foundry', ok: !failed });
    if (failed) {
      if (approval?.id && !approval.approve && r.status < 500) { emit({ type: 'text', text: 'Rejected. The agent stopped and nothing was changed.' }); return; }
      emit({ type: 'error', message: client.friendlyError(r.status, data) });
      return;
    }
    if (protocol === 'responses' && data?.id) emit({ type: 'session', id: data.id });
    if (protocol === 'invocations' && r.sessionId) emit({ type: 'session', id: r.sessionId });

    const text = outputText(data);
    if (note) emit({ type: 'text', text: note });
    if (text) emit({ type: 'text', text: renderReply(text) });
    for (const item of pauses(data)) {
      const staged = approvals.stage(conversationId, { agent: cfg.agent, responseId: data.id, requestId: item.id, value: pauseValue(item) });
      if (!text) emit({ type: 'text', text: `**The agent paused for your decision.** ${staged.value?.summary || ''}\n\nReview the card below and approve or reject it.` });
      emit({ type: 'approval', id: staged.id });
    }
    if (!text && !pauses(data).length) emit({ type: 'text', text: 'The agent finished but didn\'t send a reply.' });
    emit({ type: 'usage', durationMs: Date.now() - started });
  },

  // Small helper calls (chat titles) aren't available from hosted agents; Lumen falls back to the first words.
  async complete() { return ''; },
};
