// Change sets (plan 08, decision D3): the AI can only *propose* Azure DevOps changes.
// A proposal is validated against live data and staged as a file under data/ado-pending/<conversation>/<id>.json.
// Only Lumen's server applies it, after a person clicks Apply. No tool can reach `apply`.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { friendly } = require('./auth');
const { mdToHtml, lineDiff, htmlToMd } = require('./markup');
const read = require('./read');

const TTL = 24 * 60 * 60 * 1000;
const MAX_ITEMS = 25;
const dataDir = () => process.env.LUMEN_DATA || path.join(__dirname, '..', '..', 'data');
const safe = (s) => String(s || '').replace(/[^a-zA-Z0-9-]/g, '');
const dirFor = (conv) => path.join(dataDir(), 'ado-pending', safe(conv));
const fileFor = (conv, id) => path.join(dirFor(conv), `${safe(id)}.json`);
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const str = (v) => (v == null ? '' : typeof v === 'object' ? read.who(v) : String(v));

// ------------------------------------------------------------------ storage
function stage(conversationId, cs) {
  if (!safe(conversationId)) throw friendly('Changes can only be proposed inside a Lumen chat.');
  const item = { id: crypto.randomUUID(), conversationId: safe(conversationId), createdAt: Date.now(), expiresAt: Date.now() + TTL, status: 'pending', ...cs };
  fs.mkdirSync(dirFor(conversationId), { recursive: true });
  fs.writeFileSync(fileFor(conversationId, item.id), JSON.stringify(item, null, 1));
  return item;
}
function load(conversationId, id) {
  try {
    const cs = JSON.parse(fs.readFileSync(fileFor(conversationId, id), 'utf8'));
    if (cs.status === 'pending' && Date.now() > cs.expiresAt) { cs.status = 'expired'; save(cs); }
    return cs;
  } catch { return null; }
}
function save(cs) { fs.writeFileSync(fileFor(cs.conversationId, cs.id), JSON.stringify(cs, null, 1)); return cs; }
function list(conversationId) {
  try { return fs.readdirSync(dirFor(conversationId)).filter((f) => f.endsWith('.json')).map((f) => load(conversationId, f.slice(0, -5))).filter(Boolean).sort((a, b) => a.createdAt - b.createdAt); }
  catch { return []; }
}
function removeConversation(conversationId) { if (safe(conversationId)) fs.rmSync(dirFor(conversationId), { recursive: true, force: true }); }
function audit(entry) {
  fs.mkdirSync(dataDir(), { recursive: true });
  fs.appendFileSync(path.join(dataDir(), 'ado-audit.jsonl'), JSON.stringify({ time: new Date().toISOString(), ...entry }) + '\n');
}

// ------------------------------------------------------------------ helpers for proposals
const REL_TYPES = {
  parent: 'System.LinkTypes.Hierarchy-Reverse', child: 'System.LinkTypes.Hierarchy-Forward', related: 'System.LinkTypes.Related',
  predecessor: 'System.LinkTypes.Dependency-Reverse', successor: 'System.LinkTypes.Dependency-Forward', hyperlink: 'Hyperlink',
};
const RICH = { description: 'System.Description', acceptanceCriteria: 'Microsoft.VSTS.Common.AcceptanceCriteria', reproSteps: 'Microsoft.VSTS.TCM.ReproSteps' };
const SIMPLE = { title: 'System.Title', state: 'System.State', assignedTo: 'System.AssignedTo', area: 'System.AreaPath', iteration: 'System.IterationPath', priority: 'Microsoft.VSTS.Common.Priority', storyPoints: 'Microsoft.VSTS.Scheduling.StoryPoints', effort: 'Microsoft.VSTS.Scheduling.Effort' };
const READ_ONLY_FIELDS = /^System\.(Id|Rev|TeamProject|WorkItemType|CreatedBy|CreatedDate|ChangedBy|ChangedDate|AuthorizedAs|AuthorizedDate|RevisedDate|Watermark|Parent|Tags|History|BoardColumn|BoardColumnDone|BoardLane|CommentCount|NodeName|AreaId|IterationId)$/;
const ALIASES = { story: 'Microsoft.RequirementCategory', 'user story': 'Microsoft.RequirementCategory', pbi: 'Microsoft.RequirementCategory', 'backlog item': 'Microsoft.RequirementCategory', requirement: 'Microsoft.RequirementCategory', epic: 'Microsoft.EpicCategory', feature: 'Microsoft.FeatureCategory', bug: 'Microsoft.BugCategory', task: 'Microsoft.TaskCategory' };

