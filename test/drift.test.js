const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const drift = require('../tools/drift');
const qe = require('../tools/tests');

const SAMPLE = path.join(__dirname, '..', 'samples', 'aidlc');
const ENVS = path.join(SAMPLE, 'Environments');
const sampleFiles = () => ['STE', 'UAT', 'PRD'].flatMap((e) => ['app-settings.env', 'deployment.yaml'].map((f) => path.join(ENVS, e, f)));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lumen-drift-'));
test.after(() => fs.rmSync(temp, { recursive: true, force: true }));
const put = (rel, text) => { const f = path.join(temp, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); return f; };
const copyDir = (from, to) => { fs.mkdirSync(to, { recursive: true }); for (const e of fs.readdirSync(from, { withFileTypes: true })) { const a = path.join(from, e.name), b = path.join(to, e.name); if (e.isDirectory()) copyDir(a, b); else fs.copyFileSync(a, b); } };

test('config files parse to flat keys: .env, JSON and multi-document Kubernetes YAML', () => {
  assert.deepEqual(drift.parseEnvText('# c\nexport A=1\nB = "two words"\nC=x # note\n[section]\nD: 4\n'), { A: '1', B: 'two words', C: 'x', D: '4' });
  assert.deepEqual(drift.parseConfig('{"db":{"host":"h","ports":[1,2]},"empty":{}}', 'a.json').keys, { 'db.host': 'h', 'db.ports[0]': '1', 'db.ports[1]': '2', empty: '{}' });
  const y = drift.parseConfig('kind: Deployment\nmetadata:\n  name: api\nspec:\n  template:\n    spec:\n      containers:\n        - name: web\n          image: reg/app:1.2\n---\nkind: Secret\nmetadata:\n  name: s\ndata:\n  password: c2VjcmV0\n', 'x.yaml');
  assert.equal(y.keys['Deployment/api.spec.template.spec.containers[web].image'], 'reg/app:1.2');
  assert.ok(y.secretKeys.has('Secret/s.data.password'));
  assert.equal(drift.envFromPath('Environments/UAT/app.env').env, 'UAT');
  assert.equal(drift.envFromPath('config/app.production.json').env, 'PRD');
  assert.equal(drift.envFromPath('config/app.json'), null);
});

test('rules: Markdown table, lines and JSON; the most specific pattern wins', () => {
  const { rules } = drift.parseRules('| Key | Rule |\n|---|---|\n| DB_HOST | env-specific |\n| FEATURE_* | must match |\n| BUILD_* | ignore |\n\n- OPTIONAL_X: optional\n');
  assert.deepEqual(rules.map((r) => [r.pattern, r.rule]), [['DB_HOST', 'env-specific'], ['FEATURE_*', 'must-match'], ['BUILD_*', 'ignore'], ['OPTIONAL_X', 'optional']]);
  assert.equal(drift.ruleFor('DB_HOST', rules), 'env-specific');
  assert.equal(drift.ruleFor('FEATURE_SMS', rules), 'must-match');
  assert.equal(drift.ruleFor('Deployment/api.spec.DB_HOST', rules), 'env-specific');
  assert.equal(drift.ruleFor('OTHER', rules), null);
  assert.deepEqual(drift.parseRules('{"envSpecific":["A"],"ignore":["B"]}').rules, [{ pattern: 'A', rule: 'env-specific' }, { pattern: 'B', rule: 'ignore' }]);
  assert.equal(drift.ruleFor('replicas', drift.parseRules('| Key | Rule |\n|---|---|\n| replicas | env-specific |\n| Deployment/*.spec.replicas | must-match |').rules), 'env-specific');
});

