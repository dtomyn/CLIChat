# 70 — Read SharePoint and Microsoft 365 through WorkIQ

## Intent
As a business user whose documents live on SharePoint, I want an agent to find and read them (and related email,
meetings and Teams messages) without me copying files into my notebook first, so that answers use the current source
and I can see where each fact came from.

## Where
**Settings › Connections › SharePoint & Microsoft 365** (on/off, engine selection and sign-in/status).
The **SharePoint & Microsoft 365 (WorkIQ)** skill is automatically available to all agents while enabled;
selecting it manually in an agent's Customize screen or a chat's skills is not required.

## Inputs & controls
- Switch **Allow Lumen to search Microsoft 365** (off by default).
- Select the same AI engine used by the chat. For **GitHub Copilot**, **Open Work IQ connector** opens its dashboard:
  choose **Connectors > Work IQ**, not `m365`, a `WorkIQ` user server or the `workiq` plugin.
  An already connected managed connector needs no separate Work IQ CLI sign-in.
- For **Claude**, **Sign in / check connection** opens its separate `m365` connection, which requires its own consent.
- Return to Lumen and send a Microsoft 365 question. **Refresh status** displays the latest status reported by that
  engine in a Lumen chat; it does not perform a live network check or read a document.
- The `microsoft-365` skill is included automatically for every agent when the connection is on; no separate
  capability selection is needed, including in existing chats.

## Behaviour (as implemented)
- **Copilot uses the existing GitHub-managed Work IQ connector**, documented at
  [Copilot connectors](https://docs.github.com/en/copilot/concepts/customizations/copilot-connectors).
  Its published service is `https://api.github.com/copilot-connectors/api/v1/connectors/workiqmcp/mcp`;
  Lumen explicitly supplies that endpoint as `workiqmcp` in each enabled chat and connection window, since a
  standalone engine process does not necessarily inherit the Copilot app's connector inventory. Copilot's
  `--mcp-github-auth workiqmcp=https://api.github.com` sends its signed-in GitHub credential only to the approved
  origin. No credential is copied into Lumen or its arguments, and no separate Microsoft Work IQ OAuth client is
  used. Engines without that authentication flag report an update requirement rather than falling back.
  Known standalone aliases `m365`, `WorkIQ` and `workiq` are disabled for Lumen's Copilot runs and dashboard window
  so they do not initiate another sign-in. Their saved configuration is not changed.
- **Claude uses the standalone hosted Work IQ CLI application**, configured at
  `https://workiq.svc.cloud.microsoft/mcp` with its public OAuth client and engine-owned callback port 12798.
  This is not the GitHub-managed connector. A connected Copilot connector does not grant standalone consent.
  If administrator approval is required, stop and request it; do not retry through another identity.
- Office and Azure DevOps remain local. The connection window uses a dedicated folder and does not install plugins
  or rewrite global MCP configuration. No local WorkIQ download, new dependency, Lumen listener or token store.
- Lumen automatically includes the Microsoft 365 skill on each attended turn while the connection is enabled,
  regardless of the agent's or chat's stored skills. Tools are available only when file access is not "Just chat".
  Turning the connection off removes access on the next turn without changing stored skills.
  Copilot is explicitly instructed not to use Microsoft 365 otherwise. Existing managed connectors may
  still appear in its native inventory: this is not hard connector isolation. The explicitly supplied `workiqmcp`
  server is disabled when not requested, including helper completions.
- Read-only operation and citations are required by the skill, but the service can offer writes; engine permission
  rules still apply. The selected connection must never be replaced by a lookalike or fallback identity after denial.
- Connection status comes from engine events, independently from tool discovery. The UI distinguishes not checked,
  sign-in window opened, connecting, connected, sign-in needed and failure, and includes reported discovery counts
  and redacted diagnostics. It never equates a launched window, tools or an empty search with successful document access.
  Status is advisory, per engine and in memory; it resets on server restart.
- Copilot status/discovery events must match the exact `workiqmcp` server whose endpoint Lumen supplies. The engine
  may label this per-run configuration as `user`; neither a display name nor `account` provenance is required.
  Similarly named servers and plugins do not establish success. Claude status still refers to its standalone `m365`.
- The skill follows hosted WorkIQ's routing: evidence retrieval and local synthesis, direct entity reads for bounded
  lists, schema-checked read-only searches, and delegation only when explicitly requested. SharePoint document
  queries start with exact-prefix `/search/query` discovery, its action schema and the read-only `do_action`.
  Graph-like paths are not assumed supported: empty discovery never permits a guessed `/me/drive/recent` call.
  Latest-editor searches resolve the signed-in identity, retain document/location/editor constraints, use bounded
  descending modification-time results and verify returned metadata. Answers describe the latest verified indexed
  match, not a guaranteed global latest edit or complete editing history. A SharePoint-only question must not
  silently substitute personal OneDrive, and business documents must not be confused with indexed build artifacts
  or dependency files just because they satisfy `IsDocument:true`.
  Path-specific access errors stop the request without automatically diagnosing broken sign-in or recommending
  reconnection; authentication guidance requires an actual authentication diagnostic.
- The stored setting is `settings.workiq = { enabled }`. Older JSON with `tenantId` still loads; saving removes that
  unused field. No secret is stored.

## Troubleshooting
- **Access not enabled:** turn on the connection and choose **Read my files** or **Create & edit files** in the chat.
  Existing chats pick up the setting on their next turn; no agent migration, restored defaults or manual skill
  selection is required. Scheduled prompts remain excluded.
- **Update required:** update GitHub Copilot when it lacks `--mcp-github-auth`; do not replace the connector with
  the standalone Work IQ application to work around missing support.
- **Operation refused:** preserve the actual error. `Access denied for GET path: /me/drive/recent` alone does not
  establish expired credentials, administrator-consent requirements or denied access to a particular document.
  Do not retry other routes after denial. Fix unsupported route selection before a subsequent request.
- **No qualifying document:** explain the search scope and evidence limits. Ask for the SharePoint site or library
  when it would help; do not broaden to personal OneDrive, drop the requested editor or report a build artifact
  as the answer. A text mention of the user's name or email is not proof that they edited the file.
- **Connected but no answer:** connection and tool discovery are independent of document permissions and indexed
  results. Refreshing status is not a network or document-access test; a real question is needed to exercise search.

## Limits
- Not a way to upload to SharePoint ([58](58-knowledge-publishing.md)); the notebook still syncs via OneDrive.
- No Approve cards: nothing here is staged the way Azure DevOps changes are.
- Not exported to Copilot or VS Code agents.
- Opening an engine window is Windows-only. No Microsoft 365 data access or blocked standalone sign-in is retried
  while correcting connector selection. Offline tests do not establish tenant access or document permissions.

## Source
`lib/workiq.js`, `lib/skills.js` (`workiqReady`, `toolConfig`, `promptFor`), `skills/microsoft-365/SKILL.md`, `lib/server/routes/connections.js`
(`/api/connections/workiq`, `/api/connections/workiq/connect`), `providers/claude-cli.js`, `providers/copilot-cli.js`,
`public/js/connections.js` (`openWorkiqSettings`), `test/workiq.test.js`, `test/workiq-api.test.js`, `test/workiq-providers.test.js`,
`e2e/workiq.spec.js`.
