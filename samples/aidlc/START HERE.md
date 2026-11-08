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
| **Knowledge/Technical Design - Permit Renewal.md** | The approved technical design: components, endpoints and the data it uses |
| **Architecture/ADRs/** | Three architecture decision records (ADR-002 is superseded by ADR-003) |
| **Architecture/Design/** | Interface catalogue v1.0 (approved) and v1.1 (draft) |
| **Architecture/Design gate.json** | The design gate definition: required artefacts and approvals |
| **Architecture/Technical Inventory.xlsx**, **Architecture/Reusable assets.xlsx** | The technical catalogue and the reusable-asset register |
| **Architecture/Delivery changes - git log.txt** | `git log --name-only` output, for **Update technical inventory** |
| **Knowledge/API Standards.md**, **Knowledge/HIP Patterns.md** | The program API rules (versioning, naming, error model, headers, traceability) and the HIP integration patterns (ARO P4/P5) |
| **Integration/permit-renewal-api.yaml** | An OpenAPI 3.0 spec for the Case API, for **Review an OpenAPI spec** |
| **Integration/ICD - Case API (draft).md** | A draft interface control document, for **Draft an ICD** |

## Built-in scenarios
- **One-to-many and many-to-many links:** BR-002 has three refined requirements, and FD-012 realises all three.
- **A changed requirement:** BR-004 (photo age 12 → 6 months). FD-014, TD-105 and US-104 still say 12 months.
- **A withdrawn requirement still linked:** BR-008 (paper permit) → FD-017 → US-110.
- **Conflicting sources:** BR-007 asks for SMS, but the PID and the Solution Blueprint put SMS out of Release 1.
- **Ambiguity:** BR-005 says "in a timely manner".
- **Traceability defects:** FD-016 links to a requirement that doesn't exist (BR-009.1), US-106 is used twice, US-108 traces straight to BR-003 without a design element, US-109 traces to nothing, and BR-006 (accessibility, bilingual) has no design.
- **Test coverage:** BR-007 (notifications) has no test, TC-011 still tests the withdrawn BR-008, TC-006 was written for the old 12-month photo rule, and US-106, US-108 and US-109 have no test.
- **Defect triage:** 1201/1204 (payment time-outs) and 1203/1206 (PNG photos) are probable duplicates, 1207 is critical but priority 4, and 1203 has no owner. 1210 looks like 1203 but is in a different area.
- **Architecture:** the TDD names an *Address lookup service* the blueprint never mentions (and the reusable-asset register already has an address lookup API), cites ADR-002 although ADR-003 superseded it, and uses an entity (Renewal Fee) and a field (Permit.renewalCount) the data model doesn't have. For the design gate, the blueprint has no approval, the security assessment is missing, and interface catalogue v1.1 is a newer draft that isn't approved yet. The git log adds a photo validation service, changes the eligibility service and the Case API, and retires the legacy kiosk interface.
- **Integration:** in `permit-renewal-api.yaml` the eligibility response points to a schema that does not exist (`EligibilityResult`; the schema is `EligibilityDecision`), and the photo upload has no 400 error response although the API standards require 400, 401 and 500. The draft Case API ICD has no volumes section, and its integration pattern, error handling and service levels are still TBD.

## Things to try
- *"Inventory the program knowledge in this folder."*
- *"Refine BR-001 to BR-007 from the BRD and check them against the PID."*
- *"Run a traceability check on the traceability workbook."*
- *"BR-004 has changed. What is affected downstream?"*
- *"Write stories for FD-012 and FD-018."*
- **Coverage gaps** on the traceability workbook, **Generate test cases from stories** for US-103, and **Triage defects** on the defect export.

- *"Publish the approved lifecycle outputs to the Design library."* then edit one and run **Knowledge freshness**.
- **Architecture review** on the blueprint and the TDD (with the ADR folder and the data model), **Reuse vs. build assessment** for the address lookup, **Assemble a gate pack** from `Architecture/Design gate.json`, and **Update technical inventory** from the git log.
- **Review an OpenAPI spec** on `Integration/permit-renewal-api.yaml` with `Knowledge/API Standards.md`, **Draft an ICD** for the Case API (or check the draft one), **Design an API** for the notification interface, and **Generate API scaffolding** once a spec has no errors.

Regenerate with `node scripts/make-aidlc-sample.js` (templates: `node scripts/make-word-templates.js`).
