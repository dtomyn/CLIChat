const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lumen-switch-agent-'));
const workspace = path.join(temp, 'project');
fs.mkdirSync(workspace);
process.env.LUMEN_DATA = path.join(temp, 'data');
process.env.PORT = '0';
const registry = require('../providers');
const originalGet = registry.get;
const calls = [];
registry.get = (id) => id === 'fake' ? {
  id: 'fake', models: [], supportsResume: true,
  run: async (opts, emit) => { calls.push(opts); emit({ type: 'session', id: `s${calls.length}` }); emit({ type: 'text', text: `Reply ${calls.length}` }); },
} : originalGet(id);
const server = require('../server');
const store = require('../lib/store');
let base;
async function request(url, method = 'GET', body) {
  const res = await fetch(base + url, { method, headers: { Connection: 'close', 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, text, data: (() => { try { return JSON.parse(text); } catch { return null; } })() };
}
test.before(async () => {
  if (!server.listening) await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
  store.settings.set({ workspace, providerId: 'fake', access: 'chat' });
});
test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(temp, { recursive: true, force: true });
});

test('switching agents mid-chat forgets the engine session and replays the history', async () => {
  const other = store.assistants.all().find((a) => a.id !== 'lumen');
  assert.ok(other, 'a second agent exists');
  const first = await request('/api/chat', 'POST', { message: 'Hello there', assistantId: 'lumen', workspace });
  const convId = first.text.split('\n').filter(Boolean).map((l) => JSON.parse(l)).find((e) => e.type === 'conversation').conversation.id;
  assert.equal(store.conversations.get(convId).sessions.fake, 's1');

  assert.equal((await request(`/api/conversations/${convId}`, 'PATCH', { assistantId: 'no-such-agent' })).status, 400);
  const switched = await request(`/api/conversations/${convId}`, 'PATCH', { assistantId: other.id });
  assert.equal(switched.status, 200);
  const conv = store.conversations.get(convId);
  assert.equal(conv.assistantId, other.id);
  assert.deepEqual(conv.sessions, {});

  await request('/api/chat', 'POST', { conversationId: convId, message: 'Carry on' });
  const second = calls[1];
  assert.equal(second.sessionId || null, null);
  assert.match(second.prompt, /Hello there/);
  assert.match(second.prompt, /Reply 1/);
  assert.notEqual(second.systemPrompt, calls[0].systemPrompt);
});
