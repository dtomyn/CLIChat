const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const ExcelJS = require('exceljs');
const release = require('../tools/release');

const DEMO = path.join(__dirname, '..', 'demo');
const CHECKLIST = path.join(DEMO, 'Release Readiness Checklist - Go-live.xlsx');
const RUNSHEET = path.join(DEMO, 'Cutover Run-sheet - Go-live weekend.xlsx');
const DEFECTS = path.join(DEMO, 'Hypercare Defects - 1 Feb 2027.xlsx');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lumen-release-'));
test.after(() => fs.rmSync(temp, { recursive: true, force: true }));
const hash = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

async function book(file, sheets) {
  const wb = new ExcelJS.Workbook();
  for (const [name, rows] of Object.entries(sheets)) wb.addWorksheet(name).addRows(rows);
  await wb.xlsx.writeFile(file);
  return file;
}

test('readiness check is Red and cites the missing evidence file', async () => {
  const before = hash(CHECKLIST);
  const r = await release.readinessCheck(CHECKLIST, { root: DEMO, asOf: '2026-12-31' });
  assert.equal(r.rag.rating, 'Red');
  assert.equal(r.goLive.date, '2027-01-05');
  assert.equal(r.goLive.daysAway, 5);
  assert.match(r.rag.reasons[0], /PRD-04 \(Evidence\/PRD access review\.pdf, Readiness!C11\)/);
  assert.deepEqual(r.findings.missingEvidence.map((i) => i.id), ['PRD-04']);
  const prd = r.byEnvironment.find((e) => e.environment === 'PRD');
  assert.deepEqual([prd.items, prd.complete, prd.missingEvidence], [6, 2, 1]);
  const uat = r.items.find((i) => i.id === 'UAT-01');
  assert.equal(uat.evidence[0].found, path.join('Evidence', 'UAT sign-off - Sales leadership.md'));
  assert.ok(r.findings.openWithoutOwner.some((i) => i.id === 'PRD-06'));
  assert.equal(hash(CHECKLIST), before, 'the checklist is not changed');
});

test('readiness rating follows the rule: Amber when open items are far from go-live, Green when all is evidenced', async () => {
  const dir = fs.mkdtempSync(path.join(temp, 'ready-'));
  fs.writeFileSync(path.join(dir, 'signoff.md'), 'ok');
  const head = ['Gate item', 'Environment', 'Owner', 'Due', 'Evidence', 'Status', 'Must have'];
  const amber = await book(path.join(dir, 'a.xlsx'), { Checklist: [head, ['UAT signed off', 'UAT', 'Grace', '2027-03-01', 'signoff.md', 'Done', 'Yes'], ['Comms sent', 'Production', 'Marcus', '2027-03-01', '', 'Open', 'Yes']] });
  const a = await release.readinessCheck(amber, { goLive: '2027-03-31', asOf: '2027-02-01' });
  assert.equal(a.rag.rating, 'Amber');
  assert.equal(a.byEnvironment.find((e) => e.environment === 'PRD').open, 1);
  const red = await release.readinessCheck(amber, { goLive: '2027-02-05', asOf: '2027-02-01' });
  assert.equal(red.rag.rating, 'Red');
  assert.match(red.rag.reasons.join(' '), /still open 4 days before go-live/);
  const green = await book(path.join(dir, 'g.xlsx'), { Checklist: [head, ['UAT signed off', 'UAT', 'Grace', '2027-03-01', 'signoff.md', 'Done', 'Yes']] });
  assert.equal((await release.readinessCheck(green, { asOf: '2027-02-01' })).rag.rating, 'Green');
  await assert.rejects(release.readinessCheck(await book(path.join(dir, 'x.xlsx'), { S: [['Name', 'Value']] })), /needs a readiness checklist/);
});

