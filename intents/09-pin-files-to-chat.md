# 09 — Pin files to a chat

## Intent
As a project manager, I want to pin the plan, RAID log or requirements a chat keeps coming back to, so that Lumen
considers them on every message without my attaching them each time.

## Where
- The **Pinned files** strip above the composer (home and chat), with a chip per pin and **+ Add**.
- **+ › Pin a file to this chat** in the composer; the 📌 button on an attachment chip of a sent message; the 📌 button
  next to each file in the notebook drawer (**Recently changed**).

## Inputs & controls
| Control | Effect |
|---|---|
| **+ Add** / **+ › Pin a file to this chat** | Opens **Pin files to this chat**: every file in the notebook with a checkbox; **Choose** adds the ticked ones ("Choose at least one file" if none). |
| 📌 on a message's attachment chip | Pins that attached file. |
| 📌 in the notebook drawer | Pins that file to the open chat (or to the draft on the home screen). |
| **×** on a pin chip (**Unpin**) | Removes the pin. |

## Behaviour (as implemented)
- Pins are a list of file paths. Adding merges with the existing pins without duplicates (`setPins`).
- In a saved chat the list is stored on the conversation with `PATCH /api/conversations/:id` `{ pinned_files }`; the
  server refuses anything but a list of strings ("Pinned files must be a list of paths."). On the home screen the pins
  live in the draft (`S.draft.pinned`) and are sent as `pinned_files` with the first message, which creates the chat
  with them. Starting a new chat clears draft pins.
- Each time the strip is drawn Lumen calls `POST /api/file-status`; a pin that no longer exists, or is outside the
  chat's folder, is marked **missing** on its chip. It stays in the list until unpinned.
- On every turn (`runTurn`) only pins that resolve (after following links) to a file inside the chat's folder are used:
  - the system prompt gets `Key files for this chat (read them when relevant): "rel1", "rel2"`, rather than the user
    message, so it doesn't clutter history;
  - file skills switch on by the pins' extensions (`skills.resolve`);
  - a chat on **Just chat** runs with read access when it has usable pins ([06](06-control-access-and-response-mode.md)).
- Branching copies the pins to the new chat ([11](11-edit-resend-and-branch.md)). Lifecycle stages and gate checks
  create their chats with the stage inputs pinned ([34](34-guided-lifecycle-runs.md)).

## Outputs
- Pin chips (📌 name, full path on hover, **missing** tag when gone) above the message box.
- The pinned files' relative paths in the engine's system prompt for every message in the chat.

## Acceptance criteria
- Pins sent with a new chat are saved on the conversation, appear in the system prompt as relative paths and turn on
  the matching skill; a pin outside the folder is left out of the prompt; **Just chat** becomes read access
  (`test/lifecycle-context.test.js` › pinned context persists, activates skills and ignores removed and outside files).
- After unpinning everything, or deleting the pinned file, the prompt no longer has the "Key files for this chat"
  line, and `/api/file-status` reports the file as not existing (same test).
- Pinning a file that is already pinned does not add a second chip.
- A missing pinned file shows **missing** on its chip.

## Decisions
- Pins go in the system prompt, not the user message, so history and replays stay clean (plan 05).

## Limits
- Lumen tells the engine which files matter; it does not paste their contents. The engine reads them with its own
  tools, subject to the chat's access level.
- Missing pins are flagged but not removed automatically.

## Source
- `public/js/composer.js`, `public/js/chat-clicks.js`, `public/js/folder.js`, `public/js/main.js`, `public/js/streaming.js`: `pinsFor`, `pinnedHTML`, `checkPinnedFiles`, `setPins`, `pickPinnedFiles`, `chooseWorkspaceFiles`,
  `bindComposer` (strip clicks, **+** menu), `chatClicks` (`data-pin-file`), `openDrawer` / `bindChrome` (drawer 📌),
  `sendMessage` (`pinned_files`).
- `lib/server/routes/chat.js`, `lib/server/routes/files.js`, `lib/server/chat.js`, `lib/server/workspace.js`: `PATCH /api/conversations/:id`, `/api/file-status`, `runTurn` (`pinned`, `workspaceFile`, system prompt
  line), `/api/conversations/:id/fork`.
