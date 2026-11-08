# 44 — Draft source-to-target mappings and generate pipeline code

## Intent
As a data analyst or data engineer, I want a source-to-target mapping (STTM) drafted from the schemas for a reviewer to
approve, and pipeline code generated only for the approved rows, so that migration code follows signed-off mappings
and nothing unapproved reaches a pipeline.

## Where
- Agents **Mapping Analyst** 🔀 (STTM) and **Data Engineer** 🧱 (code).
- Prompts **Draft the STTM** and **Generate pipeline code from the STTM** (category **Data**).

## Inputs & controls
| Prompt | Fields |
|---|---|
| Draft the STTM | **Source schema**, **Target schema** (.sql/.json/.xlsx/.xlsm/.csv), **Target layer** (e.g. Silver), **Source table (optional)** |
| Generate pipeline code from the STTM | **STTM workbook** (.xlsx/.xlsm), **Target layer (optional)** |

Both run with **Create & edit files**. Tool-only options: `write_sttm` `rows`, `sourceEntity`/`targetEntity`;
`generate_pipeline_code` `entity`, `outDir` (default `Pipelines`), `sourceTables` (lakehouse table per source entity).

## Behaviour (as implemented)
- **Drafting**: the prompt calls `compare_schemas` first (see [45](45-compare-schemas.md)); the agent confirms or rejects
  fuzzy matches by meaning and writes each rule in plain words the generator understands: direct, trim, upper/lower,
  parse date format `'yyyy-MM-dd'`, cast to `decimal(10,2)`, default `'X'`, constant `'X'`, or `expr:` (PySpark) /
  `sql:` (Spark SQL), with a DQ rule where the target is required or has allowed values.
- **`write_sttm`** (`writeSttm`): sheet **STTM** with ID (`STTM-001`…), Source entity/field/type, Transformation rule,
  Target layer (Bronze/Silver/Gold, from synonyms like raw, EDR, curated, mart), Target entity/field/type, Match, DQ
  rule, Status, Reviewer, Notes. The path must be .xlsx.
- **Every row is saved as Draft with no reviewer**: a status or reviewer supplied by the AI is ignored and reported in a
  warning. Status has a list Draft / Approved / Rejected / Not migrated.
- With source and target schemas: match evidence and types are filled in, type issues are noted, every unmatched
  source and target field is added as a **Needs input** row (shaded), and sheets **Unmatched fields** and **Match
  evidence** are added, plus an **About** sheet. Never overwrites (numbered copy).
- **Approval is by a person in the workbook**: Status = Approved and their name in Reviewer.
- **`generate_pipeline_code`** (`generatePipelineCode`) reads the STTM and refuses rows that are not Approved, rows still
  saying Needs input, and rows with no target entity/field; they are listed with the reason and cell. With no Approved
  rows at all it stops with a plain message and writes nothing. An Approved row without a reviewer is a warning.
- For each target layer and table it writes, under `Pipelines/<layer> - <table>/`: `<table>_load.py` (PySpark notebook
  with parameters, one select line per approved row, DQ checks that count failing rows, Delta write), `<table>_load.sql`
  (CREATE TABLE … USING DELTA and INSERT OVERWRITE … SELECT), `pl_<layer>_<table>.json` (Fabric/Data Factory pipeline:
  notebook activity with placeholder IDs, then a reconcile step), `test_<table>_load.py` (pytest with a local Spark
  session) and `<table>_reconciliation.sql` (row counts and `xxhash64` checksums per layer). Source tables default to
  `bronze.<entity>` (`silver.` for Gold). Files are never overwritten.
- Rules it can't translate are mapped directly with a `TODO` and listed; the agent suggests an `expr:`/`sql:` rule for
  the STTM instead of editing generated files, and never changes a row's status.

## Outputs
- The STTM workbook and a summary ("N mapping rows saved as Draft, M marked Needs input…").
- The list of generated files per table, the rows code was generated for, refused rows, TODOs, and how to run it
  (notebook, then the reconciliation query, then the unit tests) in a lower-environment Fabric workspace.
- Progress steps: "Saving N mapping rows to <file>", "Generating pipeline code from the approved rows of <file>".

## Acceptance criteria
- The STTM lists unmatched fields on both sides and every row starts as Draft (`test/data.test.js` › the STTM lists
  unmatched fields on both sides and every row starts as Draft).
- Code is generated only for approved rows (› code is generated only for approved rows); rules become PySpark and SQL
  and unknown ones TODOs (› rules are translated to PySpark and SQL; unknown ones become TODOs).
- Both write tools need edit access (› data tools are exposed; write tools need edit access).
- With the real engine (`e2e/real-engine-plans-2.spec.js` › Data: the STTM is drafted with every row left as Draft and
  the unmatched fields as Needs input; › Data: pipeline code is generated only for the three approved STTM rows).

## Decisions
- "Approved rows only" is enforced in code by a dedicated tool rather than by agent instructions.
- No `(proposed)`/apply step: the STTM is a new workbook and approval happens in it.

## Limits
- No connection to Fabric/OneLake; nothing is run. Pipeline JSON has placeholder notebook and workspace IDs.
- Joins between several source entities are a TODO comment; generated unit tests use a placeholder sample row.
- The SQL form of an `expr:` rule is a TODO.

## Source
`tools/data.js` (`writeSttm`, `readSttm`, `translateRule`, `generatePipelineCode`, `dqPy`, `STTM_COLUMNS`),
`tools/office-mcp.js` (`write_sttm`, `generate_pipeline_code`), `lib/tool-labels.js`, `defaults/assistants.json`
(agents **Mapping Analyst**, **Data Engineer**), `defaults/recipes.json` (prompts **Draft the STTM**, **Generate
pipeline code from the STTM**), `skills/data-engineering/SKILL.md`, `samples/data/`.
