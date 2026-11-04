# Plan 05: Chat context and file changes

**Enhancements:** pin files to a chat, show what changed in the folder
**Size:** medium
**Files:** `server.js`, `lib/skills.js` (read first), `public/app.js`, `public/app.css`, `public/index.html` (drawer markup)

## Why

Business analysts and project managers work from the same few documents (BRD, plan, TRM, RAID log) for weeks. Re-attaching them every turn is tedious and easy to forget. And once the AI has edited files, users want to know what changed without searching the folder.

## Current state

- Attachments go into `Attachments/` and are mentioned in the prompt as `[Attached files: "…"]`. `skills.resolve(assistant.skills, attachments)` turns on skills based on file types.
- The files drawer (`openDrawer`) lists recently changed files across the whole workspace.
- `asstMsg.files` records files written by tools. Each reply shows them as file cards.

## Design

### 1. Pinned files

- Data: `conv.pinned_files = [path, …]`. This is a different thing from the existing `conv.pinned` flag, which means "chat pinned in the sidebar". Persist it through the `PATCH /api/conversations/:id` allow-list (add `pinned_files`).
- Server, in `handleChat`:
  - Merge the pinned files (those that still exist and are inside the workspace) with `attachments` for skill resolution: `skills.resolve(..., [...attachments, ...pinned])`.
  - Add a system-prompt line: `Key files for this chat (read them when relevant): "rel1", "rel2"`. Put it in the system prompt, not the user message, so it doesn't clutter history.
- UI:
  - A "📌 Pin to this chat" action on attachment chips in user messages, and on file rows in the drawer.
  - A pinned-files strip just above the composer in chat view: small chips with an × to unpin, and a "+" that opens a picker listing the workspace files from `/api/folder/files?all`.
  - On the home screen, pinning goes into `S.draft.pinned` and is sent with the first message. `handleChat` sets `conv.pinned_files` when it creates the conversation.

### 2. What changed

- **Per chat:** add a "Files changed in this chat" section in the drawer when a chat is open. It's the union of `m.files` across the conversation's messages, with each file's last-modified time and the reply that touched it (click to scroll to that message, using `data-mid`).
- **Snapshots for Excel diffs:** before the first write to a file in a reply, the office tools already save an "(updated)" copy for Project plans. For Excel `update`, check [tools/excel.js](../../tools/excel.js) `update(file, { saveAs })`. If it edits in place, record the original's cell values instead (see the next point).
- **Before/after view for workbooks:** add `GET /api/diff?a=<path>&b=<path>`, which uses `excel.read()` on both files and returns a list of changed cells per sheet: `{ sheet, cell, before, after }`, capped at 500. Pair the files by convention: `X.xlsx` ↔ `X (updated).xlsx`. Otherwise offer "Compare with…" to pick the other file.
- UI: a "See changes" button on file cards for `.xlsx` or Project XML when a pair exists. It opens a wide `modal()` with a table of changed cells grouped by sheet.

## Steps

1. Store pinned files and add them to the prompt (server), then test that a pinned BRD is used without being attached.
2. Add the pinned-files strip, the pin actions and the picker.
3. Add the drawer section "Files changed in this chat".
4. Build the diff endpoint, then the "See changes" modal. Test it with the demo pack's "Update plan from progress sheet" quick start.

## Acceptance checks

- A pinned file stays pinned after a reload. New turns can use it without re-attaching it, and its matching skill turns on automatically.
- Unpinning removes it from later turns.
- Pinned files outside the workspace, or deleted files, are ignored quietly, and the chip shows as missing.
- The drawer shows the files this chat changed, and clicking one scrolls to the reply that changed it.
- "See changes" on an updated workbook lists the changed cells with before and after values.

## Out of scope

Diffs for Word documents and text files (a later option: a line diff for .md and .txt). Version history beyond one before/after pair.
