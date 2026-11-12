# 52 — Check release readiness and coordinate cutover

## Intent
As a release manager or delivery lead, I want to check the go-live readiness checklist against the evidence in the
notebook, draft the cutover and rollback run-sheet, and get a short status update from the run-sheet during the cutover
weekend, so that the go/no-go call and the bridge updates rest on evidence rather than opinion.

## Where
- Agents **Release Readiness** 🚦 (checklists and readiness) and **Cutover Coordinator** ⏱️ (live status).
- Prompts in the **Release** category: **Readiness check**, **Generate cutover checklist**, **Cutover status update**.
- **Repeat** on a prompt › **Every few minutes, between two times** to run the status update through the cutover window
  (see [18](18-schedule-prompts.md)).

## Inputs & controls
| Control | Effect |
|---|---|
| **Readiness check** › **Readiness checklist** (.xlsx/.xlsm/.csv), **As of** | Calls `check_readiness`; as-of defaults to today. |
| **Generate cutover checklist** › **Deployment approach or release plan**, **Project plan** (optional), **Cutover window** | Drafts cutover steps (C01…) and rollback steps (R01…) and saves them as a workbook. |
| **Cutover status update** › **Cutover run-sheet**, **As of** (`YYYY-MM-DD HH:MM`) | Calls `cutover_status` with `snapshot: true`; as-of defaults to now. |
| `check_readiness` options | `goLive` (else a "Go-live date" cell), `asOf`, `redDays` (default 10). |
| `cutover_status` options | `asOf`, `aheadMinutes` (default 60), `toleranceMinutes` (default 30), `snapshot`. |
| Repeat › **Every** 15 / 30 / 45 minutes / Hour, **From**, **Until** | An interval schedule that runs only inside the window. |

## Behaviour (as implemented)
- **Checklist reading** (`readinessCheck`): the first sheet (not About/Summary/Notes/Instructions/Read me) whose header row
  has a gate item column ("Gate item", "Check", "Activity"…) and a **Status** column; otherwise it is refused with a plain
  message. Optional columns: ID, Gate/Category, Environment, Owner, Due, Evidence, Must have.
- Environments are normalised to **STE**, **UAT**, **STG**, **PRD** (e.g. "Production" → PRD); other values are kept as typed.
- Done means a status such as Done, Complete, Closed, Yes, Passed, Approved, Signed off, Ready, Met, N/A or ✓.
- Without a must-have column every item counts as must-have.
- **Evidence**: each reference (split on `;` or new lines) is looked up by path from the notebook and the checklist's folder,
  then by file name anywhere in the notebook (4 levels deep). Links (`http…`) are not checked. Paths outside the notebook
  do not count.
- **Rating**, returned with its rule text:
  - **Red** if a must-have item is marked complete but its evidence is not in the notebook, a must-have item is overdue,
    or any must-have item is open `redDays` (10) days or fewer before go-live.
  - **Amber** if any item is open, has missing evidence (or is complete with no evidence reference) or is open with no
    owner.
  - Otherwise **Green**.
  - Without a go-live date the days-to-go-live rule is skipped, with a warning.
- Findings come grouped: missing evidence, open must-have, overdue, open without owner, other open; plus counts per
  environment. Every item cites its `Sheet!Cell`.
- **Run-sheet reading** (`cutoverStatus`): needs Step, Planned start and Planned end (or Duration (min)). Optional: ID,
  Owner, Actual start/end, Forecast end, Status, Depends on, Notes. Times are wall-clock times read as typed (an Excel
  date-time or `YYYY-MM-DD HH:MM`), with no time-zone conversion.
- States: Done (or an actual end with no status), Skipped, Blocked, In progress (or an actual start), Not started.
- **Projection** (minutes, over the *Depends on* links):
  - Done steps end at their actual end.
  - Running steps end at their forecast end, else after their planned duration, never before now.
  - Waiting steps start at the latest of their planned start, now and their predecessors' projected ends.
  - A backward pass gives float; remaining steps with no float (≤ 1 min) are the critical path.
  - Unknown dependencies and loops are reported as warnings and ignored.
- Lists:
  - **late**: past the planned end and not done.
  - **shouldHaveStarted**: past the planned start, not started.
  - **blocked**, **finishedLate**.
  - **nextSteps**: up to 10 not-started steps that are ready or planned to start within `aheadMinutes`, each with whom it
    is waiting for.
- **Rating**: Red if the projected finish is more than `toleranceMinutes` (30) after the planned finish or a
  critical-path step is blocked; Amber if the finish is later than planned, any step is late or any step is blocked;
  otherwise Green.
- **Snapshot**: with `snapshot: true` and **Create & edit files**, the summary is saved as `Cutover/<YYYY-MM-DD HHMM>.md`
  (late steps, blocked, critical path, next steps, data warnings). An existing snapshot is never overwritten
  (`… (2).md`). In a read-only chat the status still comes back, with a warning that the snapshot was not saved.
