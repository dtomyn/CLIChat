// Microsoft Foundry engine for the IRCC agents: payload building, reply rendering, approval pauses and the provider turn.
// Uses a stand-in fetch and sign-in, so nothing reaches Azure.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'lumen-foundry-'));
process.env.LUMEN_DATA = path.join(TMP, 'data');
process.env.LUMEN_FOUNDRY_ENDPOINT = 'https://acct.services.ai.azure.com/api/projects/proj';

const { buildPayload } = require('../lib/foundry/inputs');
const { renderReply, splitReply } = require('../lib/foundry/render');
const client = require('../lib/foundry/client');
const auth = require('../lib/foundry/auth');
const approvals = require('../lib/foundry/approvals');
const provider = require('../providers/foundry-agents');

auth._setTokenSource(async () => ({ token: 'test-token', expiresAt: Date.now() + 3600_000 }));

const file = (name, content) => { const p = path.join(TMP, name); fs.writeFileSync(p, content); return p; };
const finalize = (result, summary = 'Done.') => `${summary}\n\n\`\`\`json\n${JSON.stringify(result, null, 1)}\n\`\`\``;

function fakeFetch(handler) {
  const calls = [];
  client._setFetch(async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, body, auth: init.headers.Authorization });
    const { status = 200, json, headers = {} } = await handler(url, body, calls.length);
    return { status, text: async () => JSON.stringify(json), headers: { get: (k) => headers[k.toLowerCase()] || null } };
  });
  return calls;
}
const responseWith = (text, extra = []) => ({ id: `caresp_${Math.random().toString(36).slice(2, 8)}`, status: 'completed',
  output: [...(text ? [{ type: 'message', content: [{ type: 'output_text', text }] }] : []), ...extra] });
const run = async (args) => { const events = []; await provider.run({ conversationId: 'conv1', ...args }, (e) => events.push(e)); return events; };

const BRR = { name: 'Requirements Refinement (IRCC)', foundry: { agent: 'ircc-business-requirements-refinement', protocol: 'responses',
  inputs: [{ match: '\\.(docx|md|pdf|txt)$', as: 'b64', field: 'document_b64', nameField: 'filename' }] } };

// ------------------------------------------------------------------ payloads
test('buildPayload maps attachments by rule and keeps the typed text', () => {
  const brd = file('Intake BRD.md', '# 1 Intro\nThe system shall work.');
  const other = file('notes.xlsx', 'x');
  const { payload, used, unused } = buildPayload(BRR.foundry, 'Refine this BRD', [brd, other]);
  assert.equal(payload.message, 'Refine this BRD');
  assert.equal(Buffer.from(payload.document_b64, 'base64').toString(), '# 1 Intro\nThe system shall work.');
  assert.equal(payload.filename, 'Intake BRD.md');
  assert.deepEqual(used, [brd]);
  assert.deepEqual(unused, [other]);
});

test('buildPayload supports nested objects, lists, JSON files and typed JSON', () => {
  const plan = file('plan.xml', '<Project/>');
  const a = file('a.yaml', 'openapi: 3.0.0');
  const b = file('b.yaml', 'openapi: 3.0.1');
  const reqs = file('reqs.json', '{"requirements":[1]}');
  const cfg = { defaults: { mode: 'draft' }, inputs: [
    { match: '\\.xml$', as: 'object', path: 'current' },
    { match: '\\.ya?ml$', as: 'list', field: 'contracts', extra: { kind: 'openapi' } },
    { match: '\\.json$', as: 'json', field: 'requirement_set' }] };
  const { payload } = buildPayload(cfg, '{"plan_key":"R2","mode":"report_only"}', [plan, a, b, reqs]);
  assert.equal(payload.mode, 'report_only'); // typed JSON wins over defaults
  assert.equal(payload.plan_key, 'R2');
  assert.equal(payload.message, undefined);
  assert.deepEqual(Object.keys(payload.current).sort(), ['b64', 'filename']);
  assert.equal(payload.contracts.length, 2);
  assert.equal(payload.contracts[0].kind, 'openapi');
  assert.ok(payload.contracts[1].content_b64);
  assert.deepEqual(payload.requirement_set, { requirements: [1] });
});

