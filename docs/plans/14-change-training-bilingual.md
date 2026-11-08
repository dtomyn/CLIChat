# Plan 14: Change, training and bilingual content

**Use cases:** 24 Interview summaries and change impacts · 25 Consolidated CIA and TNA · 26 Training products · 32 French drafts and bilingual QA
**Size:** medium (two sessions)
**Files:** new `tools/change.js`, new `tools/glossary.js`, new `skills/change-management/SKILL.md`, new `skills/bilingual/SKILL.md`, `tools/office-mcp.js`, `lib/skills.js`, `defaults/assistants.json`, `defaults/recipes.json`, new `scripts/make-change-sample.js`, `test/change.test.js`, `test/glossary.test.js`

## Why

Change teams turn interviews into impacts, impacts into a Change Impact Assessment (CIA) and Training Needs Analysis (TNA), and those into training material, in both official languages. The huddle → RAID flow already shows how to get quote-backed proposals from a transcript (`read_transcript` plus a verbatim-quote check), so we reuse it.

## Design

### 1. Interviews → impacts (UC 24)
- Generalize the quote verification in `tools/raid.js` into a shared helper (`verifyQuotes(transcript, proposals)`).
- `tools/change.js` → `proposeImpacts(transcript, cia)` validates AI-proposed impacts (stakeholder group, process, change description, impact level H/M/L, quote, speaker, time) and writes a `(proposed)` CIA workbook with an Approve column. Unverified quotes are rejected, as in RAID.

### 2. CIA and TNA consolidation (UC 25)
- `consolidateCia(files)` merges several CIA workbooks/sheets. It de-duplicates impacts (same group + process + similar text), rolls up heat-map counts by group × impact level, and derives TNA rows (group, role, skill gap, training type, priority) from the approved impacts. It writes `CIA - consolidated.xlsx` with a heat-map sheet.
- Training actions are written as an ADO-import workbook (Plan 08 pushes them later).

### 3. Training products (UC 26)
- **Training Content** agent: role-based deck outlines (Markdown → `.pptx` through the existing pptx approach, or Markdown → Word via `md-export`), job aids, FAQs and knowledge checks. Each item cites its approved source section.

### 4. Bilingual (UC 32)
- `tools/glossary.js` → `checkTerminology(en, fr, glossary)` reads an EN/FR terminology sheet. It flags glossary terms translated inconsistently, untranslated English left in French text, numbers/dates/IDs that differ between versions, and missing segments (paragraph-count alignment).
- **Bilingual Reviewer** agent: drafts French from approved English using the IRCC glossary, then runs the check and reports QA findings. Output is labelled *machine-drafted, needs translator review*.

### 5. Agents and prompts
Change Impact Analyst 🔄, Training Content 🎓, Bilingual Reviewer 🍁. Prompts (category *Change & training*): Interview → change impacts, Consolidate the CIA, Training needs analysis, Draft training materials, Draft French version, Bilingual QA.

### 6. Sample data
Two interview transcripts (`.vtt`), a CIA template, a role list, a 30-term EN/FR glossary, and an EN/FR document pair with three seeded inconsistencies.

## Acceptance checks
- Impacts with invented quotes are rejected.
- Consolidation merges the seeded duplicate.
- Bilingual QA finds all three seeded issues.
- Originals are never modified.

## Out of scope
Publishing to Teams/SharePoint, and certified translation.

## Status: implemented (7 Nov 2026)

Shipped: `tools/change.js` (`proposeImpacts`, `applyImpacts`, `consolidateCia`, `saveDraft`), `tools/glossary.js` (`readGlossary`, `compare`, `checkTerminology`), the shared `verifyQuotes` helper in `tools/raid.js`, MCP tools `propose_change_impacts`, `apply_change_impacts`, `consolidate_cia`, `check_terminology` and `save_draft_document` with labels, the `change-management` and `bilingual` skills, the Change Impact Analyst 🔄, Training Content 🎓 and Bilingual Reviewer 🍁 agents, six *Change & training* prompts, the `samples/change/` pack from `scripts/make-change-sample.js`, and `test/change.test.js` and `test/glossary.test.js`.

