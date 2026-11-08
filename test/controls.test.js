const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const ExcelJS = require('exceljs');
const ctl = require('../tools/controls');

const SAMPLE = path.join(__dirname, '..', 'samples', 'security');
const CATALOGUE = path.join(SAMPLE, 'Control Catalogue (synthetic).xlsx');
const SCTM = path.join(SAMPLE, 'SCTM - Online Permit Renewal.xlsx');
const TDD = path.join(SAMPLE, 'Technical Design - Security.md');
const EVIDENCE = path.join(SAMPLE, 'Evidence');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lumen-ctl-'));
test.after(() => fs.rmSync(temp, { recursive: true, force: true }));
const hash = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const copyDir = (from, to) => { fs.mkdirSync(to, { recursive: true }); for (const e of fs.readdirSync(from, { withFileTypes: true })) { const a = path.join(from, e.name), b = path.join(to, e.name); if (e.isDirectory()) copyDir(a, b); else fs.copyFileSync(a, b); } };

test('control IDs, statuses and applicability are normalised', () => {
  assert.deepEqual(['ac-02', 'AC 2', 'SC-13 (1)', 'x1'].map(ctl.normId), ['AC-2', 'AC-2', 'SC-13(1)', 'X1']);
  assert.deepEqual(ctl.idsIn('AC-2 - access review 2026-10-15 and SC-13(1).pdf'), ['AC-2', 'SC-13(1)']);
  assert.deepEqual(ctl.idsIn('Patch report 2025-08-29.md'), []);
  assert.deepEqual(['Implemented', 'not implemented', 'In progress', 'Partially implemented', 'TBC', 'N/A'].map(ctl.statusOf), ['Implemented', 'Gap', 'Planned', 'Partially implemented', 'Needs input', 'Not applicable']);
  assert.deepEqual(['Yes', 'Not applicable', 'Inherited from the CSP', 'Hybrid'].map(ctl.applicabilityOf), ['Applicable', 'Not applicable', 'Inherited', 'Shared']);
});

test('the catalogue and SCTM are read with their cells', async () => {
  const cat = await ctl.readControlCatalogue(CATALOGUE);
  assert.equal(cat.controls.length, 20);
  assert.ok(cat.controls.every((c) => c.inProfile));
  assert.deepEqual([cat.controls[0].id, cat.controls[0].title, cat.controls[0].at], ['AC-2', 'Account management', 'Controls!A2']);
  const s = await ctl.readSctm(SCTM);
  assert.equal(s.rows.length, 16);
  const cm2 = s.rows.find((r) => r.control === 'CM-2');
  assert.deepEqual([cm2.status, cm2.evidence, cm2.at], ['Implemented', ['CM-2 - Configuration baseline scan.md'], 'SCTM!A9']);
});

test('design references must cite a real heading in the FDD/TDD', () => {
  const docs = ctl.readDesignDocs([TDD], SAMPLE);
  const ok = (ref) => ctl.citation(ref, docs);
  assert.equal(ok('Technical Design - Security.md > 3.2 Encryption at rest').heading, '3.2 Encryption at rest');
  assert.equal(ok('TDD > Key management').heading, '3.3 Key management');
  assert.equal(ok('TDD §5.2').heading, '5.2 Patch management');
  assert.equal(ok('TDD section 1').heading, '1 Identity and access');
  assert.equal(ok('TDD > 6.1 Hardware security modules').ok, false);
  assert.equal(ok('').reason, 'no design reference');
  assert.equal(ok('Technical Design - Security.md').ok, false, 'a document name alone cites no heading');
  assert.equal(ctl.citation('TDD > Key management', []).ok, null);
});

