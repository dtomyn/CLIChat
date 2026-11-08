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

## Status: implemented (7 Nov 2026)

Shipped: `tools/controls.js` (`readControlCatalogue`, `readSctm`, `writeSctm`, `indexEvidence`, `analyzeControls`, `proposeSctm`), MCP tools `analyze_controls` (read-only) and `write_sctm` (edit mode) with labels, the `security-saa` skill, the Security Control Mapper 🛡️, Security Documentation 📘 and CAE Evidence 🗂️ agents, three *Security* prompts (Draft the SCTM, Security design document, Evidence gap check), the sample in `samples/security` (from new `scripts/make-security-sample.js`), and `test/controls.test.js`.

Deviations from the design:
- **Citations.** A design reference is checked against the headings of the FDD/TDD passed in (Markdown, text or Word). It matches a heading's title or its number (`TDD > 3.2 Encryption at rest`, `TDD §5.2`), and it can name the document by file name or as TDD/FDD/SDD. A statement with no reference, or one that cites no real heading, gets Status **Needs input** in the `(proposed)` copy, and the *Proposed changes* sheet says why. If no design document is given, references aren't checked and the tool says so. Rows with no reference are still marked Needs input.
- **Evidence.** Files are tied to controls by an ID in the file name (`AC-2 - …`), by an evidence index workbook in the folder (a file named like *index*, with File, Control(s) and Date columns), or by the SCTM's evidence references. *Missing* means a named file isn't there, or a control is Implemented with no evidence at all. *Stale* uses the date from the index, then a `YYYY-MM-DD` in the file name, then the file date (default 365 days, `asOf` can be set). *Orphan* means a file with no known control ID that the SCTM and index don't name.
- **`write_sctm`** proposes changes rather than writing the SCTM: it saves `<SCTM> (proposed).xlsx` with an *Approve? (Yes/No)* column. There is no apply step; the assessor approves rows and updates the SCTM. It rejects controls that aren't in the catalogue. Remediation items (and every Gap row) go to `<SCTM> - remediation (ADO import).xlsx`, ready for Plan 08.
- **Security Design Document** uses the existing `save_draft_document` (Markdown plus Word through `md-export` `toDocx` with the Plan 18 program template). No new writer was needed. The skill can also put the approved SCTM and SDD into a gate pack through `assemble_gate_pack`.
- **Shared helpers.** `release.js` now exports `readSheet`, and `governance.js` exports `readText`, so both can be reused. `verifyQuotes` wasn't needed, because no transcript is involved. `lib/skills.js` needed no change, because skills are discovered from `skills/<id>/SKILL.md`.
- **The sample** lives in its own `samples/security` folder rather than in the AIDLC sample. Its catalogue wording is a short synthetic paraphrase, not ITSG-33 or NIST text.
- **Not verified in the running app.** The prompts haven't been run with the AI engine. Coverage comes from unit tests and MCP round-trip tests only.
