# 31 — Sync backlog progress into the plan and status

## Intent
As a project manager whose teams track work in Azure DevOps, I want Lumen to work out each plan task's % complete from
the linked backlog items, show me the data-quality gaps, and update the plan only after I approve, so that the plan and
the status report reflect delivery reality without manual roll-ups.

## Where
- Prompt **Update plan from ADO backlog** 🔗 (category *Project plans*, agent **Schedule Analyst**, access `edit`,
  badge **Saves a file**).
- Prompt **Weekly executive status** with its optional backlog field adds **Delivery progress**
  ([27](27-weekly-executive-status.md)); **Who's overloaded?** uses the same export for sprint demand
  ([30](30-capacity-budget-timesheets.md)).
- Tool `plan_progress_from_backlog` ("Matching <backlog> to <plan>"), then `update_project_plan`.

## Inputs & controls
| Control | Effect |
|---|---|
| **Project plan** (`.mpp,.xml`) | The plan to update. |
| **Azure DevOps backlog export** (`.xlsx,.xlsm,.csv`) | A work-item query export with at least **ID** and **State**. |
| **Status date (optional)** | Defaults to the plan's status date. |
| `tagPrefix` | Link tag prefix (default `MPP`, so `MPP-23` → task #23). |
| `basis` | `state` (each item weighs the same, default) or `points` (weighted by story points). |
| `stateMap` | Override the % counted for a state, e.g. `{"Ready for test": 90}`. |
| `staleDays`, `allowDecrease` | Days without change before an in-progress item is stale (default 14); also propose lower %s. |

## Behaviour (as implemented)
- Columns are recognised by header: ID, Work Item Type, Title, State, Tags, Story Points/Effort/Size, State Change
  Date/Changed Date, Assigned To, Plan task, Iteration Path, Remaining Work, Parent/Epic. A file without ID and State is
  refused with a clear message.
- **Linking** (first match wins): a **Plan task** column, a mapping sheet (name starting "Map", ADO ID → plan task), or
  a `<prefix>-<id>` tag (also accepted in the title).
- **State → %** (defaults): Done/Closed/Completed/Resolved/Accepted 100; Ready for test/In test/Testing/In review/Review
  75; Active/Doing/In progress/Committed 50; Approved 25; New/Proposed/To do/Backlog 0; unknown states 0 and reported.
  Removed/Cut/Deleted/Rejected items are ignored and counted.
- Each linked leaf task gets the (weighted) average of its items. Equal values are listed as unchanged; **lower**
  values are held back ("confirm with the tower lead") unless `allowDecrease` is set.
- **Data quality**: unlinked items, links to tasks that do not exist, links to summary tasks, unknown states, stale
  in-progress items (with days since change), items without points when weighting by points, and unfinished plan
  tasks starting within 14 days of the status date that have no items.
- Read-only. The prompt shows proposals (ID · Task · Now · Proposed · Items done/total), held-back rows and data
  quality with who should fix what, then **asks for approval**; only approved rows go to `update_project_plan`, which
  saves an `(updated)` copy ([24](24-update-plan-and-track-changes.md)).
- **Delivery progress in the status pack**: items by state per epic (Parent/Epic column, else the linked task's
  workstream), story points done, open items on late or behind tasks, and started critical-path tasks with linked
  items not started, which raise a Green rating to Amber. Every row cites `Sheet!A<row>`.

## Outputs
Proposals and data-quality findings in chat; after approval, `<plan> (updated).xml`; with the status pack, a
**Delivery progress (Azure DevOps)** section in the report and dashboard.

## Acceptance criteria
- `test/backlog-progress.test.js` › rolls item states up to a task and ignores removed items.
- `test/backlog-progress.test.js` › weights by story points.
- `test/backlog-progress.test.js` › data quality: unlinked, missing and summary links, stale, unknown state, tasks
  without items.
- `test/backlog-progress.test.js` › holds back decreases unless allowed; mapping sheet and custom prefix work.
- `test/backlog-progress.test.js` › a file without ID and State columns is rejected clearly.
- `test/status-report.test.js` › a backlog export adds delivery progress with row citations and an amber reason.
- `e2e/project-prompts.spec.js` › Update plan from ADO backlog: files are preselected and proposals show.
- `e2e/real-engine.spec.js` › Update plan from ADO backlog proposes changes and does not apply them unasked.

## Limits
- Works from an exported file, not a live Azure DevOps query (live search is [38](38-search-and-read-ado.md)).
- State weights are fixed defaults unless overridden per call; custom process states need a `stateMap`.
- Demo: **ADO Backlog Export - 30 Oct 2026.xlsx**, items tagged `MPP-<task ID>` ([04](04-install-demo-and-samples.md)).

## Source
`tools/backlog.js` (`readBacklog`, `linker`, `linkedItems`, `progressFromBacklog`, `DEFAULT_STATE_PERCENT`),
`tools/status.js` (`deliveryProgress`), `tools/office-mcp.js` (`plan_progress_from_backlog`, `update_project_plan`),
`skills/ms-project/SKILL.md`, `defaults/recipes.json` (prompt **Update plan from ADO backlog**,
`plan-progress-from-backlog`).
