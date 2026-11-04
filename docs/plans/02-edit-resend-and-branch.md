# Plan 02: Edit, resend and branch

**Enhancements:** edit and resend your own message, branch a chat
**Size:** medium (front end and server)
**Files:** `server.js`, `public/app.js`, `public/app.css`

## Why

Fixing a typo or rephrasing a prompt is the most common correction in chat. Today the only option is "Retry", which re-sends the same text and **appends** a new turn. Branching lets users try an alternative without losing a good thread. Both features need the same server capability: rewinding a conversation to a point and continuing from there.

## The core problem: CLI sessions

`handleChat` resumes the engine's own session (`conv.sessions[providerId]`). The CLI session remembers every turn, so if we only truncate `conv.messages` locally, the engine still "remembers" the discarded turns. The fix:

- When a conversation is rewound, **clear `conv.sessions`**. The next turn then has no `sessionId`, and `handleChat` already replays the stored history through `historyPrompt(priorMessages, message)`. That path exists for engine switches and does exactly what we need.
- `historyPrompt` only replays the last 12 messages. That's acceptable; mention it in a code comment.

## Design

### Server

1. Add an optional field `truncateFrom: <messageId>` to the `POST /api/chat` body. In `handleChat`, before building `priorMessages`:
   - If `truncateFrom` is set and found in `conv.messages`, set `conv.messages = conv.messages.slice(0, idx)` and `conv.sessions = {}`.
   - Refuse with 409 if the conversation is currently running (`running.has(conv.id)`).
2. Add `POST /api/conversations/:id/fork` with body `{ uptoMessageId }`. It creates a new conversation with the same `assistantId`, `access` and `workspace`, a title of `"<original title> (branch)"`, the messages copied up to and **including** `uptoMessageId` (fresh message ids from `store.id()`), `sessions: {}` and `forkedFrom: { id, messageId }`. It returns the new conversation.

### Client

1. **Edit a user message:** add a hover action on user bubbles: `<button data-edit-msg="id">Edit</button>`. Clicking it replaces the bubble with a textarea, Save & send, and Cancel (render this inline in `msgHTML`, keyed by `S.editing = id`).
   - On send: truncate `S.current.messages` locally from that message, then call `sendMessage({ text, attachments: original attachments, truncateFrom: id })`. `sendMessage` must pass `truncateFrom` through in the fetch body.
   - Only allow editing when the chat isn't live.
   - If the user edits an earlier message (not the last one), confirm with `modal()`: "Everything after this message will be replaced. Want to branch instead?" with the buttons **Replace** / **Branch instead** / Cancel.
2. **Change Retry:** make Retry replace the reply instead of appending. Send `truncateFrom: <the user message before it>` and resend the same text. Keep the `retryNote` behaviour.
3. **Branch:** add "Branch from here" to the assistant `.msg-actions` row (and to the edit confirm dialog). It calls the fork endpoint, then `refreshConvs()`, then `go('c/<newId>')`, and shows a toast: "Branched into a new chat".
4. Show a small "Branched from *title*" link at the top of a forked chat (from `conv.forkedFrom`).
5. Expose a helper `forkConversation(convId, uptoMessageId) → Promise<conv>`. Plan 06 reuses it.

## Steps

1. Add server `truncateFrom` and test with curl on a scratch conversation: check the JSON file in `data/conversations/` and that `sessions` is cleared.
2. Add the server fork endpoint and test it with curl.
3. Add the client edit UI, then the Retry change, then the branch action.
4. In the running app, edit the last message: the conversation shows one corrected turn, and the reply clearly doesn't remember the old wording. Ask "what did I first ask you?" to confirm.
5. Branch from the middle of a chat: the original stays unchanged, and the new chat continues with context.

## Acceptance checks

- Editing the last user message replaces it and its reply. No duplicate turns remain in the stored JSON.
- After an edit, the engine doesn't refer to the discarded wording.
- Retry replaces the failed or poor reply instead of stacking a second copy.
- A branch appears in the sidebar, opens on the fork point and continues independently. Deleting either chat leaves the other untouched.
- All edit and branch actions are hidden or disabled while a reply is streaming.

## Risks

- Attachments in edited messages: keep the original attachment paths. Removing attachments while editing is out of scope.
- Replaying more than 12 messages loses earlier context. A later improvement could summarise older turns.
