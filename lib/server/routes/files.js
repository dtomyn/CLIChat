// Lumen server: Diffs, file status, reply export, uploads and the folder browser.
const fs = require('fs');
const path = require('path');
const store = require('../../store');
const mdExport = require('../../../tools/md-export');
const { inside, isDir, resolveWorkspace, workspaceFile } = require('../workspace');
const { json, readBody, send } = require('../http-util');
const { diffFiles } = require('../lifecycle');
const { running, stripSuggestion } = require('../chat');
const { OPENABLE, browseFolder, listFolder, openPath } = require('../folders');

/** Handles the request if it is one of these routes; otherwise returns without responding. */
module.exports = async function route(req, res, url, { resource, rid, action, sub, m, parts }) {
  if (resource === 'diff' && m === 'GET') {
    const ws = resolveWorkspace(url.searchParams.get('workspace'));
    const a = url.searchParams.get('a'), b = url.searchParams.get('b');
    if (!workspaceFile(a, ws) || !workspaceFile(b, ws)) return send(res, 400, { error: 'Choose two existing files in your project folder.' });
    return send(res, 200, { changes: await diffFiles(path.resolve(ws, a), path.resolve(ws, b)), limit: 500 });
  }
  if (resource === 'file-pair' && m === 'GET') {
    const ws = resolveWorkspace(url.searchParams.get('workspace')), file = url.searchParams.get('file'), mid = url.searchParams.get('message');
    if (!workspaceFile(file, ws)) return send(res, 400, { error: 'File not found in your project folder.' });
    const full = path.resolve(ws, file), parsed = path.parse(full);
    const original = path.join(parsed.dir, parsed.name.replace(/ \(updated\)$/i, '') + parsed.ext);
    const updated = path.join(parsed.dir, parsed.name + ' (updated)' + parsed.ext);
    const snapshot = mid && /^[a-zA-Z0-9-]+$/.test(mid) ? path.join(ws, '.lumen', 'snapshots', mid, path.relative(ws, full)) : '';
    const pair = workspaceFile(snapshot, ws) ? snapshot : original !== full && workspaceFile(original, ws) ? original : workspaceFile(updated, ws) ? updated : '';
    return send(res, 200, { pair });
  }
  if (resource === 'file-status' && m === 'POST') {
    const body = await json(req), ws = resolveWorkspace(body.workspace);
    if (!Array.isArray(body.paths)) return send(res, 400, { error: 'Provide a list of files.' });
    const exists = body.paths.map((p) => workspaceFile(p, ws));
    return send(res, 200, { exists, mtime: body.paths.map((p, i) => exists[i] ? fs.statSync(path.resolve(ws, p)).mtimeMs : null) });
  }

  if (resource === 'export' && m === 'POST') {
    const { conversationId, messageId, format } = await json(req);
    if (!['docx', 'xlsx', 'pptx', 'md'].includes(format)) return send(res, 400, { error: 'Choose Word, Excel, PowerPoint or Markdown.' });
    const c = store.conversations.get(conversationId); if (!c) return send(res, 404, { error: 'That chat could not be found.' });
    const msg = c.messages.find((x) => x.id === messageId); if (!msg || !msg.content) return send(res, 404, { error: "That reply isn't in this chat any more." });
    const content = stripSuggestion(msg.content);
    if (format === 'xlsx' && !mdExport.hasTable(content)) return send(res, 400, { error: 'This reply has no tables' });
    const dir = path.join(resolveWorkspace(c.workspace), 'Exports');
    fs.mkdirSync(dir, { recursive: true });
    const d = new Date(), day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const stem = `${String(c.title || '').replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_').replace(/[. ]+$/, '').slice(0, 80) || 'Lumen reply'} - ${day}`;
    let target = path.join(dir, `${stem}.${format}`);
    for (let i = 2; fs.existsSync(target); i++) target = path.join(dir, `${stem} (${i}).${format}`);
    try {
      if (format === 'docx') fs.writeFileSync(target, await mdExport.markdownToDocx(content, { title: c.title }), { flag: 'wx' });
      else if (format === 'md') fs.writeFileSync(target, content.trim() + '\n', { encoding: 'utf8', flag: 'wx' });
      else if (format === 'pptx') fs.writeFileSync(target, (await require('../../../tools/pptx').toPptx(content, { title: c.title })).buffer, { flag: 'wx' });
      else await mdExport.markdownTablesToXlsx(content, target);
    } catch (e) { return send(res, 500, { error: `Couldn't save the file: ${e.message}` }); }
    // Keep the file card after a reload. Skip while a reply is running: handleChat writes the messages back when it ends.
    if (!running.has(c.id)) { msg.files = [...new Set([...(msg.files || []), target])]; store.conversations.save(c); }
    return send(res, 200, { path: target, name: path.basename(target) });
  }

  if (resource === 'upload' && m === 'POST') {
    const ws = resolveWorkspace(url.searchParams.get('workspace'));
    // searchParams is already decoded; decoding again breaks names such as "100% plan.xlsx".
    const name = path.basename(url.searchParams.get('name') || 'file').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/, '').slice(0, 200) || 'file';
    const dir = path.join(ws, 'Attachments');
    fs.mkdirSync(dir, { recursive: true });
    const body = await readBody(req);
    const { name: stem, ext } = path.parse(name);
    // 'wx' never replaces a file, even one created after the name was chosen (two uploads of the same name at once).
    let target;
    for (let i = 1; ; i++) {
      target = path.join(dir, i === 1 ? name : `${stem} (${i})${ext}`);
      try { fs.writeFileSync(target, body, { flag: 'wx' }); break; } catch (e) { if (e.code !== 'EEXIST' || i > 999) throw e; }
    }
    return send(res, 200, { path: target, name: path.basename(target) });
  }

  if (resource === 'folder') {
    if (rid === 'browse' && m === 'GET') { try { return send(res, 200, browseFolder(url.searchParams.get('path') || '')); } catch (e) { return send(res, 400, { error: e.message }); } }
    if (rid === 'mkdir' && m === 'POST') {
      const { parent, name } = await json(req);
      const clean = String(name || '').trim().replace(/[<>:"/\\|?*]/g, '').replace(/[. ]+$/, '');
      if (!clean || clean === '..' || !isDir(parent)) return send(res, 400, { error: 'Type a name for the new folder.' });
      const target = path.join(parent, clean);
      try { fs.mkdirSync(target, { recursive: true }); } catch (e) { return send(res, 400, { error: `Couldn't create the folder: ${e.message}` }); }
      return send(res, 200, { path: target });
    }
    if (rid === 'open' && m === 'POST') {
      const { path: p, workspace } = await json(req);
      const ws = resolveWorkspace(workspace);
      let target = ws;
      try {
        const real = fs.realpathSync(path.resolve(ws, String(p || '')));
        if (real === fs.realpathSync(ws) || inside(real, fs.realpathSync(ws))) target = real;
      } catch {}
      // Opening a script or program would run it. The AI can write files here, so show those in their folder instead.
      if (target !== ws && fs.statSync(target).isFile() && !OPENABLE.test(target)) target = path.dirname(target);
      if (fs.existsSync(target)) openPath(target);
      return send(res, 200, { ok: true });
    }
    if (rid === 'files' && m === 'GET') { const ws = resolveWorkspace(url.searchParams.get('workspace')); const all = url.searchParams.has('all'); const files = listFolder(ws, 0, [], ws, all).sort((a, b) => b.mtime - a.mtime); return send(res, 200, { workspace: ws, files: all ? files : files.slice(0, 60) }); }
    if (rid === 'check' && m === 'POST') { const { path: p } = await json(req); const ok = !!p && fs.existsSync(p) && fs.statSync(p).isDirectory(); return send(res, 200, { ok }); }
  }
};
