# 17 — Save a chat as a prompt and build prompts

## Intent
As a user, I want to turn a request that worked into a reusable prompt with a small form, or build one from scratch,
so that I (and later Microsoft 365 Copilot) can repeat it without retyping it.

## Where
- **Save prompt** under any of my messages in a chat (next to **Edit**).
- **Prompts › New prompt** or the **Create a prompt** card: **New prompt** form.
- **Edit** on a prompt's form: **Edit prompt** form (same fields).

## Inputs & controls
| Control | Effect |
|---|---|
| **Icon** | Up to 4 characters (default ⚡). |
| **Name** | Required ("Give it a name"). |
| **Category** | Free text; default **My prompts**; becomes a gallery tab. |
| **Short description** | Shown on the card and form. |
| **Agent** | Which agent runs it. |
| **File access** | **Use my default**, **Just chat**, **Read my files**, **Create & edit files**. |
| **Questions to ask** | One row per question: label, type (**Short answer**, **Long answer**, **Pick one**, **A file**), remove; **Add a question**. **Pick one** adds a "Choices, separated by commas" box. |
| **The request to send** | The template; a chip per question inserts `{{key}}` at the cursor. |
| **Create** / **Save** | Saves to the gallery. |
| **Delete** (left, only for prompts the user made) | Removes the prompt. |

## Behaviour (as implemented)
- **Save prompt** (`saveAsRecipe`) opens **New prompt** prefilled from the chat: name = chat title, icon = the agent's
  emoji, agent and file access = the chat's, category **My prompts**, template = the message text. Each attached file
  becomes a question `file1`, `file2`… labelled "File 1", "File 2"… of type **A file**, with `accept` set to the file's
  extension, and the file's name (with or without quotes) in the text is replaced by `{{fileN}}`.
- For a new prompt (or a question without a key), each question's key is made from its label: lower case,
  non-alphanumerics → `_`, max 24 characters, or `fieldN`. Renaming a label updates `{{old}}` to `{{new}}` in the
  template. Editing an existing prompt keeps existing keys.
- A **Pick one** question with no choices gets `Option A`, `Option B`.
- An empty template becomes one line per question: `<label>: {{key}}`.
- The server applies the same id/colour/access cleaning as agents (`cleanItem`); new prompts are never `builtin`.
  Editing a built-in prompt saves in place.
- Deleting a built-in prompt (via the API) records it in `data/recipes.removed.json`; **Restore defaults** brings
  built-ins back and removes user prompts.

## Outputs
- The prompt card in its category tab; toast "Prompt saved to your gallery" (new) or "Prompt saved" (edit).

## Acceptance criteria
- A prompt saved from a chat with attachments has one **A file** question per attachment, and its template uses
  `{{file1}}`… where the file names were.
- Saving without a name is refused; saving without a template generates one from the questions.
- Running the saved prompt sends the same request with the newly chosen files (see [16](16-run-a-prompt.md)).
- No automated test covers the builder.

## Limits
- The builder cannot set a file question's `accept` list or mark a question optional; only **Save prompt** sets
  `accept`, and only built-in prompts use `optional`.
- The builder's delete is only offered for prompts the user created; built-ins can be edited but not deleted from the UI.
- Prompts are stored in `data/recipes.json` on this computer; sharing them is by export (see
  [20](20-export-to-m365-copilot.md)).

## Source
`public/app.js` (`saveAsRecipe`, `openRecipeBuilder`, `msgHTML` **Save prompt** action, `rerenderPage`),
`server.js` (`/api/recipes` POST/PUT/DELETE, `cleanItem`), `lib/store.js` (`collection('recipes')`).
