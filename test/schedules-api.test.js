const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lumen-schedules-api-'));
const workspace = path.join(temp, 'project');
fs.mkdirSync(workspace);
process.env.LUMEN_DATA = path.join(temp, 'data');
process.env.PORT = '0';
const registry = require('../providers');
const originalGet = registry.get;
const calls = [];
registry.get = (id) => id === 'fake' ? {
  id: 'fake', models: [], supportsResume: false,
  run: async (opts, emit) => { calls.push(opts); emit({ type: 'text', text: 'Ready' }); },
} : originalGet(id);
const server = require('../server');
const store = require('../lib/store');
let base;
async function request(url, method = 'GET', body) {
  const res = await fetch(base + url, { method, headers: { Connection: 'close', 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, data: await res.json() };
}
async function finished(id) {
  for (let i = 0; i < 200; i++) {
    const s = (await request('/api/schedules')).data.find((x) => x.id === id);
    if (s && !s.running && s.lastStatus && s.lastStatus !== 'running') return s;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('Timed out waiting for scheduled run');
}
test.before(async () => {
  if (!server.listening) await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
  store.settings.set({ workspace, providerId: 'fake', access: 'edit' });
});
test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(temp, { recursive: true, force: true });
});

test('schedule API enforces permissions and runs paused checks without elevating access', async () => {
  const file = path.join(workspace, 'plan.xml'); fs.writeFileSync(file, 'plan');
  const recipe = store.recipes.upsert({ name: 'Test check', assistantId: 'lumen', access: 'read', fields: [{ key: 'plan', label: 'Plan', type: 'file' }], template: 'Check {{plan}}' });
  const body = { recipeId: recipe.id, values: { plan: file }, workspace, when: { kind: 'daily', time: '09:00' }, allowEdit: false, enabled: false };
  assert.equal((await request('/api/schedules', 'POST', { ...body, when: { kind: 'weekly', time: '99:00', days: [] } })).status, 400);
  const created = await request('/api/schedules', 'POST', body);
  assert.equal(created.status, 200);
  const id = created.data.id;
  assert.equal((await request(`/api/schedules/${id}/run-now`, 'POST')).status, 202);
  let result = await finished(id);
  assert.equal(result.lastStatus, 'ok'); assert.equal(calls[0].access, 'read');
  assert.equal((await request('/api/conversations')).data.find((c) => c.id === result.lastConversationId).unread, true);
  await request(`/api/conversations/${result.lastConversationId}`, 'PATCH', { unread: false });
  assert.equal((await request('/api/conversations')).data.find((c) => c.id === result.lastConversationId).unread, false);
  fs.unlinkSync(file);
  await request(`/api/schedules/${id}/run-now`, 'POST');
  result = await finished(id);
  assert.equal(result.lastStatus, 'error'); assert.match(result.lastError, /missing/); assert.equal(calls.length, 1);
  store.recipes.upsert({ id: recipe.id, access: 'edit' });
  assert.equal((await request('/api/schedules', 'POST', body)).status, 400);
  const permitted = await request('/api/schedules', 'POST', { ...body, allowEdit: true });
  assert.equal(permitted.status, 200);
  fs.writeFileSync(file, 'plan');
  await request(`/api/schedules/${permitted.data.id}/run-now`, 'POST');
  assert.equal((await finished(permitted.data.id)).lastStatus, 'ok');
  assert.equal(calls.at(-1).access, 'edit');
  assert.equal((await request(`/api/schedules/${id}`, 'PUT', { enabled: true })).status, 200);
  assert.equal((await request(`/api/schedules/${id}`, 'DELETE')).status, 200);
});
