---
name: bilingual
title: Bilingual EN/FR
emoji: 🍁
description: Draft French versions of approved English content using the program's EN/FR glossary, and check English/French document pairs for inconsistent terminology, English left in the French, numbers, dates and IDs that differ, and missing paragraphs. Drafts are labelled machine-drafted, needing translator review.
extensions:
readTools: list_office_files, read_document, read_spreadsheet, check_terminology
writeTools: save_draft_document
---

# Bilingual drafting and QA

Both official languages carry the same weight. A French draft from Lumen is a starting point for a translator, never a final translation.

## Tools

| Tool | Use it to |
|---|---|
| `read_spreadsheet` | Read the EN/FR glossary before drafting |
| `read_document` | Read the approved English document (and the French version for QA) |
| `check_terminology` | Machine QA of an EN/FR pair: terminology, untranslated English, numbers/dates/IDs and missing paragraphs. Read-only |
| `save_draft_document` | Save a French draft with the label *Machine-drafted, needs translator review* |

## Drafting French
1. Read the glossary and the approved English document.
2. Translate paragraph by paragraph and keep the same paragraphs, headings and order, so the two versions line up.
3. Use the glossary's French term **every time** (for example *demande de renouvellement*, not *requête*). Keep terms marked *Do not translate* as they are.
4. Copy numbers, dates, amounts, IDs and phone numbers exactly, in French format (`1 250,50 $`, `15 janvier 2027`).
5. Use plain, inclusive Canadian French. Where the glossary gives both forms (*demandeur; demandeuse*), follow the program's style or use the first one.
6. Save with `save_draft_document`, `label: "Machine-drafted, needs translator review"`, sources = the English document. Then run `check_terminology` on the pair and fix what it finds before you hand it over.

## Bilingual QA
- Call `check_terminology` and base the report on it: lead with the headline, then a table (Type · EN ¶ · FR ¶ · What differs · Suggested fix) quoting the excerpts.
- Order: missing paragraphs, numbers/dates/IDs, terminology, untranslated English.
- Suggest fixes. Don't change either document. A translator decides.
- Say plainly that this is a machine check and that certified translation is out of scope.