- Both tools are read-only on the source: the checklist and the run-sheet are never changed. The agents never mark an
  item done and never guess at progress the run-sheet does not record.
- **Cutover checklist prompt**: steps include the go/no-go call, freeze, data migration, integrations, smoke tests and
  go-live confirmation. Each step has an owner, planned start/end, depends on and a verification.
  - Rollback steps carry their trigger and the latest decision time.
  - It is saved with `create_spreadsheet` as `Cutover Run-sheet (draft).xlsx` (sheets Run-sheet and Rollback) in the
    run-sheet columns `cutover_status` reads, Status Not started.
  - Owners and times come only from the documents; gaps are left blank and listed.
- **Interval schedule** (`lib/scheduler.js`): `when: { kind: 'interval', minutes, start, end }`.
  - The window is in local `YYYY-MM-DDTHH:MM`, ends after it starts, is 14 days at most, with a run every 5–720 minutes.
  - Runs happen only inside the window. A run missed while Lumen was closed is made up once inside the window, never after
    it closes. The schedule list then shows **Window finished**.
  - **Cutover status update** saves files, so it can be scheduled only with **Allow this schedule to save files**.

## Outputs
- A readiness answer that leads with the rating, its reasons and the rule, then missing evidence, open must-have, overdue
  and unowned items, a table by environment and what must happen before go-live.
- `Cutover Run-sheet (draft).xlsx` from the checklist prompt.
- A paste-ready cutover update: one headline line (rating, steps done of total, projected vs. planned finish), late and
  blocked steps with owner, lateness and cell, the critical path, next steps; plus `Cutover/<date time>.md`.

## Acceptance criteria
- The demo checklist as of 2026-12-31 is Red and cites `PRD-04 (Evidence/PRD access review.pdf, Readiness!C11)`; go-live
  is 2027-01-05, five days away; the checklist file is unchanged (`test/release.test.js` › readiness check is Red and
  cites the missing evidence file).
- Open items far from go-live are Amber, the same items 4 days out are Red, a fully evidenced checklist is Green, and a
  workbook without a checklist sheet is refused (› readiness rating follows the rule…).
- At 2027-01-02 23:30 step C04 is 60 minutes late (`Run-sheet!B5`), the projected finish is 06:45 against 05:00, the
  rating is Red, finished side branches are not critical, and a second snapshot gets `(2)` (› cutover status finds the
  late step, the critical path and the projected finish).
- Missing columns, unknown dependencies and loops give warnings, and a blocked critical step is Red (› cutover status
  tolerates missing columns, unknown dependencies and loops).
- In a read-only chat `cutover_status` with `snapshot: true` saves nothing and says so; with edit access it saves
  `Cutover/2027-01-02 2330.md` (› release tools are exposed and read-only; the cutover snapshot needs edit access).
- The agents, the five Release prompts and the skill are wired up, and every prompt field is used in its template
  (› release agents, prompts and skill are wired up).
- Interval schedules run every N minutes only inside their window, return no run after it, and reject a bad window,
  under 5 minutes, a missing start or more than 14 days (`test/scheduler.test.js` › interval schedules run every N
  minutes, only inside their window).
- With the real engine: `e2e/real-engine-plans.spec.js` › Release: readiness check is Red because of the missing PRD-04
  evidence; `e2e/real-engine-plans-2.spec.js` › Release: the cutover checklist is drafted in the run-sheet layout the
  status check reads, › Release: cutover status at 23:30 is Red because C04 is late, with a saved snapshot.

## Decisions
- Readiness has its own rule (not the plan-slippage RAG rules), returned with the rating.
- The cutover pass runs in minutes over the run-sheet's own links, because the plan's critical path works in whole days.

## Limits
- No Teams alerts or dashboards; the snapshot files are the record.
- Links in the evidence column are not checked.
- Interval schedules run only while Lumen is running.

## Source
- `tools/release.js` (`readinessCheck`, `cutoverStatus`, `renderCutover`, `readSheet`, `wall`).
- `tools/office-mcp.js` (tools `check_readiness`, `cutover_status`).
- `skills/release-cutover/SKILL.md`.
- `agents/<id>.json` (agents **Release Readiness**, **Cutover Coordinator**).
- `defaults/recipes.json` (prompts **Readiness check**, **Generate cutover checklist**, **Cutover status update**).
- `lib/scheduler.js` (`intervalWindow`, `inWindow`, `nextDue`); `public/js/prompts.js` (`openScheduleForm`, schedule list).
- `lib/tool-labels.js`.
- `demo/Release Readiness Checklist - Go-live.xlsx`, `demo/Evidence/`, `demo/Cutover Run-sheet - Go-live weekend.xlsx`.
