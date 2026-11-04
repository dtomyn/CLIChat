# Plan 06: Guided delivery lifecycle

**Enhancement:** run Refiner → Functional Designer → Technical Designer → Story Writer as one guided pipeline, with an explicit approval step between stages and a traceability check at each hand-off
**Size:** large (one full session; split at step 4 if needed)
**Files:** new `defaults/pipelines.json`, `lib/store.js`, `server.js`, `public/app.js`, `public/app.css`
**Helps to have:** Plan 02 (`forkConversation`), Plan 05 (pinned files)

## Why

The AIDLC flow in the README already has the assistants and the skill, but users have to move between chats by hand and carry the outputs over themselves. The **approval gates** between stages are still an open decision from the meeting ("Downstream work should start from **approved** upstream items" — `skills/aidlc-lifecycle/SKILL.md`). A pipeline makes that gate visible and auditable.

## Decisions to confirm with the owner before building

1. **Where stage outputs live:** markdown files in `<workspace>/Lifecycle/<run name>/` (recommended: easy to review, and it works with the office tools), or only inside the chat.
2. **What approval means:** a click in Lumen by the current user, recorded with name and time (recommended for v1), or a sign-off in an external system (Azure DevOps). The latter is out of scope for v1.
3. **The traceability check at each hand-off:** advisory, so it shows findings but doesn't block (recommended), or blocking.

## Design

### Data

`defaults/pipelines.json` holds the built-in AIDLC pipeline:

```json
{ "id": "aidlc", "name": "Requirements to stories", "emoji": "🧬",
  "stages": [
    { "id": "refine",     "assistantId": "requirements-refiner", "output": "01-requirements.md",      "prompt": "Refine the business requirements from {{sources}}. …" },
    { "id": "functional", "assistantId": "functional-designer",  "output": "02-functional-design.md", "prompt": "Draft the functional design from the approved requirements in {{prev}}." },
    { "id": "technical",  "assistantId": "technical-designer",   "output": "03-technical-design.md",  "prompt": "…from {{prev}}" },
    { "id": "stories",    "assistantId": "story-writer",         "output": "04-stories.md",           "prompt": "…from {{prev}}" }
  ],
  "gateCheck": { "assistantId": "traceability-analyst", "prompt": "Check traceability between {{prev}} and {{current}}. Report gaps only." } }
```

Add a `pipelines` collection in `lib/store.js` (the same `collection()` helper), and a run record:

```json
{ "id", "pipelineId", "name", "workspace", "sources": [paths], "createdAt",
  "stages": [{ "id", "status": "pending|running|review|approved|rework", "conversationId", "outputPath",
               "approvedBy", "approvedAt", "gateConversationId" }] }
```

Store runs as `data/runs/<id>.json`, using the same pattern as conversations.

### Flow

1. **Start:** the user picks "Requirements to stories" (a new home-screen card, or a Quick starts category), names the run and picks source files (BRD, PID and so on, using the existing file field UI from the recipe runner).
2. **Each stage:** create a conversation for the stage's assistant with `access: 'edit'` and the sources and previous output pinned (Plan 05) or attached. Send the stage prompt with the instruction "Save your final output to `<outputPath>`". The stage status becomes `review` when the reply finishes and the output file exists. The user can keep chatting in that stage's conversation to refine it.
3. **Gate:** while a stage is in `review`, the run view shows:
   - the output file card
   - an advisory **Traceability check** button (runs `gateCheck` in a side conversation and shows the summary)
   - **Approve**, which records `approvedBy` (`settings.userName`) and `approvedAt` and stamps an approval line at the top of the output file: `> Approved by X on DATE`
   - **Send back**, which sets the status to `rework` and focuses that stage's chat
4. **Next stage** unlocks only after approval. If the user goes ahead anyway, label the output "based on unapproved inputs", as the skill requires.

### UI

- A new "Run" view at `#/run/<id>`: a horizontal stepper (4 stages with a status chip each) and, below it, the selected stage's conversation embedded with the existing `renderChat` components, or a "Open chat" link for v1 if embedding is too invasive.
- Show runs in the sidebar as a group above the chats (or under a "Lifecycle" nav item).

## Steps

1. Get the owner's answers to the three decisions above.
2. Add the data layer: pipelines collection, run storage, and `GET/POST /api/runs` plus `POST /api/runs/:id/stages/:sid/{start,approve,rework,check}`.
3. Server orchestration for `start`: create the conversation and call the same internals as `handleChat`. Refactor `handleChat` so the core can run without an HTTP response (`runTurn(conv, message, opts, emit)`). This refactor is also needed by Plan 07.
4. Build the run view (stepper, approve and send-back) in the UI.
5. Hook up the gate check.
6. Walk through the whole flow end to end with the AIDLC sample pack (`samples/aidlc`).

## Acceptance checks

- A run with the AIDLC sample produces 4 output files in `Lifecycle/<run>/`, each with an approval stamp.
- Stage N+1 can't start until stage N is approved, unless the user explicitly overrides. Overridden outputs carry the "unapproved inputs" label.
- Send back reopens the stage chat, and re-approving updates the stamp.
- The traceability check shows findings without changing any files.
- Run state survives a server restart.

## Out of scope

Azure DevOps or Jira sync, multi-user approval, and branching pipelines.
