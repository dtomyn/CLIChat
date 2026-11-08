const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const ExcelJS = require('exceljs');
const gov = require('../tools/governance');

const SAMPLE = path.join(__dirname, '..', 'samples', 'aidlc');
const ADRS = path.join(SAMPLE, 'Architecture', 'ADRs');
const BLUEPRINT = path.join(SAMPLE, 'Knowledge', 'Solution Blueprint - Permit Renewal.md');
const TDD = path.join(SAMPLE, 'Knowledge', 'Technical Design - Permit Renewal.md');
const MODEL = path.join(SAMPLE, 'Knowledge', 'Data Model - Permit Renewal.xlsx');
const INVENTORY = path.join(SAMPLE, 'Architecture', 'Technical Inventory.xlsx');
const GITLOG = path.join(SAMPLE, 'Architecture', 'Delivery changes - git log.txt');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lumen-gov-'));
test.after(() => fs.rmSync(temp, { recursive: true, force: true }));
const hash = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const copyDir = (from, to) => { fs.mkdirSync(to, { recursive: true }); for (const e of fs.readdirSync(from, { withFileTypes: true })) { const a = path.join(from, e.name), b = path.join(to, e.name); if (e.isDirectory()) copyDir(a, b); else fs.copyFileSync(a, b); } };

test('ADRs parse in Nygard and MADR style', () => {
  const ny = gov.parseAdr('# 7. Use the case API\n\n## Status\nSuperseded by ADR-9\n\n## Context\nWe need X.\n\n## Decision\nWe will use the Case API.\n\n## Consequences\nFine.', '0007-use-case-api.md');
  assert.deepEqual([ny.id, ny.title, ny.status, ny.supersededBy, ny.decision], ['ADR-007', 'Use the case API', 'Superseded', 'ADR-009', 'We will use the Case API.']);
  const madr = gov.parseAdr('---\nstatus: accepted\ndate: 2026-10-14\nsupersedes: ADR-002\n---\n# Photo validation service\n\n## Decision Outcome\nChosen option: a service.\n', 'ADR-003-x.md');
  assert.deepEqual([madr.id, madr.status, madr.date, madr.supersedes], ['ADR-003', 'Accepted', '2026-10-14', ['ADR-002']]);
  const madr2 = gov.parseAdr('# ADR-010: No status here\n\n* Date: 2026-01-02\n\n## Decision Outcome\nX', 'notes.md');
  assert.deepEqual([madr2.id, madr2.status, madr2.date], ['ADR-010', null, '2026-01-02']);
});

test('the ADR index flags the superseded ADR that the TDD still cites', () => {
  const r = gov.readAdrs(ADRS, { root: SAMPLE, referencedIn: [TDD] });
  assert.equal(r.count, 3);
  assert.deepEqual(r.index.map((a) => [a.id, a.status, a.supersededBy]), [['ADR-001', 'Accepted', null], ['ADR-002', 'Superseded', 'ADR-003'], ['ADR-003', 'Accepted', null]]);
  assert.deepEqual(r.findings.supersededReferenced.map((f) => [f.id, f.in, f.heading]), [['ADR-002', 'Knowledge/Technical Design - Permit Renewal.md', 'Photo validation']]);
  assert.equal(r.findings.noStatus.length, 0);
  assert.equal(JSON.parse(JSON.stringify(r))._byId, undefined, 'internal map is not serialised');
});

