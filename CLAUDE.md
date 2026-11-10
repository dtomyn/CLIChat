# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Lumen** (package name `clichat`): a local chat workspace for business users (BAs, PMs, delivery leads) that drives an installed AI CLI (Claude Code or GitHub Copilot CLI) instead of calling an AI API. It deliberately mirrors Microsoft 365 Copilot vocabulary (agents, prompt gallery, notebooks) and can export agents/prompts to it. Node 18+, CommonJS, **no build step, no framework**.

## Commands

```bash
npm start                                   # node server.js → http://localhost:4317 (127.0.0.1 only)
node --test test/*.test.js                  # all unit/tool tests
node --test test/variance-gantt.test.js     # one test file
node --test --test-name-pattern="<regex>" test/scenario.test.js   # one test by name
npm run test:e2e                            # Playwright (uses installed MS Edge), throw-away server on :4391
npx playwright test e2e/project-prompts.spec.js
E2E_ENGINE=claude npx playwright test e2e/real-engine.spec.js     # opt-in: real CLI, slow, uses the user's plan
node --check <file.js>                      # quick syntax check (no linter configured)
```

`.claude/launch.json` defines `lumen` (port 4317, real data) and `lumen-scratch` (`e2e/start-server.js`, port 4391, throw-away data in `%TEMP%/lumen-e2e` with a stand-in "fake" engine). Prefer `lumen-scratch` for browser verification so the user's `data/` is untouched.

Env vars: `PORT`, `LUMEN_DATA` (data folder, default `./data`), `CLAUDE_CLI_PATH` / `COPILOT_CLI_PATH`, `ADO_MOCK` (JSON route file that fakes Azure DevOps; used by tests), `LUMEN_REPLAY` (replay recorded answers via `providers/recorder.js`, used by the film pipeline).

## Architecture

**Request flow for a chat turn** (`handleChat` in [lib/server/routes/chat.js](lib/server/routes/chat.js) → `runTurn` in [lib/server/chat.js](lib/server/chat.js)):
1. Load/create the conversation from [lib/store.js](lib/store.js) (plain JSON files under `data/`; writes are atomic temp+rename with Windows lock retries).
2. Attachments and pinned files are filtered to files **inside the conversation's workspace** (`workspaceFile`). Access level is one of `chat | read | edit` (`full` exists in providers but is never reachable from the API).
3. [lib/skills.js](lib/skills.js) resolves active skills = assistant's skills + chat's skills + skills implied by attached file extensions, then `toolConfig()` builds the MCP server set and tool allow-list for that access level.
4. The provider (`providers/*.js`) runs the CLI and calls `emit()` with a small event stream (`session`, `text`, `tool`, `tool_done`, `file`, `approval`, `usage`, `error`). `runTurn` folds events into the stored assistant message and streams them to the browser as **NDJSON**.
5. Replies keep running if the tab closes; only `/api/chat/:id/stop` aborts. Engine session ids are stored per provider in `conv.sessions`; when there is no session (engine switch, edit/rewind via `truncateFrom`), history is replayed through `historyPrompt`.

**Providers** ([providers/README.md](providers/README.md)): one file per engine, auto-loaded by `providers/index.js`. All CLIs are launched through [lib/cli-bin.js](lib/cli-bin.js), which unwraps npm `.cmd` shims and never uses `cmd.exe` (needed for multi-line prompts on Windows). Copilot has no system-prompt flag, so instructions are prepended to the first message.

**Skills → tools**: each `skills/<id>/SKILL.md` has front matter (`name, title, emoji, description, extensions, readTools, writeTools, server`). Tools are served by Lumen's own stdio MCP servers:
- [tools/office-mcp.js](tools/office-mcp.js) (`office`): the `TOOLS` array dispatches to domain modules in `tools/*.js` (excel, project, raid, status, traceability, release, governance, data, openapi, pptx, docx, …). Confined to `OFFICE_MCP_ROOT` (symlink-aware); `OFFICE_MCP_READONLY=1` refuses write tools.
- [tools/ado-mcp.js](tools/ado-mcp.js) (`ado`, code in `tools/ado/`): Azure DevOps read + **propose** only. `ado_propose_*` stages a change set and returns `{"pending": id}`; the provider emits `approval`; nothing is written until the user clicks Apply in the UI (`decideChangeSet` in server.js), which checks for concurrent edits and appends to `data/ado-audit.jsonl`. No delete tools; proposals disabled for scheduled runs. PAT is stored via Windows DPAPI ([lib/secrets.js](lib/secrets.js)) and never placed in the tool config (it ends up on a CLI command line).
- Adding a tool means: implement in a `tools/*.js` module, register it in the server's `TOOLS`, list it in the relevant SKILL.md `readTools`/`writeTools`, and add a friendly label in [lib/tool-labels.js](lib/tool-labels.js). A successful result containing `"saved": "<path>"` becomes a file card.
- Edits by office tools in edit mode snapshot originals to `<workspace>/.lumen/snapshots/<messageId>` (used by "See changes"). Plan history lives in `<workspace>/.lumen/plan-history/`. Update tools write `(updated)` copies rather than modifying originals.

**Server layout**: [server.js](server.js) is only the HTTP shell (static files, security headers, `allowedRequest`, the route list). Each API area is a file in [lib/server/routes/](lib/server/routes/) that responds or returns without responding; shared logic lives in `lib/server/*.js` (see [lib/server/README.md](lib/server/README.md)).

**Other server pieces**: guided lifecycle "runs" (staged pipelines with approval gates, `store.runs`, `defaults/pipelines.json`, migrated by [lib/pipeline-migrate.js](lib/pipeline-migrate.js)); scheduled prompts ([lib/scheduler.js](lib/scheduler.js), runs missed checks once on startup); exports to VS Code agents and M365 Copilot ([lib/copilot-export.js](lib/copilot-export.js)). `allowedRequest()` enforces Host/Origin/Sec-Fetch-Site checks against DNS rebinding and cross-site requests; keep it in place for any new API route.

**UI**: [public/js/](public/js/) holds native ES modules, one per area, loaded from [main.js](public/js/main.js) with `<script type="module">` (no bundler; see [public/js/README.md](public/js/README.md)) (markdown via vendored `marked` + DOMPurify + highlight.js served from `node_modules` at `/vendor/*`). [docs/plans/README.md](docs/plans/README.md) lists code anchors (`composerHTML`, `msgHTML`, `chatClicks`, `sendMessage`, `bindChrome`, `md()`).

**Seed content**: `defaults/` (assistants, recipes = prompts, pipelines) is copied into `data/` on first run; existing installs don't pick up changes to defaults automatically. `demo/` and `samples/` are generated by `scripts/make-*.js` — regenerate rather than hand-edit.

## Conventions (from docs/plans/README.md)

- **No new npm dependencies** without asking the owner first; `exceljs`, `jszip`, `fast-xml-parser` are available.
- No new listening ports; everything goes through the one server on 127.0.0.1.
- Keep the stack: vanilla JS UI, one CSS file, zero-framework server.
- UI text is for business users: plain language, never "CLI", "session" or "token".
- New stored fields must tolerate older JSON files that lack them.
- Facts in generated reports are computed in code with cited sources (`Sheet!Cell`, task ids); the AI only writes labelled narrative.
- `intents/` documents each user-facing capability as implemented (with a Source section). Update the matching intent file when behaviour changes.
