# 39 — Propose and approve Azure DevOps changes

## Intent
As a product owner or delivery lead, I want Lumen to prepare Azure DevOps changes (new stories from the approved
design, field and tag updates, links, comments, wiki pages) and show me exactly what will change, so that nothing is
written to our shared backlog or wiki until I click **Apply**, and my name is recorded on it.

## Where
- Any agent with the **Azure DevOps work items & wiki** skill in a **Create & edit files** chat; e.g. **Story
  Writer** (starter "Create the approved stories as work items in Azure DevOps") and **Backlog Helper**.
- Prompts (category *Azure DevOps*, access `edit`): **Stories from the design → Azure DevOps** (agent **Story
  Writer**), **Publish a document to the wiki** (agent **Backlog Helper**).
- Lifecycle run, approved stage ([34](34-guided-lifecycle-runs.md)): **Create work items in Azure DevOps** on
  **Stories**, **Publish to the Azure DevOps wiki** on the other stages. Toast "Lumen is preparing the changes. You
  approve them in the chat." and the new chat opens.
- **Approve cards** under the reply in the chat.

## Inputs & controls
| Control | Effect |
|---|---|
| **Approved design or backlog** (file `.md,.docx,.txt`), **Parent feature or epic number (optional)** | **Stories from the design → Azure DevOps** |
| **Document to publish** (file `.md,.docx,.txt`), **Wiki page path (optional)** | **Publish a document to the wiki** |
| **Apply** | Writes this proposal to Azure DevOps. |
| **Discard** | Closes it; nothing is written. |
| **Apply all <n>** | Shown when a reply has more than one pending card; applies them one by one. |

## Behaviour (as implemented)
- **Proposal tools** (`ado_propose_*`) never call a write API: they validate against live data and stage a change
  set file `data/ado-pending/<chat>/<id>.json` (pending, expires after 24 hours), then return "Proposed (not applied
  yet)… nothing has changed in Azure DevOps" and `{"pending": "<id>"}`, which the engine turns into an Approve card.
  The server ignores ids not staged for that chat. There are no delete tools.
- **Availability**: only in **Create & edit files** chats (read-only chats get read tools only) and never in
  scheduled checks.
- **Validation** (plain-language refusals):
  - Work items: 1–25 per proposal; type by name or alias (story, user story, PBI, backlog item, requirement, epic,
    feature, bug, task → the project's type); required fields must be given ("Ask the user for these rather than
    guessing"); allowed values and states are checked; area and iteration paths must exist (`@current` needs a team
    sprint); tags without commas or semicolons, ≤ 100 characters; parent and related items must exist; wiki links
    `https://` only. "Lumen" is added as a tag.
  - Updates: the `rev` read must still be current; read-only fields are refused; "Nothing would change" is refused.
  - Links: ≤ 50; parent, child, related, predecessor, successor, hyperlink (`https://`); existing links are skipped;
    no self-links; changing an existing parent is refused.
  - Comments: ≤ 10,000 characters.
  - Wiki pages: not on code wikis; an existing page needs the etag from `ado_read_wiki_page` and must not have changed;
    content ≤ 500,000 characters, not empty, not identical; Markdown saved exactly as given.
