# 47 — Design, review and scaffold an OpenAPI spec

## Intent
As an API designer or developer, I want an OpenAPI 3.0 spec designed from the approved requirements and schemas,
checked against the program API standards, and turned into a static mock and code stubs, so that every operation
traces to a requirement and development starts from a spec with no errors.

## Where
- Agent **API Designer** 🧾.
- Prompts **Design an API**, **Review an OpenAPI spec** and **Generate API scaffolding** (category **Integration**).

## Inputs & controls
| Prompt | Fields | Access |
|---|---|---|
| Design an API | **API**; **Approved requirements and design**; **Schemas or data model (optional)** (.sql/.json/.xlsx); **API standards** (.md/.txt/.docx/.json) | Create & edit files |
| Review an OpenAPI spec | **OpenAPI spec** (.yaml/.yml/.json); **API standards (optional)** | Read my files |
| Generate API scaffolding | **OpenAPI spec**; **Solution Blueprint (for the stack)** (optional); **API standards (optional)** | Create & edit files |

Tool-only options: `validate_openapi` `requireTraces`; `generate_api_scaffold` `stack` (dotnet, node, python or words
like "C# on .NET 8") and `outDir`.

## Behaviour (as implemented)
- **YAML**: an in-house subset parser (block mappings and sequences, flow `[..]`/`{..}`, quoted/plain scalars, `|`/`>`
  text, comments) that records the line of every key. Anchors, aliases, tags and multi-document files are refused; a
  file that can't be read is reported as one error with its line.
- **Structure checks** (`validateSpec`): `openapi` 3.0.x (Swagger 2 is an error, other 3.x a warning), `info` title and
  version, at least one path, every local `$ref` resolves (external refs are a warning), paths start with `/`, path
  parameters declared and `required: true` (and no extra ones), parameters have name and `in`, request and response
  bodies have a schema, valid response codes with a 2xx, unique operationIds, a body on GET/DELETE/HEAD is a warning.
- **Standards** (`readStandards`): the Rule | Value table of e.g. `Knowledge/API Standards.md`, a Word file, or JSON.
  Checked: version prefix (`/v1/`), path and property naming case, operationId required, the error model on every
  4xx/5xx/default response and its definition in `components.schemas`, the required error codes, required headers
  (e.g. `X-Correlation-ID`), and `x-traces-to` on every operation (non-BR/FD IDs are a warning). Without standards a
  missing error response is a warning and only the structure is checked.
- Every finding has a severity, JSON path (`$.paths['/v1/x'].post.responses`) and a YAML line, plus the rule's source
  line in the standards.
- **`write_openapi`** (`writeOpenApi`): takes the spec as an object or YAML/JSON text, adds `components.schemas` from
  any `schemas` files (via `readSchema`: PascalCase names, camelCase properties, required, enum, pattern, maxLength)
  that are not already there, saves as `.yaml`, `.yml` or `.json`, round-trips the YAML and validates with
  `x-traces-to` required. Never overwrites (numbered copy). The agent saves again until there are no errors.
- **`generate_api_scaffold`** (`generateScaffold`): refuses a spec with errors and writes nothing. Otherwise it writes
  to `<spec folder>/API/<API title>/` (a numbered folder if that one has files): `mock/<operationId>.<status>.json` per
  response with an example body (from example/default/enum/types), `mock/index.json`, and for the stack controller or
  route stubs that return **501**, DTOs from `components.schemas`, and contract tests that are skipped until
  implemented, each carrying the operation's `x-traces-to` IDs. Stacks: C# / ASP.NET Core (xUnit), Node.js / Express
  (node:test), Python / FastAPI (pytest); the stack is read from `stack`, else the Blueprint text, else C# with a note.
- `validate_openapi` is read-only; the Review prompt does not change the spec.

## Outputs
- Review: summary (`N operations: x errors, y warnings; …`) and a findings table grouped as broken references, missing
  responses, missing schemas, standards and traceability, with the fix and whether it is ready for scaffolding.
- Design: the saved spec, operations with their `x-traces-to`, kept warnings and open questions.
- Scaffold: the folder, files, operations with IDs, and next steps (implement each stub, enable its contract test, point
  `API_BASE_URL` at a test environment).
- Progress steps: "Checking the API spec <file> against <standards>", "Saving the API spec <file>", "Generating a mock
  and code stubs from <spec>".

## Acceptance criteria
- The YAML subset reads and round-trips (`test/openapi.test.js` › the YAML subset parser reads mappings, sequences, flow
  values, quotes, block text and comments; › toYaml writes YAML that reads back to the same value).
- Standards are read from the Rule | Value table (› the API standards are read from the Rule | Value table).
- Both seeded flaws in the sample spec are found with JSON paths and lines (› the validator finds both seeded flaws in
  the sample spec, with JSON paths and lines); structural checks hold (› structural checks: path parameters, bodies
  without schemas, duplicates, success responses, Swagger 2).
- A generated spec passes and every operation has `x-traces-to` (› a generated spec passes the validator and every
  operation has x-traces-to); schemas come from a model (› schemasFromModel turns a readSchema result into component
  schemas).
- Scaffolding is refused with errors and generated for a valid spec (› scaffolding is refused for a spec with errors
  and generated for a valid one); write tools need edit access (› integration tools are exposed; write tools need edit
  access).
- With the real engine (`e2e/real-engine-plans.spec.js` › Integration: OpenAPI review finds the broken reference and the
  missing 400; `e2e/real-engine-plans-2.spec.js` › Integration: the notification API spec is saved with no errors and
  traces every operation; › Integration: scaffolding from a spec with no errors is C# with 501 stubs, traced to
  requirements).

## Decisions
- No YAML package was added; a small parser keeps lines for findings.
- Scaffolding is gated on zero validation errors in code, not by the agent.

## Limits
- OpenAPI 3.0 only; no Java/Spring scaffolding.
- No mock server is started and nothing is published to an API gateway; the mock is static JSON.
- External `$ref` files are not checked.

## Source
`tools/openapi.js` (`parseYaml`, `toYaml`, `parseStandards`, `readStandards`, `validateSpec`, `validateOpenApi`,
`schemasFromModel`, `writeOpenApi`, `generateScaffold`, `scaffoldFiles`, `STACKS`), `tools/data.js` (`readSchema`),
`tools/office-mcp.js` (`validate_openapi`, `write_openapi`, `generate_api_scaffold`), `lib/tool-labels.js`,
`defaults/assistants.json` (agent **API Designer**), `defaults/recipes.json` (prompts **Design an API**, **Review an
OpenAPI spec**, **Generate API scaffolding**), `skills/integration-design/SKILL.md`,
`samples/aidlc/Integration/permit-renewal-api.yaml`, `samples/aidlc/Knowledge/API Standards.md`,
`samples/aidlc/Knowledge/Solution Blueprint - Permit Renewal.md`.
