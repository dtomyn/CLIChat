# 34 — Run the lifecycle as stages with approval gates

## Intent
As a delivery lead, I want to run requirements → functional design → technical design → stories → test cases as one
guided run, where each stage is reviewed and approved by a named person before the next one starts, so that the
hand-offs are visible, auditable and never built on unapproved work without saying so.

## Where
- **Lifecycle** in the left rail (`#/runs`, marked **Lumen only**); the page lists saved workflows and runs.
- **Create workflow**, **Customize**, and **Duplicate** open the workflow editor. A workflow defines its ordered stages,
  stage agent, instructions, Markdown output filename, optional Word template, optional-stage setting, and optional
  traceability check. Built-in workflows can be customized or duplicated; user-created workflows can also be deleted.
- **Start** on a workflow opens the run setup dialog.
- The run page (`#/run/<id>`): a flow diagram with one box per stage, coloured by status (click or Enter selects a stage), and the selected stage's actions. **Start all N ready stages** appears when more than one pending stage has its inputs approved.

## Inputs & controls
| Control | Effect |
|---|---|
| **Run name** | Up to 80 characters; `<>:"/\|?*` and control characters are removed, trailing dots/spaces trimmed. Names the folder `Lifecycle/<run name>/`. |
| **Source files** | Checkboxes for every file in the current project folder; at least one is required. |
| **Create workflow** / **Customize** / **Duplicate** | Opens the editor to configure workflow details, stage order and instructions, agents, output filenames, templates, optional stages and traceability checks. |
| **Skip optional stage** / **Add this stage to the run** | Skips an optional stage, or restores it if no later stage has started. After a skip, the stages that start after it use what it would have used. |
| **Start stage** / **Run again** | Starts a `pending` or `rework` stage in its own chat. |
| **Start anyway** (dialog "Use unapproved inputs?") | Overrides the gate when a stage it starts after isn't approved. |
| **Open stage chat** / **Open output** | Opens the stage's chat, or its Markdown output in its app. |
| **Traceability check** | Advisory read-only check of a stage in review (shows **Checking…** while it runs). |
| **Approve** | Approves a stage in review. |
| **Send back** | Returns a stage in review or approved to `rework` and opens its chat. |
| **Save as Word** / **Save as Word (program template)** | On approved stages; see [36](36-save-in-program-templates.md). |
| **Publish to the Azure DevOps wiki** / **Create work items in Azure DevOps** | On approved stages when connected; see [39](39-approve-ado-changes.md). |

## Behaviour (as implemented)
- **Built-in workflow** `aidlc` ("Requirements to stories", from `defaults/pipelines.json`):
  | Stage | Agent | Output |
  |---|---|---|
  | Refine requirements | **Requirements Refiner** | `01-requirements.md` |
  | Functional design | **Functional Designer** | `02-functional-design.md` (Word template `Templates/FDD Template.dotx`) |
  | Technical design | **Technical Designer** | `03-technical-design.md` (Word template `Templates/TDD Template.dotx`) |
  | Stories | **Story Writer** | `04-stories.md` |
  | Test cases (optional) | **Test Designer** | `05-test-cases.md` |
  The gate check uses **Traceability Analyst**.
- **Workflow editor** (`/api/pipelines`): workflows are validated and saved in `data/pipelines.json`. Stages can be
  added, removed and reordered. Output names must be distinct Markdown filenames; stage agents and prompt lengths are
  validated. Optional stages can be skipped during a run, and may be added back if no stage that depends on them has started.
  Each stage after the first has **Starts after** checkboxes listing the stages above it (saved as `after`, stage ids).
  Without `after` a stage starts after the stage directly above it, so older workflows stay sequential. Ticking
  several stages makes it wait for all of them (fan-in); several stages starting after the same one run side by side
  (fan-out); ticking none makes it start from the sources. `after` may only name earlier stages (400 otherwise) and is
  stored only when it differs from the default. A **Flow** diagram in the editor updates as you change it.
- **Creating a run** (`POST /api/runs`): the workflow definition is copied into the run so later edits or deletion
  won't change it; sources must be existing files inside the project folder; a run folder that
  already exists is refused (409); the `Lifecycle` folder must resolve inside the project folder. Runs are saved under
  `data/runs/` and survive a restart.
