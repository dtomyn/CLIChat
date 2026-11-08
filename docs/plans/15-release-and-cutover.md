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

## Status: implemented (7 Nov 2026)

Shipped: `tools/release.js` (`readinessCheck`, `cutoverStatus`, `hypercareTrends`), MCP tools `check_readiness`, `cutover_status` and `hypercare_trends` with labels, the `release-cutover` skill, the Release Readiness 🚦, Runbook Writer 📗, Cutover Coordinator ⏱️ and Hypercare Analyst 📉 agents, five *Release* prompts, an *Every few minutes, between two times* option for scheduled prompts (`lib/scheduler.js`, the Repeat form and the schedule list), three demo files plus `demo/Evidence/` from `scripts/make-demo.js`, and `test/release.test.js` and new interval cases in `test/scheduler.test.js`.

Deviations from the design:
- **Readiness rule.** The design reuses the `status.js` RAG rules. Those rules are about plan slippage, so readiness has its own rule in the same style, with the rule text returned alongside the rating. It is Red if a must-have item is marked complete but its evidence file is missing from the notebook, if a must-have item is overdue, or if any must-have item is still open 10 days or fewer before go-live (`redDays`). It is Amber if anything is open, missing evidence or unowned. Evidence is looked up by path from the notebook and the checklist's folder, then by file name. Links aren't checked. When there is no must-have column, every item counts as must-have. Go-live comes from `goLive` or a "Go-live date" cell.
- **Cutover maths.** `project.criticalPath` works in whole working days, which is too coarse for a run-sheet. `cutoverStatus` therefore runs the same forward and backward pass in minutes over the run-sheet's *Depends on* links. Done steps end at their actual end. Running steps end at their *Forecast end*, else after their planned duration, and never before now. Waiting steps start at the latest of their planned start, now, and their predecessors' projected ends. Unknown dependencies and loops are reported and ignored. Run-sheet times are read as typed (wall-clock), with no time-zone conversion. The rating is Red when the projected finish is more than 30 minutes late (`toleranceMinutes`) or a critical-path step is blocked.
- **Read-only tools and the snapshot.** All three tools are read-only. `cutover_status` writes `Cutover/<YYYY-MM-DD HHMM>.md` only with `snapshot: true` and edit access. In a read-only chat it returns the status with a warning instead. Snapshots are never overwritten.
- **Hypercare.** The Plan 09 defect reader now also reads a *Closed Date* / *Resolved Date* column. Without one, the Changed Date of closed defects is used, with a warning. Exit criteria are plain phrases: "No Sev1 open for 10 days", "No Sev2 open", "Fewer than 10 open defects", "No open defect older than 14 days", "Open defects falling for 2 weeks". *SevN* means N or worse. Criteria Lumen can't read come back as *Not checked*, and only complete weeks count for the falling-trend check. `analyze_defects`' triage headline is included.
- **Interval schedules.** `when: { kind: 'interval', minutes, start, end }` uses local `YYYY-MM-DDTHH:MM` times, every 5 to 720 minutes, with a window of 14 days at most. `nextDue` returns `null` once the window has no runs left, and the schedule list then shows *Window finished*. Runs missed while Lumen was closed are made up once inside the window, but never after it closes. *Run now* still works.
- **Runbook in Word.** The runbook is saved through `save_draft_document` (Markdown plus Word, with the draft label and sources) in the program's Word template, using Plan 18's template support (`toDocx` in `tools/md-export.js`), the same way Plan 13's Security Design Document does. The *Draft the runbook* prompt has an optional *Word template* field. When it is blank, the Runbook Writer uses a runbook template from the notebook's `Templates/` folder, else the built-in Word layout. A sample `Runbook Template.dotx` is in `samples/aidlc/Templates` (from `scripts/make-word-templates.js`), and `test/release.test.js` checks that the saved Word copy keeps its styles, header and cover page. (The first version wrongly assumed Plan 18 wasn't built and saved a generic Word copy. Corrected on 8 Nov 2026.) The hypercare closure report still uses the built-in Word layout, because the program has no closure report template.
- **Sample.** The files are in the existing `demo/` pack: the readiness checklist (PRD-04 is marked Done but `Evidence/PRD access review.pdf` is missing, so it is Red as of 2026-12-31), the cutover run-sheet as of 23:30 on 2 Jan 2027 (C04 is an hour late, and the projected finish is 06:45 against 05:00), and a 14-defect hypercare export as of 1 Feb 2027 where "No Sev2 open" fails.
- **`lib/skills.js` needed no change**, because skills are discovered from `skills/<id>/SKILL.md`.
- **Not verified in the running app.** The prompts haven't been run with the AI engine. Coverage comes from unit tests and MCP round-trip tests only.
