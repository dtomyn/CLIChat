# 58 — Publish knowledge snapshots and check freshness

## Intent
As a business analyst or knowledge owner, I want approved lifecycle outputs or a wiki export published as Word or HTML
snapshots with a publishing log, and a check that tells me which snapshots are out of date with their source, so that
the published knowledge stays trustworthy.

## Where
- Publishing: ask a lifecycle agent with **Create & edit files** (e.g. *"Publish the approved lifecycle outputs to the
  Design library."*). The `aidlc-lifecycle` skill gives **Requirements Refiner**, **Functional Designer**, **Technical
  Designer**, **Story Writer** and **Traceability Analyst** the `publish_snapshot` tool.
- Freshness: prompt **Knowledge freshness** (category **Delivery lifecycle**, agent **Traceability Analyst**). Any agent
  with the `program-knowledge` or `aidlc-lifecycle` skill can call `check_freshness`. The prompt can be repeated on a
  schedule (see [18](18-schedule-prompts.md)).

## Inputs & controls
| Control | Effect |
|---|---|
| `publish_snapshot` › `sources` | Markdown files or folders (folders are walked, skipping dot-folders and `Published/`). |
| `library` | `Published/<library>/` folder name (default Knowledge). |
| `formats` | `docx` and/or `html` (default `docx`). |
| `approver` | Only when the person names who approved an unstamped source. |
| `version` | Overrides the automatic version. |
| `template` | A Word template (.dotx/.docx) for program styles and cover page (see [36](36-save-in-program-templates.md)). |
| `force` | Republish even when the source is unchanged. |
| **Knowledge freshness** › **Folders that should be published** (optional) | Finds approved sources never published. |

## Behaviour (as implemented)
- **Only approved content is published**: a source needs Lumen's stamp `> Approved by <name> on <date>` (see
  [34](34-guided-lifecycle-runs.md)) or an approver given explicitly.
  - A source marked *Based on unapproved inputs* is always skipped, even with an approver.
  - A non-Markdown source or a missing path is refused.
- The stamp becomes metadata: the snapshot body starts after it, and the title is the first `#` heading (else the file
  name).
- Destinations keep the source's sub-folders: `Published/<library>/<sub>/<name>.docx|html`.
- Word snapshots go through `toDocx` with properties Version, Approver, Source, Source revision, Published at and Library,
  and fill the template's version, date and approver.
- HTML snapshots are standalone pages with the same values as `<meta>` tags and a header line.
- **Revision** is a SHA-256 hash (first 16 characters) of the source, with CRLF normalised, so line-ending-only changes
  don't count.
- A destination whose source revision is unchanged is skipped (*unchanged since last published*) unless `force`.
  Otherwise the version goes up by one (`1.0`, `2.0`…) unless given.
- **Log**: `Published/publishing-log.xlsx`, sheet Log, columns Source, Revision, Published at, Approver, Version,
  Destination, Library, Format.
  - One row per destination: a republish replaces it.
  - The log is written only when something was published.
- **Freshness** (`freshnessCheck`, read-only) re-hashes each logged source and reports:
  - **stale**: the source changed since publishing, with both revisions and the source's modified time.
  - **current**.
  - **missingSource**: the source was deleted or moved.
  - **missingSnapshot**: the logged file is gone.
  - **neverPublished**: Markdown under the given folders with no log row.
  - **orphans**: files under `Published/` no log row points at, ignoring `~$` files and the log itself.
- With no log and no sources it says *Nothing has been published yet*.
- The prompt leads with counts, then a table of stale snapshots (snapshot, source, version, approver, published at, source
  last changed), never-published sources, orphans and missing files, and the actions (re-approve then republish, publish,
  or remove). It changes no files.
- The skill tells agents never to invent an approver and to suggest republishing only after the source is re-approved.

## Outputs
- Snapshots under `Published/<library>/`, the updated log, and a list of what was published and skipped (with reasons).
- A freshness summary such as "1 stale, 0 current, 2 never published, 0 orphan snapshots, …".

## Acceptance criteria
- Publishing `Lifecycle` writes Word and HTML for the stamped FDD, with Version 1.0, Approver, Source and Source revision
  properties. The HTML carries the approver meta and not the stamp; the unstamped TDD and the unapproved-inputs stories
  are skipped; the log has the six leading columns (`test/publish.test.js` › publishes approved Markdown with properties
  and a log; skips unapproved sources).
- An explicit approver publishes the unstamped source but never the unapproved-inputs one (› an approver given explicitly
  publishes an unstamped source, never an unapproved-inputs one).
- Unchanged sources are skipped. Editing the source makes it stale with a new revision, and republishing gives version 2.0
  and replaces the log row (› editing a source after publishing makes it stale; republishing bumps the version).
- CRLF-only edits are not stale (› CRLF-only changes do not count as edits).
- Orphans, missing snapshots and missing sources are reported (› orphans, missing sources and missing snapshots).
- An empty folder says nothing is published; a missing path, a non-Markdown file and an empty list are refused (› nothing
  published yet, and bad input).

## Limits
- Uploading to SharePoint is out of scope: the notebook syncs through OneDrive/SharePoint. Reading SharePoint is possible
  separately through the WorkIQ connection ([intent 70](70-sharepoint-workiq.md)).
- Only Markdown sources; a live ADO wiki is not a source (export it first, or see [39](39-approve-ado-changes.md) for the
  reverse direction).
- There is no gallery prompt for publishing; it is asked for in chat.

## Source
- `tools/publish.js` (`publishSnapshot`, `freshnessCheck`, `readLog`, `collectSources`, `hashText`, `approvalOf`).
- `tools/md-export.js` (`toDocx`).
- `tools/office-mcp.js` (tools `publish_snapshot`, `check_freshness`); `lib/tool-labels.js`.
- `skills/aidlc-lifecycle/SKILL.md` (*Word output and publishing*); `skills/program-knowledge/SKILL.md`.
- `defaults/recipes.json` (prompt **Knowledge freshness**).
- `samples/aidlc/START HERE.md`.
