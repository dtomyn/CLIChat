# 29 — Model alternative delivery scenarios

## Intent
As a project manager or delivery lead, I want to ask "what if ERP integration slips two weeks?" or "what if we add a
half-time tester?" and see, side by side, how go-live, the finish, the critical path and people's load would change,
so that I can bring options with real numbers to the steering committee without touching the plan.

## Where
- Prompt **Delivery scenarios** 🔀 (category *Project plans*, agent **Schedule Analyst**, access `edit`, badge **Saves
  a file**).
- Agent **Schedule Analyst** (its instructions say to model each "what if" option with `model_scenario` instead of
  estimating; starter "What's on the critical path, and what happens if ERP integration slips another week?"). The
  **Who's overloaded?** prompt also checks its most important fix with `model_scenario`
  ([30](30-capacity-budget-timesheets.md)).
- Tool `model_scenario` (progress step "Modelling “<name>” on <file>").

## Inputs & controls
| Control | Effect |
|---|---|
| **Project plan** (`.mpp,.xml`) | The plan to model. |
| **Scenarios to compare** (textarea) | e.g. "A: UAT slips two weeks. B: … add a half-time tester." |
| `changes[].task` + `durationDelta` | Working days added (negative shortens); on a milestone it moves the milestone. |
| `changes[].task` + `startNoEarlierThan` | Hold a not-yet-started task until `YYYY-MM-DD`. |
| `changes[].resource` + `unitsDelta` (+ optional `task`) | Add or remove capacity (0.5 = another person at half time). |
| `changes[].removeDependency` `{from, to}` | Drop a link (also accepts "from->to"). |
| `name`, `statusDate` | Scenario name; as-of date (default the plan's). |

## Behaviour (as implemented)
- Builds a working-day network of scheduled leaf tasks; links to a summary task count as links to every task beneath
  it. Complete tasks keep their dates; started tasks keep their start (a duration change still moves their finish);
  only not-started tasks are pushed by their predecessors.
- Reschedules forward through FS/SS/FF/SF links with lags (Monday to Friday), then a backward pass for float. Both the
  baseline run and the scenario run use this same calculation, so movement is like-for-like; if the unchanged
  recalculation differs from the file (constraints, levelling, manual dates), a warning says how many tasks differ.
- **Capacity changes** shorten (or lengthen) the remaining part of that person's unfinished, non-milestone tasks in
  proportion to total assigned units; a change that would leave nobody on a task is skipped with a warning.
- Bad input (unknown task or person, a summary task, a complete task, a start floor on a started task, no
  `unitsDelta`, a link that does not exist, a bad date) becomes a **warning**, not an error. Dependency loops keep
  their plan dates with a warning.
- Results: a one-line `summary` (go-live movement if a milestone is named like "Go-live", else project finish),
  `changesApplied`, `projectFinish` (before/after/moved), `milestones` (before, after, moved, vs. baseline),
  `criticalPath` (tasks, who joined, who left), `movedTasks`, `newlyOverallocated` (person, days, dates, peak load,
  tasks — only days not already over in the unchanged run), and `planUpdates` in `update_project_plan` shape.
- **Read-only**: nothing is saved. The prompt asks the agent to call it once per scenario, show a side-by-side table
  (Scenario · Go-live · Project finish · Milestones that move · Critical path changes · Newly over-allocated), save the
  comparison with `create_spreadsheet` to `Scenarios/<today's date>.xlsx` (sheets Comparison, Milestones, Changes),
  and recommend one as a recommendation. Applying an approved scenario passes its `planUpdates` to
  `update_project_plan`, which writes an `(updated)` copy ([24](24-update-plan-and-track-changes.md)).
- The skill asks the agent to state the calendar assumption and never present a scenario as the plan.

## Outputs
A comparison table and drivers per scenario in chat, `Scenarios/<date>.xlsx`, and (only after approval) an updated
plan copy.

## Acceptance criteria
- `test/scenario.test.js` › with no changes the recalculated plan matches the file.
- `test/scenario.test.js` › adding 10 days to a critical task moves Go-live by exactly 10 working days, and the plan is
  untouched.
- `test/scenario.test.js` › a slip inside a task's float moves nothing downstream.
- `test/scenario.test.js` › start-no-earlier-than, removing a dependency and adding capacity.
- `test/scenario.test.js` › a slip that piles work onto someone shows them as newly over-allocated.
- `test/scenario.test.js` › bad changes become warnings, not errors.
- `test/scenario.test.js` › model_scenario is exposed and read-only.
- `e2e/real-engine-plans.spec.js` › Planning: delivery scenarios model both slips and leave the plan alone.

## Limits
- No public holidays or resource calendars; levelling and constraints are not modelled.
- Capacity is modelled as shorter durations, not by re-assigning work to named people.
- Durations are whole working days.

## Source
`tools/scenario.js` (`runScenario`, `network`, `schedule`, `topoOrder`, `overload`, `describe`, `findTask`),
`tools/project.js` (`load`, working-day helpers), `tools/office-mcp.js` (`model_scenario`),
`skills/ms-project/SKILL.md`, `agents/<id>.json` (agent **Schedule Analyst**), `defaults/recipes.json`
(prompt **Delivery scenarios**, `delivery-scenarios`).
