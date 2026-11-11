# 72 — Quick prompts and the Prompt Lab

## Intent
As a business user, I want ready-made prompts I can click, adjust and send (like the prompt tabs and Prompt Lab in
Microsoft 365 Copilot), so that I can start quickly without filling in a form.

## Where
- Home: topic tabs under the message box (for example **File insights**, **Catch up**, **Write**, **Plan & track**),
  each listing up to five prompts, then **…**.
- **…** or **+ → Use a prompt** in the message box: the **Prompt Lab** dialog.
- **Prompts** in the left rail: the same Prompt Lab as a page, with **New prompt** and **Export to Copilot**.
  Guided tasks (forms) moved to **Tasks** in the rail (see [16](16-run-a-prompt.md)).

## Inputs & controls
| Control | Effect |
|---|---|
| Topic tab | Shows that tab's prompts. |
| A prompt | Puts its text in the message box. **Nothing is sent.** The first `[blank]` is selected. |
| <kbd>Tab</kbd> in the message box | Selects the next `[blank]` (wraps to the first). No blanks: normal Tab. |
| <kbd>/</kbd> typed over a selected blank | Opens the notebook file picker. The chosen file is attached and its name replaces the blank. |
| Prompt Lab left side | **Your saved prompts**, **Built-in prompts**, **Guided tasks**, then **Prompt topics** (Analyze, Ask, Catch up, Create, Edit, Learn, Plan, Prepare, Review, Summarize, Track) and **Search**. |
| **Guided form** (on prompts made from a guided task) | Opens that task's question form instead. |
| Edit / Delete (your own prompts) | Edits or removes the prompt. |
| **New prompt**, **Save prompt** under a sent message | Prompt editor: Title, Prompt (blanks in `[square brackets]`), Topic, Agent. **Make it a guided task instead** opens the guided-task builder ([17](17-save-and-build-prompts.md)). |

## Behaviour (as implemented)
- Quick prompts are `{ id, title, text, topic, group?, agentId, builtin? }`, stored in `data/prompts.json`. 26
  built-ins ship in `defaults/prompts.json`. Installs that already exist pick them up on the next start.
- Every guided task also appears as a quick prompt (`task:<id>`). Its `{{field}}` placeholders become `[label]`, a
  pick-one becomes `[a / b / c]`, and its topic is guessed from the name and description.
- Tabs for **Lumen** come from built-in prompts grouped by `group` (first four groups). For another agent the tabs
  are **Suggested** (the agent's starters), up to three topics of that agent's guided tasks, and **Yours** (prompts
  you saved for that agent).
- Picking a prompt on Home switches to the prompt's agent (unless it is Lumen) and raises file access if the
  guided task it came from needs more. Inside a chat it only fills the message box.
- **Save prompt** under a sent message replaces each attached file's name with `[file N]`, adding one at the end
  if the name wasn't in the text.
- The question form of a guided task has **Just give me the prompt**: answers given so far go in, empty questions
  stay as blanks, and chosen files are attached.
- **Export to Copilot** writes quick prompts first (by topic), then guided tasks, to `Prompts.md`
  ([20](20-export-to-m365-copilot.md)).
- Lumen's "about itself" tools list both, with `type` `quick prompt` or `guided task` ([71](71-ask-lumen-about-itself.md)).

## Acceptance criteria
- `e2e/quick-prompts.spec.js`: a tab prompt fills the box with `[recipient]` selected, Tab moves to `[topic]`,
  nothing is sent. The Prompt Lab filters by topic, search finds guided tasks, and **Just give me the prompt** works.
  **Save prompt** shows up under **Your saved prompts**.

## Limits
- Blanks are plain text in the message box. A blank you don't fill is sent as written.
- Prompts are private to this install. There is no shared section yet.

## Source
`public/js/prompt-lab.js` (`promptTabsHTML`, `bindPromptTabs`, `usePrompt`, `selectBlank`, `quickFromRecipe`,
`openPromptLab`, `renderPromptsPage`, `openPromptEditor`), `public/js/composer.js` (Tab and `/` on blanks),
`public/js/chat-actions.js` (`saveAsPrompt`), `public/js/prompts.js` (**Just give me the prompt**), `lib/store.js`
(`prompts`), `lib/server/routes/library.js` (`/api/prompts`), `lib/copilot-export.js` (`exportPrompts`),
`tools/lumen-mcp.js`, `defaults/prompts.json`.
