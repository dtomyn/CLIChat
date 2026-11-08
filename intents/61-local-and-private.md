# 61 — Keep everything local and safe

## Intent
As a user in an organisation with data rules, I want Lumen to run only on my computer, keep my chats and settings in
a local folder, protect stored credentials, never run shell commands, and say plainly that it is not Microsoft 365
Copilot, so that I know where my information goes and what the AI can and cannot do.

## Where
Built into the server and the UI; visible as the boundary note under every message box, the **Not Microsoft 365
Copilot** card in the welcome, and the **Lumen only** badges.

## Inputs & controls
- `PORT` (default `4317`), `LUMEN_DATA` (data folder), `CLAUDE_CLI_PATH` / `COPILOT_CLI_PATH`.
- Delete the `data/` folder to reset Lumen.
- **What can Lumen do?** ([06](06-control-access-and-response-mode.md)) is the only permission control; there is no
  shell option.

## Behaviour (as implemented)
- **Local only**: the server listens on `127.0.0.1`. Every request must have a `Host` of `localhost` or `127.0.0.1`
  (any port), which stops DNS rebinding. API calls from a browser page must come from the same origin (`Origin`
  equal to `http://<host>`, `Sec-Fetch-Site` `same-origin` or `none`), so other web pages, including other localhost
  ports, can't drive the API; requests without these headers (tests, curl) are allowed. Anything else gets 403.
