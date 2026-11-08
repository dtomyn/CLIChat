# Online Permit Renewal — AIDLC sample

Synthetic data for trying Lumen's delivery-lifecycle assistants locally: Requirements Refiner, Functional Designer, Technical Designer, Story Writer, Traceability Analyst, Test Designer, Test Planner and Defect Triage. Everything here is fictional.

| File | What it is |
|---|---|
| **Requirements Traceability (sample).xlsx** | The traceability workbook (TRM): Business Requirements → Refined Requirements → Functional Design → Technical Design → Backlog, Tests (SIT/UAT cases tracing to stories and requirements), plus a Change Log |
| **Defects export.xlsx** | An Azure DevOps defect query export, for **Triage defects** |
| **Knowledge/PID - Online Permit Renewal v1.2.docx** | Scope, objectives and constraints (Word) |
| **Knowledge/BRD - Online Permit Renewal v1.3.docx** | Business requirements BR-001 to BR-008 (Word) |
| **Knowledge/Solution Blueprint - Permit Renewal.md** | Target architecture and principles |
| **Knowledge/Ways of Working - Delivery.md** | Artifact ownership, Definition of Ready/Done, change control |
| **Knowledge/Data Model - Permit Renewal.xlsx** | Entities and attributes |
| **Templates/FDD Template.dotx**, **Templates/TDD Template.dotx** | Program Word templates: styles, cover page, header and footer. Approved Functional and Technical design stages offer **Save as Word (program template)** |

## Built-in scenarios
- **One-to-many and many-to-many links:** BR-002 has three refined requirements, and FD-012 realises all three.
- **A changed requirement:** BR-004 (photo age 12 → 6 months). FD-014, TD-105 and US-104 still say 12 months.
- **A withdrawn requirement still linked:** BR-008 (paper permit) → FD-017 → US-110.
- **Conflicting sources:** BR-007 asks for SMS, but the PID and the Solution Blueprint put SMS out of Release 1.
- **Ambiguity:** BR-005 says "in a timely manner".
- **Traceability defects:** FD-016 links to a requirement that doesn't exist (BR-009.1), US-106 is used twice, US-108 traces straight to BR-003 without a design element, US-109 traces to nothing, and BR-006 (accessibility, bilingual) has no design.
- **Test coverage:** BR-007 (notifications) has no test, TC-011 still tests the withdrawn BR-008, TC-006 was written for the old 12-month photo rule, and US-106, US-108 and US-109 have no test.
- **Defect triage:** 1201/1204 (payment time-outs) and 1203/1206 (PNG photos) are probable duplicates, 1207 is critical but priority 4, and 1203 has no owner. 1210 looks like 1203 but is in a different area.

## Things to try
- *"Inventory the program knowledge in this folder."*
- *"Refine BR-001 to BR-007 from the BRD and check them against the PID."*
- *"Run a traceability check on the traceability workbook."*
- *"BR-004 has changed. What is affected downstream?"*
- *"Write stories for FD-012 and FD-018."*
- **Coverage gaps** on the traceability workbook, **Generate test cases from stories** for US-103, and **Triage defects** on the defect export.

- *"Publish the approved lifecycle outputs to the Design library."* then edit one and run **Knowledge freshness**.

Regenerate with `node scripts/make-aidlc-sample.js` (templates: `node scripts/make-word-templates.js`).
