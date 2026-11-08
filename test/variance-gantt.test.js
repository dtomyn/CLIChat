const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ExcelJS = require('exceljs');
const excel = require('../tools/excel');
const project = require('../tools/project');

const PLAN = path.join(__dirname, '..', 'demo', 'Contoso CRM Migration.xml');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lumen-variance-'));
test.after(() => fs.rmSync(temp, { recursive: true, force: true }));

const d = (s) => new Date(`${s}T00:00:00`);

test('ganttWeek separates current bar, baseline bar and slip weeks', () => {
  const t = { start: d('2026-11-02'), finish: d('2026-11-20'), baselineStart: d('2026-10-26'), baselineFinish: d('2026-11-06') };
  assert.deepEqual(excel.ganttWeek(t, d('2026-10-26')), { current: false, base: true, slip: false }); // baseline week no longer used
  assert.deepEqual(excel.ganttWeek(t, d('2026-11-02')), { current: true, base: true, slip: false }); // overlaps both
  assert.deepEqual(excel.ganttWeek(t, d('2026-11-09')), { current: true, base: false, slip: true }); // past the baseline finish
  assert.deepEqual(excel.ganttWeek(t, d('2026-11-23')), { current: false, base: false, slip: false });
  const noBaseline = { start: d('2026-11-02'), finish: d('2026-11-20') };
  assert.equal(excel.ganttWeek(noBaseline, d('2026-11-16')).slip, false);
});

test('finishVariance counts working days and is null without a baseline', () => {
  assert.equal(excel.finishVariance({ finish: d('2026-11-24'), baselineFinish: d('2026-11-10') }), 10);
  assert.equal(excel.finishVariance({ finish: d('2026-11-09'), baselineFinish: d('2026-11-10') }), -1);
  assert.equal(excel.finishVariance({ finish: d('2026-11-09') }), null);
});

test('ganttWeeks covers baseline dates that fall outside the current schedule', () => {
  const p = { start: d('2026-11-04'), finish: d('2026-11-20'), tasks: [{ baselineStart: d('2026-10-28'), baselineFinish: d('2026-11-27') }] };
  const weeks = excel.ganttWeeks(p).map(project.iso);
  assert.equal(weeks[0], '2026-10-26');
  assert.equal(weeks.at(-1), '2026-11-23');
});

test('milestoneTrend compares forecasts across plan versions', () => {
  const current = project.load(PLAN);
  const raw = fs.readFileSync(PLAN, 'utf8');
  // Last week's version: status date a week earlier, "Build complete" (UID 23) forecast 5 working days earlier.
  const older = path.join(temp, 'last week.xml');
  fs.writeFileSync(older, raw
    .replace(/<StatusDate>[^<]*<\/StatusDate>/, '<StatusDate>2026-10-16T17:00:00</StatusDate>')
    .replace(/(<Task>\s*<UID>23<\/UID>[\s\S]*?<Finish>)[^<]*(<\/Finish>)/, '$12026-11-17T17:00:00$2'));
  const snaps = [{ file: older, plan: project.load(older), date: d('2026-10-16') }];
  const { versions, rows } = excel.milestoneTrend(current, snaps);
  assert.deepEqual(versions.map((v) => v.label), ['2026-10-16', '2026-10-23 (current)']);
  const build = rows.find((r) => r.uid === 23);
  assert.equal(build.variance, 10);
  assert.equal(build.change, 5);
  assert.equal(build.trend, 'Worse');
  assert.equal(build.status, 'Slipped');
  assert.equal(rows.find((r) => r.uid === 4).status, 'Complete');
});

