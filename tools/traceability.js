// Requirements traceability analysis for an Excel workbook (a "TRM" / RTM).
//
// The lifecycle layers, upstream → downstream:
//   BR  business requirements → RR refined requirements → FD functional design → TD technical design → BL delivery backlog (epics/features/stories)
//   TC  test cases sit alongside the chain: each traces to a story or a requirement, and is checked for coverage separately.
//
// Two workbook shapes are understood, and can be mixed:
//   1. One sheet per layer, each row an item with an ID and a "Traces To" / "Parent" / "Implements" column listing upstream IDs.
//   2. A matrix sheet ("Trace Matrix", "RTM"…) with one ID column per layer; each row links the IDs on it.
// Sheets and columns are recognised by their names, so the tool adapts to an existing structure.
// Read-only by design: it reports, people decide (the workbook stays the system of record).

const path = require('path');
const { open, cellText } = require('./excel');

const LAYERS = [
  { key: 'BR', name: 'Business requirements', re: /\bbrs?\b|business\s*req|\bbrd\b/i },
  { key: 'RR', name: 'Refined requirements', re: /\brr\b|refined|system\s*req|detailed\s*req/i },
  { key: 'FD', name: 'Functional design', re: /\bfd\b|functional\s*(design|spec)/i },
  { key: 'TD', name: 'Technical design', re: /\btd\b|technical\s*(design|spec)|solution\s*design/i },
  { key: 'BL', name: 'Delivery backlog', re: /backlog|stor(y|ies)|epics?|features?|\bado\b|work\s*items?|\bpbis?\b|\bus\b|delivery/i },
  { key: 'TC', name: 'Test cases', re: /\btests?\b|test\s*cases?|\btc\b|\bsit\b|\buat\b/i },
];
const RANK = Object.fromEntries(LAYERS.map((l, i) => [l.key, i]));
const layerOf = (text) => (LAYERS.find((l) => l.re.test(text)) || {}).key;

