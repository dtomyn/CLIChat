# API Standards

Contoso Licensing Agency · Version 2.0 · Owner: Integration Architect (fictional) · Status: Approved by the Design Authority

APIs between program systems go through the Hybrid Integration Platform (HIP). Every new API is described in OpenAPI 3.0 before it is built.

## Rules Lumen checks
| Rule | Value | Why |
|---|---|---|
| Versioning | Every path starts with `/v1/` (major version in the path) | Consumers can pin a version |
| Path naming | kebab-case plural nouns | Consistent URLs |
| Property naming | camelCase | Matches the canonical model |
| Operation IDs | Required and unique, camelCase verbs | Generated clients |
| Error model | `Problem` (RFC 7807: type, title, status, detail, correlationId) | One error format everywhere |
| Error responses | 400, 401 and 500 on every operation | Predictable failures |
| Required headers | `X-Correlation-ID` on every operation | Tracing across HIP |
| Traceability | `x-traces-to` on every operation, with the BR/FD IDs it implements | Requirements coverage |

## Other guidance
- Writes are idempotent: clients send the same X-Correlation-ID when they retry.
- Dates are ISO 8601 (`2026-11-07`, `2026-11-07T09:00:00Z`).
- Protected B data stays in Canadian regions and is only sent over TLS 1.2 or higher.
