# 45 — Compare schemas and canonical models

## Intent
As a data analyst or data architect, I want a source schema reconciled with a target or canonical model, showing which
fields match, which types need a decision and what is left over on each side, so that the mapping starts from evidence
instead of eyeballing two documents.

## Where
- Agent **Mapping Analyst** 🔀.
- Prompt **Compare schemas** (category **Data**).
- The comparison also feeds **Draft the STTM** ([44](44-sttm-and-pipeline-code.md)) and `write_openapi`
  component schemas ([47](47-openapi.md)).

## Inputs & controls
| Control | Effect |
|---|---|
| **Source schema (DDL, JSON Schema or dictionary)** | .sql/.json/.xlsx/.xlsm/.csv |
| **Target or canonical schema** | Same formats (e.g. Silver JSON Schema, Gold DDL). |
| **Source table (optional)** | `sourceEntity`; blank compares every entity's fields. |
| `targetEntity`, `threshold` (tool) | Target table; fuzzy name similarity 0–1 (default 0.55). |

The prompt runs with **Read my files**; it changes no files.

## Behaviour (as implemented)
- **`read_schema`** (`readSchema`) reads:
  - SQL DDL (`.sql`, `.ddl`, `.txt`): CREATE TABLE with NOT NULL, PRIMARY KEY, REFERENCES, CHECK … IN and `--` comments;
  - JSON Schema (`.json`): properties, required, enum, pattern, format, maxLength, `x-references`, and each object in
    `$defs`/`definitions` as its own entity;
  - data dictionary / data model workbooks (`.xlsx`, `.xlsm`, `.csv`): Entity/Table, Field/Column, Type, Required
    (or an inverted Nullable/Optional column), Allowed values, Pattern, Unique/Key, References (`ENTITY.FIELD`),
    Max length, Description, Layer.
  Each field gets a type family (string, integer, decimal, date, timestamp, boolean, binary, unknown) and rules.
  Other formats, a DDL without CREATE TABLE, or a workbook without an Entity column are refused with a plain message.
- **Matching** (`compareSchemas`): exact names first, then normalised (case and punctuation), then fuzzy pairs above the
  threshold, best first. Fuzzy scoring expands abbreviations (DT, CD, AMT, ADDR, TS, UPD, DOB…) and camelCase, then
  takes the higher of word Jaccard and 0.9 × bigram Dice, so `SUBMIT_DT` ↔ `submittedOn` matches.
- **Type check** per match: compatible, widening (integer → decimal, date → timestamp), narrowing (shorter length,
  decimal → integer, timestamp → date), conversion (to or from text, boolean → 0/1), incompatible, or unknown; plus
  "Source allows blanks but the target is required".
- A named entity that doesn't exist is refused and the available entities are listed.
- Read-only. Fuzzy matches are labelled suggestions; the note says to confirm each before an STTM row is approved.

## Outputs
- A summary ("N fields matched (x exact, y by normalized name, z fuzzy), k with a type to check; a source and b target
  fields unmatched").
- A match table (source, target, match, score, type check, note) with the agent's view of each fuzzy match, the
  unmatched source and target fields with a suggested handling (derive, default, not migrated), and the type
  conversions that need a decision.
- Progress steps: "Reading schema <file>", "Comparing <source> with <target>".

## Acceptance criteria
- DDL is parsed with types, NOT NULL, keys, references, CHECK IN and comments (`test/data.test.js` › DDL is parsed:
  types, NOT NULL, keys, references, CHECK IN and comments); JSON Schema and dictionary workbooks are read (› JSON Schema
  and data dictionary workbooks are read); the shared reader still reads the AIDLC data model (› the shared reader still
  reads the AIDLC data model for governance).
- Exact, normalised and fuzzy matches and unmatched fields on both sides are found (› compareSchemas matches exact,
  normalized and fuzzy names and lists unmatched fields on both sides); type compatibility and name similarity behave
  as specified (› type compatibility and name similarity).
- With the real engine the sample matches 9 fields and leaves INTERNAL_NOTE_TXT, channelCode and languageCode unmatched
  (`e2e/real-engine-plans-2.spec.js` › Data: schema comparison matches 9 fields and lists the unmatched ones on both
  sides).

## Limits
- Matching is by field names (and types) only, not by data content or descriptions.
- The YAML/OpenAPI format is not a schema input here (OpenAPI is handled in [47](47-openapi.md)).
- A JSON Schema `$ref` property is not resolved: it gets the type `ref:<Name>` (family unknown), so its type check is
  "unknown".

## Source
`tools/data.js` (`readSchema`, `parseDdl`, `parseJsonSchema`, `readDictionary`, `compareSchemas`, `nameSimilarity`,
`typeFamily`, `typeCompatibility`), `tools/office-mcp.js` (`read_schema`, `compare_schemas`), `tools/governance.js`
(`readDataModel` uses `readSchema`), `defaults/assistants.json` (agent **Mapping Analyst**), `defaults/recipes.json`
(prompt **Compare schemas**), `skills/data-engineering/SKILL.md`, `samples/data/Source DDL - Applications.sql`,
`samples/data/Silver - Canonical Application.schema.json`, `samples/data/Gold - Application model.sql`.
