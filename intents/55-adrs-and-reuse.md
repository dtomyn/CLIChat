# 55 — Draft ADRs, index them, assess reuse vs. build

## Intent
As an architect or tech lead, I want to see every architecture decision record with its status, draft a new ADR from
a decision discussion, and check the reusable-asset register before anyone builds something new, so that decisions stay
recorded and current and we don't build what already exists.

## Where
- Agent **ADR & Reuse Advisor** 🧭.
- Prompts **Draft an ADR** and **Reuse vs. build assessment** (category **Architecture**).
- `index_adrs` is available to any agent with the `architecture` skill (e.g. "List our ADRs and their status").

## Inputs & controls
| Control | Effect |
|---|---|
| **Draft an ADR** › **Decision discussion** (.docx/.md/.txt/.vtt), **ADR folder**, **Decision** | Indexes the folder, then drafts and saves the next ADR. |
| **Reuse vs. build assessment** › **Reusable-asset register** (.xlsx/.xlsm/.csv), **What do we need?**, **Design that proposes the build** (optional) | Compares the need with each candidate asset. |
| `index_adrs` › `folder`, `referencedIn` | The ADR folder (or one file), and design documents to scan for references to superseded ADRs. |

## Behaviour (as implemented)
- **Parsing** (`parseAdr`): MADR or Nygard Markdown, including YAML front matter (`status`, `date`, `supersedes`,
  `superseded-by`).
  - The ID comes from front matter, the file name (`ADR-003-…`, `0007-…`) or the title, normalised to `ADR-nnn`.
  - Status is read from a `Status:` line or a Status section and mapped to Accepted, Proposed, Superseded, Deprecated or
    Rejected.
  - Also read: date, context, decision (or *Decision outcome*), consequences, "Supersedes/Replaces ADR-n" and
    "Superseded by ADR-n".
- **Index** (`readAdrs`): `.md`/`.markdown` files up to 3 folders deep, skipping README, index and template files. A
  folder without ADR files is refused. It reports:
  - ADRs with no ID or no status, and duplicate IDs.
  - Status conflicts: superseded by another ADR but not marked Superseded, or marked Superseded with no successor.
  - References to ADRs not in the folder.
  - Superseded ADRs still referenced, by live ADRs or by the `referencedIn` documents (with heading and line).
  - Possible duplicate decisions: live ADRs whose title and decision are ≥ 0.5 similar.
- The index lists ID, title, status, date, supersedes, superseded by, file and the first 300 characters of the decision,
  with counts by status. It is read-only.
- **Drafting**: MADR layout (title, status **Proposed**, date, context and problem statement, considered options with pros
  and cons, decision outcome, consequences good and bad, links).
  - It is numbered after the last ADR from `index_adrs` and drafted only from the discussion given; what it doesn't settle
    becomes an open question.
  - When it replaces an ADR it says *Supersedes ADR-nnn* and lists the documents that still cite the old one.
  - Saved with `save_draft_document` as `<ADR folder>/ADR-nnn-<short-title>.md`, listing the discussion as its source.
    Acceptance is left to the Design Authority.
- **Reuse vs. build** (read-only prompt): reads the register, matching the need to assets by what they do, not only by
  name.
  - A table per candidate: Asset (cell), What it does, Fit (Full/Partial/None), Gaps, Effort to reuse, Effort to build.
  - One recommendation paragraph that prefers reuse unless a must-have gap rules the asset out, and names that gap.
  - When a design proposes the build, it says whether an ADR is needed. Every fact cites the register cell or document
    heading.

## Outputs
- The ADR index with findings; a saved draft ADR; a reuse recommendation table and paragraph.

## Acceptance criteria
- Nygard and MADR files parse to the right ID, title, status, date, supersedes and superseded-by; a file with no status
  gives `null` (`test/governance.test.js` › ADRs parse in Nygard and MADR style).
- The sample folder indexes 3 ADRs (ADR-002 superseded by ADR-003). The TDD's reference to ADR-002 under *Photo
  validation* is flagged, and the internal map is not serialised (› the ADR index flags the superseded ADR that the TDD
  still cites).
- No status, a status conflict, an unknown ADR-042, a live ADR citing a superseded one and a duplicate decision are each
  found, and superseded ADRs are not compared for duplicates (› ADR findings: no status, status conflicts, unknown
  references and duplicate decisions).
- `index_adrs` works read-only through the MCP server (› architecture tools are exposed; gate packs and inventory
  proposals need edit access).
- With the real engine: `e2e/real-engine-plans-2.spec.js` › Architecture: the ADR is drafted as ADR-004, Proposed, from
  the discussion, › Architecture: reuse vs. build recommends the enterprise address lookup API.

## Limits
- Only Markdown ADRs are indexed; Word ADRs are not.
- Duplicate detection is word similarity, so it can miss reworded duplicates or flag related decisions.
- The reuse assessment is the agent's judgement over the register; there is no dedicated tool.

## Source
- `tools/governance.js` (`parseAdr`, `readAdrs`, `adrRefs`); `tools/tests.js` (`similarity`).
- `tools/office-mcp.js` (tools `index_adrs`, `read_spreadsheet`, `save_draft_document`).
- `skills/architecture/SKILL.md`.
- `defaults/assistants.json` (agent **ADR & Reuse Advisor**).
- `defaults/recipes.json` (prompts **Draft an ADR**, **Reuse vs. build assessment**).
- `samples/aidlc/Architecture/ADRs/`, `samples/aidlc/Architecture/Reusable assets.xlsx`.
