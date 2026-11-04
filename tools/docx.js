// Word (.docx) reader — no Word installation or extra packages needed.
// A .docx is a zip of XML parts; we unzip word/document.xml with Node's zlib and turn it into
// Markdown-ish text (headings, numbered/bulleted paragraphs, tables) so the AI can quote and cite it.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

/** Minimal zip reader: returns the named entry's bytes, or null. Supports stored and deflated entries. */
function unzipEntry(buf, name) {
  // End of central directory record: last 22+ bytes, signature 0x06054b50.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw Object.assign(new Error('This file is not a valid .docx (zip) file.'), { friendly: true });
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const entry = buf.toString('utf8', p + 46, p + 46 + nameLen);
    if (entry === name) {
      const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const data = buf.subarray(start, start + size);
      if (method === 0) return data;
      if (method === 8) return zlib.inflateRawSync(data);
      throw Object.assign(new Error(`Unsupported compression in ${name}.`), { friendly: true });
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

const decode = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&amp;/g, '&');

function paragraphText(xml) {
  let out = '';
  // Text runs, tabs and breaks in document order.
  for (const m of xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:br\/>/g)) out += m[1] !== undefined ? decode(m[1]) : m[0] === '<w:tab/>' ? '\t' : '\n';
  return out.trim();
}

function paragraph(xml) {
  const text = paragraphText(xml);
  if (!text) return '';
  const style = (/<w:pStyle w:val="([^"]+)"/.exec(xml) || [])[1] || '';
  const h = /^Heading\s*(\d)$/i.exec(style);
  if (h) return `${'#'.repeat(Math.min(6, +h[1] + 1))} ${text}`;
  if (/^Title$/i.test(style)) return `# ${text}`;
  if (/<w:numPr>/.test(xml)) return `${'  '.repeat(+((/<w:ilvl w:val="(\d+)"/.exec(xml) || [])[1] || 0))}- ${text}`;
  return text;
}

function table(xml) {
  const rows = [...xml.matchAll(/<w:tr[\s>][\s\S]*?<\/w:tr>/g)].map((r) => [...r[0].matchAll(/<w:tc[\s>][\s\S]*?<\/w:tc>/g)]
    .map((c) => [...c[0].matchAll(/<w:p[\s>][\s\S]*?<\/w:p>/g)].map((p) => paragraphText(p[0])).filter(Boolean).join(' ').replace(/\|/g, '/')));
  if (!rows.length) return '';
  const width = Math.max(...rows.map((r) => r.length));
  const line = (r) => `| ${Array.from({ length: width }, (_, i) => r[i] || '').join(' | ')} |`;
  return [line(rows[0]), `|${' --- |'.repeat(width)}`, ...rows.slice(1).map(line)].join('\n');
}

/** Convert a .docx to Markdown-ish text. Top-level tables are kept as pipe tables. */
function docxToText(file) {
  const xml = unzipEntry(fs.readFileSync(file), 'word/document.xml');
  if (!xml) throw Object.assign(new Error(`"${path.basename(file)}" has no document body — is it really a Word file?`), { friendly: true });
  const body = xml.toString('utf8').replace(/<w:del\b[\s\S]*?<\/w:del>/g, ''); // tracked deletions are not current text
  // Swap each top-level table for a placeholder (depth-aware, so nested tables stay inside their cell),
  // then walk paragraphs and tables in document order.
  const tables = [];
  let flat = '', depth = 0, from = 0, start = 0;
  for (const m of body.matchAll(/<w:tbl[\s>]|<\/w:tbl>/g)) {
    if (m[0] !== '</w:tbl>') { if (depth++ === 0) { flat += body.slice(from, m.index); start = m.index; } }
    else if (--depth === 0) { const end = m.index + m[0].length; tables.push(body.slice(start, end)); flat += `<lumen-table ${tables.length - 1}/>`; from = end; }
  }
  flat += body.slice(from);
  const blocks = [];
  for (const m of flat.matchAll(/<lumen-table (\d+)\/>|<w:p[\s>][\s\S]*?<\/w:p>/g)) {
    const b = m[1] !== undefined ? table(tables[+m[1]]) : paragraph(m[0]);
    if (b) blocks.push(b);
  }
  return blocks.join('\n\n');
}

const TEXT_EXT = ['.md', '.markdown', '.txt', '.csv', '.json', '.yaml', '.yml'];

/** Read a document for the AI. Returns text with a header naming the source, so answers can cite it. */
function readDocument(file, { maxChars = 60000, startAt = 0 } = {}) {
  const ext = path.extname(file).toLowerCase();
  let text;
  if (ext === '.docx' || ext === '.docm') text = docxToText(file);
  else if (TEXT_EXT.includes(ext)) text = fs.readFileSync(file, 'utf8');
  else if (ext === '.doc') throw Object.assign(new Error(`"${path.basename(file)}" is an old .doc file. Open it in Word and save it as .docx first.`), { friendly: true });
  else throw Object.assign(new Error(`read_document handles Word (.docx) and text files (.md, .txt). For "${path.basename(file)}" use read_spreadsheet, read_project_plan, or your own file reader (PDFs).`), { friendly: true });
  const st = fs.statSync(file);
  const slice = text.slice(startAt, startAt + maxChars);
  const more = text.length > startAt + maxChars ? `\n\n… ${text.length - startAt - maxChars} more characters. Call again with startAt: ${startAt + maxChars}.` : '';
  return `Document: ${path.basename(file)} (modified ${new Date(st.mtimeMs).toISOString().slice(0, 10)}, ${text.length} characters)\n\n${slice}${more}`;
}

module.exports = { readDocument, docxToText, unzipEntry };
