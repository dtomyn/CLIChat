# 08 — Attach and reference files

## Intent
As a business user, I want to hand Lumen a document from my computer or point it at a file already in my notebook, so
that the reply is based on my real files rather than on what I paste into the message.

## Where
- The composer's **+** button (**Add content** menu), the message box (`/` mention), paste into the message box, and
  drag-and-drop anywhere on the page while a composer is shown (overlay **Drop files to attach** · "They'll be saved to
  your notebook (project folder)").
- Attachment chips above the message box; the sent message shows the same chips.

## Inputs & controls
| Control | Effect |
|---|---|
| **+ › Upload from this device** | Opens the browser file picker (several files allowed) and uploads each file to the notebook's `Attachments/` folder. |
| **+ › Reference a file in your notebook** | Inserts `/` at the caret and opens the file picker (hint "Or type / in the message box"). |
| **+ › Pin a file to this chat** | See [09](09-pin-files-to-chat.md). |
| `/` typed at the start or after a space | Opens **Files in your notebook**: up to 8 files whose relative path contains the typed text. ↑/↓ move, Enter or Tab picks, Esc closes. |
| Paste (files on the clipboard) | Uploads the pasted files instead of inserting text. |
| Drag and drop | Uploads the dropped files (only when a message box is on screen). |
| **×** on a chip | Removes the attachment from the draft (the uploaded file stays in `Attachments/`). |

## Behaviour (as implemented)
- **Upload** (`uploadFiles` → `POST /api/upload?workspace=&name=`): the raw file body (at most 25 MB, `readBody`) is
  saved in `<notebook>/Attachments/`. The name is reduced to its base name, characters `<>:"/\|?*` and control
  characters become `_`, trailing dots/spaces are removed, and it is cut to 200 characters (`file` if empty). Files are
  written with the `wx` flag, so an existing file is never replaced: a clash becomes `name (2).ext`, `name (3).ext`…
  (up to 999). The notebook is the open chat's folder, else the default one ([02](02-choose-notebook-folder.md)).
- While a file uploads its chip shows a spinner and does not count toward enabling **Send**; a failed upload removes the
  chip and shows "Couldn't attach <name>".
- **`/` mention** (`fileMention`): the trigger is `/` followed by text without spaces or slashes. The list comes from
  `GET /api/folder/files?all=1` (whole notebook, recursive, skipping dot-files/folders and `node_modules`), cached for
  30 s per folder. Files whose name starts with the typed text come first, then the most recently changed. Picking a
  file removes the `/text` from the message and attaches the file **by reference** (its path); nothing is copied. The
  same file is never attached twice.
- **Send**: Enter (or the send button) sends text plus the finished attachments. With attachments and no text the
  message is "Please take a look at the attached file(s)." Without a connected engine Lumen opens **Settings** on the
  engine section with "Connect an AI engine first" ([03](03-choose-ai-engine.md)).
- **Server** (`runTurn`): only paths that are existing files are kept. The prompt sent to the engine gets
  `[Attached files: "rel/path", …]` appended (paths relative to the notebook); the stored message keeps the user's own
  text and the attachment list.
- **Access**: when a turn has attachments (or pinned files) and the chat is on **Just chat**, that turn runs with read
  access ([06](06-control-access-and-response-mode.md)).
- **Skills**: file skills switch on by extension of the attached files (`skills.resolve`), and files attached earlier in
  the same chat keep their skills on, so follow-ups ("apply the approved changes") have the same tools.

## Outputs
- Uploaded files in `<notebook>/Attachments/`.
- Attachment chips on the user message; each has a 📌 button that pins it to the chat ([09](09-pin-files-to-chat.md)).

## Acceptance criteria
- Uploading two files with the same name keeps both (`report.docx`, `report (2).docx`); no existing file is overwritten.
- A name such as `100% plan.xlsx` is saved unchanged (the query value is decoded once only).
- Typing `/bud` lists notebook files whose path contains "bud", names starting with it first; Enter attaches the
  highlighted file and removes `/bud` from the message.
- Sending only an attachment sends "Please take a look at the attached file(s)." with the file listed in the prompt.
- A chat on **Just chat** with an attached workbook gets read access and the spreadsheet skill for that turn.
- Dropping files on the home or chat page uploads them; dropping on a page without a composer does nothing.

## Limits
- No automated test covers upload, `/` mention or drag-and-drop; the behaviour above is from the code.
- Uploads over 25 MB are refused by the server with a generic error ("Couldn't attach …").
- Attachments must be existing files inside the chat's notebook folder (`workspaceFile`); any other path is dropped
  silently rather than reported.
- Removing a chip does not delete the uploaded copy.

## Source
- `public/js/composer.js`, `public/js/main.js`: `composerHTML` (**+**, `#fileInput`), `bindComposer` (paste, **Add content** menu, Enter), `fileMention`,
  `notebookFiles`, `uploadFiles`, `attachChips`, `refreshAttach`, `submit`, `bindChrome` (drag and drop).
- `public/index.html`: `#dropOverlay`.
- `lib/server/routes/files.js`, `lib/server/folders.js`, `lib/server/chat.js`: `/api/upload`, `/api/folder/files` (`listFolder`), `runTurn` (attachments, access upgrade, skills).
- `lib/skills.js`: `resolve`.
