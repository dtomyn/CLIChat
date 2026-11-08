// Knowledge publishing (UC 37): snapshot approved Markdown (lifecycle outputs, a wiki export folder) into Word and
// HTML under Published/<library>/, keep Published/publishing-log.xlsx, and check freshness: snapshots whose source
// changed since publishing, sources never published, and snapshots nothing in the log points at.
// Uploading to SharePoint is out of scope: the notebook syncs through OneDrive/SharePoint.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ExcelJS = require('exceljs');
const { marked } = require('marked');
const excel = require('./excel');
const mdExport = require('./md-export');

const PUBLISHED = 'Published';
const LOG = 'publishing-log.xlsx';
const COLUMNS = ['Source', 'Revision', 'Published at', 'Approver', 'Version', 'Destination', 'Library', 'Format'];
const SKIP_DIRS = new Set(['node_modules', PUBLISHED]);

const friendly = (msg) => Object.assign(new Error(msg), { friendly: true });
const rel = (root, p) => path.relative(root, p).split(path.sep).join('/');
const hashText = (text) => crypto.createHash('sha256').update(String(text).replace(/\r\n/g, '\n')).digest('hex').slice(0, 16);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeName = (s) => String(s || '').replace(/[<>:"|?*\u0000-\u001F]/g, '_').replace(/[. ]+$/, '').trim();

/** The approval stamp Lumen's lifecycle writes at the top of an approved output. */
const APPROVED = /^> Approved by (.+?) on (\S+)\s*\r?\n(?:\r?\n)?/;
function approvalOf(text) {
  const m = APPROVED.exec(text);
  return m ? { approver: m[1].trim(), approvedAt: m[2], body: text.slice(m[0].length) } : { approver: '', approvedAt: '', body: text };
}
const unapproved = (text) => /^> Based on unapproved inputs/m.test(text.slice(0, 400));

/** Markdown files under the given files or folders (folders are walked; dot-folders and Published/ are skipped). */
function collectSources(root, sources) {
  const out = [];
  const walk = (dir, depth) => {
    if (depth > 6) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith('.') || SKIP_DIRS.has(e.name)) continue;
      const f = path.join(dir, e.name);
      if (e.isDirectory()) walk(f, depth + 1);
      else if (/\.(md|markdown)$/i.test(e.name)) out.push({ file: f, base: dir });
    }
  };
  for (const s of sources) {
    const full = path.resolve(root, s);
    if (!fs.existsSync(full)) throw friendly(`Can't find "${s}" in the project folder.`);
    const st = fs.statSync(full);
    if (st.isDirectory()) { const before = out.length; walk(full, 0); out.slice(before).forEach((o) => { o.base = full; }); }
    else if (/\.(md|markdown)$/i.test(full)) out.push({ file: full, base: path.dirname(full) });
    else throw friendly(`"${s}" is not a Markdown file or folder. Publish approved Markdown (lifecycle outputs or a wiki export).`);
  }
  return [...new Map(out.map((o) => [o.file, o])).values()];
}

/** Read publishing-log.xlsx → rows keyed by column name. Missing log → []. */
async function readLog(root) {
  const file = path.join(root, PUBLISHED, LOG);
  if (!fs.existsSync(file)) return [];
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.getWorksheet('Log') || wb.worksheets[0];
  if (!ws) return [];
  const head = [];
  ws.getRow(1).eachCell({ includeEmpty: true }, (c, i) => { head[i] = String(excel.cellText(c)).trim(); });
  const rows = [];
  ws.eachRow((row, n) => {
    if (n === 1) return;
    const r = {};
    head.forEach((h, i) => { if (h) r[h] = String(excel.cellText(row.getCell(i)) ?? '').trim(); });
    if (r.Source || r.Destination) rows.push(r);
  });
  return rows;
}

