// Pipeline and environment readiness (Plan 17). Pure functions plus small file readers, unit-tested. Read-only:
// nothing here deploys, runs a pipeline or connects to a cluster.
//
// 1. parseConfig: a config file → flat { key: value } map. .env / .properties (KEY=value), JSON, and YAML (one or
//    more documents, so Kubernetes / OpenShift manifests exported as YAML work). Named list items (containers, env
//    entries) are keyed by name, e.g. Deployment/permit-api.spec.template.spec.containers[api].image.
// 2. readRules / parseRules: which keys are expected to differ per environment (env-specific), which must match,
//    and which to ignore. A Markdown "Key | Rule" table, "KEY: rule" lines, or JSON.
// 3. compareConfigs: config files across environments → keys missing per environment, values that differ where
//    they should match, image tag / version drift (and tags never promoted through a lower environment), and
//    secrets stored as plain text. Secret-looking values are always masked in the output.
// 4. lintPipeline: Azure Pipelines / GitHub Actions YAML → missing stages for the required environments, no
//    approval gate before PRD, PRD not waiting for UAT, unpinned task / action versions and :latest images.

const fs = require('fs');
const path = require('path');
const { parseYaml, jsonPath } = require('./openapi');

const friendly = (msg) => Object.assign(new Error(msg), { friendly: true });
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const rel = (root, f) => (root ? path.relative(root, f).split(path.sep).join('/') : path.basename(f));
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

// ------------------------------------------------------------------ environments
// Promotion order; aliases map to one canonical name.
const ENV_ALIASES = [
  ['DEV', /^(dev|develop|development|local)$/i],
  ['STE', /^(ste|sit|int|integration)$/i],
  ['QA', /^(qa|test|tst)$/i],
  ['UAT', /^(uat|acceptance)$/i],
  ['PREPROD', /^(preprod|pre-prod|pprd|stg|stage|staging)$/i],
  ['PRD', /^(prd|prod|production|live)$/i],
];
const canonicalEnv = (s) => { const t = String(s || '').trim(); const hit = ENV_ALIASES.find(([, re]) => re.test(t)); return hit ? hit[0] : null; };
const envRank = (name) => { const i = ENV_ALIASES.findIndex(([n]) => n === canonicalEnv(name)); return i < 0 ? 50 : i; };
/** The environment a file belongs to, from its folder or file name (".../UAT/app.env", "app.prd.env", "uat-values.yaml"). */
function envFromPath(file) {
  const parts = String(file).split(/[\\/]/).reverse();
  for (const p of parts) {
    for (const tok of p.replace(/\.[^.]+$/, '').split(/[^A-Za-z]+/)) { const e = canonicalEnv(tok); if (e) return { env: e, token: tok }; }
  }
  return null;
}

// ------------------------------------------------------------------ 1. config parsing
function flatten(value, prefix, out) {
  if (Array.isArray(value)) {
    const named = value.length && value.every((x) => isObj(x) && typeof x.name === 'string') && new Set(value.map((x) => x.name)).size === value.length;
    value.forEach((x, i) => flatten(x, `${prefix}[${named ? x.name : i}]`, out));
    if (!value.length && prefix) out[prefix] = '[]';
  } else if (isObj(value)) {
    const keys = Object.keys(value);
    for (const k of keys) flatten(value[k], prefix ? `${prefix}.${k}` : k, out);
    if (!keys.length && prefix) out[prefix] = '{}';
  } else if (prefix) out[prefix] = value == null ? '' : String(value);
  return out;
}

