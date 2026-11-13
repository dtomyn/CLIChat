const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const oa = require('../tools/openapi');
const data = require('../tools/data');

const SAMPLE = path.join(__dirname, '..', 'samples', 'aidlc');
const SPEC = path.join(SAMPLE, 'Integration', 'permit-renewal-api.yaml');
const ICD = path.join(SAMPLE, 'Integration', 'ICD - Case API (draft).md');
const STANDARDS = path.join(SAMPLE, 'Knowledge', 'API Standards.md');
const BLUEPRINT = path.join(SAMPLE, 'Knowledge', 'Solution Blueprint - Permit Renewal.md');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lumen-openapi-'));
test.after(() => fs.rmSync(temp, { recursive: true, force: true }));
const copyDir = (from, to) => { fs.mkdirSync(to, { recursive: true }); for (const e of fs.readdirSync(from, { withFileTypes: true })) { const a = path.join(from, e.name), b = path.join(to, e.name); if (e.isDirectory()) copyDir(a, b); else fs.copyFileSync(a, b); } };

/** The sample spec with its two seeded flaws fixed. */
const fixedSpecText = () => fs.readFileSync(SPEC, 'utf8').replace(/\r\n/g, '\n')
  .replace("$ref: '#/components/schemas/EligibilityResult'", "$ref: '#/components/schemas/EligibilityDecision'")
  .replace("                $ref: '#/components/schemas/Photo'\n", "                $ref: '#/components/schemas/Photo'\n        '400':\n          $ref: '#/components/responses/BadRequest'\n");

test('the YAML subset parser reads mappings, sequences, flow values, quotes, block text and comments', () => {
  const lines = new Map();
  const doc = oa.parseYaml([
    '# comment', 'openapi: 3.0.3', 'info:', '  title: "A: quoted # not a comment"', "  version: '1.0'", '  description: |', '    Line one', '    Line two', '  summary: >-', '    folded', '    text',
    'tags: [a, "b c", 3]', 'empty: {}', 'map: {x: 1, y: [true, null]}', 'list:', '  - one', '  - name: two  # trailing comment', '    in: path', '  -', '    - nested', 'seq:', '- at key indent', 'n: -2.5', 'nul: ~', "'200': ok",
  ].join('\r\n'), { lines });
  assert.deepEqual(doc, {
    openapi: '3.0.3', info: { title: 'A: quoted # not a comment', version: '1.0', description: 'Line one\nLine two\n', summary: 'folded text' },
    tags: ['a', 'b c', 3], empty: {}, map: { x: 1, y: [true, null] }, list: ['one', { name: 'two', in: 'path' }, ['nested']], seq: ['at key indent'], n: -2.5, nul: null, 200: 'ok',
  });
  assert.equal(lines.get("$.list[1].in"), 18);
  assert.equal(lines.get("$['200']"), 25);
  assert.throws(() => oa.parseYaml('a: 1\n  b: 2'), /line 2.*indentation/);
  assert.throws(() => oa.parseYaml('a: &x 1'), /anchors/);
  assert.throws(() => oa.parseYaml('a: 1\na: 2'), /appears twice/);
  assert.throws(() => oa.parseYaml('a:\n\tb: 1'), /tabs/);
});

test('toYaml writes YAML that reads back to the same value', () => {
  const { doc } = oa.parseSpecText(fs.readFileSync(SPEC, 'utf8'));
  assert.deepEqual(oa.parseYaml(oa.toYaml(doc)), doc);
  const odd = { 'x-y': ['a: b', '', 'true', '012', ' pad', 'multi\nline\n', { k: [[1, 2], []], '#k': 'v' }], n: null, b: false, '/v1/x/{id}': { get: {} } };
  assert.deepEqual(oa.parseYaml(oa.toYaml(odd)), odd);
});

test('the API standards are read from the Rule | Value table', () => {
  const r = oa.readStandards(STANDARDS);
  assert.deepEqual([r.versionPrefix, r.pathCase, r.propertyCase, r.operationId, r.errorSchema, r.errorCodes, r.requiredHeaders, r.traces], ['/v1/', 'kebab-case', 'camelCase', true, 'Problem', ['400', '401', '500'], ['X-Correlation-ID'], true]);
  assert.match(r.at.errorCodes, /^API Standards\.md:\d+$/);
});