async function writeLog(root, rows) {
  const file = path.join(root, PUBLISHED, LOG);
  await excel.write(file, [{ name: 'Log', columns: COLUMNS.map((h) => ({ header: h, format: 'text' })), rows: rows.map((r) => COLUMNS.map((h) => r[h] ?? '')) }], { recalculate: false });
  return file;
}

function htmlSnapshot(title, markdown, meta) {
  const metaTags = Object.entries(meta).filter(([, v]) => v).map(([k, v]) => `<meta name="${esc(k)}" content="${esc(v)}">`).join('\n');
  const line = [meta.version && `Version ${meta.version}`, meta.approver && `Approved by ${meta.approver}`, meta['published-at'] && `Published ${meta['published-at'].slice(0, 10)}`].filter(Boolean).join(' · ');
  return `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title>\n${metaTags}\n`
    + '<style>body{font-family:"Segoe UI",Arial,sans-serif;max-width:52rem;margin:2rem auto;padding:0 1rem;line-height:1.5;color:#222}table{border-collapse:collapse}td,th{border:1px solid #bbb;padding:.3rem .5rem}th{background:#eef}code,pre{background:#f4f4f4}pre{padding:.6rem;overflow:auto}.meta{color:#666;font-size:.9rem;border-bottom:1px solid #ddd;padding-bottom:.5rem}</style>'
    + `</head><body><h1>${esc(title)}</h1><p class="meta">${esc(line)}<br>Source: ${esc(meta.source)} (revision ${esc(meta.revision)})</p>\n${marked.parse(markdown, { gfm: true })}\n</body></html>\n`;
}

/**
 * Publish approved Markdown as Word/HTML snapshots under Published/<library>/ and record them in the log.
 * opts: { root, library = 'Knowledge', formats = ['docx'], approver, version, template, force, allowUnapproved }
 * A source whose content is unchanged since its last publish is skipped (unless force). The version goes up by
 * one each time a source is republished, unless one is given.
 */
