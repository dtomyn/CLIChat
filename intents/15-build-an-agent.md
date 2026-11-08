# 15 — Create or customize an agent

## Intent
As a business analyst (or any user), I want to describe a helper in one sentence, or fill in a few fields, and get an
agent with its own instructions, starter prompts and capabilities, so that I don't have to write a system prompt
from scratch.

## Where
- **Agents › Create agent** (also the **Create an agent** card, the home **Create an agent** chip and the pill menu).
- **Customize** on an agent card or **⋯ › Customize**: the same form titled **Customize <name>**.

## Inputs & controls
| Control | Effect |
|---|---|
| **Describe** box + **Draft it** (new agents only) | Asks the AI engine to propose name, emoji, description, instructions, 3 starters and skills; fills the form ("Drafted! Tweak anything you like."). |
| **Name** | Required, up to 40 characters. |
| **Color** / **Icon** | One of 7 colours and 24 emojis. |
| **Description** | One line, up to 80 characters (the agent's tagline). |
| **Instructions** | The system prompt, in plain English. |
| **Starter prompts** | Three inputs, shown as suggestions on home. |
| **Capabilities** (**Lumen only**) | One toggle per skill in `skills/` (title, emoji, description). |
| **File access** (under the shield) | **Use my default**, **Just chat**, **Read my files** or **Create & edit files**. |
| **Create agent** / **Save changes** | Saves; a new agent is then selected on home. |
| **Delete** (left, only for agents the user made) | Removes the agent. |

A live **Preview** card follows every edit.

## Behaviour (as implemented)
- **Draft it** (`POST /api/assistants/draft`, `draftAssistant`) calls the selected engine's `complete` (Claude Code CLI
  if none is set) with the list of skill ids and descriptions, and parses the first `{…}` JSON in the answer. Skills
  not in `skills/` are dropped. Failure toast: "Could not draft the assistant — try describing it differently."
- Saving with an empty name is refused ("Give your agent a name"). Empty instructions become
  `You are <name>, a helpful assistant. <description>`. Blank starters are dropped.
- The server keeps ids to `[A-Za-z0-9_-]{1,80}`, drops odd colour values and normalises `access` (`cleanItem`); a new
  agent never gets `builtin`. Customizing a built-in edits it in place (it stays built-in; **Restore defaults** resets
  it).
- **Skills** (18 shipped, one folder each under `skills/` with `SKILL.md`): Microsoft Project plans, Excel workbooks,
  Azure DevOps work items & wiki, Meeting → RAID log, AI-assisted delivery lifecycle, Program knowledge layer,
  Requirements traceability, Test design & defect triage, Test automation (Playwright), Change impacts & training,
  Bilingual EN/FR, Release & cutover, Architecture & governance, Security & SA&A, Data engineering, Integration and
  APIs, Developer workflow, Pipeline and environment readiness.
- At each turn `skills.resolve` switches on the agent's skills plus any skill whose `extensions` match an attached,
  pinned or earlier-attached file (`.mpp`/`.xml` → Microsoft Project, `.xlsx`/`.xlsm`/`.csv` → Excel, `.vtt` → RAID,
  `.docx`/`.docm` → program knowledge, `.sql`/`.ddl`, `.yaml`/`.yml`, `.env`/`.properties`).
- `skills.toolConfig` gives no tools in **Just chat**; read tools in **Read my files**; read and write tools in
  **Create & edit files**. Azure DevOps tools load only when a connection is set up (see [37](37-connect-azure-devops.md)).
  Each skill's text and reference files are added to the system prompt (`promptFor`).

## Outputs
- The agent on the Agents page, home row and pill menu; a toast "<name> is ready!" or "Changes saved".

## Acceptance criteria
- An agent cannot be saved without a name; a drafted agent only contains known skill ids.
- An agent's skills give its chats the matching tools, limited by the chat's access level: `test/ado-integration.test.js`
  › tool server: read-only chats get read tools only; scheduled runs get no proposals.
- Attaching or pinning a file of a known type turns its skill on: `test/lifecycle-context.test.js` › pinned context
  persists, activates skills and ignores removed and outside files.

## Decisions
- The form uses the same fields as Microsoft 365 Copilot's Agent Builder (name, description, instructions, starter
  prompts) so it exports cleanly (see [20](20-export-to-m365-copilot.md)); capabilities and file access are marked
  **Lumen only**.

## Limits
- The builder edits 3 starters; extra starters on an existing agent are kept but not shown.
- New skills are added as folders on disk; there is no UI to write one.
- **Draft it** needs a working AI engine.

## Source
`public/app.js` (`openAssistantBuilder`, `skillChips`, `lumenOnlyBadge`, `COLORS`, `EMOJIS`, `ACCESS`), `server.js`
(`draftAssistant`, `cleanItem`, `/api/assistants`, `/api/skills`, `buildSystemPrompt`, `runTurn`), `lib/skills.js`
(`all`, `parse`, `referencesOf`, `resolve`, `toolConfig`, `promptFor`), `skills/*/SKILL.md`.
