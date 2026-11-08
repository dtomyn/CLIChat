const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const project = require('../tools/project');

const PLAN = path.join(__dirname, '..', 'demo', 'Contoso CRM Migration.xml');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lumen-query-'));
test.after(() => fs.rmSync(temp, { recursive: true, force: true }));
const ids = (r) => r.tasks.map((t) => t.id);

test('filters by branch, status, critical path and slip', () => {
  assert.deepEqual(ids(project.queryPlan(PLAN, { status: ['late'] })), [21]);
  assert.deepEqual(ids(project.queryPlan(PLAN, { under: 'Testing' })), [25, 26, 27, 28, 29, 30]);
  assert.deepEqual(ids(project.queryPlan(PLAN, { under: '5' })), ids(project.queryPlan(PLAN, { under: 'Testing' })));
  const crit = project.queryPlan(PLAN, { critical: true });
  assert.ok(crit.tasks.every((t) => t.floatDays === 0 && t.percentComplete < 100));
  assert.ok(project.queryPlan(PLAN, { slippedMoreThan: 9 }).tasks.every((t) => t.slipWorkingDays > 9));
});

test('owner, date window and dependency chains', () => {
  const aisha = project.queryPlan(PLAN, { owner: 'aisha', from: '2026-10-26', to: '2026-11-06' });
  assert.deepEqual(ids(aisha), [18]);
  const down = project.queryPlan(PLAN, { relatedTo: { task: 18, direction: 'downstream' }, milestones: true });
  assert.deepEqual(ids(down), [23, 30, 37, 39, 42]);
  assert.equal(down.tasks[0].linksAway, 2);
  const up = project.queryPlan(PLAN, { relatedTo: { task: 'Go-live', direction: 'upstream' } });
  assert.ok(ids(up).includes(18) && !ids(up).includes(39));
});

test('unknown anchors return no rows with a warning instead of everything', () => {
  const r = project.queryPlan(PLAN, { under: 'No such branch' });
  assert.equal(r.matches, 0);
  assert.match(r.warnings[0], /No task or WBS/);
  assert.equal(project.queryPlan(PLAN, { relatedTo: { task: 'Nope' } }).matches, 0);
});

test('changedSince compares with the last saved version', () => {
  const root = fs.mkdtempSync(path.join(temp, 'ws-'));
  const plan = path.join(root, 'Plan.xml');
  fs.copyFileSync(PLAN, plan);
  assert.match(project.queryPlan(plan, { changedSince: 'last' }, root).warnings[0], /No earlier saved version/);
  project.recordVersion(project.load(plan), root); // version for 23 Oct
  const upd = project.updatePlan(plan, { statusDate: '2026-10-30', updates: [{ taskId: 23, finish: '2026-12-01' }, { taskId: 18, percentComplete: 80 }] }, root);
  const r = project.queryPlan(upd.saved, { changedSince: 'last' }, root);
  assert.deepEqual(ids(r), [18, 23]);
  assert.match(r.tasks.find((t) => t.id === 23).change, /finish 2026-11-24 → 2026-12-01 \(\+5 days\)/);
  assert.match(r.filters.at(-1), /2026-10-23/);
});

test('query_plan is exposed by the office tool server and allowed when read-only', () => {
  const input = [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
    { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'query_plan', arguments: { path: path.basename(PLAN), status: ['late'] } } },
  ].map((m) => JSON.stringify(m)).join('\n') + '\n';
  const res = spawnSync(process.execPath, [path.join(__dirname, '..', 'tools', 'office-mcp.js')], { input, encoding: 'utf8', env: { ...process.env, OFFICE_MCP_ROOT: path.dirname(PLAN), OFFICE_MCP_READONLY: '1' } });
  const msgs = res.stdout.trim().split('\n').map((l) => JSON.parse(l));
  assert.ok(msgs.find((m) => m.id === 2).result.tools.some((t) => t.name === 'query_plan'));
  const call = msgs.find((m) => m.id === 3).result;
  assert.ok(!call.isError, JSON.stringify(call));
  assert.match(call.content[0].text, /Data cleansing/);
});
