---
status: accepted
date: 2026-10-14
---
# ADR-003: Photo validation as a server-side service

Supersedes ADR-002.

## Context and Problem Statement
Browser-only checks (ADR-002) can be bypassed, and the photo standard changed (BR-004: 6 months). The enterprise reusable-asset register lists a photo standard checker library.

## Decision Outcome
Chosen option: build a photo validation service called by the portal, using the photo standard checker library. Photos are stored in the enterprise document store only after they pass.

### Consequences
- One new component to run and support.
- The portal keeps a quick browser check for usability only.
