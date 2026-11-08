# Plan 15: Release and cutover

**Use cases:** 27 Release-readiness checklists · 28 Operational runbook · 29 Cutover coordination · 30 Hypercare analysis and closure
**Size:** medium (two sessions)
**Files:** new `tools/release.js`, new `skills/release-cutover/SKILL.md`, `tools/office-mcp.js`, `lib/skills.js`, `defaults/assistants.json`, `defaults/recipes.json`, `scripts/make-demo.js`, `test/release.test.js`
**Needs first:** Plan 09 (`analyzeDefects`) for hypercare. Plan 18 for runbook Word output. Scheduled prompts (Plan 07, shipped) for cutover status checks.

## Design

### 1. `tools/release.js` (pure, unit-tested)
- `readinessCheck(checklist, evidence)` reads a readiness checklist workbook (gate item, environment STE/UAT/STG/PRD, owner, due, evidence reference, status) and checks each evidence reference exists in the notebook. It reuses `status.js` RAG rules: red if any must-have item is open within N days of go-live. It returns facts with citations.
- `cutoverStatus(runsheet, asOf)` reads a cutover run-sheet (step, owner, planned start/end, actual, status, dependency). It returns steps that are late, critical-path steps (reusing plan maths on the run-sheet's dependencies), next steps due, and a projected finish. It writes a status snapshot into `Cutover/<timestamp>.md`.
- `hypercareTrends(defects, exitCriteria)` gives weekly open/closed/ageing trends by severity, using `analyzeDefects` from Plan 09, plus a pass/fail per exit criterion (e.g. "no Sev1 open for 10 days").
- MCP tools: `check_readiness`, `cutover_status` and `hypercare_trends` (read-only).

### 2. Agents and prompts
- **Release Readiness** 🚦 generates cutover and rollback checklists from the deployment approach, dependencies and plan, and checks readiness.
- **Runbook Writer** 📗 drafts the operational runbook from TDD/SDD, deployment procedures and the support model (Word via Plan 18).
- **Cutover Coordinator** ⏱️ writes the live status summary. Pair it with a scheduled prompt every 30–60 minutes during the cutover window (scheduled prompts support daily/weekly/monthly today, so add an "every N minutes between start and end" option in `lib/scheduler.js`).
- **Hypercare Analyst** 📉 analyses trends and drafts the closure report.
- Prompts (category *Release*): Generate cutover checklist, Readiness check, Draft the runbook, Cutover status update, Hypercare closure report.

### 3. Sample data
`make-demo.js` adds a readiness checklist (one missing evidence file), a cutover run-sheet (one late step) and a hypercare defect export.

## Acceptance checks
- The readiness check reports red with the missing evidence cited.
- Cutover status identifies the late step and the projected finish.
- The interval schedule runs only inside its window and is covered by `test/scheduler.test.js`.

## Out of scope
Teams alerts and Power BI dashboards (export the snapshot files instead).