function cleanTag(t) {
  const s = String(t || '').trim();
  if (!s) return '';
  if (/[;,\u0000-\u001f]/.test(s) || s.length > 100) throw friendly(`"${s.slice(0, 40)}" isn't a valid tag (no commas or semicolons, 100 characters max).`);
  return s;
}
const tags = (v) => [...new Set((Array.isArray(v) ? v : v ? String(v).split(/[;,]/) : []).map(cleanTag).filter(Boolean))];

async function typeInfo(c, cache, requested) {
  const want = String(requested || '').trim();
  if (!want) throw friendly('Say which type of work item to create (for example the backlog item type from ado_describe_work_item_type).');
  const key = want.toLowerCase();
  if (cache.has(key)) return cache.get(key);
  const types = await (cache.types ||= c.types());
  let name = types.find((t) => t.toLowerCase() === key);
  if (!name && ALIASES[key]) {
    const cats = await (cache.cats ||= c.categories());
    name = cats.find((x) => x.referenceName === ALIASES[key])?.defaultWorkItemType?.name;
  }
  if (!name) throw friendly(`There's no work item type "${want}" in ${c.project}. Types: ${types.join(', ')}.`);
  const [fields, states] = await Promise.all([c.typeFields(name), c.typeStates(name).catch(() => [])]);
  const info = { name, fields, states, byName: new Map(fields.flatMap((f) => [[f.referenceName.toLowerCase(), f], [String(f.name).toLowerCase(), f]])) };
  cache.set(key, info);
  return info;
}

async function pathsFor(c, cache) {
  if (!cache.paths) {
    cache.paths = (async () => {
      const roots = await c.classification();
      const out = { area: new Map(), iteration: new Map() };
      const walk = (n, kind, label) => { const p = String(n.path || '').replace(/^\\/, '').replace(new RegExp(`\\\\${label}(?=\\\\|$)`, 'i'), ''); out[kind].set(p.toLowerCase(), p); for (const ch of n.children || []) walk(ch, kind, label); };
      for (const r of roots) { if (r.structureType === 'area') walk(r, 'area', 'Area'); if (r.structureType === 'iteration') walk(r, 'iteration', 'Iteration'); }
      return out;
    })();
  }
  return cache.paths;
}
async function checkPath(c, cache, kind, value) {
  if (!value) return null;
  if (kind === 'iteration' && /^@current/i.test(value)) {
    const cur = await c.currentIteration();
    if (!cur) throw friendly('The team has no current sprint, so "@current" can\'t be used. Give an iteration path.');
    return cur.path;
  }
  const hit = (await pathsFor(c, cache))[kind].get(String(value).replace(/^\\/, '').toLowerCase());
  if (!hit) throw friendly(`"${value}" isn't an ${kind} path in ${c.project}. Use ado_list_paths to see the valid ones.`);
  return hit;
}

function checkAllowed(info, ref, value) {
  const f = info.byName.get(ref.toLowerCase());
  if (!f) throw friendly(`${info.name} has no field "${ref}". Use ado_describe_work_item_type to see its fields.`);
  if (READ_ONLY_FIELDS.test(f.referenceName)) throw friendly(`"${f.name}" can't be set directly.`);
  const allowed = f.allowedValues || [];
  if (allowed.length && value !== '' && value != null && !allowed.map(String).includes(String(value))) throw friendly(`"${value}" isn't allowed for ${f.name}. Allowed: ${allowed.join(', ')}.`);
  return f;
}

/** Turns the AI's friendly field input into [{ ref, label, value, html? }]. */
async function fieldValues(c, cache, info, input) {
  const out = [];
  for (const [k, ref] of Object.entries(SIMPLE)) {
    if (input[k] == null || input[k] === '') continue;
    let value = typeof input[k] === 'number' ? input[k] : String(input[k]).trim();
    if (k === 'area' || k === 'iteration') value = await checkPath(c, cache, k, value);
    if (k === 'state' && info.states.length && !info.states.some((s) => s.name === value)) throw friendly(`"${value}" isn't a state of ${info.name}. States: ${info.states.map((s) => s.name).join(', ')}.`);
    if (info.byName.has(ref.toLowerCase())) { const f = checkAllowed(info, ref, value); out.push({ ref: f.referenceName, label: f.name, value }); }
    else if (k !== 'storyPoints' && k !== 'effort' && k !== 'priority') out.push({ ref, label: k, value });
    else throw friendly(`${info.name} has no ${k} field in this project.`);
  }
  for (const [k, ref] of Object.entries(RICH)) {
    if (input[k] == null || input[k] === '') continue;
    if (!info.byName.has(ref.toLowerCase())) throw friendly(`${info.name} has no ${k} field in this project.`);
    const md = String(input[k]);
    out.push({ ref, label: info.byName.get(ref.toLowerCase()).name, value: md, html: mdToHtml(md) });
  }
  for (const [k, v] of Object.entries(input.fields || {})) {
    const f = checkAllowed(info, k, v);
    if (out.some((x) => x.ref === f.referenceName)) continue;
    const isHtml = f.type === 'html';
    out.push({ ref: f.referenceName, label: f.name, value: v, ...(isHtml ? { html: mdToHtml(String(v)) } : {}) });
  }
  return out;
}

