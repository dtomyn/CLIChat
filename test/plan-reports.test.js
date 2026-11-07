const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const project = require('../tools/project');

const PLAN = path.join(__dirname, '..', 'demo', 'Contoso CRM Migration.xml');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lumen-reports-'));
test.after(() => fs.rmSync(temp, { recursive: true, force: true }));

function workspace() {
  const root = fs.mkdtempSync(path.join(temp, 'ws-'));
  const plan = path.join(root, 'Plan.xml');
  fs.copyFileSync(PLAN, plan);
  project.recordVersion(project.load(plan), root);
  return { root, plan };
}

test('change log without an earlier version explains itself', () => {
  const root = fs.mkdtempSync(path.join(temp, 'ws-'));
  const plan = path.join(root, 'Plan.xml');
  fs.copyFileSync(PLAN, plan);
  assert.match(project.changeLog(plan, {}, root).warnings[0], /No earlier saved version/);
});

test('change log separates material from administrative changes', () => {
  const { root, plan } = workspace();
  const upd = project.updatePlan(plan, { statusDate: '2026-10-30', updates: [
    { taskId: 23, finish: '2026-12-01' },        // moves a task feeding milestones
    { taskId: 18, percentComplete: 80 },         // progress only
    { taskId: 17, notes: 'Waiting on vendor' },  // administrative
  ] }, root);
  const r = project.changeLog(upd.saved, { against: 'last' }, root);
  assert.equal(r.versionDate, '2026-10-23');
  assert.ok(r.material.some((c) => c.id === 23 && c.kind === 'dates' && /working days/.test(c.why)), JSON.stringify(r.material));
  assert.ok(r.administrative.some((c) => c.id === 17 && c.kind === 'notes'));
  assert.ok(!r.material.concat(r.administrative).some((c) => c.id === 18), 'progress is not a change');
  assert.match(r.summary, /1 task with progress updates/);
});

test('change log honours a date and an explicit comparison file', () => {
  const { root, plan } = workspace();
  const upd = project.updatePlan(plan, { statusDate: '2026-10-30', updates: [{ taskId: 23, finish: '2026-12-01' }] }, root);
  assert.equal(project.changeLog(upd.saved, { against: '2026-10-25' }, root).versionDate, '2026-10-23');
  assert.equal(project.changeLog(upd.saved, { compareFile: plan }, root).comparedWith, 'Plan.xml');
  assert.match(project.changeLog(upd.saved, { against: '2026-10-01' }, root).warnings[0], /No earlier saved version/);
});

test('look-ahead groups next week by workstream and flags dependencies', () => {
  const r = project.lookahead(PLAN, {});
  assert.deepEqual(r.window, { from: '2026-10-24', to: '2026-10-30' });
  const build = r.workstreams.find((w) => /Build/.test(w.workstream));
  assert.deepEqual(build.starting.map((t) => t.id), [20]);
  assert.deepEqual(build.finishing.map((t) => t.id), [17, 22]);
  assert.deepEqual(build.lateCarryOver.map((t) => t.id), [21]);
  const testing = r.workstreams.find((w) => /Testing/.test(w.workstream));
  assert.match(testing.waitingOn[0].fromWorkstream, /Build/);
});

test('look-ahead can be narrowed and handles unknown branches', () => {
  assert.deepEqual(project.lookahead(PLAN, { under: 'Testing' }).workstreams.map((w) => w.workstream.slice(2)), ['Testing']);
  assert.equal(project.lookahead(PLAN, { days: 21 }).window.to, '2026-11-13');
  const bad = project.lookahead(PLAN, { under: 'Nope' });
  assert.match(bad.warnings[0], /No task or WBS/);
  assert.equal(bad.workstreams.length, 0);
});
