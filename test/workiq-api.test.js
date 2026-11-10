const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lumen-workiq-api-'));
process.env.LUMEN_DATA = path.join(temp, 'data');
process.env.PORT = '0';
const registry = require('../providers');
const store = require('../lib/store');
const workiq = require('../lib/workiq');
let opened = 0, failOpen = false;
registry.providers['workiq-test'] = {
  id: 'workiq-test', name: 'Test engine', models: [], supportsResume: false,
  detect: async () => ({ available: true }),
  connectWorkiq: async ({ cwd }) => {
    assert.equal(cwd, path.join(store.DATA, 'workiq-connection'));
    if (failOpen) throw new Error('Window launch failed: Bearer fake-secret');
    opened++;
  },
  run: async (opts, emit) => {
    assert.equal(opts.tools.servers.m365.url, workiq.URL);
    emit({ type: 'connection', server: 'm365', status: 'connected', toolCount: 12 });
    emit({ type: 'text', text: 'Ready' });
  },
  complete: async () => 'WorkIQ test',
};
registry.providers['copilot-cli'] = {
  ...registry.providers['workiq-test'], id: 'copilot-cli',
  run: async (opts, emit) => {
    assert.equal(opts.tools.workiq, 'managed');
    assert.equal(opts.tools.servers.m365, undefined);
    assert.match(opts.systemPrompt, /existing managed "Work IQ" connector/);
    emit({ type: 'connection', server: 'm365', status: 'connected', toolCount: 7500 });
    emit({ type: 'text', text: 'Ready' });
  },
};
const server = require('../server');
let base;
async function request(url, method = 'GET', body, headers = {}) {
  const res = await fetch(base + url, { method, headers: { Connection: 'close', 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, data: res.status === 403 ? null : await res.json() };
}
test.before(async () => {
  if (!server.listening) await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
  store.settings.set({ workspace: temp, providerId: 'workiq-test', workiq: { enabled: true, tenantId: 'legacy.example' } });
});
test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(temp, { recursive: true, force: true });
});

test('WorkIQ API tolerates legacy settings without reporting a connection or returning tenant data', async () => {
  const r = await request('/api/connections/workiq');
  assert.equal(r.data.enabled, true);
  assert.equal(r.data.tenantId, undefined);
  assert.equal(r.data.connection.status, 'not-checked');
  assert.equal(opened, 0, 'GET does not launch a window or perform a network check');
  assert.equal((await request('/api/connections/workiq', 'PUT', { enabled: 'yes' })).status, 400);
  assert.equal((await request('/api/connections/workiq', 'PUT', { enabled: true })).status, 200);
  assert.deepEqual(store.settings.get().workiq, { enabled: true });
});

test('WorkIQ routes retain the cross-site request guard', async () => {
  assert.equal((await request('/api/connections/workiq/connect', 'POST', {}, { Origin: 'https://example.test' })).status, 403);
  assert.equal(opened, 0);
  assert.equal((await request('/api/connections/workiq/connect?providerId=missing', 'POST')).status, 400);
});

test('opening sign-in is pending, not connected, and launch errors remain visible', { skip: process.platform !== 'win32' }, async () => {
  const r = await request('/api/connections/workiq/connect', 'POST');
  assert.equal(r.status, 202);
  assert.equal(r.data.connection.status, 'sign-in-opened');
  assert.equal(opened, 1);
  failOpen = true;
  const failed = await request('/api/connections/workiq/connect', 'POST');
  failOpen = false;
  assert.equal(failed.status, 502);
  assert.match(failed.data.error, /Window launch failed/);
  assert.doesNotMatch(failed.data.error, /fake-secret/);
});

test('actual chat connection events update the selected engine only', async () => {
  const assistant = store.assistants.all()[0];
  assert.ok(!(assistant.skills || []).includes('microsoft-365'), 'agent has no manually selected Microsoft 365 skill');
  const res = await fetch(base + '/api/chat', { method: 'POST', headers: { Connection: 'close', 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'Read a document', assistantId: assistant.id, workspace: temp, access: 'read' }) });
  const text = await res.text();
  assert.doesNotMatch(text, /"type":"error"/);
  const r = await request('/api/connections/workiq');
  assert.equal(r.data.connection.status, 'connected');
  assert.equal(r.data.connection.toolCount, 12);
  const other = await request('/api/connections/workiq?providerId=claude-cli');
  assert.equal(other.data.connection.status, 'not-checked');
});

