# 07 — Find and organize chats

## Intent
As a user with many chats, I want them titled automatically, grouped by date, searchable, and easy to pin, rename or
delete, so that I can get back to earlier work quickly.

## Where
- Sidebar **Chats**: **Search chats** box, the chat list, each chat's ⋯ menu.
- Chat header: the title (click to rename) and the ⋯ menu.
- **New chat** (Ctrl K).

## Inputs & controls
| Control | Effect |
|---|---|
| **Search chats** | Filters the list as you type. |
| Chat ⋯ › **Rename** / title click | Opens **Rename chat** (prefilled, max 80 characters); **Save** stores it. |
| Chat ⋯ › **Pin to top** / **Unpin** | Moves the chat into or out of the **Pinned** group. |
| Chat ⋯ › **Delete** / header ⋯ › **Delete chat** | Asks **Delete this chat?** then deletes it. |
| Header ⋯ › **Copy whole conversation** | Copies every message as "You:" / "<agent>:" blocks separated by `---`. |
| Header ⋯ › **Open notebook** | Opens the Notebook drawer ([02](02-choose-notebook-folder.md)). |
| **New chat** / Ctrl K | Clears the draft and returns to the home screen. |

## Behaviour (as implemented)
- **Auto-title** (`autoTitle`): a new chat is first titled with the first 48 characters of the message (… when
  longer); then the engine's `complete` is asked for "a 2-5 word title" from the first 1,500 characters. The first
  line, stripped of quotes, `#`, `*` and a trailing full stop and cut to 60 characters, replaces it and arrives as the
  `title` event. If the engine returns nothing the fallback stays. Chats Lumen creates itself (lifecycle stages,
  scheduled runs, branches) get their own titles instead ([34](34-guided-lifecycle-runs.md),
  [18](18-schedule-prompts.md), [11](11-edit-resend-and-branch.md)).
- **List** (`renderConvList`, `GET /api/conversations`): newest activity first, grouped **Pinned**, **Today**,
  **Yesterday**, **Previous 7 days**, **Older** by `updatedAt` (pinned chats only under **Pinned**). Each row shows the
  agent's emoji and the title, plus 🕘 for a scheduled chat, a dot for unread and a live dot while replying. Empty:
  "Your conversations will show up here.".
- **Search** matches, case-insensitively, the title or the preview (the first 120 characters of the last message).
  No match: "No chats match your search.".
- **Rename**: an empty title is ignored; the server keeps up to 200 characters. The open chat's header updates at once.
- **Delete**: the dialog says "This can't be undone. Files it created in your project folder are kept." Delete stops a
  running reply, removes `data/conversations/<id>.json` and the chat's Azure DevOps change sets
  (`changesets.removeConversation`), refreshes the list and returns home if the chat was open. Toast **Chat deleted**.
- **Unread**: scheduled-run chats arrive unread; opening a chat marks it read (`PATCH { unread: false }`).
- A chat whose agent was deleted still opens and shows the first agent's look.

## Outputs
- `title`, `pinned` and `unread` in `data/conversations/<id>.json`; the grouped, filtered sidebar list.

## Acceptance criteria
- The first reply of a new chat ends with a `title` event, and the saved chat has that title.
- `PATCH /api/conversations/:id { pinned: true }` moves the chat to **Pinned**; `{ title }` longer than 200 characters
  is cut to 200.
- `DELETE /api/conversations/:id` removes the chat file and its change sets (`test/ado-integration.test.js` › discard
  writes nothing; a changed connection blocks apply; read-only chats get no proposals, which also checks that deleting
  returns 200; `test/ado-changesets.test.js` › expired proposals cannot be applied and conversations clean up).
- Unread is set for scheduled chats and cleared by `PATCH { unread: false }` (`test/schedules-api.test.js` › schedule
  API enforces permissions and runs paused checks without elevating access).
- Searching "budget" shows only chats whose title or last message contains it.

## Limits
- Search covers titles and the last message's preview only, not whole conversations.
- Delete is permanent; there is no archive or trash.
- Pinned chats have no manual order (newest activity first).

## Source
`public/js/sidebar.js`, `public/js/chat.js`, `public/js/main.js` (`renderConvList`, `convMenu`, `renameConv`, `deleteConv`, `refreshConvs`, `renderChat` header menu,
`newChat`, `bindChrome`); `lib/server/chat.js` (`autoTitle`, `runTurn` `title` event, `GET|PATCH|DELETE /api/conversations`);
`lib/store.js` (`conversations.list`, `save`, `remove`); `tools/ado/changesets.js` (`removeConversation`).
