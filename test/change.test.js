const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const ExcelJS = require('exceljs');
const change = require('../tools/change');
const raid = require('../tools/raid');

const SAMPLE = path.join(__dirname, '..', 'samples', 'change');
const PROCESSING = path.join(SAMPLE, 'Interview - Processing team - 2 Nov 2026.vtt');
const SUPPORT = path.join(SAMPLE, 'Interview - Client support - 3 Nov 2026.vtt');
const TEMPLATE = path.join(SAMPLE, 'CIA template.xlsx');
const CIA_P = path.join(SAMPLE, 'CIA - Processing.xlsx');
const CIA_C = path.join(SAMPLE, 'CIA - Client services.xlsx');
const ROLES = path.join(SAMPLE, 'Roles.xlsx');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lumen-change-'));
test.after(() => fs.rmSync(temp, { recursive: true, force: true }));

const hash = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const copy = (f, dir = temp) => { const to = path.join(dir, path.basename(f)); fs.copyFileSync(f, to); return to; };

const IMPACTS = [
  { stakeholderGroup: 'Processing officers', role: 'Processing officer', process: 'Application review', change: 'Officers review renewal applications on screen in the case management system', level: 'H', skillGap: 'Working a full file in the case management system', evidence: { quote: 'they will review renewal applications on screen in the case management system' } },
  { stakeholderGroup: 'Processing officers', role: 'Senior processing officer', process: 'Eligibility overrides', change: 'Senior officers approve eligibility overrides in the system', level: 'medium', evidence: { quote: 'senior officers will need to approve eligibility overrides in the system' }, speaker: 'Nadia Roy' },
  { stakeholderGroup: 'Client support centre', process: 'Status enquiries', change: 'Agents look up status in the case management system', level: 'H', evidence: { quote: 'agents will look up the status in the new portal every morning' } }, // invented quote
  { stakeholderGroup: 'Client support centre', process: 'Refunds', change: 'Refunds move online', level: 'X', evidence: { quote: 'Refund requests will move to an online form' } },
  { stakeholderGroup: 'Client support centre', process: '', change: 'Scripts rewritten', level: 'M', evidence: { quote: 'call scripts and the knowledge articles all have to be rewritten' } },
];

test('verifyQuotes is shared: it reads several transcripts and records the file each quote came from', () => {
  const r = raid.verifyQuotes([PROCESSING, SUPPORT], [{ evidence: { quote: 'Refund requests will move to an online form' } }, { evidence: { quote: 'an invented sentence nobody said' } }, { evidence: { quote: 'too short' } }]);
  assert.equal(r.verified.length, 1);
  assert.equal(r.verified[0].seg.speaker, 'Sofia Alvarez');
  assert.equal(r.verified[0].seg.file, path.basename(SUPPORT));
  assert.deepEqual(r.rejected.map((x) => x.n), [2, 3]);
  assert.match(r.rejected[0].reason, /not found in the transcript/);
});

test('proposeImpacts rejects invented quotes and bad levels, and never changes the CIA', async () => {
  const cia = copy(TEMPLATE);
  const before = hash(cia);
  const r = await change.proposeImpacts([PROCESSING, SUPPORT], cia, IMPACTS, { interviewDate: '2026-11-02' });
  assert.equal(hash(cia), before, 'the CIA template is unchanged');
  assert.equal(r.saved, path.join(temp, 'CIA template (proposed).xlsx'));
  assert.equal(r.proposed, 2);
  assert.deepEqual(r.notProposed.map((x) => x.n), [3, 4, 5]);
  assert.match(r.notProposed[0].reason, /quote was not found/);
  assert.match(r.notProposed[1].reason, /must be H, M or L/);
  assert.match(r.notProposed[2].reason, /Missing process/);
  assert.deepEqual(r.impacts.map((i) => [i.id, i.level]), [['CI-001', 'H'], ['CI-002', 'M']]);
  assert.match(r.impacts[0].evidence, /^Marc Tremblay at 00:00:\d\d \(Interview - Processing team - 2 Nov 2026\.vtt \(2026-11-02\)\)/);
  assert.ok(r.warnings.some((w) => /said by Marc Tremblay, not Nadia Roy/.test(w)));

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(r.saved);
  const ws = wb.getWorksheet('Impacts');
  assert.equal(ws.getCell('A2').value, 'CI-001');
  assert.equal(ws.getCell('M2').value, 'Proposed');
  const rs = wb.getWorksheet('Proposed changes');
  assert.equal(rs.getRow(1).getCell(2).value, 'Approve? (Yes/No)');
  assert.ok(!rs.getRow(2).getCell(2).value, 'nothing is pre-approved');
});

