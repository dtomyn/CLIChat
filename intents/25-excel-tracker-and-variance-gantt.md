# 25 — Build an Excel tracker with a variance Gantt

## Intent
As a project manager, I want to turn my Microsoft Project plan into a colour-coded Excel tracker with a weekly Gantt
that shows slips against the baseline and how milestones moved week over week, so that people without Project can see
the schedule and its variance.

## Where
- Prompt **Plan → Excel tracker** 📗 (category *Project plans*, agent **Schedule Analyst**, access `edit`, badge
  **Saves a file**).
- Any chat with the `ms-project` skill in **Create & edit files**. Tool `project_plan_to_spreadsheet` (progress step
  "Building Excel tracker <file>").

## Inputs & controls
| Control | Effect |
|---|---|
| **Project plan** (`.mpp,.xml`) | The plan to export. |
| **Earlier version of the plan, to show week-over-week change** (optional) | Passed as `history`; otherwise Lumen uses its saved versions. |
| `output` (tool argument) | The `.xlsx` path; the prompt asks for "<project> - Tracker.xlsx". |

## Behaviour (as implemented)
- Builds five sheets, in this order: **Summary**, **Tasks**, **Gantt**, **Milestone variance**, **Resources**.
- **Tasks**: ID, WBS, indented task, start, finish, duration, % complete, baseline finish, slip (working days),
  resources, status. Status is Complete / Late / Critical / In progress / Not started, colour-filled; summaries bold.
- **Gantt**: one column per week (Mondays) spanning both the schedule and the baseline, frozen at 4 columns. Bars:
  purple scheduled, amber critical path, red late, green complete, grey summary. A thick dark line under a week marks
  the baseline; weeks scheduled past the baseline finish are hatched red; baseline weeks no longer used are light grey.
  Milestones are ◆ (red when off their baseline week) and ◇ (baseline). The status-date week has a red header and left
  border. A **Variance (days)** column is green when early, amber up to 10, red over 10. A legend is written below.
- **Milestone variance**: ID, milestone, baseline, one **Forecast <date>** column per earlier version plus the current
  one, variance, change vs. last, **Trend** (Worse / Better / No change) and status (Complete, No baseline, Slipped,
  Early, On baseline). Milestones are matched across versions by UID, then by name. With no earlier version, a note
  says the trend appears next time.
- **Resources**: name, group, max units, rate/hr, assigned tasks, and "Yes — next 6 weeks" when over-allocated.
- **Summary**: project, status date, suggested RAG, % complete vs. plan, forecast and baseline finish, slip, late
  tasks, critical tasks remaining, milestones slipped, biggest milestone slip and what it was compared with.
- **History**: building a tracker records this plan version in `.lumen/plan-history/` and, when no `history` is given,
  compares with up to 4 earlier saved versions (status date before this one); the result says `historySource`
  (`given`, `saved versions` or `none`). See [24](24-update-plan-and-track-changes.md).
- The workbook holds values only (no formulas), so no Excel recalculation pass is run. The output path must be inside
  the project folder; an existing file at that path is replaced.
- Write tool: needs **Create & edit files**.

## Outputs
`<project> - Tracker.xlsx` in the project folder (file card in the reply), plus a chat summary of each sheet that
leads with the forecast slip in working days, the worst-slipping milestones and, when compared, what moved since the
earlier version. Result JSON: `saved`, `sheets`, `tasks`, `milestonesSlipped`, `comparedWith`, `historySource`.

## Acceptance criteria
- `test/variance-gantt.test.js` › ganttWeek separates current bar, baseline bar and slip weeks.
- `test/variance-gantt.test.js` › finishVariance counts working days and is null without a baseline.
- `test/variance-gantt.test.js` › ganttWeeks covers baseline dates that fall outside the current schedule.
- `test/variance-gantt.test.js` › milestoneTrend compares forecasts across plan versions.
- `test/variance-gantt.test.js` › projectToWorkbook writes the variance Gantt and milestone sheet.
- `test/variance-gantt.test.js` › plan versions are recorded and used automatically for the trend.

## Limits
- The Gantt is a week-granular grid of filled cells, not an Excel chart.
- Same Monday-to-Friday calendar as the health check ([22](22-plan-health-check.md)); the tracker is a snapshot and
  does not update when the plan changes.

## Source
`tools/excel.js` (`projectToWorkbook`, `ganttWeeks`, `ganttWeek`, `finishVariance`, `varianceColor`, `loadSnapshots`,
`milestoneTrend`, `styleSheet`), `tools/project.js` (`recordVersion`, `earlierVersions`, `analyze`),
`tools/office-mcp.js` (`project_plan_to_spreadsheet`), `skills/ms-project/SKILL.md`, `defaults/recipes.json` (prompt
**Plan → Excel tracker**, `plan-to-excel`).