async function existing(c, ids) {
  const want = [...new Set(ids.map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  if (!want.length) return new Map();
  const found = new Map((await c.workItems(want)).map((w) => [w.id, w]));
  const missing = want.filter((id) => !found.has(id));
  if (missing.length) throw friendly(`Can't find work item${missing.length > 1 ? 's' : ''} ${missing.map((x) => `#${x}`).join(', ')} in ${c.project}.`);
  return found;
}

const base = (c, kind, reason) => ({ kind, orgUrl: c.org, project: c.project, reason: String(reason || '').slice(0, 600) });
const staged = (cs) => `Proposed (not applied yet). ${cs.title}. The user must review it and click Apply in Lumen; nothing has changed in Azure DevOps. Tell them it's waiting for their approval.\n{"pending": "${cs.id}"}`;

// ------------------------------------------------------------------ proposals (used by the tool server)
async function proposeWorkItems(c, conversationId, args = {}) {
  const items = Array.isArray(args.items) ? args.items : [];
  if (!items.length) throw friendly('Give at least one item to create.');
  if (items.length > MAX_ITEMS) throw friendly(`Propose at most ${MAX_ITEMS} items at a time.`);
  const cache = new Map();
  const linked = await existing(c, items.flatMap((i) => [i.parentId, ...(i.relatedIds || [])]).filter((x) => x != null && x !== ''));
  const out = [];
  for (const [n, it] of items.entries()) {
    if (!String(it.title || '').trim()) throw friendly(`Item ${n + 1} needs a title.`);
    const info = await typeInfo(c, cache, it.type);
    const fields = await fieldValues(c, cache, info, it);
    const set = new Set(fields.map((f) => f.ref));
    const missing = info.fields.filter((f) => f.alwaysRequired && !set.has(f.referenceName) && f.defaultValue == null && !READ_ONLY_FIELDS.test(f.referenceName) && !/^System\.(State|Reason|AreaPath|IterationPath)$/.test(f.referenceName));
    if (missing.length) throw friendly(`"${it.title}" (${info.name}) needs: ${missing.map((f) => f.name).join(', ')}. Ask the user for these rather than guessing.`);
    const wikiLinks = (it.wikiLinks || []).map((w) => ({ url: String(w.url || w), label: String(w.label || w.url || w).slice(0, 200) })).filter((w) => /^https:\/\//i.test(w.url));
    out.push({ type: info.name, fields, tags: [...new Set([...tags(it.tags), 'Lumen'])], parentId: it.parentId ? Number(it.parentId) : null, parentTitle: it.parentId ? linked.get(Number(it.parentId))?.fields?.['System.Title'] : null, relatedIds: (it.relatedIds || []).map(Number), wikiLinks });
  }
  const cs = stage(conversationId, { ...base(c, 'create', args.reason), title: `Create ${plural(out.length, 'work item')} in ${c.project}`, ops: { items: out } });
  return staged(cs);
}

async function proposeUpdate(c, conversationId, args = {}) {
  const id = Number(args.id);
  if (!Number.isInteger(id) || id <= 0) throw friendly('Say which work item to change (its number).');
  const wi = (await existing(c, [id])).get(id);
  if (args.rev != null && Number(args.rev) !== wi.rev) throw friendly(`#${id} changed since you read it (you read revision ${args.rev}, it's now ${wi.rev}). Read it again with ado_get_work_items before proposing changes.`);
  const info = await typeInfo(c, new Map(), wi.fields['System.WorkItemType']);
  const cache = new Map();
  const changes = [];
  for (const f of await fieldValues(c, cache, info, args)) {
    const before = wi.fields[f.ref];
    const beforeText = f.html ? htmlToMd(String(before || '')) : str(before);
    if (String(beforeText).trim() === String(f.value).trim()) continue;
    changes.push({ ...f, before: beforeText });
  }
  const oldTags = read.tagList(wi.fields['System.Tags']);
  const add = tags(args.tagsAdd), remove = tags(args.tagsRemove).map((t) => t.toLowerCase());
  const newTags = [...new Set([...oldTags.filter((t) => !remove.includes(t.toLowerCase())), ...add])];
  const tagChange = newTags.join('; ') !== oldTags.join('; ') ? { before: oldTags, after: newTags } : null;
  if (!changes.length && !tagChange) throw friendly(`Nothing would change on #${id}: the values are already the same.`);
  const cs = stage(conversationId, { ...base(c, 'update', args.reason), title: `Change #${id} ${wi.fields['System.Title']}`, ops: { id, rev: wi.rev, type: info.name, itemTitle: wi.fields['System.Title'], changes, tags: tagChange } });
  return staged(cs);
}

async function proposeLinks(c, conversationId, args = {}) {
  const links = Array.isArray(args.links) ? args.links : [];
  if (!links.length) throw friendly('Give at least one link.');
  if (links.length > 50) throw friendly('Propose at most 50 links at a time.');
  for (const l of links) if (!REL_TYPES[String(l.type || '').toLowerCase()]) throw friendly(`"${l.type}" isn't a link type. Use one of: ${Object.keys(REL_TYPES).join(', ')}.`);
  const items = await existing(c, links.flatMap((l) => [l.sourceId, String(l.type).toLowerCase() === 'hyperlink' ? null : l.targetId]).filter((x) => x != null));
  const out = [], skipped = [];
  for (const l of links) {
    const type = String(l.type).toLowerCase(), src = items.get(Number(l.sourceId));
    const rel = REL_TYPES[type];
    let url;
    if (type === 'hyperlink') { url = String(l.url || ''); if (!/^https:\/\//i.test(url)) throw friendly('A hyperlink needs an https:// address.'); }
    else { if (Number(l.targetId) === src.id) throw friendly(`#${src.id} can't link to itself.`); url = c.workItemApiUrl(Number(l.targetId)); }
    const already = (src.relations || []).some((r) => r.rel === rel && r.url.toLowerCase().replace(/\/$/, '').endsWith(type === 'hyperlink' ? url.toLowerCase().replace(/\/$/, '') : `/workitems/${Number(l.targetId)}`));
    if (already) { skipped.push(`#${src.id} ${type} ${l.targetId || url}`); continue; }
    if (type === 'parent' && (src.relations || []).some((r) => r.rel === rel)) throw friendly(`#${src.id} already has a parent. Changing a parent isn't supported from Lumen; do it in Azure DevOps.`);
    const target = type === 'hyperlink' ? null : items.get(Number(l.targetId));
    out.push({ sourceId: src.id, sourceTitle: src.fields['System.Title'], type, rel, url, targetId: target?.id || null, targetTitle: target?.fields['System.Title'] || null, comment: String(l.comment || '').slice(0, 200) });
  }
  if (!out.length) throw friendly(`All of those links already exist (${skipped.join(', ')}).`);
  const cs = stage(conversationId, { ...base(c, 'links', args.reason), title: `Add ${plural(out.length, 'link')}`, ops: { links: out, skipped } });
  return staged(cs);
}

async function proposeComment(c, conversationId, args = {}) {
  const id = Number(args.id);
  const wi = (await existing(c, [id])).get(id);
  const md = String(args.text || '').trim();
  if (!md) throw friendly('Write the comment text.');
  if (md.length > 10000) throw friendly('Keep comments under 10,000 characters.');
  const cs = stage(conversationId, { ...base(c, 'comment', args.reason), title: `Comment on #${id} ${wi.fields['System.Title']}`, ops: { id, itemTitle: wi.fields['System.Title'], markdown: md } });
  return staged(cs);
}

const FOOTER = /\n*---\n_Last updated with Lumen, approved by [^\n]*_\s*$/;
async function proposeWikiPage(c, conversationId, args = {}, preferred = []) {
  const wiki = await read.resolveWiki(c, args.wiki, preferred);
  if (wiki.type === 'code') throw friendly(`The ${wiki.name} wiki is published from a Git repository. Lumen can read it but not change it; edit it in the repository instead.`);
  const p = '/' + String(args.path || '').trim().replace(/^\/+|\/+$/g, '');
  if (p === '/') throw friendly('Say which page, for example "/Design/Functional Design".');
  const content = String(args.content ?? '').replace(FOOTER, '');
  if (!content.trim()) throw friendly('The page content is empty.');
  if (content.length > 500000) throw friendly('That page is too large to save from Lumen.');
  const page = await c.pageExists(wiki.id, p);
  if (page) {
    if (!args.etag) throw friendly(`"${p}" already exists. Read it with ado_read_wiki_page first and pass its etag, so nobody's changes are overwritten.`);
    if (page.etag && args.etag !== page.etag) throw friendly(`"${p}" changed since you read it. Read it again before proposing changes.`);
  }
  const before = page ? String(page.content || '').replace(FOOTER, '') : '';
  if (page && before === content) throw friendly('The new content is the same as the page.');
  const cs = stage(conversationId, { ...base(c, 'wiki', args.reason), title: `${page ? 'Update' : 'Create'} wiki page ${p}`, ops: { wikiId: wiki.id, wikiName: wiki.name, path: p, etag: page?.etag || null, exists: !!page, before, content } });
  return staged(cs);
}

// ------------------------------------------------------------------ what the Approve card shows (built from the stored ops, never from AI prose)
function describe(cs) {
  const o = cs.ops || {};
  const rows = [];
  let diff = null;
  if (cs.kind === 'create') {
    o.items.forEach((it, n) => {
      const target = `New ${it.type} ${n + 1}`;
      for (const f of it.fields) rows.push({ target, field: f.label, before: '', after: String(f.value) });
      rows.push({ target, field: 'Tags', before: '', after: it.tags.join(', ') });
      if (it.parentId) rows.push({ target, field: 'Parent', before: '', after: `#${it.parentId} ${it.parentTitle || ''}`.trim() });
      if (it.relatedIds.length) rows.push({ target, field: 'Related', before: '', after: it.relatedIds.map((x) => `#${x}`).join(', ') });
      for (const w of it.wikiLinks) rows.push({ target, field: 'Wiki link', before: '', after: w.label });
    });
  } else if (cs.kind === 'update') {
    for (const ch of o.changes) rows.push({ target: `#${o.id}`, field: ch.label, before: ch.before, after: String(ch.value) });
    if (o.tags) rows.push({ target: `#${o.id}`, field: 'Tags', before: o.tags.before.join(', '), after: o.tags.after.join(', ') });
  } else if (cs.kind === 'links') {
    for (const l of o.links) rows.push({ target: `#${l.sourceId} ${l.sourceTitle}`, field: `Add ${l.type} link`, before: '', after: l.targetId ? `#${l.targetId} ${l.targetTitle}` : l.url });
  } else if (cs.kind === 'comment') {
    rows.push({ target: `#${o.id} ${o.itemTitle}`, field: 'New comment', before: '', after: o.markdown });
  } else if (cs.kind === 'wiki') {
    diff = o.exists ? lineDiff(o.before, o.content) : { tooLarge: false, added: o.content.split('\n').length, removed: 0, lines: o.content.split('\n').slice(0, 400).map((s) => ({ t: '+', s })) };
    rows.push({ target: `Wiki: ${o.wikiName}`, field: o.exists ? 'Update page' : 'New page', before: '', after: o.path });
  }
  const { ops, ...rest } = cs;
  return { ...rest, rows, diff };
}

// ------------------------------------------------------------------ apply (server only, after a person clicks Apply)
const relOp = (rel, url, comment) => ({ op: 'add', path: '/relations/-', value: { rel, url, ...(comment ? { attributes: { comment } } : {}) } });
const fieldOps = (fields) => fields.map((f) => ({ op: 'add', path: `/fields/${f.ref}`, value: f.html ?? f.value }));

async function apply(c, cs, { userName }) {
  const by = String(userName || '').replace(/[\r\n<>]/g, ' ').trim();
  const stamp = `Approved in Lumen by ${by} on ${new Date().toISOString().slice(0, 10)}.`;
  const o = cs.ops;
  const links = [];
  try {
    if (cs.kind === 'create') {
      for (const it of o.items) {
        const ops = [...fieldOps(it.fields), { op: 'add', path: '/fields/System.Tags', value: it.tags.join('; ') }, { op: 'add', path: '/fields/System.History', value: `Created with Lumen. ${stamp}` }];
        if (it.parentId) ops.push(relOp('System.LinkTypes.Hierarchy-Reverse', c.workItemApiUrl(it.parentId)));
        for (const r of it.relatedIds) ops.push(relOp('System.LinkTypes.Related', c.workItemApiUrl(r)));
        for (const w of it.wikiLinks) ops.push(relOp('Hyperlink', w.url, w.label));
        try {
          const made = await c.createWorkItem(it.type, ops);
          links.push({ label: `#${made.id} ${made.fields?.['System.Title'] || ''}`.trim(), url: c.workItemUrl(made.id) });
        } catch (e) {
          if (!links.length) throw e;
          return { status: 'partial', message: `Created ${plural(links.length, 'item')}, then Azure DevOps refused the next one: ${e.message}`, links };
        }
      }
      return { status: 'applied', message: `Created ${plural(links.length, 'work item')}.`, links };
    }
    if (cs.kind === 'update') {
      const ops = [{ op: 'test', path: '/rev', value: o.rev }, ...fieldOps(o.changes), { op: 'add', path: '/fields/System.History', value: `Updated with Lumen. ${stamp}` }];
      if (o.tags) ops.push({ op: 'add', path: '/fields/System.Tags', value: o.tags.after.join('; ') });
      await c.updateWorkItem(o.id, ops);
      return { status: 'applied', message: `Updated #${o.id}.`, links: [{ label: `#${o.id} ${o.itemTitle}`, url: c.workItemUrl(o.id) }] };
    }
    if (cs.kind === 'links') {
      const bySource = new Map();
      for (const l of o.links) bySource.set(l.sourceId, [...(bySource.get(l.sourceId) || []), l]);
      let done = 0;
      for (const [src, ls] of bySource) {
        try { await c.updateWorkItem(src, ls.map((l) => relOp(l.rel, l.url, l.comment || `Linked with Lumen. ${stamp}`))); }
        catch (e) { if (!done) throw e; return { status: 'partial', message: `Added ${plural(done, 'link')}, then: ${e.message}`, links }; }
        done += ls.length;
        links.push({ label: `#${src} ${ls[0].sourceTitle}`, url: c.workItemUrl(src) });
      }
      return { status: 'applied', message: `Added ${plural(done, 'link')}.`, links };
    }
    if (cs.kind === 'comment') {
      await c.addComment(o.id, mdToHtml(`🤖 **Lumen:** ${o.markdown}\n\n_${stamp}_`));
      return { status: 'applied', message: `Commented on #${o.id}.`, links: [{ label: `#${o.id} ${o.itemTitle}`, url: c.workItemUrl(o.id) }] };
    }
    if (cs.kind === 'wiki') {
      const body = `${o.content.replace(/\s+$/, '')}\n\n---\n_Last updated with Lumen, approved by ${by} on ${new Date().toISOString().slice(0, 10)}_\n`;
      if (!o.exists && await c.pageExists(o.wikiId, o.path)) return { status: 'conflict', message: `Someone created "${o.path}" after this was proposed. Ask Lumen to look again.`, links: [] };
      await c.savePage(o.wikiId, o.path, body, o.exists ? o.etag : null);
      return { status: 'applied', message: `${o.exists ? 'Updated' : 'Created'} wiki page ${o.path}.`, links: [{ label: o.path, url: read.pageUrl(c, { name: o.wikiName }, o.path) }] };
    }
    throw new Error(`Unknown change kind ${cs.kind}`);
  } catch (e) {
    if (e.code === 'CONFLICT') {
      const what = cs.kind === 'wiki' ? `"${o.path}"` : `#${o.id ?? ''}`.trim();
      return { status: 'conflict', message: `Someone changed ${what} in Azure DevOps after this was proposed, so nothing was written. Ask Lumen to look again.`, links };
    }
    return { status: 'failed', message: e.friendly ? e.message : `Couldn't apply the change: ${e.message}`, links };
  }
}

/** One-line outcome the AI sees at the start of its next turn. */
const outcomeNote = (cs) => cs.status === 'discarded'
  ? `The user discarded the proposed change "${cs.title}". Nothing was changed.`
  : `The proposed change "${cs.title}" was ${cs.status === 'applied' ? 'applied' : cs.status}: ${cs.result?.message || ''}${cs.result?.links?.length ? ` (${cs.result.links.map((l) => `${l.label} ${l.url}`).join('; ')})` : ''}`;

module.exports = { stage, load, save, list, removeConversation, audit, describe, apply, outcomeNote, proposeWorkItems, proposeUpdate, proposeLinks, proposeComment, proposeWikiPage, REL_TYPES, MAX_ITEMS, TTL };
