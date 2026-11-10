// Lumen server: Agents (assistants), guided tasks (recipes) and quick prompts (prompts).
const store = require('../../store');
const skills = require('../../skills');
const copilotExport = require('../../copilot-export');
const { json, send } = require('../http-util');
const { draftAssistant, exportAssistant, exportEngineeringPacks } = require('../exports');
const { cleanAccess, resolveWorkspace } = require('../workspace');

/** Handles the request if it is one of these routes; otherwise returns without responding. */
module.exports = async function route(req, res, url, { resource, rid, action, sub, m, parts }) {
  if (resource === 'assistants' || resource === 'recipes' || resource === 'prompts') {
    const col = store[resource];
    if (m === 'GET' && !rid) return send(res, 200, col.all());
    if (resource === 'assistants' && rid === 'draft' && m === 'POST') {
      try { return send(res, 200, await draftAssistant((await json(req)).description || '')); } catch (e) { return send(res, 500, { error: e.message }); }
    }
    if (resource === 'assistants' && action === 'export' && m === 'POST') {
      const a = col.get(rid); if (!a) return send(res, 404, { error: 'Not found' });
      return send(res, 200, exportAssistant(a, (await json(req)).workspace));
    }
    // Engineering skill packs: the developer, test automation and pipeline agents with their skills, into a repo folder.
    if (resource === 'assistants' && rid === 'export-engineering' && m === 'POST') {
      try { return send(res, 200, exportEngineeringPacks((await json(req)).folder)); } catch (e) { return send(res, 400, { error: e.message }); }
    }
    // Export to Microsoft 365 Copilot: one agent (/assistants/:id/export-copilot), all agents (/assistants/export-copilot)
    // or every prompt (/recipes/export-copilot). Files land in "<project folder>/Microsoft 365 Copilot".
    if (m === 'POST' && (rid === 'export-copilot' || action === 'export-copilot')) {
      const body = await json(req);
      const ws = resolveWorkspace(body.workspace);
      try {
        if (resource === 'recipes' || resource === 'prompts') return send(res, 200, copilotExport.exportPrompts(store.recipes.all(), store.assistants.all(), ws, store.prompts.all()));
        const list = rid === 'export-copilot' ? col.all().filter((a) => a.id !== 'lumen') : [col.get(rid)].filter(Boolean);
        if (!list.length) return send(res, 404, { error: 'Not found' });
        return send(res, 200, await copilotExport.exportAgents(list, ws, skills.all()));
      } catch (e) { return send(res, 500, { error: `Couldn't export: ${e.message}` }); }
    }
    // Ids and colours end up in HTML attributes and file names, so keep them to simple characters.
    const cleanItem = (item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
      if ('id' in item && !/^[A-Za-z0-9_-]{1,80}$/.test(String(item.id))) return null;
      if ('color' in item && item.color != null && !/^[A-Za-z0-9-]{0,30}$/.test(String(item.color))) delete item.color;
      if ('access' in item && item.access != null) item.access = cleanAccess(item.access);
      return item;
    };
    if (m === 'POST' && !rid) { const item = cleanItem(await json(req)); if (!item) return send(res, 400, { error: 'Invalid item.' }); delete item.builtin; return send(res, 200, col.upsert(item)); }
    if (m === 'PUT' && rid) { const item = cleanItem({ ...(await json(req)), id: rid }); if (!item) return send(res, 400, { error: 'Invalid item.' }); return send(res, 200, col.upsert(item)); }
    if (m === 'DELETE' && rid) { col.remove(rid); return send(res, 200, { ok: true }); }
  }
};
