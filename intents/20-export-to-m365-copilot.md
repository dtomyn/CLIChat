# 20 — Take agents and prompts to Microsoft 365 Copilot

## Intent
As a user (or the IT admin who rolls out Copilot), I want my Lumen agents and prompts in a form Microsoft 365 Copilot
accepts, with a clear list of what won't carry over, so that the switch to Copilot doesn't mean starting again.

## Where
- **Agents › ⋯ › Export to Microsoft 365 Copilot** (one agent; not offered for **Lumen**).
- **Agents › Export all to Copilot** (every agent except **Lumen**).
- **Prompts › Export to Copilot** (every prompt).
- **Copy for Copilot** on a prompt's form (one filled-in prompt to the clipboard).

## Inputs & controls
| Control | Effect |
|---|---|
| **Export to Microsoft 365 Copilot** / **Export all to Copilot** | Writes the agent folders; the dialog offers **Copy Agent Builder text** (one agent only), **Open folder**, **Done**. |
| **Export to Copilot** (prompts) | Writes `Prompts.md`; the dialog offers **Open file**, **Done**. |
| **Copy for Copilot** | Copies the prompt with the answers typed so far; toast "Copied. Paste it into Microsoft 365 Copilot and choose Save prompt". |

## Behaviour (as implemented)
- Everything is written to `<notebook>/Microsoft 365 Copilot/` with a `README.md` mapping Lumen ideas to Copilot
  (agents, prompt gallery, scheduled prompts, notebooks, `/` file references) and listing what doesn't carry over.
- **Per agent**, `Agents/<agent name>/` (unsafe file-name characters become `_`) holds:
  - `Copy into Agent Builder.txt`: NAME, DESCRIPTION, INSTRUCTIONS, STARTER PROMPTS (title + message), KNOWLEDGE
    (add the OneDrive/SharePoint folder) and NOT CARRIED OVER, for *Agents › Create agent › Configure*.
  - `<agent name> (Teams app).zip`: `manifest.json` (Teams schema v1.19), `declarativeAgent.json` (v1.3),
    `color.png` (192×192, agent colour with a white spark) and `outline.png` (32×32).
- `declarativeAgent`: name ≤ 100, description (the tagline, else the name) ≤ 1000, instructions ≤ 8000 (default
  `You are <name>, a helpful assistant.`), up to 6 non-empty starters, each titled by its first sentence (≤ 50);
  longer text is clipped with "…".
- `appManifest`: app `id` is a stable UUID from the agent id, so re-exporting updates the same app; short name ≤ 30,
  short description ≤ 80; developer fields are placeholders ("Your organization (edit before publishing)",
  `example.com` URLs) for the admin to fill in; accent colour from the agent's colour.
- **Not carried over** (`lumenOnly`): each skill ("<title> skill (uses Lumen's local document tools)") and, for agents
  with **Create & edit files**, "Creating and editing files directly in your project folder". Shown in the dialog with
  a **Lumen only** badge.
- **Prompts.md**: grouped by category, each prompt with emoji, name, description in italics, "Use with the **<agent>**
  agent." (not for Lumen), and the template in a `text` block where `{{key}}` becomes `[<question label>]`.
- **Copy for Copilot**: blanks stay `[<label>]`; file answers become `/<file name>`, the way files are referenced in
  Copilot.
- Exporting again overwrites the same files. Errors come back as "Couldn't export: <reason>".

## Outputs
- The `Microsoft 365 Copilot` folder in the notebook; the agent text on the clipboard; the prompt on the clipboard.

## Acceptance criteria
- `test/copilot-export.test.js` › declarative agent uses Agent Builder fields and drops empty starters.
- `test/copilot-export.test.js` › app manifest id is stable and short fields fit the limits.
- `test/copilot-export.test.js` › Lumen-only features are listed as not carried over.
- `test/copilot-export.test.js` › exportAgents writes paste-ready text and a valid app package.
- `test/copilot-export.test.js` › prompts become plain text with [blanks] for each question.

## Decisions
- Two ways in per agent: paste into Agent Builder (no IT needed) or an app package for IT to validate with the
  Microsoft 365 Agents Toolkit and publish.
- Lumen-only features are badged in the UI and listed in every export, "so nobody is surprised on switch-over day".

## Limits
- Skills, file editing, lifecycle runs and Microsoft Project/Excel tools have no Copilot equivalent; the export only
  lists them.
- The app package is not validated by Lumen; the admin must edit the developer details first.
- Knowledge sources are not exported; the text tells the user to add their OneDrive/SharePoint folder.
- Scheduled prompts are not exported.

## Source
`lib/copilot-export.js` (`exportAgents`, `writeAgent`, `declarativeAgent`, `appManifest`, `agentBuilderText`,
`lumenOnly`, `starters`, `exportPrompts`, `promptText`, `README`, `LIMITS`, `stableUuid`, `png`), `lib/server/routes/library.js`
(`/api/assistants/:id/export-copilot`, `/api/assistants/export-copilot`, `/api/recipes/export-copilot`),
`public/js/agents.js`, `public/js/prompts.js`, `public/js/home.js` (`exportToCopilot`, `exportPromptsToCopilot`, `openRecipeRunner` **Copy for Copilot**,
`lumenOnlyBadge`, `needsLocalTools`).
