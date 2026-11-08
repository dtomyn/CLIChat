# Plan 12: Integration and APIs

**Use cases:** 16 Interface-control documents (ICD) · 17 OpenAPI specs and scaffolding
**Size:** medium (two sessions)
**Files:** new `tools/openapi.js`, new `skills/integration-design/SKILL.md`, `tools/office-mcp.js`, `lib/skills.js`, `defaults/assistants.json`, `defaults/recipes.json`, `scripts/make-aidlc-sample.js`, `test/openapi.test.js`
**Needs first:** Plan 11's `readSchema` (build it here if Plan 11 hasn't run yet). Plan 18's templates for ICD Word output.

## Design

### 1. `tools/openapi.js` (pure, unit-tested)
- `validateOpenApi(file)` parses JSON, or YAML through a small subset parser. **Ask the owner before adding a YAML package.** It checks structure (paths, operations, `$ref` resolution, response codes, schemas for every body) plus program API standards from a rules file (naming, `/v1/` versioning, error model, required headers), and returns findings with JSON paths.
- `icdCompleteness(markdown)` checks ICD sections against the template list (purpose, parties, protocol, HIP / ARO P4/P5 pattern, message schemas, error handling, security, SLAs, volumes) and returns missing or empty sections.
- MCP tools: `validate_openapi` and `check_icd` (read-only).

### 2. Agents and prompts
- **Interface Designer** 🔌 drafts the ICD from approved requirements, interface schemas and the HIP pattern notes in Knowledge, then runs `check_icd` and lists the gaps as a completeness log.
- **API Designer** 🧾 turns schemas and requirements into an OpenAPI 3.0 spec and runs `validate_openapi` until it reports no errors. It then generates a static mock (example responses) and scaffolding (controller stubs, DTOs, contract tests) in the stack named in the Solution Blueprint. Each operation carries `x-traces-to` with `BR`/`FD` IDs.
- Prompts (category *Integration*): Draft an ICD, Design an API, Review an OpenAPI spec, Generate API scaffolding.

### 3. Sample data
Add `Knowledge/API Standards.md` and `Knowledge/HIP Patterns.md`, an interface section in the BRD, and a flawed `permit-renewal-api.yaml` (a broken `$ref`, a missing error response).

## Acceptance checks
- The validator finds both seeded flaws, with JSON paths.
- A generated spec passes the validator, and every operation has `x-traces-to`.
- The ICD completeness log lists the empty sections.

## Out of scope
Publishing to an API gateway, and running the mock as a server (that would open a port).
