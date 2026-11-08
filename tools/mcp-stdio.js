// Minimal MCP server over stdio (newline-delimited JSON-RPC), shared by Lumen's tool servers.
// Each tool: { name, description, inputSchema, run(args) → string | object }. Errors marked { friendly: true } reach the AI verbatim.

function serve({ name, version = '1.0.0', instructions = '', tools }) {
  const send = (msg) => process.stdout.write(JSON.stringify(msg) + '\n');
  const result = (id, r) => send({ jsonrpc: '2.0', id, result: r });

  async function handle(msg) {
    const { id, method, params } = msg;
    if (method === 'initialize') return result(id, { protocolVersion: params?.protocolVersion || '2025-06-18', capabilities: { tools: {} }, serverInfo: { name, version }, instructions });
    if (method === 'ping') return result(id, {});
    if (method === 'tools/list') return result(id, { tools: tools.map(({ name: n, description, inputSchema }) => ({ name: n, description, inputSchema })) });
    if (method === 'tools/call') {
      const tool = tools.find((t) => t.name === params?.name);
      if (!tool) return send({ jsonrpc: '2.0', id, error: { code: -32602, message: `Unknown tool ${params?.name}` } });
      try {
        const out = await tool.run(params.arguments || {});
        return result(id, { content: [{ type: 'text', text: typeof out === 'string' ? out : JSON.stringify(out, null, 1) }] });
      } catch (e) {
        return result(id, { isError: true, content: [{ type: 'text', text: e.friendly ? e.message : `Error: ${e.message}` }] });
      }
    }
    if (id !== undefined) send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } });
  }

  let buf = '', pending = 0, ended = false;
  process.stdin.on('data', (c) => {
    buf += c.toString('utf8');
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
      if (!line) continue;
      let msg; try { msg = JSON.parse(line); } catch { continue; }
      pending++;
      handle(msg).catch((e) => process.stderr.write(String(e.stack || e) + '\n')).finally(() => { pending--; if (ended && !pending) process.exit(0); });
    }
  });
  process.stdin.on('end', () => { ended = true; if (!pending) process.exit(0); });
}

module.exports = { serve };
