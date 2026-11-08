const fs = require('fs');
const path = require('path');

const LOCAL = /^(\d{4})-(\d{2})-(\d{2})[T ]((?:[01]\d|2[0-3])):([0-5]\d)$/;
// "YYYY-MM-DDTHH:MM" as local wall-clock time (what <input type="datetime-local"> gives).
function localTime(s) {
  const m = LOCAL.exec(String(s || ''));
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  return d.getDate() === +m[3] ? d : null;
}

// "Every N minutes between start and end", e.g. a status check every 30 minutes during a cutover window.
function intervalWindow(when) {
  const start = localTime(when.start), end = localTime(when.end);
  if (!start || !end) throw new Error('Choose when the window starts and ends.');
  if (end <= start) throw new Error('The window must end after it starts.');
  if (end - start > 14 * 86400000) throw new Error('Keep the window to 14 days or less.');
  if (!Number.isInteger(when.minutes) || when.minutes < 5 || when.minutes > 720) throw new Error('Choose how often to run, from every 5 minutes to every 12 hours.');
  return { start, end, step: when.minutes * 60000 };
}

/** True when an interval schedule's window is open at `t`. Other kinds of schedule have no window. */
function inWindow(when, t) {
  if (when?.kind !== 'interval') return true;
  const { start, end } = intervalWindow(when);
  return +t >= +start && +t <= +end;
}

function validateWhen(when) {
  if (when && when.kind === 'interval') { intervalWindow(when); return; }
  if (!when ||!['daily', 'weekly', 'monthly'].includes(when.kind) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(when.time || '')) throw new Error('Choose a valid frequency and time.');
  if (when.kind === 'weekly' && (!Array.isArray(when.days) || !when.days.length || when.days.some((d) => !Number.isInteger(d) || d < 0 || d > 6))) throw new Error('Choose at least one day of the week.');
  if (when.kind === 'monthly' && (!Number.isInteger(when.day) || when.day < 1 || when.day > 31)) throw new Error('Choose a day from 1 to 31.');
}

// Local wall-clock time; nonexistent DST times move forward, repeated times run once.
// Monthly days not present in a month are skipped. Interval schedules return null once their window has no runs left.
function nextDue(schedule, fromDate) {
  const when = schedule.when;
  validateWhen(when);
  const from = new Date(fromDate);
  if (!Number.isFinite(from.getTime())) throw new Error('Invalid schedule start date.');
  if (when.kind === 'interval') {
    const { start, end, step } = intervalWindow(when);
    const slot = from < start ? start : new Date(+start + (Math.floor((from - start) / step) + 1) * step);
    return slot <= end ? slot : null;
  }
  const [hour, minute] = when.time.split(':').map(Number);
  if (when.kind === 'monthly') {
    for (let offset = 0; offset < 24; offset++) {
      const month = new Date(from.getFullYear(), from.getMonth() + offset, 1, 12);
      const candidate = new Date(month.getFullYear(), month.getMonth(), when.day, hour, minute);
      if (candidate.getMonth() === month.getMonth() && candidate > from) return candidate;
    }
  } else {
    for (let offset = 0; offset <= 7; offset++) {
      const day = new Date(from.getFullYear(), from.getMonth(), from.getDate() + offset, 12);
      if (when.kind === 'weekly' && !when.days.includes(day.getDay())) continue;
      const candidate = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute);
      if (candidate > from) return candidate;
    }
  }
  throw new Error('Could not calculate the next run.');
}

function dueFrom(s) {
  return Math.max(s.createdAt, s.lastRunAt || 0, s.resumedAt || 0);
}

