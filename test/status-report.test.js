const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const project = require('../tools/project');
const status = require('../tools/status');

const DEMO = path.join(__dirname, '..', 'demo');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lumen-status-'));
test.after(() => fs.rmSync(temp, { recursive: true, force: true }));

function workspace() {
  const root = fs.mkdtempSync(path.join(temp, 'ws-'));
  fs.copyFileSync(path.join(DEMO, 'Contoso CRM Migration.xml'), path.join(root, 'Plan.xml'));
  fs.copyFileSync(path.join(DEMO, 'CRM Migration - RAID Log.xlsx'), path.join(root, 'RAID.xlsx'));
  return root;
}

test('readRaid recognises sheets, scores from formulas, open/closed and source cells', async () => {
  const items = await status.readRaid(path.join(DEMO, 'CRM Migration - RAID Log.xlsx'));
  const r02 = items.find((x) => x.id === 'R-02');
  assert.equal(r02.kind, 'risk');
  assert.equal(r02.score, 9);
  assert.equal(r02.severity, 'High');
  assert.equal(r02.open, true);
  assert.deepEqual(r02.source, { type: 'raid', ref: 'Risks!A3' });
  assert.equal(items.find((x) => x.id === 'R-07').open, false); // Closed
  assert.ok(items.some((x) => x.kind === 'issue') && items.some((x) => x.kind === 'decision'));
});

test('the status model is calculated from the files, with reasons and sources', async () => {
  const root = workspace();
  const m = await status.buildModel(path.join(root, 'Plan.xml'), { raid: path.join(root, 'RAID.xlsx'), root });
  assert.equal(m.statusDate, '2026-10-23');
  assert.equal(m.schedule.slipWorkingDays, 10);
  assert.ok(['Amber', 'Red'].includes(m.rag.rating));
  assert.ok(m.rag.reasons.some((r) => /10 working days behind/.test(r)));
  assert.equal(m.changesSinceLast, null); // no earlier version yet
  const build = m.milestones.find((x) => x.id === 23);
  assert.equal(build.varianceDays, 10);
  assert.ok(build.atRiskWork.length > 0);
  assert.equal(m.risks[0].id, 'R-02'); // highest score first
  assert.equal(m.provenance.review.status, 'Draft');
  assert.equal(m.provenance.sources.length, 2);
  assert.equal(m.ai.narrative, null);
});

test('buildReport writes the pack, tracks change since last version and flags a contradicting narrative', async () => {
  const root = workspace();
  const plan = path.join(root, 'Plan.xml');
  project.recordVersion(project.load(plan), root);
  const upd = project.updatePlan(plan, { statusDate: '2026-10-30', updates: [{ taskId: 23, finish: '2026-12-01' }] }, root);
  const res = await status.buildReport(upd.saved, {
    root, raid: path.join(root, 'RAID.xlsx'),
    narrative: 'Overall the project is Green and on track.', decisionsNeeded: ['Approve extra SME capacity (R-02).'],
  });
  const dir = path.join(root, 'Status reports', '2026-10-30');
  assert.deepEqual(fs.readdirSync(dir).sort(), ['Contoso CRM Migration - Executive dashboard.html', 'Contoso CRM Migration - Status report.md', 'status.json'].sort());
  assert.match(res.warnings[0], /calls the project Green, but the calculated rating is/);
  assert.equal(res.changedSinceLast, 1);

  const m = JSON.parse(fs.readFileSync(path.join(dir, 'status.json'), 'utf8'));
  assert.equal(m.changesSinceLast.comparedWith, '2026-10-23');
  assert.match(m.changesSinceLast.items[0].change, /\+5 days/);
  assert.equal(m.milestones.find((x) => x.id === 23).changeSinceLast, 5);

  const html = fs.readFileSync(path.join(dir, 'Contoso CRM Migration - Executive dashboard.html'), 'utf8');
  assert.match(html, /Draft: for PMO review/);
  assert.match(html, /AI-written summary/);
  assert.match(html, /role="alert"/);
  assert.match(html, /<details class="ms">/);
  assert.match(html, /RAID Risks!A3/);
  assert.doesNotMatch(html, /<script/); // static, safe to email

  const md = fs.readFileSync(path.join(dir, 'Contoso CRM Migration - Status report.md'), 'utf8');
  assert.match(md, /## Summary \*\(AI-written\)\*/);
  assert.match(md, /> \*\*Check:\*\*/);
  assert.match(md, /## What changed since/);
});

test('narrative text is escaped in the dashboard', () => {
  const html = status.renderHtml({
    project: 'P', statusDate: '2026-10-23', generatedAt: new Date().toISOString(),
    rag: { rating: 'Green', reasons: ['ok'], rule: 'r' }, schedule: { forecastFinish: null, baselineFinish: null, slipWorkingDays: 0, percentComplete: 0, expectedByNow: 0 },
    milestones: [], changesSinceLast: null, attention: { late: [], behind: [], overallocated: [], overdueRaid: [] }, risks: [], issues: [],
    ai: { narrative: '<img src=x onerror=alert(1)>', warnings: [], decisionsNeeded: [] }, provenance: { sources: [], review: { status: 'Draft' }, generatedBy: 'test' },
  });
  assert.doesNotMatch(html, /<img src=x/);
});

test('status tools are exposed; the report needs edit access', () => {
  const root = workspace();
  const run = (readonly, name, args) => {
    const input = [{ jsonrpc: '2.0', id: 1, method: 'tools/list' }, { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name, arguments: args } }].map((x) => JSON.stringify(x)).join('\n') + '\n';
    const out = spawnSync(process.execPath, [path.join(__dirname, '..', 'tools', 'office-mcp.js')], { input, encoding: 'utf8', env: { ...process.env, OFFICE_MCP_ROOT: root, OFFICE_MCP_READONLY: readonly ? '1' : '0' } });
    return out.stdout.trim().split('\n').map((l) => JSON.parse(l));
  };
  const [list, facts] = run(true, 'get_status_facts', { path: 'Plan.xml', raid: 'RAID.xlsx' });
  assert.ok(['get_status_facts', 'build_status_report'].every((n) => list.result.tools.some((t) => t.name === n)));
  assert.ok(!facts.result.isError, facts.result.content[0].text);
  assert.match(facts.result.content[0].text, /"rating"/);
  assert.doesNotMatch(facts.result.content[0].text, /"narrative"/);
  const [, denied] = run(true, 'build_status_report', { path: 'Plan.xml' });
  assert.ok(denied.result.isError);
  const [, built] = run(false, 'build_status_report', { path: 'Plan.xml', raid: 'RAID.xlsx', narrative: 'Amber.' });
  assert.ok(!built.result.isError, built.result.content[0].text);
  assert.ok(fs.existsSync(path.join(root, 'Status reports', '2026-10-23', 'status.json')));
});