- **Response headers**: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer` and
  a CSP: scripts only from Lumen plus the one inline theme script by hash, images only from Lumen/`data:`/`blob:` (so a
  reply can't leak data through an external image), `connect-src 'self'`, `object-src 'none'`, `base-uri 'none'`,
  `form-action 'none'` (a form smuggled into a reply can't POST to the API, e.g. `/api/reset`), `frame-ancestors
  'none'`. Static files are served only from `public/` (path traversal returns 404).
- **Replies are sanitised** (`md`): DOMPurify with no `data-*` attributes except the two copy buttons, no `id`, `name`,
  `form` or `formaction` attributes, and no `form`, `textarea`, `select`, `option` or `style` tags, so a reply can't
  fake Lumen's Apply, open-file or send controls; links open in a new tab with `noopener noreferrer`.
- **Data folder** (`lib/store.js`): `data/` (or `LUMEN_DATA`) holds plain JSON: `settings.json`, `assistants.json`,
  `recipes.json`, `pipelines.json`, `schedules.json`, `conversations/<id>.json`, `runs/<id>.json`, plus
  `secrets/`, the Azure DevOps change sets (`ado-pending/<chat>/`) and audit log `ado-audit.jsonl`
  ([39](39-approve-ado-changes.md)).
  Writes go to a temp file and are renamed, with retries for Windows file locks. Feedback and **Insights** are computed
  from these files and never sent anywhere ([19](19-see-usage-insights.md)).
- **Secrets** (`lib/secrets.js`): the Azure DevOps personal access token is encrypted with Windows DPAPI for the
  current Windows user (`ConvertTo-SecureString` / `ConvertFrom-SecureString`) in `data/secrets/<name>.dpapi`, passed
  to PowerShell on stdin, never on a command line, never in `settings.json`, never returned by the API (only
  `hasPat`), and never given to the AI: the tool configuration on the CLI command line holds no credentials, and
  exported VS Code files hold none ([37](37-connect-azure-devops.md)). Saving a token is Windows-only.
- **No shell**: the API accepts only `chat`, `read`, `edit` (`cleanAccess`); the providers' `full` level is never
  reachable. Claude gets an explicit tool list without `Bash` (`--tools`, `--allowedTools`) and only Lumen's MCP
  servers (`--strict-mcp-config`); Copilot runs with `--deny-tool=shell` and `--disable-builtin-mcps`.
- **CLIs launched without a shell** (`lib/cli-bin.js`): executables are spawned directly and npm `.cmd` shims are
  unwrapped to `node <entry.js>`. Only when a shim can't be unwrapped does it run through `cmd.exe`, and then every
  argument is quoted and caret-escaped twice and line breaks are flattened, so text in system prompts, file names or
  MCP JSON can't run other commands. Prompts go to the CLI on stdin.
- **Project-folder boundary**: pinned files, lifecycle sources, diffs and file status are accepted only if their real
  path (links resolved) is inside the chat's folder (`workspaceFile`). Lumen's Office tools resolve the nearest
  existing folder through links and junctions and check "save as" targets, so writes can't escape the project folder.
  Excel recalculation doubles all single and typographic quotes in the PowerShell file path.
- **Opening files** (`/api/folder/open`): only paths inside the folder; only document types on an allowlist (`OPENABLE`:
  Office, PDF, text, Markdown, JSON, XML, YAML, `.mpp`, `.vtt`, images, HTML, …) open in their app. Anything else
  (programs, scripts, shortcuts, macro-enabled files) is shown in its folder instead, because the AI can write files.
- **Uploads** (`/api/upload`): saved to `Attachments/` with unsafe characters replaced; an existing file is never
  replaced (`wx`, then `name (2).ext` …). Request bodies are capped at 25 MB.
- **Boundary note** (`boundaryNote`): every message box shows 🛡 "You're in **Lumen**, powered by <engine>. This isn't
  Microsoft 365 Copilot." with the tooltip "Lumen sends your messages and files to <engine> through <vendor>. Microsoft
  365 Copilot's data protections don't apply here." Features that won't exist in Copilot carry a **Lumen only** badge.

## Outputs
- Everything Lumen stores is in `data/` and the project folder; nothing is stored in the browser except the theme
  choice ([01](01-get-started.md)).

## Acceptance criteria
- A `.cmd` shim run through `cmd.exe` gets every argument intact and runs nothing else (`test/security.test.js` › a
  .cmd shim run through cmd.exe gets every argument intact and runs nothing else; › without a shell, arguments pass
  through untouched).
- Office tools refuse to write through a link that points outside the project folder (`test/security.test.js` ›
  Office tools refuse to write through a link that points outside the project folder).
- Pinned files outside the folder are never sent (`test/lifecycle-context.test.js` › pinned context persists,
  activates skills and ignores removed and outside files).
- The connection API never returns a secret, and a token round-trips through DPAPI (`test/ado-integration.test.js` ›
  connection settings: cloud addresses are normalised, on-premises refused, no secret returned;
  `test/ado-units.test.js` › secrets round-trip through DPAPI on Windows).
- An API request with a foreign `Origin`, a cross-site `Sec-Fetch-Site` or a `Host` other than localhost/127.0.0.1
  gets 403 (no automated test).
- `access: 'full'` sent to any endpoint is never stored.

## Decisions
- **Say it isn't Copilot**: Lumen copies Microsoft 365 Copilot's look on purpose, so every message box names the real
  engine to stop people pasting content they'd only trust to Copilot's data protections.
- **Engines over API keys**: Lumen drives CLIs the organisation already deploys, so it stores no AI keys at all.

## Limits
- Messages and files the AI reads are sent to the chosen engine's cloud service (Anthropic or GitHub); "local" means
  the app, its data and its tools, not the model.
- Web search and web fetch are available in every access level.
- The engines' own file tools (Claude `Read`/`Write`, Copilot `view`/`edit`) follow the CLI's own path rules; Lumen's
  folder checks cover its API and Office tools.
- The page loads Google Fonts from `fonts.googleapis.com` / `fonts.gstatic.com`.
- `data/` is not encrypted apart from `secrets/`; chats are plain JSON readable by the Windows user.

## Source
`server.js` (`HOST`, `allowedRequest`, `SECURITY_HEADERS`, `CSP`, `INLINE_HASHES`, `cleanAccess`, `workspaceFile`,
`inside`, `OPENABLE`, `openPath`, `readBody`, `/api/upload`, `/api/folder/open`, `/api/connections/ado`);
`public/app.js` (`md`, DOMPurify hook, `boundaryNote`, `lumenOnlyBadge`, `openOnboarding`); `public/index.html` (theme
script); `lib/store.js` (`DATA`, `writeJson`); `lib/secrets.js` (`save`, `load`, `has`, `clear`, `supported`);
`lib/cli-bin.js` (`resolve`, `command`, `cmdArg`); `lib/skills.js` (`toolConfig`); `providers/claude-cli.js`,
`providers/copilot-cli.js`; `tools/office-mcp.js` (`realOf`, `outsideRoot`, `resolveIn`, `outputIn`);
`tools/excel.js` (`recalc`); `test/security.test.js` (commit `1db5dc1` "fix: security review hardening").
