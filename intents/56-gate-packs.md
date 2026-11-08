# 56 — Assemble a stage-gate pack

## Intent
As a PMO lead or delivery lead, I want the gate pack built from the latest approved version of each required artefact,
with the missing items, open approvals and open items listed, so that the governance board sees exactly what is approved
and what is still outstanding.

## Where
- Agent **Gate Pack Assembler** 📦.
- Prompt **Assemble a gate pack** (category **Architecture**).

## Inputs & controls
| Control | Effect |
|---|---|
| **Gate definition** (.json) | `{ gate, artefacts: [{ name, path, required }], approvals: [{ role, artefact }], openItems }`. |
| **Word template** (optional .dotx/.docx) | Program styles and cover page for the combined pack. |
| **RAID log** (optional) | Adds its open Medium and High items to the open items. |
| `assemble_gate_pack` inline arguments | `gate`, `artefacts`, `approvals` (approver and date only when the person says they were recorded), `openItems`, `raid`, `template`; inline values override the manifest. |

## Behaviour (as implemented)
- Needs **Create & edit files**. In a read-only chat the tool refuses with the "Editing files is turned off" message (see
  [06](06-control-access-and-response-mode.md)). A gate name and at least one artefact are required.
- Artefact paths are confined to the project folder.
- An artefact path can be a file or a folder. Candidates are `.md`/`.markdown`/`.docx`:
  - A file is compared with its versioned siblings (`v1.0`, `v1.1`, `(2)`, *draft*, *final* share a stem).
  - A folder contributes its files (optionally filtered by `match`).
- **Approved** means:
  - Lumen's lifecycle stamp `> Approved by … on …` (see [34](34-guided-lifecycle-runs.md)), unless marked *Based on
    unapproved inputs*.
  - A `Status: Approved` line near the top.
  - An Approver property, or Status=Approved, on a Word file.
- Versions come from the Word Version property or the file name; ties go to the newest file.
- The latest **approved** version is included. Newer unapproved versions are left out and logged as a *Newer draft* open
  item. No approved version, or no file, makes the artefact *Missing* (or *Missing (optional)* when `required: false`).
- **Approvals** count as recorded only when the definition gives an approver and a date, or names an included artefact
  that has an approver. Otherwise the approval is *Open*.
- Open items: newer drafts, missing artefacts, open approvals, the definition's open items, and open Medium/High RAID
  items (owner and cell); an unreadable RAID log becomes a warning.
- **Writes only into** `Gate packs/<gate>/`:
  - `<gate> - gate pack.docx`: the index, then each artefact with file, version and approver, through `toDocx` with the
    optional template; properties Gate, Assembled at, Status.
  - `<gate> - index.md`: artefacts, approvals, open items.
  - `<gate> - open items.xlsx`: sheet Open items with #, Type, Item, Detail, Owner, Due, Status.
  - `Artefacts/` copies of the included files.
  - Earlier packs are never overwritten; numbered copies are saved instead.
- **Ready** means no required artefact is missing and every approval is recorded.
- The agent says plainly whether the gate is ready, never describes an unapproved draft as approved and never records an
  approval the person has not given.

## Outputs
- One line (ready or not, and why), a table of artefacts (included or missing, file, version, approver, date), open
  approvals, newer drafts left out, other open items, and what must happen before the gate. Plus the four outputs above.

## Acceptance criteria
- From the sample `Architecture/Design gate.json` the pack is not ready (`test/governance.test.js` › the gate pack
  includes only approved versions and lists what is missing):
  - It includes the Technical Design and Interface Catalogue v1.0, and lists v1.1 as a newer unapproved draft.
  - The Solution Blueprint is missing (unapproved) and the Security Assessment is missing (absent).
  - Design Authority is Approved and Business Owner is Open.
  - The pack and the index exclude v1.1, the open-item log has one row per open item, a second run doesn't overwrite, and
    a gate with no name is refused.
- A Word file with Approver and Version properties is chosen over a newer unapproved Word version (› a Word artefact
  counts as approved from its document properties).
- In a read-only chat nothing is written; with edit access the index is created; an artefact path outside the project
  folder is refused (› architecture tools are exposed; gate packs and inventory proposals need edit access).
- With the real engine: `e2e/real-engine-plans-2.spec.js` › Architecture: the design gate pack is not ready, and no
  approval is recorded.

## Limits
- Approval is read from stamps, status lines and Word properties only; no e-signature or ADO approval is checked.
- Only Markdown and Word artefacts can be included.

## Source
- `tools/governance.js` (`assembleGatePack`, `approvalOfFile`, `artefactCandidates`, `versionOf`, `stemOf`).
- `tools/publish.js` (`approvalOf`); `tools/md-export.js` (`toDocx`, `readDocxProperties`); `tools/status.js` (`readRaid`).
- `tools/office-mcp.js` (tool `assemble_gate_pack`); `skills/architecture/SKILL.md`.
- `defaults/assistants.json` (agent **Gate Pack Assembler**); `defaults/recipes.json` (prompt **Assemble a gate pack**).
- `samples/aidlc/Architecture/Design gate.json`, `samples/aidlc/Architecture/Design/`.
