# Ways of Working — Delivery

Contoso Licensing Agency · Version 2.1 · 2026-08-20 · Owner: Delivery Lead (fictional)

## Artifacts and where they live
| Artifact | Lives in | Approved by |
|---|---|---|
| Business requirements (BR-###) | BRD and the Requirements Traceability workbook (TRM) | Business Owner |
| Refined requirements (BR-###.#) | TRM | Business Owner |
| Functional design (FD-###) | TRM + functional design document | Functional Lead |
| Technical design (TD-###) | TRM + technical design document | Solution Architect (Design Authority) |
| Epics, features, stories (EP-#, FT-#.#, US-###) | Azure DevOps (mirrored in TRM "Backlog") | Product Owner |

**Epics, features and stories are delivery containers, not requirements.** Every story must list the FD/TD IDs it implements in the "Implements" field. A story that only references a BR is not Ready.

## Definition of Ready (story)
- Implements at least one approved FD or TD element.
- "As a… I want… so that…" plus 3–6 Given/When/Then acceptance criteria.
- Small enough to finish in one sprint (≤ 8 points).
- Bilingual and accessibility impacts noted.

## Definition of Done (story)
- Acceptance criteria pass in the test environment; accessibility checks pass at AA; EN and FR content reviewed.
- TRM updated (status and links).

## Change control
A changed or withdrawn requirement is logged in the TRM Change Log. All linked design elements and stories are reviewed within 5 business days. AI-generated content is marked "Draft (AI)" until a named approver signs it off.
