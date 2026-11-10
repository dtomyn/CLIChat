const { test, expect } = require('@playwright/test');

// The sample packs are offered from the Samples page in the rail, not from a banner on the home screen.
test('Samples page installs a pack and marks it as the current one', async ({ page }) => {
  await page.goto('/');
  // The app finishes loading after the first paint and can reset the view, so retry the click until the page stays up.
  await expect(async () => {
    await page.locator('.nav-item[data-nav="samples"]').click();
    await expect(page.locator('.page-head h1')).toHaveText('Sample data', { timeout: 1500 });
  }).toPass({ timeout: 15_000 });
  await expect(page.locator('.sample-card')).toHaveCount(5);

  await page.locator('[data-install-demo="data"]').click();
  await expect(page.locator('.demo-banner.active b')).toHaveText("You're in the Permit Applications data sample", { timeout: 15_000 });
  await expect(page.locator('.greeting h1')).toHaveText('Data Profiler');
  await expect(page.locator('.sample-hint')).toHaveCount(0);

  await page.locator('.nav-item[data-nav="samples"]').click();
  const here = page.locator('.sample-card.here');
  await expect(here).toHaveCount(1);
  await expect(here.locator('h3')).toHaveText('Data sample');
  await expect(here.locator('[data-recipe="data-profile"]')).toBeVisible();
  await expect(here.locator('[data-install-demo]')).toHaveCount(0);
});

test('Leave sample takes you out of the sample', async ({ page }) => {
  await page.goto('/');
  await expect(async () => {
    await page.locator('.nav-item[data-nav="samples"]').click();
    await expect(page.locator('.page-head h1')).toHaveText('Sample data', { timeout: 1500 });
  }).toPass({ timeout: 15_000 });
  // A previous test may already have left the data sample installed.
  if (await page.locator('[data-install-demo="data"]').count()) await page.locator('[data-install-demo="data"]').click();
  else await page.locator('[data-leave-sample]').click();
  await expect(page.locator('.demo-banner.active, .sample-card.here')).toHaveCount(0, { timeout: 15_000 }).catch(() => {});
  if (!(await page.locator('.demo-banner.active').count())) await page.locator('[data-install-demo="data"]').click();
  await expect(page.locator('.demo-banner.active')).toBeVisible({ timeout: 15_000 });

  await page.locator('.demo-banner [data-leave-sample]').click();
  await expect(page.locator('.demo-banner.active')).toHaveCount(0);
});
