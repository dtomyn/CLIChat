# Plan 09: Quality engineering

**Use cases:** 19 Test design and coverage gaps · 20 Defect triage · 34 Test strategy and testability · 11 (test-case layer of traceability)
**Size:** medium (two sessions)
**Files:** new `tools/tests.js`, new `skills/test-design/SKILL.md`, `tools/traceability.js`, `tools/office-mcp.js`, `lib/skills.js`, `lib/tool-labels.js`, `defaults/assistants.json`, `defaults/recipes.json`, `defaults/pipelines.json`, `scripts/make-aidlc-sample.js`, `test/tests.test.js`
**Needs first:** nothing. Plan 08 later lets test cases go straight into ADO Test Plans.

## Why

The lifecycle stops at stories. QE needs SIT/UAT cases derived from acceptance criteria, a coverage view against requirements, a test strategy, and help triaging defect exports. All of it follows patterns Lumen already has: generate in Markdown/Excel, and calculate coverage in code.

## Design

### 1. Test-case layer in traceability
- Extend `LAYERS` in `tools/traceability.js` with `test` (`TC-###`, sheets/columns matching `/test/i`). A test traces to a story or requirement.
- New findings: requirements with no test, stories with no test, and tests tracing to withdrawn items.

### 2. `tools/tests.js` (pure, unit-tested)
- `writeTestCases(file, cases)` creates an Excel test-case workbook in an ADO Test Plans import-friendly layout (ID, Title, Step, Expected, Traces To, Priority, Type SIT/UAT), one row per step.
- `analyzeDefects(file)` reads an ADO defect export (.xlsx/.csv, header matching like `tools/backlog.js`). It finds probable duplicates (normalized title-token overlap ≥ 0.6 within the same area path), counts by severity/state/area, ages items, and flags severity–priority mismatches. It returns proposals only.
- MCP tools: `write_test_cases` (edit mode only), `analyze_defects` (read-only).

### 3. Agents and prompts
- **Test Designer** 🧪 (skills: test-design, traceability, program-knowledge, excel). Generates cases from Given/When/Then criteria, including negative and boundary cases, each tracing to `BR`/story IDs.
- **Test Planner** 🗺️. Writes the Test Strategy / Master Test Plan from scope, requirements, plan and RAID: levels, environments (STE/UAT/STG/PRD), entry/exit criteria, test-data needs, and a risk-based priority (requirement risk × change impact).
- **Defect Triage** 🐞. Turns `analyze_defects` output into a triage summary and proposes severity/owner changes in a `(proposed)` workbook with an Approve column (the RAID pattern).
- Prompts (category *Quality engineering*): Generate test cases from stories, Coverage gaps, Draft the test strategy, Triage defects.
- Optional lifecycle stage: `tests` after `stories` in `defaults/pipelines.json`, producing `05-test-cases.md`.

### 4. Sample data
Add a `Tests` sheet to the AIDLC traceability workbook (one uncovered requirement, one test on a withdrawn requirement), and generate `Defects export.xlsx` (two duplicate pairs, one severity/priority mismatch).

## Steps
1. Add the traceability test layer, with tests.
2. Build `tools/tests.js` and its tests, then register the MCP tools and labels.
3. Write the skill, agents, prompts and pipeline stage.
4. Extend the sample generator, then run each prompt against the sample in the app.

## Acceptance checks
- The traceability check on the sample reports the uncovered requirement and the withdrawn-linked test, with `Sheet!Cell` references.
- Triage reports both duplicate pairs and the mismatch, and the original export is never modified.
- The test-case workbook opens in Excel with one row per step.
- `node --test test/*.test.js` passes.

## Out of scope
Live ADO Test Plans writes (Plan 08), and running automated tests (Plan 17).

## Status: implemented (7 Nov 2026)

Shipped: `tools/tests.js` (`writeTestCases`, `analyzeDefects`, `proposeDefectChanges`), the `TC` layer in `tools/traceability.js`, MCP tools `write_test_cases`, `analyze_defects` and `propose_defect_changes`, the `test-design` skill, the Test Designer, Test Planner and Defect Triage agents, four *Quality engineering* prompts, the optional `tests` lifecycle stage, the sample Tests sheet and `Defects export.xlsx`, and `test/tests.test.js`.

Deviations from the design:
- **Extra tool `propose_defect_changes`.** The Defect Triage agent needed a way to write the `(proposed)` workbook with an Approve column, so it got a small tool in the RAID pattern. There is no "apply" step: the export is a snapshot of Azure DevOps, so people make the approved changes there (or through Plan 08's proposals).
- **Test coverage rules.** A requirement counts as tested when any live test sits anywhere below it (on the requirement, its refined requirements or its stories). A story counts only when a test traces to it directly. Items under a withdrawn requirement are left out of the test coverage, because they are already reported as withdrawn but still linked. A refined requirement isn't listed separately when its business requirement is already listed. Tests never count as design coverage, and a test's status never marks it as a changed requirement.
- **Duplicate matching** uses Jaccard similarity of normalised, lightly stemmed title words (≥ 0.6) within the same area path, with at least one of the pair still open. The older defect is suggested as the one to keep. A mismatch means severity and priority are two or more steps apart.
- **The optional stage** is marked `"optional": true` in `defaults/pipelines.json` and shown as "(optional)" on the stepper. The server still treats it like any other stage, so a run simply stops after Stories if nobody starts it. Existing installs keep their saved pipeline definition and won't see the stage until it is reset.
- **`lib/skills.js` needed no change**, because skills are discovered from `skills/<id>/SKILL.md`.
- **Not verified in the running app.** The prompts haven't been run against the sample with the AI engine. They are covered by unit tests and MCP round-trip tests only.
