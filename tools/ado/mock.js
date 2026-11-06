// Test double for the Azure DevOps REST API: a fetch() that answers from canned routes and logs every request.
// Fixture file: { "log": "<path to .jsonl>", "routes": [{ "method": "GET", "match": "substring of the URL", "status": 200, "body": {}, "headers": {} }] }
// The first route whose method and substring match wins. Unmatched requests get a 404.

const fs = require('fs');

function createMockFetch(routes, log) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const method = (init.method || 'GET').toUpperCase();
    const call = { method, url, body: init.body ? safeJson(init.body) : undefined, headers: init.headers || {} };
    calls.push(call);
    if (log) fs.appendFileSync(log, JSON.stringify(call) + '\n');
    const route = routes.find((r) => (r.method || 'GET').toUpperCase() === method && url.includes(r.match));
    const status = route ? route.status || 200 : 404;
    const body = route ? (typeof route.body === 'function' ? route.body(call) : route.body) : { message: `No mock for ${method} ${url}` };
    const headers = new Map(Object.entries({ 'content-type': 'application/json; charset=utf-8', ...(route?.headers || {}) }).map(([k, v]) => [k.toLowerCase(), v]));
    return {
      status, ok: status >= 200 && status < 300,
      headers: { get: (k) => headers.get(String(k).toLowerCase()) ?? null },
      text: async () => (typeof body === 'string' ? body : JSON.stringify(body ?? null)),
    };
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

const safeJson = (s) => { try { return JSON.parse(s); } catch { return s; } };

function fromFile(file) {
  const f = JSON.parse(fs.readFileSync(file, 'utf8'));
  return createMockFetch(f.routes || [], f.log);
}

module.exports = { createMockFetch, fromFile };
