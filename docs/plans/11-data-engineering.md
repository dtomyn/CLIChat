# Plan 11: Data engineering

**Use cases:** 13 Data profiling · 14 Source-to-target mapping (STTM) · 15 ETL assets · 18 Schema and canonical-model reconciliation
**Size:** large (three sessions)
**Files:** new `tools/data.js`, new `skills/data-engineering/SKILL.md`, `tools/office-mcp.js`, `lib/skills.js`, `lib/tool-labels.js`, `defaults/assistants.json`, `defaults/recipes.json`, new `scripts/make-data-sample.js`, new `samples/data/`, `test/data.test.js`

## Why

The catalogue asks for profiling GCMS/FOSS/CAIPS data, STTMs across Bronze → Silver/EDR → Gold, and PySpark/ADF assets. Lumen can't reach Fabric (that would need a new connection), but it can work on **extracts and schemas saved in the notebook** (CSV/XLSX samples, DDL, JSON Schema, data dictionaries) and generate the code a data engineer runs in a lower-environment Fabric workspace.

## Design

### 1. `tools/data.js` (pure, unit-tested)
- `profileTable(file, opts)` reads a CSV/XLSX sample (capped at 200k rows). For each column it reports the inferred type, null %, distinct count, min/max, top values, pattern classes (e.g. `AA9999`) and outliers. It also checks dictionary rules (not null, allowed values, regex, FK into another file) and returns violations with example row numbers. **Only aggregates and at most 5 example values per finding leave the tool**, which limits PII exposure.
- `readSchema(file)` parses SQL DDL (`CREATE TABLE`), JSON Schema, or a data-dictionary sheet into `{ entity, fields: [{ name, type, nullable, description }] }`.
- `compareSchemas(source, target)` (UC 18) finds exact, normalized (case/underscore) and fuzzy name matches with type compatibility, plus unmatched fields on both sides.
- `writeSttm(file, rows)` writes the STTM workbook: source entity/field, transformation rule, target layer/entity/field, DQ rule, status (Draft/Approved) and reviewer.
- MCP tools: `profile_data`, `read_schema` and `compare_schemas` (read-only), and `write_sttm` (edit mode).

### 2. Agents and prompts
- **Data Profiler** 📊 profiles tables, writes a DQ findings report, and emits SQL/PySpark profiling scripts to re-run in Fabric.
- **Mapping Analyst** 🔀 runs `compare_schemas` and drafts the STTM. The code supplies the match evidence, and the AI proposes the transformation rules.
- **Data Engineer** 🧱 generates PySpark notebooks / ADF pipeline JSON / SQL for each **approved** STTM row, plus unit tests and a reconciliation query (row counts and checksums per layer). It refuses rows that aren't Approved.
- Prompts (category *Data*): Profile a dataset, Compare schemas, Draft the STTM, Generate pipeline code from the STTM.

### 3. Sample data (`samples/data/`)
A synthetic "Applications" source CSV (bad dates, null mandatory field, orphan FK), source DDL, a Silver canonical JSON Schema, a Gold model, and a data dictionary with rules. Add a home-screen sample button like the AIDLC one.

## Steps
1. Build `readSchema` and `compareSchemas` with tests, then the sample generator.
2. Build `profileTable` with tests (every seeded defect detected), then the tools and labels.
3. Build `writeSttm`, the skill, the three agents and the prompts.
4. Check end to end in the app: profile → compare → STTM → approve two rows → generate code.

## Acceptance checks
- Profiling the sample flags every seeded defect, with row examples.
- The STTM lists unmatched fields on both sides.
- Code is generated only for approved rows.

## Out of scope
Connecting to Fabric/OneLake and running pipelines. Revisit if IT approves a Fabric connector (ask before adding any package or connection).

## Status: implemented (7 Nov 2026)

Shipped: `tools/data.js` (`readSchema`, `compareSchemas`, `profileTable`, `writeSttm`, `readSttm`, `generatePipelineCode`), MCP tools `profile_data`, `read_schema` and `compare_schemas` (read-only) and `write_sttm` and `generate_pipeline_code` (edit mode) with labels, the `data-engineering` skill, the Data Profiler 📊, Mapping Analyst 🔀 and Data Engineer 🧱 agents, four *Data* prompts (Profile a dataset, Compare schemas, Draft the STTM, Generate pipeline code from the STTM), the sample in `samples/data` (from new `scripts/make-data-sample.js`), a **Data sample** button on the home screen, and `test/data.test.js`.

Deviations from the design:
- **`readSchema`** returns `{ entities: [...], entity, fields }`: a DDL file or dictionary often holds several tables, so every entity is listed, and `entity`/`fields` are the first one's. Fields carry a type family and `rules` (required, unique, allowed, pattern, maxLength, references) from NOT NULL, PRIMARY KEY, REFERENCES, CHECK IN, JSON Schema `required`/`enum`/`pattern` or dictionary columns. `governance.js` `readDataModel` now uses it, so `check_consistency` also accepts DDL or JSON Schema data models. It is exported for Plan 12.
- **Profiling** reads CSV with its own small parser (exceljs converts CSV values, which hides bad dates), keeps true file line numbers, and masks example values in columns that look personal (by header or email-like values), on top of the 5-example cap. Foreign keys are checked against an extract named after the referenced entity next to the file, or one given in `lookups`. Profiling scripts are returned with `scripts: true` and saved in the DQ report through `save_draft_document`, so no extra write tool was needed.
- **Fuzzy matching** expands common abbreviations (DT, CD, AMT, ADDR, TS, UPD…) before comparing words, so `SUBMIT_DT` → `submittedOn` scores as a strong fuzzy match. Matches stay labelled *fuzzy* for the analyst to confirm.
- **`write_sttm`** always saves rows as Draft with no reviewer (an AI-supplied status is ignored and reported), so only a person approves. The STTM has an ID, source/target types and a Match column besides the planned fields. There is no `(proposed)`/apply step: the STTM is a new workbook and approval happens in it.
- **Code generation** is a new tool, `generate_pipeline_code`, so "approved rows only" is enforced in code rather than by the agent. Plain-word rules (direct, trim, upper/lower, parse date with a format, cast, default, constant, `expr:`/`sql:`) are translated; anything else is mapped directly and listed as a TODO. ADF output targets a Fabric notebook activity with placeholder IDs.
- **Not verified in the running app.** Step 4 (profile → compare → STTM → approve two rows → generate code) is covered by unit and MCP round-trip tests, not by running the prompts with the AI engine.