function parseEnvText(text) {
  const out = {};
  String(text).replace(/^﻿/, '').split(/\r?\n/).forEach((line) => {
    const s = line.trim();
    if (!s || /^[#;!]/.test(s) || /^\[.*\]$/.test(s)) return;
    const m = /^(?:export\s+)?([^=:\s]+)\s*[=:]\s*(.*)$/.exec(s);
    if (!m) return;
    let v = m[2].trim();
    if (/^(['"]).*\1$/.test(v)) v = v.slice(1, -1); else v = v.replace(/\s+#.*$/, '');
    out[m[1]] = v;
  });
  return out;
}

/** Split a multi-document YAML file on --- lines. */
const yamlDocs = (text) => String(text).replace(/^﻿/, '').replace(/\r\n?/g, '\n').split(/^---[ \t]*(?:#.*)?$/m).filter((d) => d.replace(/^\s*#.*$/gm, '').trim());

/** A config file's text → { keys: {key: value}, secretKeys: Set (values from Kubernetes Secrets), kind }. */
function parseConfig(text, name = '') {
  const ext = path.extname(name).toLowerCase();
  const secretKeys = new Set();
  if (ext === '.json') {
    let doc; try { doc = JSON.parse(String(text).replace(/^﻿/, '')); } catch (e) { throw friendly(`${path.basename(name)} isn't valid JSON: ${e.message}`); }
    return { keys: flatten(doc, '', {}), secretKeys, kind: 'json' };
  }
  if (ext === '.yaml' || ext === '.yml') {
    const keys = {};
    for (const d of yamlDocs(text)) {
      const doc = parseYaml(d);
      if (!isObj(doc)) continue;
      const k8s = doc.kind && isObj(doc.metadata) && doc.metadata.name;
      const prefix = k8s ? `${doc.kind}/${doc.metadata.name}` : '';
      const flat = flatten(doc, prefix, {});
      for (const [k, v] of Object.entries(flat)) {
        keys[k] = v;
        if (k8s && /^secret$/i.test(doc.kind) && /\.(data|stringData)\./.test(k)) secretKeys.add(k);
      }
    }
    return { keys, secretKeys, kind: 'yaml' };
  }
  return { keys: parseEnvText(text), secretKeys, kind: 'env' };
}

// ------------------------------------------------------------------ secrets
const SECRET_KEY = /(pass(word|wd)?|pwd|secret|token|api[-_.]?key|access[-_.]?key|private[-_.]?key|client[-_.]?secret|connection[-_.]?string|credential|sas|signature)/i;
const SECRET_VALUE = /(-----BEGIN [A-Z ]*PRIVATE KEY-----|(password|pwd|accountkey|sharedaccesskey)=[^;\s]+|^eyJ[\w-]{10,}\.[\w-]{10,}\.|^(ghp|gho|github_pat|xox[bp])_[\w]{10,}|^sk-[\w-]{16,}|^AKIA[0-9A-Z]{16}$)/i;
// References to a vault or a secret store are not secrets themselves.
const REFERENCE = /(^@Microsoft\.KeyVault\(|^\$\{\{?[^}]+\}\}?$|^\$\([^)]+\)$|^\$\{?[A-Z_][A-Z0-9_]*\}?$|secretKeyRef|^vault:|^keyvault:|^<[^>]+>$|^(changeme|todo|tbd|\*+|x+)$)/i;
const SECRET_NAME = /(secretKeyRef|secretRef|secretName)/i;
const looksSecret = (key, value) => {
  const v = String(value ?? '');
  if (!v || SECRET_NAME.test(key)) return false;
  return SECRET_KEY.test(key.split(/[.[\]/]/).filter(Boolean).pop() || key) || SECRET_VALUE.test(v);
};
const isReference = (v) => REFERENCE.test(String(v ?? '').trim());
const MASK = '•••••• (hidden)';

// ------------------------------------------------------------------ 2. rules
const RULE_WORDS = [['env-specific', /env|differ|specific|per[- ]environment|expected/i], ['ignore', /ignore|skip/i], ['must-match', /match|same|equal|identical/i], ['optional', /optional/i]];
const ruleWord = (s) => (RULE_WORDS.find(([, re]) => re.test(String(s || ''))) || [null])[0];

/** Rules text → { rules: [{ pattern, rule }] }. Markdown "Key | Rule" table, "KEY: rule" / "- KEY — rule" lines, or JSON. */
function parseRules(text) {
  const rules = [];
  const s = String(text || '').replace(/^﻿/, '').trim();
  if (/^[{[]/.test(s)) {
    let j; try { j = JSON.parse(s); } catch (e) { throw friendly(`The rules file isn't valid JSON: ${e.message}`); }
    if (Array.isArray(j)) for (const r of j) { if (r && r.key) rules.push({ pattern: String(r.key), rule: ruleWord(r.rule) || 'must-match' }); }
    else {
      for (const [field, rule] of [['envSpecific', 'env-specific'], ['ignore', 'ignore'], ['mustMatch', 'must-match'], ['optional', 'optional']]) for (const p of j[field] || []) rules.push({ pattern: String(p), rule });
    }
    return { rules };
  }
  for (const line of s.split(/\r?\n/)) {
    const cells = /^\s*\|/.test(line) ? line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim().replace(/^`|`$/g, '')) : null;
    if (cells) {
      if (cells.length < 2 || /^[-:\s]+$/.test(cells[0]) || /^key|setting|name$/i.test(cells[0])) continue;
      const rule = ruleWord(cells[1]); if (rule && cells[0]) rules.push({ pattern: cells[0], rule });
      continue;
    }
    const m = /^\s*[-*]?\s*`?([^`:\s—–]+)`?\s*(?::|—|–| - )\s*(.+)$/.exec(line);
    if (m && !/^#/.test(line.trim())) { const rule = ruleWord(m[2]); if (rule) rules.push({ pattern: m[1], rule }); }
  }
  return { rules };
}
const readRules = (file) => parseRules(fs.readFileSync(file, 'utf8'));

const globRe = (p) => new RegExp(`^${p.split('*').map((x) => x.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`, 'i');
/** The rule for a key: the most specific matching pattern (exact beats wildcard; longer beats shorter). A pattern without dots or brackets also matches the last part of a key. */
function ruleFor(key, rules) {
  const last = key.split(/[.[\]/]/).filter(Boolean).pop();
  const hits = rules.filter((r) => globRe(r.pattern).test(key) || (!/[.[\]/]/.test(r.pattern) && globRe(r.pattern).test(last)));
  if (!hits.length) return null;
  hits.sort((a, b) => (a.pattern.includes('*') - b.pattern.includes('*')) || b.pattern.length - a.pattern.length);
  return hits[0].rule;
}

// ------------------------------------------------------------------ 3. compare
const IMAGE_KEY = /(^|[.\]])image$/i;
const VERSION_KEY = /(^|[._\]-])(version|tag|image[-_]?tag|app[-_]?version|build[-_]?number|release)$/i;
const splitImage = (v) => { const s = String(v || ''); const slash = s.lastIndexOf('/'); const at = s.indexOf('@'); if (at > 0) return { repo: s.slice(0, at), tag: s.slice(at + 1) }; const c = s.indexOf(':', slash + 1); return c > 0 ? { repo: s.slice(0, c), tag: s.slice(c + 1) } : { repo: s, tag: 'latest (no tag)' }; };

/**
 * Compare config files across environments.
 * files: ["Environments/STE/app.env", { path, environment }]. Several files per environment are compared file by
 * file (keys are prefixed with the file name, its environment token removed).
 * opts: { rules: { rules } | text | file path, environments: ['STE','UAT','PRD'] (order), root }
 */
function compareConfigs(files, opts = {}) {
  if (!Array.isArray(files) || files.length < 2) throw friendly('Give at least two config files, one per environment (for example STE, UAT and PRD).');
  const rules = !opts.rules ? [] : typeof opts.rules === 'object' ? opts.rules.rules || [] : fs.existsSync(String(opts.rules)) ? readRules(opts.rules).rules : parseRules(opts.rules).rules;
  const byEnv = new Map();
  for (const f of files) {
    const file = typeof f === 'string' ? f : f && f.path;
    if (!file) continue;
    if (!fs.existsSync(file)) throw friendly(`Can't find "${file}".`);
    const guess = envFromPath(rel(opts.root, file));
    const env = (typeof f === 'object' && f.environment ? canonicalEnv(f.environment) || String(f.environment).toUpperCase() : null) || (guess && guess.env) || path.basename(file, path.extname(file));
    const token = guess ? guess.token : '';
    // The file's name with its environment token removed, so "app.uat.env" and "app.prd.env" line up.
    const base = path.basename(file).replace(new RegExp(`(^|[._-])${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=[._-]|$)`, 'i'), '').replace(/^[._-]+/, '') || path.basename(file);
    const parsed = parseConfig(fs.readFileSync(file, 'utf8'), file);
    if (!byEnv.has(env)) byEnv.set(env, []);
    byEnv.get(env).push({ file, base, ...parsed });
  }
  if (byEnv.size < 2) throw friendly(`All the files look like the same environment (${[...byEnv.keys()].join(', ')}). Put each environment's files in a folder named after it (STE, UAT, PRD), or name the environment for each file.`);
  const order = opts.environments && opts.environments.length ? opts.environments.map((e) => canonicalEnv(e) || String(e).toUpperCase()) : [];
  const envs = [...byEnv.keys()].sort((a, b) => ((order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99)) || envRank(a) - envRank(b));
  const multi = envs.some((e) => byEnv.get(e).length > 1) || new Set(envs.flatMap((e) => byEnv.get(e).map((x) => x.base))).size > 1;

  const values = new Map(); // key → Map(env → value)
  const secretFrom = new Set();
  const where = new Map(); // key → env → file
  for (const env of envs) for (const part of byEnv.get(env)) {
    for (const [k, v] of Object.entries(part.keys)) {
      const key = multi ? `${part.base} › ${k}` : k;
      if (!values.has(key)) values.set(key, new Map());
      values.get(key).set(env, v);
      if (!where.has(key)) where.set(key, new Map());
      where.get(key).set(env, rel(opts.root, part.file));
      if (part.secretKeys.has(k)) secretFrom.add(key);
    }
  }
  const secretKey = (key) => secretFrom.has(key) || [...values.get(key).values()].some((v) => looksSecret(key.split(' › ').pop(), v) && !isReference(v));
  const show = (key, v) => (secretKey(key) && !isReference(v) ? MASK : v);
  const valuesOut = (key) => Object.fromEntries(envs.filter((e) => values.get(key).has(e)).map((e) => [e, show(key, values.get(key).get(e))]));

  const missing = [], differs = [], drift = [], secrets = [], findings = [];
  for (const [key, m] of [...values.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const rule = ruleFor(key.split(' › ').pop(), rules) || ruleFor(key, rules);
    if (rule === 'ignore') continue;
    const absent = envs.filter((e) => !m.has(e));
    if (absent.length && rule !== 'optional') {
      const item = { key, missingIn: absent, presentIn: envs.filter((e) => m.has(e)) };
      missing.push(item);
      findings.push({ severity: 'error', type: 'missing', key, message: `${key} is missing in ${absent.join(', ')} (set in ${item.presentIn.join(', ')}).` });
    }
    const present = envs.filter((e) => m.has(e));
    const secret = secretKey(key);
    if (secret) {
      const plain = present.filter((e) => !isReference(m.get(e)) && String(m.get(e)).trim());
      if (plain.length) {
        secrets.push({ key, environments: plain, files: plain.map((e) => where.get(key).get(e)) });
        findings.push({ severity: 'warning', type: 'secret', key, message: `${key} looks like a secret stored as plain text in ${plain.join(', ')}. Move it to Key Vault (or a Kubernetes / OpenShift secret reference) and rotate it. Value hidden.` });
      }
    }
    const distinct = new Set(present.map((e) => m.get(e)));
    if (present.length < 2 || distinct.size < 2) continue;
    const leaf = key.split(' › ').pop();
    if (IMAGE_KEY.test(leaf) || VERSION_KEY.test(leaf)) {
      const isImage = IMAGE_KEY.test(leaf);
      const tags = Object.fromEntries(present.map((e) => [e, isImage ? splitImage(m.get(e)).tag : String(m.get(e))]));
      const repos = new Set(present.map((e) => (isImage ? splitImage(m.get(e)).repo : '')));
      // The last environment (usually PRD) running a tag no lower environment runs now: it may have skipped testing.
      // Lower environments being ahead is normal promotion lag, so only the last one is flagged.
      const top = present[present.length - 1];
      const unpromoted = present.slice(0, -1).some((lo) => tags[lo] === tags[top]) ? [] : [top];
      const item = { key, kind: isImage ? 'image tag' : 'version', values: tags, ...(isImage && repos.size > 1 ? { repositories: Object.fromEntries(present.map((e) => [e, splitImage(m.get(e)).repo])) } : {}), ...(unpromoted.length ? { notPromoted: unpromoted } : {}) };
      drift.push(item);
      const list = present.map((e) => `${e} ${tags[e]}`).join(', ');
      findings.push({ severity: unpromoted.length || repos.size > 1 ? 'error' : 'warning', type: 'drift', key, message: `${isImage ? 'Image tag' : 'Version'} drift on ${key}: ${list}.${repos.size > 1 ? ' The environments run different images, not just different tags.' : ''}${unpromoted.length ? ` ${top} runs ${tags[top]}, which no lower environment runs now: check it went through testing before release.` : ''}` });
      continue;
    }
    if (rule === 'env-specific') continue;
    // With a rules file, anything not listed as env-specific must match.
    const item = { key, values: valuesOut(key), rule: rule || (rules.length ? 'must-match' : 'unlisted'), ...(secret ? { masked: true } : {}) };
    differs.push(item);
    findings.push({ severity: rules.length ? 'error' : 'warning', type: 'differs', key, message: rules.length ? `${key} must match in every environment but differs: ${Object.entries(item.values).map(([e, v]) => `${e} ${v}`).join(', ')}.` : `${key} differs between environments (${Object.entries(item.values).map(([e, v]) => `${e} ${v}`).join(', ')}). If that is expected, list it as env-specific in the rules file.` });
  }
  const errors = findings.filter((f) => f.severity === 'error').length, warnings = findings.length - errors;
  return {
    environments: envs.map((e) => ({ name: e, files: byEnv.get(e).map((x) => rel(opts.root, x.file)) })),
    keys: values.size, rules: rules.length, missing, differs, drift, secrets, findings, errors, warnings,
    summary: `Compared ${plural(values.size, 'setting')} across ${envs.join(', ')}: ${plural(missing.length, 'missing key')}, ${plural(differs.length, 'unexpected difference')}, ${plural(drift.length, 'tag or version drift')}, ${plural(secrets.length, 'plain-text secret')}${rules.length ? '' : ' (no rules file, so every difference is listed for review)'}. Secret values are hidden.`,
  };
}

// ------------------------------------------------------------------ 4. pipelines
const envOfName = (...names) => { for (const n of names) for (const tok of String(n || '').split(/[^A-Za-z]+/)) { const e = canonicalEnv(tok); if (e) return e; } return null; };
const envName = (e) => (isObj(e) ? e.name : e) || '';
const asList = (v) => (Array.isArray(v) ? v : v == null || v === '' ? [] : [v]);

function walkSteps(node, parts, visit) {
  if (Array.isArray(node)) node.forEach((x, i) => walkSteps(x, [...parts, i], visit));
  else if (isObj(node)) { visit(node, parts); for (const [k, v] of Object.entries(node)) if (typeof v === 'object') walkSteps(v, [...parts, k], visit); }
}

/**
 * Basic Azure Pipelines / GitHub Actions checks. opts: { environments: ['STE','UAT','PRD'], root }.
 * Approvals in Azure DevOps and GitHub live on the environment, not in the YAML, so a PRD deployment to a named
 * environment passes with a reminder to confirm the approvals there; one with no environment and no manual
 * validation step fails.
 */
function lintPipelineText(text, opts = {}) {
  const lines = new Map();
  const doc = parseYaml(text, { lines });
  if (!isObj(doc)) throw friendly("That file isn't a pipeline: it has no stages, jobs or steps.");
  const required = (opts.environments && opts.environments.length ? opts.environments : ['STE', 'UAT', 'PRD']).map((e) => canonicalEnv(e) || String(e).toUpperCase());
  const findings = [];
  const add = (severity, rule, message, parts = []) => {
    let line; for (let i = parts.length; i >= 0 && line == null; i--) line = lines.get(jsonPath(parts.slice(0, i)));
    findings.push({ severity, rule, message, path: jsonPath(parts), ...(line ? { line } : {}) });
  };
  const github = 'on' in doc || (isObj(doc.jobs) && !doc.stages);
  const azure = !github && (doc.stages || doc.jobs || doc.steps || doc.trigger !== undefined || doc.pool || doc.extends);
  if (!github && !azure) throw friendly("That file doesn't look like an Azure Pipelines or GitHub Actions pipeline (no stages, jobs or steps).");
  const units = []; // { name, env, environment, deps, parts, gated }

  if (github) {
    for (const [id, job] of Object.entries(isObj(doc.jobs) ? doc.jobs : {})) {
      if (!isObj(job)) continue;
      const environment = envName(job.environment);
      units.push({ name: id, env: envOfName(environment, id, job.name), environment, deps: asList(job.needs).map(String), explicitDeps: true, parts: ['jobs', id], gated: !!environment });
    }
    walkSteps(doc.jobs, ['jobs'], (n, parts) => {
      if (typeof n.uses === 'string') {
        const u = n.uses.trim();
        if (/^\.\//.test(u)) return;
        if (/^docker:\/\//.test(u)) { if (!/:[^/]+$/.test(u.slice(9)) || /:latest$/.test(u)) add('warning', 'unpinned', `${u} uses a container image without a fixed tag. Pin it to a version.`, [...parts, 'uses']); return; }
        const at = u.lastIndexOf('@');
        if (at < 0) add('error', 'unpinned', `${u} has no version. Pin it to a release tag or commit SHA (for example ${u}@v4).`, [...parts, 'uses']);
        else if (/^(main|master|develop|dev|latest|head|trunk)$/i.test(u.slice(at + 1))) add('error', 'unpinned', `${u} follows a branch, so it can change without notice. Pin it to a release tag or commit SHA.`, [...parts, 'uses']);
      }
      if (typeof n.image === 'string' && (/:latest$/.test(n.image) || !/:[^/]+$/.test(n.image))) add('warning', 'unpinned', `Container image ${n.image} has no fixed tag.`, [...parts, 'image']);
    });
  } else {
    const stages = Array.isArray(doc.stages) ? doc.stages : [{ stage: '(single stage)', jobs: doc.jobs || (doc.steps ? [{ job: 'default', steps: doc.steps }] : []) }];
    const root = Array.isArray(doc.stages) ? ['stages'] : [];
    stages.forEach((st, i) => {
      if (!isObj(st) || st.template) return;
      const jobs = Array.isArray(st.jobs) ? st.jobs : [];
      const envs = jobs.filter((j) => isObj(j) && j.deployment && j.environment).map((j) => envName(j.environment));
      let manual = false;
      walkSteps(jobs, [], (n) => { if (typeof n.task === 'string' && /^ManualValidation@/i.test(n.task)) manual = true; });
      const prev = i > 0 && isObj(stages[i - 1]) ? stages[i - 1].stage : null;
      const hasDeps = 'dependsOn' in st;
      units.push({ name: st.stage || st.displayName || `stage ${i + 1}`, env: envOfName(...envs, st.stage, st.displayName), environment: envs.join(', '), deps: hasDeps ? asList(st.dependsOn).map(String) : prev ? [String(prev)] : [], explicitDeps: hasDeps, parts: root.length ? [...root, i] : [], gated: envs.length > 0 || manual, manual });
    });
    walkSteps(doc.stages || doc.jobs || doc.steps, root.length ? root : doc.jobs ? ['jobs'] : ['steps'], (n, parts) => {
      if (typeof n.task === 'string') {
        if (!/@\d+(\.\d+)*$/.test(n.task.trim())) add('error', 'unpinned', `Task ${n.task} has no major version. Write it as ${n.task.replace(/@.*$/, '')}@<version> so an update can't change the build.`, [...parts, 'task']);
      }
      for (const k of ['image', 'container']) if (typeof n[k] === 'string' && /[:/]/.test(n[k]) && (/:latest$/.test(n[k]) || !/:[^/]+$/.test(n[k]))) add('warning', 'unpinned', `Container image ${n[k]} has no fixed tag.`, [...parts, k]);
    });
  }

  for (const env of required) if (!units.some((u) => u.env === env)) add('error', 'missing-stage', `No ${github ? 'job' : 'stage'} deploys to ${env}. Add one (with its environment) so every release goes through ${required.join(' → ')}.`, github ? ['jobs'] : ['stages']);
  const prd = units.filter((u) => u.env === 'PRD');
  const before = required.slice(0, required.indexOf('PRD') >= 0 ? required.indexOf('PRD') : required.length).filter((e) => e !== 'PRD');
  const byName = new Map(units.map((u) => [u.name, u]));
  const ancestors = (u, seen = new Set()) => { for (const d of u.deps) if (!seen.has(d)) { seen.add(d); const x = byName.get(d); if (x) ancestors(x, seen); } return seen; };
  for (const u of prd) {
    if (!u.gated) add('error', 'no-approval', `${u.name} deploys to PRD with no approval gate: it doesn't target an environment (where approvals and checks are set) and has no manual validation step.`, u.parts);
    else if (u.environment) add('info', 'approval', `Confirm the PRD environment "${u.environment}" has approvals${github ? ' (required reviewers)' : ' and checks'} set in ${github ? 'the repository settings' : 'Azure DevOps'}; the YAML can't show them.`, u.parts);
    const up = ancestors(u);
    const last = before[before.length - 1];
    const lower = last ? units.find((x) => x.env === last) : null;
    if (u.explicitDeps && !u.deps.length) add('error', 'order', `${u.name} (PRD) has an empty dependsOn/needs, so it can run before ${last || 'the lower environments'}.`, u.parts);
    else if (lower && !up.has(lower.name)) add('error', 'order', `${u.name} (PRD) doesn't wait for ${lower.name} (${last}). Make it depend on that ${github ? 'job' : 'stage'}.`, u.parts);
  }
  const errors = findings.filter((f) => f.severity === 'error').length, warnings = findings.filter((f) => f.severity === 'warning').length;
  return {
    kind: github ? 'GitHub Actions' : 'Azure Pipelines',
    environments: units.filter((u) => u.env).map((u) => ({ name: u.env, [github ? 'job' : 'stage']: u.name, ...(u.environment ? { environment: u.environment } : {}) })),
    findings, errors, warnings, valid: errors === 0,
    summary: `${github ? 'GitHub Actions workflow' : 'Azure pipeline'}: ${plural(errors, 'error')}, ${plural(warnings, 'warning')}. Required environments: ${required.join(' → ')}.`,
  };
}

function lintPipeline(file, opts = {}) {
  if (!fs.existsSync(file)) throw friendly(`Can't find "${file}".`);
  if (!/\.ya?ml$/i.test(file)) throw friendly('Give a pipeline YAML file (.yml or .yaml).');
  return { file: rel(opts.root, file), ...lintPipelineText(fs.readFileSync(file, 'utf8'), opts) };
}

module.exports = { canonicalEnv, envFromPath, parseConfig, parseEnvText, parseRules, readRules, ruleFor, looksSecret, compareConfigs, lintPipelineText, lintPipeline, MASK };
