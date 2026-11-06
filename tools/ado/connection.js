// Builds an Azure DevOps client from Lumen's saved connection settings ({ orgUrl, project, team, auth }).
// ADO_MOCK=<fixtures.json> swaps the network for canned responses (tests only).

const { createAuth, friendly } = require('./auth');
const { createClient } = require('./client');

function fromSettings(ado = {}, { fetchImpl } = {}) {
  if (!ado || !ado.orgUrl) throw friendly('Azure DevOps isn\'t connected yet. Open Settings › Connections to set it up.', { code: 'NOT_CONNECTED' });
  const mock = !fetchImpl && process.env.ADO_MOCK ? require('./mock').fromFile(process.env.ADO_MOCK) : null;
  const auth = mock || fetchImpl ? { method: ado.auth || 'azcli', get: async () => 'Bearer test', refresh() {} } : createAuth(ado.auth === 'pat' ? 'pat' : 'azcli');
  return createClient({ orgUrl: ado.orgUrl, project: ado.project, team: ado.team, auth, fetchImpl: fetchImpl || mock || undefined });
}

/** Settings as the tool server receives them through its environment (no credentials). */
const fromEnv = (env = process.env) => fromSettings({ orgUrl: env.ADO_ORG_URL, project: env.ADO_PROJECT, team: env.ADO_TEAM, auth: env.ADO_AUTH });

const configured = (ado) => !!(ado && ado.orgUrl && ado.project && ado.enabled !== false);

module.exports = { fromSettings, fromEnv, configured };
