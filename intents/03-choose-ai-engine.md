# 03 — Choose and check the AI engine (Claude Code / GitHub Copilot CLI)

## Intent
As a user whose organisation already deploys Claude Code or the GitHub Copilot CLI, I want Lumen to find the AI tool
installed on my computer, tell me whether it is ready, and let me switch between them, so that I can chat without API
keys or new accounts.

## Where
- Welcome step 2 **Choose your AI engine** ([01](01-get-started.md)).
- **Settings › AI engine** (option cards) with **Check again**.
- Sidebar user card: `<engine> · Ready` / `Not set up` with a green or red dot.

## Inputs & controls
| Control | Effect |
|---|---|
| Engine card (**Claude** 🟣, **GitHub Copilot** 🐙, any other 🔌) | Selects the engine; **Save** stores `providerId`. |
| **Check again** | Re-detects every engine now (`/api/status?refresh=1`) and refreshes the cards and the sidebar. |
| Environment `CLAUDE_CLI_PATH` / `COPILOT_CLI_PATH` | Point at a specific CLI binary. |

## Behaviour (as implemented)
- **Pluggable**: `providers/index.js` loads every `providers/*.js` (except `index.js`) that exports an `id` and `run`;
  dropping in a file adds an engine to the cards. Shipped: `claude-cli` (**Claude**, "Anthropic · Claude Code CLI")
  and `copilot-cli` (**GitHub Copilot**, "GitHub · Copilot CLI"). The default setting is `claude-cli`.
- **Finding the CLI** (`lib/cli-bin.js` `resolve`): the env override, then well-known locations (Claude:
  `~/.local/bin/claude(.exe)`, `%APPDATA%\npm\claude.cmd`, `/usr/local/bin`, `/opt/homebrew/bin`; Copilot: the WinGet
  link, `%LOCALAPPDATA%\GitHubCopilotCLI\copilot.exe`, `%APPDATA%\npm\copilot.cmd`, …), then `where.exe`/`which`,
  preferring an `.exe` over a `.cmd` shim. npm shims are unwrapped to `node <entry.js>`; see
  [61](61-local-and-private.md) for the no-shell rule.
- **Detection** (`detect`): runs `--version` (15 s timeout). A card shows **Installed** with vendor and version, or
  **Not set up** with the engine's message, e.g. "Claude Code CLI not found. Install it from … and run `claude` once
  to sign in." Copilot below 1.0 is **Not set up** ("… is too old for Lumen. Update it with `copilot update`").
  Results are cached on the server for 60 s.
- **Welcome** pre-selects the first available engine when the saved one is not available.
- **Sending without a ready engine** (`submit`): Settings opens scrolled to **AI engine** and a toast says
  **Connect an AI engine first**; nothing is sent.
- **Switching**: `PUT /api/settings` refuses an unknown `providerId` ("Unknown provider …"); switching engine resets the
  response mode to `default` ([06](06-control-access-and-response-mode.md)). Each message is sent with the current
  engine, so an open chat can continue on another engine: each engine keeps its own session id per chat
  (`conv.sessions`), and an engine with no session yet gets the last 12 stored messages replayed as text
  (`historyPrompt`). Each reply records its `providerId`.
- **Conversation memory**: Claude resumes its CLI session (`--resume`). Copilot gets a Lumen-chosen session UUID with
  `--session-id`, or `--resume=<id>` on CLIs whose help has no `--session-id` (`sessionArgs`, checked once against
  `--no-auto-update --help`). Copilot has no system-prompt flag, so the agent's instructions open the first message of
  a session and are re-sent only when they change.
- **Helper calls** (chat titles, **Draft it**) use the engine's `complete`: Claude `-p --model haiku --tools ""
  --no-session-persistence` (60 s cap); Copilot with no tools (90 s cap).
- **Errors** are turned into plain words. The reply's error card (`friendlyError` in the UI) shows "The AI engine
  could not be started. Open Settings to check your connection." (not found / spawn), "The AI service is busy right
  now…" (rate limit / overloaded) or "You may need to sign in to the AI engine again." (auth, 401/403). The Copilot
  provider adds "GitHub Copilot isn't signed in on this computer. Open a terminal, run `copilot` and type `/login` …"
  and subscription/policy and usage-limit messages.

## Outputs
- `settings.providerId`; engine status on the cards and the sidebar card.
- The engine named in every message box ([61](61-local-and-private.md), boundary note).

## Acceptance criteria
- Newer Copilot CLIs get `--session-id`; older ones get `--resume=<id>`, which also starts a new session; unknown help
  text falls back to `--resume=<id>` (`test/copilot-session.test.js` › newer Copilot CLIs get --session-id,
  › older Copilot CLIs (no --session-id) get --resume=<id>, which also starts a new session,
  › unknown help text falls back to --resume=<id>).
- A CLI started without a shell receives its arguments untouched (`test/security.test.js` › without a shell, arguments
  pass through untouched).
- `PUT /api/settings` with an unknown `providerId` returns 400; `POST /api/chat` with one returns 400.
- With no engine available, pressing Send opens Settings at **AI engine** and sends nothing.

## Limits
- Copilot conversation memory via `--resume=<id>` is not verified end to end (only up to Copilot's subscription check,
  per `providers/README.md`).
- Copilot reports no cost or model, so replies show only the duration.
- `providers/recorder.js` (record/replay) is for filming the demo videos and is active only with `LUMEN_RECORD` /
  `LUMEN_REPLAY`; in replay every engine reports ready.

## Source
`providers/index.js` (`status`, `get`); `providers/claude-cli.js` (`detect`, `run`, `complete`, `ACCESS_TOOLS`);
`providers/copilot-cli.js` (`detect`, `run`, `complete`, `sessionArgs`, `friendlyError`); `providers/README.md`;
`lib/cli-bin.js` (`resolve`, `command`); `server.js` (`GET /api/status`, `PUT /api/settings`, `runTurn`,
`historyPrompt`, `autoTitle`, `draftAssistant`); `public/app.js` (`providerCards`, `openSettings`, `openOnboarding`,
`renderUser`, `submit`, `friendlyError`).
