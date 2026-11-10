// Lumen server: SharePoint & Microsoft 365 (WorkIQ) and Azure DevOps connections.
const fs = require('fs');
const path = require('path');
const store = require('../../store');
const registry = require('../../../providers');
const workiq = require('../../workiq');
const project = require('../../../tools/project');
const secrets = require('../../secrets');
const adoAuth = require('../../../tools/ado/auth');
const adoConn = require('../../../tools/ado/connection');
const { normalizeOrgUrl } = require('../../../tools/ado/client');
const { json, send } = require('../http-util');

/** Handles the request if it is one of these routes; otherwise returns without responding. */
module.exports = async function route(req, res, url, { resource, rid, action, sub, m, parts }) {
  // OAuth stays in the selected engine's credential store, never in Lumen's settings.
  if (resource === 'connections' && rid === 'workiq') {
    const cur = store.settings.get().workiq || {};
    const providerId = url.searchParams.get('providerId') || store.settings.get().providerId;
    const provider = registry.get(providerId);
    const view = () => ({ enabled: cur.enabled === true, providerId, integration: providerId === 'copilot-cli' ? 'connector' : 'standalone', canSignIn: process.platform === 'win32' && typeof provider?.connectWorkiq === 'function', connection: workiq.status(providerId) });
    if (m === 'GET' && !action) return send(res, 200, view());
    if (m === 'PUT' && !action) {
      const b = await json(req);
      if (!b || typeof b !== 'object' || Array.isArray(b) || typeof b.enabled !== 'boolean') return send(res, 400, { error: 'Choose whether Microsoft 365 search is on or off.' });
      const next = { enabled: b.enabled };
      store.settings.set({ workiq: next });
      return send(res, 200, next);
    }
    if (m === 'POST' && action === 'connect') {
      if (!provider?.connectWorkiq) return send(res, 400, { error: 'Choose Claude or GitHub Copilot to sign in to Microsoft 365.' });
      if (process.platform !== 'win32') return send(res, 400, { error: 'Opening a Microsoft 365 sign-in window is currently supported on Windows only.' });
      const detected = await provider.detect();
      if (!detected.available) return send(res, 400, { error: `${provider.name} is not available on this computer. Check the AI engine in Settings.` });
      const cwd = path.join(store.DATA, 'workiq-connection');
      fs.mkdirSync(cwd, { recursive: true });
      try {
        await provider.connectWorkiq({ cwd });
        const instructions = providerId === 'copilot-cli'
          ? 'In the engine dashboard, open the Connectors view and select Work IQ. Lumen supplies the same workiqmcp service through GitHub using your engine\'s GitHub sign-in, not m365, WorkIQ or the workiq plugin. Lumen has not added another Work IQ CLI sign-in. Opening this window does not confirm document access.'
          : 'In the engine window, select m365. This standalone Work IQ CLI connection requires its own consent, separate from GitHub\'s managed connector. If administrator approval is required, stop and request it; do not switch identities. Opening this window does not confirm a connection.';
        workiq.record(providerId, { status: 'sign-in-opened', message: instructions });
        return send(res, 202, view());
      } catch (e) {
        workiq.record(providerId, { status: 'failed', message: e.message });
        return send(res, 502, { error: workiq.status(providerId).message });
      }
    }
  }

  // Azure DevOps connection (plan 08). Settings hold no secret; the access token lives in lib/secrets.js.
  if (resource === 'connections' && rid === 'ado') {
    const cur = store.settings.get().ado || {};
    const view = (a) => ({ ...a, hasPat: secrets.has(adoAuth.PAT_SECRET), patSupported: secrets.supported(), hasAz: adoAuth.hasAz() });
    const text = (v, max = 200) => String(v || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, max);
    if (m === 'GET' && !action) return send(res, 200, view(cur));
    if (m === 'PUT' && !action) {
      const b = await json(req);
      let orgUrl = '';
      try { if (b.orgUrl) orgUrl = normalizeOrgUrl(b.orgUrl); } catch (e) { return send(res, 400, { error: e.message }); }
      const next = { orgUrl, project: text(b.project), team: text(b.team), auth: b.auth === 'pat' ? 'pat' : 'azcli', wikis: (Array.isArray(b.wikis) ? b.wikis : []).map((w) => text(w)).filter(Boolean).slice(0, 20), enabled: b.enabled !== false };
      store.settings.set({ ado: next });
      return send(res, 200, view(next));
    }
    if (m === 'POST' && action === 'test') {
      const b = { ...cur, ...(await json(req)) };
      try {
        const orgUrl = normalizeOrgUrl(b.orgUrl);
        const org = adoConn.fromSettings({ orgUrl, auth: b.auth });
        const [me, projects] = await Promise.all([org.me(), org.projects()]);
        let teams = [], wikis = [];
        if (b.project && projects.includes(b.project)) {
          const p = adoConn.fromSettings({ orgUrl, project: b.project, auth: b.auth });
          [teams, wikis] = await Promise.all([p.teams().catch(() => []), p.wikis().catch(() => [])]);
        }
        return send(res, 200, { ok: true, orgUrl, user: me.name, projects, teams, wikis });
      } catch (e) { return send(res, 200, { ok: false, code: e.code, error: e.friendly ? e.message : `Couldn't connect to Azure DevOps: ${e.message}` }); }
    }
    if (m === 'POST' && action === 'pat') {
      try { await secrets.save(adoAuth.PAT_SECRET, (await json(req)).pat); } catch (e) { return send(res, 400, { error: e.friendly ? e.message : `Couldn't save the token: ${e.message}` }); }
      return send(res, 200, view(cur));
    }
    if (m === 'DELETE' && action === 'pat') { secrets.clear(adoAuth.PAT_SECRET); return send(res, 200, view(cur)); }
  }
};
