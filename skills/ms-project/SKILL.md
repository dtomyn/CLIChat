---
name: ms-project
title: Microsoft Project plans
emoji: 📅
description: Read, analyze and update Microsoft Project plans (.mpp and Project XML) — schedule health, critical path, slippage, resource over-allocation, and progress updates.
extensions: .mpp, .xml
readTools: list_office_files, read_project_plan, analyze_project_plan, query_plan, plan_change_log, plan_lookahead, get_status_facts
writeTools: update_project_plan, project_plan_to_spreadsheet, build_status_report
---

# Working with Microsoft Project plans

You have tools for Microsoft Project plans in the user's project folder. **Always use the tools. Never guess plan contents.**

| Tool | Use it to |
|---|---|
| `list_office_files` | Find plans and workbooks when the user doesn't name a file |
| `analyze_project_plan` | Health checks, status reports, "what's late / slipping / at risk", critical path, over-allocation. **Start here for any question about schedule health.** |
| `query_plan` | Questions about **part** of a plan: a workstream (`under`), a person (`owner`), late/behind tasks, the critical path, slips over N days, a date window, what a task depends on or what depends on it (`relatedTo`), and what changed since last week (`changedSince: "last"`). Returns exact rows; combine filters rather than reading the whole plan. Report the filters it applied, and any warnings |
| `plan_change_log` | The change log between plan versions (the monthly one, or "what changed since the baseline?"). Changes are already sorted into **material** (milestone or finish moves, critical-path or large date moves, dependency logic changes, work added or removed) and **administrative**, each with the reason. Report material changes first, with their reasons; summarise administrative ones in a line or two |
| `plan_lookahead` | The weekly forward-looking readout by workstream: starting, finishing, milestones, late carry-overs and what each workstream is waiting on. Lead with milestones and dependencies, since those are what teams need on their radar |
| `get_status_facts` | The weekly status model for a plan and optional RAID log: rule-based RAG with reasons, milestones with variance and movement since last time, changes, late/behind work, overdue RAID items, top risks and issues. Every fact has a source. Use it before writing any status summary |
| `build_status_report` | Save the status pack (status.json, a detailed Markdown report, a one-page HTML executive dashboard) under "Status reports/<date>/" as a Draft. Pass your narrative and decisions needed; they are labelled AI-written. Never contradict the calculated rating in the narrative; recommend a change instead |
| `read_project_plan` | Full task list (IDs, WBS, dates, % complete, predecessors, resources) when you need details |
| `update_project_plan` | Record progress (% complete, dates, durations, notes) and move the status date. Saves a new "(updated)" copy, so the original is never overwritten |
| `project_plan_to_spreadsheet` | Produce an Excel tracker with a colour-coded task list, a weekly **variance Gantt** (baseline under each bar, slip weeks hatched red, variance in working days, status-date line) and a Milestone variance sheet. Lumen keeps a dated version of the plan (in .lumen/plan-history) each time a tracker is built or progress is recorded, and the Milestone variance sheet compares against those automatically. Pass `history` only to compare with specific files |

## How to report on a plan
- Lead with the answer: an overall **RAG status** with a one-line reason, then the 3–5 things a project manager must act on.
- Always cite task **ID and name** (e.g. "#18 Build ERP integration"), dates as *Mon 13 Nov*, and slips in **working days**.
- Explain the *knock-on effect*: if a late task is on the critical path, say which milestones move and by how much.
- Separate **facts from the plan** from **your recommendations**.
- Use tables for lists of tasks: ID · Task · Finish · Baseline · Slip · Owner.
- Over-allocation: name the person, the peak load (e.g. 200%), the dates and the clashing tasks, and suggest a fix (re-sequence, split, reassign or level).

## Updating a plan
1. Read the plan (and any progress sheet) first, then show the user a short table of the changes you'll make.
2. If the user already asked you to apply the changes, apply them with `update_project_plan`. Otherwise, ask once.
3. After saving, re-run `analyze_project_plan` on the **updated** file and summarise what moved: % complete, late tasks and the forecast finish.
4. Remind the user that Microsoft Project recalculates dependent dates when they open the file.

## Good to know
- A `.mpp` file needs Microsoft Project installed on this computer to be read. If it isn't installed, tell the user to open the plan in Project and choose **File › Save As › XML**.
- "Status date" is the as-of date for progress. Use the plan's status date unless the user gives one.
- Baseline = the approved plan. Variance = current forecast minus baseline.
