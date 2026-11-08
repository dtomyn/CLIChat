// Data engineering (UC 13, 14, 15, 18). No AI here, and no connection to Fabric: the code works on extracts and schemas
// saved in the notebook, does the counting and matching, and writes code a data engineer runs in a lower environment.
//
// 1. readSchema: SQL DDL (CREATE TABLE), JSON Schema, or a data dictionary / data model workbook →
//    { entities: [{ entity, fields: [{ name, type, family, nullable, description, rules }] }] }. Shared with Plan 12
//    (interface schemas) and governance.js (data model check).
// 2. compareSchemas: exact, normalized (case/underscore) and fuzzy name matches with a type compatibility check, plus
//    the unmatched fields on both sides.
// 3. profileTable: profile a CSV/XLSX sample (up to 200,000 rows): type, nulls, distinct values, min/max, top values,
//    pattern classes, outliers, and data dictionary rules (required, allowed values, pattern, unique, type, length,
//    foreign key into another file). Only aggregates and at most 5 example values per finding leave the tool, and
//    values in columns that look personal (email, phone, name, birth date…) are masked.
// 4. writeSttm / readSttm: the source-to-target mapping workbook (Draft rows only; a person sets Approved).
// 5. generatePipelineCode: PySpark notebook, Spark SQL, Data Factory pipeline JSON, unit tests and a reconciliation
//    query for the APPROVED STTM rows only. Rows that are not approved are refused and listed.

const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const excel = require('./excel');
const { readSheet } = require('./release');

const cellText = excel.cellText;
const friendly = (msg) => Object.assign(new Error(msg), { friendly: true });
const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
const NEEDS_INPUT = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8CBAD' } };
const MAX_ROWS = 200000;
const EXAMPLES = 5;
const plural = (n, w, many = `${w}s`) => `${n} ${n === 1 ? w : many}`;
const text = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? '').trim());
const rel = (root, f) => (root ? path.relative(root, f).split(path.sep).join('/') : path.basename(f));
const colLetter = (n) => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
const yes = (v) => /^(y|yes|true|1|x|required|mandatory|not null|pk|primary key)$/i.test(text(v));
const no = (v) => /^(n|no|false|0|optional|nullable|null)$/i.test(text(v));

function freeName(file) {
  if (!fs.existsSync(file)) return file;
  const ext = path.extname(file), stem = file.slice(0, -ext.length);
  for (let i = 2; ; i++) { const f = `${stem} (${i})${ext}`; if (!fs.existsSync(f)) return f; }
}
function styleHeader(ws, widths) {
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).fill = HEADER_FILL;
  ws.getRow(1).alignment = { vertical: 'top', wrapText: true };
  (widths || []).forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

// ------------------------------------------------------------------ names and types
/** Words in a field name: "SUBMIT_DT" → ["submit", "date"], "applicationId" → ["application", "id"]. */
const ABBREV = {
  no: 'number', num: 'number', nbr: 'number', nr: 'number', dt: 'date', dte: 'date', ts: 'timestamp', tm: 'time', cd: 'code', desc: 'description', descr: 'description',
  amt: 'amount', qty: 'quantity', addr: 'address', txt: 'text', ind: 'indicator', flg: 'flag', cnt: 'count', pct: 'percent', prov: 'province', st: 'status', stat: 'status',
  app: 'application', appl: 'application', cli: 'client', cust: 'customer', upd: 'updated', update: 'updated', created: 'created', crt: 'created', dob: 'birthdate', fname: 'firstname',
  lname: 'lastname', tel: 'phone', ph: 'phone', id: 'id', ident: 'id', identifier: 'id', ref: 'reference', yr: 'year', mth: 'month', lang: 'language', typ: 'type', email: 'email',
  submitted: 'submit', submission: 'submit', last: 'last', on: 'date', at: 'timestamp',
};
function words(name) {
  return String(name || '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).map((w) => ABBREV[w] || w);
}
const normName = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const bigrams = (s) => { const out = []; for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2)); return out; };
function dice(a, b) {
  const A = bigrams(a), B = bigrams(b);
  if (!A.length || !B.length) return a === b ? 1 : 0;
  const m = new Map(); for (const x of A) m.set(x, (m.get(x) || 0) + 1);
  let inter = 0; for (const x of B) if (m.get(x) > 0) { inter++; m.set(x, m.get(x) - 1); }
  return (2 * inter) / (A.length + B.length);
}
/** How alike two field names are, 0 to 1, after expanding abbreviations (SUBMIT_DT ~ submittedOn). */
function nameSimilarity(a, b) {
  const A = words(a), B = words(b);
  if (!A.length || !B.length) return 0;
  const SA = new Set(A), SB = new Set(B);
  let inter = 0; for (const w of SA) if (SB.has(w)) inter++;
  const jac = inter / (SA.size + SB.size - inter);
  return Math.max(jac, dice(A.join(''), B.join('')) * 0.9);
}

/** Type family of a declared type: string, integer, decimal, date, timestamp, boolean, binary or unknown. */
function typeFamily(t) {
  const s = String(t || '').toLowerCase().trim();
  if (!s) return 'unknown';
  if (/^(n?var)?char|text|string|clob|uuid|uniqueidentifier|code|enum|xml|json/.test(s)) return 'string';
  if (/^(tiny|small|big)?int|integer|long|short|^serial|^number\s*\(\s*\d+\s*\)$|^number\s*\(\s*\d+\s*,\s*0\s*\)$/.test(s)) return 'integer';
  if (/decimal|numeric|number|float|double|real|money|currency|amount/.test(s)) return 'decimal';
  if (/timestamp|datetime|date-time|date time/.test(s)) return 'timestamp';
  if (/^date|^time$/.test(s)) return 'date';
  if (/bool|bit|flag|indicator|yes.?no/.test(s)) return 'boolean';
  if (/binary|blob|bytes|image/.test(s)) return 'binary';
  return 'unknown';
}
const sizeOf = (t) => { const m = /\(\s*(\d+)(?:\s*,\s*(\d+))?\s*\)/.exec(String(t || '')); return m ? { length: +m[1], scale: m[2] != null ? +m[2] : null } : null; };
/** Can a source type load into a target type? { status: compatible | widening | narrowing | conversion | incompatible | unknown, note }. */
function typeCompatibility(src, tgt) {
  const a = typeFamily(src), b = typeFamily(tgt);
  if (a === 'unknown' || b === 'unknown') return { status: 'unknown', note: 'Type not known on one side' };
  if (a === b) {
    const sa = sizeOf(src), sb = sizeOf(tgt);
    if (sa && sb && sb.length < sa.length) return { status: 'narrowing', note: `${src} → ${tgt} may truncate` };
    return { status: 'compatible', note: '' };
  }
  if (a === 'integer' && b === 'decimal') return { status: 'widening', note: 'Whole numbers into a decimal' };
  if (a === 'date' && b === 'timestamp') return { status: 'widening', note: 'Date into a timestamp (midnight)' };
  if (a === 'decimal' && b === 'integer') return { status: 'narrowing', note: 'Decimals would be rounded or cut' };
  if (a === 'timestamp' && b === 'date') return { status: 'narrowing', note: 'The time of day is dropped' };
  if (b === 'string') return { status: 'conversion', note: `${a} stored as text` };
  if (a === 'string') return { status: 'conversion', note: `Text must be parsed into ${b}; bad values will fail` };
  if (a === 'boolean' && b === 'integer') return { status: 'conversion', note: 'Boolean stored as 0/1' };
  return { status: 'incompatible', note: `${a} cannot load into ${b}` };
}

// ------------------------------------------------------------------ 1. readSchema
function field(name, type, extra = {}) {
  return { name: String(name).trim(), type: type || '', family: typeFamily(type), nullable: extra.nullable !== false, description: extra.description || '', rules: extra.rules || {}, ...(extra.at ? { at: extra.at } : {}) };
}

