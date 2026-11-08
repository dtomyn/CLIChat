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
