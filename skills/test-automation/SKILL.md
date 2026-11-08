---
name: test-automation
title: Test automation (Playwright)
emoji: 🤖
description: Playwright regression tests to the program conventions: page objects, test-data factories, tags by test case and story ID, evidence (screenshots and traces) attached to CI, and turning a test-case workbook into tagged Playwright specs.
extensions:
readTools: list_office_files, read_document, read_spreadsheet
writeTools: generate_playwright_tests
---

# Test automation with Playwright

Automated tests are the regression safety net for the test cases the testers designed. Every automated test traces to a test case (`TC-###`) and the story it verifies (`US-###` / `AB#<id>`), and leaves evidence a reviewer can open.

Reference files (in this skill's folder):
- `references/playwright-conventions.md`: folder layout, page objects, data factories, tags, evidence and CI
- `references/worked-example.md`: how Lumen's own `e2e/` suite applies these conventions

## Tools
| Tool | Use it to |
|---|---|
| `generate_playwright_tests` | Turn a test-case workbook (the `write_test_cases` layout) into specs: one spec per story, one test per case tagged `@TC-### @US-### @SIT`, one `test.step` per step with the expected result, plus a data factory, a base page object and a `playwright.config.js` with traces and reports. Tests start as `test.fixme` |
| `read_spreadsheet` | Read the test cases or the traceability workbook's Tests sheet |

## Turning test cases into specs
1. Read the test-case workbook. Report cases with no steps, no expected result or no trace before generating; they need a tester's input.
2. Call `generate_playwright_tests` with the workbook. List the specs written and the tags on each test.
3. For each test, write the actions and assertions **only from the step text and expected result**. Put selectors in page objects (`pages/`), prefer `getByRole`, `getByLabel` and `getByTestId`, and build data with the factories (`fixtures/test-data.js`). Remove `.fixme` only when the test really asserts the expected results.
4. Never weaken an expected result to make a test pass. If the application behaves differently, report it as a probable defect with the test case ID.

## Conventions (summary)
- One spec per story or feature; one `test` per test case; one `test.step` per step.
- Tags: `@TC-###`, every traced ID (`@US-104`, `@BR-004`), `@SIT` or `@UAT`, priority `@P1`. Run a slice with `--grep`.
- No fixed waits (`waitForTimeout`) except to settle an animation before a screenshot; use web-first assertions (`await expect(locator).toBeVisible()`).
- Tests are independent: each creates its own data and doesn't rely on order.
- Evidence: `trace: 'retain-on-failure'`, `screenshot: 'only-on-failure'`, an attached screenshot per test, and HTML and JUnit reports published by the CI run.
- No credentials in specs or config: read them from pipeline secrets or environment variables.
