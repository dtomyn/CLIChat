# ADR-001: Run eligibility rules in the case management rules engine

## Status
Accepted (2026-09-12, Design Authority)

## Context
Renewal eligibility (expiry window, enforcement holds) must be checked before payment. The rules change a few times a year and the case management platform already holds permits and holds.

## Decision
We will run the eligibility rules in the case management rules engine and expose them to the portal through the Case API. No separate rules service will be built.

## Consequences
- Rule changes follow the case management release cycle.
- The Eligibility service in the TDD is a thin API over the rules engine.
