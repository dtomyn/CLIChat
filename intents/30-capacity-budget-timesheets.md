# 30 — Check capacity, budget variance and timesheets vs. plan

## Intent
As a project manager or project finance controller, I want to see who is overloaded (and whose leave clashes with
critical work), which budget categories are heading over, and where timesheet hours run ahead of plan progress, so
that I can fix resourcing and cost problems before they show up as slips.

## Where
- Prompt **Who's overloaded?** 👥 (category *Project plans*, agent **Schedule Analyst**, access `read`); Schedule
  Analyst starter "Check capacity against the plan: who's overloaded, and whose leave clashes with critical work?".
- Prompts **Budget variance review** 💰 and **Timesheets vs. plan** ⏱️ (category *Budgets & Excel*, agent **Budget
  Controller**, access `read`); Budget Controller starters "Which budget categories are heading over, and by how
  much?", "Which invoices need my attention this week?", "Compare October timesheet hours with the plan".
- Tools `analyze_capacity` ("Checking capacity in <file> against <plan>"), `analyze_project_plan`, `model_scenario`,
  `read_spreadsheet`, `read_project_plan`.

## Inputs & controls
| Control | Effect |
|---|---|
| **Project plan** + **Team capacity workbook (optional)** + **Azure DevOps backlog export (optional)** | Who's overloaded? fields. |
| `analyze_capacity` `from`, `weeks` | Window start (default the plan status date, from that Monday) and length (default 8, max 26; the prompt uses 6). |
| `hoursPerPoint`, `tagPrefix` | Convert story points to hours when Remaining Work is blank; backlog link prefix. |
| **Budget workbook** | Budget variance review field. |
| **Timesheet workbook** + **Project plan** | Timesheets vs. plan fields. |

## Behaviour (as implemented)
- **Capacity workbook**: a team sheet with a **Person** column (Role, Hours per week, Availability % recognised by
  header; missing hours = 40 and missing availability = 100%, each with a warning citing the cell), optional
  **Leave** sheet (Person, From, To, Reason) and **Sprints** sheet (Sprint, Start, End). No team sheet is a clear error.
- **Capacity** = hours per week × availability ÷ 5 per working day, 0 on leave days. **Plan demand** = assignment units
  × hours per day on each working day an unfinished task is active. Weekly rows per person and per role with load %.
- **Conflicts**: overloaded weeks (demand > capacity, with tasks), **leave clashes** over the whole remaining task
  (critical-path clashes sorted first, with float), and overloaded sprints (open items' Remaining Work, or story
  points × `hoursPerPoint`, against the person's capacity between the sprint dates).
- With a backlog: **estimate outliers** (story points ≥ 2× or ≤ ½ the median of the same work item type, at least 3
  estimates), open items without an estimate, and data quality: plan resources missing from the capacity file,
  unknown sprints, unassigned open items, assignees not in the capacity file. Every row cites a cell or plan task.
- The prompt leads with leave on critical-path work, then overloaded weeks (Person · Week · Capacity · Demand · Over by ·
  Tasks), sprints and outliers, offers two or three fixes per problem and checks the most important one with
  `model_scenario` ([29](29-model-delivery-scenarios.md)). Without a capacity file it falls back to the plan's 6-week
  over-allocation ([22](22-plan-health-check.md)). It says "Do not change any files".
- **Budget and timesheets** have no dedicated calculation tool: the agent reads the workbooks with `read_spreadsheet`
  (and the plan with the plan tools) and the `excel` skill asks it to quote figures with their cells
  ([26](26-work-with-excel.md)). The budget prompt asks for budget vs. forecast at completion, category variances worst
  first, contingency left, monthly burn and pending or unusual invoices, ending with three actions. The timesheet
  prompt asks, per task, for hours booked vs. % complete and the top three effort overruns.
- All three prompts are read-only.

## Outputs
Chat answers with tables and cited cells; `analyze_capacity` JSON (`summary`, `conflicts`, `people`, `roles`,
`sprints`, `estimateOutliers`, `openItemsWithoutEstimate`, `dataQuality`, `assumptions`, `warnings`).

## Acceptance criteria
- `test/capacity.test.js` › reads the team, leave and sprint sheets.
- `test/capacity.test.js` › the capacity check flags the person on leave during a critical task.
- `test/capacity.test.js` › weekly demand vs. capacity per person and role.
- `test/capacity.test.js` › sprint demand, estimate outliers and data quality from the backlog.
- `test/capacity.test.js` › missing columns are tolerated with warnings; no team sheet is a clear error.
- `test/capacity.test.js` › analyze_capacity is exposed through the office tools.
- `e2e/real-engine-plans-2.spec.js` › Planning: who is overloaded uses the capacity workbook and finds the leave clash
  on the critical path.

## Limits
- Plan demand and sprint demand are reported separately so the same work is not counted twice; they are not merged.
- No public holidays; the capacity file's leave is the only absence.
- Budget variance and timesheet comparisons depend on the model reading the workbook correctly; they are not
  calculated in code and have no automated tests.
- Demo files: **Team Capacity - Q4 2026.xlsx**, **CRM Migration - Budget Tracker.xlsx**, **Team Timesheets - October
  2026.xlsx** ([04](04-install-demo-and-samples.md)).

## Source
`tools/capacity.js` (`readCapacity`, `analyzeCapacity`, `sheetRows`, `asShare`), `tools/backlog.js` (`linkedItems`),
`tools/office-mcp.js` (`analyze_capacity`), `skills/ms-project/SKILL.md`, `skills/excel/SKILL.md`,
`agents/<id>.json` (agents **Schedule Analyst**, **Budget Controller**), `defaults/recipes.json` (prompts
**Who's overloaded?** `resource-load`, **Budget variance review** `budget-variance`, **Timesheets vs. plan**
`effort-vs-plan`).
