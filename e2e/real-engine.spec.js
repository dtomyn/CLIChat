// Runs the new project-plan prompts through a REAL engine (GitHub Copilot CLI or Claude Code), to check what an AI makes of the tool results.
// Slow and uses your Copilot plan, so it only runs when asked:   E2E_ENGINE=copilot|claude npx playwright test e2e/real-engine.spec.js
// Each reply is saved as text next to its screenshot in e2e/screenshots/ so it can be read afterwards.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const project = require('../tools/project');
const raid = require('../tools/raid');
const { ENGINE, SHOTS, openPrompt, pick, run } = require('./real-engine-helpers');

test.skip(!['copilot', 'claude'].includes(ENGINE), 'Set E2E_ENGINE=copilot or claude to run against a real engine');
test.setTimeout(480_000);

const DEMO_FILES = path.join(__dirname, '..', 'demo');
let demo;

test.beforeAll(async ({ request }) => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const res = await request.post('/api/demo/install', { data: { pack: 'crm' } });
  expect(res.ok()).toBeTruthy();
  demo = (await res.json()).path;
});

test('Weekly look-ahead', async ({ page }) => {
  await openPrompt(page, 'plan-lookahead');
  await pick(page, 'plan', 'Contoso CRM Migration.xml');
  const { text, steps } = await run(page, 'lookahead');
  expect(steps.join(' ')).toMatch(/Looking ahead/);
  expect(text).toMatch(/Build/);
  expect(text).toMatch(/Data cleansing/);
});

test('Update plan from ADO backlog proposes changes and does not apply them unasked', async ({ page }) => {
  const before = fs.readdirSync(demo).filter((f) => /\(updated\)/.test(f));
  await openPrompt(page, 'plan-progress-from-backlog');
  await pick(page, 'plan', 'Contoso CRM Migration.xml');
  await pick(page, 'backlog', 'ADO Backlog Export - 30 Oct 2026.xlsx');
  await page.locator('[data-field="status"]').fill('2026-10-30');
  const { text, steps } = await run(page, 'backlog');
  expect(steps.join(' ')).toMatch(/Matching/);
  expect(text).toMatch(/88/); // task 17 proposed 70% -> 88%
  expect(text).toMatch(/#?25/); // the held-back task
  expect(text).toMatch(/approve|confirm/i);
  expect(fs.readdirSync(demo).filter((f) => /\(updated\)/.test(f))).toEqual(before); // nothing was written
});

test('Monthly plan change log', async ({ page }) => {
  const plan = path.join(demo, 'Contoso CRM Migration.xml');
  project.recordVersion(project.load(plan), demo);
  project.updatePlan(plan, { statusDate: '2026-10-30', updates: [{ taskId: 23, finish: '2026-12-01' }, { taskId: 18, percentComplete: 55 }] }, demo);
  await openPrompt(page, 'plan-change-log');
  await pick(page, 'plan', 'Contoso CRM Migration (updated).xml');
  const { text, steps } = await run(page, 'changelog');
  expect(steps.join(' ')).toMatch(/Comparing/);
  expect(text).toMatch(/Build complete/);
  expect(text).toMatch(/\+5/);
});

test('Weekly executive status says which RAID log it used and what is still pending', async ({ page }) => {
  // The huddle left proposed RAID changes that nobody has reviewed yet.
  const log = path.join(demo, 'CRM Migration - RAID Log.xlsx');
  fs.copyFileSync(path.join(DEMO_FILES, 'Huddle 10-30 - 30 Oct 2026.vtt'), path.join(demo, 'huddle.vtt'));
  await raid.propose(log, path.join(demo, 'huddle.vtt'), [
    { change: 'add', kind: 'risk', fields: { title: 'Performance environment not ready', owner: 'Grace Kim', probability: 'H', impact: 'H' }, evidence: { quote: "the performance environment won't be ready before performance testing starts" } },
    { change: 'close', kind: 'issue', id: 'I-01', evidence: { quote: 'So I think we can close the sandbox issue' } },
  ], { meetingDate: '2026-10-30' });
  await openPrompt(page, 'exec-status-pack');
  await pick(page, 'plan', 'Contoso CRM Migration (updated).xml');
  await pick(page, 'raid', 'CRM Migration - RAID Log.xlsx');
  const { text, steps } = await run(page, 'status-pack');
  expect(steps.join(' ')).toMatch(/status/i);
  expect(text).toMatch(/pending|waiting|awaiting|not yet reviewed|review/i);
  expect(text).toMatch(/2/);
  const packs = fs.readdirSync(path.join(demo, 'Status reports'));
  expect(packs.length).toBeGreaterThan(0);
});
