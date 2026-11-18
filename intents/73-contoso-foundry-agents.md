# 73 — Use the Contoso agents hosted in Microsoft Foundry

## Intent
As a Contoso business analyst, planner, architect or security specialist, I want to use the Contoso SDLC agents (requirements
refinement, functional and technical design, story writing, traceability, planning, RAID, interfaces, security
evidence, architecture review and the rest) from the same chat I already use, attach my document, read a clear answer
with its sources, and approve the agent's pauses, without having to know how the agents are hosted.

## Where
- **Agents** page: 23 agents whose cards show a **Microsoft Foundry** tag (files `agents/contoso-*.json`, order 600+).
  They appear for existing installs too (built-ins added in newer versions are picked up automatically).
- A new chat with one of them shows the agent's **📎 what to attach** hint under its name.
- **Settings → Microsoft Foundry project (for the Contoso agents)**: the project address, with a Ready / Not set up tag.
- **Approve cards** under a reply when an agent pauses for a decision (title from the agent, "Microsoft Foundry ·
  <agent>").

## Inputs & controls
| Control | Effect |
|---|---|
| **Microsoft Foundry project** (Settings) | `https://<name>.services.ai.azure.com/api/projects/<project>`. Anything else is refused with a plain message. |
| **Attach** files | Mapped into the agent's request by the agent file's `foundry.inputs` rules (by file name). Files an agent doesn't use are listed as "Not sent to the agent". |
| **Message** | Sent as the agent's `message`. A message that is a JSON object is sent as-is (demo prompts, power users). |
| **Approve** / **Reject** (card) | Records the decision, then sends it to the agent as the next turn ("Approved: …" / "Rejected: …"). |

## Behaviour (as implemented)
- Agents with a `foundry` section always run on the **Microsoft Foundry** engine ([providers/foundry-agents.js](../providers/foundry-agents.js)),
  whatever engine is set for other chats. The engine is hidden from the engine picker (`agentOnly`) and can't be saved
  as the default engine.
- Sign-in borrows the Azure CLI's (`az account get-access-token --resource https://ai.azure.com`), cached in memory
  until shortly before it expires ([lib/foundry/auth.js](../lib/foundry/auth.js)). Nothing is stored. An expired
  sign-in asks the user to run `az login` once.
- Each turn calls the hosted agent's Responses endpoint (`…/agents/<agent>/endpoint/protocols/openai/responses`) or,
  for Invocations agents, `…/protocols/invocations` ([lib/foundry/client.js](../lib/foundry/client.js)). Follow-ups in
  the same chat continue the agent's conversation (previous response id, or agent session for Invocations agents).
- Replies are rendered from the agent's result JSON ([lib/foundry/render.js](../lib/foundry/render.js)): its summary
  line, **At a glance** counts, **Safety checks flagged…** for guardrail findings, up to four tables of its main lists
  (25 rows each), open questions, and the full result in a collapsible block. Nothing is reworded.
- An approval pause (`mcp_approval_request`) is stored as `data/foundry-pending/<chat>/fa-<id>.json` (7-day expiry)
  and shown as an Approve card ([lib/foundry/approvals.js](../lib/foundry/approvals.js)). Approve sends
  `mcp_approval_response` with `approve: true` and the paused response id; Reject sends `approve: false` and the chat
  says the agent stopped and nothing was changed. Deleting the chat removes its pending pauses.
- Errors are plain language: not deployed (404), not allowed (403 → ask for the Foundry Agent Consumer role), busy
  (429), the agent ran into a problem (5xx / failed), sign-in expired, too slow (10-minute limit), file over 15 MB.
- Chat titles use the first words of the message (hosted agents don't write titles).

## Limits
- Files the agents generate (Word, Excel) stay in the agent's workspace in Foundry; the chat shows the result data.
- Approval pauses can only be resumed for Responses-protocol agents.
- The agents run in **Phase 1** in the test project: they read what you attach and don't write to Azure DevOps,
  SharePoint or Teams.

## Source
- [providers/foundry-agents.js](../providers/foundry-agents.js), [lib/foundry/](../lib/foundry/)
- [lib/server/chat.js](../lib/server/chat.js) (engine choice, request details passed to the engine, approval events)
- [lib/server/routes/chat.js](../lib/server/routes/chat.js) (approval routes), [lib/server/routes/core.js](../lib/server/routes/core.js) (settings)
- [public/js/ado-approvals.js](../public/js/ado-approvals.js), [public/js/settings.js](../public/js/settings.js), [public/js/streaming.js](../public/js/streaming.js)
- [test/foundry.test.js](../test/foundry.test.js)
