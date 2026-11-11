# 71 — Ask Lumen about its own agents, prompts and features

## Intent
As a business user with many agents, prompts and workflows, I want to ask Lumen in plain language what it has and
how to use it ("which agent handles RAID logs?", "do I have a prompt for status reports?", "what runs every week?"),
so that I don't have to browse the sidebar and prompt gallery to find the right one.

## Where
Any chat, with any agent. The **Ask about Lumen** skill is switched on for every chat automatically, so it
doesn't need to be added to an agent.

## Inputs & controls
- A question typed in the chat. No setup is needed.
- It works with every **What can Lumen do?** setting, including **Just chat**. It reads Lumen's own library,
  never the user's files.

## Behaviour (as implemented)
- Each chat turn adds the `lumen-guide` skill, which provides the read-only `lumen` tool server.
- Tools: `lumen_overview` (counts, most used, never-used prompts, categories), `lumen_list_agents` (filter by words
  or skill), `lumen_list_prompts` (filter by words or agent), `lumen_list_workflows`, `lumen_list_schedules`,
  `lumen_list_skills`, `lumen_get_item` (full agent instructions, prompt wording, workflow stages or schedule)
  and `lumen_how_to` (searches these intent guides, without their Source sections).
- Usage (number of chats per agent, runs per prompt, last used) is counted from saved chats. A prompt counts as
  used when it was started from the prompt gallery or by a schedule.
- Word filters require every word to match, and matches in the name rank first.
- The skill tells the AI to answer from these tools, not from memory, and to name items exactly as they appear
  in the app.
- In **Just chat**, other skills' file tools stay off. Only the `lumen` tools load.

## Outputs
A normal chat reply. Progress shows lines such as "Looking through your prompts matching “raid”".

## Acceptance criteria
- Asking "which agents use Excel?" lists the agents whose skills include `excel`.
- A prompt started twice from the gallery shows 2 uses and the date it was last used.
- "How do I schedule a prompt?" answers from the scheduling guide.
- In **Just chat** the reply can still list agents and prompts, but the AI cannot open project files.
- The tools never change agents, prompts, schedules or settings.

## Limits
- Read-only: the AI can suggest a new agent or prompt but can't create one. Use **Build an agent** or **Save prompt**.
- Usage counts only cover chats that are still saved. Deleting a chat removes its usage.
- With GitHub Copilot in **Just chat**, the engine may expose only web tools, so ask in **Read my files** mode.
- How-to answers are only as current as the `intents/` guides.

## Source
- [tools/lumen-mcp.js](../tools/lumen-mcp.js): the tools
- [skills/lumen-guide/SKILL.md](../skills/lumen-guide/SKILL.md): the skill
- [lib/skills.js](../lib/skills.js): the `lumen` server wiring and the Just chat rule
- [lib/server/chat.js](../lib/server/chat.js): `runTurn` adds `skills.GUIDE` to every chat
- [lib/tool-labels.js](../lib/tool-labels.js): `lumenLabel`
- [test/lumen-guide.test.js](../test/lumen-guide.test.js)