test('cutover status finds the late step, the critical path and the projected finish', async () => {
  const dir = fs.mkdtempSync(path.join(temp, 'cut-'));
  const r = await release.cutoverStatus(RUNSHEET, { asOf: '2027-01-02 23:30', snapshotDir: path.join(dir, 'Cutover') });
  assert.deepEqual(r.late.map((s) => s.step), ['C04']);
  assert.equal(r.late[0].lateMinutes, 60);
  assert.equal(r.late[0].at, 'Run-sheet!B5');
  assert.equal(r.plannedFinish, '2027-01-03 05:00');
  assert.equal(r.projectedFinish, '2027-01-03 06:45');
  assert.equal(r.varianceMinutes, 105);
  assert.equal(r.rag.rating, 'Red');
  assert.deepEqual(r.criticalPath.map((s) => s.step), ['C04', 'C05', 'C08', 'C09', 'C10', 'C11']);
  assert.ok(!r.criticalPath.some((s) => ['C06', 'C07'].includes(s.step)), 'finished side branches are not critical');
  assert.deepEqual(r.shouldHaveStarted.map((s) => s.step), ['C05']);
  assert.deepEqual(r.nextSteps[0].waitingFor, ['C04']);
  assert.equal(r.counts.Done, 5);
  assert.equal(r.saved, path.join(dir, 'Cutover', '2027-01-02 2330.md'));
  const md = fs.readFileSync(r.saved, 'utf8');
  assert.match(md, /^# Cutover status 2027-01-02 23:30/);
  assert.match(md, /\| C04 \| Load accounts and contacts \| Ben Carter \| In progress \| 2027-01-02 22:30 \| 1 h \|/);
  const again = await release.cutoverStatus(RUNSHEET, { asOf: '2027-01-02 23:30', snapshotDir: path.join(dir, 'Cutover') });
  assert.equal(path.basename(again.saved), '2027-01-02 2330 (2).md', 'snapshots are never overwritten');
});

test('cutover status tolerates missing columns, unknown dependencies and loops', async () => {
  const f = await book(path.join(temp, 'mini.xlsx'), { Steps: [
    ['Step', 'Planned start', 'Duration (min)', 'Depends on', 'Status'],
    ['Freeze', '2027-01-02 18:00', 30, '', 'Done'],
    ['Load', '2027-01-02 18:30', 60, '1, 9', ''],
    ['Check A', '2027-01-02 19:30', 30, '4', ''],
    ['Check B', '2027-01-02 19:30', 30, '3', 'Blocked'],
  ] });
  const r = await release.cutoverStatus(f, { asOf: '2027-01-02 18:45' });
  assert.ok(r.warnings.some((w) => /depends on "9"/.test(w)));
  assert.ok(r.warnings.some((w) => /loop/.test(w)));
  assert.deepEqual(r.blocked.map((s) => s.step), ['4']);
  assert.equal(r.projectedFinish, '2027-01-02 20:00');
  assert.equal(r.rag.rating, 'Red', 'a blocked critical step is Red');
  assert.ok(['Amber', 'Red'].includes(r.rag.rating));
  const onTime = await release.cutoverStatus(f, { asOf: '2027-01-02 18:10' });
  assert.equal(onTime.late.length, 0);
});

test('hypercare trends: weekly counts by severity and exit criteria pass/fail', async () => {
  const r = await release.hypercareTrends(DEFECTS, { asOf: '2027-02-01' });
  assert.equal(r.verdict, 'Not ready to close');
  assert.deepEqual(r.exitCriteria.map((c) => c.result), ['Pass', 'Fail', 'Pass', 'Pass']);
  assert.match(r.exitCriteria[0].evidence, /last one closed on 2027-01-14/);
  assert.deepEqual(r.exitCriteria[1].defects.map((d) => d.id), ['5108']);
  assert.equal(r.weekly[0].weekOf, '2027-01-04');
  assert.deepEqual(r.weekly.slice(0, 4).map((w) => w.openAtEnd), [5, 6, 5, 4]);
  assert.equal(r.weekly[0].bySeverity.opened.Sev1, 2);
  assert.deepEqual(r.openBySeverity, { Sev1: 0, Sev2: 1, Sev3: 1, Sev4: 2 });
  assert.match(r.triage.summary, /14 defects, 4 open/);
  const custom = await release.hypercareTrends(DEFECTS, { asOf: '2027-02-01', exitCriteria: ['No open defect older than 14 days', 'No Sev1 open for 30 days', 'Fewer than 3 Sev3 open', 'Ask the business'] });
  assert.deepEqual(custom.exitCriteria.map((c) => c.result), ['Fail', 'Fail', 'Pass', 'Not checked']);
  assert.ok(custom.exitCriteria[0].defects.some((d) => d.id === '5110' && d.ageDays === 18));
  assert.equal(custom.verdict, 'Not ready to close');
});

test('exit criteria are read from plain words', () => {
  const p = release.parseCriterion;
  assert.deepEqual([p('No Sev1 open for 10 days').type, p('No Sev1 open for 10 days').days, p('No Sev1 open for 10 days').maxSeverity], ['noneFor', 10, 1]);
  assert.deepEqual([p('No Sev1 or Sev2 open').type, p('No Sev1 or Sev2 open').max, p('No Sev1 or Sev2 open').maxSeverity], ['count', 0, 2]);
  assert.equal(p('Fewer than 5 open defects').max, 4);
  assert.equal(p('At most 5 open defects').max, 5);
  assert.equal(p('No critical defects open for 2 weeks').days, 14);
  assert.equal(p('Open defects falling for 3 weeks').weeks, 3);
  assert.equal(p('Something else').type, 'unknown');
});

test('release tools are exposed and read-only; the cutover snapshot needs edit access', () => {
  const root = fs.mkdtempSync(path.join(temp, 'ws-'));
  fs.copyFileSync(RUNSHEET, path.join(root, path.basename(RUNSHEET)));
  fs.copyFileSync(CHECKLIST, path.join(root, path.basename(CHECKLIST)));
  const run = (readonly, name, args) => {
    const input = [{ jsonrpc: '2.0', id: 1, method: 'tools/list' }, { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name, arguments: args } }].map((x) => JSON.stringify(x)).join('\n') + '\n';
    const out = spawnSync(process.execPath, [path.join(__dirname, '..', 'tools', 'office-mcp.js')], { input, encoding: 'utf8', env: { ...process.env, OFFICE_MCP_ROOT: root, OFFICE_MCP_READONLY: readonly ? '1' : '0' } });
    return out.stdout.trim().split('\n').map((l) => JSON.parse(l));
  };
  const [list, ready] = run(true, 'check_readiness', { path: path.basename(CHECKLIST), asOf: '2026-12-31' });
  assert.ok(['check_readiness', 'cutover_status', 'hypercare_trends'].every((n) => list.result.tools.some((t) => t.name === n)));
  assert.ok(!ready.result.isError, ready.result.content[0].text);
  assert.match(ready.result.content[0].text, /"rating": "Red"/);
  const [, ro] = run(true, 'cutover_status', { path: path.basename(RUNSHEET), asOf: '2027-01-02 23:30', snapshot: true });
  assert.ok(!ro.result.isError, ro.result.content[0].text);
  assert.match(ro.result.content[0].text, /snapshot was not saved/);
  assert.ok(!fs.existsSync(path.join(root, 'Cutover')));
  const [, rw] = run(false, 'cutover_status', { path: path.basename(RUNSHEET), asOf: '2027-01-02 23:30', snapshot: true });
  assert.match(rw.result.content[0].text, /"saved":/);
  assert.ok(fs.existsSync(path.join(root, 'Cutover', '2027-01-02 2330.md')));
});