test('the validator finds both seeded flaws in the sample spec, with JSON paths and lines', () => {
  const r = oa.validateOpenApi(SPEC, { standards: STANDARDS });
  assert.equal(r.valid, false);
  assert.equal(r.operations.length, 4);
  assert.deepEqual(r.errors.map((e) => e.path), [
    "$.paths['/v1/renewals/{renewalId}/eligibility'].post.responses['200'].content['application/json'].schema.$ref",
    "$.paths['/v1/renewals/{renewalId}/photo'].post.responses",
  ]);
  assert.match(r.errors[0].message, /EligibilityResult.*does not resolve/);
  assert.match(r.errors[1].message, /missing the 400 error response/);
  assert.ok(r.errors.every((e) => Number.isInteger(e.line)));
  assert.equal(fs.readFileSync(SPEC, 'utf8').split(/\r?\n/)[r.errors[0].line - 1].trim(), "$ref: '#/components/schemas/EligibilityResult'");
  assert.deepEqual(r.warnings, []);
  // Without standards the broken $ref is still an error; the photo operation still declares 401 and 500, so no warning.
  const s = oa.validateOpenApi(SPEC);
  assert.deepEqual(s.errors.map((e) => e.path), [r.errors[0].path]);
  assert.match(s.summary, /structure only/);
});

