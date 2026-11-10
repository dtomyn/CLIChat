# 36 — Save drafts as Word/PowerPoint in the program templates

## Intent
As a delivery lead, functional designer or change lead, I want approved lifecycle outputs and AI drafts saved as Word
documents and PowerPoint decks in the program's own templates (styles, cover page, headers, footers, slide master),
so that they look like program documents without retyping, and without Word, PowerPoint or Pandoc installed.

## Where
- Lifecycle run page ([34](34-guided-lifecycle-runs.md)), approved stage: **Save as Word (program template)** when the
  stage has a `wordTemplate` (tooltip "Uses Templates/FDD Template.dotx"), else **Save as Word** (tooltip "Uses
  Lumen's built-in Word styles"). A **Saved as Word** dialog shows "<file> · <template>" with **Open**.
- Tool `save_draft_document` ("Saving draft <file>[ with a PowerPoint deck]"), in the write tools of the
  **architecture**, **bilingual**, **change-management**, **data-engineering**, **dev-pack**, **integration-design**,
  **pipeline-readiness**, **release-cutover** and **security-saa** skills; used by prompts such as **Draft the
  runbook**, **Security design document**, **Draft an ICD** and **Draft training materials**.

## Inputs & controls
| Control | Effect |
|---|---|
| Stage `wordTemplate` (`defaults/pipelines.json`) | `Templates/FDD Template.dotx` (Functional design), `Templates/TDD Template.dotx` (Technical design); relative to the project folder. |
| `path` (`.md`, `.docx` or `.pptx`) | The draft's main format. |
| `word: true` / `powerpoint: true` | Also save a Word copy / a PowerPoint deck of a `.md` draft. |
| `template` | Word template (`.dotx/.docx`); a `.potx/.pptx` here is used as the deck template. |
| `deckTemplate` | PowerPoint template (`.potx/.pptx`). |
| `label` | Top line; default "Draft (AI) for review" ("Machine-drafted, needs translator review" for French). |
| `sources` | Listed under **Sources** at the end (a Sources slide in a deck). |
| `title` | Document or deck title when the Markdown has no leading `# Heading`. |

## Behaviour (as implemented)
- **Word with a template** (`toDocx`): the template's styles, numbering, headers, footers, theme and cover page are
  kept; Markdown maps to its styles by name (Title, Heading 1–4, List Bullet/Number, Quote, Code, Table Grid,
  Caption), and styles it lacks are added from the built-in set. The body replaces a `{{content}}` paragraph, else
  follows the template's own content. `{{title}}`, `{{version}}`, `{{date}}`, `{{approver}}` placeholders (also when
  Word split them across runs) and content controls tagged or titled with those names are filled, in the body,
  headers and footers. A `.dotx` becomes a normal document.
- A missing, non-Word, macro-enabled or unreadable template falls back to Lumen's built-in styles with a warning.
- **Approved stage → Word** (`/api/runs/<id>/stages/<stage>/word`): only for `approved` stages (409 otherwise); the
  template must be inside the project folder. The approval stamp line is removed from the body and moved to the
  fields: title `<run>: <stage>`, version `<n>.0` (approval count), date (approval date), approver. Custom properties
  `Version`, `Approver`, `Approved at`, `Source`. Saved next to the Markdown as `<output>.docx`, overwriting it; if the
  file is open in Word: "Close <file> in Word and try again."
- **Drafts** (`save_draft_document` → `saveDraft`): needs **Create & edit files**; the path must be inside the project
  folder. Never overwrites: an existing name gets ` (2)`, ` (3)`… The label is a quote line at the top and the
  `Status` custom property. A draft starting with `# Heading` uses it as the Word title (not repeated without a
  template). Warns when nothing cites a source.
