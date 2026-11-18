// Microsoft Foundry sign-in: borrows the Azure CLI's sign-in (`az account get-access-token`), the same way
// Lumen drives other installed tools. No secrets are stored; the token is cached in memory until shortly before expiry.
const { execFile } = require('child_process');
const cliBin = require('../cli-bin');

const RESOURCE = 'https://ai.azure.com';
const AZ_CANDIDATES = process.platform === 'win32'
  ? ['C:\\Program Files\\Microsoft SDKs\\Azure\\CLI2\\wbin\\az.cmd', 'C:\\Program Files (x86)\\Microsoft SDKs\\Azure\\CLI2\\wbin\\az.cmd']
  : ['/usr/bin/az', '/usr/local/bin/az', '/opt/homebrew/bin/az'];

let cached = null; // { token, expiresAt }
let tokenSource = null; // test hook: async () => ({ token, expiresAt })

function az() { return cliBin.resolve('az', AZ_CANDIDATES, process.env.AZ_CLI_PATH); }

function runAz(args, timeout = 60_000) {
  const bin = az();
  if (!bin.found) return Promise.reject(new Error('The Azure CLI isn\'t installed, so Lumen can\'t sign in to Microsoft Foundry.'));
  const cmd = cliBin.command(bin, args);
  return new Promise((resolve, reject) => {
    execFile(cmd.command, cmd.args, { ...cmd.options, windowsHide: true, timeout, encoding: 'utf8', maxBuffer: 1 << 20 }, (err, stdout, stderr) => {
      if (err) {
        const text = `${stderr || ''} ${err.message || ''}`;
        if (/az login|AADSTS|expired|refresh token|interaction/i.test(text)) return reject(new Error('Your Azure sign-in has expired. Run "az login" once, then try again.'));
        return reject(new Error('Lumen couldn\'t get a Microsoft Foundry sign-in from the Azure CLI.'));
      }
      resolve(stdout);
    });
  });
}

async function getToken(force = false) {
  if (!force && cached && Date.now() < cached.expiresAt - 5 * 60_000) return cached.token;
  if (tokenSource) { cached = await tokenSource(); return cached.token; }
  const out = await runAz(['account', 'get-access-token', '--resource', RESOURCE, '-o', 'json']);
  let d;
  try { d = JSON.parse(out); } catch { throw new Error('Lumen couldn\'t read the Microsoft Foundry sign-in from the Azure CLI.'); }
  const exp = d.expires_on ? Number(d.expires_on) * 1000 : Date.parse(d.expiresOn || '') || Date.now() + 30 * 60_000;
  cached = { token: d.accessToken, expiresAt: exp };
  return cached.token;
}

async function detect() {
  const bin = az();
  if (!bin.found) return { available: false, message: 'Install the Azure CLI and run "az login" to use the IRCC agents.' };
  return { available: true, version: 'Azure CLI sign-in' };
}

module.exports = { getToken, detect, RESOURCE, _setTokenSource: (fn) => { tokenSource = fn; cached = null; } };
