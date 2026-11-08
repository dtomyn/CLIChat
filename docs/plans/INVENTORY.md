# AI use-case inventory

This tracker covers the 42 use cases in *Initial AI use-case catalogue* (AIThemes.pdf, DRAFT, Release 2) and maps each one to what Lumen has shipped or to the plan that builds it. **Update it whenever a plan step lands:** change the status, add the shipped artefacts (agent, skill, tool, prompt, sample) and set the date.

Status key: ✅ Done · 🟡 Partial (works locally from files; a named gap remains) · 📝 Planned (plan written, not built) · ⬜ Not started

Last reviewed: 2026-11-07 (branch `feature/ideas-for-pm`, commit `82b234d`)

## Summary

| Status | Count |
|---|---|
| ✅ Done | 34 |
| 🟡 Partial | 4 |
| 📝 Planned | 4 |
| ⬜ Not started | 0 |

Lumen runs on one computer and works on files in the notebook folder. Where the catalogue names a cloud target (SharePoint, Teams, Power BI, Fabric, ADO Test Plans), Lumen produces the file or proposal locally, and a person publishes it. "Done" means the use case works end to end in that model. Live system connections are tracked separately in Plan 08 (Azure DevOps) and in the "Live targets" column.

## Use cases

| # | Workstream | Use case | Priority | Status | What exists / what's missing | Plan |
|---|---|---|---|---|---|---|
| 1 | Integrated Planning | Query the integrated plan in natural language | High | ✅ | Ask the Plan agent, `query_plan`, ms-project skill | — |
| 2 | Integrated Planning | Synchronize ADO progress with MPP | High | 🟡 | `plan_progress_from_backlog` + prompt from an ADO export file. Missing: live ADO query | 08 |
| 3 | Planning / Reporting | Program status report from source data | High | ✅ | Weekly executive status pack (plan + RAID, `build_status_report`), now with a **Delivery progress** block from an ADO backlog export (`backlog` on `get_status_facts` / `build_status_report`): items by state per epic, points done, open items on late tasks, critical-path tasks with items not started (an Amber reason), each row citing its export cell (2026-11-07). Live ADO query: Plan 08 | 10 |
| 4 | Integrated Planning | Identify and explain schedule variance | High | ✅ | `analyze_project_plan`, `plan_change_log`, variance Gantt, plan history | — |
| 5 | Integrated Planning | Model alternative delivery scenarios | Medium | ✅ | `tools/scenario.js`, read-only `model_scenario` (task slips, start-no-earlier-than, capacity changes, removed dependencies; milestone deltas, new critical path, newly over-allocated people, `planUpdates` for `update_project_plan`), prompt **Delivery scenarios** (side by side, saved to `Scenarios/<date>.xlsx`) (2026-11-07) | 10 |
| 6 | Governance / RAID | RAID updates from meeting transcripts | High | ✅ | Huddle → RAID log, `propose_raid_updates`, `apply_raid_updates` | — |
| 7 | Functional / Requirements | Refine BRDs into functional requirements | High | ✅ | Requirements Refiner, lifecycle stage 1, `read_document` | — |
| 8 | Functional Design | Draft and review FDD | High | ✅ | Functional Designer, lifecycle stage; **Save as Word (program template)** on the approved stage (`wordTemplate`, `md-export.js` `toDocx`), sample `Templates/FDD Template.dotx` (2026-11-07) | 18 |
| 9 | Technical Design | Draft and review TDD | Med–High | ✅ | Technical Designer, lifecycle stage; Word output from `Templates/TDD Template.dotx` (2026-11-07) | 18 |
| 10 | Functional / ADO Backlog | Delivery-ready ADO backlog items | High | 🟡 | Story Writer (Markdown backlog). Missing: create items in ADO | 08 |
| 11 | Functional / Traceability | End-to-end requirements traceability | High | 🟡 | `analyze_traceability` on the RTM workbook, now with a **test-case layer** (Tests sheet, `TC-###`): requirements and stories with no test, tests tracing to withdrawn items, test coverage per layer (2026-11-07). Missing: ADO links | 08, 09 |
| 12 | Cross-Functional / Knowledge | Common grounded program context | Foundational | ✅ | program-knowledge skill, Knowledge folder convention | — |
| 13 | EDP / Data Engineering | Profile datasets, find quality issues | High | ✅ | **Data Profiler** agent, `data-engineering` skill, `tools/data.js` `profileTable` via read-only `profile_data` (CSV/XLSX up to 200,000 rows: type, nulls, distinct, min/max, top values, patterns, outliers; data dictionary rules required, type, allowed values, pattern, length, unique and foreign key into another extract; at most 5 example rows per finding, personal columns masked; optional PySpark/Spark SQL profiling scripts), prompt **Profile a dataset** (DQ findings report through `save_draft_document`), sample `samples/data` with seven seeded defects (2026-11-07). Running against Fabric directly: out of scope | 11 |
| 14 | EDP / Data Engineering | Draft source-to-target mappings | High | ✅ | **Mapping Analyst** agent, `write_sttm` (STTM workbook: source, transformation rule, target layer/entity/field, match, DQ rule, Status, Reviewer; every row saved as Draft; with the schemas, unmatched source and target fields added as *Needs input* rows plus *Unmatched fields* and *Match evidence* sheets), prompt **Draft the STTM** (2026-11-07) | 11 |
| 15 | EDP / Data Engineering | Generate and review ETL assets | High | ✅ | **Data Engineer** agent, `generate_pipeline_code` (Approved STTM rows only, others refused and listed: PySpark notebook, Spark SQL, Data Factory/Fabric pipeline JSON, pytest tests and a row-count/checksum reconciliation query per target table; untranslatable rules marked TODO), prompt **Generate pipeline code from the STTM** (2026-11-07). Deploying to or running in Fabric: out of scope | 11 |
| 16 | Partner / Integration | Draft interface-control documents | High | ✅ | **Interface Designer** agent, `integration-design` skill, `tools/openapi.js` `icdCompleteness`, read-only `check_icd` (purpose, parties, protocol, HIP / ARO P4 or P5 pattern, message schemas, error handling, security, SLAs, volumes: ok, empty, incomplete or missing, with heading and line, as a completeness log), prompt **Draft an ICD** (saved through `save_draft_document` as Markdown and Word with the new `Templates/ICD Template.dotx`), sample `Knowledge/HIP Patterns.md`, BRD §5 Interfaces and a draft `Integration/ICD - Case API (draft).md` with empty and missing sections (2026-11-07) | 12 |
| 17 | Partner / Integration | API specifications and scaffolding | High | ✅ | **API Designer** agent, `tools/openapi.js` (YAML subset parser, no new package), read-only `validate_openapi` (structure, `$ref` resolution, response codes, body schemas, path parameters, operation IDs, plus the program API standards: `/v1/`, naming, `Problem` error model, required error responses and headers, `x-traces-to`; JSON path and line per finding), `write_openapi` (saves and validates; component schemas from `readSchema`), `generate_api_scaffold` (static mock responses, controller stubs, DTOs and contract tests in dotnet, node or python, stack read from the Solution Blueprint; refused while the spec has errors), prompts **Design an API**, **Review an OpenAPI spec** and **Generate API scaffolding**, sample `Knowledge/API Standards.md` and a flawed `Integration/permit-renewal-api.yaml` (2026-11-07). Publishing to an API gateway and running the mock as a server: out of scope | 12 |
| 18 | Partner / Integration | Reconcile schemas and canonical models | Med–High | ✅ | `readSchema` (SQL DDL, JSON Schema, data dictionary / data model workbooks; also used by `check_consistency` and available to Plan 12) and `compareSchemas` via read-only `read_schema` and `compare_schemas` (exact, normalized and fuzzy matches with abbreviation expansion, type compatibility, unmatched fields on both sides), prompt **Compare schemas**, sample source DDL, Silver JSON Schema and Gold DDL (2026-11-07) | 11 |
| 19 | Testing / QE | Test cases and coverage gaps | High | ✅ | **Test Designer** agent, `test-design` skill, `write_test_cases` (Excel in the ADO Test Plans import layout, one row per step), prompts **Generate test cases from stories** and **Coverage gaps**, optional lifecycle stage `tests` (`05-test-cases.md`), sample Tests sheet in the AIDLC TRM (2026-11-07). Live ADO Test Plans writes: Plan 08 | 09 |
| 20 | Testing / QE | Assist defect triage | High | ✅ | **Defect Triage** agent, `analyze_defects` (duplicates, severity–priority mismatches, ageing, unowned), `propose_defect_changes` (`(proposed)` copy with Approve column), prompt **Triage defects**, sample `Defects export.xlsx` (2026-11-07) | 09 |
| 21 | Security / SA&A | Map security controls and evidence needs | High | ✅ | **Security Control Mapper** agent, `security-saa` skill, `tools/controls.js` (`readControlCatalogue`, `readSctm`/`writeSctm`), read-only `analyze_controls` (controls in the profile not yet mapped, statements whose design reference is not a real FDD/TDD heading marked *needs input*, gaps) and `write_sctm` (`(proposed)` SCTM with Approve column; uncited statements set to Needs input; remediation items and Gap rows as `<SCTM> - remediation (ADO import).xlsx`), prompt **Draft the SCTM**, synthetic 20-control catalogue and partially filled SCTM in `samples/security` (2026-11-07). Program supplies its own ITSG-33/NIST text; pushing remediation to ADO: Plan 08 | 13 |
| 22 | Security / SA&A | Security design documentation | Med–High | ✅ | **Security Documentation** agent, prompt **Security design document** (sections cite the design heading or SCTM cell; Needs input and Gap controls listed as open items), saved as Markdown and Word through `save_draft_document` with the program template (Plan 18), sample `Technical Design - Security.md` (2026-11-07) | 13 |
| 23 | Security / SA&A | Assemble and validate control evidence | High | ✅ | **CAE Evidence** agent, `indexEvidence` in `analyze_controls` (evidence per control by ID in the file name, an evidence index workbook or the SCTM reference; missing, stale and orphan files, each citing its cell or file), prompt **Evidence gap check** (gap tracker and ADO remediation list), sample `Evidence/` with one missing, one stale and one orphan item (2026-11-07). Scanning Azure/Fabric/Purview directly: out of scope | 13 |
| 24 | Change Management | Summarize interviews, draft change impacts | High | ✅ | **Change Impact Analyst** agent, `change-management` skill, `propose_change_impacts` (quote-checked through the shared `verifyQuotes`; `(proposed)` CIA with Approve column) and `apply_change_impacts`, prompt **Interview → change impacts**, two sample interview transcripts and a CIA template (2026-11-07) | 14 |
| 25 | Change Management | Consolidate CIA and training needs | High | ✅ | `consolidate_cia` (duplicates merged, Rejected left out, heat map of group × H/M/L, TNA from approved impacts with the role list, `Training actions - ADO import.xlsx`), prompts **Consolidate the CIA** and **Training needs analysis**, sample CIAs with a seeded duplicate and `Roles.xlsx` (2026-11-07). Pushing actions to ADO: Plan 08 | 14 |
| 26 | Change Management | Draft training products | Med–High | ✅ | **Training Content** agent, prompt **Draft training materials** (deck outline, job aid, FAQ, knowledge check, each section citing its source), `save_draft_document` (Markdown and Word, draft label, sources listed) (2026-11-07). Decks are Markdown outlines, not .pptx | 14 |
| 27 | Release / Cutover | Release checklists | High | ✅ | **Release Readiness** agent, `release-cutover` skill, `check_readiness` (evidence files checked in the notebook; Red/Amber/Green by environment STE/UAT/STG/PRD, every finding cites its cell), prompts **Generate cutover checklist** (cutover and rollback run-sheet in the layout `cutover_status` reads) and **Readiness check**, demo `Release Readiness Checklist - Go-live.xlsx` with one missing evidence file (2026-11-07) | 15 |
| 28 | Release / Cutover | Operational runbook | High | ✅ | **Runbook Writer** agent, prompt **Draft the runbook** (each section cites its source, gaps marked To be confirmed), saved as Markdown and Word through `save_draft_document` (2026-11-07). Program Word templates: Plan 18 | 15 |
| 29 | Release / Cutover | Coordinate and summarize cutover | High | ✅ | **Cutover Coordinator** agent, `cutover_status` (late and blocked steps, critical path from the dependencies and actuals, next steps, projected finish, optional `Cutover/<date time>.md` snapshot), prompt **Cutover status update**, new *Every few minutes, between two times* scheduled-prompt option, demo `Cutover Run-sheet - Go-live weekend.xlsx` with one late step (2026-11-07). Teams alerts: out of scope | 15 |
| 30 | Release / Cutover | Hypercare analysis and closure report | Med–High | ✅ | **Hypercare Analyst** agent, `hypercare_trends` (weekly opened/closed/open/ageing by severity on the Plan 09 defect reader, Pass/Fail per exit criterion in plain words), prompt **Hypercare closure report**, demo `Hypercare Defects - 1 Feb 2027.xlsx` (2026-11-07). Power BI: out of scope | 15 |
| 31 | Architecture / Governance | Architecture and design consistency review | High | ✅ | **Architecture Reviewer** agent, `architecture` skill, `check_consistency` (components/APIs/endpoints/standards named in one design document but not the others, references to unknown or superseded ADRs, entities and fields missing from the data model, each citing file and heading), prompt **Architecture review** (findings and deviation log plus a remediation backlog in the ADO import layout), sample TDD with a component missing from the blueprint (2026-11-07) | 16 |
| 32 | Documentation / Bilingual | French drafts and bilingual QA | Med–High | ✅ | **Bilingual Reviewer** agent, `bilingual` skill, `check_terminology` (glossary terms, untranslated English, numbers/dates/IDs, missing paragraphs after alignment), prompts **Draft French version** (labelled machine-drafted, needs translator review) and **Bilingual QA**, sample 30-term glossary and EN/FR guide pair with three seeded issues (2026-11-07) | 14 |
| 33 | Functional / ADO Backlog | ADO backlog Q&A and controlled updates | High | 📝 | Plan 08 written, nothing built | 08 |
| 34 | Testing / QE | Test strategy, coverage model, risk priorities | High | ✅ | **Test Planner** agent, prompt **Draft the test strategy** (levels, STE/UAT/STG/PRD, entry/exit, test data, risk × change-impact priority); coverage model from `analyze_traceability` (2026-11-07) | 09 |
| 35 | Test Automation | Automated regression tests (Playwright) | High | 📝 | Lumen's own e2e suite as a pattern | 17 |
| 36 | Development / Engineering | Developer Copilot skill pack | High | 📝 | "Use in VS Code" export exists to reuse | 17 |
| 37 | Cross-Functional / Knowledge | ADO Wiki → SharePoint publishing, freshness | Foundational | 🟡 | `tools/publish.js`: `publish_snapshot`, `check_freshness`, `Published/publishing-log.xlsx`, **Knowledge freshness** prompt (2026-11-07). Missing: live ADO Wiki source (Plan 08 phase 2) | 18, 08 |
| 38 | Architecture / Governance | ADRs and reuse vs. build | High | ✅ | **ADR & Reuse Advisor** agent, `index_adrs` (MADR and Nygard ADRs: status, supersedes, no status, superseded still referenced, duplicate decisions), prompts **Draft an ADR** (MADR, status Proposed, via `save_draft_document`) and **Reuse vs. build assessment**, sample `Architecture/ADRs/` (ADR-002 superseded but still cited) and `Reusable assets.xlsx` (2026-11-07) | 16 |
| 39 | Planning / Resources | Estimates and resource capacity | High | ✅ | `tools/capacity.js`, `analyze_capacity` (weekly demand vs. capacity per person and role, leave clashes with critical work, sprint overloads from an ADO export, story-point outliers vs. the team median), **Who's overloaded?** takes an optional capacity workbook and backlog, sample `Team Capacity - Q4 2026.xlsx` (2026-11-07) | 10 |
| 40 | Architecture / Governance | Stage-gate packs | High | ✅ | **Gate Pack Assembler** agent, `assemble_gate_pack` (latest approved version per artefact from the lifecycle approval stamp or Word properties, newer drafts left out; writes `Gate packs/<gate>/` with a combined Word pack through `md-export` `toDocx` and the program template, an index with approval status and open items, an open-item log and artefact copies), prompt **Assemble a gate pack**, sample `Architecture/Design gate.json` (2026-11-07). SharePoint upload: out of scope | 16 |
| 41 | DevOps / Environments | Pipeline assets and environment drift | High | 📝 | — | 17 |
| 42 | Architecture / Knowledge | Technical catalogues from delivery changes | High | ✅ | **Inventory Keeper** agent, `propose_inventory_updates` (adds, changes and retirements from an ADO export, `git log --name-only` text, accepted ADRs and design documents; `(proposed)` copy with Approve column), prompt **Update technical inventory**, sample `Technical Inventory.xlsx` and git log (2026-11-07). Applying approved rows is by hand; live GitHub PRs: out of scope | 16 |

