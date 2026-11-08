# Plan 16: Architecture and governance

**Use cases:** 31 Architecture and design consistency review · 38 ADRs and reuse vs. build · 40 Stage-gate packs · 42 Technical catalogues and inventories
**Size:** medium (two sessions)
**Files:** new `tools/governance.js`, new `skills/architecture/SKILL.md`, `tools/office-mcp.js`, `lib/skills.js`, `defaults/assistants.json`, `defaults/recipes.json`, `scripts/make-aidlc-sample.js`, `test/governance.test.js`
**Needs first:** Plan 18 (templates and multi-file Word output) for gate packs.

## Design

### 1. `tools/governance.js` (pure, unit-tested)
- `readAdrs(folder)` parses ADR Markdown files (MADR or Nygard style: title, status, date, context, decision, consequences, supersedes) into an index. It flags ADRs with no status, superseded ADRs still referenced, and duplicated decisions.
- `checkConsistency(docs)` extracts named things (components, APIs, entities, ADR IDs, standards) from the FDD/TDD/API specs/data model with simple patterns and headings. It reports names used in one document but missing from the others, entity/field mismatches against the data model (reusing Plan 11's `readSchema` when available), and references to unknown ADRs. These findings are evidence for the AI's review.
- `assembleGatePack(manifest)` takes a gate definition (gate name, required artefacts, required approvals) and collects the latest approved version of each artefact, using lifecycle-run approval metadata where it exists. It writes `Gate packs/<gate>/` (combined Word via `md-export`, plus an index with open items and approval status) and lists missing artefacts.
- `diffInventory(inventory, changes)` compares a catalogue workbook (solution components, APIs, integrations, dependencies) against change sources: an ADO export, an ADR index, `git log --name-only` text supplied as a file, or design docs. It proposes added, changed or retired rows in a `(proposed)` copy.
- MCP tools: `index_adrs`, `check_consistency` and `assemble_gate_pack` (writes only into `Gate packs/`), and `propose_inventory_updates`.

### 2. Agents and prompts
- **Architecture Reviewer** 🏛️ reviews designs against standards and ADRs, and produces a findings and deviation log plus a remediation backlog (ADO-import workbook).
- **ADR & Reuse Advisor** 🧭 drafts ADRs from a decision discussion, and checks the reusable-asset register before recommending a new build.
- **Gate Pack Assembler** 📦 builds the pack and the open-item log.
- **Inventory Keeper** 🗃️ proposes catalogue updates from delivery changes.
- Prompts (category *Architecture*): Architecture review, Draft an ADR, Reuse vs. build assessment, Assemble a gate pack, Update technical inventory.

### 3. Sample data
Add `Architecture/ADRs/` (three ADRs, one superseded but still referenced), `Reusable assets.xlsx`, `Technical Inventory.xlsx`, and a component named in the TDD that's missing from the blueprint.

## Acceptance checks
- The consistency check finds the seeded mismatch and the superseded-ADR reference.
- The gate pack lists missing artefacts and only includes approved versions.
- Inventory updates go to a `(proposed)` copy only.

## Out of scope
Diagram generation, and reading GitHub PRs live (use exported files).

## Status: implemented (7 Nov 2026)

Shipped: `tools/governance.js` (`readAdrs`, `checkConsistency`, `assembleGatePack`, `diffInventory`), MCP tools `index_adrs`, `check_consistency`, `assemble_gate_pack` and `propose_inventory_updates` with labels, the `architecture` skill, the Architecture Reviewer 🏛️, ADR & Reuse Advisor 🧭, Gate Pack Assembler 📦 and Inventory Keeper 🗃️ agents, five *Architecture* prompts, the architecture sample in `samples/aidlc` (from `scripts/make-aidlc-sample.js`), and `test/governance.test.js`.

Deviations from the design:
- **Data model check.** Plan 11's `readSchema` isn't built, so `checkConsistency` has its own small reader. It takes an Entities sheet (Entity) and an Attributes sheet (Entity, Attribute). It flags entities in a document table column headed *Entity* that the model doesn't have, attributes listed next to them, and `Entity.field` references that aren't in the model.
- **What counts as a name.** Components, APIs and integrations come from table columns headed Component, Platform, Service, System, API, Interface or Integration, and from sub-headings under a *Components*, *Services*, *APIs*, *Interfaces* or *Integrations* heading. Text in parentheses is ignored. A name is "missing" when another document doesn't mention it as words, so a renamed component shows up as a finding. The tool says the findings are leads, and the agent confirms them in the text. Endpoints (`GET /path`) are only compared between documents that list endpoints. Standards (WCAG, ISO, PCI DSS, OWASP, NIST, ITSG) are reported when the versions differ.
- **Approved versions.** An artefact is approved when it has Lumen's lifecycle stamp (`> Approved by … on …`, unless it's marked *Based on unapproved inputs*), a `Status: Approved` line near the top, or an Approver or Status=Approved property on a Word file. Versions come from the file name (`v1.2`) or the Word Version property. An artefact path can be a file (its versioned siblings are compared too) or a folder. An approval in the gate definition counts as recorded only when it has an approver and a date, or when it names an included artefact that has an approver.
- **Gate pack output.** `Gate packs/<gate>/` holds `<gate> - gate pack.docx` (index, then each artefact, through `md-export` `toDocx` with an optional program template from Plan 18), `<gate> - index.md`, `<gate> - open items.xlsx` and `Artefacts/` copies. Earlier packs are never overwritten, so a numbered copy is saved instead. The open items also take open Medium and High items from an optional RAID log. The gate definition is a JSON file or inline arguments.
- **Inventory proposals.** Retire comes from retire, decommission, sunset, remove or replace wording next to a catalogue name, in a commit message, work item title or accepted ADR. Change comes from any mention of a catalogue name, or a commit touching its folder (`services/eligibility-service/` matches *Eligibility service*). It proposes the newer *Last changed* date, else a review. Add comes from new folders, from "add/build/introduce … service/API" wording, and from design-document names that no cell in the inventory mentions. There is no apply step. The owner approves rows in the `(proposed)` copy and updates the inventory by hand.
- **Remediation backlog and ADRs** use the existing `create_spreadsheet` and `save_draft_document` tools rather than new writers.
- **`lib/skills.js` needed no change**, because skills are discovered from `skills/<id>/SKILL.md`.
- **Live-engine checks.** Besides the unit and MCP round-trip tests, the prompts have cases in `e2e/real-engine-plans.spec.js` and `e2e/real-engine-plans-2.spec.js`, which run them against a real engine when `E2E_ENGINE=copilot` or `claude` is set.
