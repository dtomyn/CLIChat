# 48 — Map security controls, check evidence and draft the security design doc

## Intent
As a security analyst or SA&A lead, I want the program's control catalogue mapped to the design with implementation
statements that cite real design headings, the control evidence checked for gaps, and the Security Design Document
drafted, so that the assessor gets a traceable, honest package and gaps become tracked remediation work.

## Where
- Agents **Security Control Mapper** 🛡️, **Security Documentation** 📘 and **CAE Evidence** 🗂️.
- Prompts **Draft the SCTM**, **Security design document** and **Evidence gap check** (category **Security**).

## Inputs & controls
| Prompt | Fields |
|---|---|
| Draft the SCTM | **Control catalogue**; **Current SCTM (optional)** (.xlsx/.xlsm/.csv); **Design document (FDD or TDD)** (.docx/.md/.txt) |
| Security design document | **Design document (TDD or architecture)**; **SCTM**; **Word template (optional)** (.dotx/.docx) |
| Evidence gap check | **SCTM**; **Evidence folder** (e.g. `Evidence`); **Control catalogue (optional)**; **Evidence older than (days)** |

All three run with **Create & edit files**. `analyze_controls` also takes `documents` (FDD/TDD), `staleDays` (default
365) and `asOf`.

## Behaviour (as implemented)
- **Reading**: the catalogue (Control ID, Family, Title, Statement, Baseline/Profile) and the SCTM (Control ID,
  Applicability, Implementation statement, Responsible party, Design reference, Evidence references, Status). Control
  IDs, statuses (Planned, Implemented, Partially implemented, Gap, Needs input, Not applicable) and applicability
  (Applicable, Not applicable, Inherited, Shared) are normalised.
- **Analysis** (`analyze_controls`, read-only): controls in the profile not yet in the SCTM, SCTM controls not in the
  catalogue, counts by status and applicability, applicable controls with no statement, statements whose design
  reference is not a real heading (needs input), rows without status or responsible party, and remediation candidates
  (Gap rows, missing and stale evidence). Every finding cites its `Sheet!Cell` or file.
- **Citation check** (`citation`): a design reference must name a heading of a passed FDD/TDD by title or number
  (`Technical Design - Security.md > 3.2 Encryption at rest`, `TDD §3.2`); the document can be named by file name or as
  TDD/FDD/SDD. Without design documents references are not checked and the tool says so.
- **Evidence** (`indexEvidence`): files tie to controls by an ID in the file name (`AC-2 - …`), by an evidence index
  workbook in the folder (a file named like *index* with File, Control(s), Date columns), or by the SCTM's references.
  **Missing** = named but not in the folder, or an applicable Implemented / Partially implemented control with no
  evidence; **stale** = older than
  `staleDays` (date from the index, then a `YYYY-MM-DD` in the name, then the file date); **orphan** = a file no control
  claims. Links (http…) are not checked.
- **Proposals** (`write_sctm` → `proposeSctm`): rows for controls not in the catalogue are rejected. Changed cells are
  highlighted, new rows shaded green, and a **Proposed changes** sheet lists # / **Approve? (Yes/No)** / Change /
  Control / Field / Current / Proposed / **Design citation check** / Cell. A statement with no reference or one citing
  no real heading gets Status **Needs input**. Saved as `<SCTM> (proposed).xlsx` (or `SCTM (proposed).xlsx` next to the
  catalogue when starting one). The original SCTM is never changed; there is no apply step.
- **Remediation**: given items plus one per Gap row go to `<SCTM> - remediation (ADO import).xlsx` (ID `REM-001`…,
  Work Item Type Task, Title, Description, Priority 1–4, Assigned To, Tags `Security; SA&A; <control>`). With `rows: []`
  and remediation only, no `(proposed)` copy is written.
- **Agent rules**: statements only from what the design says; never mark a control Implemented unless the person or
  evidence says so; never quote control text not in the catalogue; never accept evidence or close a gap.
- **Security Design Document**: purpose and scope, system overview, security architecture (identity and access, logging
  and monitoring, data protection, network boundary, configuration and patching), control implementation summary by
  family, residual risks and open items (Needs input and Gap controls listed as open, not in place), each section
  citing its heading or SCTM cell. Saved with `save_draft_document` as `Security Design Document.md` + Word in the
  template ([36](36-save-in-program-templates.md)).
- **Evidence gap check** also saves `Evidence gap tracker.xlsx` (Control, Status, Evidence, Problem, Responsible party,
  Due) with `create_spreadsheet`.
- **Re-runs keep the review copy**: if a `(proposed)` copy already exists (someone may be marking it up), a re-run
  saves `<name> (proposed) (2).xlsx` and so on instead of replacing it.

## Outputs
- Coverage summary (`16 of 20 controls in the profile are in the SCTM (4 not mapped)…; evidence: x missing, y stale,
  z orphan`), the `(proposed)` SCTM, the remediation import workbook, the SDD (.md + .docx), the gap tracker.
- Progress steps: "Checking security controls and evidence in <SCTM>", "Proposing N SCTM rows for review" or "Saving N
  remediation items for Azure DevOps".

## Acceptance criteria
- IDs, statuses and applicability normalise (`test/controls.test.js` › control IDs, statuses and applicability are
  normalised); catalogue and SCTM are read with cells (› the catalogue and SCTM are read with their cells).
- Design references must cite a real heading (› design references must cite a real heading in the FDD/TDD).
- Evidence check reports exactly the missing, stale and orphan items (› the evidence check reports the missing, stale and
  orphan items exactly); analysis covers mapping, needs-input and remediation (› the analysis covers mapping, statements
  needing input and remediation).
- Proposals go to a `(proposed)` copy with uncited statements Needs input (› SCTM proposals go to a (proposed) copy;
  uncited statements are marked Needs input); remediation alone writes no `(proposed)` copy (› remediation items alone
  are saved without a (proposed) SCTM copy); `write_sctm` needs edit access (› security tools are exposed; write_sctm
  needs edit access).
- With the real engine (`e2e/real-engine-plans.spec.js` › Security: evidence gap check reports the missing, stale and
  orphan evidence; `e2e/real-engine-plans-2.spec.js` › Security: the SCTM draft maps the four unmapped controls into a
  (proposed) copy; › Security: the security design document is saved as Word and lists the open controls).

## Limits
- Lumen ships no ITSG-33 or NIST text; the sample catalogue is a synthetic paraphrase.
- No scanning of live Azure, Fabric or Purview configuration.

## Source
`tools/controls.js` (`readControlCatalogue`, `readSctm`, `writeSctm`, `citation`, `indexEvidence`, `analyzeControls`,
`proposeSctm`), `tools/office-mcp.js` (`analyze_controls`, `write_sctm`, `save_draft_document`, `create_spreadsheet`),
`lib/tool-labels.js`, `agents/<id>.json` (agents **Security Control Mapper**, **Security Documentation**,
**CAE Evidence**), `defaults/recipes.json` (prompts **Draft the SCTM**, **Security design document**, **Evidence gap
check**), `skills/security-saa/SKILL.md`, `samples/security/`.
