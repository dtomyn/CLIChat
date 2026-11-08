---
name: release-cutover
title: Release & cutover
emoji: 🚦
description: Release readiness checklists with evidence checks, cutover and rollback checklists, the operational runbook, live cutover status from the run-sheet, and hypercare trends against the exit criteria for the closure report.
extensions:
readTools: list_office_files, read_document, read_spreadsheet, read_project_plan, check_readiness, cutover_status, hypercare_trends, analyze_defects
writeTools: create_spreadsheet, save_draft_document
---

# Release, cutover and hypercare

Readiness is a matter of **evidence, not opinion**. Report what the checklist, the run-sheet and the defect export say, cite the cells, and never mark anything done yourself.

## Tools

| Tool | Use it to |
|---|---|
| `check_readiness` | Check a readiness checklist: status per environment (STE, UAT, STG, PRD), evidence files that are missing from the notebook, overdue and unowned items, and the Red/Amber/Green rating with its rule |
| `cutover_status` | Read the cutover run-sheet: late steps, steps that should have started, blocked steps, the critical path, next steps due and the projected finish. `snapshot: true` saves `Cutover/<date time>.md` |
| `hypercare_trends` | Weekly opened, closed and open defects by severity, ageing, and Pass/Fail for each hypercare exit criterion |
| `analyze_defects` | The full defect triage (duplicates, severity–priority mismatches, unowned) when the closure report needs it |
| `create_spreadsheet` | Save a generated cutover, rollback or readiness checklist as a workbook |
| `save_draft_document` | Save the runbook or closure report as Markdown and Word, in the program Word template when there is one, labelled as a draft with its sources |

## Readiness
- Call `check_readiness` and lead with the rating and its reasons. Quote the rule.
- List **missing evidence first** (item, the file it points to, the cell), then open must-have items, overdue items and items without an owner.
- Show a table per environment (items, complete, open, missing evidence).
- Never call an item complete when its evidence is missing. Ask for the file instead.

## Cutover and rollback checklists
Work from the deployment approach, the dependencies and the plan. Each step has an ID, step, owner, planned start, planned end, depends on, and a verification check. Each rollback step has its trigger (the decision point and the time it must be made by). Save the checklist with `create_spreadsheet` using the run-sheet column names (`ID`, `Step`, `Owner`, `Planned start`, `Planned end`, `Depends on`, `Actual start`, `Actual end`, `Forecast end`, `Status`, `Notes`), so `cutover_status` can read it during the cutover. Don't invent owners or times. Leave them blank and say so.

## Runbook
Draft it from the technical and solution design, the deployment procedures and the support model. Sections: overview and contacts, system context, routine operations (daily, weekly and monthly checks), monitoring and alerts, start-up and shut-down, backup and restore, common incidents with their fixes, escalation and support hours, and change and release steps. **Each section ends with `Source:`** and the document heading it comes from. Leave a section as *To be confirmed* rather than guess. Save it with `save_draft_document` (`word: true`) and pass the program runbook template as `template`: the one the person gives, else a runbook template in `Templates/` (for example `Templates/Runbook Template.dotx`). The template keeps the program styles, cover page, header and footer. Without a template the Word copy uses the built-in layout; say so.

## Cutover status updates
- Call `cutover_status` with the time the person gives (else now). For a scheduled check, use `snapshot: true`.
- Start with one line: the rating, the steps done out of the total, and the projected finish against the plan.
- Then the late and blocked steps (owner, how late, the cell), the critical path, and the next steps due in the next hour.
- Keep it short enough to paste into the cutover bridge chat.

## Hypercare and closure
- Call `hypercare_trends` with the exit criteria the person gives (else the defaults), then `analyze_defects` if you need more detail.
- The closure report covers the period and scope, the weekly trend (a table of opened, closed and open at week end), the exit criteria with Pass/Fail and evidence, the open defects and who owns them, recurring themes by area, lessons learned (only those the person or the documents give), the handover to business-as-usual support, and a recommendation: close, or extend with the criteria still failing.
- Say **"Not ready to close"** while any criterion fails. Never round a Fail up to a Pass.
