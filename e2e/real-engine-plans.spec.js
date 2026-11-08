// Runs one prompt from each category added by plans 09 to 17 through a REAL engine (GitHub Copilot CLI or Claude Code),
// against the sample packs and their seeded defects, to check what an AI makes of the tool results.
// Slow and uses your Copilot plan, so it only runs when asked:   E2E_ENGINE=copilot|claude npx playwright test e2e/real-engine-plans.spec.js
// Each reply is saved as text next to its screenshot in e2e/screenshots/ so it can be read afterwards.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { ROOT } = require('./paths');
const { ENGINE, openPrompt, pick, run, snapshot, changes } = require('./real-engine-helpers');

test.skip(!['copilot', 'claude'].includes(ENGINE), 'Set E2E_ENGINE=copilot or claude to run against a real engine');
test.setTimeout(480_000);

// The crm, aidlc and data packs install from the home screen. The change and security samples are opened as a
// project folder of their own, so they are copied next to the others and chosen as the project folder.
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

test('Quality engineering: triage defects finds the duplicates and the mismatch, and records nothing unasked', async ({ page, request }) => {
  const dir = await useSample(request, 'aidlc');
  const before = snapshot(dir);
  await openPrompt(page, 'qe-triage-defects');
  await pick(page, 'defects', 'Defects export.xlsx');
  await page.locator('[data-field="asof"]').fill('2026-11-06');
  const { text, steps } = await run(page, 'qe-triage');
  expect(steps.join(' ')).toMatch(/Triaging defects/);
  expect(steps.join(' ')).not.toMatch(/Proposing/);
  all(text, /1201/, /1204/, /1203/, /1206/, /1207/);
  expect(text).toMatch(/which|record|approve|confirm|agree/i);
  const c = changes(dir, before);
  expect(c.modified).toEqual([]);
  expect(c.added.filter((f) => /\(proposed\)/i.test(f))).toEqual([]);
});

test('Planning: delivery scenarios model both slips and leave the plan alone', async ({ page, request }) => {
  const dir = await useSample(request, 'crm');
  const before = snapshot(dir);
  await openPrompt(page, 'delivery-scenarios');
  await pick(page, 'plan', 'Contoso CRM Migration.xml');
  await page.locator('[data-field="scenarios"]').fill('A: Build ERP integration (task 18) takes 10 more working days. B: User acceptance testing (task 28) slips 5 working days.');
  const { text, steps } = await run(page, 'scenarios');
  expect(steps.filter((s) => /Modelling/.test(s)).length).toBeGreaterThanOrEqual(2);
  expect(text).toMatch(/2027-01-19|19 Jan|Jan(uary)? 19/); // A: go-live +10 working days
  expect(text).toMatch(/2027-01-12|12 Jan|Jan(uary)? 12/); // B: go-live +5 working days
  const c = changes(dir, before);
  expect(c.modified).toEqual([]);
  expect(c.added.filter((f) => /\(updated\)/i.test(f))).toEqual([]);
});

test('Change & training: bilingual QA finds the term, the number and the missing paragraph', async ({ page, request }) => {
  const dir = await useSample(request, 'change');
  const before = snapshot(dir);
  await openPrompt(page, 'bilingual-qa');
  await pick(page, 'english', 'Renewal guide (EN).docx');
  await pick(page, 'french', 'Guide de renouvellement (FR).docx');
  await pick(page, 'glossary', 'EN-FR Glossary.xlsx');
  const { text, steps } = await run(page, 'bilingual-qa');
  expect(steps.join(' ')).toMatch(/Checking Guide de renouvellement \(FR\)\.docx against/);
  all(text, /requête/i, /demande de renouvellement/i, /\b30\b/, /\b60\b/, /refund|rembours/i, /translator/i);
  expect(changes(dir, before).modified).toEqual([]);
});

test('Release: readiness check is Red because of the missing PRD-04 evidence', async ({ page, request }) => {
  const dir = await useSample(request, 'crm');
  const before = snapshot(dir);
  await openPrompt(page, 'release-readiness-check');
  await pick(page, 'checklist', 'Release Readiness Checklist - Go-live.xlsx');
  await page.locator('[data-field="asof"]').fill('2026-12-31');
  const { text, steps } = await run(page, 'readiness');
  expect(steps.join(' ')).toMatch(/Checking release readiness/);
  all(text, /\bRed\b/i, /PRD-04/, /PRD access review/i, /UAT-02/);
  expect(changes(dir, before).modified).toEqual([]);
});

