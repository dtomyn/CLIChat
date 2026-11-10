// Lumen server: Applying or discarding proposed Azure DevOps change sets.
const store = require('../store');
const project = require('../../tools/project');
const adoConn = require('../../tools/ado/connection');
const changesets = require('../../tools/ado/changesets');
const { normalizeOrgUrl } = require('../../tools/ado/client');

const deciding = new Set(); // change set ids being applied right now (blocks double clicks)

/** Apply or discard a staged change set after a person clicked the button. Returns { code, body }. */
async function decideChangeSet(conversationId, id, decision) {
  const cs = changesets.load(conversationId, id);
  if (!cs) return { code: 404, body: { error: 'That proposal could not be found.' } };
  if (cs.status !== 'pending') return { code: 409, body: { ...changesets.describe(cs), error: `This proposal was already ${cs.status}.` } };
  if (deciding.has(cs.id)) return { code: 409, body: { error: 'This proposal is already being applied.' } };
  const settings = store.settings.get();
  const userName = String(settings.userName || '').trim();
  if (decision === 'apply' && !userName) return { code: 400, body: { error: 'Set your name in Settings first, so Azure DevOps records who approved the change.', needName: true } };
  deciding.add(cs.id);
  try {
    if (decision === 'discard') {
      cs.status = 'discarded';
      cs.result = { status: 'discarded', message: 'Discarded. Nothing was changed.', links: [] };
    } else {
      const ado = settings.ado;
      let org = '';
      try { org = adoConn.configured(ado) ? normalizeOrgUrl(ado.orgUrl) : ''; } catch {}
      if (!org) return { code: 409, body: { error: 'Azure DevOps isn\'t connected. Open Settings › Connections.' } };
      if (org !== cs.orgUrl || ado.project !== cs.project) return { code: 409, body: { error: `This was proposed for project "${cs.project}", but Lumen is now connected to "${ado.project}". Ask Lumen to propose it again.` } };
      cs.result = await changesets.apply(adoConn.fromSettings(ado), cs, { userName });
      cs.status = cs.result.status;
    }
    cs.decidedAt = Date.now(); cs.decidedBy = userName || null;
    changesets.save(cs);
    changesets.audit({ conversationId, changeSetId: cs.id, decision, decidedBy: cs.decidedBy, kind: cs.kind, project: cs.project, title: cs.title, status: cs.status, message: cs.result.message, links: cs.result.links });
    const conv = store.conversations.get(conversationId);
    if (conv) { conv.adoNotes = [...(conv.adoNotes || []), { id: cs.id, text: changesets.outcomeNote(cs) }]; store.conversations.save(conv); }
    return { code: 200, body: changesets.describe(cs) };
  } finally { deciding.delete(cs.id); }
}

module.exports = { decideChangeSet };