const COL = {
  id: /^(id|ref|key|#)$|\bid\b|identifier|reference/i,
  trace: /trace|parent|implement|derive|satisf|reali[sz]|refines|links?|source\s*req|covers|upstream/i,
  title: /title|name|summary|statement|requirement$/i,
  type: /^type$|item\s*type|work\s*item\s*type|category/i,
  status: /\bstatus\b|\bstate\b/i,
  changed: /changed|modified|updated|last\s*change|revised|date/i,
};
const ID_TOKEN = /^[A-Za-z]{1,8}[-_.]?\d+(?:[.-]\d+)*$/;
const CHANGED_STATUS = /chang|revis|updat|supersed|withdraw|delet|reject|conflict|re-?open/i;
const DEAD_STATUS = /withdraw|delet|reject|supersed|cancel|descop|out of scope/i;

const colLetter = (n) => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
const clean = (t) => String(t || '').replace(/ ⟨=.*⟩$/, '').trim();
const toDate = (t) => { const d = new Date(clean(t)); return Number.isNaN(+d) ? null : d; };

function backlogKind(type, id) {
  const t = `${type || ''} ${id || ''}`.toLowerCase();
  if (/epic|\bep[-_]?\d/.test(t)) return 'epic';
  if (/feature|\bft[-_]?\d|\bfeat/.test(t)) return 'feature';
  return 'story';
}

function headerRow(ws) {
  for (let r = 1; r <= Math.min(10, ws.actualRowCount || 10); r++) {
    const row = ws.getRow(r);
    const cells = [];
    for (let c = 1; c <= (ws.actualColumnCount || ws.columnCount); c++) cells.push(clean(cellText(row.getCell(c))));
    if (cells.filter(Boolean).length >= 2) return { r, cells };
  }
  return null;
}

async function analyze(file, { changed = [] } = {}) {
  const wb = await open(file);
  const nodes = new Map(); // id -> node
  const dupes = [];
  const unrecognised = [];

  const add = (id, layer, ref, extra = {}) => {
    const key = id.toUpperCase();
    const have = nodes.get(key);
    if (have && have.defined && extra.defined) { dupes.push({ id, refs: [have.ref, ref] }); return have; }
    if (have) { if (extra.defined) Object.assign(have, { layer, ref, ...extra }); return have; }
    const n = { id, layer, ref, traces: new Set(), broken: [], ...extra };
    nodes.set(key, n);
    return n;
  };

  const pendingLinks = []; // [fromNode, rawTokens, ref]
  for (const ws of wb.worksheets.filter((w) => w.state !== 'veryHidden')) {
    const head = headerRow(ws);
    if (!head) continue;
    const { r: hr, cells } = head;
    const layerCols = cells.map((h, i) => ({ i: i + 1, layer: COL.trace.test(h) ? null : layerOf(h) })).filter((c) => c.layer);
    const isMatrix = /matrix|\brtm\b|\btrm\b|trace/i.test(ws.name) && new Set(layerCols.map((c) => c.layer)).size >= 2;
    const sheetLayer = layerOf(ws.name);

    if (isMatrix) {
      for (let r = hr + 1; r <= ws.actualRowCount; r++) {
        const row = ws.getRow(r);
        const chain = layerCols.map((c) => ({ ...c, ids: clean(cellText(row.getCell(c.i))).split(/[\s,;/]+/).filter((t) => ID_TOKEN.test(t)) })).filter((c) => c.ids.length)
          .sort((a, b) => RANK[a.layer] - RANK[b.layer]);
        for (let k = 1; k < chain.length; k++) {
          for (const down of chain[k].ids) for (const up of chain[k - 1].ids) {
            const n = add(down, chain[k].layer, `${ws.name}!${colLetter(chain[k].i)}${r}`);
            pendingLinks.push([n, [up], `${ws.name}!${colLetter(chain[k].i)}${r}`]);
          }
        }
        for (const c of chain) for (const id of c.ids) add(id, c.layer, `${ws.name}!${colLetter(c.i)}${r}`);
      }
      continue;
    }
    if (!sheetLayer) { if (!/change|log|lookup|list|readme|about|glossary/i.test(ws.name)) unrecognised.push(ws.name); continue; }

    const find = (re, not = []) => cells.findIndex((h, i) => h && re.test(h) && !not.includes(i));
    const idCol = Math.max(0, find(COL.id));
    const traceCols = cells.map((h, i) => (i !== idCol && h && COL.trace.test(h) ? i : -1)).filter((i) => i >= 0);
    const titleCol = find(COL.title, [idCol, ...traceCols]);
    const typeCol = find(COL.type), statusCol = find(COL.status), changedCol = find(COL.changed, [idCol, ...traceCols]);

    for (let r = hr + 1; r <= ws.actualRowCount; r++) {
      const row = ws.getRow(r);
      const val = (i) => (i >= 0 ? clean(cellText(row.getCell(i + 1))) : '');
      const id = val(idCol);
      if (!id || !ID_TOKEN.test(id)) continue;
      const ref = `${ws.name}!${colLetter(idCol + 1)}${r}`;
      const n = add(id, sheetLayer, ref, {
        defined: true, sheet: ws.name, row: r, title: val(titleCol).slice(0, 90), status: val(statusCol),
        kind: sheetLayer === 'BL' ? backlogKind(val(typeCol), id) : undefined, changedAt: toDate(val(changedCol)),
      });
      for (const c of traceCols) {
        const tokens = val(c).split(/[\s,;/]+/).filter(Boolean);
        if (tokens.length) pendingLinks.push([n, tokens, `${ws.name}!${colLetter(c + 1)}${r}`]);
      }
    }
  }

  for (const [n, tokens, ref] of pendingLinks) {
    for (const t of tokens) {
      const up = nodes.get(t.toUpperCase());
      if (up) n.traces.add(up.id);
      else if (ID_TOKEN.test(t)) n.broken.push({ id: t, ref });
    }
  }

  const all = [...nodes.values()];
  const get = (id) => nodes.get(String(id).toUpperCase());
  const children = new Map(all.map((n) => [n.id, []]));
  for (const n of all) for (const u of n.traces) children.get(get(u).id).push(n);
  const isStory = (n) => n.layer === 'BL' && (n.kind || backlogKind('', n.id)) === 'story';
  // Everything below an item. A shared technical component doesn't make every story built on it depend on every
  // design element it serves: a story reached through a TD counts only if it has no FD links of its own, or one is in the walk.
  const downstream = (id) => {
    const start = get(id), seen = new Set();
    const walk = (n) => {
      for (const c of children.get(n.id) || []) {
        if (seen.has(c.id)) continue;
        if (n.layer === 'TD' && c.layer === 'BL') {
          const fds = [...c.traces].map(get).filter((u) => u.layer === 'FD');
          if (fds.length && !fds.some((u) => u.id === start.id || seen.has(u.id))) continue;
        }
        seen.add(c.id); walk(c);
      }
    };
    walk(start);
    return seen;
  };
  const brief = (n) => ({ id: n.id, title: n.title || undefined, status: n.status || undefined, at: n.ref });
  const present = new Set(all.map((n) => n.layer));
  const nextLayer = (key) => LAYERS.slice(RANK[key] + 1).find((l) => present.has(l.key) && l.key !== 'TD' && l.key !== 'TC')?.key;

  // Coverage: every item should be realised by the next layer down (TD is optional per design element).
  const gaps = [];
  for (const n of all) {
    if (n.layer === 'BL' || n.layer === 'TD' || n.layer === 'TC' || DEAD_STATUS.test(n.status || '')) continue;
    const kids = children.get(n.id);
    const want = nextLayer(n.layer);
    if (!want) continue;
    if (n.layer === 'FD') {
      const stories = [...downstream(n.id)].map(get).filter(isStory);
      if (!stories.length) gaps.push({ ...brief(n), missing: 'No delivery story traces to this design element' });
    } else if (!kids.some((k) => k.layer !== 'TC' && RANK[k.layer] > RANK[n.layer])) {
      gaps.push({ ...brief(n), missing: `Not yet covered by any ${LAYERS[RANK[want]].name.toLowerCase()}` });
    }
  }
  const noTechDesign = present.has('TD') ? all.filter((n) => n.layer === 'FD' && !DEAD_STATUS.test(n.status || '') && !children.get(n.id).some((k) => k.layer === 'TD')).map(brief) : [];

  // Links that break the model.
  // Epics and features only organise delivery, so they may hang off nothing; everything else needs an upstream link.
  const untraced = all.filter((n) => n.layer !== 'BR' && !n.broken.length && !(n.layer === 'BL' && n.kind && n.kind !== 'story') && ![...n.traces].some((u) => RANK[get(u).layer] < RANK[n.layer])).map(brief);
  const designBypass = all.filter((n) => isStory(n) && [...n.traces].some((u) => ['BR', 'RR'].includes(get(u).layer)) && ![...n.traces].some((u) => ['FD', 'TD'].includes(get(u).layer)))
    .map((n) => ({ ...brief(n), tracesTo: [...n.traces] }));
  const wrongDirection = all.flatMap((n) => [...n.traces].map(get).filter((u) => RANK[u.layer] > RANK[n.layer]).map((u) => ({ ...brief(n), tracesTo: u.id, note: `${LAYERS[RANK[n.layer]].name} should not depend on ${LAYERS[RANK[u.layer]].name.toLowerCase()}` })));
  const deadUpstream = all.filter((n) => DEAD_STATUS.test(n.status || '')).map((n) => ({ ...brief(n), stillLinked: [...downstream(n.id)].map(get).filter((d) => !DEAD_STATUS.test(d.status || '')).map((d) => d.id) })).filter((x) => x.stillLinked.length);

  // Test coverage (only when the workbook has a test-case layer): a requirement is covered when any live test sits
  // anywhere below it; a story is covered when a live test traces to it directly. Items under a withdrawn
  // requirement need no test (they are already reported as withdrawn but still linked).
  const hasTests = present.has('TC');
  const isLive = (n) => !DEAD_STATUS.test(n.status || '');
  const ancestors = (n, seen = new Set()) => { for (const u of n.traces) { const up = get(u); if (!seen.has(up.id)) { seen.add(up.id); ancestors(up, seen); } } return seen; };
  const inScope = (n) => isLive(n) && ![...ancestors(n)].some((u) => !isLive(get(u)));
  const testsBelow = (id) => [...downstream(id)].map(get).filter((d) => d.layer === 'TC' && isLive(d));
  const testableReqs = (key) => all.filter((n) => n.layer === key && inScope(n));
  const reqNoTest = hasTests ? [...testableReqs('BR'), ...testableReqs('RR')].filter((n) => !testsBelow(n.id).length) : [];
  const reqNoTestIds = new Set(reqNoTest.map((n) => n.id));
  // Don't repeat a refined requirement when its business requirement is already listed.
  const requirementsWithoutTests = reqNoTest.filter((n) => !(n.layer === 'RR' && [...n.traces].some((u) => reqNoTestIds.has(get(u).id)))).map(brief);
  const liveStories = all.filter((n) => isStory(n) && inScope(n));
  const storiesWithoutTests = hasTests ? liveStories.filter((n) => !children.get(n.id).some((k) => k.layer === 'TC' && isLive(k))).map(brief) : [];
  const testsOnWithdrawn = all.filter((n) => n.layer === 'TC' && isLive(n)).map((n) => ({ ...brief(n), withdrawnUpstream: [...ancestors(n)].map(get).filter((u) => !isLive(u)).map((u) => u.id) })).filter((x) => x.withdrawnUpstream.length);

  // Impact: requirements marked as changed (or named by the caller), and anything downstream that is older than its changed source.
  const changedSet = new Set([...changed.map((c) => get(c)?.id).filter(Boolean), ...all.filter((n) => n.layer !== 'BL' && n.layer !== 'TC' && CHANGED_STATUS.test(n.status || '') && !DEAD_STATUS.test(n.status || '')).map((n) => n.id)]);
  const unknownChanged = changed.filter((c) => !get(c));
  const impact = [...changedSet].map((id) => {
    const src = get(id);
    const hit = [...downstream(id)].map(get);
    return { ...brief(src), changedOn: src.changedAt?.toISOString().slice(0, 10), affected: hit.map((d) => ({ id: d.id, layer: d.layer, title: d.title || undefined, at: d.ref, ...(src.changedAt && d.changedAt && d.changedAt < src.changedAt ? { olderThanChange: true } : {}) })) };
  });
  const stale = all.filter((n) => n.changedAt).flatMap((n) => [...n.traces].map(get).filter((u) => u.changedAt && u.changedAt > n.changedAt && !changedSet.has(u.id) && !DEAD_STATUS.test(u.status || ''))
    .map((u) => ({ id: n.id, at: n.ref, upstream: u.id, upstreamChanged: u.changedAt.toISOString().slice(0, 10), itemChanged: n.changedAt.toISOString().slice(0, 10) })));

  const counts = Object.fromEntries(LAYERS.filter((l) => present.has(l.key)).map((l) => [l.name, l.key === 'BL'
    ? ['epic', 'feature', 'story'].map((k) => `${all.filter((n) => n.layer === 'BL' && (n.kind || 'story') === k).length} ${k === 'story' ? 'stories' : `${k}s`}`).join(', ')
    : all.filter((n) => n.layer === l.key).length]));
  const live = (key) => all.filter((n) => n.layer === key && !DEAD_STATUS.test(n.status || ''));
  const pct = (a, b) => (b ? `${Math.round((100 * a) / b)}%` : 'n/a');
  const covered = (key) => live(key).filter((n) => !gaps.some((g) => g.id === n.id));
  const coverage = Object.fromEntries(['BR', 'RR', 'FD'].filter((k) => present.has(k) && nextLayer(k)).map((k) => [`${LAYERS[RANK[k]].name} covered downstream`, `${pct(covered(k).length, live(k).length)} (${covered(k).length}/${live(k).length})`]));
  if (hasTests) {
    for (const k of ['BR', 'RR'].filter((x) => present.has(x))) {
      const scope = testableReqs(k), tested = scope.filter((n) => !reqNoTestIds.has(n.id)).length;
      coverage[`${LAYERS[RANK[k]].name} with tests`] = `${pct(tested, scope.length)} (${tested}/${scope.length})`;
    }
    const testedStories = liveStories.length - storiesWithoutTests.length;
    if (liveStories.length) coverage['Stories with tests'] = `${pct(testedStories, liveStories.length)} (${testedStories}/${liveStories.length})`;
  }

  const broken = all.flatMap((n) => n.broken.map((b) => ({ item: n.id, missingId: b.id, at: b.ref })));
  const problems = gaps.length + broken.length + dupes.length + designBypass.length + wrongDirection.length + deadUpstream.length + requirementsWithoutTests.length + testsOnWithdrawn.length;
  const rag = dupes.length || broken.length || deadUpstream.length || impact.some((i) => i.affected.length) ? 'Red' : problems || untraced.length || stale.length ? 'Amber' : 'Green';

  return {
    workbook: path.basename(file),
    layersFound: counts,
    coverage,
    suggestedRag: rag,
    findings: {
      duplicateIds: dupes,
      brokenLinks: broken,
      coverageGaps: gaps,
      untracedItems: untraced,
      storiesTracingStraightToRequirements: designBypass,
      linksInTheWrongDirection: wrongDirection,
      withdrawnButStillLinked: deadUpstream,
      designElementsWithoutTechnicalDesign: noTechDesign,
      ...(hasTests ? { requirementsWithoutTests, storiesWithoutTests, testsTracingToWithdrawnItems: testsOnWithdrawn } : {}),
      changeImpact: impact,
      possiblyStaleAfterUpstreamChange: stale,
      ...(unknownChanged.length ? { changedIdsNotFound: unknownChanged } : {}),
      ...(unrecognised.length ? { sheetsNotRecognised: unrecognised } : {}),
    },
    note: 'Cell references (Sheet!A12) point at the ID cell of each item. This analysis is read-only; record agreed fixes in the workbook (or a "(proposed)" copy) for human approval.',
  };
}

module.exports = { analyze, LAYERS };
