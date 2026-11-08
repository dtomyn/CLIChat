---
status: superseded
date: 2026-09-20
superseded-by: ADR-003
---
# ADR-002: Validate photos in the applicant portal

## Context and Problem Statement
Uploaded photos must meet the photo standard (type, size, capture date) before the renewal can be submitted.

## Decision Outcome
Chosen option: validate the photo in the browser, inside the existing applicant portal.

### Consequences
- No new component.
- Checks can be bypassed by a modified browser, so the case worker re-checks the photo.