test('Copilot API opens the managed-connector dashboard without claiming document access', { skip: process.platform !== 'win32' }, async () => {
  const r = await request('/api/connections/workiq/connect?providerId=copilot-cli', 'POST');
  assert.equal(r.status, 202);
  assert.equal(r.data.integration, 'connector');
  assert.equal(r.data.connection.status, 'sign-in-opened');
  assert.match(r.data.connection.message, /Connectors view and select Work IQ/);
  assert.match(r.data.connection.message, /same workiqmcp service through GitHub/);
  assert.match(r.data.connection.message, /not added another Work IQ CLI sign-in/);
  const claude = await request('/api/connections/workiq?providerId=claude-cli');
  assert.equal(claude.data.integration, 'standalone');
});

test('Copilot chat receives managed connection intent, not standalone OAuth configuration', async () => {
  const assistant = store.assistants.all()[0];
  const res = await fetch(base + '/api/chat', { method: 'POST', headers: { Connection: 'close', 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'Read a document', providerId: 'copilot-cli', assistantId: assistant.id, workspace: temp, access: 'read' }) });
  assert.doesNotMatch(await res.text(), /"type":"error"/);
  const r = await request('/api/connections/workiq?providerId=copilot-cli');
  assert.equal(r.data.connection.status, 'connected');
  assert.equal(r.data.connection.toolCount, 7500);
});

test('connection switch supplies Microsoft 365 to existing chats and agents without stored skills', async () => {
  const assistant = { id: 'no-skills', name: 'No skills', skills: [] };
  store.assistants.upsert(assistant);
  const conv = store.conversations.create({ assistantId: assistant.id, workspace: temp, access: 'read' });
  const original = registry.providers['copilot-cli'].run;
  const captured = [];
  registry.providers['copilot-cli'].run = async (opts, emit) => {
    captured.push(opts);
    emit({ type: 'text', text: 'Ready' });
  };
  const turn = async () => {
    const res = await fetch(base + '/api/chat', {
      method: 'POST', headers: { Connection: 'close', 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId: conv.id, providerId: 'copilot-cli', message: 'Find my latest SharePoint document' }),
    });
    assert.doesNotMatch(await res.text(), /"type":"error"/);
    return captured.at(-1);
  };
  try {
    store.settings.set({ workiq: { enabled: false } });
    assert.equal((await turn()).tools?.workiq, undefined);
    await request('/api/connections/workiq', 'PUT', { enabled: true });
    const enabled = await turn();
    assert.equal(enabled.tools.workiq, 'managed');
    assert.match(enabled.systemPrompt, /## Skill: SharePoint & Microsoft 365/);
    assert.equal((enabled.systemPrompt.match(/## Skill: SharePoint & Microsoft 365/g) || []).length, 1);
    assert.deepEqual(store.assistants.get(assistant.id).skills, [], 'no agent migration required');
    assert.ok(!(store.conversations.get(conv.id).skills || []).includes('microsoft-365'));

    const saved = store.conversations.get(conv.id);
    saved.access = 'chat';
    store.conversations.save(saved);
    assert.equal((await turn()).tools?.workiq, undefined, 'Just chat still excludes tools');
    saved.access = 'read';
    saved.scheduled = true;
    store.conversations.save(saved);
    const scheduled = await turn();
    assert.equal(scheduled.tools?.workiq, undefined, 'scheduled turns still exclude tools');
    assert.doesNotMatch(scheduled.systemPrompt, /## Skill: SharePoint & Microsoft 365/);

    saved.scheduled = false;
    store.conversations.save(saved);
    await request('/api/connections/workiq', 'PUT', { enabled: false });
    assert.equal((await turn()).tools?.workiq, undefined, 'switching off removes access on the next turn');
  } finally {
    registry.providers['copilot-cli'].run = original;
    store.settings.set({ workiq: { enabled: true } });
  }
});
