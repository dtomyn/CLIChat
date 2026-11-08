const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const ExcelJS = require('exceljs');
const data = require('../tools/data');

const SAMPLE = path.join(__dirname, '..', 'samples', 'data');
const EXTRACT = path.join(SAMPLE, 'Applications - source extract.csv');
const DICTIONARY = path.join(SAMPLE, 'Data Dictionary - Applications.xlsx');
const DDL = path.join(SAMPLE, 'Source DDL - Applications.sql');
const SILVER = path.join(SAMPLE, 'Silver - Canonical Application.schema.json');
const GOLD = path.join(SAMPLE, 'Gold - Application model.sql');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lumen-data-'));
test.after(() => fs.rmSync(temp, { recursive: true, force: true }));
const hash = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const copyDir = (from, to) => { fs.mkdirSync(to, { recursive: true }); for (const e of fs.readdirSync(from, { withFileTypes: true })) { const a = path.join(from, e.name), b = path.join(to, e.name); if (e.isDirectory()) copyDir(a, b); else fs.copyFileSync(a, b); } };

test('DDL is parsed: types, NOT NULL, keys, references, CHECK IN and comments', async () => {
  const s = await data.readSchema(DDL);
  assert.equal(s.format, 'SQL DDL');
  assert.deepEqual(s.entities.map((e) => [e.entity, e.schema, e.fields.length]), [['CLIENTS', 'src', 6], ['APPLICATIONS', 'src', 10]]);
  const app = s.entities[1];
  const f = (n) => app.fields.find((x) => x.name === n);
  assert.deepEqual([f('APP_ID').type, f('APP_ID').nullable, f('APP_ID').rules.unique, f('APP_ID').description], ['VARCHAR(9)', false, true, 'Application number, AP9999999']);
  assert.deepEqual(f('CLIENT_ID').rules.references, { entity: 'CLIENTS', field: 'CLIENT_ID' });
  assert.deepEqual(f('APP_TYPE').rules.allowed, ['NEW', 'RENEWAL', 'AMEND']);
  assert.deepEqual([f('FEE_AMT').type, f('FEE_AMT').family, f('LAST_UPD_TS').family, f('PROVINCE_CD').nullable], ['DECIMAL(10,2)', 'decimal', 'timestamp', true]);
  const inline = data.parseDdl('create table if not exists [dbo].[Thing] (\n  [Id] int identity(1,1) not null,\n  -- the label\n  Label nvarchar(50) null,\n  Amount numeric(12, 2) default 0,\n  constraint pk primary key ([Id])\n);');
  assert.deepEqual(inline[0].fields.map((x) => [x.name, x.type, x.nullable, x.description]), [['Id', 'INT', false, ''], ['Label', 'NVARCHAR(50)', true, 'the label'], ['Amount', 'NUMERIC(12, 2)', true, '']]);
});

test('JSON Schema and data dictionary workbooks are read', async () => {
  const j = await data.readSchema(SILVER);
  assert.equal(j.entity, 'Application');
  const f = (n) => j.fields.find((x) => x.name === n);
  assert.deepEqual([f('submittedOn').family, f('lastUpdatedAt').family, f('feeAmount').family, f('provinceCode').nullable, f('channelCode').nullable], ['date', 'timestamp', 'decimal', true, false]);
  assert.deepEqual(f('applicationType').rules.allowed, ['NEW', 'RENEWAL', 'AMEND']);
  const defs = data.parseJsonSchema({ $defs: { Address: { properties: { line1: { type: 'string' } }, required: ['line1'] } } }, 'x');
  assert.deepEqual(defs.map((e) => [e.entity, e.fields[0].nullable]), [['Address', false]]);
  const d = await data.readSchema(DICTIONARY);
  assert.deepEqual(d.entities.map((e) => [e.entity, e.fields.length]), [['APPLICATIONS', 10], ['CLIENTS', 6]]);
  const id = d.entities[0].fields[0];
  assert.deepEqual([id.name, id.rules.required, id.rules.unique, id.rules.pattern, id.at], ['APP_ID', true, true, 'AP[0-9]{7}', 'Dictionary!B2']);
  assert.deepEqual(d.entities[0].fields[1].rules.references, { entity: 'CLIENTS', field: 'CLIENT_ID' });
  await assert.rejects(data.readSchema(path.join(SAMPLE, 'START HERE.md')), /must be SQL DDL/);
});

