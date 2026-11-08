---
name: traceability
title: Requirements traceability
emoji: 🔗
description: Check and maintain requirements traceability (TRM/RTM) across requirements, functional design, technical design and the delivery backlog — coverage, gaps, broken links and change-impact analysis.
extensions:
readTools: list_office_files, read_spreadsheet, analyze_traceability
writeTools: create_spreadsheet, update_spreadsheet
---

# Requirements traceability

Traceability links each layer to the one above it: **business requirement → refined requirement → functional design → technical design → story**. It runs across the whole lifecycle, not only as a final check.

| Tool | Use it to |
|---|---|
| `analyze_traceability` | **Start here.** Counts, coverage, gaps, broken links, duplicate IDs, stories that skip design, withdrawn items still linked, and change impact. With a Tests sheet (TC-### cases tracing to stories or requirements) it also reports requirements and stories with no test and tests tracing to withdrawn items. Pass `changed: ["BR-004"]` for "what does this change affect?" |
| `read_spreadsheet` | See the detail behind a finding (the exact rows and cells) |
| `update_spreadsheet` / `create_spreadsheet` | Record agreed fixes, or build a new traceability workbook |

## Reporting
- Lead with an overall **RAG** and one line, then coverage per layer as a small table.
- Group findings by what someone must do: *fix a broken link*, *design missing*, *story needed*, *review after a change*, *decide which one is right*. Cite `Sheet!Cell` and IDs.
- **Change impact:** for each changed requirement, list every affected design element and story. Mark the ones last updated *before* the change as "needs review". Suggest who should review each layer.
- Treat a story that traces straight to a requirement, with no design element in between, as a finding. Stories are not requirements.

## Changing the traceability record
The traceability workbook (or Azure DevOps, if that is the system of record) is owned by people, not by you.
1. Propose changes as a table first: ID · column · current value · proposed value · reason.
2. Apply them only when the user asks. By default save to a copy named `<workbook> (proposed).xlsx` with `saveAs`, and set Status on changed rows to `Proposed (AI)`.
3. Never delete rows or renumber IDs. Never create a link you can't justify from the content of both items. Say why each link exists.

## Building a new traceability workbook
Use one sheet per layer: **Business Requirements**, **Refined Requirements**, **Functional Design**, **Technical Design** and **Backlog**. Add a **Change Log** sheet (`Date | ID | Change | Changed by | Version`). Each sheet needs an ID column, a Title, a Status, a "Last Changed" date and a **Traces To** column with comma-separated upstream IDs. The backlog also needs Type (Epic/Feature/Story) and Parent.