- **PowerPoint** (`toPptx`): `# Title` is the title slide (next paragraph the subtitle, then the label in italics),
  each `##` a slide with bullets (nested), numbered lists, paragraphs and real tables; a paragraph starting `Notes:`
  (or `**Notes:**`, `Speaker notes:`, `> Notes:`) up to the next heading becomes speaker notes. Over 8 paragraphs, or
  more table rows than fit, continues on "<title> (cont.)" slides with the table header repeated. With a template the
  slide master, theme, layouts, fonts, footer and logo are kept, its own slides dropped, and text goes into its
  "Title Slide" and "Title and Content" placeholders. With no `deckTemplate`, the project's `Templates/` folder is
  searched for `…deck template.potx`, then `…template.potx`, then any `.potx`.

## Outputs
- `Lifecycle/<run>/02-functional-design.docx` (etc.) with the cover filled and a footer such as "Version 1.0 ·
  Approved by <name>".
- Draft `.md`, `.docx` and/or `.pptx` files; the tool result lists `saved`, `word`, `powerpoint`, the deck's slide and
  speaker-note counts and template, and warnings.

## Acceptance criteria
- `e2e/lifecycle-word.spec.js` › approved Functional design saves as Word with the program template (cover title,
  approver, date filled, no `{{` left, footer, template styles, `Version`/`Approver` properties); › a stage without a
  template saves with the built-in styles; › stages that are not approved do not offer Save as Word.
- `test/md-export.test.js` › a template keeps its styles, header, footer and cover page, and fills the placeholders;
  › styles a template lacks fall back to the built-in definitions; › a template with differently named style IDs is
  matched by style name; › a missing or unreadable template falls back to the built-in styles with a warning;
  › placeholders split across runs and unknown placeholders; › custom document properties are written and can be
  read back; › the built-in output still works without a template.
- `test/pptx.test.js` › a deck outline becomes a title slide, one slide per ##, a real table and speaker notes; › a
  template keeps its master, theme, layouts and footer, and its own slides are dropped; › a long table continues on
  (cont.) slides with its header repeated; › saveDraft saves a PowerPoint deck in the project deck template, with the
  label and a Sources slide; › a missing or wrong template falls back to the built-in design with a warning.
- `e2e/real-engine-plans-2.spec.js` › Change: the training deck is saved as PowerPoint in the program deck template,
  with speaker notes; › Release: the runbook is saved as Word in the program runbook template.

## Decisions
- No Pandoc: `md-export.js` does what Pandoc's `--reference-doc` does (`docs/plans/18-document-templates-publishing.md`).
- A draft saved in the runbook template has no `{{version}}`, `{{date}}` or `{{approver}}` left (`test/change.test.js` ›
  saveDraft fills the Word template version, date and approver so no {{placeholder}} is left).

## Limits
- A draft's `{{version}}` is **Draft** and its `{{approver}}` **Not yet approved** unless the person gives them; the
  approved lifecycle stage export is the place for the real approver.
- Only `.potx` files are found automatically as deck templates; a `.pptx` template must be named.
- The stage template is set per pipeline in `data/pipelines.json`; there is no UI to change it.
- Reply **Save as** Word/PowerPoint ([12](12-export-a-reply.md)) uses the built-in styles, not the templates.
- Publishing snapshots and freshness are in [58](58-knowledge-publishing.md).

## Source
`tools/md-export.js` (`toDocx`, `templateDocx`, `builtinDocx`, `fillFields`, `openTemplate`, `setCustomProperties`,
`readDocxProperties`), `tools/pptx.js` (`toPptx`, `parseDeck`, `buildSlides`, `openTemplate`, `dropSlides`),
`tools/change.js` (`saveDraft`, `findDeckTemplate`, `freeName`), `tools/office-mcp.js` (`save_draft_document`),
`lib/server/lifecycle.js` (stage action `word`, `stageWordTemplate`), `public/js/runs.js` (`renderRun`, `data-run-word`),
`defaults/pipelines.json`, `samples/aidlc/Templates/`, `samples/change/Templates/Training Deck Template.potx`.
