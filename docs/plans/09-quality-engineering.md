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
