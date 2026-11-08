const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const ExcelJS = require('exceljs');
const capacity = require('../tools/capacity');

const DEMO = path.join(__dirname, '..', 'demo');
const PLAN = path.join(DEMO, 'Contoso CRM Migration.xml');
const CAP = path.join(DEMO, 'Team Capacity - Q4 2026.xlsx');
const BACKLOG = path.join(DEMO, 'ADO Backlog Export - 30 Oct 2026.xlsx');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lumen-capacity-'));
test.after(() => fs.rmSync(temp, { recursive: true, force: true }));

test('reads the team, leave and sprint sheets', async () => {
  const c = await capacity.readCapacity(CAP);
  assert.equal(c.people.length, 8);
  const marcus = c.people.find((x) => x.person === 'Marcus Lee');
  assert.equal(marcus.availability, 0.8);
  assert.equal(marcus.source, 'Team!A3');
  assert.equal(c.leave[0].person, 'Aisha Khan');
  assert.equal(c.sprints.find((s) => s.sprint === 'Sprint 8').start.getDate(), 2);
  assert.deepEqual(c.warnings, []);
});

test('the capacity check flags the person on leave during a critical task', async () => {
  const r = await capacity.analyzeCapacity(CAP, { plan: PLAN, backlog: BACKLOG });
  const clash = r.conflicts.leaveClashes[0];
  assert.equal(clash.person, 'Aisha Khan');
  assert.equal(clash.taskId, 18);
  assert.equal(clash.criticalPath, true);
  assert.equal(clash.workingDaysAffected, 5);
  assert.deepEqual(clash.sources, ['Leave!A2', 'plan task #18']);
  const week = r.conflicts.overloadedWeeks.find((w) => w.person === 'Aisha Khan');
  assert.equal(week.week, '2026-11-02');
  assert.equal(week.capacityHours, 0);
  assert.match(r.summary, /1 on the critical path/);
});

test('weekly demand vs. capacity per person and role', async () => {
  const r = await capacity.analyzeCapacity(CAP, { plan: PLAN, weeks: 4 });
  assert.equal(r.window.from, '2026-10-19'); // Monday of the status date
  assert.equal(r.people[0].weeks.length, 4);
  const elena = r.people.find((x) => x.person === 'Elena Rossi');
  assert.equal(elena.weeks[0].capacityHours, 20); // 40 h at 50%
  const tom = r.conflicts.overloadedWeeks.find((w) => w.person === 'Tom Becker' && w.week === '2026-10-26');
  assert.ok(tom.demandHours > tom.capacityHours);
  const dev = r.roles.find((x) => x.role === 'Development');
  assert.deepEqual(dev.people.sort(), ['Aisha Khan', 'Tom Becker']);
  assert.equal(dev.weeks[0].capacityHours, 80);
  assert.equal(r.sprints, undefined); // no backlog given
});

test('sprint demand, estimate outliers and data quality from the backlog', async () => {
  const r = await capacity.analyzeCapacity(CAP, { plan: PLAN, backlog: BACKLOG });
  const over = r.conflicts.sprintOverloads.find((s) => s.person === 'Aisha Khan');
  assert.equal(over.sprint, 'Sprint 8');
  assert.equal(over.capacityHours, 40); // 10 days less 5 on leave
  assert.equal(over.demandHours, 44);
  assert.ok(r.estimateOutliers.length > 0);
  assert.ok(r.estimateOutliers.every((x) => x.ratio >= 2 || x.ratio <= 0.5));
  assert.match(r.estimateOutliers[0].source, /^Query 1!A\d+$/);
  assert.ok(r.dataQuality.unassignedOpenItems.some((x) => x.item === '1009'));
});

test('missing columns are tolerated with warnings; no team sheet is a clear error', async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('People');
  ws.addRow(['Name']); ws.addRow(['Tom Becker']);
  const file = path.join(temp, 'thin.xlsx');
  await wb.xlsx.writeFile(file);
  const r = await capacity.analyzeCapacity(file, { plan: PLAN, weeks: 2 });
  assert.equal(r.people[0].hoursPerWeek, 40);
  assert.equal(r.warnings.length, 2);
  assert.ok(r.dataQuality.notInCapacityFile.some((x) => x.resource === 'Aisha Khan'));

  const bad = new ExcelJS.Workbook(); bad.addWorksheet('X').addRow(['Foo']);
  const badFile = path.join(temp, 'bad.xlsx');
  await bad.xlsx.writeFile(badFile);
  await assert.rejects(capacity.analyzeCapacity(badFile), /needs a sheet with a "Person" column/);
});

test('analyze_capacity is exposed through the office tools', () => {
  const root = fs.mkdtempSync(path.join(temp, 'ws-'));
  for (const f of [PLAN, CAP]) fs.copyFileSync(f, path.join(root, path.basename(f)));
  const input = [{ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'analyze_capacity', arguments: { capacity: path.basename(CAP), plan: path.basename(PLAN) } } }].map((x) => JSON.stringify(x)).join('\n') + '\n';
  const out = spawnSync(process.execPath, [path.join(__dirname, '..', 'tools', 'office-mcp.js')], { input, encoding: 'utf8', env: { ...process.env, OFFICE_MCP_ROOT: root, OFFICE_MCP_READONLY: '1' } });
  const [call] = out.stdout.trim().split('\n').map((l) => JSON.parse(l));
  assert.ok(!call.result.isError, call.result.content[0].text);
  assert.match(call.result.content[0].text, /"leaveClashes"/);
});
