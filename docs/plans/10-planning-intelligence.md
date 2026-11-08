# Plan 10: Planning intelligence

**Use cases:** 3 Status report with ADO data · 5 Delivery scenarios · 39 Estimates and capacity
**Size:** medium (two sessions)
**Files:** `tools/status.js`, new `tools/scenario.js`, new `tools/capacity.js`, `tools/project.js`, `tools/office-mcp.js`, `skills/ms-project/SKILL.md`, `defaults/assistants.json`, `defaults/recipes.json`, `scripts/make-demo.js`, `test/scenario.test.js`, `test/capacity.test.js`, `test/status-report.test.js`

## Why

The status pack covers the plan and RAID but not delivery progress from ADO. PMs also ask "what if UAT slips two weeks?", "what if we add a tester?" and "does sprint demand fit our capacity?". `tools/project.js` already does the scheduling maths, so these are extensions.

## Design

### 1. Backlog section in the status pack (UC 3)
- `build_status_report` accepts an optional `backlog` file (an ADO export). It reuses `tools/backlog.js` to add a *Delivery progress* block to `status.json`: items by state per epic, points done, and items linked to late plan tasks. Every fact cites its row.
- One new RAG input: an amber reason when critical-path tasks have linked items that haven't started.

### 2. Scenarios (UC 5): `tools/scenario.js`
- `runScenario(plan, changes)` takes changes such as `{ task, durationDelta }`, `{ task, startNoEarlierThan }`, `{ resource, unitsDelta }` or `{ removeDependency }`. It reschedules forward through the dependency network on a copy (FS/SS/FF with lags, using `project.js` calendars) and returns milestone deltas, the new critical path and newly over-allocated people.
- MCP tool `model_scenario` is read-only. Saving an approved scenario reuses `update_project_plan`, which writes an `(updated)` copy.
- A **Delivery scenarios** prompt compares two or three named scenarios side by side and writes `Scenarios/<date>.xlsx`.

### 3. Capacity (UC 39): `tools/capacity.js`
- It reads a capacity workbook (person, role, weekly availability %, leave), optional ADO sprint demand (points/hours by iteration and assignee) and the plan's assignment work.
- It returns weekly demand vs. capacity per person and role, conflicts, and estimate outliers (story points vs. the team median per type).
- MCP tool `analyze_capacity`. "Who's overloaded?" gains an optional capacity-file question.

### 4. Sample data
`make-demo.js` adds `Team Capacity - Q4 2026.xlsx` (one person on leave during a critical task). The existing ADO backlog export provides demand.

## Steps
1. Add the backlog block and RAG reason in `status.js`, then update the tests.
2. Build `scenario.js` with tests (a known slip moves Go-live by the expected N days), plus the tool and prompt.
3. Build `capacity.js` with tests, plus the tool, prompt update and demo file.
4. Check in the app with the PM demo.

## Acceptance checks
- The status pack shows delivery progress with row citations, and still works without a backlog file.
- Adding 10 days to a critical task moves Go-live by exactly the calculated amount, and the original plan is untouched.
- The capacity check flags the person on leave.

## Out of scope
Monte-Carlo forecasting, and live ADO queries (Plan 08).