- **Approve card** (built from the stored change set, never from the AI's prose): title, project, **Why:**, a table
  Item · Field · Now · Proposed (Now dropped for new items), a line diff for wiki pages (+/− counts), status tag
  (**Waiting for your approval**, **Applied**, **Partly applied**, **Discarded**, **Expired**, **Changed in Azure
  DevOps first**, **Couldn't apply**) with who and when, and "Nothing changes in Azure DevOps until you click Apply."
- **Apply** (`POST /api/chat/<id>/approvals/<cs>`), the only path that writes:
  - Needs your name in Settings (otherwise the toast and Settings open); refuses a proposal already decided, being
    applied, or expired, and one proposed for a different organisation or project than the current connection.
  - Create: items one by one with the fields, tags, parent/related/wiki links and a History note "Created with Lumen.
    Approved in Lumen by <name> on <date>."; a failure after some were created is **Partly applied**.
  - Update: a `test /rev` operation first, so a change made meanwhile is a conflict and nothing is written.
  - Links grouped per item; comments posted as "🤖 **Lumen:** …" with the approval line; wiki pages saved with
    `If-Match` and a footer "Last updated with Lumen, approved by <name> on <date>"; a page created by someone else
    since the proposal is a conflict.
- Every decision is appended to `data/ado-audit.jsonl`. The outcome (with links) is added to the start of the next
  message as "[Lumen update: …]", so the AI reports what really happened. Deleting the chat removes its pending
  change sets.
- **Lifecycle hand-off**: needs an approved stage, its output file and a connection. Work items use **Story Writer**
  (describe types, reuse existing epics/features, propose parents first and stories with `parentId` only after the
  parents are applied, tag stories with FD/TD IDs, Given/When/Then in acceptance criteria, ask for missing values).
  Wiki uses the stage's agent with the Azure DevOps skill added to the chat, the existing page path or
  `/Lifecycle/<run>/<stage>`.

## Outputs
- Approve cards; after Apply, the result message and links to the created or changed items and pages.

## Acceptance criteria
- `test/ado-changesets.test.js` › proposing work items validates, stages a file and writes nothing to Azure DevOps;
  › proposals refuse invalid input with plain-language reasons; › apply creates the items with tags, parent link and
  an approval note; › an update sends a rev test; a conflict writes nothing and says so; › wiki proposals need the
  etag, keep Markdown untouched and refuse code wikis; › links skip existing ones, comments are prefixed, and nothing
  can be proposed for deletion; › expired proposals cannot be applied and conversations clean up.
- `test/ado-integration.test.js` › tool server: proposals stage a change set and make zero writes; › a proposal
  becomes an Approve card; only Apply writes, once, and the AI hears the outcome; › discard writes nothing; a changed
  connection blocks apply; read-only chats get no proposals; › an approved lifecycle stage hands off to Azure DevOps
  in an edit chat that ends in proposals.
- `test/ado-units.test.js` › mdToHtml strips scripts, handlers and javascript: links; › lineDiff shows removals
  before additions and collapses unchanged runs.

## Decisions
- D3 every write needs a click on an Approve card; approval is a server path the AI has no tool for. D4 work item
  types and fields are discovered at runtime. D5 lifecycle IDs go in tags. D7 no deletes; retire an item by proposing
  its Removed/Closed state (`docs/plans/08-azure-devops.md`).

## Limits
- Mock-tested only (`ADO_MOCK`); not yet run against a real organisation.
- Code wikis are read-only; changing an item's parent must be done in Azure DevOps.
- Proposals expire after 24 hours and must be asked for again.
- Exported VS Code / CLI kits have no Approve cards, so they get read tools only ([21](21-use-in-vscode.md)).

## Source
`tools/ado-mcp.js` (`PROPOSAL_TOOLS`), `tools/ado/changesets.js` (`proposeWorkItems`, `proposeUpdate`,
`proposeLinks`, `proposeComment`, `proposeWikiPage`, `stage`, `load`, `describe`, `apply`, `outcomeNote`, `audit`,
`MAX_ITEMS`, `TTL`), `tools/ado/markup.js` (`mdToHtml`, `lineDiff`), `server.js` (`/api/chat/<id>/approvals`,
`decideChangeSet`, `adoNotes` in `runTurn`, stage action `azure-devops`), `public/app.js` (`approvalCard`,
`loadApproval`, `decideApproval`, `repaintApproval`), `lib/tool-labels.js` (`pendingChangeSet`),
`providers/claude-cli.js`, `providers/copilot-cli.js`, `skills/azure-devops/SKILL.md`, `defaults/recipes.json`
(`ado-stories-from-design`, `ado-publish-wiki`).
