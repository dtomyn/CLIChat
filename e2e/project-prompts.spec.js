const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const project = require('../tools/project');

const SHOTS = path.join(__dirname, 'screenshots');
let demo; // the installed demo folder

test.beforeAll(async ({ request }) => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const res = await request.post('/api/demo/install', { data: { pack: 'crm' } });
  expect(res.ok()).toBeTruthy();
  demo = (await res.json()).path;
});

// The app finishes loading after the first paint and can reset the view, so retry the click until the gallery stays up.
async function openGallery(page) {
  await page.goto('/');
  await expect(async () => {
    await page.locator('.nav-item[data-nav="recipes"]').click();
    await expect(page.locator('.page-head h1')).toHaveText('Prompt gallery', { timeout: 1500 });
  }).toPass({ timeout: 15_000 });
}

async function openPrompt(page, id) {
  await openGallery(page);
  await page.locator(`[data-recipe="${id}"]`).click();
  await expect(page.locator('.modal-head h2')).toBeVisible();
}

// File choices load asynchronously; wait until the picker has settled on a file.
async function pickedFile(page, key) {
  const sel = page.locator(`[data-file-select="${key}"]`);
  await expect(sel).not.toHaveValue('');
  return sel.evaluate((s) => s.selectedOptions[0].textContent);
}

async function start(page, shot) {
  await page.locator('.btn.grad', { hasText: 'Start' }).click();
  const reply = page.locator('.msg.assistant').last();
  await expect(reply).toContainText(/\S/, { timeout: 15_000 });
  await expect(page.locator('.msg.assistant .spinner')).toHaveCount(0, { timeout: 15_000 });
  await expect(page.locator('.msg.assistant .msg-actions')).toBeVisible();
  await reply.screenshot({ path: path.join(SHOTS, `${shot}.png`) }); // the whole reply, tables included
  return reply;
}

test('the new prompts are in the Project plans gallery', async ({ page }) => {
  await openGallery(page);
  await page.locator('.tab', { hasText: 'Project plans' }).click();
  for (const name of ['Monthly plan change log', 'Weekly look-ahead', 'Update plan from ADO backlog']) {
    await expect(page.locator('.recipe-card', { hasText: name })).toBeVisible();
  }
  await page.waitForTimeout(600); // let the cards fade in
  await page.screenshot({ path: path.join(SHOTS, 'gallery.png') });
});

test('Weekly look-ahead: plan is preselected, steps and answer show', async ({ page }) => {
  await openPrompt(page, 'plan-lookahead');
  expect(await pickedFile(page, 'plan')).toMatch(/Contoso CRM Migration\.xml$/);
  const reply = await start(page, 'lookahead');
  await expect(page.locator('.msg.assistant .step')).toContainText('Looking ahead in Contoso CRM Migration.xml');
  await expect(reply).toContainText('1 late carry-over');
  await expect(reply).toContainText('4 Build');
  await expect(reply).toContainText('5 Testing');
  await expect(page.locator('.msg.assistant .error, .msg.assistant [data-error]')).toHaveCount(0);
});

test('Update plan from ADO backlog: files are preselected and proposals show', async ({ page }) => {
  await openPrompt(page, 'plan-progress-from-backlog');
  expect(await pickedFile(page, 'plan')).toMatch(/Contoso CRM Migration\.xml$/);
  expect(await pickedFile(page, 'backlog')).toMatch(/ADO Backlog Export - 30 Oct 2026\.xlsx$/);
  await page.locator('[data-field="status"]').fill('2026-10-30');
  const reply = await start(page, 'backlog');
  await expect(page.locator('.msg.assistant .step')).toContainText('Matching ADO Backlog Export - 30 Oct 2026.xlsx to Contoso CRM Migration.xml');
  await expect(reply).toContainText('24 backlog items');
  await expect(reply).toContainText('4 % complete changes proposed');
  await expect(reply.locator('table tbody tr')).toHaveCount(4);
  await expect(reply).toContainText('Held back: #25');
});

test('Repeat… is offered on the new prompts', async ({ page }) => {
  await openPrompt(page, 'plan-lookahead');
  await page.getByRole('button', { name: 'Repeat…' }).click();
  await expect(page.locator('#scheduleKind')).toBeVisible();
  await page.locator('#scheduleKind').selectOption('weekly');
  await expect(page.locator('#scheduleDays')).toBeVisible();
  await page.screenshot({ path: path.join(SHOTS, 'repeat.png') });
});

test('Monthly plan change log: material changes are listed with reasons', async ({ page }) => {
  // The change log compares with a saved earlier version, so make one the way "Update plan from progress sheet" would.
  const plan = path.join(demo, 'Contoso CRM Migration.xml');
  project.recordVersion(project.load(plan), demo);
  project.updatePlan(plan, { statusDate: '2026-10-30', updates: [{ taskId: 23, finish: '2026-12-01' }, { taskId: 18, percentComplete: 55 }] }, demo);
  await openPrompt(page, 'plan-change-log');
  // Two versions of one plan are in the folder; the picker should settle on the newest.
  expect(await pickedFile(page, 'plan')).toMatch(/\(updated\)\.xml$/);
  const reply = await start(page, 'changelog');
  await expect(page.locator('.msg.assistant .step')).toContainText('Comparing Contoso CRM Migration (updated).xml with an earlier version');
  await expect(reply).toContainText('material');
  await expect(reply.locator('table tbody tr').first()).toContainText('working days');
  await expect(reply).toContainText('Build complete');
});
