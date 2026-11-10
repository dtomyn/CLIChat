# 16 — Run a guided task

> Guided tasks used to be called the "prompt gallery". Quick text prompts are in [72](72-quick-prompts-and-prompt-lab.md).

## Intent
As a project manager (or any user), I want to pick a ready-made prompt, answer a few simple questions and choose my
files, so that the right agent does a well-specified job without me writing the request.

## Where
- **Tasks** in the left rail: the **Guided tasks** page with category tabs (**All**, one tab per category,
  **Scheduled**).
- The **Guided tasks** section and the search of the Prompt Lab ([72](72-quick-prompts-and-prompt-lab.md)).
- Home: the demo banner's prompt buttons (the home screen no longer lists gallery prompts).
- Clicking a card opens the prompt form (runner modal).

## Inputs & controls
| Control | Effect |
|---|---|
| Category tab | Filters cards by `category`. |
| Prompt card | Opens the form: emoji, name, description, one field per question, and "<agent> will take it from here". |
| Short answer / Long answer | Text input / text area. |
| Pick one | Segmented buttons; the default (or first) choice is preselected. |
| A file | Dropdown of matching files in the notebook, **None** (optional fields), and **⬆ Upload from my computer…**. |
| **Start** | Fills the template and sends it to the prompt's agent. |
| **Copy for Copilot** | Copies the filled-in request to the clipboard (see [20](20-export-to-m365-copilot.md)). |
| **Repeat…** | Opens the schedule form (see [18](18-schedule-prompts.md)). |
| **Edit** | Opens the prompt builder (see [17](17-save-and-build-prompts.md)). |
| **Just give me the prompt** | Closes the form and puts the request in the message box with unanswered questions as `[blanks]` (see [72](72-quick-prompts-and-prompt-lab.md)). |

## Behaviour (as implemented)
- 73 built-in prompts ship in `defaults/recipes.json`, across 16 categories (Project plans, Budgets & Excel, Analysis,
  Projects, Everyday, Writing, Delivery lifecycle, Azure DevOps, Quality engineering, Change & training, Release,
  Architecture, Security, Data, Integration, Engineering). Each names an `assistantId`, an optional `access`, `fields`
  and a `template` with `{{key}}` placeholders.
- **File questions**: Lumen lists every file in the notebook (`/api/folder/files?all=1`), keeps those whose extension
  is in the field's `accept`, and ranks them by words from the field key and label found in the file name, then by
  newest. It preselects the best match if its name scores, if it is the only match, or if every match is a version of
  one file (`X`, `X (updated)`, `X (proposed)`: the newest wins). A file already picked for another field is not
  preselected again. No match: "No <ext> files in your project folder". Uploads go to the notebook (`/api/upload`).
- **Required**: every field that is not `optional` and whose placeholder doesn't say "optional". Missing:
  toast "Please fill in “<label>”" or "Please choose “<label>”", and focus moves to it.
- **Start** replaces each `{{key}}` with the answer (`(not specified)` if blank; file fields become `"<file name>"`),
  attaches the chosen files and sends with `recipeId`. File access is the highest of the prompt's `access`, the
  default access in Settings, and **Read my files** when a file is attached.
- Cards show the agent, **Saves a file** for `access: 'edit'`, and **Lumen only** when the prompt saves files or takes
  a `.mpp`/`.xml` plan.

## Outputs
- A new chat with the prompt's agent, the filled request as the first message and the files attached; the reply
  streams as usual (see [05](05-chat-with-lumen.md)). Runs count in **Insights** (see [19](19-see-usage-insights.md)).

## Acceptance criteria
- The Project plans tab lists Monthly plan change log, Weekly look-ahead and Update plan from ADO backlog
  (`e2e/project-prompts.spec.js` › the new prompts are in the Project plans gallery).
- The plan file is preselected (`e2e/project-prompts.spec.js` › Weekly look-ahead: plan is preselected, steps and
  answer show); two file questions each get the right file (› Update plan from ADO backlog: files are preselected and
  proposals show); with a plan and its `(updated)` copy, the newest is chosen (› Monthly plan change log: material
  changes are listed with reasons).
- Start is refused while a required question is empty.

## Limits
- The file matching is a name heuristic; the user may need to change the choice.
- Prompts run with the global default AI engine and response mode.

## Use a prompt inside a chat
- In the message box, **+ → Use a prompt** opens the Prompt Lab. Picking a guided task there opens the same form,
  with files from that chat's project folder. **Start** sends the filled-in prompt into the current chat (no new chat); from a new chat it starts the chat, as the gallery does.
- The chat's current agent answers. If the prompt was built for another agent, the form offers **Switch to …**.
- If the prompt needs more access than the chat has, the form says so and Start raises the chat's access to match.
- **Repeat…** isn't offered here; schedule prompts from the gallery. Covered by `e2e/chat-prompts.spec.js`.

## Source
`public/js/prompts.js`, `public/js/home.js`, `public/js/streaming.js` (`renderRecipesPage`, `recipeCard`, `needsLocalTools`, `openRecipeRunner`, `public/js/prompt-lab.js` (`openPromptLab`), `fieldInput`,
`sendMessage`, `renderHome`, `demoBanner`), `lib/server/routes/library.js`, `lib/server/routes/files.js`, `lib/server/chat.js` (`/api/recipes`, `/api/folder/files`, `/api/upload`,
`runTurn` storing `recipeId`), `defaults/recipes.json`.
