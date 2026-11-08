# 19 — See usage and feedback insights

## Intent
As a delivery lead or the person who maintains the agents and prompts, I want to see which agents and prompts are used
and how people rate their replies, so that I can fix the ones that get 👎 and promote the ones that work.

## Where
**Insights** in the left rail (`#/insights`).

## Inputs & controls
- None besides navigation. Each row in **Recent 👎 replies** links to its chat (the reply excerpt is the tooltip).

## Behaviour (as implemented)
- `GET /api/insights` (`insights()`) reads every saved conversation on each visit; nothing is cached or sent anywhere.
- **Agents**: per agent, **Chats** (conversations), **Replies** (assistant messages with content or an error),
  **👍**, **👎** and **Typical reply time** (median `usage.durationMs`: the engine's reported duration, else the
  measured wall-clock time; "—" when none).
  Sorted by replies.
- **Prompts**: per prompt, **Runs** (user messages carrying `recipeId`, from **Start** or a scheduled run) and the
  👍/👎 on the replies that follow that message. Sorted by runs.
- **Recent 👎 replies**: the 20 newest 👎, with **Chat** (agent emoji and chat title), **Reason**, **Note**, **When**.
  Reasons and notes come from the 👎 form (see [10](10-act-on-a-reply.md)).
- Messages copied into a branch (`copied: true`, see [11](11-edit-resend-and-branch.md)) are skipped, so a branch does
  not double-count runs or ratings; a branch still counts as a chat for its agent.
- Agents or prompts that no longer exist show as **Deleted assistant** / **Deleted prompt** with 🗑️.
- Empty states: "No chats yet.", "No prompts have been run yet.", "No 👎 yet. When someone marks a reply as not
  helpful, it shows up here with their note."

## Outputs
- Three tables on the **Insights** page; clicking a 👎 row opens that chat.

## Acceptance criteria
- Counts match the saved chats: one run per prompt-started message, ratings attributed to the agent and to the prompt
  that started the turn, branch copies excluded.
- At most 20 recent 👎 rows, newest first.
- No automated test covers `/api/insights`.

## Limits
- Covers chats on this computer only (one user's `data/` folder); there is no team-wide roll-up.

## Source
`server.js` (`insights`, `GET /api/insights`), `public/app.js` (`renderInsightsPage`, `fmtDuration`, `timeAgo`),
`public/index.html` (**Insights** rail item).
