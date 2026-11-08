# 24 — Update the plan from progress and see what changed (plan history)

## Intent
As a project manager, I want to apply my team's % complete and date updates to the Microsoft Project plan and then see
what changed since the last version (with material changes called out), so that progress is recorded without
retyping and the monthly change log writes itself.

## Where
- Prompt **Update plan from progress sheet** 🔄 (category *Project plans*, agent **Schedule Analyst**, access `edit`,
  badge **Saves a file**).
- Prompt **Monthly plan change log** 🧾 (agent **Schedule Analyst**, access `read`).
- Schedule Analyst starter "Update the plan with this week's progress sheet"; any chat with the `ms-project` skill set
  to **Create & edit files**.
- Tools `update_project_plan` ("Updating N tasks in <file>") and `plan_change_log` ("Comparing <file> with an earlier
  version"); `query_plan` with `changedSince` ([23](23-ask-the-plan.md)).

## Inputs & controls
| Control | Effect |
|---|---|
| **Project plan** / **Progress update workbook** / **New status date** | Fields of the update prompt (`.mpp,.xml`; `.xlsx,.xlsm,.csv`; text such as 2026-10-30). |
| `updates[]` | Per task (`taskId` or exact `taskName`): `percentComplete`, `start`, `finish`, `durationDays`, `name`, `notes`. |
| `statusDate`, `saveAs` | New status date; optional output name (confined to the project folder). |
| **Compare with the version from (optional)** | Change-log prompt field; blank = last saved version. |
| `plan_change_log` `against` / `compareFile` / `thresholdDays` | `last` or a date; or a named earlier file; date moves above this (default 3 working days) are material. |

## Behaviour (as implemented)
- Dates must be `YYYY-MM-DD`, else the call fails with a friendly message. Tasks not found are reported as `not found`.
- Edits are surgical XML replacements in the `<Task>` block (field order kept), so everything else in the file stays.
  % complete is clamped to 0–100 and also sets `PercentWorkComplete`, `ActualStart` (if missing) and, at 100%,
  `ActualFinish`. Starts are written at 08:00 and finishes at 17:00.
- **Never overwrites the original**: saves `<name> (updated).<ext>` next to it unless `saveAs` is given. Updating an
  `(updated)` copy again keeps that name (the suffix is not stacked); plan history keeps each version. For `.mpp`, the
  XML is converted back through Microsoft Project when installed; otherwise the `.xml` is kept. Dependent dates are not
  recalculated: the result says Microsoft Project does that on open.
- **Plan history**: each update records the version before and after under
  `.lumen/plan-history/<plan name>/<status date>.xml` (building a tracker records one too, see
  [25](25-excel-tracker-and-variance-gantt.md)). `(updated)` and `(proposed)` copies share the original's history; one
  file per status date, the latest wins; unchanged content is not rewritten.
- `update_project_plan` is a write tool: it is only offered in **Create & edit files**; in read-only chats the server
  refuses with "Editing files is turned off for this chat…".
- The skill asks the agent to show the changes first, apply once approved (or straight away when the request already
  says so), then re-run `analyze_project_plan` on the **updated** file and summarise what moved.
- **Change log**: compares with the newest saved version before the status date (or before the day after a given
  date, or `compareFile`). Material = new/removed milestones, milestone or critical-path finish moves, finish moves over
  the threshold, dependency logic changes, duration changes over the threshold, added/removed work over the threshold;
  each material change gives its `why` and up to 3 downstream milestones it feeds. Renames, notes, resources and small
  moves are administrative; % complete changes are only counted. Project finish uses the latest task finish, not the
  (stale) header. Without any earlier version it returns a warning and empty lists. Read-only.

## Outputs
- `<plan> (updated).xml` (or `.mpp`), a before/after table and the new health summary in chat.
- Change log JSON: `summary`, `projectFinish`, `milestones` (before, now, moved, baseline), `material`,
  `administrative`; the prompt turns it into a headline, a material-changes table and a grouped admin summary.
- **See changes / Compare with…** on the saved plan's file card compares it with the original task by task
  ([13](13-see-file-changes.md)).

## Acceptance criteria
- The original plan file is unchanged after an update; the `(updated)` copy carries the new values.
- `test/plan-reports.test.js` › change log without an earlier version explains itself.
- `test/plan-reports.test.js` › change log separates material from administrative changes.
- `test/plan-reports.test.js` › project finish follows the tasks when the header is stale.
- `test/plan-reports.test.js` › change log honours a date and an explicit comparison file.
- `test/variance-gantt.test.js` › plan versions are recorded and used automatically for the trend.
- `test/variance-gantt.test.js` › historyKey groups updated copies with the original.
- `e2e/project-prompts.spec.js` › Monthly plan change log: material changes are listed with reasons.
- `e2e/real-engine.spec.js` › Monthly plan change log.
- Updating an `(updated)` copy again keeps its name (`test/plan-reports.test.js` › updating an (updated) copy again
  keeps its name instead of stacking "(updated) (updated)").

## Limits
- Lumen does not reschedule successors; dates move only where written until the file is opened in Project.
- History is only as good as the versions Lumen saw: edits made in Project between runs appear as one change.
- `.mpp` round-tripping is untested (needs Microsoft Project).

## Source
`tools/project.js` (`updatePlan`, `setField`, `TASK_ORDER`, `recordVersion`, `earlierVersions`, `historyKey`,
`changeLog`, `pickVersion`), `tools/office-mcp.js` (`update_project_plan`, `plan_change_log`, `write`),
`skills/ms-project/SKILL.md` ("Updating a plan"), `defaults/recipes.json` (prompts **Update plan from progress sheet**
`plan-update-progress`, **Monthly plan change log** `plan-change-log`).