Deviations from the design:
- **`verifyQuotes` lives in `tools/raid.js`**, next to `readTranscript` and `locateQuote`, rather than in a new module. It takes a file, several files or parsed segments, and records which transcript each quote came from. `propose_raid_updates` now uses it too, and its behaviour hasn't changed.
- **Approval round trip.** `propose_change_impacts` adds rows with Status *Proposed* and a *Proposed changes* sheet. A new `apply_change_impacts` tool writes the approved rows to `(updated)` with Status *Approved*, following the RAID pattern. When no CIA workbook is given, the tool creates `Change impacts (proposed).xlsx` from the template columns.
- **Consolidation rules.** Two impacts are duplicates when they share a stakeholder group and process and their descriptions score at least 0.5 on the Jaccard word similarity already used for defects. The higher level is kept. *Rejected* rows are left out. *Proposed* rows count in the heat map but aren't used for the TNA. TNA roles come from the impact, or else from every role in that group in the role list. The training type defaults by level (H instructor-led + job aid, M walkthrough/e-learning + job aid, L communication + quick reference). The outputs are never overwritten: a numbered copy is saved instead.
- **Training products.** A new `save_draft_document` tool saves Markdown and/or Word (through `md-export.toDocx`, with an optional program template). It puts the draft label at the top, lists the sources and warns when nothing is cited. At first there was no `.pptx` writer, so deck outlines were Markdown only.
- **Decks are now PowerPoint (8 Nov 2026).** `tools/pptx.js` (`toPptx`) writes a `.pptx` in-house with `jszip` and `marked`, the same way Word output works, with no new package. Outline convention: `# Title` (and a subtitle line) is the title slide, each `##` is a slide (nested bullets, numbered steps, paragraphs, real tables), and a line starting `Notes:` (also bold or in a `>` quote) starts the speaker notes up to the next heading. Slides with more than 8 lines, and long tables, continue on "(cont.)" slides. With a `.potx`/`.pptx` template the template's master, theme, layouts, footer and logo are kept, its own slides are dropped, and text goes into the *Title Slide* and *Title and Content* layout placeholders. `save_draft_document` takes `powerpoint: true` (or a `.pptx` path) and `deckTemplate`, else the project's `Templates/… Deck Template.potx`; the draft label is on the title slide and the sources on a final *Sources* slide. The *Draft training materials* prompt and the Training Content agent save the deck this way, alongside the Markdown and Word drafts. The sample `samples/change/Templates/Training Deck Template.potx` comes from `scripts/make-deck-template.js`. A reply's **Export** menu also offers *PowerPoint deck (.pptx)* when the reply has `##` headings. Covered by `test/pptx.test.js` and a live Claude case in `e2e/real-engine-plans-2.spec.js`.
- **Bilingual QA.** Paragraphs are aligned with a small Needleman–Wunsch pass that scores shared numbers, IDs and glossary terms plus a length ratio, so a missing paragraph doesn't shift every later comparison. English left in the French covers glossary terms and two or more English function words. Numbers are normalised per language (`$1,250.50` and `1 250,50 $`), and so are EN/FR month names. IDs must be in capitals (`BR-002`, `IMM 5444`).
- **Sample.** The sample has three seeded issues, as planned: a glossary term (*requête* instead of *demande de renouvellement*), 30 vs. 60 days, and a missing refund paragraph. Untranslated English is covered by unit tests. The pack also includes two filled CIA workbooks (with the seeded duplicate, one Rejected and one Proposed impact), because consolidation needs more than the template.
- **`lib/skills.js` needed no change**, because skills are discovered from `skills/<id>/SKILL.md`.
- **Live-engine checks.** Besides the unit and MCP round-trip tests, the prompts have cases in `e2e/real-engine-plans.spec.js` and `e2e/real-engine-plans-2.spec.js`, which run them against a real engine when `E2E_ENGINE=copilot` or `claude` is set.
