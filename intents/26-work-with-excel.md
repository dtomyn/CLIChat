# 26 — Read, create and update Excel workbooks

## Intent
As a project manager, analyst or anyone with spreadsheets, I want Lumen to read my workbooks with real cell
references, build new formatted ones and change cells without breaking formatting or formulas, so that I can trust the
numbers it quotes and the files it hands back.

## Where
- Skill **Excel workbooks** 📗 (`excel`), on agents **Lumen**, **Project Partner**, **Schedule Analyst**, **Budget
  Controller**, **Data Explorer** and most delivery agents. Attaching or pinning a `.xlsx`, `.xlsm` or `.csv` turns it
  on for the chat (see [08](08-attach-and-reference-files.md), [09](09-pin-files-to-chat.md)).
- Tools `list_office_files`, `read_spreadsheet` ("Reading <file> › <sheet>"), `create_spreadsheet` ("Creating
  <file>"), `update_spreadsheet` ("Updating <file>").

## Inputs & controls
| Tool | Arguments |
|---|---|
| `read_spreadsheet` | `path`, optional `sheet`, `maxRows` (default 300 per sheet). |
| `create_spreadsheet` | `path`, `sheets[]`: `name`, `columns` (text or `{header, format, width}`), `rows`, optional `totals` per column (`sum`, `average`, `count`, null). |
| `update_spreadsheet` | `path`, `updates[]` (`sheet`, `cell` e.g. "D7", `value`), `appendRows[]` (`sheet`, `rows`), optional `saveAs`. |

## Behaviour (as implemented)
- Workbooks are handled with `exceljs`; Excel is not required. `.xls` is refused ("save it as .xlsx first"); other
  extensions are refused as not a spreadsheet. `veryHidden` sheets are skipped.
- **Reading** prints each sheet as rows with real row numbers and column letters; formulas appear as
  `value ⟨=formula⟩` (shared formulas translated to the cell). Long sheets end with "… N more rows".
- **Creating**: bold white header on purple, frozen header row, auto-filter, column widths fitted (10–60 chars).
  Values starting with `=` become formulas; formats `currency`, `currency2`, `percent`, `percent1`, `number`,
  `decimal`, `date` (`YYYY-MM-DD` strings become dates), `text`. A totals row uses `SUM/AVERAGE/COUNT(...)` formulas
  with "Total" in the first column. Sheet names are cut to 31 characters. An existing file at the path is replaced.
- **Updating** keeps the workbook's formatting and formulas, changes only the given cells (`YYYY-MM-DD` values become
  dates), appends rows, and returns every change as `Sheet!Cell: before → after`. It saves over the file unless
  `saveAs` is given (resolved next to the file, confined to the project folder).
- Before the first in-place update in a reply, the original is copied to `.lumen/snapshots/<message id>/…`, so the
  file card can compare before and after ([13](13-see-file-changes.md)).
- After saving `.xlsx`/`.xlsm`, Lumen asks Excel (COM, if installed) to recalculate and save; otherwise the workbook is
  flagged to recalculate when opened.
- Paths are resolved inside the project folder; a missing name is matched by file name anywhere in the folder (up to 3
  levels, hidden folders skipped). Writes outside the folder, including through links, are refused.
- `create_spreadsheet` and `update_spreadsheet` are write tools: offered only in **Create & edit files**; in read-only
  chats the server refuses them.
- The skill tells the agent to quote figures with their cell ("Budget Summary!G3 shows –$35,500"), prefer formulas over
  hard-coded totals, keep the user's structure, list every changed cell, use `saveAs` when the original may be wanted,
  and give the saved file name.

## Outputs
Answers that cite cells; new or updated workbooks as file cards in the reply; for updates, a list of changed cells.

## Acceptance criteria
- Reading a workbook shows real cell addresses and formulas in `⟨=…⟩`.
- A created workbook has a frozen, filtered, styled header and formula totals when `totals` is given.
- An in-place update keeps formatting and formulas and snapshots the original first:
  `test/lifecycle-context.test.js` › workbook diff covers cells, caps results and snapshots in-place edits.
- In **Read my files**, create/update calls are refused with the "Create & edit files" message.

## Limits
- No dedicated tests for `read`, `write` or `update` beyond the snapshot/diff test and the tools that reuse them.
- Charts, pivot tables and macros are not created; `.xlsm` macros are not run.
- Recalculation through Excel only happens on Windows with Excel installed.

## Source
`tools/excel.js` (`open`, `read`, `cellText`, `write`, `update`, `styleSheet`, `coerce`, `FORMATS`, `recalc`, `save`),
`tools/office-mcp.js` (`list_office_files`, `read_spreadsheet`, `create_spreadsheet`, `update_spreadsheet`,
`resolveIn`, `outputIn`, `write`), `skills/excel/SKILL.md`, `lib/skills.js` (`resolve`, `toolConfig`), `lib/server/chat.js`
(`LUMEN_SNAPSHOT_DIR`), `agents/<id>.json` (agents **Data Explorer**, **Budget Controller**).
