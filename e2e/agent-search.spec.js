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
