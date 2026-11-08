# Interface Control Document: Case API

Contoso Licensing Agency · Draft 0.2 · Owner: Integration Analyst (fictional)

## 1. Purpose and scope
The Case API lets the applicant portal start renewals, run eligibility checks and upload photos in the case management platform (BRD §5, BR-001, BR-002, BR-004).

## 2. Parties
| Role | System | Contact |
|---|---|---|
| Consumer | Existing applicant portal | Portal team |
| Provider | Case management platform | Case management team |

## 3. Protocol
REST over HTTPS, JSON bodies, OpenAPI 3.0 spec `permit-renewal-api.yaml`.

## 4. Integration pattern
TBD

## 5. Message schemas
See the OpenAPI spec: RenewalRequest, Renewal, EligibilityDecision, Photo and Problem.

## 6. Error handling
- TBD

## 7. Security
Bearer token from the enterprise sign-in; Protected B data over TLS 1.2+.

## 8. Service levels
| Measure | Target |
|---|---|
| Availability | TBD |
| Response time (p95) | TBD |
