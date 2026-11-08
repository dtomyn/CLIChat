# AI use-case inventory

This tracker covers the 42 use cases in *Initial AI use-case catalogue* (AIThemes.pdf, DRAFT, Release 2) and maps each one to what Lumen has shipped or to the plan that builds it. **Update it whenever a plan step lands:** change the status, add the shipped artefacts (agent, skill, tool, prompt, sample) and set the date.

Status key: ✅ Done · 🟡 Partial (works locally from files; a named gap remains) · 📝 Planned (plan written, not built) · ⬜ Not started

Last reviewed: 2026-11-07 (branch `feature/ideas-for-pm`, commit `82b234d`)

## Summary

| Status | Count |
|---|---|
| ✅ Done | 17 |
| 🟡 Partial | 4 |
| 📝 Planned | 21 |
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
| 13 | EDP / Data Engineering | Profile datasets, find quality issues | High | 📝 | — | 11 |
| 14 | EDP / Data Engineering | Draft source-to-target mappings | High | 📝 | — | 11 |
| 15 | EDP / Data Engineering | Generate and review ETL assets | High | 📝 | — | 11 |
| 16 | Partner / Integration | Draft interface-control documents | High | 📝 | — | 12 |
| 17 | Partner / Integration | API specifications and scaffolding | High | 📝 | — | 12 |
| 18 | Partner / Integration | Reconcile schemas and canonical models | Med–High | 📝 | — | 11 |
| 19 | Testing / QE | Test cases and coverage gaps | High | ✅ | **Test Designer** agent, `test-design` skill, `write_test_cases` (Excel in the ADO Test Plans import layout, one row per step), prompts **Generate test cases from stories** and **Coverage gaps**, optional lifecycle stage `tests` (`05-test-cases.md`), sample Tests sheet in the AIDLC TRM (2026-11-07). Live ADO Test Plans writes: Plan 08 | 09 |
| 20 | Testing / QE | Assist defect triage | High | ✅ | **Defect Triage** agent, `analyze_defects` (duplicates, severity–priority mismatches, ageing, unowned), `propose_defect_changes` (`(proposed)` copy with Approve column), prompt **Triage defects**, sample `Defects export.xlsx` (2026-11-07) | 09 |
| 21 | Security / SA&A | Map security controls and evidence needs | High | 📝 | — | 13 |
| 22 | Security / SA&A | Security design documentation | Med–High | 📝 | — | 13 |
| 23 | Security / SA&A | Assemble and validate control evidence | High | 📝 | — | 13 |
| 24 | Change Management | Summarize interviews, draft change impacts | High | ✅ | **Change Impact Analyst** agent, `change-management` skill, `propose_change_impacts` (quote-checked through the shared `verifyQuotes`; `(proposed)` CIA with Approve column) and `apply_change_impacts`, prompt **Interview → change impacts**, two sample interview transcripts and a CIA template (2026-11-07) | 14 |
| 25 | Change Management | Consolidate CIA and training needs | High | ✅ | `consolidate_cia` (duplicates merged, Rejected left out, heat map of group × H/M/L, TNA from approved impacts with the role list, `Training actions - ADO import.xlsx`), prompts **Consolidate the CIA** and **Training needs analysis**, sample CIAs with a seeded duplicate and `Roles.xlsx` (2026-11-07). Pushing actions to ADO: Plan 08 | 14 |
| 26 | Change Management | Draft training products | Med–High | ✅ | **Training Content** agent, prompt **Draft training materials** (deck outline, job aid, FAQ, knowledge check, each section citing its source), `save_draft_document` (Markdown and Word, draft label, sources listed) (2026-11-07). Decks are Markdown outlines, not .pptx | 14 |
| 27 | Release / Cutover | Release checklists | High | 📝 | — | 15 |
| 28 | Release / Cutover | Operational runbook | High | 📝 | — | 15 |
| 29 | Release / Cutover | Coordinate and summarize cutover | High | 📝 | — | 15 |
| 30 | Release / Cutover | Hypercare analysis and closure report | Med–High | 📝 | — | 15 |
| 31 | Architecture / Governance | Architecture and design consistency review | High | 📝 | — | 16 |
| 32 | Documentation / Bilingual | French drafts and bilingual QA | Med–High | ✅ | **Bilingual Reviewer** agent, `bilingual` skill, `check_terminology` (glossary terms, untranslated English, numbers/dates/IDs, missing paragraphs after alignment), prompts **Draft French version** (labelled machine-drafted, needs translator review) and **Bilingual QA**, sample 30-term glossary and EN/FR guide pair with three seeded issues (2026-11-07) | 14 |
| 33 | Functional / ADO Backlog | ADO backlog Q&A and controlled updates | High | 📝 | Plan 08 written, nothing built | 08 |
| 34 | Testing / QE | Test strategy, coverage model, risk priorities | High | ✅ | **Test Planner** agent, prompt **Draft the test strategy** (levels, STE/UAT/STG/PRD, entry/exit, test data, risk × change-impact priority); coverage model from `analyze_traceability` (2026-11-07) | 09 |
| 35 | Test Automation | Automated regression tests (Playwright) | High | 📝 | Lumen's own e2e suite as a pattern | 17 |
| 36 | Development / Engineering | Developer Copilot skill pack | High | 📝 | "Use in VS Code" export exists to reuse | 17 |
| 37 | Cross-Functional / Knowledge | ADO Wiki → SharePoint publishing, freshness | Foundational | 🟡 | `tools/publish.js`: `publish_snapshot`, `check_freshness`, `Published/publishing-log.xlsx`, **Knowledge freshness** prompt (2026-11-07). Missing: live ADO Wiki source (Plan 08 phase 2) | 18, 08 |
| 38 | Architecture / Governance | ADRs and reuse vs. build | High | 📝 | — | 16 |
| 39 | Planning / Resources | Estimates and resource capacity | High | ✅ | `tools/capacity.js`, `analyze_capacity` (weekly demand vs. capacity per person and role, leave clashes with critical work, sprint overloads from an ADO export, story-point outliers vs. the team median), **Who's overloaded?** takes an optional capacity workbook and backlog, sample `Team Capacity - Q4 2026.xlsx` (2026-11-07) | 10 |
| 40 | Architecture / Governance | Stage-gate packs | High | 📝 | — | 16 |
| 41 | DevOps / Environments | Pipeline assets and environment drift | High | 📝 | — | 17 |
| 42 | Architecture / Knowledge | Technical catalogues from delivery changes | High | 📝 | — | 16 |

