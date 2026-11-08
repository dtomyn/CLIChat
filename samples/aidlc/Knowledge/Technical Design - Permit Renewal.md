# Online Permit Renewal — Technical Design

Contoso Licensing Agency · Version 1.1 · Owner: Solution Architect (fictional)

**Status:** Approved · Approved by: Solution Architect (fictional) · 2026-10-20

## Components
| Component | Responsibility | Decision |
|---|---|---|
| Existing applicant portal | Renewal journey, EN/FR, WCAG 2.1 AA | Extend |
| Enterprise sign-in | Applicant sign-in | Reuse |
| Case management platform | Permits, renewals, agent work items | Reuse |
| Case management rules engine | Eligibility rules (ADR-001) | Reuse |
| Enterprise payment gateway | Hosted payment page and webhook | Reuse |
| Enterprise notification service | Email notifications | Reuse |
| Enterprise document store | Photos and receipts | Reuse |
| Photo validation | Type, size and capture-date checks | Build |
| Address lookup service | Validates the mailing address on the summary page | Build |

## Photo validation
Photo validation follows ADR-002: the checks run in the browser before upload.

## Endpoints
- POST /renewals — start a renewal
- POST /renewals/{id}/eligibility — run the eligibility check
- POST /renewals/{id}/photo — upload and validate the photo

## Data
| Entity | Attributes used |
|---|---|
| Permit | permitNumber, expiryDate, renewalCount |
| Renewal Application | status, draftExpiresOn |
| Eligibility Decision | reasonCode |
| Renewal Fee | amount |

Notifications record Notification.channel and Notification.language.
