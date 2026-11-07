const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ExcelJS = require('exceljs');
const backlog = require('../tools/backlog');

const PLAN = path.join(__dirname, '..', 'demo', 'Contoso CRM Migration.xml');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lumen-backlog-'));
test.after(() => fs.rmSync(temp, { recursive: true, force: true }));

async function sheet(rows, { mapRows } = {}) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Query');
  ws.addRow(['ID', 'Work Item Type', 'Title', 'State', 'Tags', 'Story Points', 'State Change Date']);
  rows.forEach((r) => ws.addRow(r));
  if (mapRows) { const m = wb.addWorksheet('Mapping'); m.addRow(['ADO ID', 'Plan task ID']); mapRows.forEach((r) => m.addRow(r)); }
  const file = path.join(temp, `b${Math.random().toString(36).slice(2)}.xlsx`);
  await wb.xlsx.writeFile(file);
  return file;
}

test('rolls item states up to a task and ignores removed items', async () => {
  const file = await sheet([
    [101, 'User Story', 'Build pipeline A', 'Closed', 'MPP-17; core', 3, '2026-10-28'],
    [102, 'User Story', 'Build pipeline B', 'Active', 'MPP-17', 3, '2026-10-29'],
    [103, 'User Story', 'Dropped', 'Removed', 'MPP-17', 8, '2026-10-01'],
    [104, 'User Story', 'Report 1', 'New', 'MPP-20', 2, ''],
  ]);
  const r = await backlog.progressFromBacklog(PLAN, file, { statusDate: '2026-10-30' });
  assert.deepEqual(r.proposals.map((x) => [x.taskId, x.percentComplete, x.items, x.done]), [[17, 75, 2, 1]]); // (100+50)/2
  assert.equal(r.unchanged.length + r.heldBack.length, 1); // task 20 stays at 0
  assert.equal(r.dataQuality.ignoredRemoved, 1);
});

test('weights by story points', async () => {
  const file = await sheet([
    [1, 'Story', 'Big', 'Closed', 'MPP-17', 8, ''],
    [2, 'Story', 'Small', 'New', 'MPP-17', 2, ''],
  ]);
  const r = await backlog.progressFromBacklog(PLAN, file, { basis: 'points', statusDate: '2026-10-30' });
  assert.equal(r.proposals[0].percentComplete, 80);
});

test('data quality: unlinked, missing and summary links, stale, unknown state, tasks without items', async () => {
  const file = await sheet([
    [1, 'Story', 'No tag', 'Active', '', 1, ''],
    [2, 'Story', 'Bad ref', 'Active', 'MPP-999', 1, ''],
    [3, 'Story', 'Points at a summary', 'Active', 'MPP-16', 1, ''],
    [4, 'Story', 'Stale', 'Active', 'MPP-17', 1, '2026-09-01'],
    [5, 'Story', 'Odd state', 'Waiting on vendor', 'MPP-17', 1, ''],
  ]);
  const { dataQuality: dq, summary } = await backlog.progressFromBacklog(PLAN, file, { statusDate: '2026-10-30' });
  assert.equal(dq.unmappedItems.length, 1);
  assert.equal(dq.unknownTaskRefs[0].ref, '999');
  assert.equal(dq.summaryTargets.length, 1);
  assert.equal(dq.staleItems[0].daysSinceChange, 59);
  assert.equal(dq.unknownStates[0].state, 'Waiting on vendor');
  assert.ok(dq.tasksWithoutItems.length > 0);
  assert.match(summary, /data-quality finding/);
});

test('holds back decreases unless allowed; mapping sheet and custom prefix work', async () => {
  const file = await sheet([[1, 'Story', 'Nothing started', 'New', 'PLAN_18', 1, '']]);
  const r = await backlog.progressFromBacklog(PLAN, file, { tagPrefix: 'PLAN', statusDate: '2026-10-30' });
  assert.equal(r.heldBack.length, 1);
  assert.equal(r.heldBack[0].taskId, 18);
  const again = await backlog.progressFromBacklog(PLAN, file, { tagPrefix: 'PLAN', allowDecrease: true, statusDate: '2026-10-30' });
  assert.equal(again.proposals[0].percentComplete, 0);
  const mapped = await sheet([[2, 'Story', 'Mapped by sheet', 'Closed', '', 1, '']], { mapRows: [[2, 17]] });
  assert.equal((await backlog.progressFromBacklog(PLAN, mapped, { statusDate: '2026-10-30' })).proposals[0].taskId, 17);
});

test('a file without ID and State columns is rejected clearly', async () => {
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet('X').addRow(['Foo', 'Bar']);
  const f = path.join(temp, 'bad.xlsx');
  await wb.xlsx.writeFile(f);
  await assert.rejects(backlog.progressFromBacklog(PLAN, f), /ID" and "State"/);
});
