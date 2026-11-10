# Lumen server modules

`server.js` is the HTTP shell. It serves static files, sets security headers, runs `allowedRequest()`, and passes `/api/*` requests to the route modules in `routes/`.

## Routes

Each file in `routes/` exports `async route(req, res, url, { resource, rid, action, sub, m, parts })`. It either responds or returns without responding. `server.js` tries the routes in the order of its `ROUTES` list and stops at the first one that responds. If none respond, it sends a 404.

| Route file | Resources |
| --- | --- |
| `core.js` | `status`, `skills`, `demo`, `reset`, `settings`, `insights` |
| `pipelines.js` | `pipelines` |
| `runs.js` | `runs` |
| `files.js` | `diff`, `file-pair`, `file-status`, `export`, `upload`, `folder` |
| `connections.js` | `connections/workiq`, `connections/ado` |
| `chat.js` | `chat` (send, stop, approvals), `conversations` |
| `schedules.js` | `schedules` |
| `library.js` | `assistants`, `recipes` |

To add an API route, put it in the matching file (or add a new file and list it in `ROUTES`). Keep `allowedRequest()` in front of it.

## Shared logic

| Module | What it holds |
| --- | --- |
| `chat.js` | `runTurn`, `running` (replies in progress), `buildSystemPrompt`, `historyPrompt`, `autoTitle` |
| `lifecycle.js` | Pipeline validation, `reconcileRun`, `startRunTurn`, `diffFiles` |
| `stage-output.js` | Approval stamp and "unapproved inputs" label in stage output files |
| `ado-decisions.js` | `decideChangeSet` (Apply / Discard of Azure DevOps proposals) |
| `exports.js` | Agent drafting, VS Code kit, Microsoft 365 Copilot export, sample packs |
| `folders.js` | Folder browser, `openPath`, `listFolder` |
| `workspace.js` | Notebook folder resolution, `workspaceFile`, `inside`, `cleanAccess` |
| `insights.js` | Usage numbers for the Insights page |
| `http-util.js` | `send`, `readBody`, `json` |
| `state.js` | Handles set at startup (`scheduleRunner`) |

Dependencies go one way: routes → shared logic → `workspace.js` / `http-util.js`. `lifecycle.js` uses `chat.js`, but `chat.js` must not require `lifecycle.js`. That is why the stage labels are in their own module.
