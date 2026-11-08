// Small secret store for credentials Lumen must keep (today: the Azure DevOps personal access token).
// Windows only: the value is encrypted with DPAPI for the current Windows user (ConvertFrom-SecureString),
// so the file is useless to anyone else and on any other computer. Nothing is stored in settings.json.
// Values travel to PowerShell on stdin, never on the command line.

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const dataDir = () => process.env.LUMEN_DATA || path.join(__dirname, '..', 'data');
const fileFor = (name) => path.join(dataDir(), 'secrets', `${String(name).replace(/[^a-z0-9-]/gi, '')}.dpapi`);
const supported = () => process.platform === 'win32';

function powershell(script, input) {
  return new Promise((resolve, reject) => {
    const child = execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { windowsHide: true, timeout: 20000, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
        if (err) return reject(new Error(String(stderr || err.message).trim().split('\n')[0] || 'PowerShell failed'));
        resolve(String(stdout).trim());
      });
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}

const ENCRYPT = '$v = [Console]::In.ReadToEnd().Trim(); ConvertTo-SecureString $v -AsPlainText -Force | ConvertFrom-SecureString';
const DECRYPT = '$e = [Console]::In.ReadToEnd().Trim(); $s = ConvertTo-SecureString $e; $b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s); try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) }';

async function save(name, value) {
  if (!supported()) throw Object.assign(new Error('Saving an access token is only available on Windows. Sign in with the Azure CLI instead.'), { friendly: true });
  const v = String(value || '').trim();
  if (!v) throw Object.assign(new Error('Paste the access token first.'), { friendly: true });
  const encrypted = await powershell(ENCRYPT, v);
  if (!/^[0-9a-f]+$/i.test(encrypted)) throw new Error('Windows could not encrypt the token.');
  fs.mkdirSync(path.dirname(fileFor(name)), { recursive: true });
  fs.writeFileSync(fileFor(name), encrypted, { mode: 0o600 });
}

async function load(name) {
  if (!supported() || !fs.existsSync(fileFor(name))) return null;
  try { return (await powershell(DECRYPT, fs.readFileSync(fileFor(name), 'utf8'))) || null; }
  catch { return null; } // encrypted for another user or computer
}

const has = (name) => fs.existsSync(fileFor(name));
function clear(name) { fs.rmSync(fileFor(name), { force: true }); }

module.exports = { save, load, has, clear, supported };
