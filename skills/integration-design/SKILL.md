---
name: integration-design
title: Integration and APIs
emoji: 🔌
description: Interface control documents (ICD) checked against the ICD template (parties, protocol, HIP / ARO P4 or P5 pattern, message schemas, errors, security, SLAs, volumes), and OpenAPI 3.0 specs validated against the program API standards, with a static mock and scaffolding (controller stubs, DTOs, contract tests) traced to BR/FD IDs.
extensions: .yaml, .yml
readTools: list_office_files, read_document, read_spreadsheet, read_schema, validate_openapi, check_icd
writeTools: save_draft_document, write_openapi, generate_api_scaffold
---

# Integration and APIs

Interfaces are agreed on paper before they are built. The tools check structure and completeness; you draft the content from approved sources. **Never invent a volume, an SLA, a pattern choice or a field.** Where the sources don't say, write *Needs input:* and a question.

Lumen does not publish to an API gateway and does not run a mock server. It writes files a person reviews.

## Tools

| Tool | Use it to |
|---|---|
| `check_icd` | Check an ICD against the template sections: purpose and scope, parties, protocol, integration pattern (HIP / ARO P4 or P5), message schemas, error handling, security, service levels and volumes. Returns ok / empty / incomplete / missing per section and a completeness log |
| `validate_openapi` | Check an OpenAPI spec's structure (paths, operations, `$ref`s, response codes, a schema for every body, path parameters, operation IDs) and, with the API standards file, the program rules (`/v1/` versioning, naming, error model, required error responses, required headers, `x-traces-to`). Every finding has a JSON path and a line |
| `write_openapi` | Save a spec you designed (YAML or JSON) and validate it in the same call. `schemas` adds component schemas from DDL, JSON Schema or data dictionary files |
| `generate_api_scaffold` | From a spec with **no errors**: a static mock (example responses per operation and status), controller stubs, DTOs and contract tests in the stack the Solution Blueprint names (dotnet, node or python) |
| `read_schema` | Read the interface's data from a data model, DDL or JSON Schema |
| `save_draft_document` | Save the ICD as Markdown and Word (`word: true`, with `Templates/ICD Template.dotx` when there is one) |

## Drafting an ICD
1. Read the approved requirements (BRD interface section, refined requirements), the technical design, the interface catalogue, the data model or schemas, and `Knowledge/HIP Patterns.md`.
2. Write every template section: **Purpose and scope**, **Parties** (provider and consumer systems), **Protocol**, **Integration pattern** (name ARO P4 or P5 and say why, from the HIP notes), **Message schemas** (fields, types, required, from the schema or the OpenAPI spec), **Error handling** (codes, retries, dead-letter), **Security**, **Service levels** and **Volumes**. Cite the source of each section (document and heading).
3. Save it with `save_draft_document` (`word: true`, the ICD template), then call `check_icd` on the saved Markdown.
4. Finish with the **completeness log**: every section `check_icd` reports as missing, empty or incomplete, exactly as reported, with the question that would close it and who should answer.

## Designing an API
1. Start from the approved requirements and functional design, the interface schemas (`read_schema`) and `Knowledge/API Standards.md`.
2. Write an OpenAPI 3.0 spec: paths with the version prefix, one operation per action with a camelCase `operationId`, the required header parameter, request and response schemas in `components.schemas`, the required error responses using the program error model, and `x-traces-to` on **every** operation with the BR and FD IDs it implements (for example `x-traces-to: [BR-002.1, FD-012]`).
3. Save it with `write_openapi` (with `standards`). If it reports errors, fix them and save again until there are none. Report the warnings you chose to keep.
4. Only then call `generate_api_scaffold` with the spec, the standards and the Solution Blueprint (for the stack). List the files written and remind the person that the stubs return 501 and the contract tests are skipped until each operation is built.

## Reviewing a spec
Call `validate_openapi` with the spec and the standards. Report **every** error and warning with its JSON path and line, grouped as broken references, missing responses, missing schemas, standards and traceability. Suggest the exact fix for each. Don't edit the spec unless asked; if asked, save the fixed copy with `write_openapi`.
