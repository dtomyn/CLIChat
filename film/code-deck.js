// Builds the slide deck for the code explainer (make_code.js): real excerpts (with their real line numbers) from the
// agents repo and from Lumen, a repo tree, flow diagrams and the real LangGraph node graphs (from get_graph()).
// The page exposes window.Deck: show(id), focus(id, fromText, toText), note(id, n), light(id, n), mark(id, names).
const fs = require('fs');
const path = require('path');

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Lines of `file` from the first line matching `start` (string or RegExp), `count` lines or up to `stop`. */
function grab(file, start, { count = 26, stop = null, skipBlankEnd = true, maxWidth = 88 } = {}) {
  const all = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  const at = all.findIndex((l) => (start instanceof RegExp ? start.test(l) : l.includes(start)));
  if (at < 0) throw new Error(`excerpt start not found in ${file}: ${start}`);
  let end = Math.min(all.length, at + count);
  if (stop) { const s = all.findIndex((l, i) => i > at && (stop instanceof RegExp ? stop.test(l) : l.includes(stop))); if (s > 0) end = Math.min(end, s + 1); }
  let lines = all.slice(at, end);
  while (skipBlankEnd && lines.length && !lines[lines.length - 1].trim()) lines.pop();
  lines = lines.map((l) => (l.length > maxWidth ? `${l.slice(0, maxWidth - 1)}…` : l));
  return { first: at + 1, text: lines.join('\n') };
}

function codeSlide(s) {
  return `<section class="slide code-slide" id="${s.id}">
    <div class="head"><div class="kicker">${esc(s.kicker)}</div><h2>${s.title}</h2></div>
    <div class="code-grid">
      <div class="editor"><div class="tab"><i></i><i></i><i></i><b>${esc(s.path)}</b><span>${esc(s.repo)}</span></div>
        <div class="src" data-lang="${s.lang}" data-first="${s.first}"><pre>${esc(s.text)}</pre></div></div>
      <ul class="notes">${s.notes.map((n) => `<li class="note">${n}</li>`).join('')}</ul>
    </div></section>`;
}

function treeSlide(s) {
  return `<section class="slide tree-slide" id="${s.id}"><div class="head"><div class="kicker">${esc(s.kicker)}</div><h2>${s.title}</h2></div>
    <div class="tree">${s.rows.map(([depth, name, tag, desc]) => `<div class="row d${depth} ${tag || ''}"><span class="nm">${esc(name)}</span>${desc ? `<span class="ds">${desc}</span>` : ''}</div>`).join('')}</div></section>`;
}

function flowSlide(s) {
  return `<section class="slide flow-slide" id="${s.id}"><div class="head"><div class="kicker">${esc(s.kicker)}</div><h2>${s.title}</h2></div>
    <div class="flow ${s.layout || ''}">${s.steps.map(([icon, name, sub, kind], i) => `${i ? '<div class="arrow">➜</div>' : ''}<div class="node ${kind || ''}" data-step="${i}"><div class="ic">${icon}</div><b>${name}</b><small>${sub}</small></div>`).join('')}</div>
    ${s.footer ? `<div class="flow-foot">${s.footer}</div>` : ''}</section>`;
}

function graphSlide(s) {
  const nodes = s.graph.nodes.filter((n) => !n.startsWith('__'));
  const kind = (n) => Object.entries(s.kinds).find(([, names]) => names.includes(n))?.[0] || 'io';
  return `<section class="slide graph-slide" id="${s.id}"><div class="head"><div class="kicker">${esc(s.kicker)}</div><h2>${s.title}</h2></div>
    <div class="gwrap"><div class="graph">${nodes.map((n, i) => `<div class="g ${kind(n)}" data-node="${n}"><em>${i + 1}</em>${esc(n)}</div>`).join('')}</div>
    <div class="legend"><span class="g det">computed in Python</span><span class="g llm">model call</span><span class="g hitl">human approval</span><span class="g io">input / output</span></div>
    <p class="gnote">${s.note}</p></div></section>`;
}

