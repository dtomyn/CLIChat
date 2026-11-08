# 02 — Choose the notebook (project) folder Lumen works in

## Intent
As a business analyst or project manager, I want to point Lumen at the folder that holds my documents (ideally in
OneDrive) and see what is in it, so that the AI reads and saves files in the right place and Microsoft 365 Copilot can
find the same files later.

## Where
- Welcome step 3 **Where do you keep your work?** › **Choose a different folder** ([01](01-get-started.md)).
- **Settings › Default notebook (project folder)** › **Change**.
- In a chat: the folder pill in the chat header (shows the folder name) › **Show files**, **Open in Explorer**,
  **Change folder…**.
- Rail **Notebook**: the Notebook drawer with **Open in Explorer** and **Change folder**.

## Inputs & controls
| Control | Effect |
|---|---|
| Folder picker: places (**Home**, **Documents**, **Desktop**, any **OneDrive…**), **Drives** | Jumps to that location. |
| Folder list | Opens a subfolder. |
| **Up** | Goes to the parent folder (disabled at the drive list). |
| Path box ("Type or paste a folder path and press Enter") | Opens the typed folder. |
| **New folder name (optional)** + **Create folder** | Creates a subfolder in the open folder and opens it. |
| **Use this folder** / **Cancel** | Returns the open folder; ×, Escape or the backdrop count as Cancel. |
| Notebook drawer file row / 📌 | Opens the file ([13](13-see-file-changes.md)) / pins it to the chat ([09](09-pin-files-to-chat.md)). |

## Behaviour (as implemented)
- **Default folder** (`defaultWorkspace`): `<OneDriveCommercial>\Lumen`, else `<OneDrive>\Lumen`, else
  `<home>\Documents\Lumen`; it is created if missing. `resolveWorkspace` uses the requested folder if it exists, then
  the saved setting if it exists, then this default.
- **In-app picker** (`pickFolder`, `/api/folder/browse`): Lumen lists folders itself rather than opening a native dialog
  (which could open behind the browser). With no path it lists the existing drive letters (`/` elsewhere). Folders
  starting with `.` or `$`, `node_modules` and `System Volume Information` are hidden; names sort case-insensitively.
  A missing folder gives "That folder doesn't exist."; an unreadable one "Lumen isn't allowed to open that folder.".
  If the start folder can't be opened, the picker falls back to the drive list.
- **Create folder** (`/api/folder/mkdir`): strips `< > : " / \ | ? *` and trailing dots/spaces; an empty name or `..`
  gives "Type a name for the new folder.".
- **Where the change applies** (`changeFolder`): inside a saved chat it changes only that chat's folder
  (`PATCH /api/conversations/:id`); on the home screen it changes the default notebook (`PUT /api/settings`). Both
  refuse a path that is not an existing folder ("Choose an existing project folder."). Toast: **Now working in <name>**.
  Settings › **Change** and the welcome step only change the default.
- A chat keeps the folder it started in; new chats take the default. Uploads, the `/` file picker, pins, exports and
  every AI tool work relative to the chat's folder.
- **Notebook drawer** (`openDrawer`): header **Project folder · <path>**; a tip when the path doesn't contain "OneDrive"
  ("This folder isn't in OneDrive…"); **Files changed in this chat** (each with time or **Missing**, **Go to reply**
  scrolls to the reply that changed it); **Recently changed**: up to 60 newest files, newest first, from the folder
  and two levels of subfolders, skipping names that start with `.` and `node_modules` (`listFolder`). An empty
  folder shows "This notebook is empty.".
- **Open in Explorer** opens the folder with `explorer.exe` (`open`/`xdg-open` elsewhere) via `/api/folder/open`.

## Outputs
- `settings.workspace` (default notebook) or the chat's own `workspace`.
- The Notebook drawer listing; the folder opened in Explorer.

## Acceptance criteria
- `PUT /api/settings` with a `workspace` that is not an existing folder returns 400 "Choose an existing project folder."
- `PATCH /api/conversations/:id` with a non-folder `workspace` returns 400 and leaves the chat unchanged.
- Changing the folder from a chat does not change the default notebook, and vice versa.
- The browse list never shows hidden (`.`/`$`) folders or `node_modules`.
- The drawer warns when the notebook is not in OneDrive.
- No automated test covers the folder picker (UI only); `test/lifecycle-context.test.js` and the other API tests run
  against a `workspace` passed in the request.

## Decisions
- **Browse in the page, not a native dialog**: a dialog spawned by the server can open behind the browser or on another
  screen and looks like a dead button.
- **OneDrive by default**: files made in Lumen are already where Microsoft 365 Copilot can find them
  ([20](20-export-to-m365-copilot.md)).

## Limits
- "In OneDrive" is detected by the word "onedrive" in the path only.
- The drawer's recent list stops two subfolder levels down and after about 300 files.
- `POST /api/folder/check` exists but the UI does not use it.

## Source
`server.js` (`oneDriveRoot`, `defaultWorkspace`, `resolveWorkspace`, `isDir`, `browseFolder`, `listFolder`, `openPath`,
routes `/api/folder/browse|mkdir|open|files|check`, `PUT /api/settings`, `PATCH /api/conversations/:id`);
`public/app.js` (`pickFolder`, `changeFolder`, `folderMenu`, `openDrawer`, `currentWorkspace`, `openSettings`,
`openOnboarding`); `public/index.html` (`#filesDrawer`).