function start({ runTurn, store, workspaceFile, now = () => Date.now(), interval = 60000 }) {
  let queue = Promise.resolve();
  const pending = new Set();
  let stopped = false;

  function enqueue(id, manual = false, startup = false) {
    if (pending.has(id) || stopped) return false;
    pending.add(id);
    queue = queue.then(async () => {
      const s = store.schedules.get(id);
      if (stopped || !s || (!manual && !s.enabled)) return;
      const started = now();
      const next = nextDue(s, dueFrom(s));
      // A missed interval run is not made up once its window has closed.
      if (!manual && (!next || next.getTime() > started || !inWindow(s.when, started))) return;
      const due = next ? next.getTime() : started;
      const late = !manual && (startup || started - due >= interval);
      store.schedules.upsert({ id, lastRunAt: started, lastStatus: 'running', lastError: '', lastConversationId: null });
      try {
        const recipe = store.recipes.get(s.recipeId);
        if (!recipe) throw new Error('This prompt no longer exists.');
        const access = recipe.access || 'chat';
        if (!['chat', 'read', 'edit'].includes(access)) throw new Error('This prompt has an unsupported access level.');
        if (access === 'edit' && !s.allowEdit) throw new Error('This prompt needs permission to save files. Create a new schedule and allow saving files.');
        if (!fs.existsSync(s.workspace) || !fs.statSync(s.workspace).isDirectory()) throw new Error('The project folder no longer exists.');
        const values = {};
        const attachments = [];
        for (const field of recipe.fields || []) {
          const value = s.values[field.key] || '';
          if (!value && !field.optional && !/optional/i.test(field.placeholder || '')) throw new Error(`Please provide ${field.label}.`);
          if (field.type === 'file' && value) {
            if (!workspaceFile(value, s.workspace)) throw new Error(`Source file for ${field.label} is missing or outside the project folder: ${value}`);
            const file = path.resolve(s.workspace, value);
            attachments.push(file);
            values[field.key] = `"${path.basename(file)}"`;
          } else values[field.key] = value;
        }
        if (access === 'chat' && attachments.length) throw new Error('This prompt must allow reading files to use file inputs.');
        const message = recipe.template.replace(/\{\{(\w+)\}\}/g, (_, key) => values[key] || '(not specified)');
        const conv = store.conversations.create({ title: `${recipe.name} · ${new Date(started).toLocaleDateString()}`, assistantId: recipe.assistantId || 'lumen', workspace: s.workspace, access, scheduled: { scheduleId: id }, unread: true });
        if (store.schedules.get(id)) store.schedules.upsert({ id, lastConversationId: conv.id });
        const result = await runTurn({ conversationId: conv.id, message, attachments, recipeId: recipe.id });
        if (result.message.error || result.message.stopped) throw new Error(result.message.error || 'The scheduled run was stopped.');
        if (store.schedules.get(id)) store.schedules.upsert({ id, lastConversationId: conv.id, lastStatus: late ? 'late' : 'ok', lastError: '' });
      } catch (e) {
        if (store.schedules.get(id)) store.schedules.upsert({ id, lastStatus: 'error', lastError: e.message });
        console.error(`Scheduled check ${id}: ${e.message}`);
      }
    }).catch((e) => console.error(`Scheduler error: ${e.message}`)).finally(() => pending.delete(id));
    return true;
  }

  function tick(startup = false) {
    for (const s of store.schedules.all()) {
      try {
        const next = s.enabled ? nextDue(s, dueFrom(s)) : null;
        if (next && next.getTime() <= now() && inWindow(s.when, now())) enqueue(s.id, false, startup);
      } catch (e) { console.error(`Invalid schedule ${s.id}: ${e.message}`); }
    }
  }

  for (const s of store.schedules.all()) {
    if (s.lastStatus === 'running') store.schedules.upsert({ id: s.id, lastStatus: 'error', lastError: 'The previous run was interrupted when Lumen closed.' });
  }
  tick(true);
  const timer = setInterval(tick, interval);
  timer.unref();
  return { tick, runNow: (id) => enqueue(id, true), isPending: (id) => pending.has(id), stop: () => { stopped = true; clearInterval(timer); } };
}

module.exports = { nextDue, validateWhen, dueFrom, inWindow, localTime, start };
