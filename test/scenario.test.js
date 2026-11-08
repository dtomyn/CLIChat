const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const project = require('../tools/project');
const scenario = require('../tools/scenario');

const PLAN = path.join(__dirname, '..', 'demo', 'Contoso CRM Migration.xml');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lumen-scenario-'));
test.after(() => fs.rmSync(temp, { recursive: true, force: true }));
const ms = (r, name) => r.milestones.find((m) => m.milestone === name);

test('with no changes the recalculated plan matches the file', () => {
  const r = scenario.runScenario(PLAN, []);
  assert.equal(r.warnings, undefined);
  assert.equal(r.movedTasks.length, 0);
  assert.equal(r.projectFinish.movedWorkingDays, 0);
  assert.deepEqual(r.criticalPath.tasks.map((t) => t.id), project.analyze(PLAN).criticalPath.map((t) => t.id));
});

test('adding 10 days to a critical task moves Go-live by exactly 10 working days, and the plan is untouched', () => {
  const before = fs.readFileSync(PLAN, 'utf8');
  const r = scenario.runScenario(PLAN, [{ task: 18, durationDelta: 10 }], { name: 'ERP slips' });
  const goLive = ms(r, 'Go-live');
  assert.equal(goLive.before, '2027-01-05');
  assert.equal(goLive.movedWorkingDays, 10);
  assert.equal(goLive.after, project.iso(project.addWorkdays(project.toDate('2027-01-05'), 10)));
  assert.equal(r.projectFinish.movedWorkingDays, 10);
  assert.equal(r.scenario, 'ERP slips');
  assert.match(r.summary, /Go-live moves \+10 working days/);
  assert.equal(fs.readFileSync(PLAN, 'utf8'), before);
  // planUpdates are ready for update_project_plan
  assert.deepEqual(r.planUpdates.find((u) => u.taskId === 18), { taskId: 18, finish: '2026-11-24', durationDays: 33 });
  assert.ok(r.planUpdates.find((u) => u.taskId === 39).start);
});

test('a slip inside a task\'s float moves nothing downstream', () => {
  const r = scenario.runScenario(PLAN, [{ task: 'Reports & dashboards', durationDelta: 3 }]);
  assert.equal(ms(r, 'Go-live').movedWorkingDays, 0);
  assert.equal(r.movedTasks.length, 1);
});

test('start-no-earlier-than, removing a dependency and adding capacity', () => {
  const late = scenario.runScenario(PLAN, [{ task: 'User acceptance testing', startNoEarlierThan: '2026-12-21' }]);
  assert.equal(ms(late, 'UAT sign-off').movedWorkingDays, 8); // 9 Dec → 21 Dec start is 8 working days later
  const cut = scenario.runScenario(PLAN, [{ removeDependency: { from: 35, to: 37 } }]);
  assert.ok(ms(cut, 'Go-live').movedWorkingDays < 0);
  assert.ok(cut.criticalPath.left.includes('#35 End-user training (120 sales reps)'));
  const help = scenario.runScenario(PLAN, [{ resource: 'Grace Kim', unitsDelta: 1, task: 26 }]);
  assert.match(help.changesApplied[0].effect, /#26 System integration testing \(SIT\) 10 → 6 days/);
  assert.equal(ms(help, 'Go-live').movedWorkingDays, -4);
});

test('a slip that piles work onto someone shows them as newly over-allocated', () => {
  const r = scenario.runScenario(PLAN, [{ task: 18, durationDelta: 10 }]);
  assert.ok(r.newlyOverallocated.some((x) => x.resource === 'Marcus Lee'));
});

test('bad changes become warnings, not errors', () => {
  const r = scenario.runScenario(PLAN, [{ task: 'No such task', durationDelta: 5 }, { task: 2, durationDelta: 2 }, { removeDependency: '2->20' }, { resource: 'Nobody', unitsDelta: 1 }, { task: 18, startNoEarlierThan: '2026-12-01' }]);
  assert.equal(r.changesApplied.length, 0);
  assert.equal(r.warnings.length, 5);
  assert.match(r.warnings.join(' '), /Couldn't find task "No such task"/);
  assert.match(r.warnings.join(' '), /is complete/);
  assert.match(r.warnings.join(' '), /already started/);
});

test('model_scenario is exposed and read-only', () => {
  const root = fs.mkdtempSync(path.join(temp, 'ws-'));
  fs.copyFileSync(PLAN, path.join(root, 'Plan.xml'));
  const input = [{ jsonrpc: '2.0', id: 1, method: 'tools/list' }, { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'model_scenario', arguments: { path: 'Plan.xml', name: 'UAT +10', changes: [{ task: '28', durationDelta: 10 }] } } }].map((x) => JSON.stringify(x)).join('\n') + '\n';
  const out = spawnSync(process.execPath, [path.join(__dirname, '..', 'tools', 'office-mcp.js')], { input, encoding: 'utf8', env: { ...process.env, OFFICE_MCP_ROOT: root, OFFICE_MCP_READONLY: '1' } });
  const [list, call] = out.stdout.trim().split('\n').map((l) => JSON.parse(l));
  assert.ok(list.result.tools.some((t) => t.name === 'model_scenario'));
  assert.ok(!call.result.isError, call.result.content[0].text);
  assert.match(call.result.content[0].text, /Go-live moves \+10 working days/);
  assert.deepEqual(fs.readdirSync(root), ['Plan.xml']);
});