test('ADR findings: no status, status conflicts, unknown references and duplicate decisions', () => {
  const dir = fs.mkdtempSync(path.join(temp, 'adr-'));
  fs.writeFileSync(path.join(dir, 'ADR-001-a.md'), '# ADR-001: Use the enterprise notification service\n\n## Status\nAccepted\n\n## Decision\nWe will send all applicant emails through the enterprise notification service.\n');
  fs.writeFileSync(path.join(dir, 'ADR-002-b.md'), '# ADR-002: Send emails through the enterprise notification service\n\n## Status\nAccepted\n\n## Decision\nWe will send all applicant emails through the enterprise notification service. See ADR-001.\n');
  fs.writeFileSync(path.join(dir, 'ADR-003-c.md'), '# ADR-003: Something\n\nSupersedes ADR-001.\n\n## Decision\nRefers to ADR-042.\n');
  const r = gov.readAdrs(dir);
  assert.deepEqual(r.findings.noStatus.map((x) => x.id), ['ADR-003']);
  assert.ok(r.findings.statusConflicts.some((c) => c.id === 'ADR-001' && /status is "Accepted"/.test(c.note)));
  assert.ok(r.findings.unknownReferences.some((u) => u.id === 'ADR-042'));
  assert.ok(r.findings.supersededReferenced.some((s) => s.id === 'ADR-001' && /ADR-002/.test(s.in)), 'ADR-002 still cites the superseded ADR-001');
  assert.equal(r.findings.duplicateDecisions.length, 0, 'ADR-001 is superseded, so it is not compared');
  fs.writeFileSync(path.join(dir, 'ADR-003-c.md'), '# ADR-003: Something else\n\n## Status\nProposed\n\n## Decision\nUnrelated.\n');
  assert.deepEqual(gov.readAdrs(dir).findings.duplicateDecisions.map((d) => d.ids), [['ADR-001', 'ADR-002']]);
});

test('the consistency check finds the seeded component, ADR and data model mismatches', async () => {
  const before = hash(TDD);
  const r = await gov.checkConsistency([BLUEPRINT, TDD], { root: SAMPLE, adrs: ADRS, dataModel: MODEL });
  assert.deepEqual(r.findings.missingAcrossDocuments.map((f) => [f.name, f.usedIn[0].file, f.missingFrom]), [['Address lookup service', 'Knowledge/Technical Design - Permit Renewal.md', ['Knowledge/Solution Blueprint - Permit Renewal.md']]]);
  assert.deepEqual(r.findings.supersededAdrReferences.map((f) => [f.id, f.supersededBy, f.heading]), [['ADR-002', 'ADR-003', 'Photo validation']]);
  assert.deepEqual(r.findings.unknownAdrReferences, []);
  assert.deepEqual(r.findings.unknownEntities.map((e) => e.entity), ['Renewal Fee']);
  assert.deepEqual(r.findings.unknownFields.map((e) => `${e.entity}.${e.field}`), ['Permit.renewalCount']);
  assert.match(r.summary, /1 name missing from other documents, 1 reference to superseded ADRs/);
  assert.equal(hash(TDD), before, 'documents are not changed');
});

test('consistency: endpoints, standard versions and unknown ADRs; one document only gives a note', async () => {
  const dir = fs.mkdtempSync(path.join(temp, 'cc-'));
  const a = path.join(dir, 'api.md'), b = path.join(dir, 'tdd.md');
  fs.writeFileSync(a, '# API spec\n\n| API | Owner |\n|---|---|\n| Case API | Case team |\n\nGET /permits/{id}\nPOST /renewals\n\nMeets WCAG 2.1 AA.\n');
  fs.writeFileSync(b, '# TDD\n\n## Interfaces\n### Case API\nUses GET /permits/{id} only. Accessibility: WCAG 2.0 AA. See ADR-9.\n');
  const r = await gov.checkConsistency([a, b], { adrs: ADRS });
  assert.ok(r.findings.missingAcrossDocuments.some((f) => f.kind === 'endpoint' && f.name === 'POST /renewals' && f.missingFrom[0] === 'tdd.md'));
  assert.deepEqual(r.findings.standardsDiffer.map((s) => [s.standard, s.uses.map((u) => u.value)]), [['WCAG', ['WCAG 2.1 AA', 'WCAG 2.0 AA']]]);
  assert.deepEqual(r.findings.unknownAdrReferences.map((u) => u.id), ['ADR-009']);
  assert.ok(!r.findings.missingAcrossDocuments.some((f) => f.name === 'Case API'));
  const one = await gov.checkConsistency([a]);
  assert.match(one.notes[0], /only one document/i);
  await assert.rejects(gov.checkConsistency([]), /at least one design document/);
});

