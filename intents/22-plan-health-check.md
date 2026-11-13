# 22 — Health-check a Microsoft Project plan

## Intent
As a project manager, I want a quick, rule-based health check of my Microsoft Project plan (RAG, what is late, the
critical path, slips against baseline and who is overloaded), so that I know what to act on this week without
reading every task.

## Where
- Prompt **Project health check** 🩺 (category *Project plans*, agent **Schedule Analyst**, access `read`).
- Agent **Schedule Analyst** 📅 (starter "Give me a health check of my project plan"), or any agent with the
  **Microsoft Project plans** skill (`ms-project`: **Lumen**, **Project Partner**, **Budget Controller**, **Test
  Planner**, **Release Readiness**). Attaching a `.mpp` or `.xml` turns the skill on for the chat.
- Tool `analyze_project_plan` (progress step "Analyzing schedule in <file>"); `read_project_plan` for the full task list.

## Inputs & controls
| Control | Effect |
|---|---|
| **Project plan** (file field, `.mpp,.xml`) | The plan to check; the best-matching file in the project folder is pre-selected. |
| **Anything to focus on?** (optional text) | Added to the prompt as "Focus: …". |
| `statusDate` (tool argument) | As-of date `YYYY-MM-DD`; defaults to the plan's `<StatusDate>`, else today. |

## Behaviour (as implemented)
- Reads Project XML (MSPDI) with `fast-xml-parser`. A `.mpp` is converted to XML through Microsoft Project (COM, via
  PowerShell) when `HKCR\MSProject.Application` exists; otherwise the friendly error tells the user to use **File ›
  Save As › XML Format (*.xml)**. Any other extension is refused.
- Working days are Monday to Friday; the plan's calendars and holidays are not used.
- Leaf tasks only (summaries excluded). Metrics in `analyze`:
  - **% complete**: duration-weighted; **expected by now**: each task's share of working days elapsed to the status
    date; `varianceVsPlan` = the difference.
  - **Late**: finish before the status date and under 100%, with `daysOverdue`.
  - **Behind schedule**: started, not late, and at least 25 points below the expected %.
  - **Should have started**: start before the status date, 0%, not a milestone.
  - **Biggest slips**: top 10 by working days between baseline finish (baseline 0) and finish.
  - **Critical path**: a backward pass over the file's dates and links (FS/SS/FF/SF with lag); incomplete tasks with
    zero float, each with `floatDays`.
  - **Over-allocated resources** in the 6 weeks after the status date: Work resources whose summed assignment units on
    a working day exceed their max units, with peak load, first/last day and clashing tasks.
  - **Cost**: forecast vs. baseline only when the plan has baseline cost.
- **Suggested RAG**: Red if the forecast finish slips more than 10 working days or more than 3 tasks are late; Amber if
  any slip, any late task or any over-allocation; otherwise Green.
- The skill tells the agent to lead with RAG and a one-line reason, cite tasks as "#18 Build ERP integration", give
  slips in working days, explain knock-on effects on milestones, and separate plan facts from recommendations; the
  Schedule Analyst adds a recovery option (fast-track, crash, re-sequence, reassign, de-scope) for each problem.
- Read-only: the tool never writes. The prompt is marked **Lumen only** because it reads Microsoft Project plans.

## Outputs
- A chat answer: RAG with reason, 3-bullet summary, late/behind tasks table, critical path and float before go-live,
  biggest slips, over-allocated people with suggested fixes and the top 3 actions (the prompt's template).
- Tool result JSON: `project`, `statusDate`, `suggestedRag`, `schedule`, `progress`, `cost`, `lateTasks`,
  `behindSchedule`, `shouldHaveStarted`, `biggestSlips`, `criticalPath`, `milestones`,
  `overallocatedResources_next6Weeks`.

## Acceptance criteria
- A plan with a forecast slip over 10 working days, or more than 3 late tasks, is rated Red.
- Only incomplete, zero-float leaf tasks appear on the critical path.
- A person loaded over their max units on a working day in the next 6 weeks is listed with peak load and tasks.
- A `.mpp` without Microsoft Project installed gives the Save-as-XML instruction instead of a crash.
- The same RAG rule drives the status pack (see [27](27-weekly-executive-status.md)) and the tracker's Summary sheet
  (see [25](25-excel-tracker-and-variance-gantt.md)): `test/status-report.test.js` › the status model is calculated
  from the files, with reasons and sources.

## Limits
- No dedicated unit test for `analyze` itself; it is exercised through the status, tracker and scenario tests.
- `.mpp` conversion has not been tested (no Microsoft Project on the build machine, per `README.md`).
- Dates and links are read as stored; Lumen does not reschedule (Microsoft Project recalculates when it opens the file).
- Working-day maths ignores holidays and custom calendars.

## Source
`tools/project.js` (`load`, `analyze`, `criticalPath`, `overallocations`, `readPlan`, `mppToXml`, `hasMsProject`),
`tools/office-mcp.js` (`analyze_project_plan`, `read_project_plan`), `skills/ms-project/SKILL.md`,
`agents/<id>.json` (agent **Schedule Analyst**), `defaults/recipes.json` (prompt **Project health check**,
`plan-health-check`), `lib/tool-labels.js`.
