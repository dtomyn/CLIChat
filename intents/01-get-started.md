# 01 — Get started: welcome steps, home screen, my name, light/dark theme

## Intent
As a business user, I want to start Lumen with a double-click, answer a few welcome questions and land on a home
screen that greets me by name and shows what I can do, so that I can start working without configuring anything.

## Where
- **`Start Lumen.cmd`** (Windows) or `npm start`; the browser opens at `http://localhost:4317`.
- The 3-step welcome dialog on first run.
- The home screen (rail **Chat**, the Lumen logo, or **New chat** / Ctrl K).
- **Settings** (the user card at the bottom of the sidebar): **Your name**, **Appearance**.

## Inputs & controls
| Control | Effect |
|---|---|
| Welcome step 1: **Your first name** | Saved as `userName`; Enter moves on. |
| Welcome step 2: **Choose your AI engine** | Engine cards (see [03](03-choose-ai-engine.md)); the ready engine is pre-selected. |
| Welcome step 3: **Where do you keep your work?** | Shows the notebook folder; **Choose a different folder** opens the folder picker (see [02](02-choose-notebook-folder.md)). |
| **Continue** / **Back** / **Start using Lumen** | Moves between steps; the last one saves everything. |
| **Settings › Your name** | Edits the name ("What should Lumen call you?"). |
| **Settings › Appearance**: **Match system** / **Light** / **Dark** | Applies the theme at once; **Save** stores it. |
| Home: agent chips, starter chips, prompt cards, **Guided delivery** | Pick an agent ([14](14-use-and-pin-agents.md)), fill the message box with a starter, open a prompt ([16](16-run-a-prompt.md)), go to lifecycle runs ([34](34-guided-lifecycle-runs.md)). |

## Behaviour (as implemented)
- **Launcher**: `Start Lumen.cmd` stops with "Node.js is required…" when `node` is missing, runs `npm install` on the
  first run (no `node_modules`), then starts `node server.js --open`, which opens the default browser. The window must
  stay open while Lumen is used. `PORT` changes the port (default `4317`).
- **Welcome** (`openOnboarding`) opens when `settings.onboarded` is not set. It cannot be dismissed (no ×, no Escape,
  no backdrop click). If the saved engine is not available, the first available one is pre-selected. The last step
  also lists **Agents**, **Prompt gallery** and **Not Microsoft 365 Copilot** (Lumen runs on the chosen engine, so
  Copilot's data protections don't apply). **Start using Lumen** saves `userName`, `providerId`, `workspace` and
  `onboarded: true`, then shows a confetti burst (`celebrate`).
- **Name**: the server trims it, replaces control characters with spaces and keeps 80 characters. It is used for the
  greeting (first word only), the avatar initial (✦ when empty), the sidebar card (**Welcome** when empty), the system
  prompt ("The user's name is …"), and as the approver for lifecycle stages ([34](34-guided-lifecycle-runs.md)) and
  Azure DevOps changes ([39](39-approve-ado-changes.md)).
- **Home** (`renderHome`): with the Lumen agent selected the heading is a time-of-day greeting (**Burning the
  midnight oil** before 5:00, **Good morning**, **Good afternoon** from 12:00, **Good evening** from 17:00) plus the
  first name, and **How can I help today?**; with another agent it shows that agent's emoji, name and tagline. The
  selected agent's starter prompts appear as chips under the message box. Then: the in-sample banner, or for a new
  user the one-line sample hint ([04](04-install-demo-and-samples.md)), **Agents** (all agents plus **Create an agent**), **From the prompt
  gallery** (the first 6 prompts) and **Guided delivery** (Lumen only). The message box gets focus unless a dialog is open.
- **Theme** (`applyTheme`): `system` removes `data-theme` so the OS preference applies; `light`/`dark` set it. The choice
  is also kept in `localStorage` (`lumen-theme`), and an inline script in `index.html` applies it before first paint
  to avoid a flash. On start, the saved `settings.theme` is applied again.
- **Layout**: an app rail (**Chat**, **Agents**, **Prompts**, **Notebook**, **Lifecycle**, **Insights**) mirrors
  Microsoft 365 Copilot, with **Samples** ([04](04-install-demo-and-samples.md)) at the bottom; the sidebar collapses with the rail button and starts collapsed at 860 px wide or less.
- If the first API calls fail, the page shows **Lumen couldn't start** with the error.

## Outputs
- `data/settings.json` with `userName`, `providerId`, `workspace`, `theme`, `onboarded`.
- A personalised home screen; the sidebar card shows the name and engine status ("Claude · Ready").

## Acceptance criteria
- On a fresh data folder the welcome opens and cannot be closed until **Start using Lumen**; afterwards it never
  reopens (`onboarded: true`).
- A name with line breaks or over 80 characters is cleaned and shortened by `PUT /api/settings`.
- Choosing **Dark** in Settings changes the page immediately; after **Save** and a reload the page opens dark with no
  light flash.
- The greeting changes with the hour and uses only the first word of the name.
- No automated test covers onboarding, the home screen or the theme (UI only).

## Limits
- Picking a theme previews it immediately and writes `localStorage` even if Settings is closed without saving; the
  saved setting wins again on the next load.
- The welcome cannot be re-run from the UI (only by removing `onboarded` from `data/settings.json`).
- The launcher is Windows-only; other systems use `npm install` and `npm start`.
- Fonts (Inter, JetBrains Mono) load from Google Fonts; Segoe UI is used on Windows.

## Source
`Start Lumen.cmd`; `public/index.html` (rail, sidebar, theme script); `public/app.js` (`boot`, `openOnboarding`,
`celebrate`, `renderHome`, `greetingWord`, `firstName`, `renderUser`, `applyTheme`, `openSettings`, `saveSettings`);
`server.js` (`PUT /api/settings`, `GET /api/status`, `buildSystemPrompt`, `--open`); `lib/store.js` (`settings` defaults).
