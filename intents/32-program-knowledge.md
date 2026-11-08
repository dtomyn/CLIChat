# 32 — Ground answers in program knowledge documents

## Intent
As a business analyst or delivery lead, I want Lumen to read the program's own documents (PID/scope, BRDs, Solution
Blueprint, Ways of Working, data models) and cite them, so that answers and drafts rest on the authoritative sources
rather than general knowledge, and conflicts between documents are flagged instead of quietly resolved.

## Where
- Skill **Program knowledge layer** 📚 (`program-knowledge`). It is built into 24 agents, including **Requirements
  Refiner**, **Functional Designer**, **Technical Designer**, **Story Writer**, **Traceability Analyst**, the test,
  change, release, architecture, security, data, integration and engineering agents. Attaching a `.docx` or `.docm`
  turns it on in any chat (skill `extensions`).
- Prompt **Inventory the program knowledge** 📚 (category *Delivery lifecycle*, agent **Requirements Refiner**, access
  `read`).
- Tools `list_office_files` ("Looking for documents, workbooks and plans"), `read_document` ("Reading <file>"),
  `read_spreadsheet`, `check_freshness` (see [58](58-knowledge-publishing.md)).

## Inputs & controls
| Control | Effect |
|---|---|
| **Anything to focus on?** (optional text, prompt) | Added to the inventory prompt as "Focus: …". |
| Attached or pinned documents | Read first; see [08](08-attach-and-reference-files.md) and [09](09-pin-files-to-chat.md). |
| `path`, `startAt` (`read_document`) | The file to read, and the character offset to continue a long document from. |

## Behaviour (as implemented)
- **Finding sources** (skill): look for a `Knowledge` (or `Knowledge Layer`, `Program Artifacts`) folder first, then
  anywhere; read a `Knowledge Inventory` / `Source Register` first when there is one.
- `list_office_files` walks the project folder (3 levels deep, skipping dot-folders and `node_modules`) and lists
  `.docx/.docm/.md/.txt/.pdf`, workbooks, plans, `.vtt`, `.yaml/.yml`, `.env`, `.properties` with size and
  last-modified date.
- `read_document` reads Word without Word installed: it unzips `word/document.xml` and returns Markdown-style text
  (Title → `#`, Heading N → `#` × N+1, numbered/bulleted paragraphs as `-` with indent, top-level tables as pipe tables,
  nested tables kept in their cell). Tracked deletions are dropped. `.md`, `.markdown`, `.txt`, `.csv`, `.json`,
  `.yaml`, `.yml` are read as text. A `.doc` is refused ("save it as .docx first"); other types point to
  `read_spreadsheet`, `read_project_plan` or the engine's own reader (PDFs).
- Results start with `Document: <name> (modified <date>, <n> characters)` so answers can cite the version; pages are
  60,000 characters, with a "Call again with startAt" note.
- Paths must be inside the project folder; a missing path is matched by file name anywhere in the folder.
- **Citing** (skill): every fact is cited (*(BRD v1.3, §4.2)*, *(Data Model.xlsx › Entities!B14)*); inferences are
  labelled "Assumption"; gaps say "Not covered by the program documents I can see".
- **Conflicts**: both sides are shown with citations and listed under **Needs human review**. Default precedence:
  approved scope (PID) > approved BRD > Solution Blueprint > Ways of Working > working and meeting notes; a newer
  approved version beats an older one; drafts never beat approved documents.
- Personal or protected information is quoted only as far as the task needs and never copied into sample data.
- Read-only: none of these tools writes.

## Outputs
- Cited answers in the chat.
- The inventory prompt's answer: per document its name, type, version or date, what it is authoritative for and its
  owner, then where documents disagree or overlap, and the gaps.

## Acceptance criteria
- A `.docx` is read with its headings, lists and tables in document order, without Word installed.
- A `.doc` or unsupported file gets a plain-language instruction instead of an error trace.
- A path outside the project folder is refused.
- A document longer than 60,000 characters is returned in pages with the next `startAt`.
- Saved Word drafts read back through `docxToText` (`test/change.test.js`, `test/governance.test.js`); there is no
  dedicated unit test for `read_document`.

## Limits
- PDFs are left to the AI engine's own file reader; images, comments and text boxes in Word files are not extracted.
- Citation, precedence and conflict handling are prompt rules in the skill, not checked by code.
- The AIDLC sample's `Knowledge/` folder (PID and BRD in Word, Blueprint, Ways of Working, Technical Design, API
  Standards and HIP Patterns in Markdown, a data model workbook) is synthetic; install it as in
  [04](04-install-demo-and-samples.md).

## Source
`skills/program-knowledge/SKILL.md`, `tools/docx.js` (`readDocument`, `docxToText`, `unzipEntry`),
`tools/office-mcp.js` (`list_office_files`, `read_document`, `resolveIn`, `walk`), `lib/skills.js` (`resolve`),
`lib/tool-labels.js` (`officeLabel`), `defaults/recipes.json` (prompt **Inventory the program knowledge**,
`aidlc-knowledge-inventory`), `defaults/assistants.json`, `samples/aidlc/Knowledge/`.
