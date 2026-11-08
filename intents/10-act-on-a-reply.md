# 10 — Act on a reply

## Intent
As a business analyst, I want to copy a reply or one of its tables into Outlook, Word or Excel, continue with a
suggested next step in one click, tell Lumen whether the reply helped, and do all of it from the keyboard if I like,
so that a good answer turns into work quickly.

## Where
- The action row under each finished reply: **Copy**, **Retry**, **Branch**, **Export**, 👍, 👎, the model/duration
  line and "AI-generated content may be incorrect".
- **Copy table** above every table and **Copy** on every code block in a reply.
- Suggested-step chips under the last reply; the hint "↑ fills in the suggested next step" under the message box.
- The chat's **⋯** menu (**Copy whole conversation**); **Keyboard shortcuts** (Ctrl+/ or **Settings › Keyboard shortcuts**).

## Inputs & controls
| Control | Effect |
|---|---|
| **Copy** | Copies the reply's Markdown text; the button shows "Copied" briefly. |
| **Copy table** ("Copy for Excel, Word or Outlook") | Copies the table as formatted HTML and as tab-separated text. |
| **Copy** on a code block | Copies the code. |
| **⋯ › Copy whole conversation** | Copies every message as "You:" / "<agent name>:" blocks separated by `---`. |
| Suggested-step chip | Click sends it as the next message; Shift-click puts it in the message box to edit first. |
| ↑ in an empty message box | Fills in the first suggested step. |
| 👍 | Saves "helpful" and shows "Thanks for the feedback". Clicking it again undoes it. |
| 👎 | Opens **What went wrong?** with reasons **Wrong**, **Not what I asked**, **Too long**, **Didn't use my file** (pick one or none) and an optional note; **Send feedback** saves it. Clicking an active 👎 undoes it. |
| **Retry**, **Branch** | See [11](11-edit-resend-and-branch.md). **Export**: see [12](12-export-a-reply.md). |

Keyboard shortcuts (`openShortcuts`, handled in `bindChrome`; Ctrl is ⌘ on a Mac):
| Keys | Effect |
|---|---|
| Ctrl+K | Start a new chat. |
| Enter / Shift+Enter | Send / new line. |
| ↑ (empty message box) | Fill in the suggested next step. |
| `/` (not typing) | Jump to the message box. `/` in the message box references a file ([08](08-attach-and-reference-files.md)). |
| Esc | Closes an open menu or the notebook drawer; if nothing was open, stops the running reply. |
| Ctrl+Shift+C | Copy the last reply ("Last reply copied", or "No reply to copy yet"). |
| Ctrl+/ | Show the shortcut list (not while a dialog is open). |

## Behaviour (as implemented)
- **Suggested steps** (`suggestedNextSteps`) are read from the latest reply only, and only when it has finished: a
  "Suggested next step(s):" line or list, or a "Next steps" / "What's next" heading followed by a list or a sentence.
  The last such section wins; at most 3 steps; list markers, bold, code ticks, checkboxes and quotes are stripped.
  Chip labels are cut to 140 characters (full text on hover). A chip does nothing while a reply is running.
- Every system prompt asks the engine to end substantive replies with `**Suggested next step:** <one short imperative
  sentence>` when it helps (`buildSystemPrompt`).
- **Copy table** writes a bordered HTML copy (Calibri 11 pt, grey header) plus TSV with tabs/newlines inside cells
  flattened, so it pastes as a grid in Outlook/Word and as separate cells in Excel. Falls back to text only where the
  browser lacks `ClipboardItem`; failure shows "Couldn't copy the table".
- **Feedback** is saved on the reply with `PATCH /api/conversations/:id/messages/:mid`: `{ rating: 'up'|'down', at }`,
  with reason cut to 80 characters and note to 2000; other ratings are refused ("Unknown rating."). The 👎 tooltip
  then repeats the reason and note. Feedback stays on this computer and feeds **Insights**
  ([19](19-see-usage-insights.md)). Feedback given while a later reply is running is not lost.
- The action row is hidden while a reply streams; **Export** and the thumbs need reply text.
- Reply Markdown is sanitised (`DOMPurify`): only the two copy buttons may carry `data-*` attributes, so text from a
  document cannot fake an app button.

## Outputs
- Clipboard content (Markdown, HTML + TSV table, code, whole conversation).
- A new message sent from a chip, or the chip text in the message box.
- `feedback` stored on the reply in the conversation file.

## Acceptance criteria
- A reply ending with a 3-item "Suggested next steps" list shows 3 chips; click sends, Shift-click fills the composer.
- A reply with a single "**Suggested next step:** …" line shows one chip, and ↑ in an empty box fills it in.
- No chips show under older replies or while a reply is streaming.
- Copy table pastes into Excel as separate cells.
- Clicking 👍 twice leaves no rating; 👎 with **Too long** and a note stores both, and the note is capped at 2000 characters.
- Esc during a reply with no menu open stops it; Ctrl+Shift+C copies the last reply's text.

## Limits
- No automated test covers these actions; the behaviour above is from the code.
- Suggested steps depend on the engine following the closing-line instruction or using a "Next steps" heading.
- Copy copies Markdown source, not rendered rich text (only tables are copied rich).

## Source
- `public/app.js`: `assistantInner` (action row, chips), `renderer.table` / `renderer.code` (copy buttons), `md`,
  `chatClicks`, `copyTable`, `flash`, `suggestedNextSteps`, `suggestedNextStep`, `bindComposer` (↑), `feedbackButtons`,
  `DOWN_REASONS`, `rateReply`, `renderChat` (**Copy whole conversation**), `openShortcuts`, `bindChrome` (keydown),
  `openSettings` (**Keyboard shortcuts**).
- `server.js`: `buildSystemPrompt` (suggested-step line), `PATCH /api/conversations/:id/messages/:mid`, `runTurn`
  (keeps feedback written during a reply).
