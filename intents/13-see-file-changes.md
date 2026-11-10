# 13 — See what files changed and compare before/after

## Intent
As a project manager, I want to see which files Lumen created or changed in a chat and compare a workbook or Project
plan before and after, cell by cell or task by task, so that I can check what the AI actually did before I rely on it.

## Where
- **File cards** under a reply ("Saved to your project folder · Click to open"); on `.xlsx` and `.xml` cards the button
  **See changes / Compare with…** (Lumen only).
- The notebook drawer (**Open notebook** in the chat's **⋯** menu, or the files button in the sidebar): the section
  **Files changed in this chat** above **Recently changed**.
- The dialogs **File changes** and **Compare with…**.

## Inputs & controls
| Control | Effect |
|---|---|
| File card | Opens the file in its app (or shows it in its folder, see [61](61-local-and-private.md)). |
| **See changes / Compare with…** | Compares the file with its pair; with no pair, opens **Compare with…** to pick one notebook file. |
| A row in **Files changed in this chat** ("Go to reply") | Closes the drawer and scrolls to the reply that changed the file. |

## Behaviour (as implemented)
- **Which files count as changed**: files the engine wrote with its own tools (Claude Code Write/Edit/MultiEdit/
  NotebookEdit; Copilot create/edit), files reported by Lumen's tools as `file` events, and replies exported with
  **Export** ([12](12-export-a-reply.md)). Paths are stored on the reply; the finished reply lists only files that
  still exist.
- The drawer lists each changed file once, linked to the last reply that changed it, with its age from
  `POST /api/file-status` or **Missing**.
- **Finding the pair** (`GET /api/file-pair`), first match wins:
  1. the snapshot taken for that reply: `<notebook>/.lumen/snapshots/<reply id>/<same relative path>`;
  2. for `<name> (updated).<ext>`, the original `<name>.<ext>`;
  3. for an original, its `<name> (updated).<ext>` copy.
- **Snapshots**: when a reply runs with **Create & edit** access, the office tools get a per-reply snapshot folder.
  Before the first in-place Excel update in that reply (`excel.update` without `saveAs`), the original workbook is
  copied there once, so later edits in the same reply still compare against the true original. The snapshot folder
  must stay inside the project folder, even through links. Project plan updates are always written to an
  "(updated)" copy, so they pair by name ([24](24-update-plan-and-track-changes.md)).
- **Order**: the "(updated)" file is shown as "after"; otherwise the pair (snapshot or chosen file) is "before" and the
  clicked file "after".
- **Compare** (`GET /api/diff`): both files must be existing files inside the notebook ("Choose two existing files in
  your project folder."); two `.xlsx` or two `.xml` files, otherwise "Choose two Excel workbooks or two Project XML
  files.".
  - Excel: every sheet in either workbook, cell by cell; values as text (dates ISO, rich text joined, hyperlinks as
    `text (url)`, errors), formulas as `<result> ⟨=formula⟩`, so a formula change shows even when the result is the same.
  - Project XML: every task UID in either plan, fields `name`, `start`, `finish`, `durationDays`, `percent`, `notes`
    (dates as YYYY-MM-DD), reported as sheet `Tasks`, cell `<uid>: <field>`.
  - At most 500 changes are returned.

## Outputs
- **File changes** dialog: subtitle `<before> → <after> · Up to 500 changes`, table **Sheet / section**, **Cell /
  field**, **Before**, **After**; or "No cell or task changes found.".

## Acceptance criteria
- Comparing two 510-row workbooks that differ in every row returns exactly 500 changes, the first being `Data` `A2`
  `0` → `1`; values like 0.00001 are compared exactly; a file outside the notebook is refused with 400; two Project
  XML versions of the demo plan return task changes (`test/lifecycle-context.test.js` › workbook diff covers cells,
  caps results and snapshots in-place edits).
- Two in-place updates in one reply (A2 → 99, then → 100) compare as `0` → `100` against the reply's snapshot (same test).
- A snapshot folder reached through a junction outside the project folder is refused and nothing is written there
  (same test; also `test/security.test.js` › Office tools refuse to write through a link that points outside the
  project folder).
- Clicking **See changes** on `Plan (updated).xml` compares `Plan.xml` → `Plan (updated).xml` without asking.
- A workbook with no pair opens **Compare with…** (one choice); picking a `.docx` shows the "two Excel workbooks or
  two Project XML files" error.

## Limits
- Only Excel workbooks and Project XML are compared; Word, PowerPoint and `.mpp` files have no diff.
- Excel snapshots cover in-place edits through Lumen's office tools only; a workbook the engine rewrote with its own
  file tools has no snapshot and needs a manual **Compare with…**.
- The Project XML diff compares six task fields; resources, assignments and baselines are not compared.
- Long comparisons stop at 500 changes with no "more" indicator beyond the subtitle.

## Source
- `public/js/chat.js`, `public/js/chat-clicks.js`, `public/js/runs.js`, `public/js/composer.js`, `public/js/folder.js`, `public/js/main.js`, `public/js/home.js`: `assistantInner` (file cards, `data-diff-file`), `chatClicks`, `showDiff`, `chooseWorkspaceFiles`,
  `openDrawer` (**Files changed in this chat**), `bindChrome` (`data-jump-message`), `LUMEN_ONLY_TIP`.
- `lib/server/chat.js`, `lib/server/routes/files.js`, `lib/server/lifecycle.js`, `lib/server/workspace.js`: `runTurn` (`asstMsg.files`, `LUMEN_SNAPSHOT_DIR`), `/api/file-pair`, `/api/diff`, `diffFiles`,
  `/api/file-status`, `workspaceFile`.
- `tools/excel.js`: `update` (snapshot), `open`. `tools/project.js`: `load`.
- `providers/claude-cli.js`, `providers/copilot-cli.js`: tool events with `writes`.
