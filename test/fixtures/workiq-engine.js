// Stand-in engine: validates provider transport and events without AI or Microsoft 365 access.
const fs = require('fs');
const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log(`--session-id <id>${process.env.LUMEN_TEST_WORKIQ_LEGACY_HELP ? '' : ' --mcp-github-auth <server=origin>'}`);
} else if (args.includes('--version')) {
  console.log('1.0.107');
} else {
  const input = fs.readFileSync(0, 'utf8');
  const copilot = args[args.indexOf('--output-format') + 1] === 'json';
  const flag = copilot ? '--additional-mcp-config' : '--mcp-config';
  const config = args.includes(flag) ? JSON.parse(args[args.indexOf(flag) + 1]) : { mcpServers: {} };
  const mode = process.env.LUMEN_TEST_WORKIQ_STATUS || 'connected';
  const error = mode === 'failed' ? 'WorkIQ policy refused: Bearer fake-secret' : mode === 'needs-auth' ? 'Microsoft sign-in required' : undefined;
  const events = [];
  if (copilot) {
    if (!['missing', 'session-error'].includes(mode)) {
      const managed = { name: 'workiqmcp', source: 'user', status: 'pending' };
      const others = [
        { name: 'office', source: 'user', status: 'connected' },
        { name: 'm365', displayName: 'Work IQ', source: 'user', status: 'connected' },
        { name: 'WorkIQ', displayName: 'Work IQ', source: 'user', status: 'connected' },
        { name: 'workiq', displayName: 'Work IQ', source: 'plugin', status: 'connected' },
      ];
      const absent = mode === 'lookalikes-only';
      const servers = absent ? others : [...others, managed];
      if (mode === 'cached') events.push({ type: 'session.mcp_server_tools_loaded', data: { serverName: managed.name, toolCount: 12 } });
      events.push({ type: 'session.mcp_servers_loaded', data: { servers } });
      events.push({ type: 'session.mcp_server_status_changed', data: { serverName: 'm365', status: 'needs-auth', error: 'Standalone client needs separate consent' } });
      events.push({ type: 'session.mcp_server_tools_loaded', data: { serverName: 'm365', toolCount: 9999 } });
      if (!absent) {
        events.push({ type: 'session.mcp_server_tools_loaded', data: { serverName: managed.name, toolCount: 12 } });
        events.push({ type: 'session.mcp_server_status_changed', data: { serverName: managed.name,
          status: mode === 'cached' ? 'connected' : mode, configSource: 'user', error } });
      }
    }
    if (mode === 'session-error') events.push({ type: 'session.error', data: { message: 'WorkIQ OAuth 401: sign-in required. Bearer fake-secret' } });
    events.push({ type: 'assistant.message', data: { content: JSON.stringify({ config, input, args }) } });
  } else {
    if (mode !== 'missing') events.push({ type: 'system', subtype: 'init', mcp_servers: [{ name: 'm365', status: mode, error }], tools: mode === 'connected' ? ['Read', 'mcp__m365__fetch', 'mcp__m365__retrieve'] : [] });
    events.push({ type: 'result', result: JSON.stringify({ config, input, args }), is_error: false });
  }
  for (const event of events) console.log(JSON.stringify(event));
}
