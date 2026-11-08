// Integration and API design helpers (Plan 12). Pure functions plus small file readers/writers, unit-tested.
//
// 1. parseYaml / toYaml: a small YAML subset (block mappings and sequences, flow [..] and {..}, quoted and plain
//    scalars, | and > block text, comments). Enough for OpenAPI specs; anchors, aliases and tags are refused.
// 2. readStandards: the program's API standards (a Markdown "Rule | Value" table or a JSON file) → rules.
// 3. validateSpec / validateOpenApi: structure (paths, operations, $ref resolution, response codes, a schema for
//    every body, path parameters, operation IDs) plus the program standards (versioning, naming, error model,
//    required headers, error responses, x-traces-to). Every finding has a JSON path (and a line for YAML).
// 4. icdCompleteness / checkIcd: ICD sections against the template list; missing and empty sections as a log.
// 5. schemasFromModel: components.schemas from a readSchema result (tools/data.js).
// 6. writeOpenApi: save a spec (YAML or JSON), validated, never overwriting.
// 7. generateScaffold: a static mock (example responses) and scaffolding (controller stubs, DTOs, contract tests)
//    for dotnet, node or python, only from a spec with no errors. Nothing is run or served.

const fs = require('fs');
const path = require('path');

const friendly = (msg) => Object.assign(new Error(msg), { friendly: true });
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const rel = (root, f) => (root ? path.relative(root, f).split(path.sep).join('/') : path.basename(f));
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const METHODS = ['get', 'put', 'post', 'delete', 'patch', 'head', 'options', 'trace'];

function freeName(file) {
  if (!fs.existsSync(file)) return file;
  const ext = path.extname(file), stem = file.slice(0, -ext.length);
  for (let i = 2; ; i++) { const f = `${stem} (${i})${ext}`; if (!fs.existsSync(f)) return f; }
}

/** JSONPath for a list of keys: $.paths['/v1/x'].post.responses['200']. */
function jsonPath(parts) {
  return '$' + parts.map((p) => (typeof p === 'number' ? `[${p}]` : /^[A-Za-z_$][\w$]*$/.test(p) ? `.${p}` : `['${String(p).replace(/'/g, "\\'")}']`)).join('');
}

// ------------------------------------------------------------------ 1. YAML subset
function yamlError(msg, line) { return friendly(`The YAML can't be read${line ? ` (line ${line})` : ''}: ${msg}`); }

function stripComment(s) {
  let q = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === q && !(q === '"' && s[i - 1] === '\\')) q = null; continue; }
    if ((c === '"' || c === "'") && (i === 0 || /[\s:[{,-]/.test(s[i - 1]))) q = c;
    else if (c === '#' && (i === 0 || /\s/.test(s[i - 1]))) return s.slice(0, i).replace(/\s+$/, '');
  }
  return s.replace(/\s+$/, '');
}

function scalar(raw, line) {
  const s = raw.trim();
  if (s === '' || s === '~' || s === 'null' || s === 'Null' || s === 'NULL') return null;
  if (s[0] === '"') {
    if (!/"$/.test(s) || s.length < 2) throw yamlError('a "quoted" value is not closed', line);
    try { return JSON.parse(s); } catch { return s.slice(1, -1); }
  }
  if (s[0] === "'") {
    if (!/'$/.test(s) || s.length < 2) throw yamlError("a 'quoted' value is not closed", line);
    return s.slice(1, -1).replace(/''/g, "'");
  }
  if (/^[&*!]/.test(s)) throw yamlError('anchors, aliases and tags (&, *, !) are not supported', line);
  if (/^(true|True|TRUE)$/.test(s)) return true;
  if (/^(false|False|FALSE)$/.test(s)) return false;
  if (/^[-+]?\d+$/.test(s)) return Number(s);
  if (/^[-+]?(\d+\.\d*|\.\d+|\d+)([eE][-+]?\d+)?$/.test(s)) return Number(s);
  return s;
}

function parseFlow(text, line) {
  let i = 0;
  const ws = () => { while (i < text.length && /\s/.test(text[i])) i++; };
  const value = () => {
    ws();
    if (text[i] === '[') {
      i++; const out = [];
      for (;;) { ws(); if (text[i] === ']') { i++; return out; } out.push(value()); ws(); if (text[i] === ',') { i++; continue; } if (text[i] === ']') { i++; return out; } throw yamlError('a [list] is not closed', line); }
    }
    if (text[i] === '{') {
      i++; const out = {};
      for (;;) {
        ws(); if (text[i] === '}') { i++; return out; }
        const k = atom(true); ws();
        if (text[i] !== ':') throw yamlError('expected ":" in a {map}', line);
        i++; out[String(k)] = value(); ws();
        if (text[i] === ',') { i++; continue; }
        if (text[i] === '}') { i++; return out; }
        throw yamlError('a {map} is not closed', line);
      }
    }
    return atom(false);
  };
  const atom = (isKey) => {
    ws();
    if (text[i] === '"' || text[i] === "'") {
      const q = text[i]; let j = i + 1;
      while (j < text.length && !(text[j] === q && (q === "'" ? text[j + 1] !== "'" : text[j - 1] !== '\\'))) j += q === "'" && text[j] === "'" ? 2 : 1;
      const s = text.slice(i, j + 1); i = j + 1; return isKey ? scalar(s, line) : scalar(s, line);
    }
    let j = i;
    while (j < text.length && !(isKey ? /[:,}\]]/ : /[,}\]]/).test(text[j])) j++;
    const s = text.slice(i, j); i = j;
    return isKey ? s.trim() : scalar(s, line);
  };
  const v = value(); ws();
  if (i < text.length) throw yamlError('unexpected text after a [list] or {map}', line);
  return v;
}