test('the shared reader still reads the AIDLC data model for governance', async () => {
  const s = await data.readSchema(path.join(__dirname, '..', 'samples', 'aidlc', 'Knowledge', 'Data Model - Permit Renewal.xlsx'));
  assert.ok(s.entities.some((e) => e.entity === 'Applicant' && e.fields.length === 0), 'entities without attributes are kept');
  assert.deepEqual(s.entities.find((e) => e.entity === 'Permit').fields.map((f) => f.name), ['permitNumber', 'permitType', 'expiryDate']);
});

test('compareSchemas matches exact, normalized and fuzzy names and lists unmatched fields on both sides', async () => {
  const c = await data.compareSchemas(DDL, SILVER, { sourceEntity: 'APPLICATIONS' });
  const pairs = Object.fromEntries(c.matches.map((m) => [m.source.field, [m.target.field, m.match]]));
  assert.deepEqual(pairs.CLIENT_ID, ['clientId', 'normalized']);
  assert.deepEqual(pairs.SUBMIT_DT, ['submittedOn', 'fuzzy']);
  assert.deepEqual(pairs.LAST_UPD_TS, ['lastUpdatedAt', 'fuzzy']);
  assert.equal(c.matches.length, 9);
  assert.deepEqual(c.unmatchedSource.map((f) => f.field), ['INTERNAL_NOTE_TXT']);
  assert.deepEqual(c.unmatchedTarget.map((f) => f.field), ['channelCode', 'languageCode']);
  const g = await data.compareSchemas(SILVER, GOLD, { targetEntity: 'fact_application' });
  assert.ok(g.matches.some((m) => m.source.field === 'applicationId' && m.target.field === 'application_id' && m.match === 'normalized'));
  assert.ok(g.unmatchedTarget.some((f) => f.field === 'application_key'));
  await assert.rejects(data.compareSchemas(DDL, SILVER, { sourceEntity: 'NOPE' }), /no entity called "NOPE"/);
});

test('type compatibility and name similarity', () => {
  assert.equal(data.typeCompatibility('INT', 'DECIMAL(10,2)').status, 'widening');
  assert.equal(data.typeCompatibility('VARCHAR(50)', 'VARCHAR(20)').status, 'narrowing');
  assert.equal(data.typeCompatibility('VARCHAR(10)', 'date').status, 'conversion');
  assert.equal(data.typeCompatibility('BOOLEAN', 'DATE').status, 'incompatible');
  assert.ok(data.nameSimilarity('EMAIL_ADDR', 'emailAddress') > 0.9);
  assert.ok(data.nameSimilarity('INTERNAL_NOTE_TXT', 'languageCode') < 0.4);
});

test('CSV parsing keeps quotes, embedded newlines and true line numbers', async () => {
  const p = data.parseCsv('a,b\n"x, y","line1\nline2"\n\n3,4\n');
  assert.deepEqual(p.rows, [['a', 'b'], ['x, y', 'line1\nline2'], ['3', '4']]);
  assert.deepEqual(p.lines, [1, 2, 5]);
  assert.deepEqual(['2026-02-30', '15/13/2026', '2026-03-01', '2026-03-01 10:15:00', '12.50', '007', 'yes'].map(data.kindOf), ['invalid date', 'invalid date', 'date', 'timestamp', 'decimal', 'text', 'boolean']);
  assert.equal(data.patternOf('AP-1001'), 'AA-9999');
});

test('profiling the sample flags every seeded defect with row examples', async () => {
  const before = hash(EXTRACT);
  const p = await data.profileTable(EXTRACT, { dictionary: DICTIONARY, root: SAMPLE });
  const got = p.findings.map((f) => [f.column, f.rule, f.examples.map((e) => e.row)]);
  assert.deepEqual(got, [
    ['APP_ID', 'unique', [36]],
    ['CLIENT_ID', 'foreign key', [24]],
    ['APP_TYPE', 'required', [13, 28]],
    ['SUBMIT_DT', 'type', [8, 20]],
    ['STATUS_CD', 'allowed values', [32]],
    ['APP_ID', 'pattern', [39]],
    ['FEE_AMT', 'outlier', [16]],
  ]);
  assert.equal(p.rows, 40);
  assert.equal(p.dictionary.entity, 'APPLICATIONS');
  const col = (n) => p.columns.find((c) => c.name === n);
  assert.deepEqual([col('SUBMIT_DT').inferredType, col('FEE_AMT').inferredType, col('APP_TYPE').nulls, col('APP_ID').patterns[0].pattern], ['date', 'decimal', 2, 'AA9999999']);
  assert.ok(col('EMAIL_ADDR').personal && col('EMAIL_ADDR').topValues.length === 0, 'personal columns show no values');
  assert.ok(p.findings.every((f) => f.examples.length <= 5));
  assert.equal(hash(EXTRACT), before, 'the extract is not changed');
});

