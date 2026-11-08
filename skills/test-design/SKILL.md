---
name: test-design
title: Test design & defect triage
emoji: 🧪
description: Design SIT and UAT test cases from acceptance criteria (positive, negative and boundary), check test coverage against requirements and stories, draft the test strategy, and triage defect exports — duplicates, severity–priority mismatches and ageing — with changes proposed for approval.
extensions:
readTools: list_office_files, read_document, read_spreadsheet, analyze_traceability, analyze_defects
writeTools: write_test_cases, propose_defect_changes, create_spreadsheet, update_spreadsheet
---

# Test design and defect triage

Tests prove that what was asked for was built. Every test case traces to the story or requirement it verifies, and every requirement should have at least one test.

## Tools

| Tool | Use it to |
|---|---|
| `analyze_traceability` | **Coverage first.** With a Tests sheet in the traceability workbook it reports requirements with no test, stories with no test and tests tracing to withdrawn items, each with a `Sheet!Cell` reference |
| `read_spreadsheet` / `read_document` | Read stories, acceptance criteria and design rules before writing cases |
| `write_test_cases` | Save cases as an Excel workbook in the Azure DevOps Test Plans import layout, one row per step |
| `analyze_defects` | Triage a defect export: duplicates, severity–priority mismatches, ages, unowned defects. Read-only |
| `propose_defect_changes` | Record agreed triage changes in a `(proposed)` copy with an *Approve? (Yes/No)* column. The export is never changed |

## Designing test cases
1. Read the story's Given/When/Then criteria and the design rules it implements (FD/TD).
2. Write at least one **positive** case per criterion, then **negative** cases (invalid input, missing permission, a failed integration) and **boundary** cases for every limit (for example 90 vs. 91 days, 5 MB vs. 5 MB + 1 byte).
3. Each case: a short title starting with what is verified, type **SIT** (system and integration, run by the test team) or **UAT** (business acceptance, run by business users), priority 1–4, preconditions and test data, then numbered steps, each with one expected result.
4. `tracesTo` lists the story ID and, where useful, the refined requirement (`BR-002.1`). Never invent IDs.
5. Cover bilingual (EN/FR) and accessibility (WCAG 2.1 AA) where the requirement asks for it.
6. Flag criteria that can't be tested as written ("in a timely manner") as testability findings, and suggest a measurable wording.
7. Show the cases as a table first. Save them with `write_test_cases` when the person asks.

## Test strategy
Cover scope and out of scope, test levels (unit, SIT, UAT, performance, accessibility, security), environments (STE → UAT → STG → PRD) and what runs where, entry and exit criteria per level, test data needs (synthetic or masked, never real personal data), defect management (severity definitions, triage cadence), and a **risk-based priority**: requirement risk (business impact × likelihood of failure) × change impact (new, changed or touched by a change). Cite the PID, requirements, plan and RAID log for every statement you take from them.

## Defect triage
- Lead with the summary line, then probable duplicates (keep the older one), severity–priority mismatches, the oldest open defects and those with no owner.
- Every proposal is just that. Show a table (Defect · Field · Now · Proposed · Why) and ask before recording anything. Record agreed changes with `propose_defect_changes`. People make the change in Azure DevOps.
- Never change or delete the original export.
