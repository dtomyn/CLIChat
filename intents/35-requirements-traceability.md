# 35 — Check requirements traceability and change impact

## Intent
As a delivery lead or business analyst, I want to check my traceability workbook (TRM/RTM) for coverage, gaps,
broken links and the downstream impact of a changed requirement, also against the live Azure DevOps backlog, so that
I know what is missing or needs review before a gate, with every finding pointing at a cell.

## Where
- Agent **Traceability Analyst** 🔗 (access `read`; skills `traceability`, `aidlc-lifecycle`, `program-knowledge`,
  `excel`, `azure-devops`). Skill **Requirements traceability** (`traceability`) is also in **Functional Designer**,
  **Technical Designer**, **Story Writer**, **Test Designer** and **Test Planner**.
- Prompts (category *Delivery lifecycle*, access `read`): **Traceability check**, **Impact of a requirement change**.
  Prompt (category *Azure DevOps*, access `edit`): **Traceability against Azure DevOps**.
- Tool `analyze_traceability` ("Checking traceability in <file>"); `ado_export_backlog` for the live backlog.
- The **Traceability check** button on a lifecycle stage ([34](34-guided-lifecycle-runs.md)).

## Inputs & controls
| Control | Effect |
|---|---|
| **trm** (file `.xlsx,.xlsm`) | The traceability workbook. |
| Changed IDs (text) and what changed (textarea) | **Impact of a requirement change**: passed as `changed`. |
| `changed` (tool argument) | IDs to analyse for impact, e.g. `["BR-004"]`; unknown IDs are reported. |
| `workbook`, `output`, `area`, `includeClosed` (`ado_export_backlog`) | Merge the live backlog into a copy of the TRM. |

## Behaviour (as implemented)
- **Workbook shapes**: one sheet per layer (an ID column and "Traces To" / "Parent" / "Implements"-style columns), or
  a matrix sheet named like *Trace Matrix*/*RTM*/*TRM* with one ID column per layer; both can be mixed. Sheets and
  columns are recognised by name. Layers: business requirements (BR), refined (RR), functional design (FD), technical
  design (TD), delivery backlog (BL: epics, features, stories by type or ID prefix), test cases (TC). Sheets that
  match no layer (other than change logs, lookups, readme, glossary) are listed as `sheetsNotRecognised`.
- **Findings** (each with a `Sheet!Cell` of the item's ID cell): `duplicateIds`, `brokenLinks` (IDs that don't exist),
  `coverageGaps` (an item with nothing below it; an FD with no story below it), `untracedItems` (no upstream link;
  epics and features may stand alone), `storiesTracingStraightToRequirements` (a story linking BR/RR with no FD/TD),
  `linksInTheWrongDirection`, `withdrawnButStillLinked`, `designElementsWithoutTechnicalDesign`, `changeImpact`,
  `possiblyStaleAfterUpstreamChange` (an upstream item changed after the downstream one).
- **Tests** (only when a TC layer exists): `requirementsWithoutTests`, `storiesWithoutTests`,
  `testsTracingToWithdrawnItems`, plus "with tests" coverage lines. A test never counts as design.
- **Status words**: Withdrawn/Deleted/Rejected/Superseded/Cancelled/Descoped/Out of scope are dead (no coverage
  needed); Changed/Revised/Updated/Conflict/Re-opened on a requirement or design item add it to the impact list
  automatically. Impact lists every downstream item, marking those last changed before the source as `olderThanChange`.
  A story reached through a shared TD counts only when it has no FD of its own or its FD is in the walk.
- **Coverage** per layer as "85% (11/13)"; `layersFound` counts items (backlog as "2 epics, 3 features, 10 stories").
- **Suggested RAG**: Red for duplicate IDs, broken links, withdrawn items still linked, or a change with affected
  items; Amber for any other finding; otherwise Green.
- **Read-only**: the tool never writes. The skill says to propose fixes as a table (ID · column · current · proposed
  · reason) and, only when asked, save them to `<workbook> (proposed).xlsx` with Status `Proposed (AI)`; never delete
  rows, renumber IDs or create a link it can't justify.
- **Live backlog**: `ado_export_backlog` reads epics, features and stories (Removed excluded unless `includeClosed`),
  writes ID `ADO-<number>`, Type, Title, Status, Parent, **Traces To** (from tags like `FD-012`, `BR-004.1`), Last
  Changed and the link. With `workbook` it saves `<name> (with Azure DevOps).xlsx` with the backlog sheets replaced;
  the original is untouched. It needs **Create & edit files** and never writes to Azure DevOps.

## Outputs
- A chat report: RAG with one line, coverage per layer, findings grouped by what to do (fix a broken link, design
  missing, story needed, review after a change, decide which one is right) with IDs, cells and owners, top 5 actions.
- On the AIDLC sample workbook: Red, with one duplicate ID, one broken link, one story that skips design, one withdrawn
  requirement still linked and one changed requirement with downstream impact.

## Acceptance criteria
- `test/tests.test.js` › traceability reads the Tests sheet: uncovered requirement, withdrawn-linked test, stories
  without tests; › a test does not stand in for design, and workbooks without tests get no test findings.
- `test/ado-changesets.test.js` › backlog export merges the live backlog into a TRM copy that analyze_traceability
  can read.
- `e2e/real-engine-plans-2.spec.js` › Quality engineering: coverage gaps lists the untested items and the test on the
  withdrawn requirement.

## Limits
- No unit test covers the non-test findings (duplicates, broken links, impact, RAG) directly.
- Recognition is name-based; the sample layout is a placeholder until the program's real TRM structure is agreed.
- Azure DevOps traceability relies on tags; there is no "Traces To" field in Azure DevOps (decision D5, plan 08).
- The traceability agent only reports; recording links is a human decision.

## Source
`tools/traceability.js` (`analyze`, `LAYERS`), `tools/office-mcp.js` (`analyze_traceability`),
`tools/ado/backlog.js` (`exportBacklog`, `backlogRows`, `TRACE_TAG`), `tools/ado-mcp.js` (`ado_export_backlog`),
`skills/traceability/SKILL.md`, `defaults/assistants.json` (`traceability-analyst`), `defaults/recipes.json`
(`aidlc-trace-check`, `aidlc-change-impact`, `ado-traceability-live`),
`samples/aidlc/Requirements Traceability (sample).xlsx`.