test('profiling caps examples, masks personal values and works without a dictionary', async () => {
  const f = path.join(temp, 'people.csv');
  const rows = ['ID,EMAIL,JOINED'];
  for (let i = 0; i < 30; i++) rows.push(`${i + 1},user${i}@example.com,${i % 3 === 0 ? '2026-13-01' : `2026-01-${String(1 + i).padStart(2, '0')}`}`);
  fs.writeFileSync(f, rows.join('\n'));
  const dict = path.join(temp, 'people dictionary.xlsx');
  const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Fields');
  ws.addRow(['Entity', 'Field', 'Type', 'Required', 'Pattern']); ws.addRow(['people', 'EMAIL', 'Text', 'Yes', '[a-z]+@example\\.org']); ws.addRow(['people', 'ID', 'Integer', 'Yes', '']);
  await wb.xlsx.writeFile(dict);
  const p = await data.profileTable(f, { dictionary: dict });
  const pat = p.findings.find((x) => x.rule === 'pattern');
  assert.equal(pat.count, 30);
  assert.equal(pat.examples.length, 5);
  assert.ok(pat.examples.every((e) => !e.value.includes('@example.com')), 'emails are masked');
  assert.ok(p.findings.some((x) => x.column === 'JOINED' && x.rule === 'undocumented column'));
  const plain = await data.profileTable(f);
  const bad = plain.findings.find((x) => x.column === 'JOINED');
  assert.deepEqual([bad.rule, bad.count, bad.examples[0].row], ['type', 10, 2]);
  const s = await data.profileTable(EXTRACT, { dictionary: DICTIONARY, scripts: true, table: 'bronze.applications' });
  assert.match(s.scripts.pyspark, /spark\.read\.table\("bronze\.applications"\)/);
  assert.match(s.scripts.pyspark, /"APP_TYPE required"/);
  assert.match(s.scripts.sql, /FROM bronze\.applications/);
});

test('rules are translated to PySpark and SQL; unknown ones become TODOs', () => {
  assert.deepEqual(data.translateRule('direct', 'A'), { py: 'F.col("A")', sql: '`A`', recognised: true });
  const d = data.translateRule("trim then parse date format 'dd/MM/yyyy'", 'D');
  assert.equal(d.py, 'F.to_date(F.trim(F.col("D")), "dd/MM/yyyy")');
  assert.equal(d.sql, "TO_DATE(TRIM(`D`), 'dd/MM/yyyy')");
  assert.equal(data.translateRule("constant 'ONLINE'", '').py, 'F.lit("ONLINE")');
  assert.equal(data.translateRule("default 'EN'", 'L').sql, "COALESCE(`L`, 'EN')");
  assert.equal(data.translateRule('cast to decimal(10,2)', 'F').py, 'F.col("F").cast("decimal(10,2)")');
  assert.equal(data.translateRule('look up the client key in dim_client', 'C').todo, 'look up the client key in dim_client');
});

async function approve(file, rows) {
  const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(file);
  const ws = wb.getWorksheet('STTM');
  for (const r of rows) { ws.getCell(`L${r}`).value = 'Approved'; ws.getCell(`M${r}`).value = 'D. Reviewer'; }
  await wb.xlsx.writeFile(file);
}

