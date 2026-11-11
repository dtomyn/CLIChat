const { test, expect } = require('@playwright/test');
const path = require('path');
const SHOT = (n) => path.join(__dirname, 'screenshots', `${n}.png`);

// Quick prompts (intent 72): tabs under the home message box fill it in without sending; Tab moves between [blanks];
// "…" opens the Prompt Lab; prompts saved from a chat show under "Your saved prompts".
async function home(page) {
  await page.goto('/');
  await expect(page.locator('.qp-tab').first()).toBeVisible({ timeout: 15_000 });
}

test('a topic tab prompt fills the message box with its first blank selected, and is not sent', async ({ page }) => {
  await home(page);
  await page.locator('.qp-tab', { hasText: 'Write' }).click();
  await expect(page.locator('.qp-tab.active')).toHaveText('Write');
  await page.locator('.qp-item', { hasText: 'Draft a short email' }).click();
  const input = page.locator('#input');
  await expect(input).toHaveValue(/^Draft a short email to \[recipient\]/);
  expect(await input.evaluate((el) => el.value.slice(el.selectionStart, el.selectionEnd))).toBe('[recipient]');
  await page.keyboard.type('the sponsor');
  await page.keyboard.press('Tab');
  expect(await input.evaluate((el) => el.value.slice(el.selectionStart, el.selectionEnd))).toBe('[topic]');
  await expect(page.locator('.msg.user')).toHaveCount(0);
  await expect(page.locator('.composer-hint')).toContainText('next blank');
  await page.waitForTimeout(900); // let the home page fade in
  await page.screenshot({ path: SHOT('quick-prompts-home') });
});

test('the Prompt Lab lists topics, searches prompts and guided tasks, and opens a guided form', async ({ page, request }) => {
  await home(page);
  await page.locator('[data-qp-more]').click();
  await expect(page.locator('.modal-head h2')).toHaveText('Prompt Lab');
  await page.locator('.lab-nav-item', { hasText: 'Summarize' }).click();
  await expect(page.locator('.lab-use').first()).toBeVisible();
  await page.screenshot({ path: SHOT('prompt-lab') });
  const recipes = await (await request.get('/api/recipes')).json();
  const r = recipes.find((x) => x.id === 'plan-health-check');
  await page.locator('#promptSearch').fill('health check');
  await expect(page.locator('.lab-use', { hasText: r.name })).toBeVisible(); // the quick version of the guided task
  await page.locator(`.prompt-pick[data-pick-recipe="${r.id}"]`).click();
  await expect(page.locator('.modal-head h2')).toHaveText(r.name);
  await page.locator('[data-just-prompt]').click();
  await expect(page.locator('#input')).toHaveValue(/health check on the project plan/);
});

test('Save prompt under a message saves a quick prompt to Your saved prompts', async ({ page, request }) => {
  await home(page);
  await expect(async () => {
    await page.locator('#input').fill('Summarize the week for my sponsor');
    await page.locator('#sendBtn').click();
    await expect(page.locator('.msg.user')).toHaveCount(1, { timeout: 1500 });
  }).toPass({ timeout: 15_000 });
  await expect(page.locator('#sendBtn')).not.toHaveClass(/stop/, { timeout: 30_000 });
  await page.locator('.msg.user [data-save-recipe]').click();
  await page.locator('[data-pe="title"]').fill('Weekly sponsor summary');
  await page.locator('.modal .btn.primary', { hasText: 'Save' }).click();
  const saved = (await (await request.get('/api/prompts')).json()).find((p) => p.title === 'Weekly sponsor summary');
  expect(saved?.text).toBe('Summarize the week for my sponsor');
  await page.locator('.nav-item[data-nav="prompts"]').click();
  await page.locator('.lab-nav-item', { hasText: 'Your saved prompts' }).click();
  await expect(page.locator('.lab-use', { hasText: 'Weekly sponsor summary' })).toBeVisible();
  await request.delete(`/api/prompts/${saved.id}`);
});
