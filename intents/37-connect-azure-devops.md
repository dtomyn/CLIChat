# 37 — Connect Azure DevOps

## Intent
As a delivery lead or project manager, I want to connect Lumen to my Azure DevOps project with my existing sign-in,
so that agents can read our work items and wiki, without Lumen storing my password or passing any credential to the AI.

## Where
**Settings › Connections › Azure DevOps** (card shows **Connected** with "<project> · <team> · <org>", or **Not set
up**). It opens the **Azure DevOps** dialog: "Let Lumen search and read your work items and wiki. Lumen only proposes
changes: each one waits for you to click Apply."

## Inputs & controls
| Control | Effect |
|---|---|
| **Organisation address** | e.g. `https://dev.azure.com/your-organisation`; "Cloud (dev.azure.com) only." |
| **How should Lumen sign in?** | **Use my Azure sign-in** (Azure CLI, `az login`) or **Use an access token** (disabled off Windows: "Only available on Windows"). |
| Access token field + **Save token** / **Remove it** | Stores or deletes the personal access token; shows "A token is saved". |
| **Check connection** | Signs in and lists projects; shows "Connected as <name>" or the reason it failed. |
| **Project**, **Team** (for "current sprint"), **Wikis to search first** | Appear after a successful check; changing the project re-checks. |
| **Save** / **Disconnect** | Save needs a project when an address is given; Disconnect clears the address, disables the connection and deletes any saved token. |

## Behaviour (as implemented)
- **Address**: `normalizeOrgUrl` accepts `https://dev.azure.com/<org>`, `dev.azure.com/<org>/…` and
  `https://<org>.visualstudio.com`, and stores `https://dev.azure.com/<org>`. Any other host is refused ("On-premises
  Azure DevOps Server isn't supported"); a missing or invalid organisation name is refused.
- **Azure CLI sign-in**: runs `az account get-access-token --resource 499b84ac-1321-427f-aa17-267ca6975798` with fixed
  arguments (found in the standard install paths or `AZ_CLI_PATH`); the token is cached until 5 minutes before it
  expires. Not installed → "The Azure CLI isn't installed…"; not signed in or expired → "Run "az login" once, then
  choose Check again." Lumen stores nothing for this method.
- **Access token**: Windows only. Saved with DPAPI for the current Windows user (`ConvertFrom-SecureString`, passed
  to PowerShell on stdin) in `data/secrets/ado-pat.dpapi`; useless to other users or computers. Help text asks for
  **Work Items: Read & write** and **Wiki: Read & write**. A missing token → "No access token is saved for Azure
  DevOps. Open Settings › Connections to add one."
- **What is saved**: `settings.ado = { orgUrl, project, team, auth, wikis (≤ 20), enabled }`, never the token. The
  general settings endpoint ignores `ado`; only `/api/connections/ado` changes it. `GET` returns `hasPat`,
  `patSupported`, `hasAz` instead of any secret.
- **Check** (`POST /api/connections/ado/test`): reads the signed-in user and the projects; for a chosen project also its
  teams and wikis (code wikis marked "read-only: published from a repository").
- **Connected** means address and project set and not disabled (`adoReady`). Only then do the Azure DevOps tools load
  for agents with the **Azure DevOps work items & wiki** skill; otherwise the AI is told "Azure DevOps isn't connected
  yet… ask them to open Settings › Connections". The tool server gets the address, project, team, auth method and
  wikis through its environment and fetches the credential itself.
- **Sign-in errors**: a 401, a 203 or redirect to a sign-in page, or HTML from an API refreshes the token once, then
  "Lumen couldn't sign in to Azure DevOps. Open Settings › Connections and choose Check again."
- Exported VS Code / CLI kits get the Azure DevOps server read-only and without credentials
  ([21](21-use-in-vscode.md)).

## Outputs
- The **Connected** status in Settings, the connected project named in agents' instructions, and the Azure DevOps
  buttons on lifecycle runs ([34](34-guided-lifecycle-runs.md)).

## Acceptance criteria
- `test/ado-integration.test.js` › connection settings: cloud addresses are normalised, on-premises refused, no secret
  returned; › without a connection the Azure DevOps tools are left out and the AI is told why.
- `test/ado-units.test.js` › normalizeOrgUrl accepts cloud addresses only; › client refreshes sign-in once on 401,
  then reports a friendly error; › client treats a 203 HTML sign-in page as an auth failure; › PAT auth without a
  saved token asks the user to add one; › secrets round-trip through DPAPI on Windows.

## Decisions
- D1 own tool server, D2 Azure CLI first with an encrypted access token as fallback, D6 cloud only
  (`docs/plans/08-azure-devops.md`). No app registration and no new listening port.

## Limits
- Tested only against a mocked Azure DevOps (`ADO_MOCK`); not yet run against a real organisation (plan 08 status).
- Token storage is Windows only; elsewhere use the Azure CLI.
- Tenant policy can block Azure CLI tokens or access tokens; Lumen has no other sign-in.

## Source
`public/app.js` (`openAdoSettings`, `adoReady`, Settings **Connections** card), `server.js` (`/api/connections/ado`,
`/test`, `/pat`), `tools/ado/client.js` (`normalizeOrgUrl`, `createClient` `request`), `tools/ado/auth.js`
(`createAuth`, `azToken`, `ADO_RESOURCE`, `PAT_SECRET`, `hasAz`), `tools/ado/connection.js` (`fromSettings`,
`fromEnv`, `configured`), `lib/secrets.js` (`save`, `load`, `has`, `clear`, `supported`), `lib/skills.js`
(`adoReady`, `toolConfig`, `promptFor`).
