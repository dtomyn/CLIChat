const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lumen-test-'));
const workspace = path.join(temp, 'workspace');
fs.mkdirSync(workspace);
process.env.LUMEN_DATA = path.join(temp, 'data');
process.env.PORT = '0';
const registry = require('../providers');
const calls = [];
const fake = {
  id: 'fake', models: [], supportsResume: false,
  complete: async () => 'Test chat',
  run: async (opts, emit) => {
    calls.push(opts);
    const output = /Save your final output as a Markdown file at ("(?:[^"\\]|\\.)*")/.exec(opts.prompt);
    if (output) {
      const file = path.resolve(opts.cwd, JSON.parse(output[1]));
      fs.writeFileSync(file, '# Test output\n');
      emit({ type: 'file', path: file });
    }
    emit({ type: 'text', text: opts.access === 'read' ? 'Traceability findings' : 'Done' });
  },
};
const originalGet = registry.get;
registry.get = (id) => id === 'fake' ? fake : originalGet(id);
const server = require('../server');
const store = require('../lib/store');
const excel = require('../tools/excel');
let base;

async function request(url, method = 'GET', body) {
  const res = await fetch(base + url, { method, headers: { Connection: 'close', ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  return { status: res.status, data: res.headers.get('content-type')?.includes('ndjson') ? text.split('\n').filter(Boolean).map(JSON.parse) : JSON.parse(text) };
}
async function runState(id, predicate) {
  for (let i = 0; i < 100; i++) {
    const { data } = await request(`/api/runs/${id}`);
    if (predicate(data)) return data;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Timed out waiting for run');
}

test.before(async () => {
  if (!server.listening) await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
  store.settings.set({ workspace, providerId: 'fake', userName: 'Reviewer' });
});
test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(temp, { recursive: true, force: true });
});

test('pinned context persists, activates skills and ignores removed and outside files', async () => {
  const book = path.join(workspace, 'source.xlsx'), outside = path.join(temp, 'outside.xlsx');
  fs.writeFileSync(book, 'test'); fs.writeFileSync(outside, 'test');
  const first = await request('/api/chat', 'POST', { message: 'Hello', access: 'chat', workspace, pinned_files: [book, outside] });
  const id = first.data.find((e) => e.type === 'conversation').conversation.id;
  assert.match(calls.at(-1).systemPrompt, /source\.xlsx/);
  assert.doesNotMatch(calls.at(-1).systemPrompt, /outside\.xlsx/);
  assert.equal(calls.at(-1).access, 'read');
  assert.ok(calls.at(-1).tools.allow.some((t) => t.tool === 'read_spreadsheet'));
  const saved = await request(`/api/conversations/${id}`);
  assert.deepEqual(saved.data.pinned_files, [book, outside]);
  await request(`/api/conversations/${id}`, 'PATCH', { pinned_files: [] });
  await request('/api/chat', 'POST', { conversationId: id, message: 'Again' });
  assert.doesNotMatch(calls.at(-1).systemPrompt, /Key files for this chat/);
  await request(`/api/conversations/${id}`, 'PATCH', { pinned_files: [book] });
  fs.unlinkSync(book);
  await request('/api/chat', 'POST', { conversationId: id, message: 'After deletion' });
  assert.doesNotMatch(calls.at(-1).systemPrompt, /Key files for this chat/);
  const status = await request('/api/file-status', 'POST', { workspace, paths: [book, outside] });
  assert.deepEqual(status.data.exists, [false, false]);
});

test('workbook diff covers cells, caps results and snapshots in-place edits', async () => {
  const a = path.join(workspace, 'before.xlsx'), b = path.join(workspace, 'after.xlsx');
  await excel.write(a, [{ name: 'Data', columns: ['Value'], rows: Array.from({ length: 510 }, (_, i) => [i]) }], { recalculate: false });
  await excel.write(b, [{ name: 'Data', columns: ['Value'], rows: Array.from({ length: 510 }, (_, i) => [i + 1]) }], { recalculate: false });
  const diff = await request(`/api/diff?workspace=${encodeURIComponent(workspace)}&a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`);
  assert.equal(diff.status, 200); assert.equal(diff.data.changes.length, 500);
  assert.deepEqual(diff.data.changes[0], { sheet: 'Data', cell: 'A2', before: '0', after: '1' });
  process.env.OFFICE_MCP_ROOT = workspace;
  process.env.LUMEN_SNAPSHOT_DIR = path.join(workspace, '.lumen', 'snapshots', 'test-message');
  await excel.update(a, { updates: [{ sheet: 'Data', cell: 'A2', value: 99 }] });
  await excel.update(a, { updates: [{ sheet: 'Data', cell: 'A2', value: 100 }] });
  delete process.env.OFFICE_MCP_ROOT; delete process.env.LUMEN_SNAPSHOT_DIR;
  const pair = await request(`/api/file-pair?workspace=${encodeURIComponent(workspace)}&file=${encodeURIComponent(a)}&message=test-message`);
  const changes = await request(`/api/diff?workspace=${encodeURIComponent(workspace)}&a=${encodeURIComponent(pair.data.pair)}&b=${encodeURIComponent(a)}`);
  assert.deepEqual(changes.data.changes[0], { sheet: 'Data', cell: 'A2', before: '0', after: '100' });
  const exactA = path.join(workspace, 'exact-a.xlsx'), exactB = path.join(workspace, 'exact-b.xlsx');
  await excel.write(exactA, [{ name: 'Data', columns: ['Value'], rows: [[0.00001]] }], { recalculate: false });
  await excel.write(exactB, [{ name: 'Data', columns: ['Value'], rows: [[0.00002]] }], { recalculate: false });
  const exact = await request(`/api/diff?workspace=${encodeURIComponent(workspace)}&a=${encodeURIComponent(exactA)}&b=${encodeURIComponent(exactB)}`);
  assert.deepEqual(exact.data.changes[0], { sheet: 'Data', cell: 'A2', before: '0.00001', after: '0.00002' });
  const outsideSnapshots = path.join(temp, 'outside-snapshots'), link = path.join(workspace, 'snapshot-link');
  fs.mkdirSync(outsideSnapshots); fs.symlinkSync(outsideSnapshots, link, 'junction');
  process.env.OFFICE_MCP_ROOT = workspace; process.env.LUMEN_SNAPSHOT_DIR = path.join(link, 'reply');
  await assert.rejects(excel.update(exactA, { updates: [{ sheet: 'Data', cell: 'A2', value: 2 }] }), /Snapshot folder must stay inside/);
  delete process.env.OFFICE_MCP_ROOT; delete process.env.LUMEN_SNAPSHOT_DIR;
  assert.deepEqual(fs.readdirSync(outsideSnapshots), []);
  const invalid = await request(`/api/diff?workspace=${encodeURIComponent(workspace)}&a=${encodeURIComponent(path.join(temp, 'outside.xlsx'))}&b=${encodeURIComponent(a)}`);
  assert.equal(invalid.status, 400);
  const projectA = path.join(workspace, 'plan.xml'), projectB = path.join(workspace, 'plan (updated).xml');
  fs.copyFileSync(path.join(__dirname, '..', 'demo', 'Contoso CRM Migration.xml'), projectA);
  fs.copyFileSync(path.join(__dirname, '..', 'film', 'recordings', 'artifacts', 'b5b8917039076e09-Contoso CRM Migration (updated).xml'), projectB);
  const xmlDiff = await request(`/api/diff?workspace=${encodeURIComponent(workspace)}&a=${encodeURIComponent(projectA)}&b=${encodeURIComponent(projectB)}`);
  assert.equal(xmlDiff.status, 200);
  assert.ok(xmlDiff.data.changes.length > 0);
});

test('lifecycle gates, checks, override, rework and persisted approvals', async () => {
  const source = path.join(workspace, 'requirements.md'); fs.writeFileSync(source, '# Requirements');
  const created = await request('/api/runs', 'POST', { pipelineId: 'aidlc', name: 'Test run', workspace, sources: [source] });
  assert.equal(created.status, 200);
  const id = created.data.id;
  const action = (stage, operation, body = {}) => request(`/api/runs/${id}/stages/${stage}/${operation}`, 'POST', body);
  assert.equal((await action('functional', 'start')).status, 409);
  await action('refine', 'start');
  let run = await runState(id, (r) => r.stages[0].status === 'review');
  assert.ok(fs.existsSync(run.stages[0].outputPath));
  await action('refine', 'check');
  run = await runState(id, (r) => !!r.stages[0].checkSummary);
  assert.equal(calls.at(-1).access, 'read');
  assert.equal(run.stages[0].checkSummary, 'Traceability findings');
  await action('functional', 'start', { override: true });
  run = await runState(id, (r) => r.stages[1].status === 'review');
  assert.match(fs.readFileSync(run.stages[1].outputPath, 'utf8'), /Based on unapproved inputs/);
  await action('refine', 'approve');
  await action('functional', 'approve');
  run = (await request(`/api/runs/${id}`)).data;
  assert.equal(run.stages[0].approvedBy, 'Reviewer');
  assert.match(fs.readFileSync(run.stages[0].outputPath, 'utf8'), /^> Approved by Reviewer on /);
  assert.equal((await request('/api/chat', 'POST', { conversationId: run.stages[0].conversationId, message: 'change' })).status, 409);
  await action('refine', 'rework');
  run = (await request(`/api/runs/${id}`)).data;
  assert.equal(run.stages[0].status, 'rework');
  assert.equal(run.stages[1].status, 'rework');
  assert.doesNotMatch(fs.readFileSync(run.stages[1].outputPath, 'utf8'), /^> Approved by/);
  await request('/api/chat', 'POST', { conversationId: run.stages[0].conversationId, message: 'Refine it' });
  await action('refine', 'approve');
  run = (await request(`/api/runs/${id}`)).data;
  assert.equal(run.stages[0].status, 'approved');
  assert.equal((fs.readFileSync(run.stages[0].outputPath, 'utf8').match(/> Approved by/g) || []).length, 1);
  assert.equal(store.runs.get(id).stages[0].status, 'approved');
  for (const stage of ['functional', 'technical', 'stories', 'tests']) {
    assert.equal((await action(stage, 'start')).status, 200);
    await runState(id, (r) => r.stages.find((s) => s.id === stage).status === 'review');
    assert.equal((await action(stage, 'approve')).status, 200);
  }
  run = (await request(`/api/runs/${id}`)).data;
  assert.equal(run.stages.filter((s) => s.status === 'approved').length, 5);
  for (const stage of run.stages) assert.match(fs.readFileSync(stage.outputPath, 'utf8'), /^> Approved by Reviewer on /);
  await new Promise((resolve) => server.close(resolve));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await request(`/api/runs/${id}`)).data.stages.filter((s) => s.status === 'approved').length, 5);
});
