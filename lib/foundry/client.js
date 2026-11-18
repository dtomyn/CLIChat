// Calls Contoso agents hosted in Microsoft Foundry through the Responses API of each hosted agent:
//   POST {project endpoint}/agents/{agent}/endpoint/protocols/openai/responses?api-version=v1
// Invocations-protocol agents are called at .../protocols/invocations with {"message": ...}.
const auth = require('./auth');

const DEFAULT_TIMEOUT = 10 * 60_000; // the longest agents take a few minutes
let fetchImpl = (...a) => fetch(...a); // test hook

/** True for an https Foundry project endpoint such as https://<acct>.services.ai.azure.com/api/projects/<project>. */
function validEndpoint(url) {
  try {
    const u = new URL(String(url));
    return u.protocol === 'https:' && /\.(services\.ai\.azure\.com|cognitiveservices\.azure\.com|openai\.azure\.com)$/i.test(u.hostname) && /^\/api\/projects\/[^/]+\/?$/.test(u.pathname);
  } catch { return false; }
}

function agentUrl(endpoint, agent, protocol) {
  const base = String(endpoint).replace(/\/+$/, '');
  const path = protocol === 'invocations' ? 'invocations' : 'openai/responses';
  return `${base}/agents/${encodeURIComponent(agent)}/endpoint/protocols/${path}?api-version=v1`;
}

async function post(url, body, { signal, timeout = DEFAULT_TIMEOUT } = {}) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(new Error('timeout')), timeout);
  const onAbort = () => ac.abort(signal.reason);
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    let token = await auth.getToken();
    let res = await fetchImpl(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ac.signal });
    if (res.status === 401) { // token revoked or rotated: one fresh try
      token = await auth.getToken(true);
      res = await fetchImpl(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ac.signal });
    }
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch { /* not JSON */ }
    return { status: res.status, data, text, sessionId: res.headers?.get?.('x-agent-session-id') || null };
  } catch (e) {
    if (signal?.aborted) throw Object.assign(new Error('Stopped.'), { stopped: true });
    if (ac.signal.aborted) throw new Error('The agent took too long to answer. Try again, or try a smaller file.');
    throw new Error(`Lumen couldn't reach Microsoft Foundry (${e.cause?.code || e.message}). Check your network connection.`);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

/** Plain-language message for a failed call. */
function friendlyError(status, data) {
  const msg = String(data?.error?.message || data?.error || data?.message || '');
  if (status === 401) return 'Microsoft Foundry didn\'t accept your sign-in. Run "az login" again, then retry.';
  if (status === 403) return 'Your account isn\'t allowed to use this agent. Ask for the Foundry Agent Consumer (or Foundry User) role on the project.';
  if (status === 404) return 'That agent isn\'t deployed in the Foundry project set in Settings.';
  if (status === 429) return 'Microsoft Foundry is busy right now. Wait a minute and try again.';
  if (/internal error/i.test(msg) || status >= 500) return 'The agent ran into a problem and couldn\'t finish. Try again; if it keeps happening, check the agent\'s logs in Foundry.';
  return msg ? `The agent couldn't finish: ${msg.slice(0, 300)}` : 'The agent couldn\'t finish.';
}

module.exports = { validEndpoint, agentUrl, post, friendlyError, _setFetch: (fn) => { fetchImpl = fn; } };
