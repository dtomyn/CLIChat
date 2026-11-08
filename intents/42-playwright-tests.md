# 42 — Turn test cases into Playwright tests

## Intent
As an automation engineer or tester, I want the designed test cases turned into tagged Playwright regression specs
with steps, evidence and a CI-ready config, so that automation starts from the agreed cases and every test traces to
its case and story.

## Where
- Agent **Test Automation Copilot** 🤖.
- Prompt **Turn test cases into Playwright tests** (category **Engineering**).

## Inputs & controls
| Control | Effect |
|---|---|
| **Test-case workbook** (.xlsx) | A workbook in the `write_test_cases` layout (see [40](40-test-cases-and-strategy.md)). |
| `outDir` (tool only) | Output folder; default `<workbook folder>/Playwright`. |

The prompt runs with **Create & edit files** (**Saves a file**).

## Behaviour (as implemented)
- **Reading** (`readTestCases`): the **Test cases** sheet first, then any sheet whose header (within the first 10 rows)
  has Title and Step Action columns. A row with an ID or title starts a case; following rows add steps. A .csv is
  refused ("Give the test-case workbook as .xlsx…"); a workbook with no such sheet is refused.
- The agent first lists cases with no steps, no expected result or no trace: they need a tester before automation.
- **Grouping**: one spec per story, `tests/<story>.spec.js`, where the story is the first traced ID like `US-`, `PBI-`
  or `AB#`, else the first trace, else the type.
- **Each case** is a `test.fixme(...)` titled `<ID> <title>`, tagged with its ID, every traced ID, SIT/UAT and `P<n>`
  (e.g. `@TC-102 @US-104 @SIT`); each step is a `test.step` with the expected result as a comment; a full-page
  screenshot is attached as `evidence`. Preconditions become a comment.
- **Shared files**: `fixtures/test-data.js` (unique-value data factory), `pages/BasePage.js`, `playwright.config.js`
  (`trace: 'retain-on-failure'`, `screenshot: 'only-on-failure'`, list/HTML/JUnit reporters, `BASE_URL`) and a
  `README.md` mapping cases to specs and tags.
- **Never overwrites**: an output folder that already has files gets a numbered sibling (`Playwright (2)`), and each
  file uses a free name.
- Tests stay `fixme` until someone writes the actions and assertions, so a generated suite never passes without testing.
  The agent writes assertions only from step text and expected results, never weakens an expected result, and reports
  a mismatch as a probable defect.
- **Lumen does not run the tests**; the specs are for an automation engineer and the pipeline.
- Warnings for cases with no steps or no trace.

## Outputs
- The folder, the saved files, each case with its spec and tags, a summary ("Wrote N Playwright tests in M spec
  file(s)…"), and the `--grep @US-###` commands.
- Progress step: "Writing Playwright tests from <workbook>".

## Acceptance criteria
- A test-case workbook becomes tagged specs that load, and a second run does not overwrite (`test/drift.test.js` ›
  test-case workbook becomes tagged Playwright specs that load).
- `generate_playwright_tests` needs edit access (› engineering tools are exposed; generating tests needs edit access);
  the agent, prompt and skill are wired (› engineering agents, prompts, skills and labels are wired up).
- With the real engine the sample gives `us-104.spec.js` and `us-105.spec.js` under `Quality/Playwright…` with case
  and story tags and nothing modified (`e2e/real-engine-plans-2.spec.js` › Engineering: Playwright tests are written
  per story with case and story tags).

## Limits
- Only Playwright (JavaScript); no other frameworks.
- Generated tests contain TODOs, not working selectors or assertions.
- Nothing is executed; there is no test-run result in Lumen.

## Source
`tools/tests.js` (`readTestCases`, `playwrightFiles`, `generatePlaywrightTests`), `tools/office-mcp.js`
(`generate_playwright_tests`), `lib/tool-labels.js`, `defaults/assistants.json` (agent **Test Automation Copilot**),
`defaults/recipes.json` (prompt **Turn test cases into Playwright tests**), `skills/test-automation/SKILL.md`
(+ `references/playwright-conventions.md`, `references/worked-example.md`),
`samples/aidlc/Quality/Test cases - Photo upload (SIT).xlsx`.
