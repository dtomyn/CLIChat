---
name: change-management
title: Change impacts & training
emoji: 🔄
description: Turn stakeholder interviews into quote-backed change impacts for approval, consolidate Change Impact Assessments (CIA) into a heat map and a Training Needs Analysis (TNA) with training actions for Azure DevOps, and draft role-based training material that cites its approved sources.
extensions:
readTools: list_office_files, read_transcript, read_spreadsheet, read_document
writeTools: propose_change_impacts, apply_change_impacts, consolidate_cia, save_draft_document, create_spreadsheet
---

# Change impacts, CIA, TNA and training

An interview is **evidence, not truth**. Propose impacts a change lead can approve quickly, and never change a CIA yourself.

## Tools

| Tool | Use it to |
|---|---|
| `read_transcript` | Read an interview as numbered, timestamped turns with speakers |
| `read_spreadsheet` | Read the CIA first, so you don't propose an impact that is already there |
| `propose_change_impacts` | Save "<CIA> (proposed).xlsx" with the new impacts highlighted and a "Proposed changes" sheet with an *Approve? (Yes/No)* column. Impacts whose quote can't be found are rejected |
| `apply_change_impacts` | After the person has marked every row, write only the approved impacts to "<CIA> (updated).xlsx" |
| `consolidate_cia` | Merge several CIAs: duplicates merged, Rejected impacts left out, heat map, TNA and "Training actions - ADO import.xlsx" |
| `save_draft_document` | Save training material as Markdown, Word and/or PowerPoint (`powerpoint: true` turns a deck outline into a .pptx in the program deck template), labelled as a draft with its sources listed |

## Interview → impacts
1. Read the CIA (if there is one), then each transcript.
2. An impact is a change in what a group of people **does**: a new tool, a changed step, a new approval, a different hand-off. Opinions and worries are not impacts. Note them as risks for the change lead.
3. For each impact give the stakeholder group, roles (only if named), business process, the change in one sentence, and a level:
   - **H**: new skills or a new way of working for most of the group;
   - **M**: changed steps or tools;
   - **L**: awareness only.
4. Every impact needs `evidence.quote`: **at least 4 consecutive words copied exactly from the transcript.** Never paraphrase inside the quote.
5. Don't invent headcounts, roles or dates.

Reply with a table (ID, group, process, change, level, who said it and when), what was rejected and why, and how to approve.

## Consolidation and TNA
- Call `consolidate_cia` on every CIA workbook, with the role list when there is one. Report the duplicates merged (and which level was kept), the heat map (group × H/M/L) and the training needs by priority.
- Impacts still *Proposed* are in the heat map but not in the TNA. Say how many are waiting for approval.
- The training actions workbook is in the Azure DevOps import layout. Someone imports it, or the Azure DevOps tools propose the items. Lumen never creates them by itself.

## Training products
- Work only from **approved** impacts and TNA rows, and the approved process documents.
- Per role: a deck outline (one `##` per slide with 3–5 bullets and speaker notes), a one-page job aid (numbered steps for the new way of working), an FAQ (8–12 questions) and a knowledge check (5–10 multiple-choice questions with the answer and why).
- **Every section ends with `Source:`** and the CIA/TNA cell or document heading it comes from. Leave out anything you can't source.
- Save with `save_draft_document` (use `word: true` for a Word copy). Everything is a draft for the change lead to review.

### The deck outline becomes a PowerPoint deck
Save the deck outline with `powerpoint: true` (and `word: true` if a Word copy is wanted too). Lumen writes `<name>.pptx` next to the Markdown, in the program's deck template (`Templates/… Deck Template.potx` in the project, or `deckTemplate`), else in a plain built-in design. Write the outline in this shape:

```markdown
# Processing officers: the new review process
Training for processing officers · 30 minutes

## Why the review is changing
- Applications are reviewed on screen, not on paper
  - Eligibility flags are set automatically
- Overrides need a supervisor's approval

Source: CIA - consolidated.xlsx › TNA!A2

Notes: Open with a renewal that waited three weeks for a paper file. Ask who has tried the new screen.
```

- `# Title` is the title slide; the first line under it is the subtitle. The draft label goes on the title slide by itself.
- Each `##` is one slide: bullets (sub-bullets indented two spaces), numbered steps, short paragraphs, or a small table.
- **Speaker notes:** a line starting `Notes:` (bold or in a `>` quote is fine). Everything from there to the next heading goes into the notes, not on the slide. Put `Source:` before `Notes:` so the source stays on the slide.
- Keep to 3–5 bullets. A slide with more than 8 lines, or a long table, continues on a "(cont.)" slide.
- The sources you pass are listed on a final "Sources" slide.
