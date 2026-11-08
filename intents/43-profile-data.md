# 43 — Profile a dataset for quality issues

## Intent
As a data engineer or data analyst, I want a source extract profiled against the data dictionary, with every rule
break counted and located by row, so that data quality problems are fixed at the source or caught in the pipeline
before migration.

## Where
- Agent **Data Profiler** 📊.
- Prompt **Profile a dataset** (category **Data**).
- **Data sample** button on the home screen installs `Permit Applications (data sample)` with the data agents
  (see [04](04-install-demo-and-samples.md)).

## Inputs & controls
| Control | Effect |
|---|---|
| **Data extract** (.csv/.xlsx/.xlsm) | The table to profile; `sheet` picks a worksheet (default the first with data, skipping About/Summary/Notes…). |
| **Data dictionary or schema (optional)** | A dictionary workbook, SQL DDL or JSON Schema with the rules. |
| `entity` (tool) | Dictionary entity for this file (default by file name, else the entity sharing most columns). |
| `lookups` (tool) | Files for foreign keys, e.g. `{ "CLIENTS": "Clients - source extract.csv" }`. |
| `scripts`, `table` (tool) | Also return PySpark and Spark SQL profiling scripts for a lakehouse table (default `bronze.<file>`). |

The prompt runs with **Create & edit files** so it can save the report.

## Behaviour (as implemented)
- **Reading**: CSV with Lumen's own RFC 4180 parser (delimiter guessed, quotes and embedded newlines kept, true line
  numbers); up to **200,000 rows**, beyond that the profile says "first 200,000 only".
- **Per column**: inferred type (integer, decimal, boolean, date, timestamp, text, mixed, empty), nulls and null %,
  distinct count, unique flag, length range, min/max (mean for numbers), top 5 values and top 5 pattern classes
  (`AP-0012345` → `AA-9999999`).
- **Findings** (each with a severity High/Medium/Low, a count and at most **5 example rows**):
  - without a dictionary type: values that don't fit the column's inferred type (bad dates High);
  - outliers beyond 3 × IQR (needs ≥ 10 numbers);
  - with a dictionary: missing column, undocumented column, required blank, type (bad dates/numbers), allowed values,
    pattern, maximum length, unique, foreign key (into an extract named after the referenced entity next to the file,
    or one given in `lookups`).
- **Privacy**: columns that look personal (email, phone, names, birth date, SIN, address, postal code, card…, or
  mostly email-like values) have example values masked (`J******n`), no top values, and no min/max for text.
- Problems the tool can't check (no matching entity, no file for a foreign key, invalid regex) are listed as warnings.
- The agent reports exactly what the tool found, never reads the raw rows to get around the caps, and suggests a fix or
  pipeline DQ rule per High finding.
- **Saving**: the prompt saves `DQ findings - <extract name>.md` with a Word copy through `save_draft_document`, labelled
  **Draft (AI) for review**, with the PySpark and SQL scripts and the extract and dictionary as sources. Never
  overwrites (numbered copy).
- `profile_data` itself is read-only and works in any access mode that can read files.

## Outputs
- Headline counts, a column profile table, a findings table, fixes, and the saved report (.md + .docx).
- With `scripts: true`: a PySpark notebook snippet (per-column aggregates plus dictionary rule checks, duplicate and
  orphan counts) and a Spark SQL `UNION ALL` profile query to re-run on the full table in a lower-environment Fabric
  workspace.
- Progress step: "Profiling <file> against <dictionary>".

## Acceptance criteria
- Profiling the sample flags every seeded defect with row examples: bad SUBMIT_DT dates, blank APP_TYPE, orphan
  CLIENT_ID, PENDING status, duplicate and badly patterned APP_ID, FEE_AMT outlier (`test/data.test.js` › profiling the
  sample flags every seeded defect with row examples).
- Examples are capped, personal values masked, and it works without a dictionary (› profiling caps examples, masks
  personal values and works without a dictionary).
- CSV parsing keeps quotes, embedded newlines and true line numbers (› CSV parsing keeps quotes, embedded newlines and
  true line numbers).
- Tools, agents and prompts are wired (› data tools are exposed; write tools need edit access; › data agents, prompts
  and skill are wired up).
- With the real engine (`e2e/real-engine-plans.spec.js` › Data: profiling finds the seeded data quality defects).

## Limits
- Works on extracts saved in the notebook only; Lumen can't connect to Fabric or OneLake. The scripts are for a data
  engineer to run.
- Type inference is heuristic (e.g. `DD/MM/YYYY` vs `MM/DD/YYYY` both accepted as a date when valid).
- Masking is by header/value heuristics; a personal column with an unusual name can be missed.

## Source
`tools/data.js` (`profileTable`, `readTable`, `parseCsv`, `kindOf`, `looksPersonal`, `mask`, `profilingScripts`,
`readSchema`), `tools/office-mcp.js` (`profile_data`, `save_draft_document`), `tools/change.js` (`saveDraft`),
`defaults/assistants.json` (agent **Data Profiler**), `defaults/recipes.json` (prompt **Profile a dataset**),
`skills/data-engineering/SKILL.md`, `samples/data/` (`Applications - source extract.csv`,
`Data Dictionary - Applications.xlsx`), `server.js` (`PACKS.data`).
