# 18 — Run prompts on a schedule (scheduled checks)

## Intent
As a project manager or cutover lead, I want a prompt to run by itself every morning, every Monday, monthly, or every
30 minutes during a cutover window, so that the check is waiting for me as an unread chat without me remembering to
run it.

## Where
- **Repeat…** on a prompt's form opens **Repeat <prompt name>**.
- **Prompts › Scheduled prompts** tab: the schedule list.
- Sidebar chat list: scheduled chats show 🕘 and an unread dot.

## Inputs & controls
| Control | Effect |
|---|---|
| **Repeat** | **Daily**, **Weekly**, **Monthly**, or **Every few minutes, between two times**. |
| **Time (local)** | Default 09:00 (not shown for the interval kind). |
| **Days** (weekly) | Sun–Sat check boxes; Monday is preselected. |
| **Day of month** (monthly) | 1–31, default 1 ("Months without this date are skipped."). |
| **Every** / **From** / **Until** (interval) | 15, 30 (default), 45 minutes or **Hour**; local start and end date-times. |
| **Allow this schedule to save files** | Shown only for prompts with `access: 'edit'`. |
| **Save schedule** | Saves with the answers currently in the prompt's form. |
| Schedule card: **Pause** / **Resume**, **Run now**, **Delete**, **Open last chat** | Manage one schedule. |

## Behaviour (as implemented)
- **Repeat…** first checks the form's required questions like **Start** does; file answers are saved as full paths.
  The schedule stores `recipeId`, `values`, the notebook folder, `when`, `allowEdit`, `enabled`.
- Validation (`validateWhen`, `POST/PUT /api/schedules`): time `HH:MM`; weekly needs at least one day; monthly day
  1–31; interval every 5–720 minutes, window end after start and at most 14 days; answers must be text; the folder
  must exist; the prompt must exist. A prompt that saves files must have `allowEdit: true`; `allowEdit` is refused for
  prompts that don't save files; switching a schedule to another editing prompt needs a fresh explicit allow.
- **Only while Lumen runs**: `scheduler.start` ticks every 60 s inside the server. On start, anything due while Lumen was
  closed runs **once** and is marked late; a run more than a minute past due is also late. Runs go one at a time
  (a queue); a schedule already queued is not queued again ("This schedule is already running or waiting to run.").
- Times are local wall-clock; nonexistent DST times move forward, repeated ones run once; monthly dates that don't
  exist in a month are skipped. Interval runs happen only inside the window and are not made up after it closes;
  `nextDue` then returns `null` and the card shows **Window finished**.
- Each run checks again: the prompt exists, its access is `chat`/`read`/`edit`, edit has permission, the folder
  exists, every required answer is present, each file is inside the folder (`workspaceFile`), and a **Just chat**
  prompt has no file answers. It never raises the prompt's file access. Then it creates a chat titled
  `<prompt name> · <date>` with the prompt's agent, `unread: true` and `scheduled.scheduleId`, and runs the turn.
- In scheduled chats Azure DevOps tools can read but never propose changes (`ADO_NO_PROPOSALS`, see
  [39](39-approve-ado-changes.md)).
- A run left `running` when Lumen closed is set to error "The previous run was interrupted when Lumen closed."
- **Run now** works on paused schedules. Resuming or changing `when` restarts the clock (`resumedAt`), so a paused
  period is not made up.
- The page polls `/api/schedules` every 60 s; when a run finishes `ok` or `late` it shows the toast
  "Your <prompt> is ready" and refreshes the chat list.

## Outputs
- A new unread chat per run; opening it clears the unread flag.
- Card status: **Paused** or **Next run: <date>** or **Window finished**, then **Running or waiting**, **Ready**,
  **Ran late**, **Not run yet**, or **Error: <reason>** (e.g. "Source file for Plan is missing or outside the project
  folder: …"), with **Open last chat**.

## Acceptance criteria
- `test/scheduler.test.js` › nextDue handles weekdays, month ends and local daylight saving time.
- Missed runs catch up once and are late, runs are serialised, paused schedules don't run but **Run now** does,
  missing files error without a chat, and an edit prompt without permission is refused (`test/scheduler.test.js` ›
  catch-up, serialization, access, missing files, pause and manual runs).
- `test/scheduler.test.js` › a live weekly slot runs once at its due time and is not repeated on restart.
- `test/scheduler.test.js` › interval schedules run every N minutes, only inside their window.
- The API rejects invalid times and edit prompts without permission, and runs with the prompt's own access
  (`test/schedules-api.test.js` › schedule API enforces permissions and runs paused checks without elevating access).
- **Repeat…** opens the form and **Weekly** shows the days (`e2e/project-prompts.spec.js` › Repeat… is offered on the
  new prompts).

## Decisions
- No OS service or task scheduler: runs happen only while Lumen is running, said in the form and the list
  (`docs/plans/07-scheduled-checks.md`).
- Missed runs run once, not once per missed slot.

## Limits
- No UI to edit a schedule's time or answers; delete and recreate it.
- The form offers 15–60 minute intervals although the server accepts 5–720.
- Scheduled runs use the default AI engine and model in Settings.

## Source
`lib/scheduler.js` (`localTime`, `intervalWindow`, `inWindow`, `validateWhen`, `nextDue`, `dueFrom`, `start`),
`lib/server/routes/schedules.js`, `lib/server/chat.js` (`/api/schedules` routes, `scheduleRunner`, `runTurn`), `lib/skills.js` (`toolConfig` `scheduled`),
`public/js/prompts.js`, `public/js/sidebar.js`, `public/js/chat.js` (`openRecipeRunner` **Repeat…**, `openScheduleForm`, `renderRecipesPage` Scheduled tab,
`pollSchedules`, `renderConvList`, `openConversation` unread), `lib/store.js` (`schedules`).
