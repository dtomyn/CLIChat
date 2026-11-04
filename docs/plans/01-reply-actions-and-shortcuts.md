# Plan 01: Reply actions and shortcuts

**Enhancements:** suggestion chips, copy a table, keyboard shortcuts
**Size:** small (front end only)
**Files:** `public/app.js`, `public/app.css`, `public/index.html` (only if a shortcuts dialog needs markup)

## Why

Non-technical users rarely discover hidden keys. Clickable chips make the "Suggested next step" obvious. Tables are the main output for project managers, and they need to paste them cleanly into Excel and Outlook. A few shortcuts help power users without getting in anyone else's way.

## Current state

- `suggestedNextStep(conv)` already pulls one suggestion out of the latest assistant reply. ↑ in an empty composer fills it in, and a hint appears in `.composer-hint`.
- Tables render through `renderer.table` as `<div class="table-wrap"><table>…`. They have no actions.
- The only global shortcuts are Ctrl/⌘+K (new chat) and Escape (close the menu or drawer).

## Design

### 1. Suggestion chips

- Generalise the extractor to `suggestedNextSteps(conv) → string[]` (up to 3). It should handle:
  - `Suggested next step(s):` followed by a bullet or numbered list
  - one inline sentence
  - `Next steps` / `What next` headings
  Keep `suggestedNextStep()` as `suggestedNextSteps(conv)[0]` for the ↑ shortcut.
- Render chips under the **last** assistant message only, and only when the reply isn't live. Put the `<div class="suggest-chips">` inside `assistantInner` when `m` is the last message, or append it after the `.msg-actions` row.
- A chip click calls `submit(text)`. Shift-click puts the text in the composer to edit instead of sending it.
- Chips are `<button data-suggest="…">` handled in `chatClicks`. Use `esc()` on the text, and cap it at about 140 characters with a `title` tooltip that holds the full text.
- Optional: add a line to the system prompt in `buildSystemPrompt` (server.js) that asks the model to end substantive replies with `**Suggested next step:** <one short imperative sentence>` when useful. This makes extraction reliable. Do this as a separate, clearly marked change so it's easy to revert.

### 2. Copy a table

- In `renderer.table`, add a small toolbar inside `.table-wrap`: `<button data-copy-table>Copy table</button>`. Allow the attribute through `md()`'s `ADD_ATTR`.
- On click, write **both** formats with `navigator.clipboard.write([new ClipboardItem({ 'text/html': …, 'text/plain': … })])`:
  - `text/html`: the table's `outerHTML` with inline borders, so Outlook keeps the grid.
  - `text/plain`: TSV built from `innerText` of each cell, with tabs and newlines inside cells replaced by spaces.
- Fallback: `writeText(tsv)` if `ClipboardItem` isn't available.
- Show "Copied" feedback with the existing `flash()`.

### 3. Keyboard shortcuts

Add these to the existing global keydown handler in `bindChrome`:

| Keys | Action | Notes |
|---|---|---|
| Esc | Stop the live reply in the current chat | Only if no menu, modal or drawer is open, so those still close first |
| Ctrl/⌘+Shift+C | Copy the last assistant reply | `flash` a toast |
| Ctrl/⌘+/ | Open a "Keyboard shortcuts" modal | Uses the existing `modal()` |
| / (outside an input) | Focus the composer | |
| ↑ in an empty composer | Fill in the suggested next step | Already done; list it in the modal |

Add a "Keyboard shortcuts" entry to the settings modal or the user menu, so the list can be found without knowing Ctrl/⌘+/.

## Steps

1. Refactor the extractor into `suggestedNextSteps` and test it with `node -e` (reuse the snippet approach from the ↑ feature) against bullets, numbered lists, an inline sentence and a reply with no suggestion.
2. Add chips: markup, CSS (pill buttons in the assistant colour, wrapping), and the click handler.
3. Add the table toolbar and copy handler, then test pasting into Excel and Outlook.
4. Add the shortcuts and the shortcuts modal.
5. Check that the composer hint still appears and that chips disappear while a reply is streaming.

## Acceptance checks

- A reply ending with a 3-item "Suggested next steps" list shows 3 chips. Clicking one sends it, and Shift-click fills the composer instead.
- Older replies don't show chips. Only the latest one does.
- A copied table pastes into Excel as separate cells and into Outlook as a bordered table.
- Esc stops a streaming reply. Esc with a menu open only closes the menu.
- Shortcuts don't fire while typing in inputs, except Esc and the modifier combinations.

## Out of scope

Rendering suggestions that the model returns as structured data (JSON); that needs provider changes.