/** Split on commas that are not inside brackets or quotes; "-- comments" attach to the definition they follow. */
function splitDefinitions(body) {
  const parts = [{ text: '', comment: '' }];
  let depth = 0, quote = null, sinceComma = false;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (quote) { parts[parts.length - 1].text += c; if (c === quote) quote = null; continue; }
    if (c === '-' && body[i + 1] === '-') {
      const end = body.indexOf('\n', i); const comment = body.slice(i + 2, end < 0 ? body.length : end).trim();
      const cur = parts[parts.length - 1];
      const target = !cur.text.trim() && !sinceComma && parts.length > 1 ? parts[parts.length - 2] : cur;
      target.comment = [target.comment, comment].filter(Boolean).join(' ');
      i = end < 0 ? body.length : end - 1; continue;
    }
    if (c === '\n') sinceComma = true;
    if (c === "'" || c === '"' || c === '`') quote = c;
    if (c === '[' && !quote) { const end = body.indexOf(']', i); parts[parts.length - 1].text += body.slice(i, end + 1); i = end; continue; }
    if (c === '(') depth++;
    if (c === ')') depth--;
    if (c === ',' && depth === 0) { parts.push({ text: '', comment: '' }); sinceComma = false; continue; }
    parts[parts.length - 1].text += c;
  }
  return parts.map((p) => ({ text: p.text.trim(), comment: p.comment })).filter((p) => p.text);
}
const unquote = (s) => String(s || '').trim().replace(/^[[`"]|[\]`"]$/g, '');
const lastPart = (s) => unquote(String(s).split('.').map(unquote).pop());

/** CREATE TABLE statements in SQL text. */
function parseDdl(sql) {
  const src = String(sql || '').replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '');
  const entities = [];
  const re = /create\s+(?:or\s+replace\s+)?(?:temporary\s+|external\s+)?table\s+(?:if\s+not\s+exists\s+)?((?:[[`"]?[\w$ -]+?[\]`"]?\.)*[[`"]?[\w$ -]+?[\]`"]?)\s*\(/gi;
  let m;
  while ((m = re.exec(src))) {
    let depth = 1, i = re.lastIndex;
    for (; i < src.length && depth; i++) { if (src[i] === '(') depth++; else if (src[i] === ')') depth--; }
    const body = src.slice(re.lastIndex, i - 1);
    const qualified = m[1].split('.').map(unquote);
    const ent = { entity: qualified[qualified.length - 1], schema: qualified.length > 1 ? qualified.slice(0, -1).join('.') : '', fields: [], primaryKey: [], foreignKeys: [] };
    const line = src.slice(0, m.index).split('\n').length;
    ent.at = `line ${line}`;
    for (const d of splitDefinitions(body)) {
      const t = d.text;
      const pk = /^(?:constraint\s+\S+\s+)?primary\s+key\s*\(([^)]*)\)/i.exec(t);
      if (pk) { ent.primaryKey.push(...pk[1].split(',').map(unquote)); continue; }
      const fk = /^(?:constraint\s+\S+\s+)?foreign\s+key\s*\(([^)]*)\)\s*references\s+([^\s(]+)\s*\(([^)]*)\)/i.exec(t);
      if (fk) { const cols = fk[1].split(',').map(unquote), refs = fk[3].split(',').map(unquote); cols.forEach((c, k) => ent.foreignKeys.push({ field: c, entity: lastPart(fk[2]), references: refs[k] || refs[0] })); continue; }
      if (/^(constraint|unique|check|index|key|period)\b/i.test(t)) {
        const ck = /check\s*\(\s*([[`"]?\w+[\]`"]?)\s+in\s*\(([^)]*)\)\s*\)/i.exec(t);
        if (ck) { const f = ent.fields.find((x) => x.name.toLowerCase() === unquote(ck[1]).toLowerCase()); if (f) f.rules.allowed = ck[2].split(',').map((v) => v.trim().replace(/^'|'$/g, '')); }
        continue;
      }
      const c = /^([[`"][^\]`"]+[\]`"]|\S+)\s+(.*)$/s.exec(t);
      if (!c) continue;
      const rest = c[2];
      const type = ` ${rest}`.replace(/\s+(not\s+null|null|primary\s+key|references|default|check|unique|constraint|comment|identity|generated|collate|auto_increment)\b[\s\S]*$/i, '').trim().replace(/\s+/g, ' ');
      const rules = {};
      const notNull = /\bnot\s+null\b/i.test(rest) || /\bprimary\s+key\b/i.test(rest);
      if (/\bprimary\s+key\b/i.test(rest)) { ent.primaryKey.push(unquote(c[1])); rules.unique = true; }
      if (/\bunique\b/i.test(rest)) rules.unique = true;
      const ref = /\breferences\s+([^\s(]+)\s*\(([^)]*)\)/i.exec(rest);
      if (ref) { rules.references = { entity: lastPart(ref[1]), field: unquote(ref[2].split(',')[0]) }; ent.foreignKeys.push({ field: unquote(c[1]), entity: rules.references.entity, references: rules.references.field }); }
      const ck = /check\s*\(\s*[[`"]?\w+[\]`"]?\s+in\s*\(([^)]*)\)\s*\)/i.exec(rest);
      if (ck) rules.allowed = ck[1].split(',').map((v) => v.trim().replace(/^'|'$/g, ''));
      const size = sizeOf(type); if (size && typeFamily(type) === 'string') rules.maxLength = size.length;
      const comment = /\bcomment\s+'((?:[^']|'')*)'/i.exec(rest);
      if (notNull) rules.required = true;
      ent.fields.push(field(unquote(c[1]), type.toUpperCase(), { nullable: !notNull, description: comment ? comment[1].replace(/''/g, "'") : d.comment, rules }));
    }
    for (const k of ent.primaryKey) { const f = ent.fields.find((x) => x.name.toLowerCase() === k.toLowerCase()); if (f) { f.nullable = false; f.rules.required = true; if (ent.primaryKey.length === 1) f.rules.unique = true; } }
    for (const k of ent.foreignKeys) { const f = ent.fields.find((x) => x.name.toLowerCase() === k.field.toLowerCase()); if (f && !f.rules.references) f.rules.references = { entity: k.entity, field: k.references }; }
    entities.push(ent);
    re.lastIndex = i;
  }
  return entities;
}

/** JSON Schema: the root object and every object under $defs/definitions become entities. */
function parseJsonSchema(doc, fallbackName) {
  const entities = [];
  const typeOf = (p) => {
    if (!p || typeof p !== 'object') return { type: '', nullable: true };
    let t = p.type, nullable = false;
    if (Array.isArray(t)) { nullable = t.includes('null'); t = t.find((x) => x !== 'null'); }
    if (!t && Array.isArray(p.anyOf || p.oneOf)) { const opts = p.anyOf || p.oneOf; nullable = opts.some((o) => o && o.type === 'null'); const o = opts.find((x) => x && x.type !== 'null') || {}; return { ...typeOf(o), nullable }; }
    if (!t && p.$ref) t = `ref:${String(p.$ref).split('/').pop()}`;
    if (!t && p.enum) t = 'string';
    let type = t || '';
    if (t === 'string' && p.format) type = p.format === 'date' ? 'date' : p.format === 'date-time' ? 'timestamp' : `string (${p.format})`;
    if (t === 'number') type = 'decimal';
    if (t === 'integer') type = 'integer';
    if (t === 'array') type = `array of ${typeOf(p.items).type || 'items'}`;
    return { type, nullable };
  };
  const addEntity = (name, s) => {
    if (!s || typeof s !== 'object' || !s.properties) return;
    const required = new Set(s.required || []);
    const fields = Object.entries(s.properties).map(([n, p]) => {
      const { type, nullable } = typeOf(p);
      const rules = {};
      if (required.has(n)) rules.required = true;
      if (Array.isArray(p.enum)) rules.allowed = p.enum.filter((v) => v != null).map(String);
      if (p.pattern) rules.pattern = p.pattern;
      if (p.maxLength) rules.maxLength = p.maxLength;
      if (p['x-references']) { const [e, f] = String(p['x-references']).split('.'); rules.references = { entity: e, field: f }; }
      return field(n, type, { nullable: !required.has(n) || nullable, description: p.description || p.title || '', rules });
    });
    entities.push({ entity: s.title || name, fields, description: s.description || '', ...(s['x-layer'] ? { layer: s['x-layer'] } : {}) });
  };
  addEntity(fallbackName, doc);
  for (const [n, s] of Object.entries(doc.$defs || doc.definitions || {})) addEntity(n, s);
  return entities;
}

