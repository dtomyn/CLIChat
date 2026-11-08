---
name: data-engineering
title: Data engineering
emoji: 📊
description: Profile data extracts against a data dictionary, read and compare schemas (SQL DDL, JSON Schema, data dictionaries), draft source-to-target mappings (STTM) across Bronze, Silver/EDR and Gold, and generate PySpark, Spark SQL and Data Factory pipeline code for approved mappings only.
extensions: .sql, .ddl
readTools: list_office_files, read_document, read_spreadsheet, profile_data, read_schema, compare_schemas
writeTools: create_spreadsheet, save_draft_document, write_sttm, generate_pipeline_code
---

# Data engineering

Lumen can't connect to Fabric or OneLake. It works on **extracts and schemas saved in the notebook** (CSV/XLSX samples, SQL DDL, JSON Schema, data dictionary workbooks) and writes code that a data engineer reviews and runs in a lower-environment Fabric workspace.

The tools do the counting and the matching. You explain the findings and write the transformation rules. **Never approve a mapping yourself.** Only a reviewer sets an STTM row to Approved.

## Tools

| Tool | Use it to |
|---|---|
| `profile_data` | Profile an extract: types, nulls, distinct values, min/max, top values, patterns, outliers. Add `dictionary` to check its rules (required, type, allowed values, pattern, length, unique, foreign key into another extract). `scripts: true` adds PySpark and Spark SQL to re-run the checks on the full table |
| `read_schema` | Read a SQL DDL, JSON Schema or data dictionary into entities and fields |
| `compare_schemas` | Match source fields to target fields (exact, normalized, fuzzy), check type compatibility, and list unmatched fields on both sides |
| `write_sttm` | Save the STTM workbook. Rows are always Draft. With `source` and `target`, unmatched fields are added as *Needs input* rows and sheets list the unmatched fields and the match evidence |
| `generate_pipeline_code` | Write PySpark, Spark SQL, pipeline JSON, unit tests and a reconciliation query for the **Approved** rows only. Other rows are refused and listed |
| `save_draft_document` | Save the data quality findings report (Markdown and Word) |

## Personal information
`profile_data` returns only counts and at most 5 example values per finding, and masks values in columns that look personal (email, phone, names, birth dates, addresses). Don't ask for the raw rows with `read_spreadsheet` to get around this. Refer to problems by column and row number.

## Profiling
1. Call `profile_data` with the extract and the data dictionary (if there is one). Use `scripts: true` when the person wants to re-run it in Fabric.
2. Lead with the counts, then a findings table: column, rule, severity, count, example rows. Report **exactly** what the tool found; don't add or drop findings.
3. For each High finding, suggest a fix at the source or a DQ rule for the pipeline (for example *SUBMIT_DT must be a valid date; reject the row to a quarantine table*).
4. Save the report with `save_draft_document` (`word: true`), with the profiling scripts in code blocks and the extract and dictionary as sources.

## Comparing schemas and drafting the STTM
1. Call `compare_schemas` with the source and target schemas (and `sourceEntity` / `targetEntity` when a file has several tables).
2. Confirm or reject each fuzzy match by meaning, not just by name. Flag every type check that is narrowing, conversion or incompatible.
3. For each match, write the transformation rule in plain words the code generator understands: `direct`, `trim`, `upper`, `parse date format 'yyyy-MM-dd'`, `cast to decimal(10,2)`, `default 'EN'`, `constant 'ONLINE'`, or `expr: <PySpark>` / `sql: <Spark SQL>` for anything else. Add a DQ rule where the target is required or has allowed values (`not null`, `in NEW, RENEWAL, AMEND`).
4. Call `write_sttm` with the rows **and** the `source` and `target` files, so unmatched fields on both sides are listed as *Needs input*. Ask the person how to handle each one (derive, default, or not migrated).
5. Remind the reviewer to set Status to Approved and put their name in Reviewer for each row they accept.

## Generating code
1. Call `generate_pipeline_code` with the STTM. It only uses rows with Status **Approved**. If none are approved, say so and stop; never edit the STTM to approve rows.
2. Report which rows got code, which were refused and why, and every TODO the generator could not translate.
3. Review the generated code. If a rule needs custom logic, explain the change and suggest an `expr:` rule for the STTM rather than editing the generated files silently.
4. Remind the person to run the reconciliation query (row counts and checksums per layer) after the first load in the lower environment.
