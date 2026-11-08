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

## Status: implemented (7 Nov 2026)

Shipped: `tools/openapi.js` (`parseYaml`/`toYaml`, `readStandards`, `validateSpec`/`validateOpenApi`, `icdCompleteness`/`checkIcd`, `schemasFromModel`, `writeOpenApi`, `generateScaffold`), MCP tools `validate_openapi` and `check_icd` (read-only) plus `write_openapi` and `generate_api_scaffold` (edit mode) with labels, the `integration-design` skill, the Interface Designer 🔌 and API Designer 🧾 agents, four *Integration* prompts (Draft an ICD, Design an API, Review an OpenAPI spec, Generate API scaffolding), the sample additions and `test/openapi.test.js`.

Deviations from the design:
- **YAML.** No package was added. A small subset parser reads block mappings and sequences, flow `[..]`/`{..}`, quoted and plain scalars, `|`/`>` block text and comments, and records the line of every key, so findings carry a JSON path and a line. Anchors, aliases, tags and multi-document files are refused with a plain message.
- **API standards** are read from the Rule | Value table in `Knowledge/API Standards.md` (or a JSON file): version prefix, path and property naming, operation IDs, error model, required error codes, required headers and `x-traces-to`. Without a standards file only the structure is checked, and a missing error response is a warning rather than an error.
- **Two extra write tools.** The plan listed only the two read-only tools. `write_openapi` saves a spec and validates it in the same call (x-traces-to required; component schemas can be added from `readSchema` files), so the API Designer can loop until there are no errors. `generate_api_scaffold` writes the static mock (`mock/<operationId>.<status>.json` and `mock/index.json`) and the scaffolding (controller or route stubs returning 501, DTOs, skipped contract tests, each with its x-traces-to IDs) for `dotnet`, `node` or `python`. It refuses a spec with errors, and a second run goes to a numbered folder. Java/Spring is not generated.
- **Stack.** The Solution Blueprint sample gained a short *Build stack* section (C# on .NET 8); the tool finds the stack in the Blueprint text, or defaults to C# and says so.
- **ICD Word output** uses `save_draft_document` with a new `Templates/ICD Template.dotx` (from `scripts/make-word-templates.js`). `check_icd` marks a section *empty* when it has only TBD or placeholders, and *incomplete* when the pattern section names no ARO P4/P5 or lines are still marked Needs input.
- **Sample.** `Knowledge/API Standards.md`, `Knowledge/HIP Patterns.md`, a §5 Interfaces section in the BRD, `Integration/permit-renewal-api.yaml` (broken `$ref` to `EligibilityResult`, photo upload without the required 400) and a draft `Integration/ICD - Case API (draft).md` (no volumes; pattern, error handling and service levels TBD). `list_office_files` now lists `.yaml`/`.yml` files.
- **Live-engine checks.** Besides the unit and MCP round-trip tests, the prompts have cases in `e2e/real-engine-plans.spec.js` and `e2e/real-engine-plans-2.spec.js`, which run them against a real engine when `E2E_ENGINE=copilot` or `claude` is set.