test('projectToWorkbook writes the variance Gantt and milestone sheet', async () => {
  const out = path.join(temp, 'tracker.xlsx');
  const res = await excel.projectToWorkbook(PLAN, out);
  assert.deepEqual(res.sheets, ['Summary', 'Tasks', 'Gantt', 'Milestone variance', 'Resources']);
  assert.ok(res.milestonesSlipped > 0);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(out);
  const gs = wb.getWorksheet('Gantt');
  assert.deepEqual(gs.getRow(1).values.slice(1, 5), ['Task', 'Baseline finish', 'Forecast finish', 'Variance (days)']);
  const buildRow = gs.getRows(2, gs.rowCount - 1).find((r) => String(r.getCell(1).value).trim() === 'Build complete');
  assert.equal(buildRow.getCell(4).value, 10);
  // Somewhere in the sheet there is a hatched slip cell and a baseline underline.
  let hatched = 0, underlined = 0, statusLine = 0;
  gs.eachRow((r) => r.eachCell({ includeEmpty: true }, (c) => {
    if (c.fill?.pattern === 'darkUp') hatched++;
    if (c.border?.bottom?.style === 'thick') underlined++;
    if (c.border?.left?.color?.argb === 'FFE5484D') statusLine++;
  }));
  assert.ok(hatched > 0, 'expected slip weeks to be hatched');
  assert.ok(underlined > 0, 'expected baseline underlines');
  assert.ok(statusLine > 0, 'expected a status-date line');

  const ms = wb.getWorksheet('Milestone variance');
  assert.equal(ms.getRow(1).getCell(4).value, 'Forecast 2026-10-23 (current)');
});

test('plan versions are recorded and used automatically for the trend', async () => {
  const root = fs.mkdtempSync(path.join(temp, 'ws-'));
  const plan = path.join(root, 'Contoso CRM Migration.xml');
  const raw = fs.readFileSync(PLAN, 'utf8');
  // Last week: status 16 Oct, "Build complete" (UID 23) forecast 17 Nov.
  fs.writeFileSync(plan, raw.replace(/<StatusDate>[^<]*<\/StatusDate>/, '<StatusDate>2026-10-16T17:00:00</StatusDate>')
    .replace(/(<Task>\s*<UID>23<\/UID>[\s\S]*?<Finish>)[^<]*(<\/Finish>)/, '$12026-11-17T17:00:00$2'));
  const first = await excel.projectToWorkbook(plan, path.join(root, 'week1.xlsx'), { historyRoot: root });
  assert.equal(first.historySource, 'none');
  assert.deepEqual(fs.readdirSync(path.join(root, '.lumen', 'plan-history', 'Contoso CRM Migration')), ['2026-10-16.xml']);

  // This week: progress recorded into an "(updated)" copy, which shares the original's history.
  const upd = project.updatePlan(plan, { statusDate: '2026-10-23', updates: [{ taskId: 23, finish: '2026-11-24' }] }, root);
  assert.equal(upd.versionsRecorded, 1); // the 16 Oct version was already saved and is unchanged
  const second = await excel.projectToWorkbook(upd.saved, path.join(root, 'week2.xlsx'), { historyRoot: root });
  assert.equal(second.historySource, 'saved versions');
  assert.deepEqual(second.comparedWith, ['version of 2026-10-16']);
  assert.deepEqual(fs.readdirSync(path.join(root, '.lumen', 'plan-history', 'Contoso CRM Migration')), ['2026-10-16.xml', '2026-10-23.xml']);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path.join(root, 'week2.xlsx'));
  const ms = wb.getWorksheet('Milestone variance');
  const build = ms.getRows(2, ms.rowCount - 1).find((r) => r.getCell(2).value === 'Build complete');
  assert.equal(build.getCell(7).value, 5); // change vs. last
  assert.equal(build.getCell(8).value, 'Worse');
});

test('historyKey groups updated copies with the original', () => {
  assert.equal(project.historyKey('C:/x/Plan (updated).xml'), 'Plan');
  assert.equal(project.historyKey('Plan.mpp'), 'Plan');
  assert.deepEqual(project.earlierVersions(temp, 'nothing.xml', new Date()), []);
});