async function publishSnapshot(sources, { root, library = 'Knowledge', formats = ['docx'], approver, version, template, force = false, allowUnapproved = false, now = new Date() } = {}) {
  if (!root) throw new Error('root is required');
  if (!Array.isArray(sources) || !sources.length) throw friendly('Choose at least one Markdown file or folder to publish.');
  const lib = safeName(library).replace(/[\\/]/g, '_') || 'Knowledge';
  const fmts = [...new Set((formats || ['docx']).map((f) => String(f).toLowerCase()))].filter((f) => ['docx', 'html'].includes(f));
  if (!fmts.length) throw friendly('Choose docx and/or html.');
  const files = collectSources(root, sources);
  if (!files.length) throw friendly('No Markdown files were found to publish.');
  const tpl = template ? path.resolve(root, template) : null;
  const log = await readLog(root);
  const published = [], skipped = [], warnings = new Set();
  const at = now.toISOString().replace(/\.\d+Z$/, 'Z');

  for (const { file, base } of files) {
    const text = fs.readFileSync(file, 'utf8');
    const source = rel(root, file);
    const stamp = approvalOf(text);
    const who = approver || stamp.approver;
    if (!allowUnapproved && (!who || unapproved(text))) { skipped.push({ source, reason: unapproved(text) ? 'based on unapproved inputs' : 'not approved (no approval stamp and no approver given)' }); continue; }
    const revision = hashText(text);
    const sub = path.relative(base, path.dirname(file));
    const stem = path.basename(file).replace(/\.(md|markdown)$/i, '');
    const title = (/^#\s+(.+)$/m.exec(stamp.body) || [])[1]?.replace(/[*_`]/g, '').trim() || stem;
    for (const fmt of fmts) {
      const dest = path.join(root, PUBLISHED, lib, sub, `${safeName(stem)}.${fmt}`);
      const destRel = rel(root, dest);
      const prev = [...log].reverse().find((r) => r.Destination === destRel);
      if (prev && prev.Revision === revision && fs.existsSync(dest) && !force) { skipped.push({ source, destination: destRel, reason: 'unchanged since last published' }); continue; }
      const ver = version || (prev ? `${(parseInt(prev.Version, 10) || 0) + 1}.0` : '1.0');
      const meta = { source, revision, version: ver, approver: who, 'published-at': at, library: lib };
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      if (fmt === 'docx') {
        const r = await mdExport.toDocx(stamp.body, { title, template: tpl, fields: { version: ver, date: (stamp.approvedAt || at).slice(0, 10), approver: who },
          properties: { Version: ver, Approver: who, Source: source, 'Source revision': revision, 'Published at': at, Library: lib } });
        if (r.warning) warnings.add(r.warning);
        fs.writeFileSync(dest, r.buffer);
      } else fs.writeFileSync(dest, htmlSnapshot(title, stamp.body, meta));
      const row = { Source: source, Revision: revision, 'Published at': at, Approver: who, Version: ver, Destination: destRel, Library: lib, Format: fmt };
      const i = log.findIndex((r) => r.Destination === destRel);
      if (i >= 0) log[i] = row; else log.push(row);
      published.push(row);
    }
  }
  const saved = published.length ? await writeLog(root, log) : null;
  return { saved, log: rel(root, path.join(root, PUBLISHED, LOG)), published, skipped, warnings: [...warnings] };
}

/**
 * Compare the publishing log with the files now on disk.
 * stale: source changed since it was published · current · missingSource: source deleted or moved ·
 * missingSnapshot: logged snapshot no longer there · neverPublished: Markdown under `sources` with no log entry ·
 * orphans: files under Published/ that no log row points at.
 */
async function freshnessCheck({ root, sources = [] } = {}) {
  if (!root) throw new Error('root is required');
  const log = await readLog(root);
  const stale = [], current = [], missingSource = [], missingSnapshot = [];
  const hashes = new Map();
  for (const r of log) {
    const src = path.resolve(root, r.Source || '');
    const item = { source: r.Source, destination: r.Destination, version: r.Version, publishedAt: r['Published at'], approver: r.Approver };
    if (!fs.existsSync(path.resolve(root, r.Destination || ''))) missingSnapshot.push(item);
    if (!r.Source || !fs.existsSync(src)) { missingSource.push(item); continue; }
    if (!hashes.has(src)) hashes.set(src, hashText(fs.readFileSync(src, 'utf8')));
    const now = hashes.get(src);
    if (now !== r.Revision) stale.push({ ...item, publishedRevision: r.Revision, currentRevision: now, sourceModified: new Date(fs.statSync(src).mtimeMs).toISOString().slice(0, 16).replace('T', ' ') });
    else current.push(item);
  }
  const logged = new Set(log.map((r) => r.Source));
  const neverPublished = sources.length ? collectSources(root, sources).map((s) => rel(root, s.file)).filter((s) => !logged.has(s)) : [];
  const orphans = [];
  const pubDir = path.join(root, PUBLISHED);
  const dests = new Set(log.map((r) => r.Destination));
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const f = path.join(dir, e.name);
      if (e.isDirectory()) walk(f);
      else if (!e.name.startsWith('~$') && f !== path.join(pubDir, LOG) && !dests.has(rel(root, f))) orphans.push(rel(root, f));
    }
  };
  walk(pubDir);
  const summary = !log.length && !neverPublished.length ? 'Nothing has been published yet (no Published/publishing-log.xlsx).'
    : `${stale.length} stale, ${current.length} current, ${neverPublished.length} never published, ${orphans.length} orphan snapshot${orphans.length === 1 ? '' : 's'}, ${missingSource.length} missing source${missingSource.length === 1 ? '' : 's'}, ${missingSnapshot.length} missing snapshot${missingSnapshot.length === 1 ? '' : 's'}.`;
  return { log: rel(root, path.join(pubDir, LOG)), summary, stale, neverPublished, orphans, missingSource, missingSnapshot, current };
}

module.exports = { publishSnapshot, freshnessCheck, readLog, collectSources, hashText, approvalOf };
