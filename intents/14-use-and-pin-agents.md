# 14 — Pick an agent and pin favourites

## Intent
As a user, I want to pick a specialist agent (Schedule Analyst, Story Writer, Data Profiler…) before I start a chat and
keep the ones I use most in the sidebar, so that every chat starts with the right expertise and tools.

## Where
- **Agents** page (left rail **Agents**, or **All agents** in the sidebar): one card per agent with **Start chat**,
  **Customize** and **⋯** (**Customize**, **Pin to sidebar** / **Unpin from sidebar**, **Duplicate**, **Export to
  Microsoft 365 Copilot**, **Use in VS Code**, **Delete**).
- Home screen: the **Agents** row of chips (**See all agents**, **Create an agent**) and the agent pill in the composer
  (**Who should help?** menu).
- Sidebar **Agents** list (`#agentList`).

## Inputs & controls
| Control | Effect |
|---|---|
| **Start chat** (card) / agent chip / pill menu | Sets the draft's agent and its default file access, then shows home with the agent's name, tagline and starter prompts. |
| Starter prompt chip | Puts the starter text in the message box (it is not sent). |
| Sidebar agent | Clears the draft and opens home with that agent selected. |
| **⋯ › Pin to sidebar / Unpin from sidebar** | Adds or removes the agent from `settings.pinnedAgents`; toast "Pinned to the sidebar" / "Removed from the sidebar". |
| **⋯ › Duplicate** | Saves a copy named `<name> (copy)` (new id, not built-in). |
| **⋯ › Delete** | Confirms "Delete <name>?" ("Existing chats with this agent are kept."), then removes it. |

## Behaviour (as implemented)
- 39 built-in agents ship in `defaults/assistants.json`; **Lumen** ✨ is the default when none is picked.
- An agent is a system prompt (`instructions`), a tagline, up to 3 starters, a colour, an emoji, an optional default
  file `access` and a list of `skills`. `buildSystemPrompt` puts the instructions first, then Lumen's own rules, then
  each active skill's text (see [15](15-build-an-agent.md)).
- The chat keeps the agent it started with (`conv.assistantId`); the agent pill only appears on the home composer, so
  the agent cannot be changed inside an existing chat.
- Picking an agent with an `access` value (most built-ins use `read`) sets the draft's file access to it
  (see [06](06-control-access-and-response-mode.md)).
- Sidebar list (`pinnedAgentIds`): once the user has pinned or unpinned anything, it shows exactly `pinnedAgents`
  (ids of deleted agents are dropped). Before that, it shows up to 4: agents used in recent chats first, topped up with
  the first built-ins, never **Lumen**. Empty list text: "Pin agents here from the Agents page."
- Deleting a built-in agent records it in `data/assistants.removed.json`, so it is not re-added on the next start;
  **Settings › Advanced › Restore defaults** brings it back (and removes agents the user created).
- New built-ins from a newer version are added to the saved list on start unless the user deleted them.
- Each card shows its skills as chips with a **Lumen only** badge (`skillChips`).

## Outputs
- A new chat with the chosen agent; its emoji shows on the chat in the chat list.
- The sidebar **Agents** list with the current agent highlighted.

## Acceptance criteria
- Choosing an agent on the Agents page, home chips, pill menu or sidebar starts the next chat with that agent and its
  default access.
- Pin and unpin persist in settings and survive a reload; an unpinned agent leaves the sidebar immediately.
- With no pins saved, the sidebar shows at most 4 agents, recent ones first, and never Lumen.
- Deleting an agent keeps its chats; a deleted built-in stays deleted until **Restore defaults**.
- Each domain's agents exist with their skills: `test/change.test.js` › change and bilingual agents, prompts and skills
  are wired up (and the matching "… are wired up" tests in `test/release.test.js`, `test/governance.test.js`,
  `test/data.test.js`, `test/openapi.test.js`, `test/controls.test.js`, `test/tests.test.js`, `test/drift.test.js`).
  No automated test covers pinning.

## Limits
- One agent per chat; switching means starting a new chat.
- Pins are global (one `settings.json`), not per notebook.

## Source
`public/app.js` (`renderAssistantsPage`, `pinnedAgentIds`, `togglePinAgent`, `renderAgentList`, `renderHome`,
`homeClicks`, `skillChips`, `#assistantPill` menu in `bindComposer`), `public/index.html` (`#agentList`),
`server.js` (`/api/assistants` routes, `buildSystemPrompt`, `runTurn`), `lib/store.js` (`collection`: seeding,
`removed.json`, `reset`), `defaults/assistants.json`.
