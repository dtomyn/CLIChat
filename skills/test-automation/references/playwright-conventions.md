# Playwright conventions

## Folder layout
```
Playwright/
  playwright.config.js      baseURL from BASE_URL, traces and screenshots on failure, HTML + JUnit reports
  tests/<story>.spec.js     one spec per story or feature
  pages/<Page>.js           page objects: selectors and actions for one page
  fixtures/test-data.js     data factories: unique, valid data per test
  results/                  JUnit output and attachments (published by CI, not committed)
```

## Page objects
```js
const { BasePage } = require('./BasePage');
class PhotoUploadPage extends BasePage {
  constructor(page) { super(page); this.file = page.getByLabel('Photo'); this.continue = page.getByRole('button', { name: 'Continue' }); }
  async upload(path) { await this.file.setInputFiles(path); }
}
module.exports = { PhotoUploadPage };
```
- Selectors live only in page objects. Prefer roles, labels and `data-testid`; avoid CSS chains and XPath.
- Page objects hold actions, not assertions. Assertions stay in the test so the expected result is visible.

## Test-data factories
- `makeUser({ ...overrides })` returns valid data with unique values (timestamps or counters), so tests never collide.
- Never use production data or real personal data. Synthetic data only.

## Tags and traceability
```js
test('TC-102 Reject a photo older than 6 months', { tag: ['@TC-102', '@US-104', '@BR-004', '@SIT', '@P1'] }, async ({ page }) => { ... });
```
- `npx playwright test --grep @US-104` runs one story; `--grep @P1` runs the smoke set; `--grep-invert @UAT` skips UAT-only cases.
- The JUnit report carries the test titles (with the TC ID), so results can be matched to Azure DevOps Test Plans.

## Steps and assertions
- One `test.step('1. <step action>')` per workbook step, with the expected result asserted inside it.
- Web-first assertions only: `await expect(page.getByText('Photo accepted')).toBeVisible()`.
- No `waitForTimeout` except a short settle before a screenshot.

## Evidence in CI
- `trace: 'retain-on-failure'` and `screenshot: 'only-on-failure'` in the config.
- Attach a screenshot at the end of each test: `await testInfo.attach('evidence', { body: await page.screenshot(), contentType: 'image/png' })`.
- The pipeline publishes `results/junit.xml` as test results and `playwright-report/` as a build artefact.

## Credentials
- Test accounts come from pipeline secrets or environment variables, never from the specs or the config.
