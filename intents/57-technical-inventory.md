# 57 — Keep the technical inventory current

## Intent
As an architect or inventory owner, I want proposed additions, changes and retirements to the technical inventory
(components, APIs, integrations, dependencies) worked out from delivery changes, each with its evidence, so that I can
approve them row by row instead of hunting for changes myself.

## Where
- Agent **Inventory Keeper** 🗃️.
- Prompt **Update technical inventory** (category **Architecture**).

## Inputs & controls
| Control | Effect |
|---|---|
| **Technical inventory** (.xlsx/.xlsm) | The catalogue workbook. |
| **git log --name-only output** (optional .txt/.log) | Commits and the files they touched. |
| **Azure DevOps export** (optional .xlsx/.xlsm/.csv) | Work items with a Title column. |
| **ADR folder** (optional) | Accepted, not superseded ADRs (see [55](55-adrs-and-reuse.md)). |
| `propose_inventory_updates` › `documents` | Design documents; the prompt lets the agent add those in the notebook. |

## Behaviour (as implemented)
- Needs **Create & edit files** (see [06](06-control-access-and-response-mode.md)). At least one change source is
  required.
- **Inventory reading**: every sheet (except *Proposed changes*) with a Name / Component / API / Integration /
  Dependency / Service / System / Asset / Interface column. Status, Last changed, Notes, Type and Source columns are used
  when present.
- **Signals**:
  - **Retire**: retire, decommission, sunset, remove, switch/turn off or replace wording next to a catalogue name, in a
    work item title, a commit message or an accepted ADR.
  - **Update**: any mention of a catalogue name, or a commit touching its folder. The first non-generic folder counts
    (`services/eligibility-service/` → *Eligibility service*).
  - **Add**: a new folder in a commit, "new/add/build/introduce/create/adopt/use … service/API/integration/…" wording, or
    a component/API name in a design document (see [54](54-architecture-review.md)) that no inventory cell mentions.
- One proposal per row (Retire beats Update) and per new name, with all its evidence (source, reference, where, date).
  Retirements of rows already *Retired*/*Decommissioned* are skipped and listed as already retired.
- **Output workbook**: `<inventory> (proposed).xlsx` next to the inventory (an existing `(proposed)`/`(updated)` suffix is
  not doubled).
  - Added rows are appended to the matching sheet (API, integration or component sheet, else the first) with Status *Proposed (new)* and
    a green fill.
  - Changed rows are yellow and retired rows orange.
  - A **Proposed changes** sheet has #, **Approve? (Yes/No)** (a Yes/No list, left blank), Change, Sheet, Row, Name,
    Field, Current, Proposed, Evidence. Field is Status → Retired, the newer *Last changed* date, or *Review*.
- **The inventory itself is never changed**, and there is no apply step: the owner sets Approve? and updates the
  inventory by hand.
- The agent summarises adds, changes and retirements with their evidence and points out likely false matches.
- **Re-runs keep the review copy**: if a `(proposed)` copy already exists (someone may be marking it up), a re-run
  saves `<name> (proposed) (2).xlsx` and so on instead of replacing it.

## Outputs
- Three short tables (to add, changed, to retire) with evidence, the path of the `(proposed)` workbook, and a reminder to
  set Approve? on every row.

## Acceptance criteria
- From the sample git log, ADRs and TDD the inventory is unchanged and `Technical Inventory (proposed).xlsx` is written
  (`test/governance.test.js` › inventory updates go to a (proposed) copy only):
  - It proposes retiring *Legacy kiosk interface* and adding *Photo validation* and *Address lookup service*.
  - It does not re-add a name already in another column, and updates *Eligibility service* (Last changed 2026-10-27) and
    *Case API*.
  - Approve? is blank on every row, and no source at all is refused.
- An Azure DevOps export alone yields one retire, one update and one add, summarised as "from 3 work items" (› inventory:
  an Azure DevOps export can add, change and retire rows).
- git log text parses into commits with hash, date and files, and component paths skip generic folders (› git log
  parsing and component paths).
- With edit access the MCP tool writes the `(proposed)` copy (› architecture tools are exposed; gate packs and inventory
  proposals need edit access).
- With the real engine: `e2e/real-engine-plans-2.spec.js` › Architecture: inventory updates are proposed from the git
  log, and the inventory is unchanged.

## Limits
- Git history is read from a saved `git log --name-only` text file; GitHub PRs are not read live.
- Name matching is by words, so false matches are possible; the agent is told to point them out.

## Source
- `tools/governance.js` (`diffInventory`, `readInventory`, `readChangeItems`, `parseGitLog`, `componentOfPath`,
  `extractNames`).
- `tools/office-mcp.js` (tool `propose_inventory_updates`); `skills/architecture/SKILL.md`.
- `defaults/assistants.json` (agent **Inventory Keeper**); `defaults/recipes.json` (prompt **Update technical inventory**).
- `samples/aidlc/Architecture/Technical Inventory.xlsx`, `samples/aidlc/Architecture/Delivery changes - git log.txt`.
