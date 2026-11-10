const { test, expect } = require('@playwright/test');

async function openWorkiq(page) {
  await page.goto('/');
  await expect(async () => {
    await page.locator('#settingsBtn').click();
    await expect(page.locator('#sWorkiq')).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15000 });
  await page.locator('#sWorkiq').click();
}

test('WorkIQ settings distinguish sign-in launch from connection and discovery', async ({ page }) => {
  let connection = { status: 'not-checked', message: '', checkedAt: null };
  let launchedFor, saved;
  await page.route('**/api/connections/workiq**', async (route) => {
    const req = route.request(), url = new URL(req.url());
    if (req.method() === 'PUT') {
      saved = req.postDataJSON();
      return route.fulfill({ json: saved });
    }
    if (req.method() === 'POST') {
      launchedFor = url.searchParams.get('providerId');
      connection = { status: 'sign-in-opened', message: 'Connector dashboard opened; document access not checked.', checkedAt: Date.now() };
    }
    await route.fulfill({ status: req.method() === 'POST' ? 202 : 200,
      json: { enabled: false, providerId: url.searchParams.get('providerId'), integration: url.searchParams.get('providerId') === 'copilot-cli' ? 'connector' : 'standalone', canSignIn: true, connection } });
  });
  await openWorkiq(page);
  await expect(page.locator('#wqStatus')).toContainText('Not checked in Lumen');
  await expect(page.locator('#wqTenant')).toHaveCount(0);
  await expect(page.locator('#wqOn')).toContainText('Available to every agent in new and existing chats');
  await page.locator('#wqEngine').selectOption('copilot-cli');
  await expect(page.locator('#wqConnect')).toBeEnabled();
  await expect(page.locator('#wqConnect')).toHaveText('Open Work IQ connector');
  await expect(page.locator('#wqConnectionHelp')).toContainText('existing Work IQ connector');
  await expect(page.locator('#wqConnectionHelp')).toContainText('workiqmcp');
  await expect(page.locator('#wqConnectionHelp')).toContainText('GitHub sign-in');
  await expect(page.locator('#wqConnectionHelp')).toContainText('no separate Work IQ CLI sign-in');
  await page.locator('#wqConnect').click();
  await expect(page.locator('#wqStatus')).toContainText('Connection window opened');
  await expect(page.locator('#wqStatus')).not.toContainText('Engine connected to Microsoft 365');
  expect(launchedFor).toBe('copilot-cli');
  connection = { status: 'connected', toolCount: 12, message: '', checkedAt: Date.now() };
  await page.locator('#wqRefresh').click();
  await expect(page.locator('#wqStatus')).toContainText('Engine connected to Microsoft 365');
  await expect(page.locator('#wqStatus')).toContainText('Tools discovered: 12');
  await page.locator('#wqOn').click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('#wqStatus')).toHaveCount(0);
  expect(saved).toEqual({ enabled: true });
});

test('WorkIQ settings expose engine-specific errors as text, not markup', async ({ page }) => {
  await page.route('**/api/connections/workiq**', async (route) => {
    const providerId = new URL(route.request().url()).searchParams.get('providerId');
    if (route.request().method() === 'POST') return route.fulfill({ status: 502, json: { error: 'Could not open the sign-in window' } });
    await route.fulfill({ json: { enabled: true, providerId, integration: providerId === 'copilot-cli' ? 'connector' : 'standalone', canSignIn: true,
      connection: providerId === 'claude-cli' ? { status: 'needs-auth', message: 'Microsoft sign-in needed <img src=x>', checkedAt: Date.now() }
        : { status: 'failed', message: 'Policy denied access', checkedAt: Date.now() } } });
  });
  await openWorkiq(page);
  await page.locator('#wqEngine').selectOption('claude-cli');
  await expect(page.locator('#wqStatus')).toContainText('Sign-in needed');
  await expect(page.locator('#wqConnect')).toHaveText('Sign in / check connection');
  await expect(page.locator('#wqConnectionHelp')).toContainText('requires its own consent');
  await expect(page.locator('#wqStatus')).toContainText('<img src=x>');
  await expect(page.locator('#wqStatus img')).toHaveCount(0);
  await page.locator('#wqEngine').selectOption('copilot-cli');
  await expect(page.locator('#wqStatus')).toContainText('Policy denied access');
  await expect(page.locator('#wqConnect')).toHaveText('Open Work IQ connector');
  await page.locator('#wqConnect').click();
  await expect(page.locator('#wqStatus')).toHaveText('Could not open the sign-in window');
  await expect(page.locator('#wqConnect')).toBeEnabled();
});
