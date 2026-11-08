// The rest of the prompts added by plans 09 to 17 (real-engine-plans.spec.js has one per category), run through a
// REAL engine (GitHub Copilot CLI or Claude Code) against the sample packs, to check what an AI makes of the tool results.
// Slow and uses your plan, so it only runs when asked:   E2E_ENGINE=copilot|claude npx playwright test e2e/real-engine-plans-2.spec.js
// Each reply is saved as text next to its screenshot in e2e/screenshots/ so it can be read afterwards.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const JSZip = require('jszip');
const { ROOT } = require('./paths');
const { ENGINE, openPrompt, pick, run, snapshot, changes } = require('./real-engine-helpers');

test.skip(!['copilot', 'claude'].includes(ENGINE), 'Set E2E_ENGINE=copilot or claude to run against a real engine');
test.setTimeout(480_000);

// As in real-engine-plans.spec.js: crm, aidlc and data install from the home screen; change and security are copied
// next to them and chosen as the project folder.
async function useSample(request, pack) {
  if (['crm', 'aidlc', 'data'].includes(pack)) {
    const res = await request.post('/api/demo/install', { data: { pack } });
    expect(res.ok()).toBeTruthy();
    return (await res.json()).path;
  }
  const dir = path.join(ROOT, `Online Permit Renewal (${pack} sample)`);
  if (!fs.existsSync(dir)) fs.cpSync(path.join(__dirname, '..', 'samples', pack), dir, { recursive: true });
  const res = await request.put('/api/settings', { data: { workspace: dir } });
  expect(res.ok()).toBeTruthy();
  return dir;
}

const all = (text, ...res) => { for (const re of res) expect(text).toMatch(re); };
const stepsOf = (steps) => steps.join('\n');
const fill = (page, key, value) => page.locator(`[data-field="${key}"]`).fill(value);
// Leave an optional file field empty (the form pre-selects a likely file).
async function none(page, key) {
  const sel = page.locator(`[data-file-select="${key}"]`);
  await expect(sel.locator('option')).not.toHaveCount(1);
  await sel.selectOption('');
}
const added = (c, re) => c.added.filter((f) => re.test(f.split(path.sep).join('/')));
// Every cell's text in a workbook, one sheet per block, for checking what was saved.
async function xlsxText(file) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  return wb.worksheets.map((ws) => {
    const lines = [`## ${ws.name}`];
    ws.eachRow((row) => lines.push(row.values.slice(1).map((v) => (v && typeof v === 'object' ? v.text || v.result || JSON.stringify(v) : v ?? '')).join(' | ')));
    return lines.join('\n');
  }).join('\n\n');
}
const docxPart = async (file, part) => (await JSZip.loadAsync(fs.readFileSync(file))).file(part)?.async('string');

// ---------- Project plans (plan 10 changed these two) ----------

