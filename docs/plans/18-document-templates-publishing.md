# Plan 18: Document templates and knowledge publishing

**Use cases:** 8 FDD in Word from the program template · 9 TDD in Word from the template · 37 ADO Wiki → SharePoint publishing and freshness checks
**Size:** medium (two sessions)
**Files:** `tools/md-export.js`, new `tools/publish.js`, `tools/office-mcp.js`, `server.js`, `public/app.js`, `defaults/pipelines.json`, `skills/aidlc-lifecycle/SKILL.md`, `test/md-export.test.js`, `test/publish.test.js`
**Needs first:** nothing. Plan 08 phase 2 adds live wiki reading as a source.

## Why

The catalogue repeatedly says "Word via Pandoc". Lumen already converts Markdown → Word without Pandoc (`tools/md-export.js`), but only with built-in styling. Programs want their **own template** (styles, cover page, headers, numbering), and approved knowledge snapshotted for SharePoint with a freshness log. This plan unblocks Plans 13, 15 and 16.

## Decision to confirm with the owner
Pandoc is a separate download. **Default: no Pandoc.** Extend `md-export.js` to use a `.dotx`/`.docx` reference template, which is what Pandoc's `--reference-doc` does. If the owner prefers Pandoc, detect it on PATH and use it when present, without installing it.

## Design

### 1. Template-based Word output
- `toDocx(markdown, { template })` opens the template with JSZip and keeps its `styles.xml`, `numbering.xml`, headers, footers and theme. It maps Markdown to the template's style IDs (Heading 1–4, List Bullet, Table Grid, Caption) by name, falling back to the built-in styles. It fills `{{title}}`, `{{version}}`, `{{date}}` and `{{approver}}` content controls or placeholders on the cover page.
- Templates live in the notebook `Templates/` folder. A per-stage mapping in `defaults/pipelines.json` (`"wordTemplate": "Templates/FDD Template.dotx"`) makes an approved lifecycle stage offer **Save as Word (program template)**.

### 2. Publishing and freshness (UC 37): `tools/publish.js`
- `publishSnapshot(sources, dest)` converts approved Markdown (lifecycle outputs, or a wiki export folder; live wiki comes with Plan 08) into Word/HTML snapshots under `Published/<library>/`, with the version, approver and source revision in document properties.
- It writes and updates `Published/publishing-log.xlsx` (source, revision/hash, published at, approver, destination).
- `freshnessCheck(log)` re-hashes the sources and lists snapshots that are stale (source changed since publishing), sources that were never published, and orphan snapshots.
- MCP tools: `publish_snapshot` (edit mode) and `check_freshness` (read-only). Add a **Prompts › Knowledge freshness** scheduled check.

## Steps
1. Add template support in `md-export.js`, with tests (styles preserved, placeholders filled, fallback when the template is missing).
2. Add the pipeline `wordTemplate` setting and the UI action on approved stages.
3. Build `publish.js`, the log and the freshness check, with tests, plus the tools and scheduled prompt.
4. Add sample `Templates/FDD Template.dotx` and `TDD Template.dotx` to the AIDLC sample, then check in Word.

## Acceptance checks
- An approved FDD saved with the template opens in Word with the program's styles and a filled cover page.
- Editing a source after publishing makes the freshness check report it as stale.
- No Pandoc and no new package are required.

## Out of scope
Uploading to SharePoint. The notebook in OneDrive/SharePoint sync is the publishing path.
