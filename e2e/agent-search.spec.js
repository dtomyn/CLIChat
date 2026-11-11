const { test, expect } = require('@playwright/test');

// The Agents page has a search box that filters the cards as you type.
test('Agents page search filters by name and skill, and Escape clears it', async ({ page }) => {
  await page.goto('/');
  // The app finishes loading after the first paint and can reset the view, so retry the click until the page stays up.
  await expect(async () => {
    await page.locator('.nav-item[data-nav="assistants"]').click();
    await expect(page.locator('.page-head h1')).toHaveText('Agents', { timeout: 1500 });
  }).toPass({ timeout: 15_000 });

  const cards = page.locator('.a-card[data-agent-text]:visible');
  const total = await cards.count();
  expect(total).toBeGreaterThan(10);
  const search = page.locator('#agentSearch');
  await expect(search).toBeFocused();

  await search.fill('budget');
  await expect(cards).toHaveCount(1);
  await expect(cards.locator('h3')).toHaveText('Budget Controller');

  // A word that only some agents mention: the agent named for it is listed first.
  await search.fill('traceability');
  expect(await cards.count()).toBeGreaterThan(1);
  const first = await page.locator('.a-card[data-agent-text]:visible').evaluateAll((els) =>
    els.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top || a.getBoundingClientRect().left - b.getBoundingClientRect().left)[0].querySelector('h3').textContent);
  expect(first).toBe('Traceability Analyst');

  await search.fill('zzz no such agent');
  await expect(cards).toHaveCount(0);
  await expect(page.locator('.agent-search-empty')).toBeVisible();
  await expect(page.locator('.new-card')).toBeVisible();

  await search.press('Escape');
  await expect(search).toHaveValue('');
  await expect(cards).toHaveCount(total);
});

test('Agents page sort order is A to Z by default, can be changed and is remembered', async ({ page, request }) => {
  await request.put('/api/settings', { data: { agentSort: null } });
  await page.goto('/#/agents');
  const sort = page.locator('#agentSort');
  await expect(sort).toHaveValue('name', { timeout: 15_000 });
  const names = () => page.locator('.a-card[data-agent-text] h3').allTextContents();
  const az = await names();
  expect(az).toEqual([...az].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })));

  await sort.selectOption('original');
  await expect(page.locator('.a-card[data-agent-text] h3').first()).toHaveText('Lumen');

  await page.reload();
  await expect(page.locator('#agentSort')).toHaveValue('original', { timeout: 15_000 });
  await request.put('/api/settings', { data: { agentSort: null } });
});

// The "Who should help?" picker in the message box has a search box, so a long list of agents stays usable.
test('agent picker in the message box can be searched and picked with the keyboard', async ({ page }) => {
  await page.goto('/');
  await expect(async () => {
    await page.locator('#assistantPill').click();
    await expect(page.locator('.menu-filter')).toBeFocused({ timeout: 1500 });
  }).toPass({ timeout: 15_000 });
  const items = page.locator('.menu-search .menu-item');
  expect(await items.count()).toBeGreaterThan(10);
  await page.keyboard.type('budget');
  await expect(items.filter({ hasText: 'Budget Controller' })).toHaveCount(1);
  await expect(items.filter({ hasText: 'Create an agent' })).toHaveCount(1);
  await page.keyboard.press('Enter');
  await expect(page.locator('.menu')).toHaveCount(0);
  await expect(page.locator('#assistantPill')).toContainText('Budget Controller');
});