test('applyImpacts writes only approved rows to the (updated) copy, and refuses while rows are undecided', async () => {
  const dir = fs.mkdtempSync(path.join(temp, 'apply-'));
  const cia = copy(TEMPLATE, dir);
  const r = await change.proposeImpacts(PROCESSING, cia, IMPACTS.slice(0, 2));
  const undecided = await change.applyImpacts(r.saved);
  assert.equal(undecided.saved, null);
  assert.deepEqual(undecided.undecided, [1, 2]);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(r.saved);
  const rs = wb.getWorksheet('Proposed changes');
  rs.getCell('B2').value = 'Yes'; rs.getCell('B3').value = 'No';
  await wb.xlsx.writeFile(r.saved);
  const done = await change.applyImpacts(r.saved);
  assert.equal(done.saved, path.join(dir, 'CIA template (updated).xlsx'));
  assert.equal(done.applied, 1);
  assert.deepEqual(done.rejectedByReviewer, [2]);
  const out = await change.readImpacts(done.saved);
  assert.equal(out.impacts.length, 1);
  assert.equal(out.impacts[0].status, 'approved');
  assert.equal(out.impacts[0].speaker, 'Marc Tremblay');
});

test('consolidateCia merges the seeded duplicate, builds the heat map and TNA, and leaves the sources alone', async () => {
  const dir = fs.mkdtempSync(path.join(temp, 'cons-'));
  const a = copy(CIA_P, dir), b = copy(CIA_C, dir), roles = copy(ROLES, dir);
  const before = [hash(a), hash(b)];
  const r = await change.consolidateCia([a, b], { roles });
  assert.deepEqual([hash(a), hash(b)], before, 'originals are never modified');
  assert.equal(r.saved, path.join(dir, 'CIA - consolidated.xlsx'));
  assert.equal(r.trainingActions, path.join(dir, 'Training actions - ADO import.xlsx'));
  assert.equal(r.impactsRead, 7);
  assert.equal(r.rejectedLeftOut, 1);
  assert.equal(r.consolidated, 5);
  assert.equal(r.duplicatesMerged.length, 1);
  assert.deepEqual([r.duplicatesMerged[0].kept, r.duplicatesMerged[0].merged, r.duplicatesMerged[0].mergedAt], ['CI-001', 'CI-002', 'CIA - Client services.xlsx › Impacts!A3']);
  const proc = r.heatMap.find((h) => h.group === 'Processing officers');
  assert.deepEqual([proc.H, proc.M, proc.L], [1, 0, 1], 'the merged impact keeps the higher level');
  const support = r.heatMap.find((h) => h.group === 'Client support centre');
  assert.equal(support.notYetApproved, 1);
  assert.equal(r.tna.rows, 4, 'the proposed refund impact is not a training need yet');

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(r.saved);
  assert.deepEqual(wb.worksheets.map((w) => w.name), ['Consolidated impacts', 'Heat map', 'TNA', 'Merged duplicates', 'Sources']);
  const tna = wb.getWorksheet('TNA');
  const rows = []; tna.eachRow((row, n) => { if (n > 1) rows.push(row.values.slice(1, 7)); });
  assert.ok(rows.some((x) => x[1] === 'Processing officer' && x[2] === 42 && x[5] === 'High'));
  const aw = new ExcelJS.Workbook();
  await aw.xlsx.readFile(r.trainingActions);
  const as = aw.getWorksheet('Training actions');
  assert.deepEqual(as.getRow(1).values.slice(1), ['ID', 'Work Item Type', 'Title', 'Description', 'Priority', 'Tags']);
  assert.equal(as.getCell('B2').value, 'Task');

  // Running it again keeps the first result.
  const again = await change.consolidateCia([a, b], { roles });
  assert.equal(again.saved, path.join(dir, 'CIA - consolidated (2).xlsx'));
});