// ------------------------------------------------------------------ rendering
test('renderReply shows the summary, counts, tables, safety checks and the full result', () => {
  const md = renderReply(finalize({
    status: 'ok', counts: { functional: 2, gaps: 1 },
    guardrail_findings: [{ title: 'Section 3.2 blocked by content filter' }],
    requirement_set: { requirements: [{ id: 'INTAKE-FR-001', statement: 'Submit | online', priority: 'must' }, { id: 'INTAKE-FR-002', statement: 'Email', priority: 'unspecified' }] },
  }, 'Extracted 2 requirements.'));
  assert.match(md, /^Extracted 2 requirements\./);
  assert.match(md, /Functional \*\*2\*\*/);
  assert.match(md, /Safety checks flagged 1 item/);
  assert.match(md, /Requirement set · Requirements \(2\)/);
  assert.match(md, /Submit \\\| online/); // pipes escaped inside table cells
  assert.match(md, /<details><summary>Full result from the agent<\/summary>/);
});

test('splitReply keeps results whose strings contain code fences (mermaid)', () => {
  const { result } = splitReply(finalize({ status: 'ok', md: '```mermaid\nflowchart LR\n```' }));
  assert.equal(result.md, '```mermaid\nflowchart LR\n```');
});

test('renderReply lists errors for a graceful refusal', () => {
  const md = renderReply(finalize({ status: 'error', errors: ['Please attach the BRD.'] }, "I couldn't complete this request."));
  assert.match(md, /- Please attach the BRD\./);
});

// ------------------------------------------------------------------ client
test('endpoint validation and agent URLs', () => {
  assert.equal(client.validEndpoint('https://acct.services.ai.azure.com/api/projects/proj'), true);
  assert.equal(client.validEndpoint('http://acct.services.ai.azure.com/api/projects/proj'), false);
  assert.equal(client.validEndpoint('https://evil.example.com/api/projects/proj'), false);
  assert.equal(client.agentUrl('https://a.services.ai.azure.com/api/projects/p/', 'ircc-x', 'responses'),
    'https://a.services.ai.azure.com/api/projects/p/agents/ircc-x/endpoint/protocols/openai/responses?api-version=v1');
  assert.match(client.agentUrl('https://a.services.ai.azure.com/api/projects/p', 'ircc-y', 'invocations'), /protocols\/invocations\?api-version=v1$/);
});

// ------------------------------------------------------------------ provider turns
test('a turn sends the payload, renders the reply and remembers the response for follow-ups', async () => {
  const brd = file('Intake_BRD.md', '# 2.1 Submit\nThe applicant must be able to submit online.');
  const calls = fakeFetch(() => ({ json: responseWith(finalize({ status: 'ok', counts: { functional: 1 } }, 'Extracted 1 requirement.')) }));
  const events = await run({ assistant: BRR, message: 'Refine it', attachments: [brd], sessionId: null });
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /agents\/ircc-business-requirements-refinement\/endpoint\/protocols\/openai\/responses/);
  assert.equal(calls[0].auth, 'Bearer test-token');
  const sent = JSON.parse(calls[0].body.input);
  assert.equal(sent.filename, 'Intake_BRD.md');
  assert.equal(calls[0].body.previous_response_id, undefined);
  assert.ok(events.find((e) => e.type === 'session' && /^caresp_/.test(e.id)));
  assert.match(events.filter((e) => e.type === 'text').map((e) => e.text).join(''), /Extracted 1 requirement/);
  assert.deepEqual(events.filter((e) => e.type.startsWith('tool')).map((e) => e.type), ['tool', 'tool_done']);

  const calls2 = fakeFetch(() => ({ json: responseWith(finalize({ status: 'ok' })) }));
  await run({ assistant: BRR, message: 'merge FR-001 and FR-002', attachments: [], sessionId: 'caresp_prev' });
  assert.equal(calls2[0].body.previous_response_id, 'caresp_prev');
  assert.equal(JSON.parse(calls2[0].body.input).message, 'merge FR-001 and FR-002');
});