test('release agents, prompts and skill are wired up', () => {
  const assistants = require('../lib/builtin-agents').all();
  const recipes = require('../defaults/recipes.json');
  const skills = require('../lib/skills').all();
  const skill = skills.find((s) => s.id === 'release-cutover');
  assert.ok(skill);
  const { TOOLS } = require('../tools/office-mcp');
  for (const t of [...skill.readTools, ...skill.writeTools]) assert.ok(TOOLS.some((x) => x.name === t), `${t} exists`);
  for (const [id, emoji] of [['release-readiness', '🚦'], ['runbook-writer', '📗'], ['cutover-coordinator', '⏱️'], ['hypercare-analyst', '📉']]) {
    const a = assistants.find((x) => x.id === id);
    assert.ok(a, id);
    assert.equal(a.emoji, emoji);
    assert.ok(a.skills.includes('release-cutover'));
    assert.ok(a.skills.every((s) => skills.some((k) => k.id === s)), `${id} uses known skills`);
  }
  const cat = recipes.filter((r) => r.category === 'Release');
  assert.deepEqual(cat.map((r) => r.name), ['Generate cutover checklist', 'Readiness check', 'Draft the runbook', 'Cutover status update', 'Hypercare closure report']);
  assert.ok(cat.every((r) => assistants.some((a) => a.id === r.assistantId)));
  assert.ok(cat.every((r) => r.fields.every((f) => r.template.includes(`{{${f.key}}}`))), 'every field is used in its template');
  const labels = require('../lib/tool-labels');
  assert.match(labels.officeLabel('cutover_status', { path: 'x/Run-sheet.xlsx' }).label, /Checking cutover progress in Run-sheet\.xlsx/);
});

test('the runbook is saved as Word in the program runbook template', async () => {
  const recipe = require('../defaults/recipes.json').find((r) => r.id === 'release-runbook');
  const field = recipe.fields.find((f) => f.key === 'template');
  assert.ok(field && field.optional && /\.dotx/.test(field.accept), 'optional Word template field');
  assert.match(recipe.template, /word: true and the Word template \{\{template\}\}/);
  assert.match(recipe.template, /Templates\/Runbook Template\.dotx/);
  const writer = require('../lib/builtin-agents').all().find((a) => a.id === 'runbook-writer');
  assert.match(writer.instructions, /Runbook Template\.dotx/);

  const JSZip = require('jszip');
  const template = path.join(__dirname, '..', 'samples', 'aidlc', 'Templates', 'Runbook Template.dotx');
  assert.ok(fs.existsSync(template), 'sample runbook template exists');
  const r = await require('../tools/change').saveDraft(path.join(temp, 'Runbook - Contoso CRM (draft).md'),
    '# Overview and contacts\n\nService desk: 555-0100.\n\nSource: TDD > 1 Overview\n', { word: true, template, sources: ['TDD.md'], title: 'Runbook - Contoso CRM' });
  assert.deepEqual(r.warnings, []);
  const zip = await JSZip.loadAsync(fs.readFileSync(r.word));
  const original = await JSZip.loadAsync(fs.readFileSync(template));
  assert.equal(await zip.file('word/styles.xml').async('string'), await original.file('word/styles.xml').async('string'), 'program styles kept');
  assert.match(await zip.file('word/header1.xml').async('string'), /Runbook - Contoso CRM[\s\S]*Operational Runbook/);
  const doc = await zip.file('word/document.xml').async('string');
  assert.match(doc, /Overview and contacts/);
  assert.doesNotMatch(doc, /\{\{content\}\}/);
});