test('the gate pack includes only approved versions and lists what is missing', async () => {
  const root = path.join(temp, 'gate');
  copyDir(SAMPLE, root);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'Architecture', 'Design gate.json'), 'utf8'));
  const r = await gov.assembleGatePack(manifest, { root, now: new Date('2026-11-07T12:00:00Z') });
  assert.equal(r.ready, false);
  assert.deepEqual(r.included.map((i) => [i.name, i.file, i.approver]), [
    ['Technical Design', 'Knowledge/Technical Design - Permit Renewal.md', 'Solution Architect (fictional)'],
    ['Interface Catalogue', 'Architecture/Design/Interface Catalogue v1.0.md', 'Solution Architect (fictional)'],
  ]);
  assert.deepEqual(r.included[1].newerUnapproved, ['Architecture/Design/Interface Catalogue v1.1.md']);
  assert.deepEqual(r.missing.map((m) => [m.name, /no approved version/.test(m.reason) ? 'unapproved' : 'absent']), [['Solution Blueprint', 'unapproved'], ['Security Assessment', 'absent']]);
  assert.deepEqual(r.approvals.map((a) => [a.role, a.status]), [['Design Authority', 'Approved'], ['Business Owner', 'Open']]);
  assert.ok(r.openItems.some((o) => o.type === 'Newer draft'));
  const dir = path.join(root, 'Gate packs', 'Design gate');
  assert.deepEqual(fs.readdirSync(path.join(dir, 'Artefacts')).sort(), ['Interface Catalogue v1.0.md', 'Technical Design - Permit Renewal.md']);
  const index = fs.readFileSync(path.join(root, r.saved.index), 'utf8');
  assert.match(index, /\| Security Assessment \| Missing \|/);
  assert.doesNotMatch(index, /\| Included \| Architecture\/Design\/Interface Catalogue v1\.1/);
  const text = require('../tools/docx').docxToText(path.join(root, r.saved.pack));
  assert.match(text, /Interface Catalogue/);
  assert.doesNotMatch(text, /Address lookup API/, 'the unapproved v1.1 is not in the pack');
  const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(path.join(root, r.saved.openItems));
  assert.equal(wb.getWorksheet('Open items').rowCount, r.openItems.length + 1);
  const again = await gov.assembleGatePack(manifest, { root });
  assert.notEqual(again.saved.pack, r.saved.pack, 'an earlier pack is never overwritten');
  await assert.rejects(gov.assembleGatePack({ artefacts: [{ path: 'x' }] }, { root }), /Give the gate a name/);
});

test('a Word artefact counts as approved from its document properties', async () => {
  const root = fs.mkdtempSync(path.join(temp, 'gw-'));
  const md = require('../tools/md-export');
  fs.writeFileSync(path.join(root, 'FDD v2.docx'), (await md.toDocx('# FDD\n\nBody', { properties: { Approver: 'Grace Lead', 'Approved at': '2026-10-01T00:00:00Z', Version: '2.0' } })).buffer);
  fs.writeFileSync(path.join(root, 'FDD v3.docx'), (await md.toDocx('# FDD\n\nDraft', {})).buffer);
  const r = await gov.assembleGatePack({ gate: 'Build gate', artefacts: [{ name: 'FDD', path: 'FDD v3.docx' }] }, { root });
  assert.deepEqual([r.included[0].file, r.included[0].approver, r.included[0].version], ['FDD v2.docx', 'Grace Lead', '2.0']);
  assert.deepEqual(r.included[0].newerUnapproved, ['FDD v3.docx']);
  assert.equal(r.ready, true);
});

