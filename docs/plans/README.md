# Enhancement plans

Thirteen enhancements, grouped into seven plans. Each plan is sized for one working session: it touches a small set of files, it can be tested on its own, and it leaves the app shippable.

| # | Plan | Enhancements | Size | Depends on |
|---|---|---|---|---|
| 01 | [Reply actions and shortcuts](01-reply-actions-and-shortcuts.md) | Suggestion chips, copy a table, keyboard shortcuts | S | none |
| 02 | [Edit, resend and branch](02-edit-resend-and-branch.md) | Edit and resend your own message, branch a chat | M | none |
| 03 | [Save a reply as Word or Excel](03-save-reply-as-document.md) | Save a reply as a document | M | none |
| 04 | [Feedback, templates and usage](04-feedback-templates-usage.md) | Thumbs up/down, turn a prompt into a quick start, usage view | M | none |
| 05 | [Chat context and file changes](05-chat-context-and-file-changes.md) | Pin files to a chat, show what changed in the folder | M | none |
| 06 | [Guided delivery lifecycle](06-guided-lifecycle-pipeline.md) | Run the AIDLC stages as a pipeline with approval steps | L | 02 helps (it adds `forkConversation`) |
| 07 | [Scheduled checks](07-scheduled-checks.md) | Run quick starts on a schedule | L | 04 helps (it adds unread state) |
| 08 | [Azure DevOps wiki and work items](08-azure-devops.md) | Search, read, create and edit work items and wiki pages | L | 06 for phase 4 |

Suggested order: 01 → 02 → 03 → 04 → 05 → 06 → 07. Plans 01 to 05 don't depend on each other.

Plans 09–18 cover the AI use-case catalogue (AIThemes.pdf). Progress for all 42 use cases is tracked in [INVENTORY.md](INVENTORY.md).

## Ground rules for every plan

- **No new downloads.** `jszip` and `exceljs` are already in `node_modules`. If a plan seems to need a new package, stop and ask the owner first (see the owner's global CLAUDE.md).
- **No new listening ports.** Everything goes through the existing server on `127.0.0.1:4317`.
- **Keep the stack.** That means vanilla JS in [public/app.js](../../public/app.js), one CSS file, and a zero-framework [server.js](../../server.js). There is no build step.
- **Write for business users.** Labels, toasts and errors use plain language. Never mention CLI, session or token in the UI.
- **Data stays local.** New data goes into the JSON files under `data/` through [lib/store.js](../../lib/store.js). Older conversation files will lack the new fields, so code must tolerate them being missing.
- **Verify in the running app.** Start it with `npm start` and exercise the feature in a browser. Also run `node --check` on every changed JS file. Add or update unit tests in `test/` (run with `node --test test/*.test.js`) for pure helpers such as parsers and converters, and browser tests in `e2e/` (`npm run test:e2e`) for screens.

## Code anchors used across plans

| What | Where |
|---|---|
| Composer HTML and key handling | `composerHTML`, `bindComposer` in `public/app.js` |
| Message rendering | `msgHTML`, `assistantInner` in `public/app.js` |
| Message action clicks | `chatClicks` in `public/app.js` (uses `data-*` attributes) |
| Streaming client | `sendMessage` in `public/app.js` |
| Global shortcuts | `bindChrome` → `document.addEventListener('keydown', …)` |
| Markdown renderer | `renderer.code` / `renderer.table` / `md()` near the top of `public/app.js` |
| Chat endpoint | `handleChat` in `server.js` (it stores `userMsg` and `asstMsg` and resumes the CLI session through `conv.sessions[providerId]`) |
| History replay when there's no session | `historyPrompt` in `server.js` |
| REST router | `api()` in `server.js` (`/api/<resource>/<id>/<action>`) |
| Storage | `lib/store.js` (`conversations`, `assistants`, `recipes`, `settings`) |
| Provider events | `providers/claude-cli.js` emits `text`, `tool`, `tool_done`, `file`, `session`, `usage {costUsd, durationMs}` and `error` |