function imageSlide(s) {
  const b64 = fs.readFileSync(s.file).toString('base64');
  return `<section class="slide image-slide" id="${s.id}"><div class="head"><div class="kicker">${esc(s.kicker)}</div><h2>${s.title}</h2></div>
    <div class="shot"><img src="data:image/png;base64,${b64}"></div></section>`;
}

// Architecture diagram: an SVG whose <g data-k="..."> groups can be lit (window.Deck.part) while others dim.
function diagramSlide(s) {
  return `<section class="slide diagram-slide" id="${s.id}"><div class="head"><div class="kicker">${esc(s.kicker)}</div><h2>${s.title}</h2></div>
    <div class="dg"><svg viewBox="${s.viewBox}" preserveAspectRatio="xMidYMin meet"><defs>
      <marker id="ah-${s.id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="rgba(255,255,255,.55)"/></marker>
    </defs>${s.svg.replace(/MARKER/g, `ah-${s.id}`)}</svg></div></section>`;
}

// Terminal: real command output, revealed line by line (window.Deck.term).
function termSlide(s) {
  return `<section class="slide term-slide" id="${s.id}"><div class="head"><div class="kicker">${esc(s.kicker)}</div><h2>${s.title}</h2></div>
    <div class="term"><div class="tab"><i></i><i></i><i></i><b>${esc(s.label)}</b><span>${esc(s.note || '')}</span></div>
    <div class="tlines">${s.lines.map(([cls, text]) => `<div class="tl ${cls || ''}">${esc(text) || '&nbsp;'}</div>`).join('')}</div></div></section>`;
}

