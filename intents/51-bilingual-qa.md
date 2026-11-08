# 51 — Draft French versions and run bilingual QA

## Intent
As a bilingual editor or communications lead, I want a French draft of an approved English document that follows the
program's EN/FR glossary, and a check of any English/French pair for terminology, untranslated English, differing
numbers and missing paragraphs, so that translators start from a consistent draft and errors are caught before
publishing.

## Where
- Agent **Bilingual Reviewer** 🍁.
- Prompts **Draft French version** and **Bilingual QA** (category **Change & training**).

## Inputs & controls
| Prompt | Fields | Access |
|---|---|---|
| Draft French version | **Approved English document** (.docx/.md/.txt); **EN/FR glossary** (.xlsx/.xlsm/.csv) | Create & edit files |
| Bilingual QA | **English document**; **French document**; **EN/FR glossary** | Read my files |

`check_terminology` takes `english`, `french` and an optional `glossary`.

## Behaviour (as implemented)
- **Glossary** (`readGlossary`): the first sheet with an English column (English / Anglais / EN) and a French column
  (French / Français / FR); optional **Do not translate** (or *Ne pas traduire* / *Keep*) and Notes columns. Several
  French terms can be separated by `;`, `|` or ` / `. A term whose French equals the English is kept as is. Terms are
  checked longest first. A workbook without both columns is refused.
- **Drafting** (agent): same headings and paragraphs in the same order, the glossary's French term every time,
  do-not-translate terms kept, numbers, dates, amounts and IDs copied exactly in French format, plain inclusive Canadian
  French. Saved with `save_draft_document` next to the English as `<name> (FR draft).docx`, label **Machine-drafted,
  needs translator review**, sources = the English document; never overwrites. Then `check_terminology` runs on the pair
  and the agent fixes and saves again if needed.
- **Check** (`checkTerminology`, read-only): both documents are split into paragraphs (blank-line blocks; headings and
  quote markers stripped) and aligned with a Needleman–Wunsch pass scoring shared numbers, IDs and glossary terms plus a
  length ratio (French ~15% longer), so one missing paragraph doesn't shift the rest. Findings:
  - **terminology**: a glossary term in the English paragraph whose approved French term is missing (or a
    do-not-translate term that was changed);
  - **untranslated**: a glossary term left in English, or two or more English function words (the, and, with, your…);
  - **numbers**: numbers, dates (ISO and EN/FR month names), amounts and capitalised IDs (`BR-002`, `IMM 5444`) that
    differ, normalised per language so `$1,250.50` equals `1 250,50 $`;
  - **missing**: a paragraph with no counterpart on either side.
- The draft label and the Sources list added by `save_draft_document` are not reported as missing paragraphs.
- Each finding has EN and FR paragraph numbers, excerpts (≤ 200 characters) and, for terms, the expected French and the
  glossary cell.
- Neither document is changed; the result notes that a translator still reviews the French.

## Outputs
- Draft: the saved file name, the check's headline and terms the translator should look at.
- QA: the headline (`N findings: a terminology, b untranslated English, c number/date/ID, d missing paragraphs` or
  "No differences found.") and a table (Type · EN ¶ · FR ¶ · What differs · Suggested fix) ordered missing paragraphs,
  numbers/dates/IDs, terminology, untranslated English.
- Progress step: "Checking <French> against <English>".

## Acceptance criteria
- The sample glossary has 30 terms, longest first, with a do-not-translate term (`test/glossary.test.js` › the sample
  glossary has 30 terms, longest first, with a do-not-translate term).
- QA finds exactly the three seeded issues (requête vs demande de renouvellement, 30 vs 60 days, the missing refund
  paragraph) and changes nothing (› bilingual QA finds exactly the three seeded issues in the sample pair, and changes
  nothing).
- Numbers, amounts, dates and IDs compare across language formats (› numbers, amounts, dates and IDs are compared in
  each language format); untranslated English, kept terms and missing paragraphs on either side are found
  (› untranslated English, kept terms and missing paragraphs on either side); glossaries need both columns (› glossary
  sheets need English and French columns).
- A French draft saved by `save_draft_document` is checked without its label and sources (› a French draft saved by
  save_draft_document is checked without its label and sources, and its title appears once).
- With the real engine (`e2e/real-engine-plans.spec.js` › Change & training: bilingual QA finds the term, the number and
  the missing paragraph; `e2e/real-engine-plans-2.spec.js` › Change: the French draft is saved for translator review and
  checked against the glossary).

## Limits
- A machine check, not a translation review; certified translation is out of scope.
- Grammar, tone and meaning are not checked; only glossary terms, function words, numbers/IDs and paragraph presence.
- IDs must be in capitals to be compared; lower-case codes are treated as plain numbers.
- Documents must be .docx, .md or .txt.

## Source
`tools/glossary.js` (`readGlossary`, `readText`, `paragraphs`, `anchors`, `align`, `compare`, `checkTerminology`),
`tools/change.js` (`saveDraft`), `tools/office-mcp.js` (`check_terminology`, `save_draft_document`),
`lib/tool-labels.js`, `defaults/assistants.json` (agent **Bilingual Reviewer**), `defaults/recipes.json` (prompts
**Draft French version**, **Bilingual QA**), `skills/bilingual/SKILL.md`, `samples/change/EN-FR Glossary.xlsx`,
`samples/change/Renewal guide (EN).docx`, `samples/change/Guide de renouvellement (FR).docx`.
