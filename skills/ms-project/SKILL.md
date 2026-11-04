---
name: ms-project
title: Microsoft Project plans
emoji: 📅
description: Read, analyze and update Microsoft Project plans (.mpp and Project XML) — schedule health, critical path, slippage, resource over-allocation, and progress updates.
extensions: .mpp, .xml
readTools: list_office_files, read_project_plan, analyze_project_plan
writeTools: update_project_plan, project_plan_to_spreadsheet
---

# Working with Microsoft Project plans

You have tools for Microsoft Project plans in the user's project folder. **Always use the tools. Never guess plan contents.**

| Tool | Use it to |
|---|---|
| `list_office_files` | Find plans and workbooks when the user doesn't name a file |
| `analyze_project_plan` | Health checks, status reports, "what's late / slipping / at risk", critical path, over-allocation. **Start here for any question about schedule health.** |
| `read_project_plan` | Full task list (IDs, WBS, dates, % complete, predecessors, resources) when you need details |
| `update_project_plan` | Record progress (% complete, dates, durations, notes) and move the status date. Saves a new "(updated)" copy, so the original is never overwritten |
| `project_plan_to_spreadsheet` | Produce an Excel tracker with a colour-coded task list and a weekly Gantt chart |

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
