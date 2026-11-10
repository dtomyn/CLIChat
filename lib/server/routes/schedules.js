// Lumen server: Scheduled prompts.
const fs = require('fs');
const path = require('path');
const store = require('../../store');
const scheduler = require('../../scheduler');
const { json, send } = require('../http-util');
const { running } = require('../chat');
const { resolveWorkspace } = require('../workspace');
const state = require('../state');

/** Handles the request if it is one of these routes; otherwise returns without responding. */
module.exports = async function route(req, res, url, { resource, rid, action, sub, m, parts }) {
  if (resource === 'schedules') {
    if (m === 'GET' && !rid) return send(res, 200, store.schedules.all().map((s) => ({ ...s, nextRunAt: s.enabled ? scheduler.nextDue(s, scheduler.dueFrom(s))?.getTime() ?? null : null, running: state.scheduleRunner.isPending(s.id) })));
    if (m === 'POST' && rid && action === 'run-now') {
      if (!store.schedules.get(rid)) return send(res, 404, { error: 'Schedule not found.' });
      if (!state.scheduleRunner.runNow(rid)) return send(res, 409, { error: 'This schedule is already running or waiting to run.' });
      return send(res, 202, { ok: true });
    }
    if ((m === 'POST' && !rid) || (m === 'PUT' && rid && !action)) {
      const old = rid ? store.schedules.get(rid) : null;
      if (rid && !old) return send(res, 404, { error: 'Schedule not found.' });
      const body = await json(req);
      if (old && Object.keys(body).length === 1 && typeof body.enabled === 'boolean') {
        return send(res, 200, store.schedules.upsert({ id: rid, enabled: body.enabled, ...(!old.enabled && body.enabled ? { resumedAt: Date.now() } : {}) }));
      }
      const recipeId = body.recipeId ?? old?.recipeId;
      const recipe = store.recipes.get(recipeId);
      if (!recipe) return send(res, 400, { error: 'Choose an existing prompt.' });
      const when = body.when ?? old?.when;
      try { scheduler.validateWhen(when); } catch (e) { return send(res, 400, { error: e.message }); }
      const values = body.values ?? old?.values;
      if (!values || typeof values !== 'object' || Array.isArray(values) || Object.values(values).some((v) => typeof v !== 'string')) return send(res, 400, { error: 'Schedule answers must be text values.' });
      if ('enabled' in body && typeof body.enabled !== 'boolean') return send(res, 400, { error: 'Enabled must be true or false.' });
      if ('allowEdit' in body && typeof body.allowEdit !== 'boolean') return send(res, 400, { error: 'File permission must be true or false.' });
      const allowEdit = body.allowEdit ?? old?.allowEdit ?? false;
      if (old && recipeId !== old.recipeId && recipe.access === 'edit' && body.allowEdit !== true) return send(res, 400, { error: 'Explicitly allow saving files for the new prompt.' });
      if (recipe.access === 'edit' && !allowEdit) return send(res, 400, { error: 'Allow saving files to schedule this prompt.' });
      if (allowEdit && recipe.access !== 'edit') return send(res, 400, { error: 'Only prompts that save files can receive this permission.' });
      const workspace = body.workspace ?? old?.workspace ?? resolveWorkspace();
      if (typeof workspace !== 'string' || !fs.existsSync(workspace) || !fs.statSync(workspace).isDirectory()) return send(res, 400, { error: 'Choose an existing project folder.' });
      const enabled = body.enabled ?? old?.enabled ?? true;
      const item = { ...(old || {}), recipeId, values, workspace: path.resolve(workspace), when, allowEdit, enabled };
      if (old && !old.enabled && enabled) item.resumedAt = Date.now();
      if (old && body.when) item.resumedAt = Date.now();
      return send(res, 200, store.schedules.upsert(item));
    }
    if (m === 'DELETE' && rid && !action) { if (!store.schedules.get(rid)) return send(res, 404, { error: 'Schedule not found.' }); store.schedules.remove(rid); return send(res, 200, { ok: true }); }
  }
};