- **Starting a stage**: allowed only from `pending` or `rework`. If a stage it starts after isn't approved or skipped the
  server refuses (409, "Approve the stages this one starts after, or explicitly override the approval gate.") unless
  `override` is sent; it also waits for those stages if still running, and needs their outputs (looking through skipped
  stages to what they used) and all sources to exist. The stage chat (title `<run>: <stage>`) runs with **Create & edit
  files** and pins the sources plus those outputs; `{{prev}}` lists them comma-separated.
  The prompt fills `{{sources}}` / `{{prev}}` and adds "Save your final output as a Markdown file at …" (and "Clearly
  label it as based on unapproved inputs" when overridden).
- **Statuses**: `pending` → `running` → `review` when the reply ends and the output file exists; otherwise `rework`
  with the reason ("The stage did not create its output file", stopped, or the error). A stage still `running` when
  its chat is no longer active becomes `rework` ("The stage was interrupted…"). The page polls every 2 s while a
  stage or check runs.
- **Unapproved inputs**: an overridden stage's output gets `> Based on unapproved inputs` at the top; the label is
  removed when the stage is redone from approved inputs.
- **Traceability check**: only on a stage in `review`; a new **read**-access chat with **Traceability Analyst**,
  pinned to the inputs (outputs of the stages it starts after, or the sources when there are none) and the output. Prompt: "Report gaps and
  findings only; do not change any files." The reply shows under **Traceability findings** with **Open check chat**. It
  is advisory: approving doesn't depend on it. A new message in the stage chat clears the findings.
- **Approve**: needs your name in Settings (400 "Set your name in Settings before approving."). Records `approvedBy`,
  `approvedAt`, increments `version`, and writes `> Approved by <name> on <ISO time>` as the output's first line
  (replacing an earlier stamp).
- **Send back**: removes the stamp; every stage that depends on it (directly or indirectly) and has started goes to `rework`, loses its stamp and is
  labelled as based on unapproved inputs. Refused while one of those stages or checks is running. Stages on other branches are unaffected. A reply in the stage chat
  that leaves the output in place moves the stage back to `review`.
- **Chat guards**: an approved stage's chat refuses new messages ("Send this approved stage back before changing
  it."); a stage in review whose dependent stages have started refuses them too ("Send this stage back before changing
  inputs used by later stages.").
- Saved built-in pipelines from before the **Test cases** stage get it once, after **Stories**; a stage the user removed is
  not added back (`lib/pipeline-migrate.js`).

## Outputs
- `Lifecycle/<run name>/01-requirements.md` … `05-test-cases.md`, each stamped when approved.
- One chat per stage and per check; the run list shows "<name> · <approved>/<stages> approved".

## Acceptance criteria
- `test/lifecycle-context.test.js` › lifecycle gates, checks, override, rework and persisted approvals: a later stage
  can't start before approval (409); the check runs read-only; an overridden stage is labelled; approval stamps the
  file once; an approved stage's chat refuses messages; send back resets later stages; all 5 stages approve and the
  state survives a server restart.
- `test/pipeline-editor.test.js` › workflows can be created, customized and removed without changing existing runs:
  validates a workflow, verifies its run uses the saved snapshot after workflow edits/deletion, and exercises optional
  stage skip/include.
- `test/pipeline-migrate.test.js` › a saved pipeline from before the tests stage gets it once, after Stories, without
  touching other stages; › a stage the user removed is not added back; › only built-in pipelines are touched, and odd
  data is tolerated; › the store applies the migration to a saved pipelines file on start-up.

## Decisions
- Outputs are Markdown files in the project folder; approval is a click in Lumen recorded with name and time;
  the traceability check is advisory, not blocking (`docs/plans/06-guided-lifecycle-pipeline.md`).

## Limits
- Stages can fan out and fan in through "Starts after", but there are no conditional steps (a stage cannot run or skip itself based on another stage's output).
- Single-user approval; no external sign-off or Jira sync.

## Source
`lib/server/routes/pipelines.js`, `lib/server/routes/runs.js`, `lib/server/lifecycle.js`, `lib/server/stage-output.js`, `lib/server/routes/chat.js` (`/api/pipelines`, `/api/runs`, stage actions `start`/`skip`/`include`/`approve`/`rework`/`check`/`word`/`azure-devops`,
`reconcileRun`, `startRunTurn`, `stageDeps`, `stageInputs`, `stageDependents`, `stampOutput`, `labelUnapproved`, `clearUnapproved`, `handleChat` guards),
`public/js/runs.js` (`renderRuns`, `openPipelineEditor`, `startNewRun`, `renderRun`, `flowHTML`), `public/index.html` (rail item **Lifecycle**),
`defaults/pipelines.json`, `lib/pipeline-migrate.js` (`migratePipelines`, `FIRST_RELEASE_STAGES`), `lib/store.js`
(`runs`, `pipelines`).
