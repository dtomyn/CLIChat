// Lumen server: Status, skills, sample install, reset, settings and insights.
const fs = require('fs');
const path = require('path');
const os = require('os');
const store = require('../../store');
const registry = require('../../../providers');
const skills = require('../../skills');
const { json, send } = require('../http-util');
const { cleanAccess, isDir, resolveWorkspace } = require('../workspace');
const { installDemo } = require('../exports');
const { insights } = require('../insights');

/** Handles the request if it is one of these routes; otherwise returns without responding. */
module.exports = async function route(req, res, url, { resource, rid, action, sub, m, parts }) {
  if (resource === 'status' && m === 'GET') {
    const s = store.settings.get();
    return send(res, 200, { providers: await registry.status(url.searchParams.has('refresh')), settings: { ...s, workspace: resolveWorkspace(s.workspace) }, platform: process.platform, user: os.userInfo().username });
  }
  if (resource === 'skills' && m === 'GET') return send(res, 200, skills.all().map(({ body, raw, file, ...rest }) => rest));

  if (resource === 'demo' && rid === 'install' && m === 'POST') {
    const pack = (await json(req)).pack || 'crm';
    let target;
    try { target = installDemo(pack); } catch (e) { return send(res, 400, { error: e.message }); }
    const cur = store.settings.get();
    // Remember where the user was so "Leave sample" can take them back (switching between samples keeps the original).
    const prev = cur.workspace === cur.demoInstalled ? cur.demoPrevWorkspace || '' : cur.workspace || '';
    store.settings.set({ workspace: target, demoInstalled: target, demoPack: pack, demoPrevWorkspace: prev });
    return send(res, 200, { path: target, pack, files: fs.readdirSync(target).filter((f) => !f.startsWith('.')) });
  }
  if (resource === 'reset' && m === 'POST') { store.assistants.reset(); store.recipes.reset(); store.prompts.reset(); return send(res, 200, { ok: true }); }
  if (resource === 'settings' && m === 'PUT') {
    const patch = await json(req);
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return send(res, 400, { error: 'Settings must be an object.' });
    delete patch.ado; delete patch.workiq; delete patch.demoInstalled; // connections are validated by /api/connections/*
    if ('access' in patch) patch.access = cleanAccess(patch.access);
    if ('providerId' in patch && !registry.get(patch.providerId)) return send(res, 400, { error: `Unknown provider ${patch.providerId}` });
    if ('model' in patch && typeof patch.model !== 'string') return send(res, 400, { error: 'Choose a response mode.' });
    if ('userName' in patch) patch.userName = String(patch.userName || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 80);
    if ('workspace' in patch && patch.workspace && !isDir(patch.workspace)) return send(res, 400, { error: 'Choose an existing project folder.' });
    return send(res, 200, store.settings.set(patch));
  }

  if (resource === 'insights' && m === 'GET') return send(res, 200, insights());
};