test('structural checks: path parameters, bodies without schemas, duplicates, success responses, Swagger 2', () => {
  const doc = {
    openapi: '3.0.3', info: { title: 'T' },
    paths: {
      '/things/{id}': { get: { operationId: 'a', responses: { 404: { description: 'x' } } }, put: { operationId: 'a', requestBody: { content: { 'application/json': {} } }, parameters: [{ name: 'id', in: 'path' }, { name: 'other', in: 'path', required: true }], responses: { 200: { description: 'ok', content: { 'application/json': {} } }, abc: { description: 'bad' } } } },
      'things': { post: { responses: {} } },
    },
  };
  const r = oa.validateSpec(doc, { requireTraces: true });
  const msgs = r.errors.map((e) => e.message).join('\n');
  for (const re of [/no version/, /GET \/things\/\{id\} doesn't declare the path parameter "id"/, /has no success \(2xx\) response/, /operationId "a" is also used by GET/, /request body of PUT .* has no schema/, /path parameter "id" of PUT .* must be required/, /declares a path parameter "other"/, /200 application\/json response of PUT .* has no schema/, /"abc" is not a valid response code/, /must start with "\/"/, /POST things has no responses/, /has no x-traces-to/]) assert.match(msgs, re);
  assert.ok(r.warnings.some((w) => /POST things has no operationId/.test(w.message)));
  assert.match(oa.validateSpec({ swagger: '2.0', info: { title: 't', version: '1' }, paths: { '/a': {} } }).errors[0].message, /Swagger 2\.0/);
  const bad = path.join(temp, 'broken.yaml'); fs.writeFileSync(bad, 'openapi: 3.0.3\ninfo:\n  title: x\n   version: 1\n');
  const b = oa.validateOpenApi(bad);
  assert.equal(b.valid, false); assert.equal(b.errors[0].line, 4);
  assert.throws(() => oa.validateOpenApi(STANDARDS), /must be an OpenAPI file/);
});

test('a generated spec passes the validator and every operation has x-traces-to', async () => {
  const model = await data.readSchema(path.join(SAMPLE, 'Knowledge', 'Data Model - Permit Renewal.xlsx'));
  const out = path.join(temp, 'Integration', 'permit-renewal-api.yaml');
  const r = oa.writeOpenApi(out, fixedSpecText(), { standards: STANDARDS, models: [model] });
  assert.equal(r.valid, true, JSON.stringify(r.errors));
  assert.ok(r.operations.length === 4 && r.operations.every((o) => o.tracesTo.length && o.tracesTo.every((t) => /^(BR|FD)-/.test(t))));
  assert.ok(r.schemasAdded.includes('Permit'));
  const again = oa.validateOpenApi(r.saved, { standards: STANDARDS });
  assert.equal(again.valid, true);
  assert.ok(again.warnings.every((w) => /not camelCase/.test(w.message) === false), 'model properties are camelCase');
  // Never overwrites; an operation without x-traces-to is an error.
  const { doc } = oa.parseSpecText(fixedSpecText());
  delete doc.paths['/v1/renewals'].post['x-traces-to'];
  const r2 = oa.writeOpenApi(out, doc, { standards: STANDARDS });
  assert.equal(path.basename(r2.saved), 'permit-renewal-api (2).yaml');
  assert.deepEqual(r2.errors.map((e) => e.path), ["$.paths['/v1/renewals'].post['x-traces-to']"]);
  const j = oa.writeOpenApi(path.join(temp, 'spec.json'), doc, { requireTraces: false });
  assert.equal(j.valid, true);
  assert.deepEqual(JSON.parse(fs.readFileSync(j.saved, 'utf8')), doc);
  assert.throws(() => oa.writeOpenApi(path.join(temp, 'x.txt'), doc), /\.yaml, \.yml or \.json/);
});

test('schemasFromModel turns a readSchema result into component schemas', async () => {
  const s = oa.schemasFromModel(await data.readSchema(path.join(__dirname, '..', 'samples', 'data', 'Source DDL - Applications.sql')));
  const app = s.Applications;
  assert.ok(app.required.includes('appId'));
  assert.deepEqual(app.properties.appType.enum, ['NEW', 'RENEWAL', 'AMEND']);
  assert.deepEqual([app.properties.feeAmt.type, app.properties.appId.maxLength], ['number', 9]);
});

test('scaffolding is refused for a spec with errors and generated for a valid one', () => {
  const dir = path.join(temp, 'scaffold'); fs.mkdirSync(dir, { recursive: true });
  const flawed = path.join(dir, 'flawed.yaml'); fs.copyFileSync(SPEC, flawed);
  const no = oa.generateScaffold(flawed, { standards: STANDARDS, root: dir });
  assert.equal(no.written, false); assert.equal(no.refused.length, 2);
  assert.ok(!fs.existsSync(path.join(dir, 'API')));
  const good = path.join(dir, 'good.yaml'); fs.writeFileSync(good, fixedSpecText());
  const stack = oa.stackFrom(fs.readFileSync(BLUEPRINT, 'utf8'));
  assert.equal(stack, 'dotnet');
  const g = oa.generateScaffold(good, { stackText: fs.readFileSync(BLUEPRINT, 'utf8'), standards: STANDARDS, root: dir });
  assert.equal(g.written, true); assert.equal(g.stack, 'dotnet'); assert.equal(g.folder, 'API/Permit Renewal API');
  const f = (p) => fs.readFileSync(path.join(dir, g.folder, p), 'utf8');
  const index = JSON.parse(f('mock/index.json'));
  assert.equal(index.responses.filter((x) => x.operationId === 'checkEligibility').length, 4);
  assert.deepEqual(JSON.parse(f('mock/checkEligibility.200.json')).response.body, { eligible: true, reasonCode: 'OK', decidedAt: '2026-11-07T09:00:00Z' });
  assert.equal(JSON.parse(f('mock/startRenewal.201.json')).response.body.renewalId, 'RN0001234');
  assert.match(f('src/Controllers/EligibilityController.cs'), /Traces to: BR-002\.1, BR-002\.2, BR-002\.3, FD-012[\s\S]*\[HttpPost\("v1\/renewals\/\{renewalId\}\/eligibility"\)\][\s\S]*ActionResult<EligibilityDecision> CheckEligibility\(\[FromRoute\] string renewalId\)/);
  assert.match(f('src/Models/Renewal.cs'), /public string RenewalId \{ get; init; \} = string\.Empty;[\s\S]*public DateOnly\? DraftExpiresOn/);
  assert.match(f('tests/RenewalsContractTests.cs'), /Assert\.Contains\("\\"renewalId\\""/);
  assert.ok(g.operations.every((o) => o.tracesTo.length));
  // A second run goes to a numbered folder; the other stacks.
  const n = oa.generateScaffold(good, { stack: 'node', root: dir });
  assert.equal(n.folder, 'API/Permit Renewal API (2)');
  assert.match(fs.readFileSync(path.join(dir, n.folder, 'src', 'routes', 'eligibility.js'), 'utf8'), /router\.post\('\/v1\/renewals\/:renewalId\/eligibility'/);
  const p = oa.generateScaffold(good, { stack: 'Python with FastAPI', root: dir });
  assert.equal(p.stack, 'python');
  assert.match(fs.readFileSync(path.join(dir, p.folder, 'app', 'models.py'), 'utf8'), /class Problem\(BaseModel\):[\s\S]*detail: Optional\[str\] = None/);
  for (const r of [g, n, p]) for (const file of r.saved) if (/\.js$/.test(file)) assert.equal(spawnSync(process.execPath, ['--check', path.join(dir, file)]).status, 0, `${file} is valid JavaScript`);
  assert.match(oa.generateScaffold(good, { root: dir }).stackNote, /No stack was named/);
});

test('the ICD completeness log lists the empty and missing sections of the draft ICD', () => {
  const r = oa.checkIcd(ICD);
  assert.equal(r.complete, false);
  assert.deepEqual(r.empty, ['Integration pattern (HIP / ARO P4 or P5)', 'Error handling', 'Service levels (SLAs)']);
  assert.deepEqual(r.missing, ['Volumes']);
  assert.equal(r.sections.filter((s) => s.status === 'ok').length, 5);
  assert.equal(r.log.length, 4);
  assert.match(r.log[0], /^Empty: Integration pattern .*heading "4\. Integration pattern", line \d+/);
  const full = `# ICD: X\n\n## Purpose\nWhy.\n## Parties\nA and B.\n## Protocol\nREST.\n## HIP pattern\nARO P4.\n## Message schemas\nSee spec.\n## Error handling\nRetry 3 times.\n## Security\nOAuth.\n## SLAs\n99.5%.\n## Volumes\n| Measure | Value |\n|---|---|\n| Peak per hour | 400 |\n`;
  const ok = oa.icdCompleteness(full);
  assert.equal(ok.complete, true, ok.log.join('\n')); assert.equal(ok.score, 100);
  const weak = oa.icdCompleteness(full.replace('ARO P4.', 'Synchronous REST.').replace('Retry 3 times.', 'Retry 3 times. Needs input: dead-letter queue?'));
  assert.deepEqual(weak.incomplete, ['Integration pattern (HIP / ARO P4 or P5)', 'Error handling']);
  assert.deepEqual(oa.icdCompleteness(full, { sections: ['Purpose', 'Rollback plan'] }).missing, ['Rollback plan']);
});

test('the ICD check counts Needs input bullets and table cells, and matches the section heading, not a subheading', () => {
  // As an AI drafts it: schema subsections (one about error responses) before the Error handling section, and open
  // points as their own bullets or table cells next to sourced content.
  const icd = `# ICD: Case API\n\n## 1. Purpose and scope\nWhy.\n## 2. Parties\nPortal and case management.\n## 3. Protocol\nREST.\n## 4. Integration pattern\nARO P4.\n`
    + `## 5. Message schemas\nSee spec.\n### Problem (all error responses, RFC 7807)\ntype, title, status.\n`
    + `## 6. Error handling\nRetry 5xx 3 times.\n\n- Needs input: what happens after the third failure?\n`
    + `## 7. Security\nOAuth 2.0.\n## 8. Service levels\nP4 is under 2 s at p95.\n\n| Measure | Target |\n|---|---|\n| Availability | Needs input: 99.5%? |\n`
    + `## 9. Volumes\nAbout 180,000 renewals a year.\n`;
  const r = oa.icdCompleteness(icd);
  const errors = r.sections.find((s) => s.id === 'errors');
  assert.equal(errors.heading, '6. Error handling');
  assert.deepEqual(r.incomplete, ['Error handling', 'Service levels (SLAs)']);
  assert.match(errors.note, /1 line still marked Needs input/);
});

test('integration tools are exposed; write tools need edit access', () => {
  const root = path.join(temp, 'ws'); copyDir(SAMPLE, root);
  const run = (readonly, name, args) => {
    const input = [{ jsonrpc: '2.0', id: 1, method: 'tools/list' }, { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name, arguments: args } }].map((x) => JSON.stringify(x)).join('\n') + '\n';
    const out = spawnSync(process.execPath, [path.join(__dirname, '..', 'tools', 'office-mcp.js')], { input, encoding: 'utf8', env: { ...process.env, OFFICE_MCP_ROOT: root, OFFICE_MCP_READONLY: readonly ? '1' : '0' } });
    return out.stdout.trim().split('\n').map((l) => JSON.parse(l));
  };
  const [list, v] = run(true, 'validate_openapi', { path: 'permit-renewal-api.yaml', standards: 'API Standards.md' });
  assert.ok(['validate_openapi', 'check_icd', 'write_openapi', 'generate_api_scaffold'].every((n) => list.result.tools.some((t) => t.name === n)));
  assert.ok(!v.result.isError, v.result.content[0].text);
  assert.match(v.result.content[0].text, /EligibilityResult/);
  const [, icd] = run(true, 'check_icd', { path: 'Integration/ICD - Case API (draft).md' });
  assert.match(icd.result.content[0].text, /Missing: Volumes/);
  const [, files] = run(true, 'list_office_files', {});
  assert.match(files.result.content[0].text, /permit-renewal-api\.yaml/);
  const [, ro] = run(true, 'write_openapi', { path: 'Integration/new.yaml', spec: fixedSpecText() });
  assert.ok(ro.result.isError); assert.match(ro.result.content[0].text, /Editing files is turned off/);
  const [, rw] = run(false, 'write_openapi', { path: 'Integration/new.yaml', spec: fixedSpecText(), standards: 'Knowledge/API Standards.md', schemas: ['Knowledge/Data Model - Permit Renewal.xlsx'] });
  assert.ok(!rw.result.isError, rw.result.content[0].text);
  assert.ok(fs.existsSync(path.join(root, 'Integration', 'new.yaml')));
  const [, sc] = run(false, 'generate_api_scaffold', { spec: 'Integration/new.yaml', blueprint: 'Knowledge/Solution Blueprint - Permit Renewal.md', standards: 'Knowledge/API Standards.md' });
  assert.ok(!sc.result.isError, sc.result.content[0].text);
  assert.ok(fs.existsSync(path.join(root, 'Integration', 'API', 'Permit Renewal API', 'src', 'Controllers', 'EligibilityController.cs')));
  const [, out] = run(true, 'validate_openapi', { path: '../../outside.yaml' });
  assert.ok(out.result.isError);
});

test('integration agents, prompts and skill are wired up', () => {
  const assistants = require('../lib/builtin-agents').all();
  const recipes = require('../defaults/recipes.json');
  const skills = require('../lib/skills').all();
  const skill = skills.find((s) => s.id === 'integration-design');
  assert.ok(skill);
  const { TOOLS } = require('../tools/office-mcp');
  for (const t of [...skill.readTools, ...skill.writeTools]) assert.ok(TOOLS.some((x) => x.name === t), `${t} exists`);
  for (const [id, emoji] of [['interface-designer', '🔌'], ['api-designer', '🧾']]) {
    const a = assistants.find((x) => x.id === id);
    assert.ok(a, id);
    assert.equal(a.emoji, emoji);
    assert.ok(a.skills.includes('integration-design'));
    assert.ok(a.skills.every((s) => skills.some((k) => k.id === s)), `${id} uses known skills`);
  }
  const cat = recipes.filter((r) => r.category === 'Integration');
  assert.deepEqual(cat.map((r) => r.name), ['Draft an ICD', 'Design an API', 'Review an OpenAPI spec', 'Generate API scaffolding']);
  assert.ok(cat.every((r) => assistants.some((a) => a.id === r.assistantId)));
  assert.ok(cat.every((r) => r.fields.every((f) => r.template.includes(`{{${f.key}}}`))), 'every field is used in its template');
  const labels = require('../lib/tool-labels');
  assert.match(labels.officeLabel('validate_openapi', { path: 'x/api.yaml', standards: 'S.md' }).label, /Checking the API spec api\.yaml against S\.md/);
  assert.match(labels.officeLabel('check_icd', { path: 'ICD.md' }).label, /missing ICD sections/);
  assert.match(labels.officeLabel('generate_api_scaffold', { spec: 'a.yaml' }).label, /mock and code stubs from a\.yaml/);
});
