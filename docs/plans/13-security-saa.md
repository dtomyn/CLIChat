# Plan 13: Security and SA&A

**Use cases:** 21 Security-control mapping (SCTM) · 22 Security design documentation · 23 CAE control evidence
**Size:** medium (two sessions)
**Files:** new `tools/controls.js`, new `skills/security-saa/SKILL.md`, `tools/office-mcp.js`, `lib/skills.js`, `defaults/assistants.json`, `defaults/recipes.json`, new `scripts/make-security-sample.js`, `test/controls.test.js`
**Needs first:** Plan 18 (Word templates) for the Security Design Document.

## Why

SA&A work is mostly matching: controls (ITSG-33 / NIST) to design statements and to evidence files. Code does the matching and gap counting. The AI drafts the narrative, and an assessor approves.

## Design

### 1. `tools/controls.js` (pure, unit-tested)
- `readControlCatalogue(file)` reads a control catalogue workbook (ID, family, title, statement, profile/baseline). **We don't ship ITSG-33 text.** The program supplies its own catalogue, and the sample uses a short synthetic one.
- `readSctm(file)` / `writeSctm(file, rows)` handles the SCTM: control, applicability, implementation statement, responsible party, design reference, evidence references, and status (Planned/Implemented/Gap).
- `indexEvidence(folder, sctm)` walks an `Evidence/` folder (files named or tagged with control IDs, e.g. `AC-2 - user access review.pdf`, or listed in an index sheet). It returns, per control, the evidence found, missing evidence, stale evidence (older than N days) and orphan files.
- MCP tools: `analyze_controls` (read-only) and `write_sctm` (edit mode, writes a `(proposed)` copy).

### 2. Agents and prompts
- **Security Control Mapper** 🛡️ maps controls to the architecture and FDD/TDD, drafts implementation statements citing design sections, and proposes remediation items.
- **Security Documentation** 📘 drafts the Security Design Document from the template, SCTM and architecture (Word via Plan 18).
- **CAE Evidence** 🗂️ builds the evidence index, gap tracker and remediation list from `indexEvidence`.
- Prompts (category *Security*): Draft the SCTM, Security design document, Evidence gap check.
- Remediation items are written as an ADO-import workbook now, and pushed through Plan 08 later.

### 3. Sample data
A 20-control synthetic catalogue, a partially filled SCTM, and an `Evidence/` folder with one stale and one orphan file.

## Acceptance checks
- The evidence check reports the missing, stale and orphan items exactly.
- Implementation statements cite a real heading in the FDD/TDD. Any statement without a citation is marked *needs input*, never invented.
- The original SCTM is never modified.

## Out of scope
Scanning Azure, Fabric or Purview configuration directly (that needs live access; revisit with Plan 17's drift work).
