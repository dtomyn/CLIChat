// Builds the JSON payload a Contoso Foundry agent expects from what the user typed and the files they attached.
//
// Each agent file declares `foundry.inputs`: a list of rules, applied to attachments in order. A file is used by the
// first rule whose `match` (regex on the file name, case-insensitive) fits. Rule forms (`as`):
//   "b64"      payload[field] = base64 of the file;            optional nameField: payload[nameField] = file name
//   "text"     payload[field] = UTF-8 text of the file;        optional nameField
//   "json"     payload[field] = the file parsed as JSON
//   "object"   payload[field] = { [b64Key||"b64"]: base64, filename, ...extra }       (single file)
//   "list"     payload[field] = [ ...each matching file as { [b64Key||"content_b64"]: base64, filename, ...extra } ]
//   "textlist" payload[field] = [ ...each matching file as { [textKey||"text"]: text, name, ...extra } ]
// `path` (optional, dotted) nests the value, e.g. path "current" + as "object" -> payload.current = {...}.
// `foundry.defaults` is merged first; the typed text goes to payload[foundry.messageField || "message"].
// If the user's message is itself a JSON object, it is merged in (power users and the demo prompts).
const fs = require('fs');
const path = require('path');

const MAX_FILE = 15 * 1024 * 1024;

function setPath(obj, dotted, value) {
  const keys = dotted.split('.');
  let o = obj;
  for (const k of keys.slice(0, -1)) o = (o[k] && typeof o[k] === 'object' && !Array.isArray(o[k])) ? o[k] : (o[k] = {});
  const last = keys[keys.length - 1];
  if (Array.isArray(value) && Array.isArray(o[last])) o[last] = [...o[last], ...value];
  else if (value && typeof value === 'object' && !Array.isArray(value) && o[last] && typeof o[last] === 'object') o[last] = { ...o[last], ...value };
  else o[last] = value;
}

function readFile(file) {
  const st = fs.statSync(file);
  if (st.size > MAX_FILE) throw new Error(`"${path.basename(file)}" is too large to send to the agent (limit 15 MB).`);
  return fs.readFileSync(file);
}

function valueFor(rule, files) {
  const one = files[0];
  const name = (f) => path.basename(f);
  switch (rule.as) {
    case 'b64': return readFile(one).toString('base64');
    case 'text': return readFile(one).toString('utf8');
    case 'json':
      try { return JSON.parse(readFile(one).toString('utf8')); } catch { throw new Error(`"${name(one)}" isn't valid JSON.`); }
    case 'object': return { [rule.b64Key || 'b64']: readFile(one).toString('base64'), filename: name(one), ...(rule.extra || {}) };
    case 'list': return files.map((f) => ({ [rule.b64Key || 'content_b64']: readFile(f).toString('base64'), filename: name(f), ...(rule.extra || {}) }));
    case 'textlist': return files.map((f) => ({ [rule.textKey || 'text']: readFile(f).toString('utf8'), name: name(f), ...(rule.extra || {}) }));
    default: throw new Error(`Unknown input rule "${rule.as}".`);
  }
}

/**
 * @returns {{ payload: object, used: string[], unused: string[] }}
 */
function buildPayload(foundry = {}, message = '', attachments = []) {
  const payload = JSON.parse(JSON.stringify(foundry.defaults || {}));
  const text = String(message || '').trim();
  let typedJson = null;
  if (text.startsWith('{')) { try { const v = JSON.parse(text); if (v && typeof v === 'object' && !Array.isArray(v)) typedJson = v; } catch { /* plain text */ } }
  if (text && !typedJson) payload[foundry.messageField || 'message'] = text;
  const remaining = [...attachments];
  const used = [];
  for (const rule of foundry.inputs || []) {
    const re = new RegExp(rule.match || '.*', 'i');
    const hits = remaining.filter((f) => re.test(path.basename(f)));
    if (!hits.length) continue;
    const take = ['list', 'textlist'].includes(rule.as) ? hits : hits.slice(0, 1);
    const value = valueFor(rule, take);
    setPath(payload, rule.path ? `${rule.path}${rule.field ? `.${rule.field}` : ''}` : rule.field, value);
    if (rule.nameField && ['b64', 'text'].includes(rule.as)) setPath(payload, rule.path ? `${rule.path}.${rule.nameField}` : rule.nameField, path.basename(take[0]));
    for (const f of take) { used.push(f); remaining.splice(remaining.indexOf(f), 1); }
  }
  if (typedJson) Object.assign(payload, typedJson);
  return { payload, used, unused: remaining };
}

module.exports = { buildPayload, setPath };