test('the evidence check reports the missing, stale and orphan items exactly', async () => {
  const s = await ctl.readSctm(SCTM);
  const cat = await ctl.readControlCatalogue(CATALOGUE);
  const r = await ctl.indexEvidence(EVIDENCE, s.rows, { known: cat.controls.map((c) => c.id), asOf: '2026-11-07', staleDays: 365, root: SAMPLE });
  assert.deepEqual(r.missing.map((m) => [m.control, m.ref]), [['CM-2', 'CM-2 - Configuration baseline scan.md'], ['AC-3', '']]);
  assert.deepEqual(r.stale.map((x) => [x.control, x.file, x.date, x.ageDays]), [['SI-2', 'Evidence/SI-2 - Monthly patch report 2025-08-29.md', '2025-08-29', 435]]);
  assert.deepEqual(r.orphans.map((o) => o.file), ['Evidence/Firewall rule export 2026-10-01.md']);
  const sc7 = r.perControl.find((p) => p.control === 'SC-7');
  assert.deepEqual(sc7.found.map((f) => [f.file, f.how, f.date, f.dateFrom]), [['Evidence/Network boundary diagram.md', 'evidence index', '2026-10-05', 'evidence index']]);
  assert.deepEqual(r.perControl.find((p) => p.control === 'AU-6').found.map((f) => f.how), ['file name'], 'tied by the ID in the file name even though the SCTM does not list it');
  assert.equal(r.files, 10);
  // A shorter window makes more files stale; an unknown control ID in a file name is an orphan with a reason.
  const dir = path.join(temp, 'ev'); copyDir(EVIDENCE, dir);
  fs.writeFileSync(path.join(dir, 'ZZ-9 - something.md'), 'x');
  const r2 = await ctl.indexEvidence(dir, s.rows, { known: cat.controls.map((c) => c.id), asOf: '2026-11-07', staleDays: 40 });
  assert.deepEqual(r2.stale.map((x) => x.control).sort(), ['SC-13', 'SI-2']);
  assert.match(r2.orphans.find((o) => /ZZ-9/.test(o.file)).reason, /ZZ-9, which is not in the catalogue/);
});

test('the analysis covers mapping, statements needing input and remediation', async () => {
  const before = hash(SCTM);
  const r = await ctl.analyzeControls({ catalogue: CATALOGUE, sctm: SCTM, evidence: EVIDENCE, documents: [TDD] }, { root: SAMPLE, asOf: '2026-11-07' });
  assert.deepEqual(r.coverage.notMapped.map((c) => c.control), ['AC-7', 'CM-6', 'IA-5', 'SC-12']);
  assert.deepEqual(r.coverage.byStatus, { Implemented: 11, Planned: 4, Gap: 1 });
  assert.deepEqual(r.statements.needsInput.map((x) => [x.control, x.reason.split(' ')[0]]), [['SC-13', 'no'], ['IR-4', 'no']]);
  assert.match(r.statements.needsInput[0].reason, /6\.1 Hardware security modules/);
  assert.deepEqual(r.statements.noStatement.map((x) => x.control), ['SI-4']);
  assert.ok(r.statements.citations.filter((c) => c.ok).every((c) => c.file === 'Technical Design - Security.md'));
  assert.deepEqual(r.remediation.map((x) => x.control), ['SI-4', 'CM-2', 'AC-3', 'SI-2']);
  assert.match(r.summary, /2 missing, 1 stale, 1 orphan/);
  assert.equal(hash(SCTM), before, 'read-only');
  const bare = await ctl.analyzeControls({ sctm: SCTM }, { root: SAMPLE });
  assert.ok(bare.notes.some((n) => /design references were not checked/.test(n)));
  assert.ok(bare.notes.some((n) => /evidence was not checked/.test(n)));
});

