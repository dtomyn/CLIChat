# 11 — Edit and resend, rewind, and branch a chat

## Intent
As a business analyst, I want to fix or rephrase a message I already sent, get a fresh answer to the same question, or
try an alternative in a separate copy of the chat, so that I can correct course without losing a good thread.

## Where
- User messages: **Edit** ("Edit and resend") on hover, which turns the bubble into a text box with **Cancel** and
  **Save & send**.
- Replies: **Retry** ("Replace this reply with a new one"), **Branch** ("Continue from here in a new chat"); a failed
  reply's error card has **Try again**.
- The dialog **Replace the rest of this chat?** and the banner **Branched from <chat>** at the top of a branch.

## Inputs & controls
| Control | Effect |
|---|---|
| **Edit** → **Save & send** (or Enter) | Resends the edited text from that message; Shift+Enter adds a line, Esc or **Cancel** leaves edit mode. |
| **Retry** / **Try again** | Resends the user message before that reply, unchanged. |
| **Branch** on a reply | Copies the chat up to and including that reply into a new chat and opens it. |
| **Replace the rest of this chat?** | Shown when later turns would be lost: **Cancel**, **Branch instead**, **Replace**. |
| **Branched from** link | Opens the original chat. |

## Behaviour (as implemented)
- **Rewind** (`rewind`): the message being resent keeps its original attachments. If no later user message exists the
  resend happens at once; otherwise the dialog asks "Everything after this message will be replaced. Want to branch
  instead?".
- **Replace** sends the text with `truncateFrom: <message id>`. The server drops that message and everything after it
  and forgets the engine's own session (`conv.sessions = {}`), so the next turn replays the stored history through
  `historyPrompt` instead of the engine remembering the dropped turns.
- **Branch instead** forks the chat up to the message just before the edited one (an empty branch when it was the
  first message) and sends the new text there; the original is unchanged.
- **Fork** (`POST /api/conversations/:id/fork` `{ uptoMessageId }`): a new chat with the same agent, access, folder and
  pinned files, title `<title> (branch)`, a deep copy of the messages up to and including `uptoMessageId` with new ids,
  no feedback and a `copied` flag, no engine sessions, and `forkedFrom: { id, messageId, title }`. A message no longer
  in the chat is refused ("That message isn't in this chat any more."). The app opens the branch and shows "Branched
  into a new chat".
- **Branched from** links to the source chat; if it was deleted the stored title shows in italics ("a deleted chat" if
  none).
- Edit, Retry and Branch do nothing while that chat's reply is running; the server also refuses a rewind or new turn
  while one runs ("Wait for the current reply to finish first.").
- A chat that is an approved lifecycle stage refuses new turns ("Send this approved stage back before changing it.")
  ([34](34-guided-lifecycle-runs.md)).
- Copied messages are skipped by **Insights**, so a branch does not double-count usage ([19](19-see-usage-insights.md)).

## Outputs
- The same chat with the tail replaced by the new exchange, or a new chat `<title> (branch)` with the banner.

## Acceptance criteria
- Editing the last user message resends at once with no dialog; the old message and reply are gone after reload.
- Editing an earlier message asks **Replace the rest of this chat?**; **Replace** removes every later turn; **Branch
  instead** leaves the original intact and continues in a new chat.
- **Retry** produces a new reply to the same text and attachments, replacing the old reply.
- **Branch** on a reply creates `<title> (branch)` with the messages up to that reply, the same pins and no 👍/👎.
- Forking with an unknown message id returns 400.

## Decisions
- Rewind clears the engine session and replays stored history rather than trying to rewind the CLI's own session
  (plan 02).

## Limits
- The replay after a rewind or in a branch includes only the last 12 messages, so older context is dropped.
- **Retry** passes a `retryNote` flag that `sendMessage` does not use; a retry is a plain resend.
- No automated test covers edit, retry or fork; the behaviour above is from the code.

## Source
- `public/app.js`: `msgHTML` (edit box, **Edit**), `assistantInner` (**Retry**, **Branch**, **Try again**), `chatClicks`,
  `renderChat` (Enter/Esc in the edit box), `setEditing`, `saveEdit`, `rewind`, `forkConversation`, `openBranch`,
  `branchFrom`, `branchAndSend`, `forkedFromHTML`, `sendMessage` (`truncateFrom`).
- `server.js`: `handleChat`, `runTurn` (`truncateFrom`, sessions reset), `historyPrompt`, `POST
  /api/conversations/:id/fork`, `insights` (`copied`).
