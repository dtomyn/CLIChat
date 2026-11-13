# 41 — Triage defects

## Intent
As a test lead, I want a defect export triaged for probable duplicates, severity–priority mismatches, ageing and
unowned defects, with the fixes proposed for my approval, so that triage meetings start from facts and nothing in the
backlog changes without a decision.

## Where
- Agent **Defect Triage** 🐞.
- Prompt **Triage defects** (category **Quality engineering**).

## Inputs & controls
| Control | Effect |
|---|---|
| **Defect export** (.xlsx/.xlsm/.csv) | An Azure DevOps query export; needs at least **ID** and **Title** columns. |
| **As-of date (optional)** | `asOf` for ages (default today). |
| `duplicateThreshold` / `staleDays` (tool only) | Title similarity for a duplicate (default 0.6); open defects unchanged for longer are listed (default 30). |
| Agreement in chat | Which proposals to record with `propose_defect_changes`. |

The prompt runs with **Create & edit files** (**Saves a file**); the agent defaults to **Read my files**.

## Behaviour (as implemented)
- **Reading** (`readDefects`): headers are matched loosely (ID / Bug ID / Key, Title / Summary, State / Status,
  Severity, Priority, Area Path, Assigned To / Owner, Created, Changed, Closed, Tags, Found in / Environment). The first
  sheet with ID and Title is used; a sheet named "Proposed changes" is skipped. When a Type column holds bugs, only
  Bug/Defect/Issue rows count.
- **Open** means the state is not closed/done/resolved/removed/rejected/duplicate/won't fix/cancelled.
- **Probable duplicates**: Jaccard similarity of normalised, lightly stemmed title words ≥ threshold, in the same area
  path (when there is one), with at least one of the pair open. The older defect (created date, else row) is the one to
  keep.
- **Severity–priority mismatch**: both ranked 1–4 (from "1 - Critical", "High", "P1"…) and two or more steps apart, on
  open defects; the note says which way it is wrong.
- Also: counts by severity and state (open by area), age buckets of open defects (0-7, 8-30, 31-90, over 90 days, no
  created date), the 10 oldest open, open without owner or severity, and not changed for `staleDays`.
- **Read-only analysis**: `analyze_defects` returns `proposals` only (state → Duplicate for duplicates; priority → the
  severity's rank for mismatches). Every defect has a `Sheet!Cell` of its ID.
- The agent shows a table (Defect, Field, Now, Proposed, Why) and **asks before recording**.
- **Recording** (`proposeDefectChanges`): fields severity, priority, state (status), owner (assigned to), area, tags.
  Writes `<export> (proposed).xlsx` with the changed cells highlighted and a **Proposed changes** sheet (#,
  **Approve? (Yes/No)** with a Yes/No list, Defect, Field, Current, Proposed, Why, Cell). Unknown IDs, unknown fields,
  a missing column or a blank value go under **Not proposed** with the reason. The original export is never changed.
- There is no apply step: people make the approved changes in Azure DevOps (or via [39](39-approve-ado-changes.md)).
- **Re-runs keep the review copy**: if a `(proposed)` copy already exists (someone may be marking it up), a re-run
  saves `<name> (proposed) (2).xlsx` and so on instead of replacing it.

## Outputs
- A summary line (`N defects, M open (C critical); … probable duplicate pairs; … mismatches; … open without an owner`),
  tables of duplicates, mismatches, oldest open and unowned defects, and the proposals table.
- After agreement, the `(proposed)` workbook and the next step to approve it.
- Progress steps: "Triaging defects in <file>", "Proposing N defect changes for review".

## Acceptance criteria
- Both seeded duplicate pairs and the mismatch are found and the export is unchanged (`test/tests.test.js` ›
  analyzeDefects finds both duplicate pairs and the mismatch, and never changes the export).
- CSV exports, title similarity and severity ranks work (› defect exports as CSV, title similarity and severity ranks).
- Proposals go to a `(proposed)` copy with an Approve column (› proposeDefectChanges writes a (proposed) copy with an
  Approve column and leaves the export alone).
- `propose_defect_changes` needs edit access (› quality tools are exposed; writing needs edit access).
- With the real engine the triage names the seeded defects and records nothing unasked (`e2e/real-engine-plans.spec.js`
  › Quality engineering: triage defects finds the duplicates and the mismatch, and records nothing unasked).

## Decisions
- Proposals use the RAID pattern (a `(proposed)` copy with an Approve column, see [28](28-huddle-to-raid.md)); no apply
  tool, because the export is only a snapshot of Azure DevOps.
- A re-run saves a numbered `(proposed)` copy and leaves the first one untouched (`test/tests.test.js` › a re-run of
  proposeDefectChanges keeps the earlier (proposed) copy and saves a numbered one).

## Limits
- Duplicates are matched on titles only (no description or repro steps).
- A .csv export's proposed copy is saved as .xlsx.

## Source
`tools/tests.js` (`readDefects`, `analyzeDefects`, `proposeDefectChanges`, `similarity`, `rank`),
`tools/office-mcp.js` (`analyze_defects`, `propose_defect_changes`), `lib/tool-labels.js`, `agents/<id>.json`
(agent **Defect Triage**), `defaults/recipes.json` (prompt **Triage defects**), `skills/test-design/SKILL.md`,
`samples/aidlc/Defects export.xlsx`.