/** Parse a YAML document (OpenAPI-sized subset). opts.lines: a Map filled with JSONPath → line number. */
function parseYaml(text, { lines } = {}) {
  const src = String(text || '').replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
  const rows = [];
  src.forEach((raw, n) => {
    if (/^\s*#/.test(raw) || !raw.trim()) { rows.push({ blank: true, raw, line: n + 1 }); return; }
    if (/^(---|\.\.\.)\s*$/.test(raw)) { if (rows.some((r) => !r.blank)) throw yamlError('only one YAML document per file is supported', n + 1); rows.push({ blank: true, raw, line: n + 1 }); return; }
    if (/^\t/.test(raw)) throw yamlError('use spaces, not tabs, to indent', n + 1);
    const indent = raw.length - raw.trimStart().length;
    rows.push({ indent, text: stripComment(raw.slice(indent)), raw, line: n + 1 });
  });
  let p = 0;
  const next = () => { while (p < rows.length && rows[p].blank) p++; return rows[p]; };
  const mark = (parts, line) => { if (lines) lines.set(jsonPath(parts), line); };

  function blockText(style, parentIndent, parts) {
    const out = []; let ind = null;
    while (p < rows.length) {
      const r = rows[p];
      if (r.blank) { out.push(''); p++; continue; }
      if (r.indent <= parentIndent) break;
      if (ind == null) ind = r.indent;
      out.push(r.raw.slice(Math.min(ind, r.indent))); p++;
    }
    while (out.length && out[out.length - 1] === '') out.pop();
    const strip = /-$/.test(style);
    let s = style[0] === '|' ? out.join('\n') : out.reduce((acc, l, i) => (i === 0 ? l : l === '' ? `${acc}\n` : acc.endsWith('\n') ? acc + l : `${acc} ${l}`), '');
    if (!strip) s += '\n';
    return s;
  }

  function valueAfter(rest, indent, parts, line) {
    const v = rest.trim();
    if (v === '') {
      const n = next();
      if (!n || n.indent < indent || (n.indent === indent && !/^-(\s|$)/.test(n.text))) return null;
      if (n.indent === indent) return parseSeq(indent, parts);
      return parseBlock(n.indent, parts);
    }
    if (/^[|>][-+]?\d*$/.test(v)) return blockText(v, indent, parts);
    if (v[0] === '[' || v[0] === '{') {
      let t = v; let depth = 0;
      const bal = (s) => { let d = 0, q = null; for (const c of s) { if (q) { if (c === q) q = null; continue; } if (c === '"' || c === "'") q = c; else if (c === '[' || c === '{') d++; else if (c === ']' || c === '}') d--; } return d; };
      depth = bal(t);
      while (depth > 0 && p < rows.length) { const r = rows[p++]; if (r.blank) continue; t += ` ${r.text}`; depth = bal(t); }
      return parseFlow(t, line);
    }
    return scalar(v, line);
  }

  function splitKey(t, line) {
    let key, rest;
    if (t[0] === '"' || t[0] === "'") {
      const q = t[0]; let j = 1;
      while (j < t.length && !(t[j] === q && (q === "'" ? t[j + 1] !== "'" : t[j - 1] !== '\\'))) j += q === "'" && t[j] === "'" ? 2 : 1;
      key = scalar(t.slice(0, j + 1), line); rest = t.slice(j + 1);
      if (!/^\s*:(\s|$)/.test(rest)) return null;
      rest = rest.replace(/^\s*:/, '');
    } else {
      const m = /^([^:]*?[^\s:]|[^:\s]):(\s+|$)(.*)$/.exec(t) || /^([^\s].*?):(\s+|$)(.*)$/.exec(t);
      if (!m) return null;
      key = m[1].trim(); rest = m[3];
      if (/^[[{]/.test(key)) return null;
    }
    return { key: String(key), rest };
  }

  function parseMap(indent, parts) {
    const out = {};
    for (;;) {
      const r = next();
      if (!r || r.indent < indent) break;
      if (r.indent > indent) throw yamlError('unexpected indentation', r.line);
      if (/^-(\s|$)/.test(r.text)) break;
      const kv = splitKey(r.text, r.line);
      if (!kv) throw yamlError(`expected "key: value", found "${r.text.slice(0, 40)}"`, r.line);
      if (Object.prototype.hasOwnProperty.call(out, kv.key)) throw yamlError(`the key "${kv.key}" appears twice`, r.line);
      p++;
      const kp = [...parts, kv.key];
      mark(kp, r.line);
      out[kv.key] = valueAfter(kv.rest, indent, kp, r.line);
    }
    return out;
  }

  function parseSeq(indent, parts) {
    const out = [];
    for (;;) {
      const r = next();
      if (!r || r.indent !== indent || !/^-(\s|$)/.test(r.text)) { if (r && r.indent > indent) throw yamlError('unexpected indentation', r.line); break; }
      const ip = [...parts, out.length];
      mark(ip, r.line);
      const rest = r.text.replace(/^-\s*/, '');
      if (!rest) { p++; const n = next(); out.push(n && n.indent > indent ? parseBlock(n.indent, ip) : null); continue; }
      const off = r.text.length - rest.length;
      if (!/^[[{]/.test(rest) && splitKey(rest, r.line)) {
        // "- key: value" starts a mapping indented to the key's column.
        rows[p] = { ...r, indent: indent + off, text: rest };
        out.push(parseMap(indent + off, ip));
      } else { p++; out.push(valueAfter(rest, indent, ip, r.line)); }
    }
    return out;
  }

  function parseBlock(indent, parts) {
    const r = next();
    if (!r) return null;
    if (/^-(\s|$)/.test(r.text)) return parseSeq(indent, parts);
    if (!splitKey(r.text, r.line)) {
      // A plain multi-line value.
      p++; let s = r.text;
      if (/^[[{]/.test(s.trim())) return valueAfter(s, indent - 1, parts, r.line);
      while (next() && rows[p].indent >= indent && !splitKey(rows[p].text, rows[p].line)) { s += ` ${rows[p].text}`; p++; }
      return scalar(s, r.line);
    }
    return parseMap(indent, parts);
  }

  const first = next();
  if (!first) return null;
  const doc = parseBlock(first.indent, []);
  const left = next();
  if (left) throw yamlError('unexpected indentation', left.line);
  return doc;
}

const YAML_PLAIN = /^[A-Za-z_/][\w ./{}()-]*$/;
function yamlScalar(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  const s = String(v);
  if (s === '' || !YAML_PLAIN.test(s) || /^(true|false|null|yes|no|on|off|~)$/i.test(s) || /\s$/.test(s) || /^[-+]?[\d.]+([eE][-+]?\d+)?$/.test(s)) return JSON.stringify(s);
  return s;
}
const yamlKey = (k) => (/^[A-Za-z_$][\w$./-]*$/.test(k) && !/^(true|false|null|yes|no|on|off)$/i.test(k) ? k : /^\//.test(k) && YAML_PLAIN.test(k) ? k : JSON.stringify(k));
const inlineYaml = (v) => (Array.isArray(v) ? '[]' : isObj(v) ? '{}' : yamlScalar(v));
const blockable = (v) => typeof v === 'string' && v.includes('\n') && !/\n\n+$/.test(v) && v.split('\n').every((l) => !/^\s/.test(l) && !/\s$/.test(l));

/** Write a value as block YAML that parseYaml reads back. */
function toYaml(value) {
  const out = [];
  const sp = (n) => ' '.repeat(n);
  const block = (head, v, ind) => { out.push(`${head} |${v.endsWith('\n') ? '' : '-'}`); for (const l of v.replace(/\n$/, '').split('\n')) out.push(l ? `${sp(ind)}${l}` : ''); };
  const pair = (k, v, ind, lead) => {
    const head = `${lead}${yamlKey(k)}:`;
    if (Array.isArray(v) && v.length) { out.push(head); seq(v, ind + 2); } else if (isObj(v) && Object.keys(v).length) { out.push(head); map(v, ind + 2); } else if (blockable(v)) block(head, v, ind + 2); else out.push(`${head} ${inlineYaml(v)}`);
  };
  const map = (obj, ind, firstLead) => Object.keys(obj).forEach((k, i) => pair(k, obj[k], ind, i === 0 && firstLead != null ? firstLead : sp(ind)));
  const seq = (arr, ind) => {
    for (const item of arr) {
      if (isObj(item) && Object.keys(item).length) map(item, ind + 2, `${sp(ind)}- `);
      else if (Array.isArray(item) && item.length) { out.push(`${sp(ind)}-`); seq(item, ind + 2); } else if (blockable(item)) block(`${sp(ind)}-`, item, ind + 2); else out.push(`${sp(ind)}- ${inlineYaml(item)}`);
    }
  };
  if (isObj(value) && Object.keys(value).length) map(value, 0); else if (Array.isArray(value) && value.length) seq(value, 0); else out.push(inlineYaml(value));
  return `${out.join('\n')}\n`;
}

/** Read an OpenAPI document from .yaml/.yml/.json text. Returns { doc, format, lines }. */
function parseSpecText(text, name = 'spec') {
  const t = String(text || '').replace(/^﻿/, '');
  const lines = new Map();
  if (/^\s*[{[]/.test(t)) {
    try { return { doc: JSON.parse(t), format: 'JSON', lines }; } catch (e) { throw friendly(`"${name}" is not valid JSON: ${e.message}`); }
  }
  return { doc: parseYaml(t, { lines }), format: 'YAML', lines };
}

// ------------------------------------------------------------------ 2. program API standards
const CASES = {
  'kebab-case': /^[a-z0-9]+(-[a-z0-9]+)*$/,
  'snake_case': /^[a-z0-9]+(_[a-z0-9]+)*$/,
  camelCase: /^[a-z][a-zA-Z0-9]*$/,
  PascalCase: /^[A-Z][a-zA-Z0-9]*$/,
};
const caseOf = (s) => (/kebab|hyphen|dash/i.test(s) ? 'kebab-case' : /snake|underscore/i.test(s) ? 'snake_case' : /pascal|upper camel/i.test(s) ? 'PascalCase' : /camel/i.test(s) ? 'camelCase' : null);
const ticks = (s) => [...String(s).matchAll(/`([^`]+)`/g)].map((m) => m[1].trim());

/** Rules from the program's API standards: a Markdown table with Rule and Value columns, or a JSON object. */
function parseStandards(text, source = 'API standards') {
  const t = String(text || '');
  if (/^\s*\{/.test(t)) {
    let j; try { j = JSON.parse(t); } catch (e) { throw friendly(`"${source}" is not valid JSON: ${e.message}`); }
    return { source, versionPrefix: j.versionPrefix || null, pathCase: j.pathCase || null, propertyCase: j.propertyCase || null, operationId: !!j.operationId, errorSchema: j.errorSchema || null, errorCodes: (j.errorCodes || []).map(String), requiredHeaders: j.requiredHeaders || [], traces: !!j.traces, at: {} };
  }
  const rules = { source, versionPrefix: null, pathCase: null, propertyCase: null, operationId: false, errorSchema: null, errorCodes: [], requiredHeaders: [], traces: false, at: {} };
  const lines = t.replace(/\r\n/g, '\n').split('\n');
  lines.forEach((l, i) => {
    if (!/^\s*\|/.test(l) || /^\s*\|[\s:|-]+\|\s*$/.test(l)) return;
    const cells = l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
    if (cells.length < 2) return;
    const [name, value] = cells; const at = `${source}:${i + 1}`;
    if (/^rule$/i.test(name)) return;
    if (/version/i.test(name)) { const m = /\/v\d+\//i.exec(value) || /\bv(\d+)\b/i.exec(value); if (m) { rules.versionPrefix = m[0].startsWith('/') ? m[0] : `/v${m[1]}/`; rules.at.versionPrefix = at; } }
    else if (/path|resource|url/i.test(name) && /nam|case/i.test(name)) { const c = caseOf(value); if (c) { rules.pathCase = c; rules.at.pathCase = at; } }
    else if (/propert|field|attribute|json/i.test(name)) { const c = caseOf(value); if (c) { rules.propertyCase = c; rules.at.propertyCase = at; } }
    else if (/operation ?id/i.test(name)) { rules.operationId = !/optional|not required/i.test(value); rules.at.operationId = at; }
    else if (/error (model|schema|format|body)/i.test(name)) { const n = ticks(value)[0] || (/^\s*([A-Za-z][\w]*)/.exec(value) || [])[1]; if (n) { rules.errorSchema = n.replace(/^#\/components\/schemas\//, ''); rules.at.errorSchema = at; } }
    else if (/error (respon|code|status)/i.test(name)) { rules.errorCodes = [...new Set([...value.matchAll(/\b[45]\d\d\b/g)].map((m) => m[0]))]; rules.at.errorCodes = at; }
    else if (/header/i.test(name)) { const h = ticks(value).length ? ticks(value) : [...value.matchAll(/\b[A-Z][\w]*(?:-[\w]+)+\b/g)].map((m) => m[0]); if (h.length) { rules.requiredHeaders = h; rules.at.requiredHeaders = at; } }
    else if (/trace/i.test(name)) { rules.traces = /x-traces-to|required|every/i.test(value); rules.at.traces = at; }
  });
  return rules;
}

function readStandards(file) {
  if (!file) return null;
  const ext = path.extname(file).toLowerCase();
  let text;
  if (ext === '.docx' || ext === '.docm') text = require('./docx').docxToText(file);
  else if (['.md', '.markdown', '.txt', '.json'].includes(ext)) text = fs.readFileSync(file, 'utf8');
  else throw friendly(`"${path.basename(file)}" must be a Markdown, text, Word or JSON file with the API standards.`);
  return parseStandards(text, path.basename(file));
}

// ------------------------------------------------------------------ 3. validation
function pointer(doc, ref) {
  if (typeof ref !== 'string' || !ref.startsWith('#')) return { external: true };
  const parts = ref.replace(/^#\/?/, '').split('/').filter((x, i, a) => !(x === '' && i === a.length - 1)).map((x) => decodeURIComponent(x).replace(/~1/g, '/').replace(/~0/g, '~'));
  let cur = doc;
  for (const k of parts) { if (cur == null || typeof cur !== 'object' || !(k in cur)) return { missing: true }; cur = cur[k]; }
  return { value: cur };
}
function deref(doc, v, seen = 0) {
  while (isObj(v) && typeof v.$ref === 'string' && seen++ < 20) { const r = pointer(doc, v.$ref); if (!('value' in r)) return undefined; v = r.value; }
  return v;
}
const refName = (v) => (isObj(v) && typeof v.$ref === 'string' ? v.$ref.split('/').pop() : null);
const TRACE_ID = /^(BR|FD)-\d+(\.\d+)*$/;

/**
 * Validate an OpenAPI 3.0 document. opts: { rules (readStandards result), lines (JSONPath → line), requireTraces }.
 * Returns { valid, errors, warnings, findings: [{ severity, path, line, message, rule }], operations, summary }.
 */
function validateSpec(doc, { rules, lines, requireTraces } = {}) {
  const findings = [];
  const lineOf = (parts) => { if (!lines) return undefined; for (let n = parts.length; n >= 0; n--) { const l = lines.get(jsonPath(parts.slice(0, n))); if (l) return l; } return undefined; };
  const add = (severity, parts, message, rule) => findings.push({ severity, path: jsonPath(parts), ...(lineOf(parts) ? { line: lineOf(parts) } : {}), message, ...(rule ? { rule } : {}) });
  const operations = [];
  if (!isObj(doc)) { add('error', [], 'The file is not an OpenAPI document (no top-level object).'); return finish(); }
  const traces = requireTraces || (rules && rules.traces);

  // Top level.
  if (doc.swagger) add('error', ['swagger'], `This is a Swagger ${doc.swagger} document. Convert it to OpenAPI 3.0.`);
  else if (!doc.openapi) add('error', ['openapi'], 'The "openapi" version field is missing (use 3.0.x).');
  else if (!/^3\.[01]\./.test(String(doc.openapi))) add('warning', ['openapi'], `OpenAPI ${doc.openapi} was not expected; the program uses 3.0.x.`);
  if (!isObj(doc.info)) add('error', ['info'], 'The "info" section is missing (title and version).');
  else { if (!doc.info.title) add('error', ['info', 'title'], 'The API has no title.'); if (doc.info.version == null || doc.info.version === '') add('error', ['info', 'version'], 'The API has no version.'); }
  if (!isObj(doc.paths) || !Object.keys(doc.paths).length) add('error', ['paths'], 'There are no paths.');

  // Every $ref resolves.
  const walkRefs = (v, parts) => {
    if (Array.isArray(v)) v.forEach((x, i) => walkRefs(x, [...parts, i]));
    else if (isObj(v)) for (const [k, x] of Object.entries(v)) {
      if (k === '$ref') {
        const r = pointer(doc, x);
        if (r.external) add('warning', [...parts, k], `The reference "${x}" points to another file; Lumen didn't check it.`);
        else if (r.missing) add('error', [...parts, k], `The reference "${x}" does not resolve: nothing is defined at that location.`);
      } else if (!(k === 'example' || k === 'examples')) walkRefs(x, [...parts, k]);
    }
  };
  walkRefs(doc, []);

  const opIds = new Map();
  for (const [p, item] of Object.entries(isObj(doc.paths) ? doc.paths : {})) {
    const pp = ['paths', p];
    if (!p.startsWith('/')) add('error', pp, `The path "${p}" must start with "/".`);
    if (rules && rules.versionPrefix && !p.toLowerCase().startsWith(rules.versionPrefix.toLowerCase())) add('error', pp, `The path "${p}" doesn't start with the version prefix ${rules.versionPrefix}.`, rules.at.versionPrefix || 'Versioning');
    if (rules && rules.pathCase) {
      const segs = p.split('/').filter(Boolean).filter((s) => !/^\{.*\}$/.test(s) && !/^v\d+$/i.test(s));
      const bad = segs.filter((s) => !CASES[rules.pathCase].test(s));
      if (bad.length) add('warning', pp, `Path segment${bad.length === 1 ? '' : 's'} ${bad.map((b) => `"${b}"`).join(', ')} ${bad.length === 1 ? 'is' : 'are'} not ${rules.pathCase}.`, rules.at.pathCase || 'Path naming');
    }
    const it = deref(doc, item) || {};
    const pathParams = (Array.isArray(it.parameters) ? it.parameters : []).map((x) => deref(doc, x)).filter(Boolean);
    const template = [...p.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
    for (const method of METHODS) {
      const op = it[method];
      if (!isObj(op)) continue;
      const op0 = [...pp, method];
      const label = `${method.toUpperCase()} ${p}`;
      const t = op['x-traces-to'];
      const tracesTo = (Array.isArray(t) ? t : typeof t === 'string' ? t.split(/[,;\s]+/) : []).map((x) => String(x).trim()).filter(Boolean);
      operations.push({ method: method.toUpperCase(), path: p, operationId: op.operationId || '', summary: op.summary || '', tags: op.tags || [], tracesTo });

      // Operation ID.
      if (!op.operationId) add(rules && rules.operationId ? 'error' : 'warning', op0, `${label} has no operationId.`, rules && rules.operationId ? rules.at.operationId || 'Operation IDs' : undefined);
      else if (opIds.has(op.operationId)) add('error', [...op0, 'operationId'], `The operationId "${op.operationId}" is also used by ${opIds.get(op.operationId)}.`);
      else opIds.set(op.operationId, label);

      // Parameters.
      const params = (Array.isArray(op.parameters) ? op.parameters : []).map((x, i) => ({ v: deref(doc, x), i }));
      params.forEach(({ v, i }) => { if (v && (!v.name || !v.in)) add('error', [...op0, 'parameters', i], `A parameter of ${label} has no name or no "in".`); });
      const all = [...pathParams, ...params.map((x) => x.v).filter(Boolean)];
      for (const name of template) {
        const d = all.find((x) => x.in === 'path' && x.name === name);
        if (!d) add('error', [...op0, 'parameters'], `${label} doesn't declare the path parameter "${name}".`);
        else if (d.required !== true) add('error', [...op0, 'parameters'], `The path parameter "${name}" of ${label} must be required: true.`);
      }
      for (const d of all.filter((x) => x.in === 'path')) if (!template.includes(d.name)) add('error', [...op0, 'parameters'], `${label} declares a path parameter "${d.name}" that isn't in the path.`);
      if (rules) for (const h of rules.requiredHeaders || []) if (!all.some((x) => x.in === 'header' && String(x.name).toLowerCase() === h.toLowerCase())) add('error', [...op0, 'parameters'], `${label} doesn't declare the required header ${h}.`, rules.at.requiredHeaders || 'Required headers');

      // Request body.
      if (op.requestBody !== undefined) {
        const rb = deref(doc, op.requestBody);
        if (rb && !isObj(rb.content)) add('error', [...op0, 'requestBody'], `The request body of ${label} has no content.`);
        else if (rb) for (const [mt, m] of Object.entries(rb.content)) if (!isObj(m) || !m.schema) add('error', [...op0, 'requestBody', 'content', mt], `The ${mt} request body of ${label} has no schema.`);
      }
      if (['get', 'delete', 'head'].includes(method) && op.requestBody) add('warning', [...op0, 'requestBody'], `${label} has a request body, which many clients won't send.`);

      // Responses.
      const res = op.responses;
      if (!isObj(res) || !Object.keys(res).length) { add('error', [...op0, 'responses'], `${label} has no responses.`); }
      else {
        const codes = Object.keys(res);
        for (const c of codes) if (!/^([1-5]\d\d|[1-5]XX|default)$/i.test(c)) add('error', [...op0, 'responses', c], `"${c}" is not a valid response code.`);
        if (!codes.some((c) => /^[23]/.test(c))) add('error', [...op0, 'responses'], `${label} has no success (2xx) response.`);
        const errCodes = codes.filter((c) => /^[45]/.test(c) || c === 'default');
        if (rules && rules.errorCodes && rules.errorCodes.length) {
          const missing = rules.errorCodes.filter((c) => !codes.some((k) => k === c || k.toUpperCase() === `${c[0]}XX`));
          if (missing.length) add('error', [...op0, 'responses'], `${label} is missing the ${missing.join(', ')} error response${missing.length === 1 ? '' : 's'} the API standards require.`, rules.at.errorCodes || 'Error responses');
        } else if (!errCodes.length) add('warning', [...op0, 'responses'], `${label} declares no error response (4xx, 5xx or default).`);
        for (const c of codes) {
          const r = deref(doc, res[c]);
          if (!r) continue;
          if (r.description == null) add('warning', [...op0, 'responses', c], `The ${c} response of ${label} has no description.`);
          if (!isObj(r.content)) continue;
          for (const [mt, m] of Object.entries(r.content)) {
            const at = [...op0, 'responses', c, 'content', mt];
            if (!isObj(m) || !m.schema) { add('error', at, `The ${c} ${mt} response of ${label} has no schema.`); continue; }
            if (rules && rules.errorSchema && (/^[45]/.test(c) || c === 'default')) {
              if (refName(m.schema) !== rules.errorSchema) add('error', [...at, 'schema'], `The ${c} response of ${label} doesn't use the ${rules.errorSchema} error model.`, rules.at.errorSchema || 'Error model');
            }
          }
        }
      }

      // Traceability.
      if (traces) {
        if (!tracesTo.length) add('error', [...op0, 'x-traces-to'], `${label} has no x-traces-to (the BR/FD IDs it implements).`, (rules && rules.at.traces) || 'Traceability');
        else { const bad = tracesTo.filter((x) => !TRACE_ID.test(x)); if (bad.length) add('warning', [...op0, 'x-traces-to'], `${label} traces to ${bad.join(', ')}, which ${bad.length === 1 ? "isn't a BR or FD ID" : "aren't BR or FD IDs"}.`); }
      }
    }
  }

  // Error model and property naming in components.
  const schemas = isObj(doc.components) && isObj(doc.components.schemas) ? doc.components.schemas : {};
  if (rules && rules.errorSchema && !schemas[rules.errorSchema]) add('error', ['components', 'schemas'], `The ${rules.errorSchema} error model the API standards require is not defined.`, rules.at.errorSchema || 'Error model');
  if (rules && rules.propertyCase) {
    const walk = (s, parts, depth = 0) => {
      if (!isObj(s) || depth > 8) return;
      if (isObj(s.properties)) for (const [k, v] of Object.entries(s.properties)) { if (!CASES[rules.propertyCase].test(k)) add('warning', [...parts, 'properties', k], `The property "${k}" is not ${rules.propertyCase}.`, rules.at.propertyCase || 'Property naming'); walk(v, [...parts, 'properties', k], depth + 1); }
      if (isObj(s.items)) walk(s.items, [...parts, 'items'], depth + 1);
      for (const k of ['allOf', 'oneOf', 'anyOf']) if (Array.isArray(s[k])) s[k].forEach((x, i) => walk(x, [...parts, k, i], depth + 1));
    };
    for (const [n, s] of Object.entries(schemas)) walk(s, ['components', 'schemas', n]);
  }
  return finish();

  function finish() {
    const errors = findings.filter((f) => f.severity === 'error'), warnings = findings.filter((f) => f.severity === 'warning');
    const untraced = operations.filter((o) => !o.tracesTo.length).length;
    return {
      valid: errors.length === 0, errors, warnings, findings, operations,
      rules: rules ? { source: rules.source, versionPrefix: rules.versionPrefix, pathCase: rules.pathCase, propertyCase: rules.propertyCase, operationId: rules.operationId, errorSchema: rules.errorSchema, errorCodes: rules.errorCodes, requiredHeaders: rules.requiredHeaders, traces: rules.traces } : null,
      summary: `${plural(operations.length, 'operation')}: ${plural(errors.length, 'error')}, ${plural(warnings.length, 'warning')}${operations.length ? `; ${untraced ? `${untraced} without x-traces-to` : 'every operation has x-traces-to'}` : ''}${rules ? ` (checked against ${rules.source})` : ' (structure only; no API standards given)'}.`,
    };
  }
}

/** Read and validate an OpenAPI file (.yaml/.yml/.json). opts: { standards (file), rules, requireTraces, root }. */
function validateOpenApi(file, opts = {}) {
  const ext = path.extname(file).toLowerCase();
  if (!['.yaml', '.yml', '.json'].includes(ext)) throw friendly(`"${path.basename(file)}" must be an OpenAPI file (.yaml, .yml or .json).`);
  let parsed;
  try { parsed = parseSpecText(fs.readFileSync(file, 'utf8'), path.basename(file)); } catch (e) {
    if (!e.friendly) throw e;
    const m = /\(line (\d+)\)/.exec(e.message);
    const f = { severity: 'error', path: '$', ...(m ? { line: +m[1] } : {}), message: e.message };
    return { file: opts.root ? rel(opts.root, file) : path.basename(file), format: ext === '.json' ? 'JSON' : 'YAML', valid: false, errors: [f], warnings: [], findings: [f], operations: [], rules: null, summary: 'The file could not be read, so nothing else was checked.' };
  }
  const rules = opts.rules || (opts.standards ? readStandards(opts.standards) : null);
  const r = validateSpec(parsed.doc, { rules, lines: parsed.lines, requireTraces: opts.requireTraces });
  return { file: opts.root ? rel(opts.root, file) : path.basename(file), format: parsed.format, title: (parsed.doc && parsed.doc.info && parsed.doc.info.title) || '', version: (parsed.doc && parsed.doc.info && parsed.doc.info.version) || '', ...r };
}

// ------------------------------------------------------------------ 4. ICD completeness
const ICD_SECTIONS = [
  { id: 'purpose', section: 'Purpose and scope', re: /purpose|introduction|overview|\bscope\b/i },
  { id: 'parties', section: 'Parties (provider and consumer systems)', re: /parties|participants|interfacing systems|systems involved|provider|consumer|stakeholders/i },
  { id: 'protocol', section: 'Protocol and transport', re: /protocol|transport|communication|connectivity|endpoint/i },
  { id: 'pattern', section: 'Integration pattern (HIP / ARO P4 or P5)', re: /\bhip\b|\baro\b|integration pattern|\bpattern\b/i },
  { id: 'schemas', section: 'Message schemas', re: /message|schema|payload|data (elements|contract|mapping)/i },
  { id: 'errors', section: 'Error handling', re: /error|exception|retr(y|ies)|fault/i },
  { id: 'security', section: 'Security', re: /security|authenticat|authori[sz]/i },
  { id: 'slas', section: 'Service levels (SLAs)', re: /\bslas?\b|service level|availability|performance|response time/i },
  { id: 'volumes', section: 'Volumes', re: /volume|throughput|frequency|\bload\b|capacity/i },
];
const PLACEHOLDER = /^(tbd|tbc|todo|to do|to be (confirmed|determined|completed|added|agreed)|needs input\b.*|n\/a|none yet|pending|-+|—|–|_+|\.\.\.|…|\[[^\]]*\]|<[^>]*>|\(?(add|describe|enter|fill in|insert)\b.*\)?)\.?$/i;

/** Headings of a Markdown(-ish) text with the body under each (up to the next heading of the same or a higher level). */
function sectionsOf(text) {
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
  const heads = [];
  lines.forEach((l, i) => { const m = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(l); if (m) heads.push({ level: m[1].length, text: m[2].replace(/[*_`]/g, '').trim(), line: i + 1 }); });
  return heads.map((h, k) => {
    let end = lines.length;
    for (let j = k + 1; j < heads.length; j++) if (heads[j].level <= h.level) { end = heads[j].line - 1; break; }
    const body = lines.slice(h.line, end).filter((l) => !/^#{1,6}\s/.test(l));
    return { ...h, body };
  });
}
function meaningful(body) {
  const out = [];
  let header = true;
  for (const raw of body) {
    let l = raw.trim().replace(/^>\s*/, '').replace(/^[-*+]\s+|^\d+[.)]\s+/, '').replace(/[*_`]/g, '').trim();
    if (!l) continue;
    if (/^\|[\s:|-]+\|?$/.test(l)) { header = false; continue; }
    if (/^\|/.test(l)) {
      if (header) { header = false; continue; } // a table's header row on its own says nothing
      const cells = l.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const values = cells.length > 1 ? cells.slice(1) : cells; // the first column is usually a label
      if (values.some((c) => c && !PLACEHOLDER.test(c))) out.push(l);
      continue;
    }
    header = true;
    if (PLACEHOLDER.test(l)) continue;
    out.push(l);
  }
  return out;
}

/**
 * Check an ICD against the template sections. opts: { sections (names to use instead of the template list) }.
 * Returns { sections: [{ id, section, status ok|empty|missing|incomplete, heading, line, note }], missing, empty,
 * incomplete, complete, score, log: [ 'Missing: …' ] }.
 */
function icdCompleteness(markdown, { sections } = {}) {
  const list = sections && sections.length ? sections.map((s, i) => ({ id: `s${i + 1}`, section: s, re: new RegExp(String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'), 'i') })) : ICD_SECTIONS;
  const found = sectionsOf(markdown);
  const titleLevel = found.length && found[0].level === 1 && found.filter((h) => h.level === 1).length === 1 ? 1 : 0;
  const rows = list.map((s) => {
    const h = found.find((x) => x.level > titleLevel && s.re.test(x.text.replace(/^[\d.]+\s*/, ''))) || (titleLevel ? null : found.find((x) => s.re.test(x.text)));
    if (!h) return { id: s.id, section: s.section, status: 'missing', note: 'No heading for this section.' };
    const body = meaningful(h.body);
    if (!body.length) return { id: s.id, section: s.section, status: 'empty', heading: h.text, line: h.line, note: 'The heading is there but the section has no content (only placeholders such as TBD).' };
    const needs = body.filter((l) => /needs input|\btbd\b|\btbc\b/i.test(l)).length;
    if (s.id === 'pattern' && !/\bP[45]\b|\bARO\b|\bHIP\b/i.test(body.join(' '))) return { id: s.id, section: s.section, status: 'incomplete', heading: h.text, line: h.line, note: "It doesn't name the HIP pattern (ARO P4 or P5)." };
    if (needs) return { id: s.id, section: s.section, status: 'incomplete', heading: h.text, line: h.line, note: `${plural(needs, 'line')} still marked Needs input or TBD.` };
    return { id: s.id, section: s.section, status: 'ok', heading: h.text, line: h.line, note: '' };
  });
  const of = (st) => rows.filter((r) => r.status === st).map((r) => r.section);
  const ok = rows.filter((r) => r.status === 'ok').length;
  const log = rows.filter((r) => r.status !== 'ok').map((r) => `${r.status === 'missing' ? 'Missing' : r.status === 'empty' ? 'Empty' : 'Incomplete'}: ${r.section}${r.line ? ` (heading "${r.heading}", line ${r.line})` : ''}: ${r.note}`);
  return { sections: rows, missing: of('missing'), empty: of('empty'), incomplete: of('incomplete'), complete: ok === rows.length, score: rows.length ? Math.round((ok / rows.length) * 100) : 100, log, summary: `${ok} of ${rows.length} ICD sections complete${of('missing').length ? `; missing: ${of('missing').join(', ')}` : ''}${of('empty').length ? `; empty: ${of('empty').join(', ')}` : ''}${of('incomplete').length ? `; incomplete: ${of('incomplete').join(', ')}` : ''}.` };
}

function checkIcd(file, opts = {}) {
  const text = require('./governance').readText(file);
  return { file: opts.root ? rel(opts.root, file) : path.basename(file), ...icdCompleteness(text, opts) };
}

// ------------------------------------------------------------------ 5. components.schemas from a schema
const FAMILY_TYPE = { string: { type: 'string' }, integer: { type: 'integer' }, decimal: { type: 'number' }, date: { type: 'string', format: 'date' }, timestamp: { type: 'string', format: 'date-time' }, boolean: { type: 'boolean' }, binary: { type: 'string', format: 'binary' }, unknown: { type: 'string' } };
const pascal = (s) => String(s).replace(/[^A-Za-z0-9]+(.)?/g, (_, c) => (c ? c.toUpperCase() : '')).replace(/^./, (c) => c.toUpperCase());
const camel = (s) => { const p = pascal(String(s).toLowerCase() === String(s) || String(s).toUpperCase() === String(s) ? String(s).toLowerCase() : s); return p.charAt(0).toLowerCase() + p.slice(1); };

/** OpenAPI component schemas from a readSchema result (tools/data.js). Names become PascalCase, properties camelCase. */
function schemasFromModel(model, { propertyCase = 'camelCase' } = {}) {
  const out = {};
  for (const e of (model && model.entities) || []) {
    const props = {}, required = [];
    for (const f of e.fields || []) {
      const name = propertyCase === 'camelCase' ? camel(f.name) : f.name;
      const s = { ...(FAMILY_TYPE[f.family] || FAMILY_TYPE.unknown) };
      const len = /\(\s*(\d+)\s*\)/.exec(f.type || '');
      if (len && s.type === 'string' && !s.format) s.maxLength = +len[1];
      if (f.description) s.description = f.description;
      if (f.rules && Array.isArray(f.rules.allowed) && f.rules.allowed.length) s.enum = f.rules.allowed;
      if (f.rules && f.rules.pattern) s.pattern = f.rules.pattern;
      props[name] = s;
      if (f.nullable === false || (f.rules && f.rules.required)) required.push(name);
    }
    out[pascal(String(e.entity).toUpperCase() === String(e.entity) ? String(e.entity).toLowerCase() : e.entity)] = { type: 'object', ...(required.length ? { required } : {}), properties: props };
  }
  return out;
}

// ------------------------------------------------------------------ 6. write a spec
/**
 * Save an OpenAPI spec (object, or YAML/JSON text) as .yaml/.yml/.json. Validates it first (opts.standards / rules,
 * requireTraces defaults to true), merges components.schemas from opts.models (readSchema results) where missing,
 * and never overwrites. Returns { saved, ...validation }.
 */
function writeOpenApi(file, spec, opts = {}) {
  const ext = path.extname(file).toLowerCase();
  if (!['.yaml', '.yml', '.json'].includes(ext)) throw friendly('Save the OpenAPI spec as .yaml, .yml or .json.');
  let doc = spec;
  if (typeof spec === 'string') doc = parseSpecText(spec, path.basename(file)).doc;
  if (!isObj(doc)) throw friendly('The spec must be an OpenAPI object (openapi, info, paths, components).');
  doc = JSON.parse(JSON.stringify(doc));
  const added = [];
  for (const model of opts.models || []) {
    const s = schemasFromModel(model);
    doc.components = isObj(doc.components) ? doc.components : {};
    doc.components.schemas = isObj(doc.components.schemas) ? doc.components.schemas : {};
    for (const [k, v] of Object.entries(s)) if (!doc.components.schemas[k]) { doc.components.schemas[k] = v; added.push(k); }
  }
  const text = ext === '.json' ? `${JSON.stringify(doc, null, 2)}\n` : toYaml(doc);
  const lines = new Map();
  if (ext !== '.json') parseYaml(text, { lines }); // round-trip check, and lines for the findings
  const rules = opts.rules || (opts.standards ? readStandards(opts.standards) : null);
  const v = validateSpec(doc, { rules, lines: ext === '.json' ? undefined : lines, requireTraces: opts.requireTraces !== false });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const target = freeName(file);
  fs.writeFileSync(target, text);
  return { saved: target, ...(added.length ? { schemasAdded: added } : {}), ...v, summary: `Saved. ${v.summary}${v.valid ? '' : ' Fix the errors and save again before generating scaffolding.'}` };
}

// ------------------------------------------------------------------ 7. mock and scaffolding
function exampleFor(doc, schema, depth = 0, name = '') {
  const s = deref(doc, schema);
  if (!isObj(s) || depth > 6) return null;
  if (s.example !== undefined) return s.example;
  if (Array.isArray(s.examples) && s.examples.length) return s.examples[0];
  if (s.default !== undefined) return s.default;
  if (Array.isArray(s.enum) && s.enum.length) return s.enum[0];
  if (Array.isArray(s.allOf)) return Object.assign({}, ...s.allOf.map((x) => exampleFor(doc, x, depth + 1)).filter(isObj));
  for (const k of ['oneOf', 'anyOf']) if (Array.isArray(s[k]) && s[k].length) return exampleFor(doc, s[k][0], depth + 1, name);
  const type = s.type || (s.properties ? 'object' : s.items ? 'array' : 'string');
  if (type === 'object') { const o = {}; for (const [k, v] of Object.entries(s.properties || {})) o[k] = exampleFor(doc, v, depth + 1, k); return o; }
  if (type === 'array') return [exampleFor(doc, s.items || {}, depth + 1, name)];
  if (type === 'integer') return s.minimum != null ? s.minimum : 1;
  if (type === 'number') return s.minimum != null ? s.minimum : 1.5;
  if (type === 'boolean') return true;
  const f = s.format || '';
  if (f === 'date') return '2026-11-07';
  if (f === 'date-time') return '2026-11-07T09:00:00Z';
  if (f === 'uuid') return '3fa85f64-5717-4562-b3fc-2c963f66afa6';
  if (f === 'email') return 'applicant@example.com';
  if (f === 'uri' || f === 'url') return 'https://example.com/resource';
  if (f === 'binary' || f === 'byte') return '<file>';
  return name ? `example ${name}` : 'example';
}
function mediaExample(doc, m, name) {
  if (!isObj(m)) return null;
  if (m.example !== undefined) return m.example;
  if (isObj(m.examples)) { const first = deref(doc, Object.values(m.examples)[0]); if (isObj(first) && first.value !== undefined) return first.value; }
  return exampleFor(doc, m.schema, 0, name);
}

const STACKS = {
  dotnet: { name: 'C# / ASP.NET Core', words: /\.net|dotnet|c#|csharp|asp\.?net/i },
  node: { name: 'Node.js / Express', words: /\bnode(\.js)?\b|\bexpress(\.js)?\b|javascript|typescript/i },
  python: { name: 'Python / FastAPI', words: /python|fastapi|flask|django/i },
};
/** The stack named in a document (e.g. the Solution Blueprint), or null. */
function stackFrom(text) {
  for (const [id, s] of Object.entries(STACKS)) if (s.words.test(String(text || ''))) return id;
  return null;
}

function typeIn(stack, doc, schema, nullable = false) {
  const s0 = schema || {};
  const n = refName(s0);
  if (n) return stack === 'node' ? pascal(n) : pascal(n) + (stack === 'dotnet' && nullable ? '?' : '');
  const s = deref(doc, s0) || {};
  const t = s.type, f = s.format;
  const map = {
    dotnet: () => (t === 'integer' ? (f === 'int64' ? 'long' : 'int') : t === 'number' ? 'decimal' : t === 'boolean' ? 'bool' : t === 'array' ? `List<${typeIn(stack, doc, s.items)}>` : t === 'object' ? 'Dictionary<string, object>' : f === 'date' ? 'DateOnly' : f === 'date-time' ? 'DateTimeOffset' : f === 'uuid' ? 'Guid' : 'string'),
    node: () => (t === 'integer' || t === 'number' ? 'number' : t === 'boolean' ? 'boolean' : t === 'array' ? `${typeIn(stack, doc, s.items)}[]` : t === 'object' ? 'object' : 'string'),
    python: () => (t === 'integer' ? 'int' : t === 'number' ? 'float' : t === 'boolean' ? 'bool' : t === 'array' ? `List[${typeIn(stack, doc, s.items)}]` : t === 'object' ? 'dict' : f === 'date' ? 'date' : f === 'date-time' ? 'datetime' : 'str'),
  };
  const base = map[stack]();
  return stack === 'dotnet' && nullable && !/^(string|List|Dictionary)/.test(base) ? `${base}?` : base;
}

function groupOf(op) {
  if (op.tags && op.tags.length) return pascal(op.tags[0]);
  const seg = op.path.split('/').filter(Boolean).filter((s) => !/^v\d+$/i.test(s) && !/^\{/.test(s))[0] || 'Api';
  return pascal(seg);
}

function scaffoldFiles(doc, stack, ops) {
  const files = {};
  const schemas = isObj(doc.components) && isObj(doc.components.schemas) ? doc.components.schemas : {};
  const groups = {};
  for (const o of ops) (groups[groupOf(o)] = groups[groupOf(o)] || []).push(o);
  const trace = (o) => (o.tracesTo.length ? o.tracesTo.join(', ') : 'TODO: add x-traces-to');
  const success = (o) => Object.keys(o.op.responses || {}).find((c) => /^2/.test(c)) || '200';
  const bodyRef = (o) => { const rb = deref(doc, o.op.requestBody); const m = rb && isObj(rb.content) ? rb.content['application/json'] : null; return m ? m.schema : null; };
  const resSchema = (o) => { const r = deref(doc, (o.op.responses || {})[success(o)]); const m = r && isObj(r.content) ? r.content['application/json'] : null; return m ? m.schema : null; };
  const params = (o) => [...o.pathParams, ...((o.op.parameters || []).map((x) => deref(doc, x)).filter(Boolean))].filter((p) => p.in === 'path' || p.in === 'query');
  const name = (o) => o.op.operationId || camel(`${o.method} ${o.path.replace(/[{}]/g, '')}`);
  const required = (o) => { const s = deref(doc, resSchema(o)); return s && Array.isArray(s.required) ? s.required : []; };

  if (stack === 'dotnet') {
    for (const [n, s0] of Object.entries(schemas)) {
      const s = deref(doc, s0) || {};
      const req = new Set(s.required || []);
      const props = Object.entries(s.properties || {}).map(([k, v]) => `    public ${typeIn('dotnet', doc, v, !req.has(k))} ${pascal(k)} { get; init; }${typeIn('dotnet', doc, v) === 'string' && req.has(k) ? ' = string.Empty;' : ''}`);
      files[`src/Models/${pascal(n)}.cs`] = `// DTO generated from components.schemas.${n}. Review before use.\nnamespace Api.Models;\n\npublic record ${pascal(n)}\n{\n${props.join('\n')}\n}\n`;
    }
    for (const [g, list] of Object.entries(groups)) {
      const actions = list.map((o) => {
        const args = params(o).map((p) => `[From${p.in === 'path' ? 'Route' : 'Query'}] ${typeIn('dotnet', doc, p.schema)} ${camel(p.name)}`);
        const b = bodyRef(o); if (b) args.push(`[FromBody] ${typeIn('dotnet', doc, b)} body`);
        const rt = resSchema(o) ? typeIn('dotnet', doc, resSchema(o)) : null;
        return `    /// <summary>${o.op.summary || name(o)}</summary>\n    /// <remarks>Traces to: ${trace(o)}</remarks>\n    [Http${pascal(o.method.toLowerCase())}("${o.path.replace(/^\//, '')}")]\n    [ProducesResponseType(${success(o)})]\n    public ActionResult${rt ? `<${rt}>` : ''} ${pascal(name(o))}(${args.join(', ')})\n    {\n        // TODO: implement. See the mock response in mock/${name(o)}.${success(o)}.json\n        return StatusCode(501);\n    }`;
      });
      files[`src/Controllers/${g}Controller.cs`] = `// Controller stubs generated from the OpenAPI spec. Every action returns 501 until implemented.\nusing Api.Models;\nusing Microsoft.AspNetCore.Mvc;\n\nnamespace Api.Controllers;\n\n[ApiController]\n[Route("")]\npublic class ${g}Controller : ControllerBase\n{\n${actions.join('\n\n')}\n}\n`;
      const tests = list.map((o) => `    [Fact(Skip = "Enable when ${name(o)} is implemented")]\n    // Traces to: ${trace(o)}\n    public async Task ${pascal(name(o))}_returns_${success(o)}()\n    {\n        using var client = new HttpClient { BaseAddress = new Uri(Environment.GetEnvironmentVariable("API_BASE_URL") ?? "http://localhost") };\n        var response = await client.SendAsync(new HttpRequestMessage(HttpMethod.${pascal(o.method.toLowerCase())}, "${o.path.replace(/^\//, '').replace(/\{[^}]+\}/g, 'TEST-ID')}"));\n        Assert.Equal(${success(o)}, (int)response.StatusCode);${required(o).length ? `\n        var json = await response.Content.ReadAsStringAsync();\n${required(o).map((k) => `        Assert.Contains("\\"${k}\\"", json);`).join('\n')}` : ''}\n    }`);
      files[`tests/${g}ContractTests.cs`] = `// Contract tests generated from the OpenAPI spec: status codes and required fields. Point API_BASE_URL at a test environment.\nusing Xunit;\n\nnamespace Api.Tests;\n\npublic class ${g}ContractTests\n{\n${tests.join('\n\n')}\n}\n`;
    }
  } else if (stack === 'node') {
    const typedefs = Object.entries(schemas).map(([n, s0]) => { const s = deref(doc, s0) || {}; const req = new Set(s.required || []); return `/**\n * ${pascal(n)} (components.schemas.${n})\n * @typedef {object} ${pascal(n)}\n${Object.entries(s.properties || {}).map(([k, v]) => ` * @property {${typeIn('node', doc, v)}} ${req.has(k) ? k : `[${k}]`}`).join('\n')}\n */`; });
    files['src/models.js'] = `// DTO type definitions generated from components.schemas. Review before use.\n\n${typedefs.join('\n\n')}\n\nmodule.exports = {};\n`;
    for (const [g, list] of Object.entries(groups)) {
      const routes = list.map((o) => `// ${o.op.summary || name(o)}\n// Traces to: ${trace(o)}\nrouter.${o.method.toLowerCase()}('${o.path.replace(/\{([^}]+)\}/g, ':$1')}', (req, res) => {\n  // TODO: implement. See the mock response in mock/${name(o)}.${success(o)}.json\n  res.status(501).json({ title: 'Not implemented', status: 501 });\n});`);
      files[`src/routes/${camel(g)}.js`] = `// Route stubs generated from the OpenAPI spec. Every route returns 501 until implemented.\nconst express = require('express');\n\nconst router = express.Router();\n\n${routes.join('\n\n')}\n\nmodule.exports = router;\n`;
      const tests = list.map((o) => `// Traces to: ${trace(o)}\ntest('${name(o)} returns ${success(o)}', { skip: 'enable when implemented' }, async () => {\n  const res = await fetch(\`\${BASE}${o.path.replace(/\{[^}]+\}/g, 'TEST-ID')}\`, { method: '${o.method}' });\n  assert.equal(res.status, ${success(o)});${required(o).length ? `\n  const body = await res.json();\n${required(o).map((k) => `  assert.ok('${k}' in body);`).join('\n')}` : ''}\n});`);
      files[`test/${camel(g)}.contract.test.js`] = `// Contract tests generated from the OpenAPI spec: status codes and required fields. Point API_BASE_URL at a test environment.\nconst test = require('node:test');\nconst assert = require('node:assert/strict');\n\nconst BASE = process.env.API_BASE_URL || 'http://localhost';\n\n${tests.join('\n\n')}\n`;
    }
  } else {
    const models = Object.entries(schemas).map(([n, s0]) => { const s = deref(doc, s0) || {}; const req = new Set(s.required || []); const props = Object.entries(s.properties || {}).map(([k, v]) => `    ${k}: ${req.has(k) ? typeIn('python', doc, v) : `Optional[${typeIn('python', doc, v)}] = None`}`); return `class ${pascal(n)}(BaseModel):\n    """components.schemas.${n}"""\n${props.join('\n') || '    pass'}`; });
    files['app/models.py'] = `# DTOs generated from components.schemas. Review before use.\nfrom __future__ import annotations\n\nfrom datetime import date, datetime\nfrom typing import List, Optional\n\nfrom pydantic import BaseModel\n\n\n${models.join('\n\n\n')}\n`;
    for (const [g, list] of Object.entries(groups)) {
      const routes = list.map((o) => { const args = params(o).map((p) => `${p.name.replace(/\W/g, '_')}: ${typeIn('python', doc, p.schema)}`); const b = bodyRef(o); if (b) args.push(`body: ${typeIn('python', doc, b)}`); return `@router.${o.method.toLowerCase()}("${o.path}", status_code=${success(o)})\ndef ${name(o).replace(/\W/g, '_')}(${args.join(', ')}):\n    """${o.op.summary || name(o)}\n\n    Traces to: ${trace(o)}\n    """\n    # TODO: implement. See the mock response in mock/${name(o)}.${success(o)}.json\n    raise HTTPException(status_code=501, detail="Not implemented")`; });
      files[`app/routers/${camel(g)}.py`] = `# Route stubs generated from the OpenAPI spec. Every route returns 501 until implemented.\nfrom fastapi import APIRouter, HTTPException\n\nfrom app.models import *  # noqa: F401,F403\n\nrouter = APIRouter()\n\n\n${routes.join('\n\n\n')}\n`;
      const tests = list.map((o) => `# Traces to: ${trace(o)}\n@pytest.mark.skip(reason="enable when implemented")\ndef test_${name(o).replace(/\W/g, '_')}_returns_${success(o)}():\n    res = requests.request("${o.method}", f"{BASE}${o.path.replace(/\{[^}]+\}/g, 'TEST-ID')}")\n    assert res.status_code == ${success(o)}${required(o).length ? `\n    body = res.json()\n${required(o).map((k) => `    assert "${k}" in body`).join('\n')}` : ''}`);
      files[`tests/test_${camel(g)}_contract.py`] = `# Contract tests generated from the OpenAPI spec: status codes and required fields. Point API_BASE_URL at a test environment.\nimport os\n\nimport pytest\nimport requests\n\nBASE = os.environ.get("API_BASE_URL", "http://localhost")\n\n\n${tests.join('\n\n\n')}\n`;
    }
  }
  return files;
}

/**
 * Generate a static mock and scaffolding from a spec with no validation errors. opts: { stack (dotnet|node|python),
 * stackText (e.g. the Solution Blueprint, to find the stack in), outDir, standards, rules, root }. Writes under outDir (default "API/<title>"): mock/ (one example response per
 * operation and status, plus index.json), the stack's controller stubs, DTOs and contract tests, and README.md.
 * Never overwrites. Returns { saved, refused (validation errors when nothing was written), operations, stack }.
 */
function generateScaffold(file, opts = {}) {
  const v = validateOpenApi(file, { standards: opts.standards, rules: opts.rules, root: opts.root });
  if (!v.valid) return { written: false, saved: [], refused: v.errors, summary: `Nothing was generated: the spec has ${plural(v.errors.length, 'error')}. Fix them (validate_openapi) and try again.` };
  const named = STACKS[opts.stack] ? opts.stack : stackFrom(opts.stack) || stackFrom(opts.stackText);
  const stack = named || 'dotnet';
  const stackNote = named ? '' : 'No stack was named (stack, or a Solution Blueprint that names one), so C# / ASP.NET Core was used.';
  const { doc } = parseSpecText(fs.readFileSync(file, 'utf8'), path.basename(file));
  let dir = opts.outDir || path.join(path.dirname(file), 'API', String(doc.info.title || path.basename(file, path.extname(file))).replace(/[\\/:*?"<>|]+/g, '-').trim());
  // A folder that already has files gets a numbered sibling, so an earlier run is never overwritten or mixed in.
  if (fs.existsSync(dir) && fs.readdirSync(dir).length) { const base = dir; for (let i = 2; fs.existsSync(dir) && fs.readdirSync(dir).length; i++) dir = `${base} (${i})`; }
  const ops = [];
  for (const [p, item0] of Object.entries(doc.paths || {})) {
    const item = deref(doc, item0) || {};
    const pathParams = (item.parameters || []).map((x) => deref(doc, x)).filter(Boolean);
    for (const method of METHODS) if (isObj(item[method])) {
      const op = item[method]; const t = op['x-traces-to'];
      ops.push({ method: method.toUpperCase(), path: p, op, pathParams, tags: op.tags || [], tracesTo: (Array.isArray(t) ? t : typeof t === 'string' ? t.split(/[,;\s]+/) : []).map(String).filter(Boolean) });
    }
  }
  const files = {};
  const index = [];
  for (const o of ops) {
    const id = o.op.operationId || camel(`${o.method} ${o.path.replace(/[{}]/g, '')}`);
    for (const [code, r0] of Object.entries(o.op.responses || {})) {
      const r = deref(doc, r0) || {};
      const m = isObj(r.content) ? r.content['application/json'] || Object.values(r.content)[0] : null;
      const body = m ? mediaExample(doc, m, '') : null;
      const f = `mock/${id}.${code}.json`;
      files[f] = `${JSON.stringify({ request: { method: o.method, path: o.path }, response: { status: /^\d+$/.test(code) ? +code : code, description: r.description || '', body } }, null, 2)}\n`;
      index.push({ operationId: id, method: o.method, path: o.path, status: code, file: f, tracesTo: o.tracesTo });
    }
  }
  files['mock/index.json'] = `${JSON.stringify({ api: doc.info.title, version: doc.info.version, note: 'Static example responses for front-end and contract work. Lumen does not run a mock server.', responses: index }, null, 2)}\n`;
  Object.assign(files, scaffoldFiles(doc, stack, ops));
  const list = Object.keys(files);
  files['README.md'] = `# ${doc.info.title} ${doc.info.version}: generated scaffolding (draft)\n\nGenerated by Lumen from \`${v.file}\` for ${STACKS[stack].name}. Review every file before use. Nothing here has been run.\n\n| Operation | Traces to | Mock |\n|---|---|---|\n${ops.map((o) => { const id = o.op.operationId || ''; return `| ${o.method} ${o.path} | ${o.tracesTo.join(', ') || 'none'} | ${index.filter((x) => x.operationId === (id || x.operationId) && x.path === o.path && x.method === o.method).map((x) => x.status).join(', ')} |`; }).join('\n')}\n\n## Files\n${list.map((f) => `- \`${f}\``).join('\n')}\n\nThe contract tests are skipped until each operation is implemented. Set API_BASE_URL to a test environment to run them.\n`;
  const saved = [];
  for (const [f, text] of Object.entries(files)) {
    const target = freeName(path.join(dir, ...f.split('/')));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, text);
    saved.push(opts.root ? rel(opts.root, target) : target);
  }
  return { written: true, stack, stackName: STACKS[stack].name, folder: opts.root ? rel(opts.root, dir) : dir, saved, operations: ops.map((o) => ({ method: o.method, path: o.path, operationId: o.op.operationId || '', tracesTo: o.tracesTo })), warnings: v.warnings, ...(stackNote ? { stackNote } : {}), summary: `Generated a static mock (${plural(index.length, 'example response')}) and ${STACKS[stack].name} scaffolding for ${plural(ops.length, 'operation')} in ${opts.root ? rel(opts.root, dir) : dir}.` };
}

module.exports = {
  parseYaml, toYaml, parseSpecText, jsonPath, parseStandards, readStandards, validateSpec, validateOpenApi,
  ICD_SECTIONS, icdCompleteness, checkIcd, sectionsOf, schemasFromModel, writeOpenApi, exampleFor, generateScaffold, stackFrom, STACKS,
};
