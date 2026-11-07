// Shared by the test server and the specs: one throw-away folder, so tests never touch real Lumen data.
const os = require('os');
const path = require('path');

const ROOT = path.join(os.tmpdir(), 'lumen-e2e');
module.exports = { ROOT, DATA: path.join(ROOT, 'data'), PROJECT: path.join(ROOT, 'project'), PORT: Number(process.env.E2E_PORT) || 4391 };