const CSS = `
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; overflow: hidden; }
body { background: radial-gradient(1400px 800px at 20% 10%, #241b4d 0%, #110d24 50%, #07060f 100%); color: #e8e6f3; font-family: 'Segoe UI', system-ui, sans-serif; }
.slide { position: absolute; inset: 0; padding: 44px 56px; opacity: 0; transition: opacity .6s ease; pointer-events: none; }
.slide.on { opacity: 1; pointer-events: auto; }
.head { margin-bottom: 22px; }
.kicker { font-size: 17px; letter-spacing: .2em; text-transform: uppercase; color: #ffb08f; font-weight: 600; margin-bottom: 6px; }
h2 { font: 500 42px/1.1 'Fraunces', Georgia, serif; margin: 0; color: #fff; }
h2 em { font-style: normal; background: linear-gradient(90deg,#b8a6ff,#ffb08f); -webkit-background-clip: text; background-clip: text; color: transparent; }
.code-grid { display: grid; grid-template-columns: 1020px 1fr; gap: 34px; height: 700px; }
.editor { border-radius: 16px; background: #0d1117; border: 1px solid rgba(255,255,255,.12); box-shadow: 0 30px 80px -20px rgba(0,0,0,.8); overflow: hidden; display: flex; flex-direction: column; }
.tab { display: flex; align-items: center; gap: 8px; padding: 11px 16px; background: #161b22; border-bottom: 1px solid rgba(255,255,255,.08); font-size: 15px; color: rgba(255,255,255,.65); }
.tab i { width: 12px; height: 12px; border-radius: 50%; background: #ff5f57; display: inline-block; } .tab i:nth-child(2) { background: #febc2e; } .tab i:nth-child(3) { background: #28c840; }
.tab b { margin-left: 10px; color: #fff; font-weight: 600; } .tab span { margin-left: auto; font-size: 13px; color: rgba(255,255,255,.45); }
.src { position: relative; flex: 1; overflow: hidden; font: 400 17.5px/1.62 'Cascadia Code', 'Cascadia Mono', Consolas, monospace; padding: 14px 0; }
.src .lines { transition: transform .8s cubic-bezier(.2,.8,.2,1); }
.ln { display: flex; white-space: pre; padding-right: 18px; transition: opacity .5s, background .5s; border-left: 3px solid transparent; }
.ln .no { width: 62px; flex: none; text-align: right; padding-right: 18px; color: rgba(255,255,255,.28); user-select: none; }
.focusing .ln { opacity: .32; }
.focusing .ln.hl { opacity: 1; background: rgba(124,92,255,.16); border-left-color: #a48bff; }
.notes { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-direction: column; gap: 16px; }
.note { font-size: 21px; line-height: 1.45; padding: 16px 20px; border-radius: 14px; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.12); opacity: 0; transform: translateY(14px); transition: opacity .6s, transform .6s cubic-bezier(.2,.8,.2,1); }
.note.show { opacity: 1; transform: none; }
.note b { color: #fff; } .note code { font-family: 'Cascadia Code', Consolas, monospace; font-size: 18px; color: #b8a6ff; }
.tree { font: 400 25px/2.25 'Cascadia Code', Consolas, monospace; background: rgba(6,6,14,.75); border: 1px solid rgba(255,255,255,.12); border-radius: 18px; padding: 30px 40px; height: 720px; display: flex; flex-direction: column; justify-content: center; }
.tree .row { display: flex; gap: 22px; align-items: baseline; opacity: .92; }
.tree .row.d1 { padding-left: 34px; } .tree .row.d2 { padding-left: 68px; }
.tree .nm { min-width: 600px; color: #d8d4ea; } .tree .ds { font: 400 20px/1.4 'Segoe UI', sans-serif; color: rgba(255,255,255,.66); }
.tree .core .nm { color: #8be9a8; } .tree .contract .nm { color: #ffb08f; } .tree .conn .nm { color: #79b8ff; } .tree .agent .nm { color: #c9b8ff; } .tree .ops .nm { color: #f2c46d; }
.tree .row.lit { opacity: 1; } .tree.focusing .row { opacity: .3; } .tree.focusing .row.lit { opacity: 1; }
.flow { display: flex; align-items: center; justify-content: center; gap: 14px; flex-wrap: wrap; margin-top: 70px; }
.flow.tall { margin-top: 40px; }
.node { width: 200px; min-height: 190px; padding: 20px 16px; border-radius: 20px; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.14); text-align: center; transition: all .6s cubic-bezier(.2,.8,.2,1); opacity: .45; }
.node .ic { font-size: 42px; margin-bottom: 10px; } .node b { display: block; font-size: 21px; color: #fff; } .node small { display: block; margin-top: 8px; font-size: 15.5px; line-height: 1.4; color: rgba(255,255,255,.7); }
.node.lit { opacity: 1; background: rgba(124,92,255,.22); border-color: #a48bff; box-shadow: 0 0 40px -6px rgba(124,92,255,.6); transform: translateY(-6px); }
.node.hitl.lit { background: rgba(245,158,11,.2); border-color: #f5b041; box-shadow: 0 0 40px -6px rgba(245,158,11,.6); }
.arrow { font-size: 30px; color: rgba(255,255,255,.4); }
.flow-foot { margin: 44px auto 0; max-width: 1180px; text-align: center; font-size: 22px; color: rgba(255,255,255,.75); }
.gwrap { display: flex; flex-direction: column; align-items: center; }
.graph { display: grid; grid-template-columns: repeat(4, 330px); gap: 20px 26px; margin-top: 20px; }
.g { position: relative; padding: 18px 20px 18px 56px; border-radius: 16px; font: 500 20px/1.2 'Cascadia Code', Consolas, monospace; color: #fff; border: 1px solid rgba(255,255,255,.16); background: rgba(255,255,255,.06); transition: all .5s; }
.g em { position: absolute; left: 16px; top: 50%; transform: translateY(-50%); font-style: normal; font-size: 15px; width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,.14); }
.g.det { background: rgba(18,165,148,.2); border-color: rgba(63,197,182,.7); } .g.llm { background: rgba(124,92,255,.22); border-color: rgba(164,139,255,.8); }
.g.hitl { background: rgba(245,158,11,.2); border-color: rgba(245,176,65,.8); } .g.io { background: rgba(255,255,255,.05); }
.graph.marking .g { opacity: .3; } .graph.marking .g.mk { opacity: 1; transform: scale(1.05); box-shadow: 0 0 34px -4px rgba(255,255,255,.35); }
.legend { display: flex; gap: 16px; margin-top: 30px; } .legend .g { padding: 9px 16px; font: 500 16px 'Segoe UI', sans-serif; }
.gnote { margin-top: 26px; font-size: 22px; color: rgba(255,255,255,.78); max-width: 1300px; text-align: center; }
.dg { display: flex; justify-content: center; } .dg svg { width: 1488px; height: 740px; overflow: visible; }
.dg text { fill: #fff; font-family: 'Segoe UI', system-ui, sans-serif; white-space: pre; }
.dg .t { font-size: 23px; font-weight: 600; } .dg .m { font: 400 16.5px 'Cascadia Code', Consolas, monospace; fill: rgba(255,255,255,.74); }
.dg .s { font-size: 18px; fill: rgba(255,255,255,.66); } .dg .tag { font: 600 15px 'Segoe UI', sans-serif; letter-spacing: .14em; }
.dg rect { stroke-width: 1.6; } .dg .bx { fill: rgba(255,255,255,.05); stroke: rgba(255,255,255,.22); }
.dg .py { fill: rgba(18,165,148,.2); stroke: rgba(63,197,182,.85); } .dg .md { fill: rgba(124,92,255,.24); stroke: #a48bff; }
.dg .hu { fill: rgba(245,158,11,.18); stroke: #f5b041; } .dg .pl { fill: rgba(56,132,255,.16); stroke: #6fa8ff; }
.dg .wa { fill: rgba(255,99,99,.15); stroke: #ff8a80; } .dg .ac { fill: rgba(255,176,143,.16); stroke: #ffb08f; }
.dg .ln2 { fill: none; stroke: rgba(255,255,255,.55); stroke-width: 2; } .dg .lp { fill: none; stroke: #ffb08f; stroke-width: 2.5; stroke-dasharray: 8 6; }
.dg .faded { opacity: .42; } .dg .faded rect { stroke-dasharray: 7 5; }
.dg .badge circle { fill: #ffb08f; } .dg .badge text { fill: #1a1030; font: 700 17px 'Segoe UI', sans-serif; }
.dg g[data-k] { transition: opacity .6s ease, filter .6s ease; }
.dg svg.dimming g[data-k]:not(.on) { opacity: .16; } .dg svg.dimming g[data-k].on { filter: drop-shadow(0 0 18px rgba(164,139,255,.55)); }
.dg svg.dimming g[data-k].faded.on { opacity: .6; }
.term { border-radius: 16px; background: #0d1117; border: 1px solid rgba(255,255,255,.12); box-shadow: 0 30px 80px -20px rgba(0,0,0,.8); overflow: hidden; height: 720px; display: flex; flex-direction: column; }
.tlines { padding: 18px 26px; font: 400 18.5px/1.62 'Cascadia Code', Consolas, monospace; color: rgba(255,255,255,.82); white-space: pre; overflow: hidden; }
.tl { opacity: 0; transition: opacity .25s; } .tl.show { opacity: 1; }
.tl.cmd { color: #8be9a8; } .tl.ok { color: #8be9a8; font-weight: 600; } .tl.url { color: #79b8ff; } .tl.dim { color: rgba(255,255,255,.5); } .tl.hl { color: #ffd479; }
.shot { display: flex; justify-content: center; } .shot img { max-height: 720px; max-width: 1480px; border-radius: 14px; box-shadow: 0 30px 80px -20px rgba(0,0,0,.85); border: 1px solid rgba(255,255,255,.14); }
`;