test('SCTM proposals go to a (proposed) copy; uncited statements are marked Needs input', async () => {
  const dir = path.join(temp, 'propose'); copyDir(SAMPLE, dir);
  const sctm = path.join(dir, 'SCTM - Online Permit Renewal.xlsx');
  const before = hash(sctm);
  const r = await ctl.proposeSctm(sctm, [
    { control: 'AC-7', statement: 'Accounts lock after five failed sign-ins.', designReference: 'TDD > Account lockout', status: 'Implemented' },
    { control: 'SC-12', statement: 'Keys and certificates are held in the key vault and renewed automatically.', designReference: 'Technical Design - Security.md > 3.3 Key management', status: 'Implemented', responsible: 'Cloud platform team' },
    { control: 'IA-5', statement: 'Passwords are managed somehow.', status: 'Planned' },
    { control: 'SC-13', designReference: 'TDD > 3.3 Key management' },
    { control: 'ZZ-9', statement: 'Not a control.' },
    { control: 'SI-4', status: 'Gap' },
  ], { catalogue: path.join(dir, 'Control Catalogue (synthetic).xlsx'), documents: [path.join(dir, 'Technical Design - Security.md')], root: dir });
  assert.equal(hash(sctm), before, 'the original SCTM is never modified');
  assert.equal(path.basename(r.saved), 'SCTM - Online Permit Renewal (proposed).xlsx');
  assert.deepEqual(r.needsInput.map((x) => [x.control, x.reason]), [['AC-7', 'no heading matching "TDD > Account lockout" in Technical Design - Security.md'], ['IA-5', 'no design reference']]);
  assert.deepEqual(r.rejected, [{ control: 'ZZ-9', reason: 'not in the control catalogue' }]);
  assert.equal(r.newRows, 3);
  const p = await ctl.readSctm(r.saved);
  const row = (id) => p.rows.find((x) => x.control === id);
  assert.equal(row('AC-7').status, 'Needs input');
  assert.equal(row('IA-5').status, 'Needs input');
  assert.equal(row('SC-12').status, 'Implemented');
  assert.equal(row('SC-12').title, 'Cryptographic key management');
  assert.equal(row('SC-13').designReference, 'TDD > 3.3 Key management');
  assert.equal(row('SC-13').status, 'Implemented', 'a fixed citation clears the problem');
  const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(r.saved);
  const ch = wb.getWorksheet('Proposed changes');
  assert.equal(ch.getCell('B1').value, 'Approve? (Yes/No)');
  const checks = []; ch.eachRow((x, n) => { if (n > 1) checks.push(`${x.getCell(4).value}|${x.getCell(5).value}|${x.getCell(8).value}`); });
  assert.ok(checks.some((c) => /^SC-13\|Design reference\|Cites Technical Design - Security\.md › 3\.3 Key management$/.test(c)));
  assert.ok(checks.some((c) => /^AC-7\|Status\|Needs input: no heading matching/.test(c)));
  assert.ok(r.remediation, 'the Gap row is written as a remediation item');
  const rb = new ExcelJS.Workbook(); await rb.xlsx.readFile(r.remediation);
  const rs = rb.getWorksheet('Remediation');
  assert.deepEqual([rs.getCell('A1').value, rs.getCell('B2').value, rs.getCell('G2').value], ['ID', 'Task', 'Security; SA&A; SI-4']);
  assert.match(rs.getCell('C2').value, /SI-4 \(System monitoring\)/);
  // Proposing again from the (proposed) copy never overwrites it.
  const again = await ctl.proposeSctm(r.saved, [{ control: 'CM-6', statement: 'Hardened templates.', designReference: 'TDD > 5.1 Configuration baseline' }], { root: dir, documents: [path.join(dir, 'Technical Design - Security.md')] });
  assert.notEqual(again.saved, r.saved);
  await assert.rejects(ctl.proposeSctm(sctm, [{ control: 'AC-2', status: 'Implemented' }]), /Nothing to propose/);
});

test('writeSctm writes a fresh SCTM that readSctm reads back', async () => {
  const f = path.join(temp, 'new sctm.xlsx');
  await ctl.writeSctm(f, [{ control: 'ac-2', applicability: 'Applicable', statement: 'S', designReference: 'TDD > 1.3', evidence: ['a.md', 'b.md'], status: 'Planned' }]);
  const s = await ctl.readSctm(f);
  assert.deepEqual([s.rows[0].control, s.rows[0].evidence, s.rows[0].designReference, s.rows[0].status], ['AC-2', ['a.md', 'b.md'], 'TDD > 1.3', 'Planned']);
});

