# 06 — Choose what Lumen may do and the response mode

## Intent
As a user, I want to decide in plain words whether the AI may only chat, read my files, or also create and edit
them, and how hard it should think, so that I stay in control of my documents and get fast or careful answers as
needed.

## Where
- Message box: the access pill (💬 **Chat only** / 👀 **Can read files** / ✍️ **Can edit files**) opening
  **What can Lumen do?**, and the gauge pill opening **Response mode**.
- **Settings › Default file access**.
- An agent's own default access (Agents › Customize, [15](15-build-an-agent.md)).

## Inputs & controls
| Control | Effect |
|---|---|
| 💬 **Just chat** | "Answers questions and can search the web. Won't look at your files." |
| 👀 **Read my files** | "Can open and read documents in your project folder." |
| ✍️ **Create & edit files** | "Can write new documents and update files in your project folder." |
| **Response mode** (Claude) | **Auto** (`default`), **Quick response** (Haiku), **Balanced** (Sonnet), **Think deeper** (Opus). |
| **Response mode** (GitHub Copilot) | **Default** (the plan's choice), **Auto** (Copilot picks per request). |
| **Settings › Default file access** | The access new chats start with. |

## Behaviour (as implemented)
- **Which access a chat gets**: in a chat, the chat's saved `access`; on the home screen, the access picked in the
  pill, else the selected agent's `access`, else the default setting (`read` out of the box). Picking an agent on the
  home screen takes over its access. Changing the pill in a chat saves it on the chat (`PATCH`) and toasts e.g.
  **Create & edit files — Lumen can now save files**.
- **Server rules** (`cleanAccess`): only `chat`, `read` and `edit` are accepted anywhere (settings, chats, agents,
  prompts); anything else falls back. The engines' `full` level (shell commands) is not reachable from the UI or API.
- **Files raise "Just chat" to read**: when a turn has attachments or pinned files, a `chat` chat runs that turn as
  `read`.
- **Claude** (`ACCESS_TOOLS`): `chat` = `WebSearch`, `WebFetch`; `read` adds `Read`, `Glob`, `Grep`; `edit` adds
  `Write`, `Edit`, `NotebookEdit`, `TodoWrite` and `--permission-mode acceptEdits`. The list is passed as both
  `--tools` and `--allowedTools`, so nothing else (no `Bash`) exists for the engine.
- **GitHub Copilot** (`ACCESS_FLAGS`): `chat` = `--available-tools=web_fetch` and denies `shell` and `write`; `read`
  allows tools but denies `shell` and `write`; `edit` denies `shell`.
- **Lumen's document tools** follow the same level (`skills.toolConfig`): none in `chat`; read tools only in `read`
  (the Office server runs with `OFFICE_MCP_READONLY=1`); write tools only in `edit`. Every skill's write tool and
  every Azure DevOps proposal needs **Create & edit files**. The AI is told the level (`promptFor`): in `chat` to ask
  the user to switch to **Read my files**, in `read` to explain that changes need **Create & edit files**.
- **Snapshots**: in `edit`, Office-tool edits snapshot the original under `.lumen/snapshots/<reply id>/` for
  before/after comparison ([13](13-see-file-changes.md)).
- **Response mode** is one global setting (`settings.model`), not per chat. The pill shows only when the engine has
  more than one mode. The server passes only a mode the current engine lists (otherwise `default`); Claude `default`
  and Copilot `default` add no `--model` flag. Switching engine in Settings resets the mode to `default`.
- Prompts carry their own access ([16](16-run-a-prompt.md)); scheduled prompts never get more than their prompt's
  level and need explicit permission to save files ([18](18-schedule-prompts.md)).

## Outputs
- The chat's `access` (in `data/conversations/<id>.json`), `settings.access`, `settings.model`.
- The pill label in the message box; the mode label in each Claude reply's footer.

## Acceptance criteria
- A `chat` chat with a pinned or attached file runs that turn as `read` (`test/lifecycle-context.test.js` › pinned
  context persists, activates skills and ignores removed and outside files).
- Read-only chats get read tools only and no proposals (`test/ado-integration.test.js` › tool server: read-only chats
  get read tools only; scheduled runs get no proposals, › discard writes nothing; a changed connection blocks apply;
  read-only chats get no proposals).
- Each skill's writing tools need edit access (e.g. `test/huddle-raid.test.js` › RAID tools are exposed; proposing
  needs edit access; `test/tests.test.js` › quality tools are exposed; writing needs edit access;
  `test/data.test.js` › data tools are exposed; write tools need edit access).
- Scheduled runs never elevate access (`test/schedules-api.test.js` › schedule API enforces permissions and runs paused
  checks without elevating access).
- `PATCH /api/conversations/:id` or `PUT /api/settings` with `access: 'full'` stores a permitted level instead.

## Limits
- Web search and web fetch stay on in every level, including **Just chat**.
- The response mode is shared by all chats; Copilot's modes are only Default and Auto.
- Edits are accepted automatically in **Create & edit files** (`acceptEdits`); there is no per-file confirmation.

## Source
`public/app.js` (`ACCESS`, `composerHTML`, `bindComposer` access and mode menus, `openSettings`); `server.js`
(`ACCESS_LEVELS`, `cleanAccess`, `runTurn`, `PUT /api/settings`, `PATCH /api/conversations/:id`, `cleanItem`);
`providers/claude-cli.js` (`ACCESS_TOOLS`, `models`); `providers/copilot-cli.js` (`ACCESS_FLAGS`, `models`);
`lib/skills.js` (`toolConfig`, `promptFor`); `lib/scheduler.js`.