const JS = `
(() => {
  // Highlight each excerpt as a whole, then split into lines while keeping open <span>s balanced per line.
  function splitHtml(html) {
    const out = []; let open = []; let cur = '';
    const re = /(<span[^>]*>|<\\/span>|\\n)/g; let last = 0; let m;
    while ((m = re.exec(html))) {
      cur += html.slice(last, m.index); last = re.lastIndex;
      if (m[0] === '\\n') { out.push(cur + '</span>'.repeat(open.length)); cur = open.join(''); }
      else if (m[0] === '</span>') { open.pop(); cur += m[0]; }
      else { open.push(m[0]); cur += m[0]; }
    }
    out.push(cur + html.slice(last));
    return out;
  }
  for (const src of document.querySelectorAll('.src')) {
    const code = src.querySelector('pre').textContent;
    const html = window.hljs ? hljs.highlight(code, { language: src.dataset.lang }).value : code.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    const first = Number(src.dataset.first);
    src.innerHTML = '<div class="lines hljs" style="background:transparent">' + splitHtml(html).map((l, i) => '<div class="ln"><span class="no">' + (first + i) + '</span><span class="tx">' + (l || ' ') + '</span></div>').join('') + '</div>';
  }
  const $ = (id) => document.getElementById(id);
  window.Deck = {
    show(id) { document.querySelectorAll('.slide').forEach((s) => s.classList.toggle('on', s.id === id)); },
    focus(id, from, to) {
      const src = $(id).querySelector('.src'); const lines = [...src.querySelectorAll('.ln')];
      if (!from) { src.classList.remove('focusing'); lines.forEach((l) => l.classList.remove('hl')); src.querySelector('.lines').style.transform = ''; return; }
      const a = lines.findIndex((l) => l.textContent.includes(from)); const b = to ? lines.findIndex((l, i) => i >= a && l.textContent.includes(to)) : a;
      lines.forEach((l, i) => l.classList.toggle('hl', i >= a && i <= (b < 0 ? a : b)));
      src.classList.add('focusing');
      const lh = lines[0].getBoundingClientRect().height; const view = src.clientHeight; const mid = ((a + (b < 0 ? a : b)) / 2) * lh;
      const max = Math.max(0, lines.length * lh - view + 28); const shift = Math.min(max, Math.max(0, mid - view / 2 + lh));
      src.querySelector('.lines').style.transform = 'translateY(' + (-shift) + 'px)';
    },
    note(id, n) { $(id).querySelectorAll('.note').forEach((x, i) => x.classList.toggle('show', i < n)); },
    light(id, n) { $(id).querySelectorAll('.node').forEach((x, i) => x.classList.toggle('lit', n === 'all' || i === n)); },
    mark(id, names) { const g = $(id).querySelector('.graph'); g.classList.toggle('marking', !!names); g.querySelectorAll('.g').forEach((x) => x.classList.toggle('mk', !!names && names.includes(x.dataset.node))); },
    part(id, keys) { const svg = $(id).querySelector('.dg svg'); const all = !keys || keys === 'all'; svg.classList.toggle('dimming', !all); svg.querySelectorAll('g[data-k]').forEach((g) => g.classList.toggle('on', !all && keys.includes(g.dataset.k))); },
    term(id, n) { $(id).querySelectorAll('.tl').forEach((x, i) => x.classList.toggle('show', n === 'all' || i < n)); },
    tree(id, names) { const t = $(id).querySelector('.tree'); t.classList.toggle('focusing', !!names); t.querySelectorAll('.row').forEach((r) => r.classList.toggle('lit', !!names && names.some((n) => r.textContent.includes(n)))); },
  };
})();
`;

function buildDeck({ slides, hljsDir, out }) {
  const hljs = fs.readFileSync(path.join(hljsDir, 'highlight.min.js'), 'utf8');
  const theme = fs.readFileSync(path.join(hljsDir, 'styles', 'github-dark.min.css'), 'utf8');
  const body = slides.map((s) => ({ code: codeSlide, tree: treeSlide, flow: flowSlide, graph: graphSlide, image: imageSlide, diagram: diagramSlide, term: termSlide }[s.type])(s)).join('\n');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>SDLC agents: the code</title><style>${theme}${CSS}</style></head><body>${body}<script>${hljs}</script><script>${JS}</script></body></html>`;
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html, 'utf8');
  return out;
}

module.exports = { grab, buildDeck };
