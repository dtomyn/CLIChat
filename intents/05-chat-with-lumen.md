# 05 — Chat and watch the reply stream

## Intent
As a user, I want to type a request, watch the answer appear with plain-language progress steps ("Reading
budget.xlsx…"), stop it if it goes the wrong way, and find it finished if I closed the tab, so that working with the
AI feels like a chat, not a command line.

## Where
The message box on the home screen and at the bottom of every chat; the reply area of the chat.

## Inputs & controls
| Control | Effect |
|---|---|
| Message box (placeholder "Message Lumen · type / to add a file" on home, "Message <agent>…" in a chat) | Enter sends, Shift+Enter adds a line; grows up to 280 px. |
| Send button | Disabled until there is text or a finished attachment; turns into **Stop** while a reply runs. |
| **Stop** / Esc | Stops the running reply (Esc only when no menu, dialog or drawer is open). |
| **N steps completed** | Expands the list of steps the AI took. |
| **Try again** (on an error card) | Re-runs the turn ([11](11-edit-resend-and-branch.md)). |

## Behaviour (as implemented)
- **Sending** (`submit`, `sendMessage`): an empty message with attachments is sent as "Please take a look at the
  attached file(s).". A first message on the home screen creates the chat with the selected agent, access and folder
  ([06](06-control-access-and-response-mode.md), [02](02-choose-notebook-folder.md)); the URL becomes `#/c/<id>`.
- **Streaming**: `POST /api/chat` answers with NDJSON events: `conversation` (ids), `text`, `tool`, `tool_done`,
  `file`, `approval`, `error`, `done` (files that exist, usage) and `title`. Text is repainted once per animation
  frame with a blinking cursor; the view follows the bottom only if the user was already near it.
- **Progress steps**: each engine tool call becomes a step with an icon and a friendly label from the provider
  (`friendlyTool`, `lib/tool-labels.js`), e.g. **Reading budget.xlsx**, **Searching the web for "…"**, **Planning the
  steps**. While running, the header shows a spinner and the latest label with "…"; afterwards **N steps completed**
  with ✓ or ✗ per step. Before any text or step: **<agent> is thinking…**. Steps of helper sub-agents are hidden.
- **Files** the AI writes appear as file cards ([13](13-see-file-changes.md)); Azure DevOps proposals as Approve cards
  ([39](39-approve-ado-changes.md)). At the end a toast says **Saved <file> to your folder**.
- **One reply at a time per chat**: a second send to a running chat is refused (409 "Wait for the current reply to
  finish first."). Different chats can run at once; running chats show a live dot in the sidebar.
- **Stop** (`stopConv`): calls `POST /api/chat/:id/stop`, which aborts the engine process, and cancels the stream. The
  partial reply is saved with `stopped` and shows **Stopped**.
- **Closing the tab does not cancel**: the server keeps the engine running and saves the reply when it ends. Opening
  the chat again while it runs (`running: true`) shows a placeholder reply and polls every 2 s until it lands
  (`waitForBackground`); **Stop** still works.
- **What the engine is told** (`buildSystemPrompt`): the agent's instructions, the user's name, that it runs inside
  Lumen for non-technical users, to answer in GitHub-flavoured Markdown, never ask the user to run terminal commands,
  call the working directory "your project folder", today's date, and optionally to end with
  "**Suggested next step:** …" ([10](10-act-on-a-reply.md)), plus active skill instructions and pinned files.
- **Memory**: the engine's own session is resumed per chat; when there is none (new engine, after a rewind) the last 12
  messages are replayed as text ([03](03-choose-ai-engine.md)).
- **Rendering**: `marked` (GFM) + DOMPurify + highlight.js; tables get **Copy table**, code blocks **Copy**; links open
  in a new tab ([61](61-local-and-private.md)).
- **Errors** show **Something went wrong.** with a plain-language reason and **Try again**; a failed request shows
  its own error message.
- **Reply footer**: the response mode label (when the engine reports it) and duration ("Think deeper · 14 s"); the
  cost only with **Settings › Advanced › Show the cost of each reply** and only when the engine reports it; and
  "AI-generated content may be incorrect".

## Outputs
- The chat saved as `data/conversations/<id>.json` with user and assistant messages (content, tools, files, approvals,
  error, stopped, usage, providerId).
- Streamed reply, step list, file and Approve cards.

## Acceptance criteria
- A turn streams `conversation` first and `done` last; a new chat also gets `title`
  ([07](07-organize-chats.md)).
- Sending to a chat that is still replying returns 409 and changes nothing.
- After Stop, the saved reply keeps the partial text and `stopped: true`.
- Closing the browser mid-reply still saves the complete reply.
- Chat turns are exercised through `/api/chat` with a stand-in engine in `test/lifecycle-context.test.js` › pinned
  context persists, activates skills and ignores removed and outside files, and `test/ado-integration.test.js` › a
  proposal becomes an Approve card; only Apply writes, once, and the AI hears the outcome. The browser-side streaming,
  Stop and background polling have no automated test.

## Limits
- Only the last 12 messages are replayed when the engine has no session, so older context is dropped after an engine
  switch or rewind.
- Stop from the browser reaches the server only once the chat has an id (after the first `conversation` event).
- Polling a background reply shows no partial text, only a placeholder until it finishes.
- A chat that is an approved lifecycle stage can't take new messages until it is sent back
  ([34](34-guided-lifecycle-runs.md)).

## Source
`public/app.js` (`composerHTML`, `bindComposer`, `submit`, `sendMessage`, `stopConv`, `openConversation`,
`waitForBackground`, `renderChat`, `assistantInner`, `usageMeta`, `friendlyError`, `md`); `server.js` (`handleChat`,
`runTurn`, `buildSystemPrompt`, `historyPrompt`, `running`, `POST /api/chat`, `POST /api/chat/:id/stop`,
`GET /api/conversations/:id`); `providers/claude-cli.js`, `providers/copilot-cli.js` (`friendlyTool`, `run`);
`lib/tool-labels.js`.