test('compare_configs on the STE/UAT/PRD sample finds the seeded missing key and tag drift, and masks the secret', () => {
  const r = drift.compareConfigs(sampleFiles(), { rules: path.join(ENVS, 'Config rules.md'), root: SAMPLE });
  assert.deepEqual(r.environments.map((e) => e.name), ['STE', 'UAT', 'PRD']);
  assert.deepEqual(r.missing.map((m) => [m.key, m.missingIn]), [['app-settings.env › NOTIFY_QUEUE_NAME', ['PRD']]]);
  const tag = r.drift.find((d) => /containers\[api\]\.image$/.test(d.key));
  assert.deepEqual(tag.values, { STE: '1.4.2', UAT: '1.4.1', PRD: '1.3.9-hotfix' });
  assert.deepEqual(tag.notPromoted, ['PRD']);
  assert.ok(!r.drift.some((d) => /photo-check/.test(d.key)), 'the same tag everywhere is not drift');
  assert.deepEqual(r.differs.map((d) => [d.key, d.rule]), [['app-settings.env › PHOTO_MAX_AGE_MONTHS', 'must-match']]);
  assert.deepEqual(r.secrets.map((s) => [s.key, s.environments]), [['app-settings.env › DB_PASSWORD', ['PRD']]]);
  const out = JSON.stringify(r);
  assert.ok(!out.includes('Pr0d-Renew4l'), 'the seeded secret never appears');
  assert.ok(!/DB_HOST|replicas|namespace/.test(r.findings.map((f) => f.key).join(' ')), 'env-specific keys are not reported');
  assert.ok(r.errors >= 3);
  assert.match(r.summary, /1 missing key.*1 plain-text secret/);
});

test('without rules every difference is a warning; secret values are hidden even when they differ', () => {
  const a = put('cfg/STE/app.env', 'API_KEY=abc123abc123\nHOST=ste\nAPP_VERSION=2.0\nVAULT=@Microsoft.KeyVault(SecretUri=x)\n');
  const b = put('cfg/PRD/app.env', 'API_KEY=zzz999zzz999\nHOST=prd\nAPP_VERSION=2.0\nVAULT=@Microsoft.KeyVault(SecretUri=y)\nEXTRA=1\n');
  const r = drift.compareConfigs([a, b], { root: temp });
  assert.equal(r.differs.find((d) => d.key === 'API_KEY').values.PRD, drift.MASK);
  assert.ok(!JSON.stringify(r).includes('zzz999'));
  assert.equal(r.findings.find((f) => f.key === 'HOST').severity, 'warning');
  assert.deepEqual(r.missing.map((m) => m.key), ['EXTRA']);
  assert.deepEqual(r.secrets.map((s) => s.key), ['API_KEY'], 'Key Vault references are not plain-text secrets');
  assert.throws(() => drift.compareConfigs([a]), /at least two/);
  assert.throws(() => drift.compareConfigs([a, a]), /same environment/);
  const named = drift.compareConfigs([{ path: a, environment: 'uat' }, { path: b, environment: 'production' }]);
  assert.deepEqual(named.environments.map((e) => e.name), ['UAT', 'PRD']);
});

test('lint_pipeline on the sample: missing UAT stage, no approval gate before PRD, unpinned tasks', () => {
  const r = drift.lintPipeline(path.join(ENVS, 'azure-pipelines.yml'), { root: SAMPLE });
  assert.equal(r.kind, 'Azure Pipelines');
  const rules = r.findings.map((f) => f.rule).sort();
  assert.deepEqual(rules, ['missing-stage', 'no-approval', 'unpinned', 'unpinned']);
  assert.match(r.findings.find((f) => f.rule === 'missing-stage').message, /UAT/);
  assert.ok(r.findings.filter((f) => f.rule === 'unpinned').every((f) => f.line > 0 && /DotNetCoreCLI|AzureCLI/.test(f.message)));
  assert.equal(r.valid, false);
});

