// Azure DevOps sign-in (plan 08, decision D2): borrow a token from the Azure CLI, or use a personal access token
// stored encrypted by lib/secrets.js. Credentials never travel through the AI, the environment or a command line.

const path = require('path');
const { execFile } = require('child_process');
const cli = require('../../lib/cli-bin');
const secrets = require('../../lib/secrets');

const ADO_RESOURCE = '499b84ac-1321-427f-aa17-267ca6975798'; // fixed Azure DevOps resource ID
const PAT_SECRET = 'ado-pat';

const friendly = (message, extra = {}) => Object.assign(new Error(message), { friendly: true, ...extra });

let azBin = null;
function az() {
  if (azBin) return azBin;
  const pf = [process.env.ProgramFiles, process.env['ProgramFiles(x86)']].filter(Boolean);
  const candidates = process.platform === 'win32'
    ? pf.map((p) => path.join(p, 'Microsoft SDKs', 'Azure', 'CLI2', 'wbin', 'az.cmd'))
    : ['/usr/local/bin/az', '/opt/homebrew/bin/az', '/usr/bin/az'];
  azBin = cli.resolve('az', candidates, process.env.AZ_CLI_PATH);
  return azBin;
}

/** Runs `az account get-access-token` for Azure DevOps. The arguments are fixed, so the shell fallback for az.cmd is safe. */
function azToken() {
  const bin = az();
  if (!bin.found) return Promise.reject(friendly('The Azure CLI isn\'t installed on this computer. Install it and run "az login", or use an access token instead.', { code: 'NO_AZ' }));
  return new Promise((resolve, reject) => {
    execFile(bin.command, [...bin.prefix, 'account', 'get-access-token', '--resource', ADO_RESOURCE, '--output', 'json'],
      { shell: bin.shell, windowsHide: true, timeout: 60000, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
        if (err) {
          const e = String(stderr || err.message);
          if (/az login|not logged in|no subscription|AADSTS|refresh token|expired/i.test(e)) return reject(friendly('Your Azure sign-in has expired or isn\'t set up. Run "az login" once, then choose Check again.', { code: 'AZ_LOGIN' }));
          return reject(friendly(`The Azure CLI couldn't get a sign-in token: ${e.trim().split('\n').pop().slice(0, 200)}`, { code: 'AZ_FAILED' }));
        }
        try {
          const t = JSON.parse(stdout);
          const expires = t.expires_on ? Number(t.expires_on) * 1000 : Date.parse(t.expiresOn);
          resolve({ header: `Bearer ${t.accessToken}`, expires: Number.isFinite(expires) ? expires : Date.now() + 30 * 60000 });
        } catch { reject(friendly('The Azure CLI returned an unexpected answer.')); }
      });
  });
}

/**
 * Returns an auth provider: `get()` → Authorization header value, `refresh()` drops the cache.
 * @param {'azcli'|'pat'} method
 */
function createAuth(method, { tokenSource } = {}) {
  let cached = null;
  const source = tokenSource || (method === 'pat'
    ? async () => {
      const pat = await secrets.load(PAT_SECRET);
      if (!pat) throw friendly('No access token is saved for Azure DevOps. Open Settings › Connections to add one.', { code: 'NO_PAT' });
      return { header: `Basic ${Buffer.from(`:${pat}`).toString('base64')}`, expires: Infinity };
    }
    : azToken);
  return {
    method,
    async get() {
      if (!cached || cached.expires - Date.now() < 5 * 60000) cached = await source();
      return cached.header;
    },
    refresh() { cached = null; },
  };
}

module.exports = { createAuth, azToken, ADO_RESOURCE, PAT_SECRET, hasAz: () => !!az().found, friendly };
