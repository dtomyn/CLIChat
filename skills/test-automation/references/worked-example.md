# Worked example: Lumen's own e2e suite

Lumen tests itself with Playwright (`e2e/` and `playwright.config.js` in the Lumen repository). It shows the conventions at small scale.

| Convention | How Lumen's suite does it |
|---|---|
| Isolated environment | `e2e/start-server.js` starts the app on its own port with a throw-away data folder (`e2e/paths.js`), so tests never touch real data |
| Config | `playwright.config.js`: `testDir: './e2e'`, `baseURL` from the port, `screenshot: 'only-on-failure'`, a `webServer` entry that starts and stops the app |
| Test data | `test.beforeAll` installs a sample pack through the API (`POST /api/demo/install`), so every run starts from known data |
| Helpers instead of repeated selectors | `openGallery(page)`, `openPrompt(page, id)` and `pickedFile(page, key)` keep selectors in one place (a light page-object style) |
| Web-first waits | `await expect(locator).toHaveText(...)` and `expect(...).toPass()` retries instead of fixed sleeps |
| Evidence | Each scenario saves a screenshot of the result (`reply.screenshot({ path })`) into `e2e/screenshots/` |
| Slices | The engine-dependent spec (`real-engine.spec.js`) runs separately from the fast specs |

What a program suite adds on top: tags by test case and story (`@TC-###`, `@US-###`), a data factory per entity, page objects per page, and JUnit and HTML reports published by the pipeline.
