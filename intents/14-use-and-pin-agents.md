# 14 — Pick an agent and pin favourites

## Intent
As a user, I want to pick a specialist agent (Schedule Analyst, Story Writer, Data Profiler…) before I start a chat and
keep the ones I use most in the sidebar, so that every chat starts with the right expertise and tools.

## Where
- **Agents** page (left rail **Agents**, or **All agents** in the sidebar): one card per agent with **Start chat**,
  **Customize** and **⋯** (**Customize**, **Pin to sidebar** / **Unpin from sidebar**, **Duplicate**, **Export to
  Microsoft 365 Copilot**, **Use in VS Code**, **Delete**), with a **Search agents** box and a **Sort by** list above
  the cards.
- Home screen: the agent pill in the composer (no agent list on the home screen; use the pill or the **Agents** page)
  (**Who should help?** menu). The menu opens with a focused **Search agents** box (filters by name and tagline;
  arrow keys and Enter pick), lists Lumen and the sidebar's pinned agents first, then **All agents** A–Z, and scrolls
  inside a fixed height. **Create an agent** stays visible while filtering (`e2e/agent-search.spec.js`).
- Sidebar **Agents** list (`#agentList`).

## Inputs & controls
| Control | Effect |
|---|---|
| **Start chat** (card) / agent chip / pill menu | Sets the draft's agent and its default file access, then shows home with the agent's name, tagline and starter prompts. |
| **Search agents** (Agents page) | Filters the cards as you type; Escape clears it. |
| **Sort by** (Agents page) | Reorders the cards; the choice is saved as `settings.agentSort`. |
| Starter prompt chip | Puts the starter text in the message box (it is not sent). |
| Sidebar agent | Clears the draft and opens home with that agent selected. |
| **⋯ › Pin to sidebar / Unpin from sidebar** | Adds or removes the agent from `settings.pinnedAgents`; toast "Pinned to the sidebar" / "Removed from the sidebar". |
| **⋯ › Duplicate** | Saves a copy named `<name> (copy)` (new id, not built-in). |
| **⋯ › Delete** | Confirms "Delete <name>?" ("Existing chats with this agent are kept."), then removes it. |

## Behaviour (as implemented)
- 39 built-in agents ship in `agents/<id>.json`; **Lumen** ✨ is the default when none is picked.
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
- Each agent is its own file, `data/agents/<id>.json` (built-ins ship as `agents/<id>.json` in the app folder). An older single `data/assistants.json` is split into that folder on first start and kept as `assistants.json.bak`.
- New built-ins from a newer version are added to the saved list on start unless the user deleted them.
- Each card shows its skills as chips with a **Lumen only** badge (`skillChips`).
- **Search** (`agentSearchText`, `filterAgentCards`): case-insensitive; every typed word must appear in the agent's
  name, tagline, description or skill titles. Agents whose name matches are listed first. **Create an agent** always
  stays visible (last while searching); with no match, "No agents match your search." shows. The box gets focus when
  the page opens, and the text is kept while Lumen is open (`S.agentSearch`), not saved.
- **Sort** (`AGENT_SORTS`, `sortedAgents`): **Name (A to Z)** (the default, also when `agentSort` is missing or
  unknown), **Recently used** (latest chat with the agent), **Most used** (number of chats), **Pinned first** (the
  sidebar list, in its order), **My agents first** (agents the user created) and **Original order** (the order they
  were added to Lumen, **Lumen** first). Usage counts come from the chats on this computer; ties and unused agents
  fall back to the name. While searching, name matches still come first within the chosen order.

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
- In an open chat, the agent pill in the message box switches the agent. The new agent answers from the next
  message and sees the conversation so far (`test/switch-agent.test.js`).
  No automated test covers pinning. `e2e/agent-search.spec.js` covers the search box and the sort list.

## Limits
- Workflow stage chats keep the agent the workflow chose, and the agent can't be switched while a reply is running.
- Pins are global (one `settings.json`), not per notebook.

## Source
`public/js/agents.js`, `public/js/sidebar.js`, `public/js/home.js`, `public/js/composer.js` (`renderAssistantsPage`, `agentSearchText`, `filterAgentCards`, `AGENT_SORTS`, `sortedAgents`, `pinnedAgentIds`, `togglePinAgent`, `renderAgentList`, `renderHome`,
`homeClicks`, `skillChips`, `#assistantPill` menu and `pickAgent` in `bindComposer`), `lib/server/routes/chat.js` (`PATCH /api/conversations/:id` `assistantId`), `public/index.html` (`#agentList`),
`lib/server/routes/library.js`, `lib/server/chat.js` (`/api/assistants` routes, `buildSystemPrompt`, `runTurn`), `lib/store.js` (`folderCollection`: one file per agent, legacy split, seeding,
`removed.json`, `reset`), `lib/builtin-agents.js`, `agents/<id>.json`.
