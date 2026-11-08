# Online Permit Renewal — Solution Blueprint

Contoso Licensing Agency · Version 0.9 · 2026-09-18 · Owner: Solution Architect (fictional) · Status: Endorsed by the Design Authority

## Target architecture
| Capability | Platform | Notes |
|---|---|---|
| Applicant portal | Existing applicant portal (web) | Extend with the renewal journey; EN/FR; WCAG 2.1 AA |
| Sign-in | Enterprise sign-in | Applicants must be signed in to renew |
| Case management | Case management platform | System of record for permits, renewals, eligibility decisions and agent work items |
| Rules | Case management rules engine | Eligibility rules live here, exposed by an API |
| Payments | Enterprise payment gateway | Hosted payment page; no card data in our systems |
| Notifications | Enterprise notification service | **Email only today.** SMS channel on the platform roadmap for 2027 |
| Documents | Enterprise document store | Photos and receipts |

## Principles
1. Reuse enterprise platforms; no new point solutions.
2. The case management platform is the single system of record for renewal data.
3. Integrations are API-based and idempotent; no file drops.
4. Protected B data stays in Canadian regions.
5. Every screen is bilingual and accessible from day one.

## Open architecture decisions
- AD-07: Where to run photo validation (portal vs. a new service). Leaning toward a server-side service called by the portal.

## Build stack
New APIs are written in C# on .NET 8 with ASP.NET Core controllers, and contract-tested with xUnit. API specs are OpenAPI 3.0 and follow Knowledge/API Standards.md.