const DICTIONARY = {
  entity: [/^(entity|entity name|table|table name|object|dataset|source table)$/i],
  field: [/^(attribute|field|column|attribute name|field name|column name|element)$/i],
  type: [/^(data )?type$|^format$|^datatype$/i],
  required: [/^(required|mandatory|not null|nullable\??|null(s)? allowed|optional)$/i],
  allowed: [/allowed|valid values|^values$|domain|code list/i],
  pattern: [/pattern|regex|regular expression|mask/i],
  unique: [/^(unique|key|primary key|pk|identifier)$/i],
  references: [/^(references?|foreign key|fk|lookup|parent( entity)?|references? \(fk\))$/i],
  maxLength: [/^(max(imum)? )?length$|^size$/i],
  description: [/description|definition|meaning|notes?|rules/i],
  layer: [/^layer$|^zone$/i],
};
const splitList = (s) => text(s).split(/\s*[,;|\n]\s*/).map((v) => v.replace(/^["']|["']$/g, '').trim()).filter(Boolean);

/** Data dictionary or data model workbook: sheets with Entity (+ Field / Attribute) columns, or a Field column alone. */
async function readDictionary(file) {
  const wb = await excel.open(file);
  const byKey = new Map(), order = [];
  const ent = (name, at) => { const k = normName(name); if (!byKey.has(k)) { byKey.set(k, { entity: name, fields: [], at }); order.push(k); } return byKey.get(k); };
  for (const ws of wb.worksheets) {
    if (ws.state === 'veryHidden' || /^(about|summary|notes?|instructions?|read me)$/i.test(ws.name)) continue;
    const one = { worksheets: [ws] };
    const sheet = readSheet(one, DICTIONARY, ['entity']) || readSheet(one, DICTIONARY, ['field']);
    if (!sheet) continue;
    const reqHeader = sheet.map.required ? cellText(ws.getRow(1).getCell(sheet.map.required)).trim() : '';
    const inverted = /nullable|null(s)? allowed|optional/i.test(reqHeader);
    for (const r of sheet.rows) {
      const en = sheet.map.entity ? text(r.entity) : (path.basename(file, path.extname(file)).replace(/^(data dictionary|data model)\s*[-–]\s*/i, '') || ws.name);
      if (!en) continue;
      const e = ent(en, `${ws.name}!${colLetter(sheet.map.entity || sheet.map.field)}${r.row}`);
      if (!sheet.map.field) { if (sheet.map.description && !e.description) e.description = text(r.description); continue; }
      const name = text(r.field);
      if (!name || e.fields.some((f) => f.name.toLowerCase() === name.toLowerCase())) continue;
      const rules = {};
      const req = sheet.map.required ? (inverted ? no(r.required) : yes(r.required)) : false;
      if (req) rules.required = true;
      if (sheet.map.allowed && text(r.allowed)) rules.allowed = splitList(r.allowed);
      if (sheet.map.pattern && text(r.pattern)) rules.pattern = text(r.pattern).replace(/^\/(.*)\/$/, '$1');
      if (sheet.map.unique && yes(r.unique)) rules.unique = true;
      if (sheet.map.maxLength && +text(r.maxLength) > 0) rules.maxLength = +text(r.maxLength);
      if (sheet.map.references && text(r.references)) {
        const ref = text(r.references);
        const m = /^(.+?)\s*(?:>|›|\.|:)\s*([^.>›:]+)$/.exec(ref);
        rules.references = m ? { entity: m[1].trim(), field: m[2].trim() } : { entity: ref, field: name };
      }
      const f = field(name, text(r.type), { nullable: !req, description: text(r.description), rules, at: `${ws.name}!${colLetter(sheet.map.field)}${r.row}` });
      if (rules.maxLength == null && sizeOf(f.type) && f.family === 'string') rules.maxLength = sizeOf(f.type).length;
      if (sheet.map.layer && text(r.layer)) e.layer = text(r.layer);
      e.fields.push(f);
    }
  }
  return order.map((k) => byKey.get(k));
}

/**
 * Read a schema: SQL DDL (.sql/.ddl), JSON Schema (.json), or a data dictionary / data model workbook (.xlsx/.csv).
 * Returns { file, format, entities: [{ entity, fields: [{ name, type, family, nullable, description, rules }] }],
 * entity, fields } where entity/fields are the first entity's, for single-table schemas.
 */
async function readSchema(file) {
  const ext = path.extname(file).toLowerCase();
  const stem = path.basename(file, ext).replace(/\.schema$/i, '');
  let entities, format;
  if (['.sql', '.ddl', '.txt'].includes(ext)) {
    entities = parseDdl(fs.readFileSync(file, 'utf8')); format = 'SQL DDL';
    if (!entities.length) throw friendly(`"${path.basename(file)}" has no CREATE TABLE statement.`);
  } else if (ext === '.json') {
    let doc;
    try { doc = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, '')); } catch (e) { throw friendly(`"${path.basename(file)}" is not valid JSON: ${e.message}`); }
    entities = parseJsonSchema(doc, stem); format = 'JSON Schema';
    if (!entities.length) throw friendly(`"${path.basename(file)}" has no object with "properties", so it isn't a JSON Schema Lumen can read.`);
  } else if (['.xlsx', '.xlsm', '.csv'].includes(ext)) {
    entities = await readDictionary(file); format = 'Data dictionary';
    if (!entities.length) throw friendly(`"${path.basename(file)}" needs a sheet with an "Entity" (or "Table") column and ideally "Field", "Type" and "Required" columns.`);
  } else throw friendly(`"${path.basename(file)}" must be SQL DDL (.sql), a JSON Schema (.json) or a data dictionary workbook (.xlsx/.csv).`);
  return { file, format, entities, entity: entities[0].entity, fields: entities[0].fields, summary: `${plural(entities.length, 'entity', 'entities')}, ${plural(entities.reduce((n, e) => n + e.fields.length, 0), 'field')} (${format}).` };
}
const pickEntity = (schema, name) => {
  if (!name) return null;
  const k = normName(name);
  return schema.entities.find((e) => normName(e.entity) === k) || schema.entities.find((e) => normName(e.entity).includes(k) || k.includes(normName(e.entity))) || null;
};

// ------------------------------------------------------------------ 2. compareSchemas
/**
 * Compare a source schema with a target schema (readSchema results, or files). opts: { sourceEntity, targetEntity,
 * threshold (fuzzy, default 0.55) }. Without an entity, every entity's fields on that side are compared.
 * Returns { matches: [{ source, target, match: exact|normalized|fuzzy, score, type: { status, note } }],
 * unmatchedSource, unmatchedTarget, summary }.
 */
async function compareSchemas(source, target, opts = {}) {
  const s = typeof source === 'string' ? await readSchema(source) : source;
  const t = typeof target === 'string' ? await readSchema(target) : target;
  const side = (schema, name, label) => {
    const ents = name ? [pickEntity(schema, name)].filter(Boolean) : schema.entities;
    if (name && !ents.length) throw friendly(`The ${label} schema has no entity called "${name}". It has: ${schema.entities.map((e) => e.entity).join(', ')}.`);
    return ents.flatMap((e) => e.fields.map((f) => ({ entity: e.entity, field: f.name, type: f.type, family: f.family, nullable: f.nullable, description: f.description })));
  };
  const S = side(s, opts.sourceEntity, 'source'), T = side(t, opts.targetEntity, 'target');
  const threshold = opts.threshold != null ? +opts.threshold : 0.55;
  const usedS = new Set(), usedT = new Set(), matches = [];
  const take = (i, j, match, score) => {
    usedS.add(i); usedT.add(j);
    const type = typeCompatibility(S[i].type, T[j].type);
    const nullNote = S[i].nullable && T[j].nullable === false ? 'Source allows blanks but the target is required' : '';
    matches.push({ source: S[i], target: T[j], match, score: +score.toFixed(2), type: nullNote ? { ...type, note: [type.note, nullNote].filter(Boolean).join('; ') } : type });
  };
  for (const [kind, key] of [['exact', (x) => x.field], ['normalized', (x) => normName(x.field)]]) {
    S.forEach((a, i) => { if (usedS.has(i)) return; const j = T.findIndex((b, k) => !usedT.has(k) && key(a) === key(b)); if (j >= 0) take(i, j, kind, 1); });
  }
  const pairs = [];
  S.forEach((a, i) => { if (usedS.has(i)) return; T.forEach((b, j) => { if (usedT.has(j)) return; const sc = nameSimilarity(a.field, b.field); if (sc >= threshold) pairs.push([sc, i, j]); }); });
  pairs.sort((x, y) => y[0] - x[0]);
  for (const [sc, i, j] of pairs) if (!usedS.has(i) && !usedT.has(j)) take(i, j, 'fuzzy', sc);
  const unmatchedSource = S.filter((_, i) => !usedS.has(i));
  const unmatchedTarget = T.filter((_, j) => !usedT.has(j));
  const typeIssues = matches.filter((m) => ['narrowing', 'conversion', 'incompatible'].includes(m.type.status));
  const count = (k) => matches.filter((m) => m.match === k).length;
  return {
    source: { file: s.file ? path.basename(s.file) : '', format: s.format, entities: [...new Set(S.map((x) => x.entity))] },
    target: { file: t.file ? path.basename(t.file) : '', format: t.format, entities: [...new Set(T.map((x) => x.entity))] },
    matches, unmatchedSource, unmatchedTarget, typeIssues: typeIssues.length,
    summary: `${plural(matches.length, 'field')} matched (${count('exact')} exact, ${count('normalized')} by normalized name, ${count('fuzzy')} fuzzy), ${typeIssues.length} with a type to check; ${unmatchedSource.length} source and ${unmatchedTarget.length} target field${unmatchedTarget.length === 1 ? '' : 's'} unmatched.`,
    note: 'Fuzzy matches are suggestions from the names only. Confirm each one, and write the transformation rule, before the STTM row is approved.',
  };
}

// ------------------------------------------------------------------ 3. profileTable
/** RFC 4180 CSV (quotes, doubled quotes, newlines in quotes). The delimiter is guessed from the header line. */
function parseCsv(textIn, limit = MAX_ROWS + 1) {
  const s = String(textIn || '').replace(/^﻿/, '');
  const head = s.slice(0, s.search(/\r?\n|$/));
  const delim = [',', ';', '\t', '|'].map((d) => [d, head.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = [], lines = []; let row = [], cell = '', q = false, i = 0, truncated = false, line = 1, start = 1;
  for (; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; } else { cell += c; if (c === '\n') line++; } continue; }
    if (c === '"' && cell === '') { q = true; continue; }
    if (c === delim) { row.push(cell); cell = ''; continue; }
    if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(cell); cell = ''; rows.push(row); lines.push(start); row = []; line++; start = line;
      if (rows.length >= limit) { truncated = i < s.length - 1; break; }
      continue;
    }
    cell += c;
  }
  if (!truncated && (cell !== '' || row.length)) { row.push(cell); rows.push(row); lines.push(start); }
  const keep = rows.map((_, k) => k).filter((k) => rows[k].some((v) => v !== ''));
  return { rows: keep.map((k) => rows[k]), lines: keep.map((k) => lines[k]), truncated, delimiter: delim };
}