test('inventory updates go to a (proposed) copy only', async () => {
  const dir = fs.mkdtempSync(path.join(temp, 'inv-'));
  const inv = path.join(dir, path.basename(INVENTORY));
  fs.copyFileSync(INVENTORY, inv);
  const before = hash(inv);
  const r = await gov.diffInventory(inv, { gitLogs: [GITLOG], adrs: ADRS, documents: [TDD] }, { root: SAMPLE });
  assert.equal(hash(inv), before, 'the inventory is not changed');
  assert.equal(r.saved, path.join(dir, 'Technical Inventory (proposed).xlsx'));
  const by = (a) => r.proposals.filter((p) => p.action === a).map((p) => p.name).sort();
  assert.deepEqual(by('Retire'), ['Legacy kiosk interface']);
  assert.ok(by('Add').includes('Photo validation'));
  assert.ok(by('Add').includes('Address lookup service'));
  assert.ok(!by('Add').includes('Enterprise payment gateway'), 'names already in another column are not added');
  assert.ok(by('Update').includes('Eligibility service') && by('Update').includes('Case API'));
  const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(r.saved);
  const ps = wb.getWorksheet('Proposed changes');
  assert.equal(ps.getRow(1).getCell(2).value, 'Approve? (Yes/No)');
  const rows = []; ps.eachRow((row, n) => { if (n > 1) rows.push(row.values.slice(1)); });
  assert.ok(rows.some((x) => x[2] === 'Retire' && x[5] === 'Legacy kiosk interface' && x[8] === 'Retired'));
  assert.ok(rows.some((x) => x[2] === 'Update' && x[5] === 'Eligibility service' && x[8] === '2026-10-27'));
  assert.ok(rows.every((x) => !x[1]), 'nothing is pre-approved');
  const comp = wb.getWorksheet('Components');
  const added = []; comp.eachRow((row, n) => { if (n > 1 && row.getCell(5).value === 'Proposed (new)') added.push(row.getCell(1).value); });
  assert.ok(added.includes('Photo validation'));
  await assert.rejects(gov.diffInventory(inv, {}), /at least one change source/);
});

test('inventory: an Azure DevOps export can add, change and retire rows', async () => {
  const dir = fs.mkdtempSync(path.join(temp, 'ado-'));
  const inv = path.join(dir, 'inv.xlsx'), ado = path.join(dir, 'ado.xlsx');
  const w1 = new ExcelJS.Workbook(); w1.addWorksheet('Components').addRows([['Name', 'Status', 'Last changed'], ['Kiosk sync', 'Active', '2025-01-01'], ['Case API', 'Active', '2025-01-01']]); await w1.xlsx.writeFile(inv);
  const w2 = new ExcelJS.Workbook(); w2.addWorksheet('Items').addRows([['ID', 'Title', 'State', 'Changed Date'], [11, 'Decommission Kiosk sync', 'Done', '2026-10-01'], [12, 'Case API paging', 'Done', '2026-10-02'], [13, 'Build the address lookup service', 'Active', '2026-10-03']]); await w2.xlsx.writeFile(ado);
  const r = await gov.diffInventory(inv, { adoExports: [ado] });
  assert.deepEqual(r.proposals.map((p) => [p.action, p.name]), [['Retire', 'Kiosk sync'], ['Update', 'Case API'], ['Add', 'Address lookup service']]);
  assert.match(r.summary, /1 to add, 1 changed, 1 to retire, from 3 work items/);
});

test('git log parsing and component paths', () => {
  const c = gov.parseGitLog(fs.readFileSync(GITLOG, 'utf8'));
  assert.equal(c.length, 4);
  assert.deepEqual([c[0].hash, c[0].date, c[0].files.length], ['9f3c2a1', '2026-10-26', 3]);
  assert.deepEqual(gov.componentOfPath('services/photo-validation/src/index.js'), { name: 'photo-validation', parent: 'services' });
  assert.equal(gov.componentOfPath('README.md'), null);
});