(#39 is counted as Planned in the summary because the missing half is the substantial part.)

## Plans

| Plan | Covers | Size | Depends on | Status |
|---|---|---|---|---|
| [08 Azure DevOps](08-azure-devops.md) | 2, 10, 11, 33 (live ADO) | L | — | 📝 |
| [09 Quality engineering](09-quality-engineering.md) | 11 (test layer), 19, 20, 34 | M | — (08 for ADO Test Plans) | ✅ 2026-11-07 |
| [10 Planning intelligence](10-planning-intelligence.md) | 3, 5, 39 | M | — | ✅ 2026-11-07 |
| [11 Data engineering](11-data-engineering.md) | 13, 14, 15, 18 | L | — | 📝 |
| [12 Integration and APIs](12-integration-and-apis.md) | 16, 17 | M | 11 (schema reader) | 📝 |
| [13 Security and SA&A](13-security-saa.md) | 21, 22, 23 | M | 18 (templates) helps | 📝 |
| [14 Change, training and bilingual](14-change-training-bilingual.md) | 24, 25, 26, 32 | M | — | ✅ 2026-11-07 |
| [15 Release and cutover](15-release-and-cutover.md) | 27, 28, 29, 30 | M | 09 (defect reader) | 📝 |
| [16 Architecture and governance](16-architecture-governance.md) | 31, 38, 40, 42 | M | 18 (templates) | 📝 |
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
