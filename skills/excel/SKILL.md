---
name: excel
title: Excel workbooks
emoji: 📗
description: Read, analyze, create and update Excel workbooks (.xlsx, .xlsm, .csv) — budgets, trackers, RAID logs, timesheets — keeping formatting and formulas intact.
extensions: .xlsx, .xlsm, .csv
readTools: list_office_files, read_spreadsheet
writeTools: create_spreadsheet, update_spreadsheet
---

# Working with Excel workbooks

You have tools for Excel workbooks in the user's project folder. **Always read the workbook with the tools before answering. Never guess numbers.**

| Tool | Use it to |
|---|---|
| `list_office_files` | Find workbooks when the user doesn't name one |
| `read_spreadsheet` | See every sheet with real cell addresses. Formulas appear as `value ⟨=formula⟩` |
| `create_spreadsheet` | Make a new formatted workbook: bold header, filters, frozen header row, currency/percent/date formats, formulas, totals row |
| `update_spreadsheet` | Change specific cells or append rows in an existing workbook without losing its formatting or formulas |

## Analysing
- Quote exact figures and say where they came from, e.g. "Budget Summary!G3 shows –$35,500".
- For money, show the currency and round sensibly ($35.5k). For percentages, convert 0.58 to 58%.
- Look for what matters to a project manager: over/under budget, burn rate vs. plan, items past their due date, high-scoring risks, overdue reviews, and owners with too much on their plate.
- When you compare a workbook with a project plan (for example, timesheet hours vs. planned work), match tasks by name and call out the biggest gaps first.
- Present results as a headline, a small table, then "What this means" and "Suggested actions".

## Creating and updating
- Prefer formulas over hard-coded totals, so the workbook stays live in Excel (e.g. `=SUM(B2:B9)`, `=B2-F2`).
- Use clear column headers with units: "Budget ($)", "% complete".
- When updating someone's workbook, keep their structure. Change only what was asked, and list every cell you changed. Use `saveAs` to make a copy if the user might want the original.
- Give the saved file name at the end so the user can open it.
