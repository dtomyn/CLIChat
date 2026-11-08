const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const ExcelJS = require('exceljs');
const qe = require('../tools/tests');
const { analyze } = require('../tools/traceability');

const SAMPLE = path.join(__dirname, '..', 'samples', 'aidlc');
const TRM = path.join(SAMPLE, 'Requirements Traceability (sample).xlsx');
const DEFECTS = path.join(SAMPLE, 'Defects export.xlsx');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lumen-qe-'));
test.after(() => fs.rmSync(temp, { recursive: true, force: true }));

async function workbook(file, sheets) {
  const wb = new ExcelJS.Workbook();
  for (const [name, rows] of Object.entries(sheets)) { const ws = wb.addWorksheet(name); rows.forEach((r) => ws.addRow(r)); }
  await wb.xlsx.writeFile(file);
  return file;
}

test('traceability reads the Tests sheet: uncovered requirement, withdrawn-linked test, stories without tests', async () => {
  const r = await analyze(TRM);
  assert.equal(r.layersFound['Test cases'], 11);
  const f = r.findings;
  assert.deepEqual(f.requirementsWithoutTests.map((x) => [x.id, x.at]), [['BR-007', 'Business Requirements!A8']]);
  assert.deepEqual(f.testsTracingToWithdrawnItems.map((x) => [x.id, x.at, x.withdrawnUpstream]), [['TC-011', 'Tests!A12', ['BR-008']]]);
  assert.deepEqual(f.storiesWithoutTests.map((x) => x.id), ['US-106', 'US-108', 'US-109']);
  assert.equal(r.coverage['Business requirements with tests'], '86% (6/7)');
  // Tests are downstream of a changed requirement, so they need review too.
  const photo = f.changeImpact.find((i) => i.id === 'BR-004').affected.find((a) => a.id === 'TC-006');
  assert.ok(photo && photo.olderThanChange);
  // Existing findings are unchanged by the new layer.
  assert.deepEqual(f.coverageGaps.map((g) => g.id), ['BR-006.1', 'BR-006.2', 'FD-016']);
  assert.ok(!f.untracedItems.some((x) => x.id.startsWith('TC-')));
});

test('a test does not stand in for design, and workbooks without tests get no test findings', async () => {
  const file = await workbook(path.join(temp, 'mini.xlsx'), {
    'Business Requirements': [['Req ID', 'Requirement', 'Status'], ['BR-1', 'Renew online', 'Approved'], ['BR-2', 'Pay by card', 'Approved']],
    'Functional Design': [['FD ID', 'Title', 'Traces To', 'Status'], ['FD-1', 'Renew screen', 'BR-1', 'Approved']],
    Backlog: [['Item ID', 'Type', 'Title', 'Implements', 'Status'], ['US-1', 'Story', 'Renew', 'FD-1', 'Ready']],
    Tests: [['Test ID', 'Title', 'Traces To', 'Status'], ['TC-1', 'Pay', 'BR-2', 'Not run'], ['TC-2', 'Orphan', '', 'Not run'], ['TC-3', 'Bad link', 'US-99', 'Not run']],
  });
  const r = await analyze(file);
  assert.ok(r.findings.coverageGaps.some((g) => g.id === 'BR-2'), 'BR-2 has a test but no design');
  assert.deepEqual(r.findings.requirementsWithoutTests.map((x) => x.id), ['BR-1']);
  assert.deepEqual(r.findings.storiesWithoutTests.map((x) => x.id), ['US-1']);
  assert.ok(r.findings.untracedItems.some((x) => x.id === 'TC-2'));
  assert.ok(r.findings.brokenLinks.some((b) => b.item === 'TC-3' && b.missingId === 'US-99'));

  const noTests = await workbook(path.join(temp, 'no-tests.xlsx'), { 'Business Requirements': [['Req ID', 'Requirement', 'Status'], ['BR-1', 'Renew online', 'Approved']] });
  const n = await analyze(noTests);
  assert.equal(n.findings.requirementsWithoutTests, undefined);
  assert.ok(!Object.keys(n.coverage).some((k) => /with tests/.test(k)));
});

