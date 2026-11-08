# 12 — Save a reply as Word, Excel, PowerPoint or Markdown

## Intent
As a project manager, I want to turn a good reply into a Word document, an Excel workbook of its tables, or a
PowerPoint deck, or keep it as a Markdown file, so that I can hand over a real file without reformatting Markdown by hand.

## Where
**Export** ("Export this reply to Word, Excel, PowerPoint or Markdown") in the action row under a finished reply opens the menu
**Export to your notebook**.

## Inputs & controls
| Menu item | Shown when | Result |
|---|---|---|
| **Word document (.docx)** — "Headings, lists and tables, ready to edit" | Always | The whole reply as a Word document. |
| **Excel workbook (.xlsx)** — "One sheet per table" | The reply has a Markdown table (`hasMdTable`) | Every table, one sheet each. |
| **PowerPoint deck (.pptx)** — "One slide per ## heading, speaker notes from Notes:" | The reply has a `## ` heading (`hasMdSlides`) | A deck built from the outline. |
| **Markdown (.md)** — "The reply as plain text with its formatting marks" | Always | The reply text as written, UTF-8. |

## Behaviour (as implemented)
- `POST /api/export` `{ conversationId, messageId, format }` accepts only `docx`, `xlsx`, `pptx` and `md` ("Choose
  Word, Excel, PowerPoint or Markdown."). A missing chat or reply is refused.
- A trailing "Suggested next step:" line is removed first (`stripSuggestion`): it is a prompt for the chat, not part of
  the deliverable.
- **File name and place**: `<notebook>/Exports/<chat title> - YYYY-MM-DD.<ext>`; the title has `<>:"/\|?*` and control
  characters replaced by `_`, trailing dots/spaces removed, and is cut to 80 characters (`Lumen reply` if empty). An
  existing name gets ` (2)`, ` (3)`…; files are written with `wx`, so nothing is overwritten.
- **Markdown**: the reply text exactly as the AI wrote it (after the suggestion line is removed), trimmed, with one
  final newline; no title is added.
- **Word** (`markdownToDocx`): built-in styles, no Word installation needed. The chat title becomes the Title
  paragraph; headings, bold/italic/strikethrough, inline code, nested bulleted and numbered lists, tables with a
  header row, code blocks, quotes and rules are kept; `http(s)`/`mailto` links become real hyperlinks.
- **Excel** (`markdownTablesToXlsx`): one sheet per table in reply order, named from the nearest heading above it
  (invalid characters removed, ≤ 31 characters, made unique with ` (2)`; `Table N` when there is no heading). Cells
  that look like numbers, money (`$ € £`, thousands separators, negatives in brackets), percentages or dates (ISO or
  with a month name) become real values, and a column whose cells share one kind gets a matching number format. A
  cell starting with `=` stays text, never a formula. A reply without tables is refused ("This reply has no tables").
- **PowerPoint** (`toPptx`, built-in design): a `# ` heading is the title slide (the first paragraph after it is the
  subtitle), otherwise the chat title is used; each `## ` heading is one slide with bullets (nested levels), numbered
  lists, paragraphs and real tables. Text from a "Notes:" (also "**Notes:**", "Speaker notes:", "> Notes:") paragraph to
  the next heading becomes speaker notes. A slide with more than 8 paragraphs or a table with too many rows continues
  on "<title> (cont.)" slides, repeating the table header. No PowerPoint installation needed.
- The saved path is added to the reply's files, so a file card ("Saved to your project folder · Click to open")
  appears and survives a reload; the toast says "Saved <name> to your folder". If a reply in that chat is still
  running, the card shows now but is not stored.

## Outputs
- A `.docx`, `.xlsx` or `.pptx` in the notebook's `Exports/` folder, with a file card under the reply.

## Acceptance criteria
- Word output without a template uses the built-in Title and Heading styles and is a valid package
  (`test/md-export.test.js` › the built-in output still works without a template).
- An outline becomes a title slide, one slide per `##`, a real table and speaker notes kept off the slide
  (`test/pptx.test.js` › a deck outline becomes a title slide, one slide per ##, a real table and speaker notes).
- Without a `# ` title the deck uses the chat title, and without notes there is no notes master
  (`test/pptx.test.js` › without notes there is no notes master; a missing title falls back to the option).
- A long table continues on "(cont.)" slides with its header repeated (`test/pptx.test.js` › a long table continues
  on (cont.) slides with its header repeated).
- Exporting the same reply twice on one day gives `<title> - <date>.docx` and `<title> - <date> (2).docx`.
- A Markdown export holds the reply text and is numbered like the others on a second export; an unknown format is
  refused with "Choose Word, Excel, PowerPoint or Markdown." (checked by hand against the running app; no automated test).
- The Excel item is not offered for a reply without a table; the PowerPoint item is not offered without a `##` heading.
- `$12,000`, `15%` and `2026-11-07` in a table land in Excel as currency, percent and date values.

## Limits
- Reply exports always use Lumen's built-in look; program templates apply only to drafts saved by agents
  ([36](36-save-in-program-templates.md)).
- Images are not embedded: Word shows `[alt] (url)`, PowerPoint `[alt]`. The server does not check for `##` headings, so a direct API call can produce a
  deck with only a title slide plus an overview slide.

## Source
- `public/app.js`: `assistantInner` (**Export**), `hasMdTable`, `hasMdSlides`, `saveReplyMenu`, `exportReply`.
- `server.js`: `POST /api/export`, `stripSuggestion`.
- `tools/md-export.js`: `markdownToDocx`, `toDocx`, `builtinDocx`, `markdownTablesToXlsx`, `findTables`, `coerceCell`,
  `sheetName`, `hasTable`.
- `tools/pptx.js`: `toPptx`, `parseDeck`, `paginate`, `buildSlides`.
