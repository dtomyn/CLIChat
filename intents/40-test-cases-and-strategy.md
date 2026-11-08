# 40 — Generate test cases, coverage gaps and the test strategy

## Intent
As a tester or test manager, I want SIT and UAT test cases written from the stories' acceptance criteria, a list of
requirements and stories that still have no test, and a draft test strategy, so that every requirement is proven and
the test effort follows risk.

## Where
- Agents **Test Designer** 🧪 (test cases, coverage) and **Test Planner** 🗺️ (strategy and master test plan).
- Prompts in the **Quality engineering** category: **Generate test cases from stories**, **Coverage gaps**,
  **Draft the test strategy**.
- The optional **Test cases** stage (`tests`) at the end of the delivery lifecycle run (see [34](34-guided-lifecycle-runs.md)).

## Inputs & controls
| Prompt | Fields | Access |
|---|---|---|
| Generate test cases from stories | **Stories (traceability workbook, backlog export or stories document)** (.xlsx/.xlsm/.md/.docx); **Which stories (optional)** | Create & edit files (**Saves a file**) |
| Coverage gaps | **Traceability workbook** (.xlsx/.xlsm) | Read my files |
| Draft the test strategy | **Scope document (PID or charter)**; **Requirements or traceability workbook**; **Project plan (optional)** (.mpp/.xml); **RAID log (optional)** | Read my files |

`write_test_cases` takes `path`, an optional `title` and `cases` (`id?`, `title`, `type` SIT/UAT, `priority` 1–4,
`tracesTo`, `preconditions`, `technique`, `steps` of `{ action, expected }`).

## Behaviour (as implemented)
- **Design rules** (agent instructions and the `test-design` skill): per Given/When/Then criterion a positive case, then
  negative and boundary cases for every limit and failure path; each case has a title, SIT or UAT, priority 1–4,
  preconditions and test data, numbered steps with one expected result each, and `tracesTo` story/requirement IDs.
  IDs and scope are never invented. Untestable criteria ("in a timely manner") are flagged with a measurable rewording.
  Cases are shown as a table first.
- **Saving** (`writeTestCases`): an Excel workbook in the Azure DevOps Test Plans import layout, sheet **Test cases**
  with one row per step (ID, Work Item Type `Test Case`, Title, Test Step, Step Action, Step Expected, Traces To,
  Priority, Type, Preconditions); the case fields sit on its first step row only. A **Coverage** sheet has one row per
  case (Test ID, Title, Type, Priority, Traces To, Steps, Technique).
- Cases without an ID get `TC-001`, `TC-002`… (skipping IDs already used). Type text containing "UAT/accept/user"
  becomes UAT, "SIT/system/integrat" SIT. A non-.xlsx path is changed to .xlsx.
- **Never overwrites**: an existing name gets `Name (2).xlsx`, `Name (3).xlsx`… and the result says so.
- Warnings (not refusals) for a case with no title, no steps, a step with no expected result, or no trace.
- **Coverage gaps** use `analyze_traceability` on the workbook's Tests sheet: test coverage per layer, requirements
  and stories with no test, tests tracing to withdrawn items, tests affected by changed requirements, each with a
  `Sheet!Cell`. A requirement counts as tested when a live test sits anywhere below it; a story only when a test traces
  to it directly. The prompt changes no files (details in [35](35-requirements-traceability.md)).
- **Test strategy**: sections Scope and out of scope; Test levels (unit, SIT, UAT, performance, accessibility,
  security); Environments (STE, UAT, STG, PRD); Entry and exit criteria; Test data (synthetic or masked, never real
  personal data); Defect management; Schedule from the plan; Risk-based priority (business impact × likelihood ×
  change impact → High/Medium/Low); Testing risks from the RAID log; Assumptions and open questions. Every fact cites
  its source; labelled **Draft (AI) for review**; no files are saved unless asked.
- `write_test_cases` is refused in **Read my files** / **Just chat** ("Editing files is turned off for this chat…")
  and outside the project folder.

## Outputs
- A cases table in the reply, then `Test cases.xlsx` (or a numbered copy) with the count of cases and steps,
  `byType`, the traced IDs, the layout note and any warnings.
- Coverage tables and the five most important tests to add.
- A cited strategy draft in the reply.
- Progress step: "Writing N test cases to <file>".

## Acceptance criteria
- The workbook has one row per step in the Test Plans layout and an existing file is never overwritten
  (`test/tests.test.js` › writeTestCases writes one row per step in the Test Plans layout and never overwrites).
- Traceability reads the Tests sheet and reports the uncovered requirement, the withdrawn-linked test and stories
  without tests (› traceability reads the Tests sheet: uncovered requirement, withdrawn-linked test, stories without
  tests); tests never count as design coverage (› a test does not stand in for design, and workbooks without tests get
  no test findings).
- `write_test_cases` is denied without edit access and outside the folder (› quality tools are exposed; writing needs
  edit access); agents, the four prompts, the skill and the `tests` stage are wired (› quality engineering agents,
  prompts, skill and lifecycle stage are wired up).
- With the real engine: cases for US-103 are saved and trace to the story (`e2e/real-engine-plans-2.spec.js` ›
  Quality engineering: test cases for US-103 are saved and trace to the story); coverage gaps lists BR-007, TC-011 and
  the untested stories and changes nothing (› Quality engineering: coverage gaps lists the untested items and the test
  on the withdrawn requirement); the strategy is a cited draft and saves nothing (› Quality engineering: the test
  strategy is a cited draft and saves nothing).

## Decisions
- Test cases go to an import workbook rather than straight into Azure DevOps Test Plans; live ADO writes are out of
  scope for this feature (see [39](39-approve-ado-changes.md) for ADO proposals).
- The `tests` lifecycle stage is optional and is added to existing saved pipelines by `lib/pipeline-migrate.js` unless
  the user removed it.

## Limits
- Case quality depends on the model; the code only validates shape and warns.
- The strategy is reply text; saving it needs a follow-up request (e.g. [36](36-save-in-program-templates.md)).
- No direct ADO Test Plans upload; the workbook is imported by a person.

## Source
`tools/tests.js` (`writeTestCases`, `freeName`, `testType`), `tools/traceability.js` (test layer),
`tools/office-mcp.js` (`write_test_cases`, `analyze_traceability`), `lib/tool-labels.js`, `defaults/assistants.json`
(agents **Test Designer**, **Test Planner**), `defaults/recipes.json` (prompts **Generate test cases from stories**,
**Coverage gaps**, **Draft the test strategy**), `defaults/pipelines.json` (stage `tests`, output `05-test-cases.md`),
`skills/test-design/SKILL.md`, `samples/aidlc/Requirements Traceability (sample).xlsx`.