test('writeTestCases writes one row per step in the Test Plans layout and never overwrites', async () => {
  const out = path.join(temp, 'Test cases.xlsx');
  const cases = [
    { title: 'Renewal blocked 91 days after expiry', type: 'SIT', priority: 1, tracesTo: ['US-103', 'BR-002.1'], technique: 'boundary',
      steps: [{ action: 'Sign in as an applicant whose permit expired 91 days ago', expected: 'My permits shows the permit' }, { action: 'Select Renew', expected: 'Renewal is blocked and the new-application route is shown' }] },
    { id: 'TC-001', title: 'Renewal allowed 90 days after expiry', type: 'uat', tracesTo: 'US-103', steps: [{ action: 'Select Renew' }] },
    { title: 'No steps', steps: [] },
  ];
  const r = await qe.writeTestCases(out, cases);
  assert.equal(r.saved, out);
  assert.equal(r.cases, 3);
  assert.equal(r.steps, 3);
  assert.deepEqual(r.byType, { SIT: 2, UAT: 1 });
  assert.ok(r.warnings.some((w) => /TC-001 step 1 has no expected result/.test(w)));
  assert.ok(r.warnings.some((w) => /TC-003 has no steps/.test(w)));
  assert.ok(r.warnings.some((w) => /TC-003 doesn't trace/.test(w)));

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(out);
  const ws = wb.getWorksheet('Test cases');
  assert.deepEqual(ws.getRow(1).values.slice(1, 7), ['ID', 'Work Item Type', 'Title', 'Test Step', 'Step Action', 'Step Expected']);
  assert.equal(ws.getRow(2).getCell(1).value, 'TC-002', 'auto IDs skip IDs already used');
  assert.equal(ws.getRow(2).getCell(2).value, 'Test Case');
  assert.equal(ws.getRow(2).getCell(7).value, 'US-103, BR-002.1');
  assert.equal(ws.getRow(3).getCell(1).value, null, 'continuation step rows leave the case fields blank');
  assert.equal(ws.getRow(3).getCell(4).value, 2);
  assert.match(ws.getRow(3).getCell(6).value, /new-application route/);
  assert.equal(ws.getRow(4).getCell(1).value, 'TC-001');
  assert.equal(ws.getRow(4).getCell(9).value, 'UAT');
  assert.equal(wb.getWorksheet('Coverage').rowCount, 4);

  const again = await qe.writeTestCases(out, cases.slice(0, 1));
  assert.equal(again.saved, path.join(temp, 'Test cases (2).xlsx'));
  assert.match(again.note, /already exists/);
  await assert.rejects(qe.writeTestCases(out, []), /at least one test case/);
});

test('analyzeDefects finds both duplicate pairs and the mismatch, and never changes the export', async () => {
  const before = fs.readFileSync(DEFECTS);
  const r = await qe.analyzeDefects(DEFECTS, { asOf: '2026-11-06' });
  assert.ok(fs.readFileSync(DEFECTS).equals(before), 'the export must not change');
  assert.deepEqual(r.findings.probableDuplicates.map((d) => [d.keep.id, d.probableDuplicate.id]).sort(), [['1201', '1204'], ['1203', '1206']]);
  assert.ok(!JSON.stringify(r.findings.probableDuplicates).includes('1210'), 'a look-alike in another area is not a duplicate');
  assert.deepEqual(r.findings.severityPriorityMismatches.map((m) => [m.id, m.at]), [['1207', 'Defects!A8']]);
  assert.match(r.findings.severityPriorityMismatches[0].note, /serious defect is queued as low priority/);
  assert.deepEqual(r.findings.openWithoutOwner.map((d) => d.id), ['1203']);
  assert.equal(r.counts.byState.Closed, 2);
  assert.equal(r.oldestOpen[0].id, '1208');
  assert.equal(r.oldestOpen[0].ageDays, 52);
  assert.ok(r.findings.notChangedRecently.some((d) => d.id === '1208'));
  assert.match(r.summary, /^10 defects, 8 open \(2 critical\); 2 probable duplicate pairs; 1 severity–priority mismatch/);
  assert.deepEqual(r.proposals.map((p) => [p.id, p.field, p.value]).sort(), [['1204', 'state', 'Duplicate'], ['1206', 'state', 'Duplicate'], ['1207', 'priority', '1']]);
});

test('defect exports as CSV, title similarity and severity ranks', async () => {
  const csv = path.join(temp, 'bugs.csv');
  fs.writeFileSync(csv, 'ID,Title,State,Severity,Priority\n1,Login button does nothing,Active,Critical,3\n2,Login button doing nothing,New,High,2\n3,Report totals wrong,Done,Low,1\n');
  const r = await qe.analyzeDefects(csv, { asOf: '2026-11-06' });
  assert.equal(r.findings.probableDuplicates.length, 1, 'no area column: titles alone decide');
  assert.deepEqual(r.findings.severityPriorityMismatches.map((m) => m.id), ['1'], 'closed defects are not flagged');
  assert.equal(qe.rank('2 - High'), 2);
  assert.equal(qe.rank('Blocker'), 1);
  assert.equal(qe.rank(''), null);
  assert.ok(qe.similarity('Payment page times out', 'Payment page timing out') >= 0.6);
  assert.ok(qe.similarity('Payment page times out', 'Photo upload fails') < 0.6);
  await assert.rejects(qe.analyzeDefects(await workbook(path.join(temp, 'bad.xlsx'), { S: [['Name', 'Owner'], ['x', 'y']] })), /needs at least "ID" and "Title"/);
});

test('proposeDefectChanges writes a (proposed) copy with an Approve column and leaves the export alone', async () => {
  const file = path.join(temp, 'Defects export.xlsx');
  fs.copyFileSync(DEFECTS, file);
  const before = fs.readFileSync(file);
  const r = await qe.proposeDefectChanges(file, [
    { id: '1207', field: 'priority', value: '1', reason: 'Critical privacy defect' },
    { id: '#1204', field: 'State', value: 'Duplicate', reason: 'Duplicate of 1201' },
    { id: '9999', field: 'priority', value: '1' },
    { id: '1201', field: 'colour', value: 'red' },
  ]);
  assert.ok(fs.readFileSync(file).equals(before));
  assert.equal(r.saved, path.join(temp, 'Defects export (proposed).xlsx'));
  assert.equal(r.proposed, 2);
  assert.deepEqual(r.notProposed.map((x) => x.n), [3, 4]);
  assert.deepEqual(r.changes[0], { n: 1, id: '1207', field: 'priority', before: '4', after: '1', reason: 'Critical privacy defect', at: 'Defects!F8' });

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(r.saved);
  const rs = wb.getWorksheet('Proposed changes');
  assert.equal(rs.getRow(1).getCell(2).value, 'Approve? (Yes/No)');
  assert.ok(!rs.getRow(2).getCell(2).value, 'nothing is pre-approved');
  assert.equal(wb.getWorksheet('Defects').getCell('F8').value, '1');
  assert.equal(wb.getWorksheet('Defects').getCell('D5').value, 'Duplicate');
});

test('a re-run of proposeDefectChanges keeps the earlier (proposed) copy and saves a numbered one', async () => {
  const dir = fs.mkdtempSync(path.join(temp, 'rerun-'));
  const file = path.join(dir, 'Defects export.xlsx');
  fs.copyFileSync(DEFECTS, file);
  const first = await qe.proposeDefectChanges(file, [{ id: '1207', field: 'priority', value: '1' }]);
  const marked = fs.readFileSync(first.saved);
  const second = await qe.proposeDefectChanges(file, [{ id: '1207', field: 'priority', value: '2' }]);
  assert.equal(second.saved, path.join(dir, 'Defects export (proposed) (2).xlsx'));
  assert.ok(fs.readFileSync(first.saved).equals(marked), 'the copy under review is not replaced');
});

test('quality tools are exposed; writing needs edit access', () => {
  const root = fs.mkdtempSync(path.join(temp, 'ws-'));
  fs.copyFileSync(DEFECTS, path.join(root, 'Defects.xlsx'));
  const run = (readonly, name, args) => {
    const input = [{ jsonrpc: '2.0', id: 1, method: 'tools/list' }, { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name, arguments: args } }].map((x) => JSON.stringify(x)).join('\n') + '\n';
    const out = spawnSync(process.execPath, [path.join(__dirname, '..', 'tools', 'office-mcp.js')], { input, encoding: 'utf8', env: { ...process.env, OFFICE_MCP_ROOT: root, OFFICE_MCP_READONLY: readonly ? '1' : '0' } });
    return out.stdout.trim().split('\n').map((l) => JSON.parse(l));
  };
  const [list, triage] = run(true, 'analyze_defects', { path: 'Defects.xlsx', asOf: '2026-11-06' });
  assert.ok(['write_test_cases', 'analyze_defects', 'propose_defect_changes'].every((n) => list.result.tools.some((t) => t.name === n)));
  assert.ok(!triage.result.isError, triage.result.content[0].text);
  assert.match(triage.result.content[0].text, /2 probable duplicate pairs/);
  const cases = [{ title: 'Pay by card', type: 'SIT', tracesTo: ['US-105'], steps: [{ action: 'Pay', expected: 'Receipt shown' }] }];
  const [, denied] = run(true, 'write_test_cases', { path: 'Tests.xlsx', cases });
  assert.ok(denied.result.isError);
  const [, ok] = run(false, 'write_test_cases', { path: 'Tests.xlsx', cases });
  assert.ok(!ok.result.isError, ok.result.content[0].text);
  assert.ok(fs.existsSync(path.join(root, 'Tests.xlsx')));
  const [, escape] = run(false, 'write_test_cases', { path: '../escape.xlsx', cases });
  assert.ok(escape.result.isError);
});

test('quality engineering agents, prompts, skill and lifecycle stage are wired up', () => {
  const assistants = require('../defaults/assistants.json');
  const recipes = require('../defaults/recipes.json');
  const pipeline = require('../defaults/pipelines.json').find((p) => p.id === 'aidlc');
  const skills = require('../lib/skills').all();
  const qeSkill = skills.find((s) => s.id === 'test-design');
  assert.ok(qeSkill);
  assert.deepEqual(qeSkill.writeTools, ['write_test_cases', 'propose_defect_changes', 'create_spreadsheet', 'update_spreadsheet']);
  for (const id of ['test-designer', 'test-planner', 'defect-triage']) {
    const a = assistants.find((x) => x.id === id);
    assert.ok(a, id);
    assert.ok(a.skills.every((s) => skills.some((k) => k.id === s)), `${id} uses known skills`);
  }
  const qeRecipes = recipes.filter((r) => r.category === 'Quality engineering');
  assert.deepEqual(qeRecipes.map((r) => r.name), ['Generate test cases from stories', 'Coverage gaps', 'Draft the test strategy', 'Triage defects']);
  assert.ok(qeRecipes.every((r) => assistants.some((a) => a.id === r.assistantId)));
  const stage = pipeline.stages.at(-1);
  assert.equal(stage.id, 'tests');
  assert.equal(stage.output, '05-test-cases.md');
  assert.equal(pipeline.stages.at(-2).id, 'stories');
  const labels = require('../lib/tool-labels');
  assert.match(labels.officeLabel('analyze_defects', { path: 'x/Defects.xlsx' }).label, /Triaging defects in Defects\.xlsx/);
});
