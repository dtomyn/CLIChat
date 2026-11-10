# AI engine providers

Lumen doesn't talk to any AI service directly. It drives whichever AI command-line tool is installed on the computer. Each engine is one file in this folder, and `index.js` loads every `*.js` file it finds here automatically.

| File | Engine | Conversation memory |
|---|---|---|
| `claude-cli.js` | Claude Code CLI (`claude -p --output-format stream-json`) | Native: resumes the CLI session |
| `copilot-cli.js` | GitHub Copilot CLI 1.0+ (`copilot --output-format json`, prompt on stdin; also what `gh copilot` runs) | Native: Lumen picks the session UUID and passes `--session-id`, which creates the session on the first turn and resumes it afterwards. Older CLIs have no `--session-id`, so Lumen asks the CLI it actually runs (`--no-auto-update --help`; this can be an older bundled copy than `copilot --version` shows) and uses `--resume=<id>` instead. **Not yet verified end to end:** the `--resume=<id>` path was only checked up to Copilot's subscription check (Nov 2026); someone with Copilot credits should confirm a two-message chat keeps its context. Copilot has no system-prompt flag, so the assistant's instructions open the first message of each session |

Both providers launch their CLI through `lib/cli-bin.js`. It runs the real executable, or unwraps npm's `.cmd` shim to `node <entry.js>`, and never goes through `cmd.exe`, so multi-line prompts, quotes and JSON arguments survive on Windows.

## Adding an engine

Create `providers/my-engine.js` that exports:

```js
module.exports = {
  id: 'my-engine',                 // unique, stored in settings
  name: 'My Engine',               // shown to users
  vendor: 'Who makes it',
  description: 'One line for the settings screen',
  models: [{ id: 'default', label: 'Balanced', hint: 'Shown in the Response style menu' }],
  supportsResume: false,           // true if run() emits {type:'session'} and accepts sessionId

  async detect() { return { available: true, version: '1.0' }; },  // or { available:false, message }

  // One turn. Call emit() as things happen; resolve when finished.
  async run({ prompt, sessionId, systemPrompt, cwd, model, access, signal }, emit) {
    emit({ type: 'session', id: '...' });                         // optional
    emit({ type: 'tool', id: 't1', icon: 'file', label: 'Reading report.docx', file: '/abs/path', writes: false });
    emit({ type: 'tool_done', id: 't1', ok: true });
    emit({ type: 'text', text: 'Streaming markdown…' });
    emit({ type: 'error', message: 'Plain-language problem description' });
  },

  async complete({ prompt }) { return 'short text'; },  // small helper calls (chat titles, drafting assistants)
};
```

`access` is one of the plain-language permission levels the user picks in the UI. Map each one to your tool's own permission flags:

- `chat`: no file access (web search is fine)
- `read`: read files in `cwd`
- `edit`: read, create and edit files in `cwd`
- `full`: no restrictions (not shown in the UI, kept for power users)

Icons available for `tool` events: `file`, `pen`, `search`, `globe`, `terminal`, `list`, `spark`, `sheet`, `gantt`, `board` (Azure DevOps work items) and `book` (wiki).

An allow entry with `tool: '*'` means every tool that server offers. Claude's standalone `m365` server gets `mcp__m365`; its hosted Work IQ CLI application requires its own OAuth consent. **Copilot instead uses its existing GitHub-managed Work IQ connector**, with no `m365` injection or standalone OAuth client. For Copilot, `toolConfig` returns `workiq: 'managed'` alongside any Office/ADO servers; a connector-only turn can have an empty `servers` object. The provider explicitly supplies `workiqmcp` at `https://api.github.com/copilot-connectors/api/v1/connectors/workiqmcp/mcp` through `--additional-mcp-config`, since the app's connector inventory is not necessarily inherited by standalone processes. `--mcp-github-auth workiqmcp=https://api.github.com` delegates signed-in GitHub authentication to the engine, scoped to that server and origin, without placing a credential in configuration or arguments. Missing flag support reports an update requirement, not an OAuth fallback. `lib/workiq.js` also drops a legacy `m365` entry when mapping Copilot configuration. Office and Azure DevOps remain local/stdio and unchanged.

Both providers expose `connectWorkiq({ cwd })`, which opens their interactive dashboard in a separate Windows window, without installing plugins or changing global MCP configuration. For Copilot, select **Connectors > Work IQ**; the window receives the same per-run `workiqmcp` endpoint and GitHub-auth flag as chats. For Claude, select the standalone **m365** entry; Lumen supplies the hosted public client and callback port, and Claude may open its own OAuth listener. No credentials are copied or placed in Lumen settings.

Providers emit `{ type: 'connection', server: 'm365', status, message?, toolCount? }`; `m365` here is a logical Lumen event key, not Copilot's server name. Copilot follows status/tool events for the exact `workiqmcp` server configured by Lumen, not similarly named user/plugin servers. Its per-run configuration can be reported with `user` provenance and no display name. Claude reports its standalone status from initialization. Lumen retains advisory status in memory per engine; opening the dashboard is not a successful connection, and missing evidence remains unknown. Diagnostics are redacted before display.

The connector stays subject to Copilot account, enablement and organisation policies. Lumen does not force-enable it or fall back to a standalone identity after denial. The server automatically includes the Microsoft 365 skill for every agent on attended turns when the connection setting is on, including existing chats; stored agent/chat skills are not changed. Copilot receives request-specific instructions prohibiting Microsoft 365 use unless the setting and access permit it. Existing native connectors can still appear in the engine inventory even when Lumen has not requested them; this is instruction-level gating, not hard connector isolation.

Copilot runs, helper completions and the connection dashboard use per-run `--disable-mcp-server` flags for the known standalone aliases `m365`, `WorkIQ` and `workiq`. This prevents a leftover user/plugin connection with those names from starting a separate consent flow; saved user configuration is untouched. The explicitly supplied `workiqmcp` server is also disabled for chats that did not request Microsoft 365 and for helper completions. Its identity is established by Lumen's fixed GitHub endpoint and origin-scoped authentication, not display-name matching.

Work IQ operation routing is defined in [the Microsoft 365 skill](../skills/microsoft-365/SKILL.md). SharePoint document searches discover the exact `/search/query` prefix, inspect its action schema and call the documented read-only action through `do_action`. Graph-like naming does not imply support for arbitrary Graph endpoints: empty discovery must not lead to a guessed `/me/drive/recent` call. A path-specific denial is not sufficient evidence of a sign-in failure; stop the denied request without identity or route fallback. Search answers must verify editor, timestamp and location, distinguish SharePoint sites from personal OneDrive, and describe indexed-result limits. See [intent 70](../intents/70-sharepoint-workiq.md) for user-facing troubleshooting.

### Lumen's own tool servers

Skills get their tools from Lumen's MCP servers, passed in `run({ tools })` as `{ servers, allow }`: `office` ([tools/office-mcp.js](../tools/office-mcp.js)) and `ado` ([tools/ado-mcp.js](../tools/ado-mcp.js), Azure DevOps). When one of their tool results succeeds:

- `"saved": "<path>"` in the text → emit `{ type: 'file', path }` (a file card).
- `{"pending": "<uuid>"}` from an `ado_propose_*` tool → emit `{ type: 'approval', id }`. Lumen shows an Approve card for that staged Azure DevOps change. The server ignores ids it didn't stage for this chat, and nothing reaches Azure DevOps until a person clicks Apply.

Label `ado` tools with `adoLabel` from [lib/tool-labels.js](../lib/tool-labels.js), the same way `officeLabel` labels `office` tools.
