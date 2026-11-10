// End to end: the "ado" tool server's contract, and Lumen's approvals API through a real server with a fake AI engine.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const fx = require('./helpers/ado-fixture');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lumen-ado-'));
const workspace = path.join(temp, 'project');
fs.mkdirSync(workspace);
const LOG = path.join(temp, 'ado-requests.jsonl');
const MOCK = path.join(temp, 'ado-mock.json');
fs.writeFileSync(MOCK, JSON.stringify({ log: LOG, routes: fx.routes() }));
process.env.LUMEN_DATA = path.join(temp, 'data');
process.env.PORT = '0';
process.env.ADO_MOCK = MOCK;

const requests = () => (fs.existsSync(LOG) ? fs.readFileSync(LOG, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const writeRequests = () => requests().filter((x) => ['PATCH', 'PUT', 'DELETE'].includes(x.method) || (x.method === 'POST' && /workitems\/\$|\/comments/.test(x.url)));
const ADO_ENV = { ADO_ORG_URL: fx.ORG, ADO_PROJECT: fx.PROJECT, ADO_TEAM: 'Permit Renewal Team', ADO_AUTH: 'azcli', ADO_MOCK: MOCK, LUMEN_DATA: process.env.LUMEN_DATA };

/** Sends JSON-RPC lines to tools/ado-mcp.js and returns the responses by id. */
async function mcp(env, messages) {
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'tools', 'ado-mcp.js')], { env: { ...process.env, ...ADO_ENV, ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', (c) => { out += c; });
  child.stdin.end(messages.map((m, i) => JSON.stringify({ jsonrpc: '2.0', id: i + 1, ...m })).join('\n') + '\n');
  await once(child, 'exit');
  return Object.fromEntries(out.trim().split('\n').map((l) => JSON.parse(l)).map((r) => [r.id, r]));
}
const toolNames = (r) => r.result.tools.map((t) => t.name).sort();

test('tool server: read-only chats get read tools only; scheduled runs get no proposals', async () => {
  const ro = await mcp({ ADO_READONLY: '1' }, [{ method: 'tools/list' }]);
  assert.ok(toolNames(ro[1]).every((n) => !/propose|export/.test(n)));
  assert.equal(toolNames(ro[1]).length, 8);
  const sched = await mcp({ ADO_NO_PROPOSALS: '1' }, [{ method: 'tools/list' }]);
  assert.ok(toolNames(sched[1]).every((n) => !/propose/.test(n)));
  assert.ok(toolNames(sched[1]).includes('ado_export_backlog'));
  const edit = await mcp({}, [{ method: 'tools/list' }]);
  assert.equal(toolNames(edit[1]).length, 14);
  assert.ok(!toolNames(edit[1]).some((n) => /delete|remove/.test(n)), 'no delete tools (D7)');
});

test('tool server: proposals stage a change set and make zero writes', async () => {
  fs.rmSync(LOG, { force: true });
  const r = await mcp({ LUMEN_CONVERSATION_ID: 'conv-mcp' }, [
    { method: 'tools/call', params: { name: 'ado_get_work_items', arguments: { ids: [12] } } },
    { method: 'tools/call', params: { name: 'ado_propose_work_items', arguments: { items: [{ type: 'story', title: 'Pay by card', tags: ['FD-012'], parentId: 210 }] } } },
    { method: 'tools/call', params: { name: 'ado_propose_work_items', arguments: { items: [{ type: 'Rocket', title: 'x' }] } } },
  ]);
  assert.match(r[1].result.content[0].text, /#12 Pay the renewal fee/);
  const staged = r[2].result.content[0].text;
  assert.match(staged, /Proposed \(not applied yet\)/);
  const id = /"pending": "([0-9a-f-]+)"/.exec(staged)[1];
  assert.ok(fs.existsSync(path.join(process.env.LUMEN_DATA, 'ado-pending', 'conv-mcp', `${id}.json`)));
  assert.equal(r[3].result.isError, true);
  assert.match(r[3].result.content[0].text, /no work item type "Rocket"/);
  assert.ok(requests().length > 0);
  assert.deepEqual(writeRequests(), []);
  assert.ok(requests().every((x) => !/Bearer [^t]/.test(JSON.stringify(x.headers))), 'no real token in tests');
});

// ---------------------------------------------------------------- approvals API through the server
const registry = require('../providers');
const originalGet = registry.get;
const runs = [];
let stageNext = true;
registry.get = (id) => id === 'fake' ? {
  id: 'fake', models: [], supportsResume: false,
  run: async (opts, emit) => {
    runs.push(opts);
    const ado = opts.tools?.servers?.ado;
    if (stageNext && ado && opts.access === 'edit') {
      const cs = require('../tools/ado/changesets');
      const { fromSettings } = require('../tools/ado/connection');
      const c = fromSettings({ orgUrl: ado.env.ADO_ORG_URL, project: ado.env.ADO_PROJECT, team: ado.env.ADO_TEAM, auth: ado.env.ADO_AUTH });
      const out = await cs.proposeWorkItems(c, ado.env.LUMEN_CONVERSATION_ID, { reason: 'From FD-012', items: [{ type: 'story', title: 'Pay by card', tags: ['FD-012'], parentId: 210 }] });
      emit({ type: 'tool', id: 't1', icon: 'board', label: 'Preparing 1 new work item for your approval' });
      emit({ type: 'tool_done', id: 't1', ok: true });
      emit({ type: 'approval', id: /"pending": "([0-9a-f-]+)"/.exec(out)[1] });
      emit({ type: 'approval', id: '00000000-0000-0000-0000-000000000000' }); // unknown ids are ignored
    }
    emit({ type: 'text', text: 'Proposed. Waiting for you to click Apply.' });
  },
} : originalGet(id);
const server = require('../server');
const store = require('../lib/store');
let base;
async function request(url, method = 'GET', body) {
  const res = await fetch(base + url, { method, headers: { Connection: 'close', 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, data: text.trim().startsWith('{"type"') ? text.trim().split('\n').map((l) => JSON.parse(l)) : JSON.parse(text || 'null') };
}

test.before(async () => {
  if (!server.listening) await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
  store.settings.set({ workspace, providerId: 'fake', access: 'edit', userName: '', ado: { orgUrl: fx.ORG, project: fx.PROJECT, team: 'Permit Renewal Team', auth: 'azcli', wikis: [], enabled: true } });
});
test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  registry.get = originalGet;
  fs.rmSync(temp, { recursive: true, force: true });
});

test('connection settings: cloud addresses are normalised, on-premises refused, no secret returned', async () => {
  const put = await request('/api/connections/ado', 'PUT', { orgUrl: 'contoso.visualstudio.com', project: fx.PROJECT, team: 'Permit Renewal Team', auth: 'azcli', wikis: ['Permit-Renewal.wiki'] });
  assert.equal(put.status, 200);
  assert.equal(put.data.orgUrl, fx.ORG);
  assert.equal(put.data.hasPat, false);
  assert.equal((await request('/api/connections/ado', 'PUT', { orgUrl: 'https://tfs.local/tfs/Default' })).status, 400);
  const t = await request('/api/connections/ado/test', 'POST', { project: fx.PROJECT });
  assert.equal(t.data.ok, true);
  assert.equal(t.data.user, 'Dana Lee');
  assert.deepEqual(t.data.teams, ['Permit Renewal Team']);
  assert.equal(t.data.wikis.length, 2);
  assert.equal((await request('/api/connections/ado/test', 'POST', { orgUrl: 'nope' })).data.ok, false);
});

test('a proposal becomes an Approve card; only Apply writes, once, and the AI hears the outcome', async () => {
  fs.rmSync(LOG, { force: true });
  const chat = await request('/api/chat', 'POST', { message: 'Create the story for FD-012', assistantId: 'backlog-helper', access: 'edit', workspace });
  const conv = chat.data.find((e) => e.type === 'conversation').conversation.id;
  const approvals = chat.data.filter((e) => e.type === 'approval');
  assert.equal(approvals.length, 1, 'unknown change set ids are dropped');
  const id = approvals[0].id;
  const env = runs.at(-1).tools.servers.ado.env;
  assert.equal(env.ADO_READONLY, '0'); assert.equal(env.LUMEN_CONVERSATION_ID, conv);
  assert.ok(!Object.keys(env).some((k) => /PAT|TOKEN|SECRET/i.test(k)) && !/Bearer|Basic /.test(JSON.stringify(env)), 'no credentials on the command line');
  assert.ok(runs.at(-1).tools.allow.some((t) => t.tool === 'ado_propose_work_items'));
  assert.deepEqual(writeRequests(), []);

  const list = await request(`/api/chat/${conv}/approvals`);
  assert.equal(list.data[0].status, 'pending');
  assert.ok(list.data[0].rows.some((r) => r.field === 'Title' && r.after === 'Pay by card'));

  const noName = await request(`/api/chat/${conv}/approvals/${id}`, 'POST');
  assert.equal(noName.status, 400); assert.equal(noName.data.needName, true);
  assert.deepEqual(writeRequests(), []);

  store.settings.set({ userName: 'Dana Lee' });
  const applied = await request(`/api/chat/${conv}/approvals/${id}`, 'POST');
  assert.equal(applied.status, 200);
  assert.equal(applied.data.status, 'applied');
  assert.equal(applied.data.decidedBy, 'Dana Lee');
  assert.equal(applied.data.result.links[0].label, '#501 Pay by card');
  assert.equal(writeRequests().length, 1);
  assert.equal((await request(`/api/chat/${conv}/approvals/${id}`, 'POST')).status, 409, 'cannot apply twice');
  assert.equal(writeRequests().length, 1);

  const saved = (await request(`/api/conversations/${conv}`)).data;
  assert.deepEqual(saved.messages[1].approvals, [id]);
  assert.equal(saved.adoNotes.length, 1);
  const audit = fs.readFileSync(path.join(process.env.LUMEN_DATA, 'ado-audit.jsonl'), 'utf8');
  assert.match(audit, /"decidedBy":"Dana Lee".*"status":"applied"/);

  stageNext = false;
  await request('/api/chat', 'POST', { conversationId: conv, message: 'Thanks. What next?' });
  assert.match(runs.at(-1).prompt, /\[Lumen update: The proposed change "Create 1 work item in Permit Renewal" was applied: Created 1 work item\. \(#501 Pay by card https:/);
  assert.equal((await request(`/api/conversations/${conv}`)).data.adoNotes.length, 0);
  stageNext = true;
});

test('discard writes nothing; a changed connection blocks apply; read-only chats get no proposals', async () => {
  fs.rmSync(LOG, { force: true });
  const chat = await request('/api/chat', 'POST', { message: 'Another one', assistantId: 'backlog-helper', access: 'edit', workspace });
  const conv = chat.data.find((e) => e.type === 'conversation').conversation.id;
  const [a] = chat.data.filter((e) => e.type === 'approval');
  const d = await request(`/api/chat/${conv}/approvals/${a.id}`, 'DELETE');
  assert.equal(d.data.status, 'discarded');
  assert.deepEqual(writeRequests(), []);

  const chat2 = await request('/api/chat', 'POST', { conversationId: conv, message: 'And again' });
  const [b] = chat2.data.filter((e) => e.type === 'approval');
  store.settings.set({ ado: { ...store.settings.get().ado, project: 'Other' } });
  const blocked = await request(`/api/chat/${conv}/approvals/${b.id}`, 'POST');
  assert.equal(blocked.status, 409); assert.match(blocked.data.error, /proposed for project "Permit Renewal"/);
  store.settings.set({ ado: { ...store.settings.get().ado, project: fx.PROJECT } });
  const all = await request(`/api/chat/${conv}/approvals/apply-all`, 'POST', {});
  assert.equal(all.data[0].status, 'applied');

  await request('/api/chat', 'POST', { message: 'Read only please', assistantId: 'backlog-helper', access: 'read', workspace });
  const ro = runs.at(-1).tools;
  assert.equal(ro.servers.ado.env.ADO_READONLY, '1');
  assert.ok(!ro.allow.some((t) => /propose/.test(t.tool)));

  assert.equal((await request(`/api/conversations/${conv}`, 'DELETE')).status, 200);
  assert.equal(fs.existsSync(path.join(process.env.LUMEN_DATA, 'ado-pending', conv)), false);
});

test('an approved lifecycle stage hands off to Azure DevOps in an edit chat that ends in proposals', async () => {
  const dir = path.join(workspace, 'Lifecycle', 'Run A');
  fs.mkdirSync(dir, { recursive: true });
  const pipeline = store.pipelines.get('aidlc');
  const run = store.runs.save({ id: store.id(), pipelineId: 'aidlc', name: 'Run A', workspace, sources: [], createdAt: Date.now(),
    stages: pipeline.stages.map((s, i) => { const out = path.join(dir, s.output); fs.writeFileSync(out, `# ${s.name}`); return { id: s.id, status: i < 2 ? 'approved' : 'review', outputPath: out }; }) });
  assert.equal((await request(`/api/runs/${run.id}/stages/technical/azure-devops`, 'POST', { target: 'wiki' })).status, 409, 'not approved yet');
  stageNext = false;
  const before = runs.length;
  const r = await request(`/api/runs/${run.id}/stages/functional/azure-devops`, 'POST', { target: 'wiki' });
  assert.equal(r.status, 200);
  for (let i = 0; i < 200 && runs.length === before; i++) await new Promise((res) => setTimeout(res, 10));
  const turn = runs.at(-1);
  assert.match(turn.prompt, /Publish the approved functional design in "Lifecycle[\\/]+Run A[\\/]+02-functional-design\.md" to the Azure DevOps wiki/);
  assert.equal(turn.access, 'edit');
  assert.ok(turn.tools.allow.some((t) => t.tool === 'ado_propose_wiki_page'), 'the design assistant gets the Azure DevOps skill for this chat');
  const conv = (await request(`/api/conversations/${r.data.conversationId}`)).data;
  assert.equal(conv.assistantId, 'functional-designer');
  assert.deepEqual(conv.skills, ['azure-devops']);
  stageNext = true;
});

test('without a connection the Azure DevOps tools are left out and the AI is told why', async () => {
  const saved = store.settings.get().ado;
  store.settings.set({ ado: { enabled: false } });
  await request('/api/chat', 'POST', { message: 'Sprint status?', assistantId: 'backlog-helper', access: 'edit', workspace });
  assert.deepEqual(Object.keys(runs.at(-1).tools.servers), ['lumen'], 'only the always-on Lumen guide; no ado server');
  assert.match(runs.at(-1).systemPrompt, /Azure DevOps isn't connected yet/);
  store.settings.set({ ado: saved });
});
