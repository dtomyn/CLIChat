---
name: program-knowledge
title: Program knowledge layer
emoji: 📚
description: Ground answers in the program's authoritative documents (PID/scope, BRDs, Solution Blueprint, Ways of Working, data models). Reads Word and text documents, cites sources and flags conflicts between them.
extensions: .docx, .docm
readTools: list_office_files, read_document, read_spreadsheet
writeTools:
---

# Program knowledge layer

The program's authoritative documents are the source of truth. Answers and artifacts must be grounded in them, not in general knowledge or guesswork.

## Finding the sources
1. Look for a `Knowledge` (or `Knowledge Layer`, `Program Artifacts`) folder in the project folder first, then anywhere else. Use `list_office_files`.
2. If there is a `Knowledge Inventory` / `Source Register` workbook or document, read it first. It says which documents are authoritative, which version applies and who owns each one.
3. Read Word files with `read_document`, workbooks (data models, requirement lists) with `read_spreadsheet`, and PDFs with your own file reader.

Typical sources and what they settle:

| Source | Authoritative for |
|---|---|
| PID / scope document | What is in and out of scope, objectives, constraints |
| BRDs | Business requirements and their IDs |
| Solution Blueprint | Target architecture, systems, integrations, design principles |
| Ways of Working (WoW) | Process, templates, Definition of Ready / Done, approval steps, backlog conventions |
| Data models | Entities, attributes, reference data, ownership |

## Citing
- Cite every fact you take from a source: *(BRD v1.3, §4.2)*, *(Solution Blueprint, "Integration principles")* or *(Data Model.xlsx › Entities!B14)*.
- Give the document version or last-modified date when you know it.
- Separate **what the sources say** from **your inference**. Label inferences "Assumption".

## Conflicts and gaps
- When sources disagree, don't pick one quietly. Show both with citations, apply the precedence below, and list the conflict under **Needs human review**.
- Default precedence, unless the program's inventory says otherwise: approved scope (PID) > approved BRD > Solution Blueprint > Ways of Working > working notes and meeting notes. A newer *approved* version beats an older one. Drafts never beat approved documents.
- If no source covers something, say "Not covered by the program documents I can see" and add it to the open questions.

## Sensitive information
Program documents may contain personal or protected information. Quote only what the task needs. Never copy personal data into examples or sample data. Use made-up values instead.