test('Planning: who is overloaded uses the capacity workbook and finds the leave clash on the critical path', async ({ page, request }) => {
  const dir = await useSample(request, 'crm');
  const before = snapshot(dir);
  await openPrompt(page, 'resource-load');
  await pick(page, 'plan', 'Contoso CRM Migration.xml');
  await pick(page, 'capacity', 'Team Capacity - Q4 2026.xlsx');
  await pick(page, 'backlog', 'ADO Backlog Export - 30 Oct 2026.xlsx');
  const { text, steps } = await run(page, 'resource-load');
  expect(stepsOf(steps)).toMatch(/Checking capacity in Team Capacity - Q4 2026\.xlsx/);
  all(text, /Aisha Khan/, /Tom Becker/, /Build ERP integration|#18|task 18/i, /Sprint 8/);
  const c = changes(dir, before);
  expect(c.modified).toEqual([]);
  expect(c.added).toEqual([]);
});

test('Planning: the executive status pack includes delivery progress and is saved as a draft', async ({ page, request }) => {
  const dir = await useSample(request, 'crm');
  const before = snapshot(dir);
  await openPrompt(page, 'exec-status-pack');
  await pick(page, 'plan', 'Contoso CRM Migration.xml');
  await pick(page, 'raid', 'CRM Migration - RAID Log.xlsx');
  await pick(page, 'backlog', 'ADO Backlog Export - 30 Oct 2026.xlsx');
  const { text, steps } = await run(page, 'exec-status-pack');
  expect(stepsOf(steps)).toMatch(/Gathering status facts from Contoso CRM Migration\.xml/);
  expect(stepsOf(steps)).toMatch(/Writing the status pack/);
  all(text, /\bAmber\b/, /draft/i, /PMO/i);
  const c = changes(dir, before);
  expect(c.modified).toEqual([]);
  expect(added(c, /^Status reports\/2026-10-23\/.*Executive dashboard\.html$/).length).toBe(1);
  const report = added(c, /^Status reports\/2026-10-23\/.*Status report\.md$/);
  expect(report.length).toBe(1);
  expect(fs.readFileSync(path.join(dir, report[0]), 'utf8')).toMatch(/Delivery progress/i);
});

// ---------- Quality engineering ----------

test('Quality engineering: test cases for US-103 are saved and trace to the story', async ({ page, request }) => {
  const dir = await useSample(request, 'aidlc');
  const before = snapshot(dir);
  await openPrompt(page, 'qe-test-cases');
  await pick(page, 'stories', 'Requirements Traceability (sample).xlsx');
  await fill(page, 'scope', 'US-103');
  const { text, steps } = await run(page, 'qe-test-cases');
  expect(stepsOf(steps)).toMatch(/Writing \d+ test cases? to Test cases.*\.xlsx/);
  all(text, /US-103/, /Test cases.*\.xlsx/);
  const c = changes(dir, before);
  expect(c.modified).toEqual([]);
  const saved = added(c, /^Test cases.*\.xlsx$/);
  expect(saved.length).toBe(1);
  const wb = await xlsxText(path.join(dir, saved[0]));
  expect(wb).toMatch(/US-103/);
  expect(wb).toMatch(/eligib/i);
});

test('Quality engineering: coverage gaps lists the untested items and the test on the withdrawn requirement', async ({ page, request }) => {
  const dir = await useSample(request, 'aidlc');
  const before = snapshot(dir);
  await openPrompt(page, 'qe-coverage-gaps');
  await pick(page, 'trm', 'Requirements Traceability (sample).xlsx');
  const { text, steps } = await run(page, 'qe-coverage-gaps');
  expect(stepsOf(steps)).toMatch(/Checking traceability in Requirements Traceability \(sample\)\.xlsx/);
  all(text, /BR-007/, /TC-011/, /BR-008/, /US-106/, /US-108/, /US-109/);
  const c = changes(dir, before);
  expect(c.modified).toEqual([]);
  expect(c.added).toEqual([]);
});

test('Quality engineering: the test strategy is a cited draft and saves nothing', async ({ page, request }) => {
  const dir = await useSample(request, 'aidlc');
  const before = snapshot(dir);
  await openPrompt(page, 'qe-test-strategy');
  await pick(page, 'scope', 'Knowledge/PID - Online Permit Renewal v1.2.docx');
  await pick(page, 'trm', 'Requirements Traceability (sample).xlsx');
  const { text, steps } = await run(page, 'qe-test-strategy');
  expect(stepsOf(steps)).toMatch(/PID - Online Permit Renewal v1\.2\.docx/);
  all(text, /Draft \(AI\) for review/i, /\bUAT\b/, /\bSIT\b/, /Entry/i, /Exit/i, /BR-004/, /\bHigh\b/);
  const c = changes(dir, before);
  expect(c.modified).toEqual([]);
  expect(c.added).toEqual([]);
});

// ---------- Change & training ----------

test('Change: interview impacts are proposed with quotes, and nothing is applied', async ({ page, request }) => {
  const dir = await useSample(request, 'change');
  const before = snapshot(dir);
  await openPrompt(page, 'change-interview-impacts');
  await pick(page, 'transcript', 'Interview - Processing team - 2 Nov 2026.vtt');
  await pick(page, 'cia', 'CIA template.xlsx');
  const { text, steps } = await run(page, 'interview-impacts');
  expect(stepsOf(steps)).toMatch(/Proposing \d+ change impacts? for review/);
  expect(stepsOf(steps)).not.toMatch(/Applying approved/);
  all(text, /Processing/i, /approv/i, /2026-11-02|2 Nov/i);
  const c = changes(dir, before);
  expect(c.modified).toEqual([]);
  expect(added(c, /^CIA template \(proposed\).*\.xlsx$/).length).toBe(1);
  expect(added(c, /\(updated\)/)).toEqual([]);
});

test('Change: consolidating the CIAs merges the duplicate and leaves out the rejected impact', async ({ page, request }) => {
  const dir = await useSample(request, 'change');
  const before = snapshot(dir);
  await openPrompt(page, 'change-consolidate-cia');
  await pick(page, 'cia1', 'CIA - Processing.xlsx');
  await pick(page, 'cia2', 'CIA - Client services.xlsx');
  await none(page, 'cia3');
  await pick(page, 'roles', 'Roles.xlsx');
  const { text, steps } = await run(page, 'consolidate-cia');
  expect(stepsOf(steps)).toMatch(/Consolidating 2 change impact assessments/);
  all(text, /CI-001/, /CI-002/, /CI-003/, /Processing officers/, /Client support centre/, /not (been )?changed|unchanged|untouched/i);
  const c = changes(dir, before);
  expect(c.modified).toEqual([]);
  expect(added(c, /^CIA - consolidated.*\.xlsx$/).length).toBe(1);
  expect(added(c, /^Training actions - ADO import.*\.xlsx$/).length).toBe(1);
});

// The TNA and training prompts start from a consolidated CIA; make one with the tool if the test above did not run.
async function consolidated(dir) {
  const file = path.join(dir, 'CIA - consolidated.xlsx');
  if (!fs.existsSync(file)) await require('../tools/change').consolidateCia([path.join(dir, 'CIA - Processing.xlsx'), path.join(dir, 'CIA - Client services.xlsx')], { roles: path.join(dir, 'Roles.xlsx') });
  return file;
}

test('Change: the training needs analysis uses the TNA headcounts and saves nothing', async ({ page, request }) => {
  const dir = await useSample(request, 'change');
  await consolidated(dir);
  const before = snapshot(dir);
  await openPrompt(page, 'change-tna');
  await pick(page, 'cia', 'CIA - consolidated.xlsx');
  const { text, steps } = await run(page, 'tna');
  expect(stepsOf(steps)).toMatch(/CIA - consolidated\.xlsx/);
  all(text, /Processing officer/i, /\b42\b/, /Client support agent/i, /\b35\b/, /Finance clerk/i, /Training actions - ADO import\.xlsx/, /Draft \(AI\) for review/i);
  const c = changes(dir, before);
  expect(c.modified).toEqual([]);
  expect(c.added).toEqual([]);
});

test('Change: training materials for processing officers are saved as Word drafts with sources', async ({ page, request }) => {
  const dir = await useSample(request, 'change');
  await consolidated(dir);
  const before = snapshot(dir);
  await openPrompt(page, 'change-training-materials');
  await pick(page, 'cia', 'CIA - consolidated.xlsx');
  await fill(page, 'role', 'Processing officer');
  await none(page, 'process');
  const { text, steps } = await run(page, 'training-materials');
  expect(stepsOf(steps)).toMatch(/Saving draft /);
  all(text, /Training\/Processing officer/i, /draft/i);
  const c = changes(dir, before);
  expect(c.modified).toEqual([]);
  const docs = added(c, /^Training\/Processing officer\/.*\.docx$/);
  expect(docs.length).toBeGreaterThanOrEqual(3);
  const md = added(c, /^Training\/Processing officer\/.*\.md$/);
  expect(md.length).toBeGreaterThanOrEqual(3);
  for (const f of md) expect(fs.readFileSync(path.join(dir, f), 'utf8'), f).toMatch(/Source/i);
});

test('Change: the French draft is saved for translator review and checked against the glossary', async ({ page, request }) => {
  const dir = await useSample(request, 'change');
  const before = snapshot(dir);
  await openPrompt(page, 'bilingual-draft-french');
  await pick(page, 'english', 'Renewal guide (EN).docx');
  await pick(page, 'glossary', 'EN-FR Glossary.xlsx');
  const { text, steps } = await run(page, 'draft-french');
  expect(stepsOf(steps)).toMatch(/Saving draft .*FR draft.*\.docx/);
  expect(stepsOf(steps)).toMatch(/Checking .*FR draft.*\.docx against Renewal guide \(EN\)\.docx/);
  all(text, /FR draft/, /translator/i);
  expect(text).not.toMatch(/[1-9] missing paragraphs?/); // the draft's label and Sources list are not paragraphs to translate
  const c = changes(dir, before);
  expect(c.modified).toEqual([]);
  const drafts = added(c, /FR draft.*\.docx$/);
  expect(drafts.length).toBeGreaterThanOrEqual(1);
  const doc = (await docxPart(path.join(dir, drafts[drafts.length - 1]), 'word/document.xml')).replace(/<[^>]+>/g, '');
  expect(doc).toMatch(/demande de renouvellement/i);
  expect(doc).toMatch(/Machine-drafted/i);
});

// ---------- Release ----------

const APPROACH = `# Deployment approach — SalesTrack to Contoso CRM go-live

Version 0.3 · Owner: Priya Shah (project manager)

## 1 Go-live window
Cutover runs from Saturday 2 January 2027 18:00 to Sunday 3 January 2027 06:00. Business users are told the old system is read-only from 18:00.

## 2 Go / no-go
Priya Shah chairs the go/no-go call at 17:00 on 2 January with the business owner and the technical leads. The call uses the release readiness checklist.

## 3 Freeze
At 18:00 Ben Carter sets SalesTrack to read-only and confirms no users are connected (check the session count is 0).

## 4 Data migration
Ben Carter takes the final extract from SalesTrack (about 1 hour), then loads accounts and contacts (2.5 hours), then opportunities (2 hours). Each load is verified with the reconciliation report (row counts and totals match the extract).

## 5 Integrations
After the loads, Aisha Khan re-points the ERP integration to Contoso CRM and sends one test order through (30 minutes).

## 6 Smoke tests
The smoke tests (sign-in, open an account, create an opportunity, send an order to ERP) run after the integration is re-pointed. Owner not yet agreed.

## 7 Go-live confirmation
Priya Shah confirms go-live to the business by 06:00 on 3 January.

## 8 Rollback
Rollback restores SalesTrack from the freeze point and re-points the ERP integration back (rehearsed in 52 minutes on 19 Dec). Trigger: a failed reconciliation or a failed smoke test. The rollback decision must be made by 03:00 on 3 January so SalesTrack is back before 06:00.
`;

test('Release: the cutover checklist is drafted in the run-sheet layout the status check reads', async ({ page, request }) => {
  const dir = await useSample(request, 'crm');
  fs.writeFileSync(path.join(dir, 'Deployment approach - Go-live.md'), APPROACH);
  const before = snapshot(dir);
  await openPrompt(page, 'release-cutover-checklist');
  await pick(page, 'approach', 'Deployment approach - Go-live.md');
  await pick(page, 'plan', 'Contoso CRM Migration.xml');
  await fill(page, 'window', 'Sat 2 Jan 2027 18:00 to Sun 3 Jan 2027 06:00');
  const { text, steps } = await run(page, 'cutover-checklist');
  expect(stepsOf(steps)).toMatch(/Creating Cutover Run-sheet \(draft\).*\.xlsx/);
  all(text, /C01/, /R01/, /03:00/, /smoke/i);
  const c = changes(dir, before);
  expect(c.modified).toEqual([]);
  const sheet = added(c, /^Cutover Run-sheet \(draft\).*\.xlsx$/);
  expect(sheet.length).toBe(1);
  const wb = await xlsxText(path.join(dir, sheet[0]));
  all(wb, /## Run-sheet/, /## Rollback/, /Ben Carter/, /Aisha Khan/, /2027-01-02 18:00/);
  // The status check can read what was drafted.
  const s = await require('../tools/release').cutoverStatus(path.join(dir, sheet[0]), { asOf: '2027-01-02 17:00' });
  expect(s.counts['Not started']).toBeGreaterThan(5);
});

test('Release: the runbook is saved as Word in the program runbook template', async ({ page, request }) => {
  const dir = await useSample(request, 'aidlc');
  const before = snapshot(dir);
  await openPrompt(page, 'release-runbook');
  await pick(page, 'design', 'Knowledge/Technical Design - Permit Renewal.md');
  await none(page, 'deploy');
  await none(page, 'support');
  await fill(page, 'system', 'Online Permit Renewal');
  // Leave the template field as the form offers it: the runbook template is the one that should be used.
  const { text, steps } = await run(page, 'runbook');
  expect(stepsOf(steps)).toMatch(/Saving draft Runbook - Online Permit Renewal \(draft\)\.md/);
  all(text, /To be confirmed|needs? input/i, /Runbook - Online Permit Renewal \(draft\)/);
  const c = changes(dir, before);
  expect(c.modified).toEqual([]);
  expect(added(c, /^Runbook - Online Permit Renewal \(draft\).*\.md$/).length).toBe(1);
  const word = added(c, /^Runbook - Online Permit Renewal \(draft\).*\.docx$/);
  expect(word.length).toBe(1);
  expect(await docxPart(path.join(dir, word[0]), 'word/header1.xml')).toMatch(/Operational Runbook/);
  expect(await docxPart(path.join(dir, word[0]), 'word/document.xml')).toMatch(/Source/);
});

test('Release: cutover status at 23:30 is Red because C04 is late, with a saved snapshot', async ({ page, request }) => {
  const dir = await useSample(request, 'crm');
  const before = snapshot(dir);
  await openPrompt(page, 'release-cutover-status');
  await pick(page, 'runsheet', 'Cutover Run-sheet - Go-live weekend.xlsx');
  await fill(page, 'asof', '2027-01-02 23:30');
  const { text, steps } = await run(page, 'cutover-status');
  expect(stepsOf(steps)).toMatch(/Checking cutover progress in Cutover Run-sheet - Go-live weekend\.xlsx/);
  all(text, /\bRed\b/, /C04/, /Ben Carter/, /06:45/, /05:00/, /\b5 of 11\b|5\/11/);
  const c = changes(dir, before);
  expect(c.modified).toEqual([]);
  expect(added(c, /^Cutover\/.*\.md$/).length).toBe(1);
});

test('Release: hypercare is not ready to close because of the open Sev2, and the closure report is saved', async ({ page, request }) => {
  const dir = await useSample(request, 'crm');
  const before = snapshot(dir);
  await openPrompt(page, 'release-hypercare-closure');
  await pick(page, 'defects', 'Hypercare Defects - 1 Feb 2027.xlsx');
  await fill(page, 'asof', '2027-02-01');
  const { text, steps } = await run(page, 'hypercare-closure');
  expect(stepsOf(steps)).toMatch(/Looking at hypercare trends in Hypercare Defects - 1 Feb 2027\.xlsx/);
  expect(stepsOf(steps)).toMatch(/Saving draft Hypercare closure report \(draft\)\.md/);
  all(text, /Not ready to close/i, /5108/, /Sev ?2|High/i);
  const c = changes(dir, before);
  expect(c.modified).toEqual([]);
  expect(added(c, /^Hypercare closure report \(draft\).*\.md$/).length).toBe(1);
  expect(added(c, /^Hypercare closure report \(draft\).*\.docx$/).length).toBe(1);
});

// ---------- Architecture ----------

const DISCUSSION = `# Design huddle — address lookup on the renewal summary page

Date: 2026-10-30 · Attendees: Solution Architect, Portal lead, Case management lead, Enterprise IT integration lead (all fictional)

## Notes
- The Technical Design lists an "Address lookup service" to build, to validate the mailing address on the summary page.
- Enterprise IT pointed out that the reusable-asset register already has the Enterprise address lookup API (active, REST, OAuth client credentials) that validates and completes Canadian mailing addresses.
- Option 1, build our own address lookup service: full control of the response format, but a new component to run, a postal data licence to buy and keep current, and it goes against blueprint principle 1 (reuse enterprise platforms).
- Option 2, reuse the Enterprise address lookup API: no new component, the address data is already licensed and maintained by Enterprise IT; the portal needs a subscription through the API catalogue, and we depend on Enterprise IT's availability.
- The group agreed to reuse the Enterprise address lookup API and drop the build from the TDD.
- Not settled: whether the subscription is charged per call, and what the portal shows if the API is unavailable (free-text address or block the renewal).
`;

test('Architecture: the ADR is drafted as ADR-004, Proposed, from the discussion', async ({ page, request }) => {
  const dir = await useSample(request, 'aidlc');
  fs.writeFileSync(path.join(dir, 'Architecture', 'Design huddle - address lookup.md'), DISCUSSION);
  const before = snapshot(dir);
  await openPrompt(page, 'architecture-draft-adr');
  await pick(page, 'notes', 'Architecture/Design huddle - address lookup.md');
  await fill(page, 'adrs', 'Architecture/ADRs');
  await fill(page, 'topic', 'Address lookup: reuse the enterprise API or build our own');
  const { text, steps } = await run(page, 'draft-adr');
  expect(stepsOf(steps)).toMatch(/Indexing the decision records in ADRs/);
  all(text, /ADR-004/, /Proposed/);
  const c = changes(dir, before);
  expect(c.modified).toEqual([]);
  const adr = added(c, /^Architecture\/ADRs\/ADR-004.*\.md$/);
  expect(adr.length).toBe(1);
  const md = fs.readFileSync(path.join(dir, adr[0]), 'utf8');
  all(md, /Proposed/i, /Enterprise address lookup API/i, /per call|unavailable/i);
  expect(md).not.toMatch(/status:\s*accepted/i);
});

test('Architecture: reuse vs. build recommends the enterprise address lookup API', async ({ page, request }) => {
  const dir = await useSample(request, 'aidlc');
  const before = snapshot(dir);
  await openPrompt(page, 'architecture-reuse');
  await pick(page, 'register', 'Architecture/Reusable assets.xlsx');
  await fill(page, 'need', 'Validate the mailing address on the renewal summary page');
  await pick(page, 'design', 'Knowledge/Technical Design - Permit Renewal.md');
  const { text, steps } = await run(page, 'reuse');
  expect(stepsOf(steps)).toMatch(/Reusable assets\.xlsx/);
  all(text, /Enterprise address lookup API/i, /\bA2\b/, /reuse/i, /\bADR\b/);
  const c = changes(dir, before);
  expect(c.modified).toEqual([]);
  expect(c.added).toEqual([]);
});

test('Architecture: the design gate pack is not ready, and no approval is recorded', async ({ page, request }) => {
  const dir = await useSample(request, 'aidlc');
  const before = snapshot(dir);
  await openPrompt(page, 'architecture-gate-pack');
  await pick(page, 'gate', 'Architecture/Design gate.json');
  await none(page, 'template');
  await none(page, 'raid');
  const { text, steps } = await run(page, 'gate-pack');
  expect(stepsOf(steps)).toMatch(/Assembling the .*pack/);
  all(text, /not ready/i, /Security Assessment/i, /Solution Blueprint/i, /v1\.1/, /Business Owner/i);
  const c = changes(dir, before);
  expect(c.modified).toEqual([]);
  expect(added(c, /^Gate packs\/Design gate.*\/Design gate - gate pack\.docx$/).length).toBe(1);
  const index = added(c, /^Gate packs\/Design gate.*\/Design gate - index\.md$/);
  expect(index.length).toBe(1);
  expect(fs.readFileSync(path.join(dir, index[0]), 'utf8')).toMatch(/Business Owner[^\n]*Open/i);
});

test('Architecture: inventory updates are proposed from the git log, and the inventory is unchanged', async ({ page, request }) => {
  const dir = await useSample(request, 'aidlc');
  const before = snapshot(dir);
  await openPrompt(page, 'architecture-inventory');
  await pick(page, 'inventory', 'Architecture/Technical Inventory.xlsx');
  await pick(page, 'gitlog', 'Architecture/Delivery changes - git log.txt');
  await none(page, 'ado');
  await fill(page, 'adrs', 'Architecture/ADRs');
  const { text, steps } = await run(page, 'inventory');
  expect(stepsOf(steps)).toMatch(/Proposing updates to Technical Inventory\.xlsx/);
  all(text, /Photo validation/i, /Legacy kiosk/i, /Eligibility service/i, /Approve\?/);
  const c = changes(dir, before);
  expect(c.modified).toEqual([]);
  expect(added(c, /^Architecture\/Technical Inventory \(proposed\).*\.xlsx$/).length).toBe(1);
});

// ---------- Security ----------

test('Security: the SCTM draft maps the four unmapped controls into a (proposed) copy', async ({ page, request }) => {
  const dir = await useSample(request, 'security');
  const before = snapshot(dir);
  await openPrompt(page, 'security-draft-sctm');
  await pick(page, 'catalogue', 'Control Catalogue (synthetic).xlsx');
  await pick(page, 'sctm', 'SCTM - Online Permit Renewal.xlsx');
  await pick(page, 'design', 'Technical Design - Security.md');
  const { text, steps } = await run(page, 'draft-sctm');
  expect(stepsOf(steps)).toMatch(/Checking security controls in SCTM - Online Permit Renewal\.xlsx/);
  expect(stepsOf(steps)).toMatch(/Proposing \d+ SCTM rows? for review/);
  all(text, /AC-7/, /CM-6/, /IA-5/, /SC-12/, /SC-13/);
  const c = changes(dir, before);
  expect(c.modified).toEqual([]);
  const proposed = added(c, /^SCTM - Online Permit Renewal \(proposed\).*\.xlsx$/);
  expect(proposed.length).toBe(1);
  expect(await xlsxText(path.join(dir, proposed[0]))).toMatch(/AC-7[\s\S]*Technical Design - Security\.md/);
});

test('Security: the security design document is saved as Word and lists the open controls', async ({ page, request }) => {
  const dir = await useSample(request, 'security');
  const before = snapshot(dir);
  await openPrompt(page, 'security-design-document');
  await pick(page, 'design', 'Technical Design - Security.md');
  await pick(page, 'sctm', 'SCTM - Online Permit Renewal.xlsx');
  await none(page, 'template');
  const { text, steps } = await run(page, 'security-design-doc');
  expect(stepsOf(steps)).toMatch(/Checking security controls (and evidence )?in SCTM - Online Permit Renewal\.xlsx/);
  expect(stepsOf(steps)).toMatch(/Saving draft Security Design Document\.md/);
  all(text, /SI-4/, /Security Design Document/);
  const c = changes(dir, before);
  expect(c.modified).toEqual([]);
  const md = added(c, /^Security Design Document.*\.md$/);
  expect(md.length).toBe(1);
  expect(added(c, /^Security Design Document.*\.docx$/).length).toBe(1);
  all(fs.readFileSync(path.join(dir, md[0]), 'utf8'), /SI-4/, /SC-13|IR-4/, /3\.2 Encryption at rest|Encryption at rest/);
});

// ---------- Data ----------

test('Data: schema comparison matches 9 fields and lists the unmatched ones on both sides', async ({ page, request }) => {
  const dir = await useSample(request, 'data');
  const before = snapshot(dir);
  await openPrompt(page, 'data-compare-schemas');
  await pick(page, 'source', 'Source DDL - Applications.sql');
  await pick(page, 'target', 'Silver - Canonical Application.schema.json');
  await fill(page, 'entity', 'APPLICATIONS');
  const { text, steps } = await run(page, 'compare-schemas');
  expect(stepsOf(steps)).toMatch(/Comparing Source DDL - Applications\.sql with Silver - Canonical Application\.schema\.json/);
  all(text, /\b9\b/, /INTERNAL_NOTE_TXT/, /channelCode/, /languageCode/, /fuzzy/i);
  const c = changes(dir, before);
  expect(c.modified).toEqual([]);
  expect(c.added).toEqual([]);
});

test('Data: the STTM is drafted with every row left as Draft and the unmatched fields as Needs input', async ({ page, request }) => {
  const dir = await useSample(request, 'data');
  const before = snapshot(dir);
  await openPrompt(page, 'data-draft-sttm');
  await pick(page, 'source', 'Source DDL - Applications.sql');
  await pick(page, 'target', 'Silver - Canonical Application.schema.json');
  await fill(page, 'layer', 'Silver');
  await fill(page, 'entity', 'APPLICATIONS');
  const { text, steps } = await run(page, 'draft-sttm');
  expect(stepsOf(steps)).toMatch(/Comparing Source DDL - Applications\.sql with/);
  expect(stepsOf(steps)).toMatch(/Saving \d+ mapping rows? to STTM.*\.xlsx/);
  all(text, /INTERNAL_NOTE_TXT/, /channelCode/, /languageCode/, /Approved/);
  const c = changes(dir, before);
  expect(c.modified).toEqual([]);
  const sttm = added(c, /^STTM.*Silver.*\.xlsx$/);
  expect(sttm.length).toBe(1);
  const s = await require('../tools/data').readSttm(path.join(dir, sttm[0]));
  expect(s.rows.length).toBeGreaterThanOrEqual(12);
  expect(s.rows.filter((r) => r.status !== 'Draft' || r.approved || r.reviewer)).toEqual([]);
  expect(s.rows.filter((r) => /^Needs input/.test(r.rule)).map((r) => r.sourceField || r.targetField).sort()).toEqual(['INTERNAL_NOTE_TXT', 'channelCode', 'languageCode']);
});

test('Data: pipeline code is generated only for the three approved STTM rows', async ({ page, request }) => {
  const dir = await useSample(request, 'data');
  // A reviewed STTM: CLIENT_ID, SUBMIT_DT and APP_TYPE approved, APP_TYPE with a rule the generator can't translate.
  const sttm = path.join(dir, 'STTM - reviewed.xlsx');
  if (!fs.existsSync(sttm)) {
    const data = require('../tools/data');
    const cmp = await data.compareSchemas(path.join(dir, 'Source DDL - Applications.sql'), path.join(dir, 'Silver - Canonical Application.schema.json'), { sourceEntity: 'APPLICATIONS' });
    const rule = (f) => ({ SUBMIT_DT: "parse date format 'yyyy-MM-dd'", APP_TYPE: 'look up the application type code in ref_app_type' }[f] || 'direct');
    const rows = cmp.matches.map((m) => ({ sourceEntity: m.source.entity, sourceField: m.source.field, rule: rule(m.source.field), targetLayer: 'Silver', targetEntity: 'Application', targetField: m.target.field, targetType: m.target.type }));
    const { saved } = await data.writeSttm(sttm, rows, { comparison: cmp });
    const s = await data.readSttm(saved);
    const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(saved);
    const ws = wb.getWorksheet('STTM');
    for (const f of ['CLIENT_ID', 'SUBMIT_DT', 'APP_TYPE']) { const r = s.rows.find((x) => x.sourceField === f).row; ws.getCell(`L${r}`).value = 'Approved'; ws.getCell(`M${r}`).value = 'D. Reviewer'; }
    await wb.xlsx.writeFile(saved);
  }
  const before = snapshot(dir);
  await openPrompt(page, 'data-generate-code');
  await pick(page, 'sttm', 'STTM - reviewed.xlsx');
  await fill(page, 'layer', 'Silver');
  const { text, steps } = await run(page, 'generate-code');
  expect(stepsOf(steps)).toMatch(/Generating pipeline code from the approved rows of STTM - reviewed\.xlsx/);
  all(text, /clientId/, /submittedOn/, /applicationType/, /ref_app_type|TODO/i, /reconciliation/i, /refused|not Approved/i);
  const c = changes(dir, before);
  expect(c.modified).toEqual([]);
  const py = added(c, /^Pipelines\/Silver - Application.*\/application_load\.py$/);
  expect(py.length).toBe(1);
  const code = fs.readFileSync(path.join(dir, py[0]), 'utf8');
  expect(code).toMatch(/clientId/);
  expect(code).not.toMatch(/feeAmount/);
});

// ---------- Integration ----------

test('Integration: the Case API ICD is drafted, saved as Word and checked for missing sections', async ({ page, request }) => {
  const dir = await useSample(request, 'aidlc');
  const before = snapshot(dir);
  await openPrompt(page, 'integration-draft-icd');
  await fill(page, 'interface', 'Case API (applicant portal → case management)');
  await pick(page, 'sources', 'Knowledge/Technical Design - Permit Renewal.md');
  await pick(page, 'schemas', 'Integration/permit-renewal-api.yaml');
  const { text, steps } = await run(page, 'draft-icd');
  expect(stepsOf(steps)).toMatch(/Saving draft ICD - Case API/);
  expect(stepsOf(steps)).toMatch(/Checking ICD - Case API.* for missing ICD sections/);
  all(text, /Volumes?/i, /Needs input/i, /P4|P5/);
  const c = changes(dir, before);
  expect(c.modified).toEqual([]);
  const icd = added(c, /^Integration\/ICD - Case API.*\.md$/);
  expect(icd.length).toBe(1);
  expect(added(c, /^Integration\/ICD - Case API.*\.docx$/).length).toBe(1);
  // The check reads the draft's own Error handling section, not a schema subheading about error responses.
  const check = require('../tools/openapi').checkIcd(path.join(dir, icd[0]));
  expect(check.sections.find((s) => s.id === 'errors').heading).toMatch(/Error handling/i);
});

test('Integration: the notification API spec is saved with no errors and traces every operation', async ({ page, request }) => {
  const dir = await useSample(request, 'aidlc');
  const before = snapshot(dir);
  await openPrompt(page, 'integration-design-api');
  await fill(page, 'api', 'Notification API for status messages');
  await pick(page, 'requirements', 'Knowledge/BRD - Online Permit Renewal v1.3.docx');
  await none(page, 'schemas');
  await pick(page, 'standards', 'Knowledge/API Standards.md');
  const { text, steps } = await run(page, 'design-api');
  expect(stepsOf(steps)).toMatch(/Saving the API spec /);
  all(text, /x-traces-to/, /BR-007/);
  const c = changes(dir, before);
  expect(c.modified).toEqual([]);
  const specs = added(c, /^Integration\/.*\.(ya?ml|json)$/);
  expect(specs.length).toBeGreaterThanOrEqual(1);
  // The newest one is the final spec: it passes the standards with a trace on every operation.
  const newest = specs.map((f) => path.join(dir, f)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
  const v = await require('../tools/openapi').validateOpenApi(newest, { standards: path.join(dir, 'Knowledge', 'API Standards.md'), requireTraces: true, root: dir });
  expect(v.errors, JSON.stringify(v.errors)).toEqual([]);
  expect(v.operations.length).toBeGreaterThan(0);
});

test('Integration: scaffolding from a spec with no errors is C# with 501 stubs, traced to requirements', async ({ page, request }) => {
  const dir = await useSample(request, 'aidlc');
  // The sample spec has two seeded errors; this copy has them fixed.
  const fixed = path.join(dir, 'Integration', 'permit-renewal-api v1.1.yaml');
  if (!fs.existsSync(fixed)) {
    const y = fs.readFileSync(path.join(dir, 'Integration', 'permit-renewal-api.yaml'), 'utf8')
      .replace("schemas/EligibilityResult'", "schemas/EligibilityDecision'")
      .replace(/(schemas\/Photo'\r?\n)( +)'401':/, "$1$2'400':\n$2  $$ref: '#/components/responses/BadRequest'\n$2'401':");
    fs.writeFileSync(fixed, y);
  }
  const before = snapshot(dir);
  await openPrompt(page, 'integration-generate-scaffold');
  await pick(page, 'spec', 'Integration/permit-renewal-api v1.1.yaml');
  await pick(page, 'blueprint', 'Knowledge/Solution Blueprint - Permit Renewal.md');
  await pick(page, 'standards', 'Knowledge/API Standards.md');
  const { text, steps } = await run(page, 'scaffold');
  expect(stepsOf(steps)).toMatch(/Checking the API spec permit-renewal-api v1\.1\.yaml/);
  expect(stepsOf(steps)).toMatch(/Generating a mock and code stubs from permit-renewal-api v1\.1\.yaml/);
  all(text, /C#|\.NET|ASP\.NET/i, /\b501\b/, /startRenewal/, /uploadPhoto/, /BR-004\.1|FD-014/, /API_BASE_URL/);
  const c = changes(dir, before);
  expect(c.modified).toEqual([]);
  expect(added(c, /^Integration\/API\/Permit Renewal API.*\/src\/Controllers\/PhotosController\.cs$/).length).toBe(1);
  expect(added(c, /^Integration\/API\/Permit Renewal API.*\/mock\/index\.json$/).length).toBe(1);
});

// ---------- Engineering ----------

test('Engineering: the PR description traces the story and is saved under Pull requests', async ({ page, request }) => {
  const dir = await useSample(request, 'aidlc');
  const before = snapshot(dir);
  await openPrompt(page, 'engineering-pr-description');
  await fill(page, 'story', 'AB#1234 Reject photos older than 6 months');
  await pick(page, 'design', 'Knowledge/Technical Design - Permit Renewal.md');
  await fill(page, 'changes', 'PhotoValidator age rule changed from 12 to 6 months, 4 unit tests');
  const { text, steps } = await run(page, 'pr-description');
  expect(stepsOf(steps)).toMatch(/Saving draft .*PR description\.md/);
  all(text, /AB#1234/, /BR-004/);
  const c = changes(dir, before);
  expect(c.modified).toEqual([]);
  const pr = added(c, /^Pull requests\/.*PR description.*\.md$/);
  expect(pr.length).toBe(1);
  all(fs.readFileSync(path.join(dir, pr[0]), 'utf8'), /AB#1234/, /BR-004/, /rollback/i);
});

test('Engineering: Playwright tests are written per story with case and story tags', async ({ page, request }) => {
  const dir = await useSample(request, 'aidlc');
  const before = snapshot(dir);
  await openPrompt(page, 'engineering-playwright-tests');
  await pick(page, 'workbook', 'Quality/Test cases - Photo upload (SIT).xlsx');
  const { text, steps } = await run(page, 'playwright-tests');
  expect(stepsOf(steps)).toMatch(/Writing Playwright tests from Test cases - Photo upload \(SIT\)\.xlsx/);
  all(text, /us-104\.spec\.js/, /us-105\.spec\.js/, /@US-104/, /TC-102/, /--grep/, /fixme/);
  const c = changes(dir, before);
  expect(c.modified).toEqual([]);
  expect(added(c, /^Quality\/Playwright.*\/tests\/us-104\.spec\.js$/).length).toBe(1);
  expect(added(c, /^Quality\/Playwright.*\/playwright\.config\.js$/).length).toBe(1);
});

test('Engineering: the pipeline check finds the missing UAT stage, the PRD gate and the unpinned tasks', async ({ page, request }) => {
  const dir = await useSample(request, 'aidlc');
  const before = snapshot(dir);
  await openPrompt(page, 'engineering-lint-pipeline');
  await pick(page, 'pipeline', 'Environments/azure-pipelines.yml');
  const { text, steps } = await run(page, 'lint-pipeline');
  expect(stepsOf(steps)).toMatch(/Checking the pipeline azure-pipelines\.yml/);
  all(text, /\bUAT\b/, /approval/i, /DotNetCoreCLI@/, /AzureCLI@/, /\b18\b/, /\b46\b/, /secret/i);
  const c = changes(dir, before);
  expect(c.modified).toEqual([]);
  expect(c.added).toEqual([]);
});
