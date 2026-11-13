# 50 — Draft training materials (deck, job aid, FAQ)

## Intent
As a change lead or instructional designer, I want role-based training materials drafted from the approved impacts and
training needs, saved as Word documents and a PowerPoint deck in the program template, so that I start from a sourced
draft instead of a blank page.

## Where
- Agent **Training Content** 🎓.
- Prompt **Draft training materials** (category **Change & training**).

## Inputs & controls
| Control | Effect |
|---|---|
| **Consolidated CIA (with TNA)** (.xlsx/.xlsm) | Approved impacts and training needs (from [49](49-change-impacts-and-training-needs.md)). |
| **Role** (text) | e.g. "Processing officer". |
| **Approved process document (optional)** | .docx/.md/.txt |

The prompt runs with **Create & edit files**. `save_draft_document` options: `path` (.md, .docx or .pptx), `markdown`,
`label`, `sources`, `word`, `powerpoint`, `template` (Word), `deckTemplate` (.potx/.pptx), `title`.

## Behaviour (as implemented)
- **Products** (prompt): a deck outline of 8–12 slides (a `#` title with a one-line subtitle, one `##` per slide with
  3–5 bullets, a `Source:` line, then `Notes:` speaker notes), a one-page job aid with numbered steps, an FAQ (8–12
  questions) and a knowledge check (5–10 multiple-choice questions with answers and why). Every section ends with
  `Source:` and the sheet and row or document heading; anything that can't be sourced is left out.
- **Saving** (`saveDraft`): each product under `Training/<role>/` with `word: true`; the deck also with
  `powerpoint: true`. The label (default **Draft (AI) for review**) goes at the top (on the title slide of a deck) and
  the `sources` are listed at the end (a **Sources** slide in a deck). A draft that cites nothing gets a warning.
- **Word** copy via `md-export` `toDocx`, with an optional Word template; a draft starting with its own `# Heading` uses
  it as the title without repeating it.
- **PowerPoint** via `tools/pptx.js` `toPptx`: `#` title slide, one slide per `##` (bullets, numbered steps, tables,
  paragraphs), `Notes:` up to the next heading becomes speaker notes, long slides and tables continue on "(cont.)"
  slides. The template is `deckTemplate`, else a deck template passed as `template`, else the project's
  `Templates/… Deck Template.potx` (any `.potx` there); its master, theme, layouts and footer are kept and its own
  slides dropped. A missing or wrong template falls back to the built-in design with a warning.
- **Never overwrites**: a numbered copy is saved instead. Paths must be inside the project folder; the tool is refused
  without **Create & edit files**.

## Outputs
- The drafts in the reply, then `.md`, `.docx` and (for the deck) `.pptx` files with slide and speaker-notes counts,
  the template used, the label and the number of sources.
- Progress step: "Saving draft <file> with a PowerPoint deck".

## Acceptance criteria
- Drafts are labelled, list sources, get a Word copy and never overwrite (`test/change.test.js` › saveDraft labels the
  draft, lists sources, writes Word and never overwrites).
- A deck outline becomes a title slide, one slide per `##`, real tables and speaker notes (`test/pptx.test.js` › a deck
  outline becomes a title slide, one slide per ##, a real table and speaker notes); a template keeps its master and
  layouts (› a template keeps its master, theme, layouts and footer, and its own slides are dropped); long tables
  continue (› a long table continues on (cont.) slides with its header repeated); a bad template falls back (› a missing
  or wrong template falls back to the built-in design with a warning); `saveDraft` uses the project deck template
  (› saveDraft saves a PowerPoint deck in the project deck template, with the label and a Sources slide).
- With the real engine (`e2e/real-engine-plans-2.spec.js` › Change: training materials for processing officers are saved
  as Word drafts with sources; › Change: the training deck is saved as PowerPoint in the program deck template, with
  speaker notes).

## Limits
- Content quality depends on the model; the code only labels, cites and formats.
- No publishing to Teams, SharePoint or an LMS.
- A slide holds up to 8 paragraphs or about 10 lines before it continues; images are not generated.

## Source
`tools/change.js` (`saveDraft`, `findDeckTemplate`), `tools/pptx.js` (`toPptx`), `tools/md-export.js` (`toDocx`),
`tools/office-mcp.js` (`save_draft_document`), `lib/tool-labels.js`, `agents/<id>.json` (agent **Training
Content**), `defaults/recipes.json` (prompt **Draft training materials**), `skills/change-management/SKILL.md`,
`samples/change/Templates/Training Deck Template.potx`.
