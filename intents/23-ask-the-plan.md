# 23 — Ask the plan questions in plain English

## Intent
As a project manager or delivery lead, I want to ask "what's late in Testing?", "what does Go-live depend on?" or
"what is Aisha doing next week?" and get the exact task rows, so that I can answer stakeholders without filtering
Microsoft Project by hand.

## Where
- Agent **Ask the Plan** 🔎 (skill `ms-project`, access `read`), starters "What is late or behind in Testing?", "What
  does Go-live depend on that has not started yet?", "What is Aisha working on in the next two weeks?", "What changed
  since the last version of the plan?". Any agent with the `ms-project` skill can use the same tools.
- Prompt **Weekly look-ahead** 🔭 (category *Project plans*, agent **Schedule Analyst**, access `read`).
- Tools `query_plan` ("Looking up tasks in <file>") and `plan_lookahead` ("Looking ahead in <file>").

## Inputs & controls
`query_plan` filters (all optional, combined with AND):
| Filter | Effect |
|---|---|
| `under` | A WBS number ("5") or summary/task name; keeps that branch. |
| `owner` | Part of a resource name. |
| `text` | Words in the task name or notes. |
| `status` | Any of `late`, `behind`, `not_started`, `in_progress`, `complete`, `should_have_started`. |
| `critical` / `milestones` | Incomplete zero-float tasks only / milestones only. |
| `slippedMoreThan` | Working days later than baseline finish. |
| `from`, `to`, `dateMode` | Date window; `active` (default), `starting` or `finishing`. |
| `relatedTo` `{task, direction, depth}` | `upstream` (what it depends on) or `downstream` (what depends on it), any depth. |
| `changedSince` | `last` or `YYYY-MM-DD`: only tasks changed since that saved version (see [24](24-update-plan-and-track-changes.md)). |
| `includeSummaries`, `statusDate`, `sort` (`id`/`start`/`finish`/`slip`/`float`), `limit` | Output shaping. |

**Weekly look-ahead** fields: **Project plan** (`.mpp,.xml`) and **Workstream (optional)**. `plan_lookahead` also takes
`from` (default the day after the status date), `days` (default 7, 1–60), `under`, `owner`, `statusDate`.

## Behaviour (as implemented)
- Task states match the health check ([22](22-plan-health-check.md)): late, behind (≥ 25 points under expected),
  in progress, not started, complete; `should_have_started` is a separate flag.
- Task references: digits = task ID; otherwise exact name, then the first name containing the text.
- An `under` or `relatedTo` anchor that is not found returns **no rows** plus a warning, never the whole plan; unknown
  status words produce a warning listing the valid ones.
- Rows are sorted by ID (by links away for dependency queries) unless `sort` is given; `limit` defaults to 50, max 500,
  with a "Showing the first N of M" note.
- Each row: ID, WBS, task, start, finish, baseline finish, slip, % complete, expected %, status, float, resources,
  predecessors, plus `linksAway` or `change` when relevant. The result lists the `filters` applied and any `warnings`.
- The **Ask the Plan** instructions: use `query_plan` for every question (`analyze_project_plan` only for an overall
  health check), answer in one or two sentences then a table, always state the filters used, never estimate dates or
  counts, state any assumption and offer one follow-up question.
- **Look-ahead** groups unfinished leaf tasks by workstream (the summary one level under the project root, or the top
  level when there are several): starting, finishing, milestones, late carry-overs (with working days late) and
  `waitingOn` (unfinished predecessors from another workstream or already overdue, with owner). The prompt asks the
  agent to open with milestones and the riskiest dependencies and keep it to one page.
- Both tools are read-only and allowed in **Read my files**.

## Outputs
A short answer, a table of exact rows (ID · Task · Finish · Baseline · Slip · Owner, plus Change or Links away), the
filters used and a follow-up suggestion; for the look-ahead, a one-page per-workstream readout.

## Acceptance criteria
- `test/query-plan.test.js` › filters by branch, status, critical path and slip.
- `test/query-plan.test.js` › owner, date window and dependency chains.
- `test/query-plan.test.js` › unknown anchors return no rows with a warning instead of everything.
- `test/query-plan.test.js` › changedSince compares with the last saved version.
- `test/query-plan.test.js` › query_plan is exposed by the office tool server and allowed when read-only.
- `test/plan-reports.test.js` › look-ahead groups next week by workstream and flags dependencies.
- `test/plan-reports.test.js` › look-ahead can be narrowed and handles unknown branches.
- `e2e/project-prompts.spec.js` › Weekly look-ahead: plan is preselected, steps and answer show.
- `e2e/real-engine.spec.js` › Weekly look-ahead.

## Limits
- Questions must map onto the filters above; anything else falls back to `read_project_plan` and the model's reading.
- `changedSince` needs a saved version in `.lumen/plan-history/`; otherwise it warns and filters nothing out.
- Same Monday-to-Friday calendar as the health check.

## Source
`tools/project.js` (`queryPlan`, `taskFacts`, `related`, `findTask`, `lookahead`, `workstreamOf`),
`tools/office-mcp.js` (`query_plan`, `plan_lookahead`), `skills/ms-project/SKILL.md`, `agents/<id>.json`
(agent **Ask the Plan**), `defaults/recipes.json` (prompt **Weekly look-ahead**, `plan-lookahead`).
