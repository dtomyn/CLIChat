# Plan 04: Feedback, templates and usage

**Enhancements:** thumbs up/down with a note, turn a prompt into a quick start, usage view
**Size:** medium
**Files:** `server.js`, `lib/store.js` (maybe), `public/app.js`, `public/app.css`

## Why

Before a wider rollout, the team needs evidence: which assistants and quick starts work, and what they cost in time. Users also need a way to turn a prompt that worked well into a reusable quick start without opening the builder from scratch.

## Design

### 1. Thumbs up/down

- Data: store it on the assistant message: `m.feedback = { rating: 'up' | 'down', note?: string, at }`. It lives in the conversation file, so nothing new needs storing.
- Server: `PATCH /api/conversations/:id/messages/:mid` with body `{ feedback }`. Only allow the `feedback` field. The router currently splits `[resource, rid, action]`, so extend it to read `parts[3]` as the message id.
- UI: add 👍 and 👎 buttons to `.msg-actions` and highlight the active one. 👎 opens a small popover (`openMenu`-style, or a mini `modal`) with quick reasons ("Wrong", "Not what I asked", "Too long", "Didn't use my file") and an optional note.
- Feedback stays on this computer. Nothing is sent anywhere.

### 2. Save a prompt as a quick start

- On user bubbles, add a hover action "Save as quick start" (`data-save-recipe`).
- It opens the existing `openRecipeBuilder(existing)` prefilled with:
  - `template` = the message text
  - `assistantId` = the chat's assistant, `access` = the chat's access
  - `name` = the conversation title, `emoji` = the assistant's emoji, `category` = "My quick starts"
  - `fields`: auto-suggest one `file` field per attachment, replacing the file name in the template with `{{file1}}` and so on. Leave the rest for the user to turn into fields in the builder.
- Read `openRecipeBuilder` first to confirm the shape it accepts; it takes an existing recipe object.

### 3. Usage view

- Capture: `providers/claude-cli.js` already emits `usage { costUsd, durationMs }`, but `handleChat`'s `emit` ignores it. Store it on `asstMsg.usage = { durationMs, costUsd, model }`. Take `model` from `body.model || settings.model` (the label, not the raw id). For Copilot, record only `durationMs`, measured in `handleChat` with `Date.now()` around `provider.run`.
- Per message: show a subtle meta line under the reply, visible on hover: "Most capable · 14 s". Show cost only if a setting is on (`settings.showCost`, off by default, because users on a subscription find dollar amounts confusing).
- **Insights page:** add a new nav item or a tab in Settings. Add `GET /api/insights`, which reads every conversation and aggregates:
  - per assistant: chats, replies, 👍/👎 counts, median reply time
  - per quick start: runs and 👍/👎. This needs `userMsg.recipeId`; set it in `openRecipeRunner` → `sendMessage({ …, recipeId })` → `handleChat` stores it on `userMsg`.
  - the last 20 👎 replies with their notes, each linking to the chat
- Render it as simple tables. A chart isn't needed for this version.

## Steps

1. Store the usage fields and the recipe id (server), and confirm they appear in the conversation JSON.
2. Add the feedback endpoint and UI.
3. Add "Save as quick start" from a user message.
4. Build the insights endpoint and page.

## Acceptance checks

- 👍 and 👎 persist after a reload, and a 👎 note is saved.
- "Save as quick start" opens the builder prefilled. After saving, it appears under Quick starts and runs correctly.
- New replies show the model and duration. Older replies without `usage` render fine.
- The Insights page lists assistants and quick starts with counts that match a manual check of a few chats.

## Out of scope

Exporting feedback or sending it to any server. Charts (use the dataviz skill if they're added later).
