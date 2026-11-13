# 27 — Produce the weekly executive status pack

## Intent
As a project manager, I want this week's status report and a one-page executive dashboard built from my plan, RAID log
and (optionally) backlog export, with every fact traced to its source and the AI's words clearly labelled, so that I
can send a trustworthy status after a PMO review instead of assembling it by hand.

## Where
- Prompt **Weekly executive status** 🧭 (category *Project plans*, agent **Project Partner**, access `edit`, badge
  **Saves a file**).
- Related prompts: **Status report from my files** 📣 (Project Partner, `read`: a one-page report in chat from the
  plan, budget tracker and RAID log) and **Weekly status report** 🚦 (category *Projects*, no files: typed notes).
- Tools `get_status_facts` ("Gathering status facts from <plan> and <RAID>") and `build_status_report` ("Writing the
  status pack for <plan>").

## Inputs & controls
| Control | Effect |
|---|---|
| **Project plan** (`.mpp,.xml`) | Required. |
| **RAID log** (`.xlsx,.xlsm,.csv`, optional) | Risks, issues, decisions, dependencies, overdue items. |
| **Azure DevOps backlog export (optional)** | Adds **Delivery progress** ([31](31-progress-from-backlog.md)). |
| `statusDate`, `tagPrefix` | As-of date (default the plan's); backlog link prefix (default `MPP`). |
| `narrative`, `decisionsNeeded[]` | The AI's 3–5 sentence summary and leadership asks (each citing a task or RAID ID). |

## Behaviour (as implemented)
- One **status model** (`buildModel`) is calculated in code from the files; the prompt makes the agent call
  `get_status_facts` first, write the narrative and up to 3 decisions, then call `build_status_report`.
- **RAG**: the plan's suggested rating ([22](22-plan-health-check.md)), raised from Green to Amber by an open
  High-severity issue, a risk scored 9, or a started critical-path task whose linked backlog items have not started.
  Every reason is listed with the rule text.
- **Milestones**: baseline, forecast, variance, change since the last saved plan version, state (Slipped badly over 10
  days), working days to go, and up to 6 unfinished upstream tasks (late, behind, not started on zero float…).
- **What changed** since the last saved version (`query_plan` `changedSince`), **Needs attention** (late, behind,
  over-allocated, overdue RAID items), top risks and issues by score, recent decisions and open dependencies.
- **RAID reading** (`readRaid`): one sheet per type or a Type column; columns found by header; score = Score column or
  H/M/L probability × impact; closed words (closed, resolved, done, mitigated…) mark items closed; each item cites
  `Sheet!A<row>`.
- **Approved RAID only** (`latestRaid`): uses `<RAID> (updated).xlsx` when it is newer than the original, never a
  `(proposed)` copy, and lists huddle changes still awaiting review or approved but not applied
  ([28](28-huddle-to-raid.md)); the prompt tells the agent to report which file was used and what is pending.
- **AI text is separate**: narrative and decisions are stored under `ai` and labelled *AI-written*; if the narrative
  names a different rating from the calculated one, the pack adds a "Check:" warning. Narrative text is HTML-escaped.
- `get_status_facts` is read-only (no `ai` block); `build_status_report` is a write tool (**Create & edit files**).
- Sources: plan, previous plan version, RAID log and backlog with modified date and a SHA-256 fingerprint.

## Outputs
In `Status reports/<status date>/` (re-running on the same date replaces them):
- `status.json`: the model (`schemaVersion` 1, review status `Draft`).
- `<project> - Status report.md`: overall rating and reasons, AI summary, schedule, cost, milestones, changes, needs
  attention, delivery progress, risks and issues, decisions needed, RAID file used, sources.
- `<project> - Executive dashboard.html`: self-contained, light/dark, a Draft banner, rating hero, tiles, milestones that
  expand to the work they wait on, source chips on every fact.
- A chat reply with the rating, top 3 points, tool warnings, file links and a reminder that it is a draft for PMO review.

## Acceptance criteria
- `test/status-report.test.js` › readRaid recognises sheets, scores from formulas, open/closed and source cells.
- `test/status-report.test.js` › the status model is calculated from the files, with reasons and sources.
- `test/status-report.test.js` › buildReport writes the pack, tracks change since last version and flags a
  contradicting narrative.
- `test/status-report.test.js` › narrative text is escaped in the dashboard.
- `test/status-report.test.js` › status tools are exposed; the report needs edit access.
- `test/status-report.test.js` › the status model reads the approved RAID log and says what the huddle left pending.
- `test/status-report.test.js` › the status pack still works without a backlog file.
- `e2e/real-engine.spec.js` › Weekly executive status says which RAID log it used and what is still pending.
- `e2e/real-engine-plans-2.spec.js` › Planning: the executive status pack includes delivery progress and is saved as
  a draft.

## Decisions
- Facts and rating are code; the model only writes the narrative and asks. A disagreeing narrative is flagged, not
  silently corrected, and the prompt says to recommend a different rating rather than state it.

## Limits
- "Change since last" needs an earlier version in `.lumen/plan-history/`; the first pack says so.
- The review status stays `Draft`; there is no in-app approve step for status packs.
- Budget trackers are not part of the pack (only plan cost vs. baseline); see [30](30-capacity-budget-timesheets.md).

## Source
`tools/status.js` (`buildModel`, `readRaid`, `severity`, `deliveryProgress`, `renderMarkdown`, `renderHtml`,
`buildReport`), `tools/raid.js` (`latestRaid`), `tools/office-mcp.js` (`get_status_facts`, `build_status_report`),
`skills/ms-project/SKILL.md`, `agents/<id>.json` (agent **Project Partner**), `defaults/recipes.json` (prompts
**Weekly executive status** `exec-status-pack`, **Status report from my files** `plan-status-report`, **Weekly status
report** `status-report`).