test('consolidateCia tolerates other column wording, missing levels and a workbook with no impact sheet', async () => {
  const dir = fs.mkdtempSync(path.join(temp, 'loose-'));
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Wave 2');
  [['Ref', 'Audience', 'Process', 'Description', 'Rating'], ['W-1', 'Finance', 'Refunds', 'Clerks approve refunds online', ''], ['W-2', 'Finance', 'Refunds', 'Clerks approve refunds online in the new tool', 'High']].forEach((r) => ws.addRow(r));
  const f = path.join(dir, 'Wave 2.xlsx');
  await wb.xlsx.writeFile(f);
  const empty = new ExcelJS.Workbook(); empty.addWorksheet('Notes').addRow(['Nothing here']);
  const e = path.join(dir, 'Notes.xlsx');
  await empty.xlsx.writeFile(e);
  const r = await change.consolidateCia([f, e]);
  assert.equal(r.consolidated, 1);
  assert.equal(r.heatMap[0].H, 1);
  assert.ok(r.notes.some((n) => /W-1 .* no H\/M\/L impact level/.test(n)));
  assert.ok(r.notes.some((n) => /"Notes.xlsx" has no impact sheet/.test(n)));
});

test('saveDraft labels the draft, lists sources, writes Word and never overwrites', async () => {
  const dir = fs.mkdtempSync(path.join(temp, 'draft-'));
  const f = path.join(dir, 'Job aid.md');
  const r = await change.saveDraft(f, '# Job aid\n\n1. Open the file.\n\nSource: TNA!A2', { sources: ['CIA - consolidated.xlsx › TNA!A2'], word: true });
  assert.equal(r.saved, f);
  assert.equal(r.word, path.join(dir, 'Job aid.docx'));
  const text = fs.readFileSync(f, 'utf8');
  assert.match(text, /^> \*\*Draft \(AI\) for review\*\*/);
  assert.match(text, /## Sources\n\n- CIA - consolidated\.xlsx › TNA!A2/);
  assert.match(require('../tools/docx').docxToText(r.word), /Draft \(AI\) for review/);
  const again = await change.saveDraft(f, 'Another', { label: 'Machine-drafted, needs translator review' });
  assert.equal(again.saved, path.join(dir, 'Job aid (2).md'));
  assert.ok(again.warnings.some((w) => /does not cite any source/.test(w)));
  await assert.rejects(change.saveDraft(path.join(dir, 'x.pdf'), 'x'), /\.md .* or \.docx/);
});

test('change tools are exposed; writing needs edit access and stays in the folder', () => {
  const root = fs.mkdtempSync(path.join(temp, 'ws-'));
  for (const f of [PROCESSING, TEMPLATE, CIA_P, CIA_C]) copy(f, root);
  const run = (readonly, name, args) => {
    const input = [{ jsonrpc: '2.0', id: 1, method: 'tools/list' }, { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name, arguments: args } }].map((x) => JSON.stringify(x)).join('\n') + '\n';
    const out = spawnSync(process.execPath, [path.join(__dirname, '..', 'tools', 'office-mcp.js')], { input, encoding: 'utf8', env: { ...process.env, OFFICE_MCP_ROOT: root, OFFICE_MCP_READONLY: readonly ? '1' : '0' } });
    return out.stdout.trim().split('\n').map((l) => JSON.parse(l));
  };
  const args = { transcripts: [path.basename(PROCESSING)], cia: 'CIA template.xlsx', impacts: IMPACTS.slice(0, 1) };
  const [list, denied] = run(true, 'propose_change_impacts', args);
  assert.ok(['propose_change_impacts', 'apply_change_impacts', 'consolidate_cia', 'check_terminology', 'save_draft_document'].every((n) => list.result.tools.some((t) => t.name === n)));
  assert.ok(denied.result.isError);
  const [, ok] = run(false, 'propose_change_impacts', args);
  assert.ok(!ok.result.isError, ok.result.content[0].text);
  assert.ok(fs.existsSync(path.join(root, 'CIA template (proposed).xlsx')));
  const [, cons] = run(false, 'consolidate_cia', { files: ['CIA - Processing.xlsx', 'CIA - Client services.xlsx'] });
  assert.ok(!cons.result.isError, cons.result.content[0].text);
  assert.match(cons.result.content[0].text, /1 duplicate merged/);
  const [, draft] = run(false, 'save_draft_document', { path: 'Training/Officer/Job aid.md', markdown: '# Job aid' });
  assert.ok(!draft.result.isError, draft.result.content[0].text);
  assert.ok(fs.existsSync(path.join(root, 'Training', 'Officer', 'Job aid.md')));
  const [, escape] = run(false, 'save_draft_document', { path: '../escape.md', markdown: 'x' });
  assert.ok(escape.result.isError);
});

