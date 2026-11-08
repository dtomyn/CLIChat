# 46 — Draft and check an interface control document

## Intent
As an integration analyst or architect, I want an interface control document (ICD) drafted from the approved
requirements, schemas and integration pattern notes, and checked for missing or empty sections, so that the provider
and consumer teams see exactly what is agreed and what is still open.

## Where
- Agent **Interface Designer** 🔌.
- Prompt **Draft an ICD** (category **Integration**).

## Inputs & controls
| Control | Effect |
|---|---|
| **Interface** (text) | e.g. "Case API (applicant portal → case management)". |
| **Requirements and design** (.docx/.md/.txt/.xlsx) | The approved sources. |
| **Interface schemas or OpenAPI spec (optional)** | .yaml/.yml/.json/.sql/.xlsx |
| `check_icd` `sections` (tool) | Section names to check instead of the standard ICD list. |

The prompt also reads the interface catalogue and `Knowledge/HIP Patterns.md`, and runs with **Create & edit files**.

## Behaviour (as implemented)
- **Drafting** (agent): every template section — purpose and scope, parties, protocol, integration pattern (ARO P4 or
  P5 with the reason from the HIP notes), message schemas, error handling, security, service levels and volumes — each
  citing its source. Where the sources are silent it writes "Needs input:" and the question; volumes, SLAs, fields and
  the pattern choice are never invented.
- **Saving**: `save_draft_document` as `Integration/ICD - <interface> (draft).md` with `word: true` and the ICD template
  in `Templates/` when there is one (the AIDLC sample has `Templates/ICD Template.dotx`). The draft label
  **Draft (AI) for review** goes at the top and the sources at the end; never overwrites (numbered copy). See
  [36](36-save-in-program-templates.md).
- **Checking** (`check_icd` → `icdCompleteness`): reads Markdown, text or Word, splits it by headings, and matches the
  nine standard sections (Purpose and scope; Parties; Protocol and transport; Integration pattern (HIP / ARO P4 or P5);
  Message schemas; Error handling; Security; Service levels (SLAs); Volumes). The shallowest matching heading wins, and a
  single H1 title is ignored. Each section is:
  - **missing** — no heading;
  - **empty** — only placeholders (TBD, TBC, TODO, N/A, `[…]`, `<…>`, "Needs input", dashes; a table header alone);
  - **incomplete** — the pattern section names no P4/P5/ARO/HIP, or lines still say Needs input / TBD / TBC;
  - **ok**.
- The result has the heading and line of each section, a score (% ok) and a completeness log. `check_icd` is read-only.
- The agent ends with the completeness log exactly as reported, the question that would close each gap and who should
  answer.

## Outputs
- The ICD draft as `.md` and `.docx`, then a completeness log, e.g. "Missing: Volumes: No heading for this section."
- Progress steps: "Saving draft Integration/ICD - …", "Checking <file> for missing ICD sections".

## Acceptance criteria
- The completeness log lists the empty and missing sections of the sample draft ICD (`test/openapi.test.js` › the ICD
  completeness log lists the empty and missing sections of the draft ICD).
- Needs input bullets and table cells count, and the section heading (not a subheading) is matched (› the ICD check
  counts Needs input bullets and table cells, and matches the section heading, not a subheading).
- Tools, agents and prompts are wired (› integration tools are exposed; write tools need edit access; › integration
  agents, prompts and skill are wired up).
- With the real engine the Case API ICD is saved as Word and the missing sections are listed
  (`e2e/real-engine-plans-2.spec.js` › Integration: the Case API ICD is drafted, saved as Word and checked for missing
  sections).

## Limits
- Section detection is heading-based: content without Markdown/Word headings is not recognised.
- The check covers completeness only, not whether the content is correct or consistent with the OpenAPI spec.
- Publishing the ICD (e.g. to the wiki) is a separate step ([39](39-approve-ado-changes.md)).

## Source
`tools/openapi.js` (`ICD_SECTIONS`, `sectionsOf`, `meaningful`, `icdCompleteness`, `checkIcd`), `tools/governance.js`
(`readText`), `tools/change.js` (`saveDraft`), `tools/office-mcp.js` (`check_icd`, `save_draft_document`),
`defaults/assistants.json` (agent **Interface Designer**), `defaults/recipes.json` (prompt **Draft an ICD**),
`skills/integration-design/SKILL.md`, `samples/aidlc/Integration/ICD - Case API (draft).md`,
`samples/aidlc/Knowledge/HIP Patterns.md`, `samples/aidlc/Templates/ICD Template.dotx`.