/** A table as { headers, rows: [[text]], rowNumbers, sheet, truncated }. Row numbers count the header as row 1. */
async function readTable(file, { sheet } = {}) {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.csv' || ext === '.txt' || ext === '.tsv') {
    const p = parseCsv(fs.readFileSync(file, 'utf8'));
    if (!p.rows.length) throw friendly(`"${path.basename(file)}" is empty.`);
    const headers = p.rows[0].map((h, i) => h.trim() || `Column ${i + 1}`);
    return { headers, rows: p.rows.slice(1, MAX_ROWS + 1), rowNumbers: p.lines.slice(1, MAX_ROWS + 1), sheet: null, truncated: p.truncated || p.rows.length > MAX_ROWS + 1 };
  }
  const wb = await excel.open(file);
  const ws = sheet ? wb.getWorksheet(sheet) : wb.worksheets.find((w) => w.state !== 'veryHidden' && w.actualRowCount > 0 && !/^(about|summary|notes?|instructions?|read me)$/i.test(w.name));
  if (!ws) throw friendly(sheet ? `"${path.basename(file)}" has no sheet called "${sheet}".` : `"${path.basename(file)}" has no data.`);
  const headers = [];
  ws.getRow(1).eachCell({ includeEmpty: true }, (c, n) => { headers[n - 1] = cellText(c).trim() || `Column ${n}`; });
  const rows = [], rowNumbers = [];
  let truncated = false;
  ws.eachRow({ includeEmpty: false }, (row, r) => {
    if (r === 1) return;
    if (rows.length >= MAX_ROWS) { truncated = true; return; }
    const vals = headers.map((_, i) => cellText(row.getCell(i + 1)));
    if (vals.every((v) => v === '')) return;
    rows.push(vals); rowNumbers.push(r);
  });
  return { headers, rows, rowNumbers, sheet: ws.name, truncated };
}