test('architecture tools are exposed; gate packs and inventory proposals need edit access', () => {
  const root = path.join(temp, 'ws');
  copyDir(SAMPLE, root);
  const run = (readonly, name, args) => {
    const input = [{ jsonrpc: '2.0', id: 1, method: 'tools/list' }, { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name, arguments: args } }].map((x) => JSON.stringify(x)).join('\n') + '\n';
    const out = spawnSync(process.execPath, [path.join(__dirname, '..', 'tools', 'office-mcp.js')], { input, encoding: 'utf8', env: { ...process.env, OFFICE_MCP_ROOT: root, OFFICE_MCP_READONLY: readonly ? '1' : '0' } });
    return out.stdout.trim().split('\n').map((l) => JSON.parse(l));
  };
  const [list, cc] = run(true, 'check_consistency', { documents: ['Knowledge/Solution Blueprint - Permit Renewal.md', 'Knowledge/Technical Design - Permit Renewal.md'], adrs: 'Architecture/ADRs', dataModel: 'Knowledge/Data Model - Permit Renewal.xlsx' });
  assert.ok(['index_adrs', 'check_consistency', 'assemble_gate_pack', 'propose_inventory_updates'].every((n) => list.result.tools.some((t) => t.name === n)));
  assert.ok(!cc.result.isError, cc.result.content[0].text);
  assert.match(cc.result.content[0].text, /Address lookup service/);
  const [, idx] = run(true, 'index_adrs', { folder: 'Architecture/ADRs' });
  assert.match(idx.result.content[0].text, /"supersededBy": "ADR-003"/);
  const [, ro] = run(true, 'assemble_gate_pack', { manifest: 'Architecture/Design gate.json' });
  assert.ok(ro.result.isError);
  assert.match(ro.result.content[0].text, /Editing files is turned off/);
  assert.ok(!fs.existsSync(path.join(root, 'Gate packs')));
  const [, rw] = run(false, 'assemble_gate_pack', { manifest: 'Architecture/Design gate.json' });
  assert.ok(!rw.result.isError, rw.result.content[0].text);
  assert.ok(fs.existsSync(path.join(root, 'Gate packs', 'Design gate', 'Design gate - index.md')));
  const [, out] = run(false, 'assemble_gate_pack', { gate: 'Escape', artefacts: [{ name: 'x', path: '../../outside.md' }] });
  assert.ok(out.result.isError);
  assert.match(out.result.content[0].text, /outside the project folder/);
  const [, inv] = run(false, 'propose_inventory_updates', { inventory: 'Architecture/Technical Inventory.xlsx', gitLogs: ['Architecture/Delivery changes - git log.txt'] });
  assert.ok(!inv.result.isError, inv.result.content[0].text);
  assert.ok(fs.existsSync(path.join(root, 'Architecture', 'Technical Inventory (proposed).xlsx')));
});

test('architecture agents, prompts and skill are wired up', () => {
  const assistants = require('../defaults/assistants.json');
  const recipes = require('../defaults/recipes.json');
  const skills = require('../lib/skills').all();
  const skill = skills.find((s) => s.id === 'architecture');
  assert.ok(skill);
  const { TOOLS } = require('../tools/office-mcp');
  for (const t of [...skill.readTools, ...skill.writeTools]) assert.ok(TOOLS.some((x) => x.name === t), `${t} exists`);
  for (const [id, emoji] of [['architecture-reviewer', '🏛️'], ['adr-advisor', '🧭'], ['gate-pack-assembler', '📦'], ['inventory-keeper', '🗃️']]) {
    const a = assistants.find((x) => x.id === id);
    assert.ok(a, id);
    assert.equal(a.emoji, emoji);
    assert.ok(a.skills.includes('architecture'));
    assert.ok(a.skills.every((s) => skills.some((k) => k.id === s)), `${id} uses known skills`);
  }
  const cat = recipes.filter((r) => r.category === 'Architecture');
  assert.deepEqual(cat.map((r) => r.name), ['Architecture review', 'Draft an ADR', 'Reuse vs. build assessment', 'Assemble a gate pack', 'Update technical inventory']);
  assert.ok(cat.every((r) => assistants.some((a) => a.id === r.assistantId)));
  assert.ok(cat.every((r) => r.fields.every((f) => r.template.includes(`{{${f.key}}}`))), 'every field is used in its template');
  const labels = require('../lib/tool-labels');
  assert.match(labels.officeLabel('propose_inventory_updates', { inventory: 'x/Technical Inventory.xlsx' }).label, /Proposing updates to Technical Inventory\.xlsx/);
  assert.match(labels.officeLabel('assemble_gate_pack', { gate: 'Design gate' }).label, /Assembling the Design gate pack/);
});
