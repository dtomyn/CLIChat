# Plan 03: Save a reply as Word or Excel

**Enhancement:** save a reply as a document
**Size:** medium (server converter and UI)
**Files:** new `tools/md-export.js`, `server.js`, `public/app.js`, `public/app.css`, `package.json`

## Why

The deliverable a project manager wants is usually a file: a status report in Word, or a table in Excel. Today they copy markdown and reformat it by hand.

## Constraints

- There's no Word writer in the repo. [tools/docx.js](../../tools/docx.js) only reads.
- `jszip` is already in `node_modules` (pulled in by `exceljs`), and `exceljs` is a direct dependency. Add `"jszip"` to `package.json` `dependencies`, pinned to the installed version (`node -p "require('jszip/package.json').version"`), so it doesn't go missing silently. **Don't run an install that downloads anything; if it's not present, stop and ask.**
- `marked` is available on the server (`node_modules/marked`), so we can use its **lexer** to get tokens instead of parsing HTML.

## Design

### `tools/md-export.js`

- `markdownToDocx(markdown, { title }) → Buffer`
  - Use `marked.lexer(md)` and walk the tokens: `heading` (1–3 → Heading1–3), `paragraph`, `list` (bulleted and numbered, one level of nesting), `table`, `code` (monospace paragraph with shading), `blockquote` (indented italic), `hr`.
  - Inline tokens: `strong`, `em`, `codespan`, `link` (show the text plus the URL in brackets; real hyperlinks are optional), and `text`.
  - Write a minimal OOXML package with JSZip:
    - `[Content_Types].xml`
    - `_rels/.rels`
    - `word/document.xml`
    - `word/styles.xml`: Normal (Calibri 11), Heading1–3, Title, ListParagraph, and a TableGrid table style
    - `word/numbering.xml`: one bullet and one decimal abstractNum
    - `docProps/core.xml`: title and created date
  - Tables: header row in bold with shading, `w:tblBorders` on all cells, and the column alignment taken from the markdown.
  - XML-escape every piece of text.
- `markdownTablesToXlsx(markdown, file) → Promise<string>`
  - Pull out every `table` token. Write one sheet per table, named from the nearest preceding heading (sanitised, at most 31 characters, unique).
  - Reuse `tools/excel.js` `write(file, sheets)` so the styling matches the rest of Lumen. Check its expected `sheets` shape before calling it.
  - Convert cells that look numeric, percentage or date-like into real values, using the same idea as `coerce()` in `excel.js`.

### Server

`POST /api/export` with body `{ conversationId, messageId, format: 'docx' | 'xlsx' }`:
- Load the message and resolve the workspace from the conversation.
- The file name is `<conversation title> - <yyyy-mm-dd>.<ext>`, sanitised like the upload route and de-duplicated with ` (2)`. Save it in the workspace folder `Exports/`.
- Return `{ path, name }`. Return a 400 error "This reply has no tables" for `xlsx` when there are no tables.

### Client

- In `.msg-actions` (assistant replies), add a **Save as…** button that opens `openMenu` with:
  - "Word document (.docx)"
  - "Excel workbook (.xlsx)", shown only if the content contains a markdown table (`/^\s*\|.*\|\s*$/m` plus a separator row)
- On success, add the path to `m.files` locally and re-render the message, so the existing **file card** appears ("Saved to your project folder · Click to open"). Show a toast as well.

## Steps

1. Write `md-export.js`. Test it with `node -e` on a sample markdown string that has headings, nested lists, a table and code, and write the output to the scratchpad folder. Open the .docx in Word: it must open with no repair prompt. Also check it with `tools/docx.js readDocument` as a round trip.
2. Add the xlsx path and open the result in Excel.
3. Add the endpoint, then the UI.
4. Use the demo pack: run "Project health check", then save the reply as Word and as Excel.

## Acceptance checks

- The .docx opens in Word with no repair prompt. Headings use real Heading styles (they show in the navigation pane), lists are real lists, and the table has borders and a bold header.
- The .xlsx has one sheet per table, numbers are numeric (sums work), and headers are styled.
- Files land in `<workspace>/Exports/` and show as clickable cards.
- File names are never overwritten.

## Out of scope

Images, footnotes, PowerPoint export, and Word templates or branding (a later option: let `settings.exportTemplate` point at a .dotx).