test('change and bilingual agents, prompts and skills are wired up', () => {
  const assistants = require('../defaults/assistants.json');
  const recipes = require('../defaults/recipes.json');
  const skills = require('../lib/skills').all();
  const cm = skills.find((s) => s.id === 'change-management');
  const bi = skills.find((s) => s.id === 'bilingual');
  assert.ok(cm && bi);
  assert.ok(cm.readTools.includes('read_transcript'));
  assert.deepEqual(cm.writeTools, ['propose_change_impacts', 'apply_change_impacts', 'consolidate_cia', 'save_draft_document', 'create_spreadsheet']);
  assert.ok(bi.readTools.includes('check_terminology'));
  const { TOOLS } = require('../tools/office-mcp');
  for (const t of [...cm.readTools, ...cm.writeTools, ...bi.readTools, ...bi.writeTools]) assert.ok(TOOLS.some((x) => x.name === t), `${t} exists`);
  for (const [id, emoji] of [['change-impact-analyst', '🔄'], ['training-content', '🎓'], ['bilingual-reviewer', '🍁']]) {
    const a = assistants.find((x) => x.id === id);
    assert.ok(a, id);
    assert.equal(a.emoji, emoji);
    assert.ok(a.skills.every((s) => skills.some((k) => k.id === s)), `${id} uses known skills`);
  }
  const cat = recipes.filter((r) => r.category === 'Change & training');
  assert.deepEqual(cat.map((r) => r.name), ['Interview → change impacts', 'Consolidate the CIA', 'Training needs analysis', 'Draft training materials', 'Draft French version', 'Bilingual QA']);
  assert.ok(cat.every((r) => assistants.some((a) => a.id === r.assistantId)));
  assert.ok(cat.every((r) => r.fields.every((f) => r.template.includes(`{{${f.key}}}`))), 'every field is used in its template');
  const labels = require('../lib/tool-labels');
  assert.match(labels.officeLabel('consolidate_cia', { files: ['a', 'b'] }).label, /Consolidating 2 change impact assessments/);
  assert.match(labels.officeLabel('check_terminology', { english: 'x/EN.docx', french: 'x/FR.docx' }).label, /Checking FR\.docx against EN\.docx/);
});
