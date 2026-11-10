const { execFile } = require('child_process');
const { randomUUID } = require('crypto');
const cli = require('./cli-bin');

const URL = 'https://workiq.svc.cloud.microsoft/mcp';
const CONNECTOR_NAME = 'workiqmcp';
const CONNECTOR_URL = 'https://api.github.com/copilot-connectors/api/v1/connectors/workiqmcp/mcp';
const CLIENT_ID = 'ba081686-5d24-4bc6-a0d6-d034ecffed87';
const CALLBACK_PORT = 12798;
const states = new Map();

function server() {
  return { type: 'http', url: URL, oauthClientId: CLIENT_ID, oauthPublicClient: true, auth: { redirectPort: CALLBACK_PORT } };
}

function mcpServers(servers, allow, providerId) {
  return Object.fromEntries(Object.entries(servers).filter(([name]) => providerId !== 'copilot-cli' || name !== 'm365').map(([name, config]) => {
    let value;
    if (config.type === 'http') {
      value = providerId === 'copilot-cli'
        ? { ...config }
        : { type: 'http', url: config.url, oauth: { clientId: config.oauthClientId, callbackPort: config.auth.redirectPort } };
    } else {
      value = { type: providerId === 'copilot-cli' ? 'local' : 'stdio', command: config.command, args: config.args, env: config.env || {} };
    }
    if (providerId === 'copilot-cli') value.tools = allow.filter((t) => t.server === name).map((t) => t.tool);
    return [name, value];
  }));
}

function connector() {
  return { type: 'http', url: CONNECTOR_URL, tools: ['*'] };
}

function diagnostic(value) {
  return String(value || '').replace(/\b(Bearer|Basic)\s+[^\s"',]+/gi, '$1 [redacted]')
    .replace(/(\b(?:access_token|refresh_token|id_token|client_secret|device_code|user_code|authorization|code|state)["']?\s*[:=]\s*["']?)[^&\s"'<>]+/gi, '$1[redacted]')
    .replace(/[\u0000-\u001f]/g, ' ').slice(0, 600);
}

function emitStatus(emit, status, error, toolCount) {
  const message = diagnostic(error);
  emit({ type: 'connection', server: 'm365', ...(status ? { status, message } : {}), ...(Number.isInteger(toolCount) ? { toolCount } : {}) });
  if (status && !['connected', 'pending'].includes(status)) {
    const hint = status === 'needs-auth' ? 'Sign in through Settings > Connections > SharePoint & Microsoft 365.'
      : 'Open Settings > Connections > SharePoint & Microsoft 365 to check the connection.';
    const id = `m365-mcp-${randomUUID()}`;
    emit({ type: 'tool', id, icon: 'globe', label: `Microsoft 365: ${message || (status === 'needs-auth' ? 'sign-in needed' : 'connection unavailable')}. ${hint}` });
    emit({ type: 'tool_done', id, ok: false });
  }
}

function record(providerId, event) {
  const previous = states.get(providerId) || {};
  const status = event.status || previous.status || 'not-checked';
  const toolCount = Number.isInteger(event.toolCount) ? event.toolCount
    : event.status && event.status !== 'connected' ? undefined : previous.toolCount;
  states.set(providerId, {
    status, message: diagnostic(event.message ?? previous.message), checkedAt: Date.now(),
    ...(Number.isInteger(toolCount) ? { toolCount } : {}),
  });
}

function status(providerId) {
  return states.get(providerId) || { status: 'not-checked', message: '', checkedAt: null };
}

const quote = (value) => `'${String(value).replace(/'/g, "''")}'`;
const windowsArg = (value) => `"${String(value).replace(/(\\*)"/g, '$1$1\\"').replace(/(\\*)$/, '$1$1')}"`;

async function openWindow(bin, args, cwd) {
  if (process.platform !== 'win32') throw new Error('Opening a Microsoft 365 sign-in window is currently supported on Windows only.');
  if (!bin.found) throw new Error('The selected AI engine is not installed.');
  const command = cli.command(bin, args);
  // PowerShell 5's native argument binder strips embedded JSON quotes; launch through .NET instead.
  const script = `$ErrorActionPreference = 'Stop'; $s = New-Object System.Diagnostics.ProcessStartInfo; $s.FileName = ${quote(command.command)}; $s.Arguments = ${quote(command.args.map(windowsArg).join(' '))}; $s.WorkingDirectory = ${quote(cwd)}; $s.UseShellExecute = $false; $p = [System.Diagnostics.Process]::Start($s); $p.WaitForExit(); if ($p.ExitCode -ne 0) { Write-Host ('The engine closed with error ' + $p.ExitCode + '. Check the message above.') }`;
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  const start = `$ErrorActionPreference = 'Stop'; $p = Start-Process -FilePath 'powershell.exe' -ArgumentList '-NoProfile','-NoExit','-EncodedCommand','${encoded}' -PassThru; if ($p.HasExited) { throw 'The sign-in window closed before it could start.' }; $p.Id`;
  return new Promise((resolve, reject) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', start], { windowsHide: true, timeout: 15000 },
      (error, stdout, stderr) => {
        if (error) return reject(new Error(`Couldn't open the sign-in window: ${diagnostic(stderr || error.message)}`));
        if (!/^\d+$/.test(stdout.trim())) return reject(new Error('The sign-in window did not report that it started.'));
        resolve(Number(stdout.trim()));
      });
  });
}

module.exports = { URL, CONNECTOR_NAME, CONNECTOR_URL, CLIENT_ID, CALLBACK_PORT, server, connector, mcpServers, diagnostic, emitStatus, record, status, openWindow };