test('security tools are exposed; write_sctm needs edit access', () => {
  const root = path.join(temp, 'ws'); copyDir(SAMPLE, root);
  const run = (readonly, name, args) => {
    const input = [{ jsonrpc: '2.0', id: 1, method: 'tools/list' }, { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name, arguments: args } }].map((x) => JSON.stringify(x)).join('\n') + '\n';
    const out = spawnSync(process.execPath, [path.join(__dirname, '..', 'tools', 'office-mcp.js')], { input, encoding: 'utf8', env: { ...process.env, OFFICE_MCP_ROOT: root, OFFICE_MCP_READONLY: readonly ? '1' : '0' } });
    return out.stdout.trim().split('\n').map((l) => JSON.parse(l));
  };
  const [list, an] = run(true, 'analyze_controls', { catalogue: 'Control Catalogue (synthetic).xlsx', sctm: 'SCTM - Online Permit Renewal.xlsx', evidence: 'Evidence', documents: ['Technical Design - Security.md'], asOf: '2026-11-07' });
  assert.ok(['analyze_controls', 'write_sctm'].every((n) => list.result.tools.some((t) => t.name === n)));
  assert.ok(!an.result.isError, an.result.content[0].text);
  assert.match(an.result.content[0].text, /Firewall rule export 2026-10-01\.md/);
  const rows = [{ control: 'AC-7', statement: 'Lockout.', designReference: 'TDD > Account lockout' }];
  const [, ro] = run(true, 'write_sctm', { sctm: 'SCTM - Online Permit Renewal.xlsx', rows });
  assert.ok(ro.result.isError);
  assert.match(ro.result.content[0].text, /Editing files is turned off/);
  const [, rw] = run(false, 'write_sctm', { sctm: 'SCTM - Online Permit Renewal.xlsx', catalogue: 'Control Catalogue (synthetic).xlsx', documents: ['Technical Design - Security.md'], rows });
  assert.ok(!rw.result.isError, rw.result.content[0].text);
  assert.ok(fs.existsSync(path.join(root, 'SCTM - Online Permit Renewal (proposed).xlsx')));
  const [, out] = run(true, 'analyze_controls', { sctm: '../../outside.xlsx' });
  assert.ok(out.result.isError);
});

test('security agents, prompts and skill are wired up', () => {
  const assistants = require('../defaults/assistants.json');
  const recipes = require('../defaults/recipes.json');
  const skills = require('../lib/skills').all();
  const skill = skills.find((s) => s.id === 'security-saa');
  assert.ok(skill);
  const { TOOLS } = require('../tools/office-mcp');
  for (const t of [...skill.readTools, ...skill.writeTools]) assert.ok(TOOLS.some((x) => x.name === t), `${t} exists`);
  for (const [id, emoji] of [['security-control-mapper', '🛡️'], ['security-documentation', '📘'], ['cae-evidence', '🗂️']]) {
    const a = assistants.find((x) => x.id === id);
    assert.ok(a, id);
    assert.equal(a.emoji, emoji);
    assert.ok(a.skills.includes('security-saa'));
    assert.ok(a.skills.every((s) => skills.some((k) => k.id === s)), `${id} uses known skills`);
  }
  const cat = recipes.filter((r) => r.category === 'Security');
  assert.deepEqual(cat.map((r) => r.name), ['Draft the SCTM', 'Security design document', 'Evidence gap check']);
  assert.ok(cat.every((r) => assistants.some((a) => a.id === r.assistantId)));
  assert.ok(cat.every((r) => r.fields.every((f) => r.template.includes(`{{${f.key}}}`))), 'every field is used in its template');
  const labels = require('../lib/tool-labels');
  assert.match(labels.officeLabel('analyze_controls', { sctm: 'x/SCTM.xlsx', evidence: 'Evidence' }).label, /Checking security controls and evidence in SCTM\.xlsx/);
  assert.match(labels.officeLabel('write_sctm', { rows: [{}, {}] }).label, /Proposing 2 SCTM rows/);
});
