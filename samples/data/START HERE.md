# Data engineering sample (synthetic)

Permit applications moving from a source extract (Bronze) to a Silver canonical model and a Gold star schema. All names and values are made up. Open this folder as the notebook.

| File | What it is |
|---|---|
| **Applications - source extract.csv** | 40 source rows with seeded data quality defects |
| **Clients - source extract.csv** | The 20 clients the applications point at (foreign key target) |
| **Source DDL - Applications.sql** | CREATE TABLE for the two source tables |
| **Silver - Canonical Application.schema.json** | The Silver / EDR canonical model (JSON Schema) |
| **Gold - Application model.sql** | Gold star schema: fact_application and dim_client |
| **Data Dictionary - Applications.xlsx** | Type, required, unique, allowed values, pattern and references for each field |

What profiling *Applications - source extract.csv* against the dictionary should find (line numbers count the header as line 1):

- **Bad dates:** SUBMIT_DT on line 8 (2026-02-30) and line 20 (15/13/2026).
- **Mandatory field blank:** APP_TYPE on lines 13 and 28.
- **Orphan foreign key:** CLIENT_ID C-1999 on line 24 is not in the clients file.
- **Value not allowed:** STATUS_CD PENDING on line 32.
- **Duplicate key:** APP_ID on line 36 repeats line 35.
- **Pattern:** APP_ID ap1001038 on line 39.
- **Outlier:** FEE_AMT 12000.00 on line 16.

Comparing the source *APPLICATIONS* table with the Silver model should match 9 fields, and leave INTERNAL_NOTE_TXT (source) and channelCode and languageCode (target) unmatched.

Try the **Data** prompts in order: **Profile a dataset**, **Compare schemas**, **Draft the STTM**, then approve a few rows in the STTM workbook (Status = Approved, your name in Reviewer) and run **Generate pipeline code from the STTM**.

Regenerate with `node scripts/make-data-sample.js`.
