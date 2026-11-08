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
