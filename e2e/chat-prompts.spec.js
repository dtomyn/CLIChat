const { test, expect } = require('@playwright/test');

// "Use a prompt" from the + menu in an open chat sends the filled-in prompt into that chat, not a new one.
test('a gallery prompt can be used inside an open chat', async ({ page, request }) => {
  const recipes = await (await request.get('/api/recipes')).json();
  const r = recipes.find((x) => (x.fields || []).length && x.fields.every((f) => f.type !== 'file'));
  expect(r, 'a prompt with only text fields').toBeTruthy();

  await page.goto('/');
  await expect(async () => {
    await page.locator('#input').fill('Hello');
    await page.locator('#sendBtn').click();
    await expect(page.locator('.msg.user')).toHaveCount(1, { timeout: 1500 });
  }).toPass({ timeout: 15_000 });
  await expect(page.locator('#sendBtn')).not.toHaveClass(/stop/, { timeout: 30_000 });
  const convs = async () => (await (await request.get('/api/conversations')).json()).length;
  const before = await convs();

  await page.locator('#attachBtn').click();
  await page.getByText('Use a prompt').click();
  await page.locator('#promptSearch').fill(r.name);
  await page.locator(`[data-pick-recipe="${r.id}"]`).click();
  await expect(page.locator('.modal-head h2')).toHaveText(r.name);
  for (const input of await page.locator('.modal input[data-field]:visible, .modal textarea[data-field]:visible').all()) await input.fill('Example');
  await page.locator('.btn.grad', { hasText: 'Start' }).click();

  await expect(page.locator('.msg.user')).toHaveCount(2);
  await expect(page.locator('#sendBtn')).not.toHaveClass(/stop/, { timeout: 30_000 });
  expect(await convs()).toBe(before);
});

test('a gallery prompt can start a brand new chat from the message box', async ({ page, request }) => {
  const recipes = await (await request.get('/api/recipes')).json();
  const r = recipes.find((x) => (x.fields || []).length && x.fields.every((f) => f.type !== 'file'));
  await page.goto('/');
  await expect(async () => {
    await page.locator('#attachBtn').click();
    await page.getByText('Use a prompt').click({ timeout: 1500 });
  }).toPass({ timeout: 15_000 });
  await page.locator('#promptSearch').fill(r.name);
  await page.locator(`[data-pick-recipe="${r.id}"]`).click();
  for (const input of await page.locator('.modal input[data-field]:visible, .modal textarea[data-field]:visible').all()) await input.fill('Example');
  await page.locator('.btn.grad', { hasText: 'Start' }).click();
  await expect(page.locator('.msg.user')).toHaveCount(1);
  await expect(page.locator('#sendBtn')).not.toHaveClass(/stop/, { timeout: 30_000 });
});
