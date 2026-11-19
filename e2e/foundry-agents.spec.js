// Contoso agents hosted in Microsoft Foundry (intent 73), against the stand-in Foundry in e2e/start-server.js.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { PROJECT } = require('./paths');

const SHOTS = path.join(__dirname, 'screenshots');

async function openAgent(page, id) {
  await page.goto('/');
  await expect(async () => {
    await page.locator('.nav-item[data-nav="assistants"]').click();
    await expect(page.locator(`[data-chat-with="${id}"]`).first()).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 15_000 });
  await page.locator(`[data-chat-with="${id}"]`).first().click();
}

test.beforeAll(() => {
  fs.mkdirSync(SHOTS, { recursive: true });
  fs.writeFileSync(path.join(PROJECT, 'Intake BRD.md'), '# 2.1 Submit\nThe applicant must be able to submit an application online.\n');
});

test('Contoso agents are listed with a Microsoft Foundry tag and are hidden from the engine picker', async ({ page, request }) => {
  const agents = await (await request.get('/api/assistants')).json();
  const contoso = agents.filter((a) => a.foundry?.agent);
  expect(contoso.length).toBeGreaterThanOrEqual(20);
  const status = await (await request.get('/api/status')).json();
  expect(status.providers.find((p) => p.id === 'foundry')?.agentOnly).toBe(true);
  const res = await request.put('/api/settings', { data: { providerId: 'foundry' } });
  expect(res.status()).toBe(400);

  await page.goto('/');
  await expect(async () => {
    await page.locator('.nav-item[data-nav="assistants"]').click();
    await expect(page.locator('.status-tag', { hasText: 'Microsoft Foundry' }).first()).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 15_000 });
  await page.screenshot({ path: path.join(SHOTS, 'foundry-agents-gallery.png') });
});

test('a requirements refinement reply renders the agent result as tables', async ({ page }) => {
  await openAgent(page, 'contoso-business-requirements-refinement');
  await page.locator('#input').first().fill('Refine the intake BRD. Document key INTAKE.');
  await page.keyboard.press('Enter');
  const reply = page.locator('.msg.assistant').last();
  await expect(reply).toContainText('Extracted 2 functional and 1 non-functional requirements', { timeout: 30_000 });
  await expect(reply).toContainText('At a glance');
  await expect(reply).toContainText('Safety checks flagged 1 item');
  await expect(reply.locator('table')).toContainText('INTAKE-FR-001');
  await expect(reply.locator('details summary')).toContainText('Full result from the agent');
  await page.screenshot({ path: path.join(SHOTS, 'foundry-requirements-reply.png'), fullPage: true });
});

test('an agent pause shows an Approve card and approving resumes the agent', async ({ page }) => {
  await openAgent(page, 'contoso-interface-documentation');
  await page.locator('#input').first().fill('Draft the ICD for the Name Search interface');
  await page.keyboard.press('Enter');
  const card = page.locator('.approval-card').last();
  await expect(card).toContainText('Confirm integration pattern for IF-CSP-NS-001', { timeout: 30_000 });
  await expect(card).toContainText('Microsoft Foundry');
  await expect(card.locator('[data-ap-apply]')).toHaveText(/Approve/);
  await page.screenshot({ path: path.join(SHOTS, 'foundry-approval-card.png'), fullPage: true });
  await card.locator('[data-ap-apply]').click();
  await expect(page.locator('.msg.assistant').last()).toContainText('ICD draft for IF-CSP-NS-001', { timeout: 30_000 });
  await expect(page.locator('.approval-card').first()).toContainText('Approved');
});