(#39 is counted as Planned in the summary because the missing half is the substantial part.)

## Plans

| Plan | Covers | Size | Depends on | Status |
|---|---|---|---|---|
| [08 Azure DevOps](08-azure-devops.md) | 2, 10, 11, 33 (live ADO) | L | — | 📝 |
| [09 Quality engineering](09-quality-engineering.md) | 11 (test layer), 19, 20, 34 | M | — (08 for ADO Test Plans) | ✅ 2026-11-07 |
| [10 Planning intelligence](10-planning-intelligence.md) | 3, 5, 39 | M | — | ✅ 2026-11-07 |
| [11 Data engineering](11-data-engineering.md) | 13, 14, 15, 18 | L | — | ✅ 2026-11-07 |
| [12 Integration and APIs](12-integration-and-apis.md) | 16, 17 | M | 11 (schema reader) | ✅ 2026-11-07 |
| [13 Security and SA&A](13-security-saa.md) | 21, 22, 23 | M | 18 (templates) helps | ✅ 2026-11-07 |
| [14 Change, training and bilingual](14-change-training-bilingual.md) | 24, 25, 26, 32 | M | — | ✅ 2026-11-07 |
| [15 Release and cutover](15-release-and-cutover.md) | 27, 28, 29, 30 | M | 09 (defect reader) | ✅ 2026-11-07 |
| [16 Architecture and governance](16-architecture-governance.md) | 31, 38, 40, 42 | M | 18 (templates) | ✅ 2026-11-07 |
| [17 Engineering skill packs](17-engineering-skill-packs.md) | 35, 36, 41 | M | — | 📝 |
| [18 Document templates and publishing](18-document-templates-publishing.md) | 8, 9, 37 | M | — (08 for wiki source) | 📝 |

Suggested order: 18 (templates unblock 13 and 16) → 09 → 10 → 14 → 15 → 16 → 13 → 11 → 12 → 17. Plan 08 can run in parallel at any time.

## Shared rules for plans 09–18

These extend the [ground rules](README.md#ground-rules-for-every-plan):

- **One use case = agent + skill + prompt(s) + sample data.** Agents go in `defaults/assistants.json`, prompts in `defaults/recipes.json` (with a category per workstream), and skills in `skills/<id>/SKILL.md`, registered in `lib/skills.js`.
- **Facts in code, wording by the AI.** Counting, matching, coverage and RAG logic go into `tools/*.js` with unit tests in `test/`. The AI writes the narrative and labels it as AI-written, the same way the status pack does.
- **Proposals, never silent edits.** Anything that changes a register or workbook writes a `(proposed)` copy with an *Approve? (Yes/No)* column, then applies approved rows to `(updated)`, reusing the RAID pattern in `tools/raid.js`.
- **Cite sources.** Every fact cites `file`, `Sheet!Cell` or a heading.
- **Sample data first.** Each plan extends `scripts/make-aidlc-sample.js` (or adds a `samples/<area>/` generator) with synthetic data, including the deliberate defects the tool must catch.
- **Mark Lumen-only features.** Tools that run locally are marked Lumen only. Agent instructions must still export cleanly to M365 Copilot.

## Change log

| Date | Change |
|---|---|
| 2026-11-07 | Inventory created from AIThemes.pdf; plans 09–18 written |
| 2026-11-07 | Plan 09 implemented: #19, #20, #34 done; #11 gains the test-case layer |
| 2026-11-07 | Plan 10 implemented: #3, #5, #39 done |
| 2026-11-07 | Plan 14 implemented: #24, #25, #26, #32 done |
| 2026-11-07 | Plan 15 implemented: #27, #28, #29, #30 done |
| 2026-11-07 | Plan 16 implemented: #31, #38, #40, #42 done |
| 2026-11-07 | Plan 13 implemented: #21, #22, #23 done |
| 2026-11-07 | Plan 11 implemented: #13, #14, #15, #18 done |
| 2026-11-07 | Plan 12 implemented: #16, #17 done |