test('Architecture: review finds the unknown component, the superseded ADR and the data model gaps', async ({ page, request }) => {
  const dir = await useSample(request, 'aidlc');
  const before = snapshot(dir);
  await openPrompt(page, 'architecture-review');
  await pick(page, 'blueprint', 'Knowledge/Solution Blueprint - Permit Renewal.md');
  await pick(page, 'design', 'Knowledge/Technical Design - Permit Renewal.md');
  await page.locator('[data-field="adrs"]').fill('Architecture/ADRs');
  await pick(page, 'model', 'Knowledge/Data Model - Permit Renewal.xlsx');
  const { text, steps } = await run(page, 'architecture-review');
  expect(steps.join(' ')).toMatch(/for consistency/);
  all(text, /Address lookup/i, /ADR-002/, /ADR-003/, /Renewal Fee|renewalCount/);
  expect(changes(dir, before).modified).toEqual([]);
});

test('Security: evidence gap check reports the missing, stale and orphan evidence', async ({ page, request }) => {
  const dir = await useSample(request, 'security');
  const before = snapshot(dir);
  await openPrompt(page, 'security-evidence-gaps');
  await pick(page, 'sctm', 'SCTM - Online Permit Renewal.xlsx');
  await page.locator('[data-field="evidence"]').fill('Evidence');
  await pick(page, 'catalogue', 'Control Catalogue (synthetic).xlsx');
  await page.locator('[data-field="days"]').fill('365');
  const { text, steps } = await run(page, 'security-evidence');
  expect(steps.join(' ')).toMatch(/Checking security controls and evidence/);
  all(text, /CM-2/, /AC-3/, /SI-2/, /Firewall rule export/i);
  const c = changes(dir, before);
  expect(c.modified).toEqual([]);
  expect(c.added.filter((f) => /\(proposed\)/i.test(f))).toEqual([]); // no SCTM change was asked for, only remediation items
});

test('Data: profiling finds the seeded data quality defects', async ({ page, request }) => {
  const dir = await useSample(request, 'data');
  const before = snapshot(dir);
  await openPrompt(page, 'data-profile');
  await pick(page, 'extract', 'Applications - source extract.csv');
  await pick(page, 'dictionary', 'Data Dictionary - Applications.xlsx');
  const { text, steps } = await run(page, 'data-profile');
  expect(steps.join(' ')).toMatch(/Profiling Applications - source extract\.csv/);
  // Problems are referred to by column and row (the prompt says not to read raw rows), so values such as PENDING may not appear.
  all(text, /SUBMIT_DT/, /APP_TYPE/, /CLIENT_ID/, /STATUS_CD/, /APP_ID/, /\b24\b/, /\b32\b/);
  expect(changes(dir, before).modified).toEqual([]);
});

test('Integration: OpenAPI review finds the broken reference and the missing 400', async ({ page, request }) => {
  const dir = await useSample(request, 'aidlc');
  const before = snapshot(dir);
  await openPrompt(page, 'integration-review-openapi');
  await pick(page, 'spec', 'Integration/permit-renewal-api.yaml');
  await pick(page, 'standards', 'Knowledge/API Standards.md');
  const { text, steps } = await run(page, 'openapi-review');
  expect(steps.join(' ')).toMatch(/Checking the API spec permit-renewal-api\.yaml/);
  all(text, /EligibilityResult/, /\b400\b/, /photo/i);
  expect(text).toMatch(/not (yet )?ready|isn.t ready|ready for scaffolding\?\s*No\b|errors? (must|need)/i);
  expect(changes(dir, before).modified).toEqual([]);
});

test('Engineering: config comparison finds the drift and never shows the secret', async ({ page, request }) => {
  const dir = await useSample(request, 'aidlc');
  const before = snapshot(dir);
  await openPrompt(page, 'engineering-compare-configs');
  await page.locator('[data-field="folder"]').fill('Environments');
  await pick(page, 'rules', 'Environments/Config rules.md');
  const { text, steps } = await run(page, 'compare-configs');
  expect(steps.join(' ')).toMatch(/Comparing environment configs/);
  all(text, /NOTIFY_QUEUE_NAME/, /1\.3\.9-hotfix/, /DB_PASSWORD/);
  expect(text).not.toContain('Pr0d-Renew4l');
  expect(changes(dir, before).modified).toEqual([]);
});