test('an approval pause becomes an Approve card, and the decision resumes the agent', async () => {
  const pause = { type: 'mcp_approval_request', id: 'mcpr_1', server_label: 'langgraph', name: '__hosted_agent_adapter_interrupt__',
    arguments: JSON.stringify({ interrupt_id: 'i1', value: { type: 'ircc_approval_request', summary: 'Confirm integration pattern for IF-001', reviewer_group: 'arch',
      proposals: [{ id: 'p1', target_system: 'sharepoint.file', operation: 'upload', rationale: 'Publish ICD', payload: { library: 'ICDs' } }] } }) };
  fakeFetch(() => ({ json: { ...responseWith('', [pause]), id: 'caresp_paused' } }));
  const events = await run({ assistant: BRR, message: 'Draft the ICD', attachments: [] });
  const ap = events.find((e) => e.type === 'approval');
  assert.ok(ap && approvals.isFoundryId(ap.id));
  const card = approvals.describe(approvals.load('conv1', ap.id));
  assert.equal(card.kind, 'foundry');
  assert.equal(card.status, 'pending');
  assert.equal(card.title, 'Confirm integration pattern for IF-001');
  assert.ok(card.rows.some((r) => r.field === 'Upload' && r.after === 'Publish ICD'));
  assert.match(events.filter((e) => e.type === 'text').map((e) => e.text).join(''), /paused for your decision/);

  assert.equal(approvals.decide('conv1', ap.id, true, 'Dana').body.status, 'applied');
  assert.equal(approvals.decide('conv1', ap.id, false).code, 409); // already decided
  const calls = fakeFetch(() => ({ json: responseWith(finalize({ status: 'ok' }, 'ICD draft ready.')) }));
  const resumed = await run({ assistant: BRR, message: 'Approved', attachments: [], approval: { id: ap.id, approve: true } });
  assert.equal(calls[0].body.previous_response_id, 'caresp_paused');
  assert.deepEqual(calls[0].body.input, [{ type: 'mcp_approval_response', approval_request_id: 'mcpr_1', approve: true }]);
  assert.match(resumed.filter((e) => e.type === 'text').map((e) => e.text).join(''), /ICD draft ready/);
});

test('a rejected pause reports that nothing changed', async () => {
  fakeFetch(() => ({ json: { ...responseWith('', [{ type: 'mcp_approval_request', id: 'mcpr_2', arguments: '{"value":{"summary":"Publish?"}}' }]), id: 'caresp_p2' } }));
  const ap = (await run({ assistant: BRR, message: 'x', attachments: [] })).find((e) => e.type === 'approval');
  approvals.decide('conv1', ap.id, false);
  fakeFetch(() => ({ status: 400, json: { error: { message: 'interrupt_rejected' } } }));
  const events = await run({ assistant: BRR, message: 'Rejected', attachments: [], approval: { id: ap.id, approve: false } });
  assert.match(events.find((e) => e.type === 'text').text, /nothing was changed/);
});

test('failures and misuse produce plain-language errors', async () => {
  fakeFetch(() => ({ json: { id: 'r', status: 'failed', error: { code: 'server_error', message: 'An internal error occurred.' } } }));
  let events = await run({ assistant: BRR, message: 'x', attachments: [] });
  assert.match(events.find((e) => e.type === 'error').message, /ran into a problem/);

  fakeFetch(() => ({ status: 403, json: { error: { message: 'Forbidden' } } }));
  events = await run({ assistant: BRR, message: 'x', attachments: [] });
  assert.match(events.find((e) => e.type === 'error').message, /Foundry Agent Consumer/);

  events = await run({ assistant: { name: 'Lumen' }, message: 'x', attachments: [] });
  assert.match(events.find((e) => e.type === 'error').message, /Pick one of the IRCC agents/);
});

test('invocations agents are called with message and keep their agent session', async () => {
  const inv = { name: 'ADO to Plan', foundry: { agent: 'ircc-ado-to-plan-progress', protocol: 'invocations', inputs: [] } };
  const calls = fakeFetch(() => ({ json: { response: finalize({ status: 'ok' }, 'Reconciled.') }, headers: { 'x-agent-session-id': 'sess-9' } }));
  const events = await run({ assistant: inv, message: 'Reconcile', attachments: [], sessionId: 'sess-1' });
  assert.match(calls[0].url, /protocols\/invocations\?api-version=v1&agent_session_id=sess-1$/);
  assert.equal(JSON.parse(calls[0].body.message).message, 'Reconcile');
  assert.ok(events.find((e) => e.type === 'session' && e.id === 'sess-9'));
});

test('detect asks for the project address when it is missing', async () => {
  const saved = process.env.LUMEN_FOUNDRY_ENDPOINT;
  process.env.LUMEN_FOUNDRY_ENDPOINT = '';
  try { assert.match((await provider.detect()).message, /project address in Settings/); }
  finally { process.env.LUMEN_FOUNDRY_ENDPOINT = saved; }
});

test.after(() => fs.rmSync(TMP, { recursive: true, force: true }));

test('tables keep the agent order and drop empty columns', () => {
  const md = renderReply(finalize({ status: 'ok', requirement_set: {
    requirements: [{ id: 'R-1', statement: 'A' }],
    gaps: [{ id: null, title: 'Gap: security' }, { id: null, title: 'Gap: privacy' }] } }));
  assert.ok(md.indexOf('Requirements (1)') < md.indexOf('Gaps (2)'));
  const gapTable = md.slice(md.indexOf('Gaps (2)'));
  assert.doesNotMatch(gapTable.split('\n').find((l) => l.startsWith('| ')), /\| Id \|/);
});
