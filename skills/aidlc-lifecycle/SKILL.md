---
name: aidlc-lifecycle
title: AI-assisted delivery lifecycle
emoji: 🧬
description: The staged delivery lifecycle (business requirements → refined requirements → functional design → technical design → epics/features/stories) with shared ID conventions, artifact templates, hand-offs and human approval gates.
extensions:
readTools: list_office_files, read_document
writeTools:
---

# The delivery lifecycle

Work happens in stages. Each stage has its own artifact, and every artifact traces back to the one before it:

| # | Layer | What it says | ID | Owner |
|---|---|---|---|---|
| 1 | **Business requirement** | What the business needs and why, in business language. Comes from BRDs and scope documents | `BR-###` (keep the source ID if the BRD has one) | Business / product owner |
| 2 | **Refined requirement** | One atomic, testable statement derived from a business requirement | `BR-###.#` | Business analyst |
| 3 | **Functional design element** | How the system behaves: screens, process steps, business rules, notifications, reports, data captured | `FD-###` | Functional designer |
| 4 | **Technical design element** | How it is built: components, integrations, data model changes, NFR tactics | `TD-###` | Solution / technical architect |
| 5 | **Epic / Feature / Story** | How delivery is organised and scheduled | `EP-#`, `FT-#.#`, `US-###` | Delivery team |

**Epics, features and stories are not requirements.** They organise delivery. A story *implements* design elements, which *realise* requirements. Never turn a requirement straight into a story and call that the design.

## Rules for every stage
- **Ground everything in program knowledge.** Use the authoritative documents (see the Program knowledge skill) and cite them. If a source is silent, say so and list it as an open question. Don't fill the gap with general knowledge without saying that you did.
- **Never silently reinterpret upstream intent.** If an upstream artifact looks wrong, ambiguous or in conflict, flag it as a question for its owner. Do not change its meaning downstream.
- **Every output item carries trace links** to the IDs it came from (a "Traces to" column). Many-to-many is normal: one requirement can need several design elements, and one design element can serve several requirements.
- **Keep IDs stable.** Don't renumber existing items. New items take the next free number. Removed items are marked *Withdrawn*, not deleted.
- **Mark AI output as a draft.** Status is `Draft (AI)` until a named person approves it. Finish with a short **Needs human review** list: assumptions, conflicts and decisions that need an owner.

## Hand-offs (inputs → outputs)
| Stage | Takes | Produces |
|---|---|---|
| Requirements refinement | BRD / scope text, existing BR list | Refined requirements: ID, statement, type (functional, non-functional, data, rule), acceptance criteria, source citation, open questions |
| Functional design | Approved refined requirements, Solution Blueprint, data model | FD elements: ID, title, type, behaviour description, business rules, data, error and edge cases, traces to `BR-###.#` |
| Technical design | Approved FD elements, Solution Blueprint, data model, standards | TD elements: ID, component, approach, interfaces and integrations, data changes, NFRs, traces to `FD-###` |
| Story writing | Approved FD and TD elements, Ways of Working (Definition of Ready / Done) | Epics, features and stories: "As a… I want… so that…", Given/When/Then criteria, implements `FD-###` / `TD-###` |
| Traceability | Everything above | Coverage, gaps, broken links and change impact. Proposes fixes; never applies them silently |

## Approval gates
Suggest a human check before each hand-off: refined requirements → functional design → technical design → stories. Downstream work should start from **approved** upstream items. If the user asks you to go ahead anyway, label the output "based on unapproved inputs".

## Table layouts (use these columns so the outputs line up in Excel)
- Refined requirements: `Req ID | Parent BR | Statement | Type | Acceptance criteria | Source | Status | Open questions`
- Functional design: `FD ID | Title | Type | Description | Business rules | Traces To | Status`
- Technical design: `TD ID | Component | Approach | Interfaces / data | NFRs | Traces To | Status`
- Backlog: `Item ID | Type | Title | Parent | Description | Acceptance criteria | Implements | Status`
