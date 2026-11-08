# Plan 07: Scheduled checks

**Enhancement:** run quick starts on a schedule (for example "Project health check every Monday at 9:00") and leave the result as an unread chat
**Size:** large
**Files:** `lib/store.js`, new `lib/scheduler.js`, `server.js`, `public/app.js`, `public/app.css`
**Needs first:** the `runTurn` refactor of `handleChat` (Plan 06 step 3; do it here if Plan 06 hasn't been done). Unread state from Plan 04 is optional.

## Why

Project managers repeat the same checks every week. A schedule turns Lumen from "a tool I open" into "a report that's waiting for me".

## Constraints

- **The scheduler runs only while Lumen is running.** Lumen is a local app with no service or daemon, and adding one (Windows Task Scheduler, a background service) is out of scope. It would also need the owner's approval, because it runs things outside the app. Say this clearly in the UI.
- **Missed runs:** when Lumen starts, run anything that was due while it was closed, **once** (not once for every missed slot). Mark it "ran late".
- **Access:** scheduled runs use the quick start's own `access`. They are **never** promoted to `edit` automatically. If the quick start needs `edit`, the user must tick "Allow this schedule to save files" when creating it.
- No new listening ports and no new packages. Write a small cron-like matcher by hand. Don't add `node-cron`.

## Design

### Data

A `schedules` collection in `lib/store.js`:

```json
{ "id", "recipeId", "values": { "plan": "C:/…/plan.xml", "focus": "" },
  "workspace", "when": { "kind": "weekly", "days": [1], "time": "09:00" } | { "kind": "daily", "time": "08:30" } | { "kind": "monthly", "day": 1, "time": "09:00" },
  "allowEdit": false, "enabled": true, "lastRunAt", "lastConversationId", "lastStatus": "ok|error|late" }
```

Only offer daily, weekly and monthly, so there's no free-form cron to parse. (Plan 15 later added a fourth option, *Every few minutes, between two times*, for cutover weekends: 5 to 720 minutes inside a window of at most 14 days.)

### `lib/scheduler.js`

- `nextDue(schedule, fromDate) → Date`. This is a pure function: test it with `node -e` across day-of-week, month-end and daylight-saving cases.
- `start({ runTurn, store })`. Run `tick()` on a 60-second `setInterval` and once when the server boots. For each enabled schedule whose `nextDue(lastRunAt ?? createdAt) <= now`:
  - fill the recipe template with `values` (the same placeholder substitution as `openRecipeRunner`; move that helper to a shared place or reimplement it server-side)
  - create a conversation titled `"<recipe name> · <date>"` with `scheduled: { scheduleId }` and `unread: true`
  - call `runTurn` without an HTTP response
  - set `lastRunAt` and `lastStatus`
- Run schedules one after another, never at the same time, and skip a schedule if its previous run is still going.
- If a file field's path no longer exists, mark the schedule `error` with a plain message and don't run it.

### Server API

`GET/POST/PUT/DELETE /api/schedules`, plus `POST /api/schedules/:id/run-now`.

### UI

- In the recipe runner modal, add a **Repeat…** button next to Run. It opens a small form (Daily / Weekly with day chips / Monthly, a time, and "Allow saving files" when the quick start's access is `edit`) and saves the schedule using the values already filled in.
- On the Quick starts page, add a "Scheduled" tab listing schedules with next run, last result (link to the chat), Pause/Resume, Run now and Delete.
- In the sidebar, show scheduled chats with an unread dot and a 🕘 badge, and clear `unread` (PATCH) when the chat is opened. Add `unread` to the conversation list summary in `store.conversations.list()`.
- When a run finishes while the app is open, show a toast: "Your Monday health check is ready". The client can poll `/api/conversations` every 60 seconds while a schedule exists; that's simpler than adding a push channel.

## Steps

1. Do the `runTurn` refactor (if Plan 06 hasn't) and confirm normal chat still works.
2. Write `nextDue` and its tests.
3. Add the scheduler loop and the schedules API, then test with a schedule due 2 minutes from now.
4. Add the Repeat… form, the Scheduled tab, unread badges and the toast.
5. Test catch-up: create a schedule, stop the server across its due time, start it again, and check it runs once marked "late".

## Acceptance checks

- A weekly schedule creates exactly one chat per due slot while Lumen is running.
- Starting Lumen after a missed slot runs it once, marked late.
- Paused schedules don't run, and Run now works.
- Scheduled runs never save files unless the user explicitly allowed it.
- A missing source file gives a clear error on the schedule instead of a failed chat.
- The UI states that schedules only run while Lumen is open.

## Out of scope

OS-level scheduling, email or Teams notifications, and running schedules while the computer is asleep.