test('the STTM lists unmatched fields on both sides and every row starts as Draft', async () => {
  const c = await data.compareSchemas(DDL, SILVER, { sourceEntity: 'APPLICATIONS' });
  const rows = c.matches.map((m) => ({ sourceEntity: m.source.entity, sourceField: m.source.field, rule: 'direct', targetLayer: 'silver', targetEntity: 'Application', targetField: m.target.field, status: 'Approved' }));
  const r = await data.writeSttm(path.join(temp, 'STTM.xlsx'), rows, { comparison: c });
  assert.deepEqual([r.rows, r.needsInput, r.unmatched], [12, 3, { source: 1, target: 2 }]);
  assert.match(r.warnings[0], /9 rows .* written as Draft/);
  const s = await data.readSttm(r.saved);
  assert.ok(s.rows.every((x) => x.status === 'Draft' && !x.approved && !x.reviewer));
  assert.deepEqual(s.rows.filter((x) => /^Needs input/.test(x.rule)).map((x) => x.sourceField || x.targetField), ['INTERNAL_NOTE_TXT', 'channelCode', 'languageCode']);
  assert.equal(s.rows[0].targetLayer, 'Silver');
  const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(r.saved);
  const u = wb.getWorksheet('Unmatched fields');
  assert.deepEqual([u.getCell('A2').value, u.getCell('C2').value, u.getCell('A3').value, u.getCell('C3').value, u.getCell('C4').value], ['Source', 'INTERNAL_NOTE_TXT', 'Target', 'channelCode', 'languageCode']);
  assert.ok(wb.getWorksheet('Match evidence'));
  const again = await data.writeSttm(path.join(temp, 'STTM.xlsx'), rows);
  assert.notEqual(again.saved, r.saved, 'never overwrites');
});

test('code is generated only for approved rows', async () => {
  const dir = fs.mkdtempSync(path.join(temp, 'gen-'));
  const c = await data.compareSchemas(DDL, SILVER, { sourceEntity: 'APPLICATIONS' });
  const rule = (f) => ({ SUBMIT_DT: "parse date format 'yyyy-MM-dd'", APP_TYPE: 'trim and upper' }[f] || 'direct');
  const rows = c.matches.map((m) => ({ sourceEntity: m.source.entity, sourceField: m.source.field, rule: rule(m.source.field), targetLayer: 'Silver', targetEntity: 'Application', targetField: m.target.field, targetType: m.target.type, dqRule: m.target.nullable ? '' : 'not null' }));
  const { saved } = await data.writeSttm(path.join(dir, 'STTM.xlsx'), rows, { comparison: c });
  await assert.rejects(data.generatePipelineCode(saved, { root: dir }), /No Approved rows/);
  assert.ok(!fs.existsSync(path.join(dir, 'Pipelines')), 'nothing is written while no row is approved');
  const s = await data.readSttm(saved);
  const rowOf = (f) => s.rows.find((x) => x.sourceField === f).row;
  await approve(saved, [rowOf('CLIENT_ID'), rowOf('SUBMIT_DT')]);
  const g = await data.generatePipelineCode(saved, { root: dir });
  assert.deepEqual(g.generatedFor.map((x) => x.target), ['Silver.Application.clientId', 'Silver.Application.submittedOn']);
  assert.equal(g.refused.length, 10);
  assert.ok(g.refused.every((x) => /not Approved/.test(x.reason)));
  assert.deepEqual(g.files, ['Pipelines/Silver - Application/application_load.py', 'Pipelines/Silver - Application/application_load.sql', 'Pipelines/Silver - Application/pl_silver_application.json', 'Pipelines/Silver - Application/test_application_load.py', 'Pipelines/Silver - Application/application_reconciliation.sql']);
  const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
  const py = read(g.files[0]);
  assert.match(py, /F\.col\("CLIENT_ID"\)\.alias\("clientId"\)/);
  assert.match(py, /F\.to_date\(F\.col\("SUBMIT_DT"\), "yyyy-MM-dd"\)\.alias\("submittedOn"\)/);
  assert.doesNotMatch(py, /applicationType|feeAmount/, 'unapproved rows get no code');
  assert.match(read(g.files[1]), /`CLIENT_ID` AS `clientId`,  -- STTM-\d+\n {2}TO_DATE/);
  assert.equal(JSON.parse(read(g.files[2])).name, 'pl_silver_application');
  assert.match(read(g.files[3]), /def test_target_columns/);
  assert.match(read(g.files[4]), /COUNT\(\*\) AS row_count, SUM\(xxhash64/);
});

test('data tools are exposed; write tools need edit access', () => {
  const root = path.join(temp, 'ws'); copyDir(SAMPLE, root);
  const run = (readonly, name, args) => {
    const input = [{ jsonrpc: '2.0', id: 1, method: 'tools/list' }, { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name, arguments: args } }].map((x) => JSON.stringify(x)).join('\n') + '\n';
    const out = spawnSync(process.execPath, [path.join(__dirname, '..', 'tools', 'office-mcp.js')], { input, encoding: 'utf8', env: { ...process.env, OFFICE_MCP_ROOT: root, OFFICE_MCP_READONLY: readonly ? '1' : '0' } });
    return out.stdout.trim().split('\n').map((l) => JSON.parse(l));
  };
  const [list, pr] = run(true, 'profile_data', { path: 'Applications - source extract.csv', dictionary: 'Data Dictionary - Applications.xlsx' });
  assert.ok(['profile_data', 'read_schema', 'compare_schemas', 'write_sttm', 'generate_pipeline_code'].every((n) => list.result.tools.some((t) => t.name === n)));
  assert.ok(!pr.result.isError, pr.result.content[0].text);
  assert.match(pr.result.content[0].text, /C-1999/);
  const [, cs] = run(true, 'compare_schemas', { source: 'Source DDL - Applications.sql', target: 'Silver - Canonical Application.schema.json', sourceEntity: 'APPLICATIONS' });
  assert.match(cs.result.content[0].text, /channelCode/);
  const [, rs] = run(true, 'read_schema', { path: 'Gold - Application model.sql' });
  assert.match(rs.result.content[0].text, /fact_application/);
  const args = { path: 'STTM - Applications.xlsx', source: 'Source DDL - Applications.sql', target: 'Silver - Canonical Application.schema.json', sourceEntity: 'APPLICATIONS', rows: [{ sourceField: 'APP_ID', targetField: 'applicationId', targetEntity: 'Application', targetLayer: 'Silver', rule: 'direct' }] };
  const [, ro] = run(true, 'write_sttm', args);
  assert.ok(ro.result.isError);
  assert.match(ro.result.content[0].text, /Editing files is turned off/);
  const [, rw] = run(false, 'write_sttm', args);
  assert.ok(!rw.result.isError, rw.result.content[0].text);
  assert.ok(fs.existsSync(path.join(root, 'STTM - Applications.xlsx')));
  const [, gen] = run(false, 'generate_pipeline_code', { sttm: 'STTM - Applications.xlsx' });
  assert.ok(gen.result.isError);
  assert.match(gen.result.content[0].text, /No Approved rows/);
  const [, out] = run(true, 'profile_data', { path: '../../outside.csv' });
  assert.ok(out.result.isError);
});

