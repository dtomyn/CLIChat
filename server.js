// Lumen — a friendly local chat workspace on top of AI command-line tools.
// Zero-framework Node server: static UI + a small JSON API + NDJSON streaming chat.

// The JSON API lives in lib/server/routes/ (one file per area); the logic it calls lives in lib/server/.

const http = require('http');
const fs = require('fs');
const path = require('path');
const store = require('./lib/store');
const scheduler = require('./lib/scheduler');
const state = require('./lib/server/state');
const { send } = require('./lib/server/http-util');
const { workspaceFile } = require('./lib/server/workspace');
const { runTurn } = require('./lib/server/chat');
const { openPath } = require('./lib/server/folders');

const PORT = process.env.PORT === undefined ? 4317 : Number(process.env.PORT);
const HOST = '127.0.0.1'; // local only
const PUBLIC = path.join(__dirname, 'public');
const VENDOR = {
  '/vendor/marked.js': path.join(__dirname, 'node_modules', 'marked', 'lib', 'marked.umd.js'),
  '/vendor/purify.js': path.join(__dirname, 'node_modules', 'dompurify', 'dist', 'purify.min.js'),
  '/vendor/hljs.js': path.join(__dirname, 'node_modules', '@highlightjs', 'cdn-assets', 'highlight.min.js'),
};
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };

// ---------- router ----------
// Checked in this order; each returns without responding when the request isn't one of its routes.
const ROUTES = ['core', 'pipelines', 'runs', 'files', 'connections', 'chat', 'schedules', 'library'].map((name) => require(`./lib/server/routes/${name}`));

async function api(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean).slice(1); // drop "api"
  const [resource, rid, action, sub] = parts;
  const ctx = { resource, rid, action, sub, m: req.method, parts };
  for (const route of ROUTES) {
    await route(req, res, url, ctx);
    if (res.headersSent || res.writableEnded) return;
  }
  return send(res, 404, { error: 'Not found' });
}

// The page's one inline script (theme before paint) is allowed by hash, so no other inline script can run.
const INLINE_HASHES = (() => {
  try {
    const html = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');
    return [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((x) => `'sha256-${require('crypto').createHash('sha256').update(x[1]).digest('base64')}'`).join(' ');
  } catch { return ''; }
})();
// External images are blocked: a reply could otherwise leak data by rendering an image from someone else's server.
const CSP = [
  "default-src 'self'", `script-src 'self' ${INLINE_HASHES}`.trim(), "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:", "img-src 'self' data: blob:", "connect-src 'self'",
  // The UI never submits forms; 'none' stops a form smuggled into a reply from POSTing to the API (e.g. /api/reset).
  "object-src 'none'", "base-uri 'none'", "form-action 'none'", "frame-ancestors 'none'",
].join('; ');
const SECURITY_HEADERS = { 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': CSP };

/**
 * Cross-site request guard. The Host check stops DNS rebinding; the Origin / Sec-Fetch-Site checks stop other web pages
 * (including other localhost ports) from driving the API with "simple" requests that skip CORS preflight.
 * Requests without these headers (tests, curl) are not from a browser page and are allowed.
 */
function allowedRequest(req) {
  const host = req.headers.host || '';
  if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) return false;
  if (!String(req.url || '').startsWith('/api/')) return true; // static files: following a link to Lumen must still work
  const origin = req.headers.origin;
  if (origin && origin !== `http://${host}`) return false;
  const site = req.headers['sec-fetch-site'];
  if (site && !['same-origin', 'none'].includes(site)) return false;
  return true;
}

const server = http.createServer(async (req, res) => {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
  if (!allowedRequest(req)) { res.writeHead(403); return res.end(); }
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    if (VENDOR[url.pathname]) { res.writeHead(200, { 'Content-Type': MIME['.js'] }); return fs.createReadStream(VENDOR[url.pathname]).pipe(res); }
    const file = path.join(PUBLIC, url.pathname === '/' ? 'index.html' : path.normalize(url.pathname));
    if (!file.startsWith(PUBLIC + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) send(res, 500, { error: e.message }); else res.end();
  }
});

server.listen(PORT, HOST, () => {
  state.scheduleRunner = scheduler.start({ runTurn, store, workspaceFile });
  const link = `http://localhost:${server.address().port}`;
  console.log(`\n  ✨ Lumen is running at ${link}\n`);
  if (process.argv.includes('--open')) openPath(link);
});
server.on('close', () => state.scheduleRunner?.stop());

module.exports = server;