test('lint_pipeline: a good Azure pipeline passes with an approvals reminder; GitHub Actions checks', () => {
  const good = `stages:
  - stage: STE
    jobs:
      - deployment: d
        environment: app-ste
        strategy: { runOnce: { deploy: { steps: [{ task: AzureCLI@2 }] } } }
  - stage: UAT
    jobs:
      - deployment: d
        environment: app-uat
  - stage: PRD
    jobs:
      - deployment: d
        environment: app-prd
`;
  const r = drift.lintPipelineText(good);
  assert.equal(r.errors, 0, JSON.stringify(r.findings));
  assert.equal(r.findings[0].rule, 'approval');
  const skip = drift.lintPipelineText(good.replace('  - stage: PRD\n', '  - stage: PRD\n    dependsOn: STE\n'));
  assert.ok(skip.findings.some((f) => f.rule === 'order' && /doesn't wait for UAT/.test(f.message)));
  const gh = drift.lintPipelineText(`on:
  push:
    branches: [main]
jobs:
  ste:
    runs-on: ubuntu-latest
    environment: ste
    steps:
      - uses: actions/checkout@main
      - uses: azure/login
  uat:
    needs: ste
    environment: uat
    steps: [{ uses: actions/checkout@v4 }]
  prod:
    needs: []
    steps:
      - run: deploy
`);
  assert.equal(gh.kind, 'GitHub Actions');
  const msgs = gh.findings.map((f) => `${f.rule}: ${f.message}`).join('\n');
  assert.match(msgs, /unpinned: actions\/checkout@main follows a branch/);
  assert.match(msgs, /unpinned: azure\/login has no version/);
  assert.match(msgs, /no-approval: prod deploys to PRD/);
  assert.match(msgs, /order: prod \(PRD\) has an empty dependsOn\/needs/);
  assert.throws(() => drift.lintPipelineText('a: 1'), /doesn't look like/);
});

test('test-case workbook becomes tagged Playwright specs that load', async () => {
  const wb = path.join(SAMPLE, 'Quality', 'Test cases - Photo upload (SIT).xlsx');
  const cases = await qe.readTestCases(wb);
  assert.deepEqual(cases.map((c) => c.id), ['TC-101', 'TC-102', 'TC-103', 'TC-104']);
  assert.deepEqual(cases[0].tracesTo, ['US-104', 'BR-004']);
  assert.equal(cases[0].steps.length, 3);
  const out = path.join(temp, 'pw');
  const r = await qe.generatePlaywrightTests(wb, { outDir: out, root: temp });
  assert.deepEqual(r.saved.filter((f) => /\.spec\.js$/.test(f)).sort(), ['pw/tests/us-104.spec.js', 'pw/tests/us-105.spec.js']);
  const spec = fs.readFileSync(path.join(out, 'tests', 'us-104.spec.js'), 'utf8');
  assert.match(spec, /test\.fixme\("TC-102 Reject a photo older than 6 months", \{ tag: \["@TC-102","@US-104","@BR-004","@SIT","@P1"\] \}/);
  assert.match(spec, /test\.step\("1\. Upload a JPEG taken 6 months and 1 day ago"/);
  assert.match(spec, /Expected: The photo is rejected with "Your photo must be less than 6 months old"/);
  for (const f of r.saved.filter((x) => /\.js$/.test(x))) assert.equal(spawnSync(process.execPath, ['--check', path.join(temp, f)]).status, 0, `${f} is valid JavaScript`);
  assert.match(fs.readFileSync(path.join(out, 'playwright.config.js'), 'utf8'), /trace: 'retain-on-failure'/);
  const again = await qe.generatePlaywrightTests(wb, { outDir: out, root: temp });
  assert.equal(again.folder, 'pw (2)', 'never overwrites');
});

test('engineering tools are exposed; generating tests needs edit access', () => {
  const root = path.join(temp, 'ws'); copyDir(SAMPLE, root);
  const run = (readonly, name, args) => {
    const input = [{ jsonrpc: '2.0', id: 1, method: 'tools/list' }, { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name, arguments: args } }].map((x) => JSON.stringify(x)).join('\n') + '\n';
    const out = spawnSync(process.execPath, [path.join(__dirname, '..', 'tools', 'office-mcp.js')], { input, encoding: 'utf8', env: { ...process.env, OFFICE_MCP_ROOT: root, OFFICE_MCP_READONLY: readonly ? '1' : '0' } });
    return out.stdout.trim().split('\n').map((l) => JSON.parse(l));
  };
  const [list, c] = run(true, 'compare_configs', { folder: 'Environments', rules: 'Environments/Config rules.md' });
  assert.ok(['compare_configs', 'lint_pipeline', 'generate_playwright_tests'].every((n) => list.result.tools.some((t) => t.name === n)));
  assert.ok(!c.result.isError, c.result.content[0].text);
  assert.match(c.result.content[0].text, /NOTIFY_QUEUE_NAME/);
  assert.match(c.result.content[0].text, /1\.3\.9-hotfix/);
  assert.ok(!c.result.content[0].text.includes('Pr0d-Renew4l'));
  const [, l] = run(true, 'lint_pipeline', { path: 'azure-pipelines.yml' });
  assert.match(l.result.content[0].text, /no-approval/);
  const [, files] = run(true, 'list_office_files', {});
  assert.match(files.result.content[0].text, /app-settings\.env/);
  const [, ro] = run(true, 'generate_playwright_tests', { workbook: 'Quality/Test cases - Photo upload (SIT).xlsx' });
  assert.ok(ro.result.isError); assert.match(ro.result.content[0].text, /Editing files is turned off/);
  const [, rw] = run(false, 'generate_playwright_tests', { workbook: 'Quality/Test cases - Photo upload (SIT).xlsx' });
  assert.ok(!rw.result.isError, rw.result.content[0].text);
  assert.ok(fs.existsSync(path.join(root, 'Quality', 'Playwright', 'tests', 'us-104.spec.js')));
});

test('engineering agents, prompts, skills and labels are wired up', () => {
  const assistants = require('../defaults/assistants.json');
  const recipes = require('../defaults/recipes.json');
  const skills = require('../lib/skills').all();
  const { TOOLS } = require('../tools/office-mcp');
  for (const id of ['dev-pack', 'test-automation', 'pipeline-readiness']) {
    const s = skills.find((x) => x.id === id);
    assert.ok(s, id);
    assert.ok(s.references.length >= 2, `${id} ships reference files`);
    for (const r of s.references) assert.ok(s.body.includes(r.rel), `${id} points to ${r.rel}`);
    for (const t of [...s.readTools, ...s.writeTools]) assert.ok(TOOLS.some((x) => x.name === t), `${t} exists`);
  }
  for (const [id, emoji, skill] of [['developer-copilot', '👩‍💻', 'dev-pack'], ['test-automation-copilot', '🤖', 'test-automation'], ['pipeline-readiness', '🔧', 'pipeline-readiness']]) {
    const a = assistants.find((x) => x.id === id);
    assert.ok(a, id);
    assert.equal(a.emoji, emoji);
    assert.ok(a.skills.includes(skill));
    assert.ok(a.skills.every((s) => skills.some((k) => k.id === s)), `${id} uses known skills`);
  }
  const cat = recipes.filter((r) => r.category === 'Engineering');
  assert.deepEqual(cat.map((r) => r.name), ['Write a PR description', 'Turn test cases into Playwright tests', 'Compare environment configs', 'Check a pipeline']);
  assert.ok(cat.every((r) => assistants.some((a) => a.id === r.assistantId)));
  assert.ok(cat.every((r) => r.fields.every((f) => r.template.includes(`{{${f.key}}}`))), 'every field is used in its template');
  const labels = require('../lib/tool-labels');
  assert.match(labels.officeLabel('compare_configs', { folder: 'x/Environments' }).label, /environment configs in Environments/);
  assert.match(labels.officeLabel('lint_pipeline', { path: 'a/azure-pipelines.yml' }).label, /pipeline azure-pipelines\.yml/);
  assert.match(labels.officeLabel('generate_playwright_tests', { workbook: 'T.xlsx' }).label, /Playwright tests from T\.xlsx/);
  const prompt = require('../lib/skills').promptFor([skills.find((x) => x.id === 'dev-pack')], 'read');
  assert.match(prompt, /references\/coding-standards\.md = .*coding-standards\.md/);
});
