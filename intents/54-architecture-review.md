# 54 — Review design consistency across documents

## Intent
As an enterprise or solution architect on the Design Authority, I want the blueprint, the functional and technical designs
and the API specs compared for names, standards, ADR references and data model use, so that I can write a findings and
deviation log and a remediation backlog with evidence for every finding.

## Where
- Agent **Architecture Reviewer** 🏛️.
- Prompt **Architecture review** (category **Architecture**).
- Any chat with the `architecture` skill can call `check_consistency`.

## Inputs & controls
| Control | Effect |
|---|---|
| **Solution blueprint or standards** (.docx/.md/.txt) | The reference document. |
| **Design to review (FDD, TDD or API spec)** (.docx/.md/.txt) | The document under review. |
| **ADR folder** (optional, e.g. `Architecture/ADRs`) | Checks ADR references against the index (see [55](55-adrs-and-reuse.md)). |
| **Data model** (optional, .xlsx/.xlsm/.csv) | Checks entities and fields the documents use. |
| `check_consistency` › `documents` | Two or more design documents; one gives a note instead of a comparison. |

## Behaviour (as implemented)
- Documents are read as text: `.docx`/`.docm` through the Word reader, `.md`/`.markdown`/`.txt` as is. Anything else is
  refused.
- **Names** (`extractNames`): components, APIs and integrations come from two places.
  - Table columns headed Component(s), Platform(s), Service(s), System(s), API(s), Interface(s), Integration(s),
    Application(s) or Solution component(s).
  - Sub-headings one level under a *Components*, *Services*, *APIs*, *Interfaces* or *Integrations* heading.
  - Text in parentheses, numbering and ID prefixes are dropped. Names of 3–60 characters only; TBC/TBD/N/A are ignored.
- **Missing across documents**: a name one document uses that another never mentions as words (singular and plural forms,
  and a squashed form for long names). Each finding lists where it is used (file and heading) and which documents miss it.
- **Endpoints** (`GET|POST|PUT|PATCH|DELETE /path`) are compared only between documents that list endpoints.
- **Standards** (WCAG, ISO/IEC, PCI DSS, OWASP ASVS / Top 10, NIST SP, ITSG) are reported when documents cite different
  versions of the same family.
- **ADR references** (`ADR-n`, any padding) are checked against the ADR folder's index.
  - References to unknown ADRs are listed.
  - So are references to Superseded, Deprecated or Rejected ADRs, or ones with a successor (with the superseding ADR).
  - Without an ADR folder, found references give a note that they were not checked.
- **Data model** (via the shared schema reader, so a workbook, SQL DDL or JSON Schema), checked two ways:
  - Entities in a document table column headed *Entity* / *Data object* that the model lacks, and attributes listed next
    to them that the entity lacks.
  - `Entity.field` references to fields the model lacks.
- Each finding cites the file and heading (and line where known). The result says the findings are pattern-based leads to
  review, not a verdict. Documents are never changed.
- **Agent workflow**: `check_consistency` first, then read the sections the findings point to and check the design
  against the blueprint's principles and standards.
  - The **findings and deviation log** has columns ID (AR-01…), finding, type (Inconsistency, Deviation from standard,
    Superseded decision, Data model mismatch, Gap), severity (High/Medium/Low), evidence, recommendation, and owner only
    when a document names one.
  - The **remediation backlog** uses the ADO import layout: ID, Work Item Type Task, Title, Description with the finding
    ID and evidence, Priority 1–4, Tags Architecture.
  - The prompt saves both with `create_spreadsheet`: `Architecture review - findings.xlsx` and
    `Architecture review - remediation (ADO import).xlsx` (see [26](26-work-with-excel.md)).
- The agent confirms each pattern-based finding in the text, says when a document explains one (e.g. a renamed
  component), and never approves a design.

## Outputs
- A short verdict, the three most important findings, the findings and deviation log table, and the two workbooks.

## Acceptance criteria
- On the AIDLC sample, blueprint vs. TDD gives these findings, and the TDD is unchanged (`test/governance.test.js` › the
  consistency check finds the seeded component, ADR and data model mismatches):
  - *Address lookup service* is missing from the blueprint.
  - ADR-002 (superseded by ADR-003) is cited under *Photo validation*.
  - The entity *Renewal Fee* and the field `Permit.renewalCount` are not in the data model.
- A missing endpoint, WCAG 2.1 AA vs. 2.0 AA and an unknown ADR-009 are found; a single document gives the
  "only one document" note; no documents is refused (› consistency: endpoints, standard versions and unknown ADRs; one
  document only gives a note).
- `check_consistency` works in a read-only chat and names the address lookup service (› architecture tools are exposed;
  gate packs and inventory proposals need edit access).
- The prompt and agent are wired up and every prompt field is used (› architecture agents, prompts and skill are wired
  up).
- With the real engine: `e2e/real-engine-plans.spec.js` › Architecture: review finds the unknown component, the
  superseded ADR and the data model gaps.

## Decisions
- The tools find facts and the agent judges them. A name is "missing" when it isn't mentioned as words, so renames show
  up and the agent must explain them rather than drop them.

## Limits
- Pattern-based extraction: names outside the recognised table columns or headings are not compared.
- The prompt's **Data model** field accepts only workbooks, though the tool also reads SQL DDL and JSON Schema.
- No diagram generation.

## Source
- `tools/governance.js` (`checkConsistency`, `extractNames`, `mentions`, `scan`, `adrRefs`, `readDataModel`, `readText`).
- `tools/data.js` (`readSchema`); `tools/office-mcp.js` (tool `check_consistency`).
- `skills/architecture/SKILL.md`.
- `agents/<id>.json` (agent **Architecture Reviewer**); `defaults/recipes.json` (prompt **Architecture review**).
- `samples/aidlc/Knowledge/`, `samples/aidlc/Architecture/ADRs/`.