const isBlank = (v) => v == null || /^\s*$/.test(v) || /^(null|n\/a|na|none|#n\/a)$/i.test(String(v).trim());
const DAYS_IN = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const validYmd = (y, m, d) => m >= 1 && m <= 12 && d >= 1 && d <= DAYS_IN(y, m) && y >= 1000 && y <= 9999;
/** The kind of a text value: integer, decimal, boolean, date, timestamp, invalid date or text. */
function kindOf(v) {
  const s = String(v).trim();
  if (/^[-+]?\d+$/.test(s) && !(s.length > 1 && s[0] === '0' && !/^[-+]/.test(s))) return 'integer';
  if (/^[-+]?(\d{1,3}(,\d{3})+|\d*)\.\d+$/.test(s) || /^[-+]?\d{1,3}(,\d{3})+$/.test(s) || /^[-+]?\d+(\.\d+)?e[-+]?\d+$/i.test(s)) return 'decimal';
  if (/^(true|false|yes|no|y|n)$/i.test(s)) return 'boolean';
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/.exec(s);
  if (m) {
    if (!validYmd(+m[1], +m[2], +m[3])) return 'invalid date';
    if (m[4] != null && (+m[4] > 23 || +m[5] > 59 || (m[6] != null && +m[6] > 59))) return 'invalid date';
    return m[4] != null ? 'timestamp' : 'date';
  }
  m = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/.exec(s);
  if (m) return validYmd(+m[3], +m[2], +m[1]) || validYmd(+m[3], +m[1], +m[2]) ? 'date' : 'invalid date';
  m = /^(\d{4})[/.](\d{1,2})[/.](\d{1,2})$/.exec(s);
  if (m) return validYmd(+m[1], +m[2], +m[3]) ? 'date' : 'invalid date';
  return 'text';
}
const numeric = (v) => +String(v).replace(/,/g, '');
/** "AP-0012345" → "AA-9999999". Letters A, digits 9, everything else as is. */
const patternOf = (v) => String(v).replace(/[A-Za-z]/g, 'A').replace(/\d/g, '9');
const PII_HEADER = /e-?mail|phone|mobile|tel\b|first.?name|last.?name|surname|given.?name|full.?name|^name$|birth|dob|\bsin\b|ssn|uci|passport|address|street|postal|zip|ip.?addr|account.?(no|num)|card/i;
const looksPersonal = (header, values) => PII_HEADER.test(header) || words(header).some((w) => ['email', 'phone', 'birthdate', 'firstname', 'lastname', 'address'].includes(w)) || (values.length && values.filter((v) => /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(v)).length / values.length > 0.5);
const mask = (v) => { const s = String(v); return s.length <= 2 ? '**' : `${s[0]}${'*'.repeat(Math.min(6, s.length - 2))}${s[s.length - 1]}`; };
const quantile = (sorted, q) => { const p = (sorted.length - 1) * q, b = Math.floor(p); return sorted[b] + (sorted[Math.min(b + 1, sorted.length - 1)] - sorted[b]) * (p - b); };

/** Which declared type family a column must meet, from the dictionary type. */
function conforms(family, kind) {
  if (family === 'integer') return kind === 'integer';
  if (family === 'decimal') return kind === 'integer' || kind === 'decimal';
  if (family === 'date') return kind === 'date';
  if (family === 'timestamp') return kind === 'timestamp' || kind === 'date';
  if (family === 'boolean') return kind === 'boolean' || (kind === 'integer');
  return true;
}

/** Find the file a foreign key points at: given explicitly, a file named after the entity next to the table, or by its own name. */
function lookupFile(ref, file, lookups = {}) {
  const k = normName(ref.entity);
  for (const [name, f] of Object.entries(lookups || {})) if (normName(name) === k || normName(path.basename(f, path.extname(f))).includes(k)) return f;
  const dir = path.dirname(file);
  const direct = path.resolve(dir, ref.entity);
  if (fs.existsSync(direct) && fs.statSync(direct).isFile()) return direct;
  const cands = fs.readdirSync(dir).filter((n) => /\.(csv|xlsx|xlsm)$/i.test(n) && path.resolve(dir, n) !== path.resolve(file));
  const hit = cands.find((n) => normName(path.basename(n, path.extname(n))).startsWith(k)) || cands.find((n) => normName(n).includes(k)) || cands.find((n) => normName(n).includes(k.replace(/s$/, '')));
  return hit ? path.join(dir, hit) : null;
}

/** Choose the dictionary entity for a table: by name in opts.entity or the file name, else the one sharing most columns. */
function dictionaryEntity(dict, headers, file, name) {
  if (!dict) return null;
  if (name) { const e = pickEntity(dict, name); if (e) return e; }
  const stem = normName(path.basename(file, path.extname(file)));
  const byName = dict.entities.filter((e) => e.fields.length && stem.includes(normName(e.entity))).sort((a, b) => b.entity.length - a.entity.length)[0];
  if (byName) return byName;
  const H = new Set(headers.map((h) => h.toLowerCase()));
  const best = dict.entities.map((e) => [e, e.fields.filter((f) => H.has(f.name.toLowerCase())).length]).sort((a, b) => b[1] - a[1])[0];
  return best && best[1] ? best[0] : null;
}

/**
 * Profile a CSV/XLSX sample. opts: { sheet, dictionary (file or readSchema result), entity (dictionary entity name),
 * lookups: { entity: file } for foreign keys, maxRows, scripts: true to add PySpark/SQL profiling scripts, table
 * (Fabric table name for the scripts), root }. Returns per-column aggregates and rule findings with example rows.
 */
async function profileTable(file, opts = {}) {
  const t = await readTable(file, { sheet: opts.sheet });
  const cap = Math.min(MAX_ROWS, opts.maxRows ? +opts.maxRows : MAX_ROWS);
  const truncated = t.truncated || t.rows.length > cap;
  const rows = t.rows.slice(0, cap);
  const rowNo = (i) => (t.rowNumbers ? t.rowNumbers[i] : i + 2);
  const dict = opts.dictionary ? (typeof opts.dictionary === 'string' ? await readSchema(opts.dictionary) : opts.dictionary) : null;
  const ent = dictionaryEntity(dict, t.headers, file, opts.entity);
  const findings = [], warnings = [];
  if (dict && !ent) warnings.push(`No entity in the data dictionary matches "${path.basename(file)}", so no dictionary rules were checked. Pass the entity name.`);
  const personal = new Set();
  const add = (f) => { f.examples = (f.examples || []).slice(0, EXAMPLES); if (personal.has(f.column)) f.examples = f.examples.map((e) => ({ ...e, ...(e.value != null ? { value: mask(e.value) } : {}) })); findings.push(f); };

  const columns = t.headers.map((h, ci) => {
    const vals = rows.map((r) => (r[ci] ?? '').trim());
    const filled = vals.map((v, i) => [v, i]).filter(([v]) => !isBlank(v));
    if (looksPersonal(h, filled.slice(0, 200).map(([v]) => v))) personal.add(h);
    const kinds = {};
    for (const [v] of filled) { const k = kindOf(v); kinds[k] = (kinds[k] || 0) + 1; }
    const merged = { ...kinds };
    if (merged.integer && merged.decimal) { merged.decimal += merged.integer; delete merged.integer; }
    if (merged.date && merged.timestamp) { merged.timestamp += merged.date; delete merged.date; }
    const dateish = (merged.date || 0) + (merged.timestamp || 0) + (merged['invalid date'] || 0);
    let inferred = Object.entries(merged).filter(([k]) => k !== 'invalid date').sort((a, b) => b[1] - a[1])[0]?.[0] || 'empty';
    if (dateish && dateish / filled.length >= 0.8) inferred = merged.timestamp ? 'timestamp' : 'date';
    const share = filled.length ? Math.max(...Object.values(merged).concat(dateish)) / filled.length : 0;
    if (filled.length && share < 0.8 && inferred !== 'text') inferred = 'mixed';
    const counts = new Map();
    for (const [v] of filled) counts.set(v, (counts.get(v) || 0) + 1);
    const top = [...counts].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))).slice(0, 5);
    const pats = new Map();
    const maxLen = filled.reduce((m, [v]) => Math.max(m, v.length), 0);
    if (maxLen <= 40) for (const [v] of filled) { const p = patternOf(v); pats.set(p, (pats.get(p) || 0) + 1); }
    const col = {
      name: h, column: colLetter(ci + 1), inferredType: inferred, rows: vals.length, nulls: vals.length - filled.length,
      nullPct: vals.length ? +(100 * (vals.length - filled.length) / vals.length).toFixed(1) : 0, distinct: counts.size,
      ...(personal.has(h) ? { personal: true } : {}),
      topValues: personal.has(h) ? [] : top.map(([value, count]) => ({ value, count })),
      patterns: pats.size ? [...pats].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([pattern, count]) => ({ pattern, count })) : [],
      length: filled.length ? { min: filled.reduce((m, [v]) => Math.min(m, v.length), Infinity), max: maxLen } : null,
    };
    if (counts.size === filled.length && filled.length === vals.length && vals.length > 1) col.unique = true;
    // min / max
    if (['integer', 'decimal'].includes(inferred)) {
      const nums = filled.filter(([v]) => ['integer', 'decimal'].includes(kindOf(v))).map(([v, i]) => [numeric(v), i]);
      const sorted = nums.map((n) => n[0]).sort((a, b) => a - b);
      if (sorted.length) { col.min = sorted[0]; col.max = sorted[sorted.length - 1]; col.mean = +(sorted.reduce((s, x) => s + x, 0) / sorted.length).toFixed(2); }
      if (sorted.length >= 10) {
        const q1 = quantile(sorted, 0.25), q3 = quantile(sorted, 0.75), iqr = q3 - q1;
        const lo = q1 - 3 * iqr, hi = q3 + 3 * iqr;
        const out = iqr > 0 ? nums.filter(([n]) => n < lo || n > hi) : [];
        if (out.length) { col.outliers = out.length; add({ column: h, rule: 'outlier', severity: 'Medium', count: out.length, message: `${plural(out.length, 'value')} far outside the usual range (${+lo.toFixed(2)} to ${+hi.toFixed(2)}).`, examples: out.map(([n, i]) => ({ row: rowNo(i), value: String(vals[i]) })) }); }
      }
    } else if (['date', 'timestamp'].includes(inferred)) {
      const ds = filled.filter(([v]) => ['date', 'timestamp'].includes(kindOf(v))).map(([v]) => v).sort();
      if (ds.length) { col.min = ds[0]; col.max = ds[ds.length - 1]; }
    } else if (filled.length) {
      const ss = filled.map(([v]) => v).sort();
      if (!personal.has(h)) { col.min = ss[0]; col.max = ss[ss.length - 1]; }
    }
    // Values that don't fit the column's type, when no dictionary type says otherwise.
    const declared = ent && ent.fields.find((f) => f.name.toLowerCase() === h.toLowerCase());
    if (!(declared && declared.family !== 'unknown') && ['integer', 'decimal', 'date', 'timestamp'].includes(inferred)) {
      const bad = filled.filter(([v]) => !conforms(inferred, kindOf(v)));
      if (bad.length) add({ column: h, rule: 'type', severity: inferred === 'date' || inferred === 'timestamp' ? 'High' : 'Medium', count: bad.length, message: `${plural(bad.length, 'value')} ${bad.length === 1 ? 'is' : 'are'} not a valid ${inferred} (the column is otherwise ${inferred}).`, examples: bad.map(([v, i]) => ({ row: rowNo(i), value: v })) });
    }
    return col;
  });

  // Dictionary rules
  let dictionary = null;
  if (ent) {
    const idx = (n) => t.headers.findIndex((h) => h.toLowerCase() === String(n).toLowerCase());
    const missing = ent.fields.filter((f) => idx(f.name) < 0).map((f) => f.name);
    const undocumented = t.headers.filter((h) => !ent.fields.some((f) => f.name.toLowerCase() === h.toLowerCase()));
    for (const m of missing) add({ column: m, rule: 'missing column', severity: ent.fields.find((f) => f.name === m).rules.required ? 'High' : 'Low', count: 1, message: `The dictionary lists "${m}" but the file has no such column.`, examples: [] });
    for (const u of undocumented) add({ column: u, rule: 'undocumented column', severity: 'Low', count: 1, message: `"${u}" is not in the data dictionary.`, examples: [] });
    for (const f of ent.fields) {
      const ci = idx(f.name);
      if (ci < 0) continue;
      const vals = rows.map((r, i) => [(r[ci] ?? '').trim(), i]);
      const filled = vals.filter(([v]) => !isBlank(v));
      const r = f.rules || {};
      const flag = (rule, list, message, severity = 'High') => { if (list.length) add({ column: f.name, rule, severity, count: list.length, message: message(list.length), examples: list.map(([v, i]) => ({ row: rowNo(i), value: v })) }); };
      if (r.required) flag('required', vals.filter(([v]) => isBlank(v)).map(([, i]) => ['', i]), (n) => `${plural(n, 'row')} ${n === 1 ? 'has' : 'have'} no value, but the dictionary says it is required.`);
      if (f.family !== 'unknown' && f.family !== 'string') flag('type', filled.filter(([v]) => !conforms(f.family, kindOf(v))), (n) => `${plural(n, 'value')} ${n === 1 ? 'is' : 'are'} not a valid ${f.family} (dictionary type ${f.type}).`);
      if (r.allowed && r.allowed.length) { const ok = new Set(r.allowed.map((a) => a.toLowerCase())); flag('allowed values', filled.filter(([v]) => !ok.has(v.toLowerCase())), (n) => `${plural(n, 'value')} ${n === 1 ? 'is' : 'are'} not in the allowed list (${r.allowed.slice(0, 10).join(', ')}).`); }
      if (r.pattern) {
        let re = null; try { re = new RegExp(`^(?:${r.pattern})$`); } catch { warnings.push(`The pattern for ${f.name} is not a valid regular expression: ${r.pattern}`); }
        if (re) flag('pattern', filled.filter(([v]) => !re.test(v)), (n) => `${plural(n, 'value')} ${n === 1 ? 'does' : 'do'} not match the pattern ${r.pattern}.`, 'Medium');
      }
      if (r.maxLength) flag('length', filled.filter(([v]) => v.length > r.maxLength), (n) => `${plural(n, 'value')} ${n === 1 ? 'is' : 'are'} longer than ${r.maxLength} characters.`, 'Medium');
      if (r.unique) {
        const seen = new Map(), dup = [];
        for (const [v, i] of filled) { if (seen.has(v)) dup.push([v, i]); else seen.set(v, i); }
        flag('unique', dup, (n) => `${plural(n, 'row')} repeat${n === 1 ? 's' : ''} a value that must be unique.`);
      }
      if (r.references) {
        const lf = lookupFile(r.references, file, opts.lookups);
        if (!lf) { warnings.push(`${f.name} references ${r.references.entity}.${r.references.field}, but no file for ${r.references.entity} was found next to the table, so the foreign key was not checked.`); continue; }
        const lt = await readTable(lf);
        const li = lt.headers.findIndex((h) => h.toLowerCase() === String(r.references.field).toLowerCase());
        if (li < 0) { warnings.push(`"${path.basename(lf)}" has no ${r.references.field} column, so the foreign key on ${f.name} was not checked.`); continue; }
        const keys = new Set(lt.rows.map((x) => (x[li] ?? '').trim()));
        flag('foreign key', filled.filter(([v]) => !keys.has(v)), (n) => `${plural(n, 'value')} ${n === 1 ? 'has' : 'have'} no match in ${path.basename(lf)} (${r.references.field}).`);
      }
    }
    dictionary = { file: dict.file ? rel(opts.root, dict.file) : '', entity: ent.entity, fields: ent.fields.length, missingColumns: missing, undocumentedColumns: undocumented };
  }
  const order = { High: 0, Medium: 1, Low: 2 };
  findings.sort((a, b) => order[a.severity] - order[b.severity] || t.headers.indexOf(a.column) - t.headers.indexOf(b.column));
  const out = {
    file: rel(opts.root, file), sheet: t.sheet, rows: rows.length, truncated, columnCount: t.headers.length, columns, dictionary, findings, warnings,
    summary: `${plural(rows.length, 'row')}${truncated ? ` (first ${cap.toLocaleString('en')} only)` : ''}, ${plural(t.headers.length, 'column')}; ${plural(findings.length, 'finding')} (${findings.filter((f) => f.severity === 'High').length} high)${dictionary ? ` against the data dictionary entity ${dictionary.entity}` : ''}.`,
    note: `Only counts and at most ${EXAMPLES} example values per finding are shown${personal.size ? `; values in columns that look personal (${[...personal].join(', ')}) are masked` : ''}. Row numbers count the header as row 1.`,
  };
  if (opts.scripts) out.scripts = profilingScripts(out, { table: opts.table, entity: ent });
  return out;
}

