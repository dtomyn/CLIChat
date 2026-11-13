# 49 — Interviews → change impacts, consolidate the CIA, training needs

## Intent
As a change management lead, I want stakeholder interviews turned into quote-backed change impacts for my approval,
several Change Impact Assessments (CIA) merged into one with a heat map, and the training needs worked out by role, so
that the change plan rests on what people actually said and training goes where the impact is highest.

## Where
- Agent **Change Impact Analyst** 🔄.
- Prompts **Interview → change impacts**, **Consolidate the CIA** and **Training needs analysis** (category
  **Change & training**).

## Inputs & controls
| Prompt | Fields | Access |
|---|---|---|
| Interview → change impacts | **Interview transcript** (.vtt/.docx/.txt/.md); **CIA workbook or template (optional)** | Create & edit files |
| Consolidate the CIA | **CIA workbook**; **Another CIA workbook**; **A third CIA workbook (optional)**; **Role list (optional)** (.xlsx/.xlsm/.csv) | Create & edit files |
| Training needs analysis | **Consolidated CIA** (.xlsx/.xlsm) | Read my files |

`propose_change_impacts` takes several `transcripts`, an optional `cia`, an `interviewDate` and `impacts`
(stakeholderGroup, role, process, change, level H/M/L, skillGap, trainingType, `evidence.quote`, reason).
`consolidate_cia` takes `files`, `roles` and `output`.

## Behaviour (as implemented)
- **Levels**: H = new skills or a new way of working; M = changed steps or tools; L = awareness only. Worries and
  opinions are listed as change risks, not impacts.
- **Quote check** (`raid.verifyQuotes`, shared with [28](28-huddle-to-raid.md)): each impact's quote must appear in a
  transcript word for word (case and punctuation ignored, at least 4 words, may span two consecutive turns). The
  speaker, time and file come from the transcript; if the AI named another speaker the transcript's is kept with a
  warning. Impacts with an unfound quote, a missing group/process/change, or a level other than H/M/L are rejected
  with the reason.
- **Proposing** (`proposeImpacts`): accepted impacts are added as new rows (shaded green, Status **Proposed**, next
  Impact ID) to the CIA's impact sheet, with a **Proposed changes** sheet (#, **Approve? (Yes/No)**, Impact ID, group,
  process, change, level, quoted evidence, speaker, time, source, why). Saved as `<CIA> (proposed).xlsx`, or
  `Change impacts (proposed).xlsx` next to the first transcript (with the template columns) when no CIA is given.
  Rejected impacts are listed under "Not proposed (could not be checked)". The original CIA is not changed.
- **Applying** (`apply_change_impacts`, only after the person says they reviewed it): if any row lacks Yes/No nothing
  is applied and the rows are named; otherwise only Yes rows are written to `<CIA> (updated).xlsx` with Status
  **Approved**. The original is never overwritten.
- **Consolidating** (`consolidateCia`): reads every sheet with Stakeholder group, Change description and Impact level
  columns (other wording tolerated; a file without one is skipped with a note). Rejected impacts are left out; a missing
  level counts as Medium with a note. Duplicates = same group and process and description similarity ≥ 0.5 (Jaccard on
  stemmed words, the measure defect triage uses); the higher level is kept and sources are merged. Proposed impacts count in the heat
  map but not in the TNA; a `(proposed)` review copy is noted as such.
- **TNA**: one row per approved impact and role (roles from the impact, else every role of that group in the role list,
  else "All <group>"), with headcount from the role list, skill gap, training type (default by level: H instructor-led
  session + job aid, M walkthrough or e-learning + job aid, L communication + quick reference) and priority.
- **Outputs written** (never overwritten, numbered copies): `CIA - consolidated.xlsx` (sheets **Consolidated impacts**,
  **Heat map**, **TNA**, **Merged duplicates**, **Sources**) and `Training actions - ADO import.xlsx` (one Task per role
  and training type, Tags `Training; CIA`). Source workbooks are not changed.
- **Training needs analysis** prompt: a cited report (summary by role and priority, table by role, recommended sequence,
  gaps), labelled **Draft (AI) for review**, changes no files, and explains importing the training actions or asking the
  **Backlog Helper** to propose them ([39](39-approve-ado-changes.md)).
- **Re-runs keep the review copy**: if a `(proposed)` copy already exists (someone may be marking it up), a re-run
  saves `<name> (proposed) (2).xlsx` and so on instead of replacing it.

## Outputs
- A table of proposed impacts (ID, group, process, change, level, who said it and when), rejected ones, and the risks.
- The `(proposed)`, `(updated)` and consolidated workbooks and the training actions file, with a summary ("N impacts
  read from F files; D duplicates merged; C consolidated impacts (H high); T training needs…").
- Progress steps: "Proposing N change impacts for review", "Applying approved change impacts from <file>",
  "Consolidating N change impact assessments".

## Acceptance criteria
- `verifyQuotes` reads several transcripts and records each quote's file (`test/change.test.js` › verifyQuotes is
  shared: it reads several transcripts and records the file each quote came from).
- Invented quotes and bad levels are rejected and the CIA is unchanged (› proposeImpacts rejects invented quotes and
  bad levels, and never changes the CIA).
- Only approved rows are applied, and nothing while rows are undecided (› applyImpacts writes only approved rows to the
  (updated) copy, and refuses while rows are undecided).
- The seeded duplicate is merged, heat map and TNA are built, sources untouched (› consolidateCia merges the seeded
  duplicate, builds the heat map and TNA, and leaves the sources alone); other wording and missing levels are tolerated
  (› consolidateCia tolerates other column wording, missing levels and a workbook with no impact sheet).
- Tools need edit access and stay in the folder (› change tools are exposed; writing needs edit access and stays in the
  folder).
- With the real engine (`e2e/real-engine-plans-2.spec.js` › Change: interview impacts are proposed with quotes, and
  nothing is applied; › Change: consolidating the CIAs merges the duplicate and leaves out the rejected impact;
  › Change: the training needs analysis uses the TNA headcounts and saves nothing).

## Decisions
- Approval follows the RAID pattern: propose to a `(proposed)` copy, apply only Yes rows to an `(updated)` copy.

## Limits
- Re-applying replaces the earlier `(updated)` copy.
- Duplicate detection is by words, not meaning; near-synonyms are not merged.
- Training actions are an import file; nothing is written to Azure DevOps directly.

## Source
`tools/change.js` (`proposeImpacts`, `applyImpacts`, `readImpacts`, `readRoles`, `consolidateCia`, `CIA_COLUMNS`),
`tools/raid.js` (`readTranscript`, `verifyQuotes`), `tools/tests.js` (`similarity`), `tools/office-mcp.js`
(`propose_change_impacts`, `apply_change_impacts`, `consolidate_cia`), `lib/tool-labels.js`,
`agents/<id>.json` (agent **Change Impact Analyst**), `defaults/recipes.json` (prompts **Interview → change
impacts**, **Consolidate the CIA**, **Training needs analysis**), `skills/change-management/SKILL.md`, `samples/change/`.
