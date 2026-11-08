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