const pyStr = (s) => JSON.stringify(String(s));
const sqlId = (s) => `\`${String(s).replace(/`/g, '``')}\``;
const sqlStr = (s) => `'${String(s).replace(/'/g, "''")}'`;
/** PySpark and Spark SQL that re-run the profile and the dictionary rules on the full table in a Fabric lakehouse. */
function profilingScripts(profile, { table, entity } = {}) {
  const tbl = table || `bronze.${normName(path.basename(profile.file, path.extname(profile.file))) || 'source_table'}`;
  const rules = (entity && entity.fields) || [];
  const py = [
    '# Profiling script generated by Lumen from a sample. Run it in a lower-environment Fabric notebook.',
    'from pyspark.sql import functions as F', '',
    `df = spark.read.table(${pyStr(tbl)})`, 'total = df.count()', 'rows = []',
    `for c in ${JSON.stringify(profile.columns.map((c) => c.name))}:`,
    '    s = df.agg(F.sum(F.when(F.col(c).isNull() | (F.trim(F.col(c).cast("string")) == ""), 1).otherwise(0)).alias("nulls"), F.countDistinct(c).alias("distinct"), F.min(c).alias("min"), F.max(c).alias("max")).first()',
    '    rows.append((c, total, s["nulls"], s["distinct"], str(s["min"]), str(s["max"])))',
    'display(spark.createDataFrame(rows, ["column", "rows", "nulls", "distinct", "min", "max"]))', '',
    '# Data dictionary rules: rows that break each rule',
    'checks = {',
    ...rules.flatMap((f) => {
      const c = `F.col(${pyStr(f.name)})`, r = f.rules || {}, out = [];
      if (r.required) out.push(`    ${pyStr(`${f.name} required`)}: ${c}.isNull() | (F.trim(${c}) == ""),`);
      if (r.allowed && r.allowed.length) out.push(`    ${pyStr(`${f.name} allowed values`)}: ${c}.isNotNull() & ~${c}.isin(${JSON.stringify(r.allowed)}),`);
      if (r.pattern) out.push(`    ${pyStr(`${f.name} pattern`)}: ${c}.isNotNull() & ~${c}.rlike(${pyStr(`^(?:${r.pattern})$`)}),`);
      if (['date', 'timestamp'].includes(f.family)) out.push(`    ${pyStr(`${f.name} valid ${f.family}`)}: ${c}.isNotNull() & F.to_${f.family === 'date' ? 'date' : 'timestamp'}(${c}).isNull(),`);
      return out;
    }),
    '}',
    'for name, cond in checks.items():', '    print(name, df.filter(cond).count())',
    ...rules.filter((f) => f.rules && f.rules.unique).map((f) => `print(${pyStr(`${f.name} duplicates`)}, df.groupBy(${pyStr(f.name)}).count().filter("count > 1").count())`),
    ...rules.filter((f) => f.rules && f.rules.references).map((f) => `print(${pyStr(`${f.name} orphans`)}, df.join(spark.read.table(${pyStr(`bronze.${normName(f.rules.references.entity)}`)}).select(F.col(${pyStr(f.rules.references.field)}).alias("_k")), F.col(${pyStr(f.name)}) == F.col("_k"), "left_anti").filter(F.col(${pyStr(f.name)}).isNotNull()).count())`),
  ].join('\n');
  const sql = [
    `-- Profiling query generated by Lumen from a sample. Run it against ${tbl} in a lower environment.`,
    profile.columns.map((c) => `SELECT ${sqlStr(c.name)} AS column_name, COUNT(*) AS row_count, SUM(CASE WHEN ${sqlId(c.name)} IS NULL OR TRIM(CAST(${sqlId(c.name)} AS STRING)) = '' THEN 1 ELSE 0 END) AS nulls, COUNT(DISTINCT ${sqlId(c.name)}) AS distinct_values, CAST(MIN(${sqlId(c.name)}) AS STRING) AS min_value, CAST(MAX(${sqlId(c.name)}) AS STRING) AS max_value FROM ${tbl}`).join('\nUNION ALL\n') + ';',
  ].join('\n');
  return { pyspark: py, sql, table: tbl };
}