test('data agents, prompts and skill are wired up', () => {
  const assistants = require('../defaults/assistants.json');
  const recipes = require('../defaults/recipes.json');
  const skills = require('../lib/skills').all();
  const skill = skills.find((s) => s.id === 'data-engineering');
  assert.ok(skill);
  const { TOOLS } = require('../tools/office-mcp');
  for (const t of [...skill.readTools, ...skill.writeTools]) assert.ok(TOOLS.some((x) => x.name === t), `${t} exists`);
  assert.ok(!skill.readTools.some((t) => ['write_sttm', 'generate_pipeline_code'].includes(t)), 'writing tools need edit access');
  for (const [id, emoji] of [['data-profiler', '📊'], ['mapping-analyst', '🔀'], ['data-engineer', '🧱']]) {
    const a = assistants.find((x) => x.id === id);
    assert.ok(a, id);
    assert.equal(a.emoji, emoji);
    assert.ok(a.skills.includes('data-engineering'));
    assert.ok(a.skills.every((s) => skills.some((k) => k.id === s)), `${id} uses known skills`);
  }
  const cat = recipes.filter((r) => r.category === 'Data');
  assert.deepEqual(cat.map((r) => r.name), ['Profile a dataset', 'Compare schemas', 'Draft the STTM', 'Generate pipeline code from the STTM']);
  assert.ok(cat.every((r) => assistants.some((a) => a.id === r.assistantId)));
  assert.ok(cat.every((r) => r.fields.every((f) => r.template.includes(`{{${f.key}}}`))), 'every field is used in its template');
  const labels = require('../lib/tool-labels');
  assert.match(labels.officeLabel('profile_data', { path: 'x/A.csv', dictionary: 'D.xlsx' }).label, /Profiling A\.csv against D\.xlsx/);
  assert.match(labels.officeLabel('compare_schemas', { source: 'a.sql', target: 'b.json' }).label, /Comparing a\.sql with b\.json/);
  assert.match(labels.officeLabel('generate_pipeline_code', { sttm: 'STTM.xlsx' }).label, /approved rows of STTM\.xlsx/);
});
