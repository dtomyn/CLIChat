# 33 — Refine requirements into design and stories (AIDLC agents)

## Intent
As a business analyst, functional designer, solution architect or product owner, I want specialist agents that take
business requirements through refined requirements, functional design and technical design to epics, features and
stories, each with stable IDs and trace links, so that every stage lines up with the one before it and nothing is
invented along the way.

## Where
- Agents (all access `read` by default):
  | Agent | Produces | Skills |
  |---|---|---|
  | **Requirements Refiner** 🔬 | Refined requirements `BR-###.#` | `aidlc-lifecycle`, `program-knowledge`, `excel` |
  | **Functional Designer** 🧩 | Functional design `FD-###` | + `traceability` |
  | **Technical Designer** 🛠️ | Technical design `TD-###` | + `traceability` |
  | **Story Writer** ✍️ | Epics `EP-#`, features `FT-#.#`, stories `US-###` | + `traceability`, `azure-devops` |
- Prompts (category *Delivery lifecycle*, access `read`): **Refine business requirements**, **Draft the functional
  design**, **Draft the technical design**, **Write the backlog from the design**.
- Skill **AI-assisted delivery lifecycle** 🧬 (`aidlc-lifecycle`); the same agents run as stages in
  [34](34-guided-lifecycle-runs.md).

## Inputs & controls
| Prompt | Fields |
|---|---|
| **Refine business requirements** | **BRD** (file `.docx,.md,.txt,.pdf,.xlsx,.csv`), scope (text) |
| **Draft the functional design** | requirements (file `.xlsx,.csv,.docx,.md`), scope (text) |
| **Draft the technical design** | functional design (file `.xlsx,.csv,.docx,.md`), scope (text) |
| **Write the backlog from the design** | design (file `.xlsx,.csv,.docx,.md`), scope (text) |
- Agent starters, e.g. "Find ambiguity, gaps and conflicts in these requirements", "Which requirements have no
  functional design yet?", "Check these stories against our Definition of Ready".

## Behaviour (as implemented)
- **Layers and IDs** (skill): business requirement `BR-###` (source ID kept) → refined requirement `BR-###.#` →
  `FD-###` → `TD-###` → `EP-#` / `FT-#.#` / `US-###`. Epics, features and stories organise delivery; they are not
  requirements, and a requirement is never turned straight into a story.
- **Rules for every stage**: ground everything in program knowledge and cite it ([32](32-program-knowledge.md));
  never silently reinterpret upstream intent (flag it for its owner); every item carries a "Traces To" link
  (many-to-many allowed); keep IDs stable (new items take the next free number, removed ones are *Withdrawn*); status
  is `Draft (AI)` until a named person approves; finish with a **Needs human review** list.
- **Table layouts** so outputs line up in Excel:
  - Refined: `Req ID | Parent BR | Statement | Type | Acceptance criteria | Source | Status | Open questions`
  - Functional: `FD ID | Title | Type | Description | Business rules | Traces To | Status`
  - Technical: `TD ID | Component | Approach | Interfaces / data | NFRs | Traces To | Status`
  - Backlog: `Item ID | Type | Title | Parent | Description | Acceptance criteria | Implements | Status`
- **Gates**: downstream work starts from approved upstream items; going ahead anyway is labelled "based on
  unapproved inputs".
- Agent rules: the Refiner refines but doesn't redesign and lists ambiguity, untestable words, duplicates and
  conflicts as open questions; the Functional Designer describes behaviour, not technology, and records questions
  instead of inventing answers; the Technical Designer follows the Blueprint, says where it departs and why, and never
  changes functional behaviour to suit the technology; the Story Writer writes "As a… I want… so that…" stories with
  3–6 Given/When/Then criteria, each implementing at least one FD or TD ID, and flags design gaps instead of adding scope.
- The prompts tell the designers to use only approved requirements unless told otherwise, and end with a coverage check.
- With the default `read` access the result stays in the chat; saving a table as a file needs **Create & edit files**
  ([06](06-control-access-and-response-mode.md)), or saving the reply as Excel ([12](12-export-a-reply.md)).

## Outputs
- Chat tables in the layouts above, followed by open questions and a **Needs human review** list.
- Stories can go on to Azure DevOps as proposals ([39](39-approve-ado-changes.md)).

## Acceptance criteria
- Each agent's output uses its layer's ID scheme and a "Traces To" / "Implements" column to the layer above.
- A story with no FD or TD link is flagged, not silently accepted.
- Output is marked `Draft (AI)` and ends with **Needs human review**.
- These are prompt and skill rules; no automated test checks the agents' answers (the traceability rules behind
  them are tested in [35](35-requirements-traceability.md)).

## Limits
- The ID scheme and workbook layout are placeholders until the program agrees its real TRM structure (`README.md`).
- Existing installs keep their saved built-in agents; new default skills appear only after **Restore defaults**.
- Approval here is a status label; the recorded, gated approval is the lifecycle run in
  [34](34-guided-lifecycle-runs.md).

## Source
`skills/aidlc-lifecycle/SKILL.md`, `skills/program-knowledge/SKILL.md`, `skills/traceability/SKILL.md`,
`defaults/assistants.json` (`requirements-refiner`, `functional-designer`, `technical-designer`, `story-writer`),
`defaults/recipes.json` (`aidlc-refine-requirements`, `aidlc-functional-design`, `aidlc-technical-design`,
`aidlc-write-backlog`), `samples/aidlc/`.