// ------------------------------------------------------------------ 4. STTM
const STTM_COLUMNS = [
  ['id', 'ID', 10], ['sourceEntity', 'Source entity', 18], ['sourceField', 'Source field', 20], ['sourceType', 'Source type', 14],
  ['rule', 'Transformation rule', 44], ['targetLayer', 'Target layer', 12], ['targetEntity', 'Target entity', 20], ['targetField', 'Target field', 20],
  ['targetType', 'Target type', 14], ['match', 'Match', 12], ['dqRule', 'DQ rule', 34], ['status', 'Status', 11], ['reviewer', 'Reviewer', 16], ['notes', 'Notes', 36],
];
const STTM_FIELDS = {
  id: [/^(id|ref|mapping id|#)$/i], sourceEntity: [/source (entity|table|object)/i], sourceField: [/source (field|column|attribute)/i], sourceType: [/source (data )?type/i],
  rule: [/transform|rule|logic|derivation/i], targetLayer: [/layer|zone/i], targetEntity: [/target (entity|table|object)/i], targetField: [/target (field|column|attribute)/i],
  targetType: [/target (data )?type/i], match: [/^match/i], dqRule: [/dq|quality/i], status: [/^status$/i], reviewer: [/review|approv/i], notes: [/^(notes?|comments?)$/i],
};
const LAYERS = { bronze: 'Bronze', raw: 'Bronze', landing: 'Bronze', silver: 'Silver', edr: 'Silver', curated: 'Silver', canonical: 'Silver', gold: 'Gold', presentation: 'Gold', mart: 'Gold' };
const layerOf = (s) => { const t = text(s); return LAYERS[t.toLowerCase().split(/[\s/]+/)[0]] || t; };

/**
 * Write a new STTM workbook. rows: [{ sourceEntity, sourceField, sourceType, rule, targetLayer, targetEntity,
 * targetField, targetType, match, dqRule, notes }]. Every row is written as Draft with no reviewer: only a person
 * approves a mapping. opts: { comparison (compareSchemas result: adds its unmatched fields as Needs input rows and an
 * "Unmatched fields" sheet), created }. Never overwrites: a numbered copy is saved instead.
 */
async function writeSttm(file, rows = [], { comparison, created } = {}) {
  if (!rows.length && !comparison) throw friendly('Give at least one mapping row, or the source and target schemas.');
  const wb = new ExcelJS.Workbook();
  if (created) { wb.created = created; wb.modified = created; }
  const ws = wb.addWorksheet('STTM');
  ws.addRow(STTM_COLUMNS.map((c) => c[1]));
  styleHeader(ws, STTM_COLUMNS.map((c) => c[2]));
  const all = rows.map((r) => ({ ...r }));
  const key = (e, f) => `${normName(e)}.${normName(f)}`;
  const warnings = [];
  if (comparison) {
    for (const m of comparison.matches) {
      const r = all.find((x) => normName(x.sourceField) === normName(m.source.field) && normName(x.targetField) === normName(m.target.field));
      if (r) { r.match = r.match || m.match; r.sourceType = r.sourceType || m.source.type; r.targetType = r.targetType || m.target.type; if (['narrowing', 'conversion', 'incompatible'].includes(m.type.status) && !/type/i.test(r.notes || '')) r.notes = [r.notes, `Type: ${m.type.note}`].filter(Boolean).join('; '); }
    }
    const covS = new Set(all.filter((r) => r.sourceField).map((r) => key(r.sourceEntity || '', r.sourceField)));
    const covSf = new Set(all.filter((r) => r.sourceField).map((r) => normName(r.sourceField)));
    const covTf = new Set(all.filter((r) => r.targetField).map((r) => normName(r.targetField)));
    for (const f of comparison.unmatchedSource) if (!covS.has(key(f.entity, f.field)) && !covSf.has(normName(f.field))) all.push({ sourceEntity: f.entity, sourceField: f.field, sourceType: f.type, rule: 'Needs input: no target field found. Map it, or mark it Not migrated.', match: 'No target', notes: 'Unmatched source field' });
    for (const f of comparison.unmatchedTarget) if (!covTf.has(normName(f.field))) all.push({ rule: 'Needs input: no source field found. Derive it, default it, or leave it empty.', targetEntity: f.entity, targetField: f.field, targetType: f.type, match: 'No source', notes: 'Unmatched target field' });
  }
  let n = 0;
  const demoted = [];
  for (const r of all) {
    n++;
    const vals = { ...r, id: r.id || `STTM-${String(n).padStart(3, '0')}`, targetLayer: layerOf(r.targetLayer), status: 'Draft', reviewer: '' };
    if ((r.status && !/^draft$/i.test(String(r.status))) || r.reviewer) demoted.push(vals.id);
    const row = ws.addRow(STTM_COLUMNS.map(([k]) => text(vals[k])));
    row.alignment = { vertical: 'top', wrapText: true };
    if (/^needs input/i.test(text(vals.rule))) row.getCell(5).fill = NEEDS_INPUT;
  }
  if (demoted.length) warnings.push(`${plural(demoted.length, 'row')} (${demoted.slice(0, 5).join(', ')}${demoted.length > 5 ? '…' : ''}) ${demoted.length === 1 ? 'was' : 'were'} written as Draft with no reviewer. Only a reviewer can approve a mapping.`);
  ws.getColumn(12).eachCell((c, n) => { if (n > 1) c.dataValidation = { type: 'list', allowBlank: false, formulae: ['"Draft,Approved,Rejected,Not migrated"'] }; });
  ws.autoFilter = { from: 'A1', to: `${colLetter(STTM_COLUMNS.length)}1` };
  if (comparison) {
    const u = wb.addWorksheet('Unmatched fields');
    u.addRow(['Side', 'Entity', 'Field', 'Type', 'Description']);
    styleHeader(u, [10, 22, 24, 16, 50]);
    for (const f of comparison.unmatchedSource) u.addRow(['Source', f.entity, f.field, f.type, f.description || '']);
    for (const f of comparison.unmatchedTarget) u.addRow(['Target', f.entity, f.field, f.type, f.description || '']);
    const m = wb.addWorksheet('Match evidence');
    m.addRow(['Source entity', 'Source field', 'Source type', 'Target entity', 'Target field', 'Target type', 'Match', 'Score', 'Type check', 'Note']);
    styleHeader(m, [18, 20, 14, 20, 20, 14, 12, 8, 14, 44]);
    for (const x of comparison.matches) m.addRow([x.source.entity, x.source.field, x.source.type, x.target.entity, x.target.field, x.target.type, x.match, x.score, x.type.status, x.type.note]);
  }
  const about = wb.addWorksheet('About');
  about.addRow(['Source-to-target mapping drafted with Lumen. Every row starts as Draft.']);
  about.addRow(['A reviewer sets Status to Approved and puts their name in Reviewer. Pipeline code is generated only for Approved rows.']);
  about.addRow(['Rows whose rule starts with "Needs input" have no match on the other side and need a decision.']);
  about.getColumn(1).width = 110;
  const saved = freeName(file);
  fs.mkdirSync(path.dirname(saved), { recursive: true });
  await wb.xlsx.writeFile(saved);
  const needs = all.filter((r) => /^needs input/i.test(text(r.rule))).length;
  return { saved, rows: all.length, needsInput: needs, unmatched: comparison ? { source: comparison.unmatchedSource.length, target: comparison.unmatchedTarget.length } : null, warnings, summary: `${plural(all.length, 'mapping row')} saved as Draft${needs ? `, ${needs} marked Needs input` : ''}. A reviewer must set Status to Approved before code is generated.` };
}

/** Read an STTM workbook. Returns { rows: [{ ...STTM fields, approved, at, row }], warnings }. */
async function readSttm(file) {
  const wb = await excel.open(file);
  const sheet = readSheet(wb, STTM_FIELDS, ['targetField', 'sourceField'], /^(about|summary|notes?|instructions?|read me|unmatched fields|match evidence)$/i);
  if (!sheet || !sheet.map.status) throw friendly(`"${path.basename(file)}" needs an STTM sheet with "Source field", "Target field" and "Status" columns.`);
  const warnings = [];
  const rows = sheet.rows.map((r) => {
    const o = {}; for (const k of Object.keys(STTM_FIELDS)) o[k] = text(r[k]);
    o.targetLayer = layerOf(o.targetLayer);
    o.approved = /^approved$/i.test(o.status);
    o.at = `${sheet.ws.name}!A${r.row}`; o.row = r.row;
    if (o.approved && !o.reviewer) warnings.push(`${o.id || o.at} is Approved but has no reviewer name.`);
    return o;
  });
  return { file, sheet: sheet.ws.name, rows, warnings };
}

// ------------------------------------------------------------------ 5. pipeline code
const SPARK_TYPES = { string: 'string', integer: 'bigint', decimal: 'decimal(18,2)', date: 'date', timestamp: 'timestamp', boolean: 'boolean', binary: 'binary' };
const sparkType = (t) => { const f = typeFamily(t); if (f === 'decimal') { const s = sizeOf(t); return s ? `decimal(${s.length},${s.scale ?? 0})` : 'decimal(18,2)'; } return SPARK_TYPES[f] || 'string'; };
const ident = (s) => String(s || '').replace(/[^A-Za-z0-9_]/g, '_').replace(/^(\d)/, '_$1');
const snake = (s) => words(String(s || '')).length ? String(s).replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/[^A-Za-z0-9]+/g, '_').toLowerCase().replace(/^_|_$/g, '') : 'table';

/**
 * Turn a plain-words transformation rule into PySpark and Spark SQL. Recognised: direct / as is, trim, upper, lower,
 * cast to <type>, to date / timestamp with a 'format', default / coalesce 'x', constant / set to 'x', and code given
 * after "expr:" (PySpark) or "sql:" (Spark SQL). Anything else is mapped directly with a TODO.
 */
function translateRule(rule, src, targetType) {
  const r = text(rule);
  const lit = (/['"]([^'"]*)['"]/.exec(r) || [])[1];
  const col = src ? `F.col(${pyStr(src)})` : 'F.lit(None)', scol = src ? sqlId(src) : 'NULL';
  if (/^expr:/i.test(r)) return { py: r.replace(/^expr:\s*/i, ''), sql: `${scol} /* TODO: SQL for: ${r.replace(/\*\//g, '')} */`, recognised: true, todo: 'Spark SQL version of the PySpark expression' };
  if (/^sql:/i.test(r)) return { py: `F.expr(${pyStr(r.replace(/^sql:\s*/i, ''))})`, sql: r.replace(/^sql:\s*/i, ''), recognised: true };
  if (/^(constant|set to|always|fixed|literal)\b/i.test(r) && lit != null) return { py: `F.lit(${pyStr(lit)})`, sql: sqlStr(lit), recognised: true };
  let p = col, s = scol, known = !r || /^(direct|as is|copy|1:1|one.to.one|straight|move|map directly|no change|none)\b/i.test(r);
  if (/\btrim/i.test(r)) { p = `F.trim(${p})`; s = `TRIM(${s})`; known = true; }
  if (/\bupper/i.test(r)) { p = `F.upper(${p})`; s = `UPPER(${s})`; known = true; }
  if (/\blower/i.test(r)) { p = `F.lower(${p})`; s = `LOWER(${s})`; known = true; }
  const fmt = (/(?:format|as|from)\s+['"]([^'"]+)['"]/i.exec(r) || [])[1];
  if (/\b(to|parse|cast( to)?|convert( to)?)\s+(a\s+)?timestamp/i.test(r)) { p = `F.to_timestamp(${p}${fmt ? `, ${pyStr(fmt)}` : ''})`; s = `TO_TIMESTAMP(${s}${fmt ? `, ${sqlStr(fmt)}` : ''})`; known = true; }
  else if (/\b(to|parse|cast( to)?|convert( to)?)\s+(a\s+)?date/i.test(r)) { p = `F.to_date(${p}${fmt ? `, ${pyStr(fmt)}` : ''})`; s = `TO_DATE(${s}${fmt ? `, ${sqlStr(fmt)}` : ''})`; known = true; }
  else {
    const c = /\b(?:cast|convert)\s+(?:to|as)\s+([a-z]+(?:\s*\(\s*\d+(?:\s*,\s*\d+)?\s*\))?)/i.exec(r);
    if (c) { const ty = sparkType(c[1]); p = `${p}.cast(${pyStr(ty)})`; s = `CAST(${s} AS ${ty.toUpperCase()})`; known = true; }
  }
  if (/\b(default|coalesce|if (blank|null|empty))\b/i.test(r) && lit != null) { p = `F.coalesce(${p}, F.lit(${pyStr(lit)}))`; s = `COALESCE(${s}, ${sqlStr(lit)})`; known = true; }
  const tt = targetType ? sparkType(targetType) : null;
  if (tt && tt !== 'string' && !/cast|to_date|to_timestamp/i.test(p)) { p = `${p}.cast(${pyStr(tt)})`; s = `CAST(${s} AS ${tt.toUpperCase()})`; }
  return { py: p, sql: s, recognised: known, ...(known ? {} : { todo: r }) };
}

/**
 * Generate pipeline assets for the APPROVED rows of an STTM. One folder per target layer and entity under outDir
 * (default "Pipelines"): PySpark notebook, Spark SQL, Data Factory pipeline JSON, pytest unit tests and a
 * reconciliation query (row counts and checksums per layer). opts: { outDir, layer, entity, sourceTables: { entity:
 * "lakehouse.table" }, root }. Rows that are not Approved are refused and listed; nothing is written for them.
 */
async function generatePipelineCode(sttmFile, opts = {}) {
  const sttm = await readSttm(sttmFile);
  const refused = [], picked = [];
  for (const r of sttm.rows) {
    if (opts.layer && normName(r.targetLayer) !== normName(layerOf(opts.layer))) continue;
    if (opts.entity && normName(r.targetEntity) !== normName(opts.entity)) continue;
    if (!r.approved) { refused.push({ id: r.id, at: r.at, target: `${r.targetEntity}.${r.targetField}`, status: r.status || '(blank)', reason: `Status is ${r.status || 'blank'}, not Approved` }); continue; }
    if (/^needs input/i.test(r.rule)) { refused.push({ id: r.id, at: r.at, target: `${r.targetEntity}.${r.targetField}`, status: r.status, reason: 'Approved, but the rule still says Needs input' }); continue; }
    if (!r.targetEntity || !r.targetField) { refused.push({ id: r.id, at: r.at, target: `${r.targetEntity}.${r.targetField}`, status: r.status, reason: 'No target entity or field' }); continue; }
    picked.push(r);
  }
  if (!picked.length) throw friendly(`No Approved rows in "${path.basename(sttmFile)}"${opts.layer || opts.entity ? ' for that layer or entity' : ''}, so no code was generated. A reviewer must set Status to Approved (and add their name) first. ${refused.length} row${refused.length === 1 ? ' was' : 's were'} refused.`);
  const root = opts.root || path.dirname(sttmFile);
  const outDir = opts.outDir || path.join(root, 'Pipelines');
  const groups = new Map();
  for (const r of picked) { const k = `${r.targetLayer || 'Silver'}|${r.targetEntity}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
  const written = [], todo = [];
  const srcLayer = (layer) => (layer === 'Gold' ? 'silver' : 'bronze');
  for (const [k, rs] of groups) {
    const [layer, entity] = k.split('|');
    const name = snake(entity);
    const sources = [...new Set(rs.map((r) => r.sourceEntity).filter(Boolean))];
    const tableOf = (e) => (opts.sourceTables && opts.sourceTables[e]) || `${srcLayer(layer)}.${snake(e)}`;
    const target = `${layer.toLowerCase()}.${name}`;
    const main = sources[0];
    const cols = rs.map((r) => ({ r, t: translateRule(r.rule, r.sourceField, r.targetType) }));
    for (const c of cols) if (c.t.todo) todo.push({ id: c.r.id, at: c.r.at, target: `${entity}.${c.r.targetField}`, rule: c.t.todo });
    const dq = rs.filter((r) => r.dqRule);
    const header = (lang) => [`${lang} Generated by Lumen from ${path.basename(sttmFile)} (Approved rows only: ${rs.map((r) => r.id).join(', ')}).`, `${lang} Review it, then run it in a lower-environment Fabric workspace. Source: ${sources.map(tableOf).join(', ') || '(none)'} → target: ${target}.`];
    const joinNote = sources.length > 1 ? [`# TODO: ${sources.length} source entities (${sources.join(', ')}). Add the join between them below.`] : [];
    const py = [
      ...header('#'), '', '# %%', 'from pyspark.sql import functions as F', '',
      '# %% Parameters', `source_table = ${pyStr(main ? tableOf(main) : 'bronze.source')}`, `target_table = ${pyStr(target)}`, '',
      '# %% Read', 'src = spark.read.table(source_table)', ...joinNote, '',
      '# %% Transform (one line per approved STTM row)', 'out = src.select(',
      ...cols.map(({ r, t }) => `    ${t.py}.alias(${pyStr(r.targetField)}),  # ${r.id}${r.rule ? `: ${r.rule.replace(/\n/g, ' ')}` : ''}${t.todo ? '  TODO: implement this rule' : ''}`),
      ')', '',
      '# %% Data quality rules from the STTM (rows that fail are counted; decide whether to stop the load)',
      'dq_failures = {',
      ...dq.map((r) => `    ${pyStr(`${r.id} ${r.targetField}: ${r.dqRule}`)}: ${dqPy(r)},`),
      '}', 'for rule, cond in dq_failures.items():', '    n = out.filter(cond).count()', '    print(f"{rule}: {n} failing rows")', '',
      '# %% Write', 'out.write.format("delta").mode("overwrite").option("overwriteSchema", "true").saveAsTable(target_table)', '',
    ].join('\n');
    const sql = [
      ...header('--'), '',
      `CREATE TABLE IF NOT EXISTS ${target} (`, cols.map(({ r }) => `  ${sqlId(r.targetField)} ${sparkType(r.targetType || r.sourceType).toUpperCase()}`).join(',\n'), ') USING DELTA;', '',
      `INSERT OVERWRITE ${target}`, 'SELECT', cols.map(({ r, t }, i) => `  ${t.sql} AS ${sqlId(r.targetField)}${i < cols.length - 1 ? ',' : ''}  -- ${r.id}${t.todo ? ' TODO: implement this rule' : ''}`).join('\n'), `FROM ${main ? tableOf(main) : 'bronze.source'};`, '',
    ].join('\n');
    const adf = {
      name: `pl_${layer.toLowerCase()}_${name}`,
      properties: {
        description: `Load ${target} from ${sources.map(tableOf).join(', ')}. Generated by Lumen from ${path.basename(sttmFile)} (Approved rows only).`,
        activities: [
          { name: `Load ${name}`, type: 'TridentNotebook', dependsOn: [], policy: { timeout: '0.02:00:00', retry: 1, retryIntervalInSeconds: 120 }, typeProperties: { notebookId: `<id of the ${name}_load notebook in Fabric>`, workspaceId: '<lower-environment workspace id>', parameters: { source_table: { value: main ? tableOf(main) : '', type: 'string' }, target_table: { value: target, type: 'string' } } } },
          { name: `Reconcile ${name}`, type: 'Script', dependsOn: [{ activity: `Load ${name}`, dependencyConditions: ['Succeeded'] }], typeProperties: { scripts: [{ type: 'Query', text: `-- see ${name}_reconciliation.sql` }] } },
        ],
        annotations: ['Generated by Lumen', 'Review before use'],
      },
    };
    const test = [
      ...header('#'), '# Run with pytest and a local Spark session (pip install pyspark pytest in the engineering environment).', '',
      'import pytest', 'from pyspark.sql import SparkSession, functions as F', '',
      '@pytest.fixture(scope="module")', 'def spark():', '    return SparkSession.builder.master("local[1]").appName("lumen-tests").getOrCreate()', '',
      'def transform(src):', '    return src.select(', ...cols.map(({ r, t }) => `        ${t.py}.alias(${pyStr(r.targetField)}),`), '    )', '',
      'def sample(spark):', `    cols = ${JSON.stringify([...new Set(rs.map((r) => r.sourceField).filter(Boolean))])}`, '    # TODO: replace with a few rows from the profiled sample (no personal data).', '    return spark.createDataFrame([tuple(None for _ in cols)], ", ".join(f"{c} string" for c in cols))', '',
      'def test_target_columns(spark):', `    assert transform(sample(spark)).columns == ${JSON.stringify(rs.map((r) => r.targetField))}`, '',
      ...dq.map((r) => [`def test_${ident(r.id).toLowerCase()}_${ident(r.targetField).toLowerCase()}_dq(spark):`, `    # ${r.dqRule}`, '    # TODO: add a row that breaks the rule and check it is caught.', `    out = transform(sample(spark))`, `    assert ${pyStr(r.targetField)} in out.columns`, ''].join('\n')),
    ].join('\n');
    const direct = cols.filter(({ r, t }) => r.sourceField && /^F\.col\(/.test(t.py) && !t.todo).map(({ r }) => r);
    const recon = [
      ...header('--'), '-- Row counts and checksums per layer. The checksum covers the directly mapped columns only.', '',
      `SELECT 'source' AS layer, COUNT(*) AS row_count${direct.length ? `, SUM(xxhash64(${direct.map((r) => `CAST(${sqlId(r.sourceField)} AS STRING)`).join(', ')})) AS checksum` : ''} FROM ${main ? tableOf(main) : 'bronze.source'}`,
      'UNION ALL',
      `SELECT '${layer.toLowerCase()}' AS layer, COUNT(*) AS row_count${direct.length ? `, SUM(xxhash64(${direct.map((r) => `CAST(${sqlId(r.targetField)} AS STRING)`).join(', ')})) AS checksum` : ''} FROM ${target};`, '',
    ].join('\n');
    const dir = path.join(outDir, `${layer} - ${entity}`.replace(/[<>:"/\\|?*]/g, '_'));
    fs.mkdirSync(dir, { recursive: true });
    for (const [f, body] of [[`${name}_load.py`, py], [`${name}_load.sql`, sql], [`pl_${layer.toLowerCase()}_${name}.json`, JSON.stringify(adf, null, 2) + '\n'], [`test_${name}_load.py`, test], [`${name}_reconciliation.sql`, recon]]) {
      const out = freeName(path.join(dir, f));
      fs.writeFileSync(out, body, 'utf8');
      written.push(rel(opts.root, out));
    }
  }
  return {
    sttm: rel(opts.root, sttmFile), generatedFor: picked.map((r) => ({ id: r.id, at: r.at, target: `${r.targetLayer}.${r.targetEntity}.${r.targetField}` })), refused, todo, files: written, warnings: sttm.warnings,
    summary: `Code generated for ${plural(picked.length, 'approved row')} into ${plural(groups.size, 'target table')} (${written.length} files); ${plural(refused.length, 'row')} refused because ${refused.length === 1 ? 'it is' : 'they are'} not approved${todo.length ? `; ${plural(todo.length, 'rule')} need code by hand (TODO)` : ''}.`,
    note: 'Generated code is a starting point. Review it, fill the TODOs and run it in a lower environment first.',
  };
}
function dqPy(r) {
  const c = `F.col(${pyStr(r.targetField)})`, d = r.dqRule;
  if (/not (be )?(null|blank|empty)|required|mandatory/i.test(d)) return `${c}.isNull()`;
  const inList = /(?:in|one of|allowed)\s*[:(]?\s*([A-Z0-9_]+(?:\s*,\s*[A-Z0-9_]+)+)/i.exec(d);
  if (inList) return `${c}.isNotNull() & ~${c}.isin(${JSON.stringify(inList[1].split(/\s*,\s*/))})`;
  if (/unique/i.test(d)) return `F.lit(False)  # TODO: unique check, e.g. out.groupBy(${pyStr(r.targetField)}).count().filter("count > 1")`;
  if (/valid date|is a date/i.test(d)) return `${c}.isNull()  # an unparseable date becomes null`;
  const gt = /(>=?|<=?)\s*(-?\d+(?:\.\d+)?)/.exec(d);
  if (gt) return `~(${c} ${gt[1]} ${gt[2]})`;
  return `F.lit(False)  # TODO: ${d.replace(/\n/g, ' ')}`;
}

module.exports = {
  readSchema, parseDdl, parseJsonSchema, compareSchemas, typeFamily, typeCompatibility, nameSimilarity, words,
  parseCsv, readTable, kindOf, patternOf, profileTable, profilingScripts,
  writeSttm, readSttm, translateRule, generatePipelineCode, STTM_COLUMNS,
};
