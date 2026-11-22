// Visual layer for make_e2e5.js: a livelier theme for the whole deck (drifting aurora, grid, slide and diagram
// entrances, glowing lit parts) and the animated slides of the Decision-1.1 aside. Every number comes from the
// pilot result files (passed in as `data`), never typed in here.
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ------------------------------------------------------------------ theme (whole deck)
const THEME_CSS = `
body { background: #06050d; }
body::before, body::after { content: ''; position: fixed; inset: -25%; z-index: -2; pointer-events: none; filter: blur(70px); }
body::before { background: radial-gradient(640px 420px at 18% 22%, rgba(124,92,255,.55), transparent 70%), radial-gradient(720px 520px at 86% 78%, rgba(255,120,90,.34), transparent 70%); animation: vdrift1 24s ease-in-out infinite alternate; }
body::after { background: radial-gradient(520px 420px at 72% 14%, rgba(40,200,190,.26), transparent 70%), radial-gradient(620px 460px at 22% 86%, rgba(56,132,255,.30), transparent 70%); animation: vdrift2 30s ease-in-out infinite alternate; }
@keyframes vdrift1 { to { transform: translate(7%, 5%) scale(1.1) rotate(7deg); } }
@keyframes vdrift2 { to { transform: translate(-6%, -7%) scale(1.12) rotate(-6deg); } }
.vgrid { position: fixed; inset: 0; z-index: -1; pointer-events: none; background-image: linear-gradient(rgba(255,255,255,.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.04) 1px, transparent 1px); background-size: 56px 56px; -webkit-mask-image: radial-gradient(ellipse at 50% 45%, #000 30%, transparent 78%); mask-image: radial-gradient(ellipse at 50% 45%, #000 30%, transparent 78%); animation: vgrid 40s linear infinite; }
@keyframes vgrid { to { background-position: 56px 56px, 56px 56px; } }
.slide { transform: scale(.982) translateY(10px); filter: blur(6px); transition: opacity .7s ease, transform .9s cubic-bezier(.2,.8,.2,1), filter .8s ease; }
.slide.on { transform: none; filter: none; }
.kicker { display: inline-block; padding: 6px 16px; border-radius: 999px; background: linear-gradient(90deg, rgba(255,176,143,.16), rgba(184,166,255,.16)); border: 1px solid rgba(255,176,143,.45); box-shadow: 0 0 24px -6px rgba(255,176,143,.5); }
.slide.on .kicker { animation: vkin .7s cubic-bezier(.2,.8,.2,1) backwards .15s; }
.slide.on h2 { animation: vkin .8s cubic-bezier(.2,.8,.2,1) backwards .3s; }
@keyframes vkin { from { opacity: 0; transform: translateX(-28px); } }
h2 em { background: linear-gradient(90deg, #b8a6ff, #ffb08f, #7fe3d6, #b8a6ff); background-size: 300% 100%; -webkit-background-clip: text; background-clip: text; animation: vshimmer 8s linear infinite; }
@keyframes vshimmer { to { background-position: 300% 0; } }
.slide.on .dg g[data-k] { animation: vgpop .75s cubic-bezier(.2,.8,.2,1) backwards; animation-delay: calc(var(--i, 0) * 60ms + .3s); }
@keyframes vgpop { from { opacity: 0; transform: translateY(14px); } }
.dg rect:not(.bx) { filter: drop-shadow(0 10px 22px rgba(0,0,0,.45)); }
.dg svg.dimming g[data-k].on { animation: vglow 2.6s ease-in-out infinite; }
@keyframes vglow { 50% { filter: drop-shadow(0 0 26px rgba(184,166,255,.75)); } }
.dg .lp { animation: vdash 1.2s linear infinite; } @keyframes vdash { to { stroke-dashoffset: -28; } }
.editor, .term { box-shadow: 0 0 0 1px rgba(164,139,255,.28), 0 30px 90px -20px rgba(124,92,255,.5); }
.slide.on .editor, .slide.on .term, .slide.on .shot img { animation: vrise .9s cubic-bezier(.2,.8,.2,1) backwards .25s; }
@keyframes vrise { from { opacity: 0; transform: translateY(26px) scale(.985); } }
.tl.err { color: #ff7b72; font-weight: 600; }
.note.show { box-shadow: 0 0 30px -10px rgba(164,139,255,.6); border-color: rgba(184,166,255,.35); }
`;
const THEME_JS = `
(() => {
  const g = document.createElement('div'); g.className = 'vgrid'; document.body.prepend(g);
  document.querySelectorAll('.dg svg').forEach((svg) => svg.querySelectorAll('g[data-k]').forEach((x, i) => x.style.setProperty('--i', i)));
})();
`;

// ------------------------------------------------------------------ shared bits for the aside
const M = { g5: { name: 'gpt-5-mini', tag: 'today', col: '#79b8ff' }, lu: { name: 'gpt-6-luna', tag: 'challenger', col: '#7fe3d6' }, dc: { name: 'Decision-1.1', tag: 'decision model', col: '#ffb08f' } };
const ORDER = ['g5', 'lu', 'dc'];
const chip = (k, extra = '') => `<span class="mchip ${k} ${extra}"><i></i>${esc(M[k].name)}</span>`;
const BASE_CSS = `
.fx { position: relative; height: 730px; }
.mchip { display: inline-flex; align-items: center; gap: 10px; padding: 8px 16px; border-radius: 999px; font: 600 19px 'Segoe UI'; color: #fff; background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.2); white-space: nowrap; }
.mchip i { width: 12px; height: 12px; border-radius: 50%; }
.mchip.g5 i { background: #79b8ff; box-shadow: 0 0 12px #79b8ff; } .mchip.lu i { background: #7fe3d6; box-shadow: 0 0 12px #7fe3d6; } .mchip.dc i { background: #ffb08f; box-shadow: 0 0 12px #ffb08f; }
.mchip.g5 { border-color: rgba(121,184,255,.55); } .mchip.lu { border-color: rgba(127,227,214,.55); } .mchip.dc { border-color: rgba(255,176,143,.6); }
.fx .rise { opacity: 0; transform: translateY(22px); transition: opacity .7s, transform .8s cubic-bezier(.2,.8,.2,1); }
.fx .rise.in { opacity: 1; transform: none; }
.fx .small { font-size: 17px; color: rgba(255,255,255,.6); }
`;

// ------------------------------------------------------------------ 1. the pitch
function hype() {
  return {
    type: 'fx', id: 'x-hype', kicker: 'Aside · the hype check', title: 'Decision models: <em>the hot topic</em>',
    html: `<div class="orb"></div><div class="hero rise" data-s="0"><div class="pill">Microsoft-Decision-1.1 · generally available in Foundry</div><div class="big">Decision models</div><div class="sub">pick from the options you allow · say how sure they are</div></div>
      <div class="claims">${[['⚡', '"2.2× faster"', 'on Copilot routing'], ['💸', '"4.4× lower cost"', 'on Copilot routing'], ['🎯', '"highest average accuracy"', 'across 102 benchmarks']].map(([ic, a, b], i) => `<div class="claim rise" data-s="1" style="transition-delay:${i * 0.35}s"><span>${ic}</span><b>${esc(a)}</b><small>${esc(b)}</small></div>`).join('')}</div>
      <div class="stamp" data-s="2">Does it help <u>my</u> agents?</div>
      <div class="cite small">Claims quoted from Microsoft's GA announcement (2026-11-17), not verified here</div>`,
    css: `${BASE_CSS}
#x-hype .orb { position: absolute; left: 50%; top: 210px; width: 560px; height: 560px; margin-left: -280px; margin-top: -280px; border-radius: 50%; background: conic-gradient(from 0deg, #7c5cff, #ff7a59, #2fd3c0, #3884ff, #7c5cff); filter: blur(60px); opacity: .45; animation: xspin 14s linear infinite; }
@keyframes xspin { to { transform: rotate(360deg); } }
#x-hype .hero { position: relative; text-align: center; margin-top: 18px; }
#x-hype .pill { display: inline-block; padding: 8px 20px; border-radius: 999px; border: 1px solid rgba(255,176,143,.6); background: rgba(255,176,143,.12); font: 600 20px 'Segoe UI'; color: #ffd2bf; letter-spacing: .04em; }
#x-hype .big { font: 800 128px/1.05 'Segoe UI', sans-serif; letter-spacing: -.03em; margin-top: 16px; background: linear-gradient(90deg, #fff, #ffd2bf 40%, #b8a6ff 70%, #fff); background-size: 300% 100%; -webkit-background-clip: text; background-clip: text; color: transparent; animation: vshimmer 7s linear infinite; text-shadow: 0 0 80px rgba(184,166,255,.25); }
#x-hype .sub { font-size: 26px; color: rgba(255,255,255,.78); margin-top: 6px; }
#x-hype .claims { position: relative; display: flex; justify-content: center; gap: 28px; margin-top: 46px; }
#x-hype .claim { width: 400px; padding: 22px 24px; border-radius: 20px; background: rgba(20,16,40,.72); border: 1px solid rgba(255,255,255,.16); box-shadow: 0 20px 60px -20px rgba(0,0,0,.8); display: grid; grid-template-columns: 54px 1fr; align-items: center; }
#x-hype .claim span { font-size: 38px; grid-row: span 2; } #x-hype .claim b { font-size: 25px; color: #fff; } #x-hype .claim small { font-size: 18px; color: rgba(255,255,255,.62); }
#x-hype .stamp { position: absolute; left: 50%; bottom: 56px; transform: translateX(-50%) scale(2.2) rotate(-6deg); opacity: 0; padding: 16px 34px; border: 4px solid #ffb08f; border-radius: 14px; font: 800 46px 'Segoe UI'; color: #ffb08f; letter-spacing: .02em; background: rgba(40,16,10,.55); box-shadow: 0 0 60px -10px rgba(255,176,143,.8); transition: transform .45s cubic-bezier(.3,1.6,.5,1), opacity .25s; }
#x-hype .stamp.in { opacity: 1; transform: translateX(-50%) scale(1) rotate(-3deg); }
#x-hype .stamp u { text-decoration-thickness: 4px; }
#x-hype .cite { position: absolute; bottom: 6px; width: 100%; text-align: center; }`,
    js: `window.FX['x-hype'] = (step) => { const r = document.getElementById('x-hype'); r.querySelectorAll('[data-s]').forEach((e) => e.classList.toggle('in', Number(e.dataset.s) <= step)); };`,
  };
}

// ------------------------------------------------------------------ 2. where it was tried: the two agent flows
function where() {
  const lane = (n, host, kind, skill, uc, nodes, sockIdx, ask) => `<div class="lane" data-lane="${n}">
    <div class="who"><div class="host"><span class="hdot"></span><b>${esc(host)}</b><small>hosted agent · ${esc(kind)}</small></div><div class="skill">skill: <b>${esc(skill)}</b> <small>${esc(uc)}</small></div></div>
    <div class="pipe">${nodes.map((nm, i) => `${i ? '<i class="ar"></i>' : ''}${i === sockIdx
      ? `<div class="n sock" style="--i:${i}"><div class="sname">${esc(nm)}</div><div class="slot">${ORDER.map((k) => chip(k, 'sc')).join('')}</div><div class="swap">⇄ the only step swapped</div></div>`
      : `<div class="n ${nm.startsWith('approve') ? 'hitl' : ''}" style="--i:${i}">${esc(nm)}</div>`}`).join('')}<div class="pulse"></div></div>
    <div class="ask">“${esc(ask)}”</div></div>`;
  return {
    type: 'fx', id: 'x-where', kicker: 'Aside · where it was tried', title: 'One step, <em>inside two real agent flows</em>',
    html: `${lane(1, 'contoso-backlog', 'chat', 'requirements traceability', 'use case 03', ['load_requirements', 'deterministic_links', 'suggest_links', 'verify_candidates', 'detect_exceptions', 'approve 👤'], 2, 'Does work item 5302 implement requirement P-FR-003?  yes / no + confidence')}
      ${lane(2, 'contoso-evidence-job', 'job runner', 'CAE evidence', 'use case 16', ['discover', 'prefilter', 'classify_candidates', 'build_index_and_gaps', 'self_check', 'approve 👤'], 2, 'Is this artifact direct, supporting, or not evidence for control AC-2?')}
      <div class="same rise" data-s="3">Everything else stayed the same: the inputs, the code checks after the step, the human approval · <b>today's model vs ${chip('lu')} vs ${chip('dc')}</b></div>`,
    css: `${BASE_CSS}
#x-where .lane { position: relative; margin-top: 18px; padding: 18px 22px 16px; border-radius: 22px; background: rgba(14,11,30,.66); border: 1px solid rgba(255,255,255,.12); opacity: .18; transition: opacity .7s, box-shadow .7s, border-color .7s; }
#x-where .lane.in { opacity: 1; border-color: rgba(184,166,255,.4); box-shadow: 0 0 60px -20px rgba(124,92,255,.7); }
#x-where .who { display: flex; align-items: baseline; gap: 26px; margin-bottom: 14px; }
#x-where .host b { font: 700 24px 'Segoe UI'; color: #fff; margin-left: 10px; } #x-where .host small { font-size: 17px; color: rgba(255,255,255,.6); margin-left: 10px; }
#x-where .hdot { display: inline-block; width: 12px; height: 12px; border-radius: 50%; background: #8be9a8; box-shadow: 0 0 14px #8be9a8; animation: xblink 1.6s ease-in-out infinite; }
@keyframes xblink { 50% { opacity: .35; } }
#x-where .skill { font-size: 19px; color: rgba(255,255,255,.72); } #x-where .skill b { color: #c9b8ff; } #x-where .skill small { color: rgba(255,255,255,.5); }
#x-where .pipe { position: relative; display: flex; align-items: center; gap: 0; height: 150px; overflow: hidden; }
#x-where .n { flex: none; padding: 14px 16px; border-radius: 14px; font: 500 17px 'Cascadia Code', Consolas, monospace; color: #fff; background: rgba(18,165,148,.18); border: 1px solid rgba(63,197,182,.7); opacity: 0; transform: translateY(12px) scale(.96); transition: opacity .5s, transform .6s cubic-bezier(.2,.8,.2,1); transition-delay: calc(var(--i) * .18s); }
#x-where .n.hitl { background: rgba(245,158,11,.16); border-color: rgba(245,176,65,.8); }
#x-where .lane.in .n { opacity: 1; transform: none; }
#x-where .ar { flex: 1; min-width: 22px; height: 3px; margin: 0 6px; border-radius: 2px; background: repeating-linear-gradient(90deg, rgba(255,255,255,.55) 0 10px, transparent 10px 18px); background-size: 36px 3px; animation: xflow .9s linear infinite; }
@keyframes xflow { to { background-position: 36px 0; } }
#x-where .sock { position: relative; padding: 12px 16px 10px; background: rgba(124,92,255,.22); border: 2px solid #b8a6ff; box-shadow: 0 0 0 0 rgba(184,166,255,.6); }
#x-where .lane.hot .sock { animation: xring 1.8s ease-out infinite; }
@keyframes xring { 0% { box-shadow: 0 0 0 0 rgba(184,166,255,.75); } 100% { box-shadow: 0 0 0 26px rgba(184,166,255,0); } }
#x-where .sname { font: 700 18px 'Cascadia Code', Consolas, monospace; color: #fff; text-align: center; margin-bottom: 8px; }
#x-where .slot { position: relative; width: 236px; height: 44px; }
#x-where .slot .mchip { position: absolute; left: 50%; top: 0; transform: translateX(-50%) translateY(16px) scale(.9); opacity: 0; transition: opacity .18s, transform .3s cubic-bezier(.2,.8,.2,1); font-size: 17px; padding: 7px 14px; }
#x-where .slot .mchip.on { transition: opacity .35s .15s, transform .45s .15s cubic-bezier(.2,.8,.2,1); }
#x-where .slot .mchip.on { opacity: 1; transform: translateX(-50%); }
#x-where .swap { position: absolute; left: 50%; bottom: -30px; transform: translateX(-50%); font: 700 14px 'Segoe UI'; letter-spacing: .12em; text-transform: uppercase; color: #ffb08f; white-space: nowrap; opacity: 0; transition: opacity .5s; }
#x-where .lane.hot .swap { opacity: 1; }
#x-where .pulse { position: absolute; top: 8px; left: 0; width: 14px; height: 14px; border-radius: 50%; background: #fff; box-shadow: 0 0 18px 6px rgba(184,166,255,.9); opacity: 0; }
#x-where .lane.in .pulse { animation: xpulse 4.2s cubic-bezier(.45,0,.55,1) infinite 1.2s; }
@keyframes xpulse { 0% { left: 0; opacity: 0; } 8% { opacity: 1; } 92% { opacity: 1; } 100% { left: calc(100% - 18px); opacity: 0; } }
#x-where .ask { margin-top: 16px; font: italic 400 20px 'Segoe UI'; color: rgba(255,255,255,.8); }
#x-where .same { margin-top: 22px; text-align: center; font-size: 20px; color: rgba(255,255,255,.78); } #x-where .same b { font-weight: 600; } #x-where .same .mchip { font-size: 16px; padding: 5px 12px; margin: 0 4px; }`,
    js: `(() => { let timers = {};
      const cycle = (lane) => { const chips = [...lane.querySelectorAll('.slot .mchip')]; let i = 0; chips.forEach((c, j) => c.classList.toggle('on', j === 0));
        clearInterval(timers[lane.dataset.lane]); timers[lane.dataset.lane] = setInterval(() => { i = (i + 1) % chips.length; chips.forEach((c, j) => c.classList.toggle('on', j === i)); }, 1300); };
      window.FX['x-where'] = (step) => { const r = document.getElementById('x-where'); const [l1, l2] = r.querySelectorAll('.lane');
        l1.classList.toggle('in', step >= 1); l2.classList.toggle('in', step >= 2);
        if (step === 1) { l1.classList.add('hot'); cycle(l1); }
        if (step === 2) { l1.classList.remove('hot'); l2.classList.add('hot'); cycle(l2); }
        if (step >= 3) { l1.classList.add('hot'); l2.classList.add('hot'); if (!timers[1]) cycle(l1); }
        r.querySelectorAll('[data-s]').forEach((e) => e.classList.toggle('in', Number(e.dataset.s) <= step)); };
    })();`,
  };
}

// ------------------------------------------------------------------ 3. the race (real time)
function race(data) {
  const lanes = data.race; // [{k, secs, tokens}], already sorted fastest first
  const maxTok = Math.max(...lanes.map((l) => l.tokens));
  return {
    type: 'fx', id: 'x-race', kicker: 'Aside · real run, 2026-11-22', title: 'The race, <em>in real time</em>',
    html: `<div class="clock"><span>0.0</span> s</div><div class="cap small">link judge · median seconds per requirement call · ${esc(data.raceNote)}</div>
      <div class="lanes">${lanes.map((l) => `<div class="rl" data-secs="${l.secs}"><div class="who">${chip(l.k)}<small>${esc(M[l.k].tag)}</small></div><div class="track"><div class="fill ${l.k}"></div><div class="flag">🏁</div></div><div class="t">${l.secs.toFixed(1)} s</div></div>`).join('')}</div>
      <div class="toks rise" data-s="2"><div class="th">output tokens for the same 48 decisions</div>${lanes.map((l) => `<div class="tk"><div class="bar ${l.k}" style="--w:${Math.max(0.6, 100 * l.tokens / maxTok)}%"></div><div class="num" data-to="${l.tokens}">0</div>${chip(l.k)}</div>`).join('')}</div>`,
    css: `${BASE_CSS}
#x-race .clock { position: absolute; right: 0; top: -92px; font: 700 64px 'Cascadia Code', Consolas, monospace; color: #fff; text-shadow: 0 0 30px rgba(184,166,255,.8); }
#x-race .clock span { display: inline-block; min-width: 150px; text-align: right; }
#x-race .cap { margin: 0 0 18px; }
#x-race .rl { display: grid; grid-template-columns: 300px 1fr 150px; align-items: center; gap: 22px; height: 92px; }
#x-race .who small { display: block; margin: 6px 0 0 6px; font-size: 15px; color: rgba(255,255,255,.55); letter-spacing: .08em; text-transform: uppercase; }
#x-race .track { position: relative; height: 46px; border-radius: 23px; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.14); overflow: hidden; }
#x-race .fill { position: absolute; inset: 0 auto 0 0; width: 0; border-radius: 23px; }
#x-race .fill::after { content: ''; position: absolute; inset: 0; background: linear-gradient(90deg, transparent, rgba(255,255,255,.45), transparent); background-size: 200px 100%; animation: xshine 1.1s linear infinite; mix-blend-mode: overlay; }
@keyframes xshine { from { background-position: -200px 0; } to { background-position: 1200px 0; } }
#x-race .fill.g5 { background: linear-gradient(90deg, #2a5fae, #79b8ff); } #x-race .fill.lu { background: linear-gradient(90deg, #1d8f84, #7fe3d6); } #x-race .fill.dc { background: linear-gradient(90deg, #c8562f, #ffb08f); }
#x-race .flag { position: absolute; right: 12px; top: 50%; transform: translateY(-50%) scale(.6); font-size: 28px; opacity: 0; transition: all .4s cubic-bezier(.3,1.6,.5,1); }
#x-race .rl.done .flag { opacity: 1; transform: translateY(-50%) scale(1.2); }
#x-race .rl.done .track { box-shadow: 0 0 34px -4px rgba(255,255,255,.5); }
#x-race .t { font: 700 40px 'Cascadia Code', Consolas, monospace; color: #fff; opacity: 0; transform: scale(.6); transition: all .4s cubic-bezier(.3,1.6,.5,1); }
#x-race .rl.done .t { opacity: 1; transform: none; }
#x-race .rl.first .t { color: #ffb08f; text-shadow: 0 0 24px rgba(255,176,143,.9); }
#x-race .toks { margin-top: 26px; padding: 22px 26px; border-radius: 20px; background: rgba(14,11,30,.66); border: 1px solid rgba(255,255,255,.12); }
#x-race .th { font: 600 15px 'Segoe UI'; letter-spacing: .14em; text-transform: uppercase; color: rgba(255,255,255,.6); margin-bottom: 12px; }
#x-race .tk { display: grid; grid-template-columns: 1fr 190px 230px; align-items: center; gap: 18px; height: 54px; }
#x-race .bar { height: 18px; width: 0; border-radius: 9px; transition: width 1.6s cubic-bezier(.2,.8,.2,1); }
#x-race .toks.in .bar { width: var(--w); }
#x-race .bar.g5 { background: #79b8ff; box-shadow: 0 0 18px #79b8ff; } #x-race .bar.lu { background: #7fe3d6; box-shadow: 0 0 18px #7fe3d6; } #x-race .bar.dc { background: #ffb08f; box-shadow: 0 0 18px #ffb08f; }
#x-race .num { font: 700 34px 'Cascadia Code', Consolas, monospace; color: #fff; text-align: right; }`,
    js: `(() => { let raf;
      window.FX['x-race'] = (step) => { const r = document.getElementById('x-race');
        if (step === 1) { const t0 = performance.now(); const rows = [...r.querySelectorAll('.rl')]; const max = Math.max(...rows.map((x) => +x.dataset.secs));
          rows.forEach((row, i) => { const s = +row.dataset.secs; const f = row.querySelector('.fill'); f.style.transition = 'width ' + s + 's linear'; void f.offsetWidth; f.style.width = '100%';
            setTimeout(() => { row.classList.add('done'); if (i === 0) row.classList.add('first'); }, s * 1000); });
          const clock = r.querySelector('.clock span'); cancelAnimationFrame(raf);
          const tick = () => { const e = (performance.now() - t0) / 1000; clock.textContent = Math.min(e, max).toFixed(1); if (e < max) raf = requestAnimationFrame(tick); }; tick(); }
        if (step === 2) { const box = r.querySelector('.toks'); box.classList.add('in');
          box.querySelectorAll('.num').forEach((n) => { const to = +n.dataset.to; const t0 = performance.now();
            const go = () => { const p = Math.min(1, (performance.now() - t0) / 1600); n.textContent = Math.round(to * (1 - Math.pow(1 - p, 3))).toLocaleString('en-US'); if (p < 1) requestAnimationFrame(go); }; go(); }); }
        if (step === 'all') { r.querySelectorAll('.rl').forEach((row, i) => { const f = row.querySelector('.fill'); f.style.transition = 'none'; f.style.width = '100%'; row.classList.add('done'); if (i === 0) row.classList.add('first'); });
          r.querySelector('.clock span').textContent = Math.max(...[...r.querySelectorAll('.rl')].map((x) => +x.dataset.secs)).toFixed(1); FX['x-race'](2); } };
    })();`,
  };
}

// ------------------------------------------------------------------ 4. the scoreboard
function score(data) {
  // rows: [group, label, {g5, lu, dc} display, {g5, lu, dc} numeric, better 'hi'|'lo']
  const row = (grp, [label, disp, num, better, note]) => {
    const vals = ORDER.map((k) => num[k]).filter((v) => v !== null && v !== undefined);
    const best = better === 'hi' ? Math.max(...vals) : Math.min(...vals);
    const ties = ORDER.filter((k) => num[k] === best).length;
    return `<div class="sr" data-g="${grp}"><div class="lb">${esc(label)}${note ? `<small>${esc(note)}</small>` : ''}</div>${ORDER.map((k, i) => `<div class="cell ${num[k] === best ? (ties === ORDER.length ? 'tie' : 'win') : ''}" style="--d:${i * 0.12}s"><span>${esc(disp[k])}</span>${num[k] === best && ties < ORDER.length ? '<em>👑</em>' : ''}</div>`).join('')}</div>`;
  };
  return {
    type: 'fx', id: 'x-score', kicker: 'Aside · the results', title: 'Three models, <em>two real decisions</em>',
    html: `<div class="board"><div class="sr hd"><div></div>${ORDER.map((k) => `<div>${chip(k)}</div>`).join('')}</div>
      <div class="gh" data-g="1">Link judge · ${data.linkPairs} pairs · yes / no</div>${data.link.map((r) => row(1, r)).join('')}
      <div class="gh" data-g="2">Evidence classifier · ${data.evidPairs} pairs · direct / supporting / not relevant</div>${data.evid.map((r) => row(2, r)).join('')}
      <div class="gh" data-g="3">When it's unsure, is it wrong?</div>${data.flag.map((r) => row(3, r)).join('')}</div>
      <div class="combo" data-g="4"><span>🧪</span><div><b>${esc(data.combo.title)}</b><small>${esc(data.combo.sub)}</small></div><div class="cv">${esc(data.combo.value)}</div></div>
      <div class="foot small">${esc(data.foot)}</div>`,
    css: `${BASE_CSS}
#x-score .board { width: 1488px; }
#x-score .sr { display: grid; grid-template-columns: 520px repeat(3, 1fr); align-items: center; height: 54px; }
#x-score .sr.hd { height: 48px; } #x-score .sr.hd > div { text-align: center; }
#x-score .gh { margin-top: 10px; padding: 6px 0; font: 600 15px 'Segoe UI'; letter-spacing: .14em; text-transform: uppercase; color: #ffb08f; border-bottom: 1px solid rgba(255,255,255,.12); opacity: .2; transition: opacity .5s; }
#x-score .lb { font-size: 21px; color: rgba(255,255,255,.85); } #x-score .lb small { margin-left: 10px; font-size: 15px; color: rgba(255,255,255,.5); }
#x-score .cell { position: relative; text-align: center; font: 700 30px 'Cascadia Code', Consolas, monospace; color: #fff; opacity: 0; transform: rotateX(90deg); transition: opacity .3s, transform .55s cubic-bezier(.2,.8,.2,1); transition-delay: var(--d); }
#x-score .sr.in .cell { opacity: 1; transform: none; }
#x-score .sr .lb { opacity: .25; transition: opacity .5s; } #x-score .sr.in .lb { opacity: 1; }
#x-score .cell.win span { color: #8be9a8; text-shadow: 0 0 22px rgba(139,233,168,.8); }
#x-score .cell em { position: absolute; top: -14px; margin-left: 6px; font-style: normal; font-size: 24px; transform: scale(0) rotate(-30deg); transition: transform .5s cubic-bezier(.3,1.8,.5,1); transition-delay: calc(var(--d) + .45s); }
#x-score .sr.in .cell em { transform: scale(1) rotate(-12deg); }
#x-score .gh.in { opacity: 1; }
#x-score .combo { display: flex; align-items: center; gap: 22px; margin-top: 18px; padding: 16px 26px; border-radius: 18px; background: linear-gradient(90deg, rgba(255,176,143,.16), rgba(127,227,214,.14)); border: 1px solid rgba(255,176,143,.55); box-shadow: 0 0 60px -16px rgba(255,176,143,.8); opacity: 0; transform: translateY(20px) scale(.98); transition: all .7s cubic-bezier(.2,.8,.2,1); }
#x-score .combo.in { opacity: 1; transform: none; }
#x-score .combo span { font-size: 40px; } #x-score .combo b { display: block; font-size: 23px; color: #fff; } #x-score .combo small { font-size: 17px; color: rgba(255,255,255,.7); }
#x-score .combo .cv { margin-left: auto; font: 800 52px 'Cascadia Code', Consolas, monospace; color: #ffd2bf; text-shadow: 0 0 30px rgba(255,176,143,.9); }
#x-score .foot { margin-top: 10px; text-align: center; }`,
    js: `window.FX['x-score'] = (step) => { const r = document.getElementById('x-score'); const st = step === 'all' ? 9 : step;
      r.querySelectorAll('[data-g]').forEach((e) => e.classList.toggle('in', Number(e.dataset.g) <= st)); };`,
  };
}

// ------------------------------------------------------------------ 5. the gotcha: luna rejects temperature 0
function gotcha(data) {
  return {
    type: 'fx', id: 'x-gotcha', kicker: 'Aside · first surprise', title: 'The cheaper model <em>refused my settings</em>',
    html: `<div class="term2 rise" data-s="0"><div class="tb"><i></i><i></i><i></i><b>PowerShell · ircc-sdlc-agents</b><span>first gpt-6-luna run, 2026-11-22</span></div>
      <div class="tx"><div class="c">$ uv run python evals/decision_pilot/link_judge_pilot.py run --chat-model gpt-6-luna</div>${data.errors.map((l, i) => `<div class="e" style="--i:${i}">${esc(l)}</div>`).join('')}
      <div class="sum" style="--i:${data.errors.length}">${esc(data.errSummary)}</div></div></div>
      <div class="why rise" data-s="1"><div class="code"><div class="sl">every agent's model setting</div><span class="k">temperature</span> <span class="v">0</span><div class="sl2">gpt-6-luna accepts only <span class="v">1</span></div></div><div>Every agent asks for temperature <b>0</b>, so the same input gives the same answer. gpt-6-luna only accepts <b>1</b>. Swapped in blind, every model call fails. To test it at all, it ran at 1, so its answers can vary between runs.</div></div>`,
    css: `${BASE_CSS}
#x-gotcha .term2 { border-radius: 16px; background: #0d1117; border: 1px solid rgba(255,123,114,.5); box-shadow: 0 0 80px -20px rgba(255,90,80,.6); overflow: hidden; }
#x-gotcha .tb { display: flex; align-items: center; gap: 8px; padding: 11px 16px; background: #161b22; font-size: 15px; color: rgba(255,255,255,.65); }
#x-gotcha .tb i { width: 12px; height: 12px; border-radius: 50%; background: #ff5f57; } #x-gotcha .tb i:nth-child(2) { background: #febc2e; } #x-gotcha .tb i:nth-child(3) { background: #28c840; }
#x-gotcha .tb b { margin-left: 10px; color: #fff; } #x-gotcha .tb span { margin-left: auto; font-size: 13px; color: rgba(255,255,255,.45); }
#x-gotcha .tx { padding: 16px 24px; font: 400 17px/1.6 'Cascadia Code', Consolas, monospace; white-space: pre; overflow: hidden; }
#x-gotcha .c { color: #8be9a8; }
#x-gotcha .e, #x-gotcha .sum { opacity: 0; transform: translateX(-10px); transition: opacity .2s, transform .3s; transition-delay: calc(var(--i) * .16s + .4s); color: #ff7b72; }
#x-gotcha .rise.in .e, #x-gotcha .rise.in .sum { opacity: 1; transform: none; }
#x-gotcha .sum { color: #ffd479; font-weight: 700; margin-top: 6px; }
#x-gotcha .rise.in .tx { animation: xshake .5s ease 1.9s; } @keyframes xshake { 20%, 60% { transform: translateX(-8px); } 40%, 80% { transform: translateX(8px); } }
#x-gotcha .why { display: grid; grid-template-columns: 640px 1fr; gap: 30px; align-items: center; margin-top: 26px; font-size: 22px; line-height: 1.5; color: rgba(255,255,255,.85); }
#x-gotcha .why b { color: #ffb08f; }
#x-gotcha .code { padding: 20px 26px; border-radius: 16px; background: rgba(124,92,255,.16); border: 1px solid rgba(184,166,255,.5); font: 700 44px 'Cascadia Code', Consolas, monospace; color: #fff; text-align: center; }
#x-gotcha .sl, #x-gotcha .sl2 { font: 600 15px 'Segoe UI'; letter-spacing: .12em; text-transform: uppercase; color: rgba(255,255,255,.6); margin-bottom: 6px; } #x-gotcha .sl2 { margin: 10px 0 0; color: #ff9b92; }
#x-gotcha .k { color: #79b8ff; } #x-gotcha .v { color: #ffd479; }`,
    js: `window.FX['x-gotcha'] = (step) => { document.getElementById('x-gotcha').querySelectorAll('[data-s]').forEach((e) => e.classList.toggle('in', Number(e.dataset.s) <= step)); };`,
  };
}

// ------------------------------------------------------------------ 6. the verdict
function verdict(data) {
  return {
    type: 'fx', id: 'x-verdict', kicker: 'Aside · so what changed?', title: 'Shipped to production: <em>nothing. Yet.</em>',
    html: `<div class="cards">${data.verdicts.map(([k, lines], i) => `<div class="vc rise ${k}" data-s="1" style="transition-delay:${i * 0.3}s">${chip(k)}<ul>${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul></div>`).join('')}</div>
      <div class="motto" data-s="2"><span class="w1">Always test.</span> <span class="w2">Don't assume.</span></div>
      <div class="tag small" data-s="2">The hype is real. The benchmarks are real. Your agents and your data decide.</div><div class="spark"></div>`,
    css: `${BASE_CSS}
#x-verdict .cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 26px; }
#x-verdict .vc { padding: 20px 22px; border-radius: 20px; background: rgba(14,11,30,.72); border: 1px solid rgba(255,255,255,.14); }
#x-verdict .vc.g5 { box-shadow: 0 0 50px -20px #79b8ff; } #x-verdict .vc.lu { box-shadow: 0 0 50px -20px #7fe3d6; } #x-verdict .vc.dc { box-shadow: 0 0 50px -20px #ffb08f; }
#x-verdict ul { margin: 14px 0 0; padding-left: 22px; font-size: 19px; line-height: 1.5; color: rgba(255,255,255,.82); }
#x-verdict .motto { margin-top: 70px; text-align: center; font: 800 92px/1.1 'Segoe UI', sans-serif; letter-spacing: -.02em; }
#x-verdict .motto span { display: inline-block; opacity: 0; transform: translateY(30px) scale(.9); filter: blur(10px); transition: all .9s cubic-bezier(.2,.8,.2,1); background: linear-gradient(90deg, #ffd2bf, #ffb08f, #b8a6ff, #7fe3d6, #ffd2bf); background-size: 300% 100%; -webkit-background-clip: text; background-clip: text; color: transparent; animation: vshimmer 6s linear infinite; }
#x-verdict .motto .w2 { transition-delay: .7s; }
#x-verdict .motto.in span { opacity: 1; transform: none; filter: drop-shadow(0 0 30px rgba(255,176,143,.6)); }
#x-verdict .tag { text-align: center; margin-top: 14px; font-size: 22px; opacity: 0; transition: opacity 1s 1.4s; } #x-verdict .tag.in { opacity: 1; }
#x-verdict .spark { position: absolute; inset: 0; pointer-events: none; }
#x-verdict .spark i { position: absolute; width: 6px; height: 6px; border-radius: 50%; background: #fff; box-shadow: 0 0 12px 3px rgba(255,210,191,.9); opacity: 0; animation: xsp 3.6s ease-in infinite; }
@keyframes xsp { 0% { opacity: 0; transform: translateY(0) scale(.4); } 20% { opacity: 1; } 100% { opacity: 0; transform: translateY(-160px) scale(1.1); } }`,
    js: `window.FX['x-verdict'] = (step) => { const r = document.getElementById('x-verdict');
      r.querySelectorAll('[data-s]').forEach((e) => e.classList.toggle('in', Number(e.dataset.s) <= step));
      const sp = r.querySelector('.spark'); if (step >= 2 && !sp.childElementCount) { for (let i = 0; i < 46; i++) { const d = document.createElement('i'); d.style.left = (8 + Math.random() * 84) + '%'; d.style.top = (52 + Math.random() * 40) + '%'; d.style.animationDelay = (Math.random() * 3.6) + 's'; sp.appendChild(d); } } };`,
  };
}

// ------------------------------------------------------------------ Microsoft Learn diagrams, with callouts
// Images from Microsoft Learn (CC BY 4.0), credited on the slide. `hot` boxes are in the image's own pixels.
function learnSlide({ id, kicker, title, img, w, h, width, hot, side, credit }) {
  const sc = width / w; const height = Math.round(h * sc);
  return {
    type: 'fx', id, kicker, title,
    html: `<div class="lwrap"><div class="lcard" style="width:${width + 24}px;height:${height + 24}px"><img src="data:image/png;base64,${img}" style="width:${width}px;height:${height}px">
      ${hot.map(([k, x, y, bw, bh]) => `<div class="hot" data-k="${k}" style="left:${12 + x * sc}px;top:${12 + y * sc}px;width:${bw * sc}px;height:${bh * sc}px"></div>`).join('')}</div>
      ${side ? `<div class="lside">${side.map(([k, t, s]) => `<div class="li" data-k="${k}"><b>${esc(t)}</b><small>${esc(s)}</small></div>`).join('')}</div>` : ''}</div>
      <div class="credit">Diagram: Microsoft Learn · ${esc(credit)}</div>`,
    css: `${BASE_CSS}
#${id} .lwrap { display: flex; gap: 34px; justify-content: center; align-items: flex-start; }
#${id} .lcard { position: relative; flex: none; overflow: hidden; padding: 12px; border-radius: 18px; background: ${side ? '#fff' : '#0f1c26'}; box-shadow: 0 0 0 1px rgba(255,255,255,.2), 0 30px 90px -20px rgba(124,92,255,.6); }
#${id} .lcard img { display: block; border-radius: 8px; }
#${id} .hot { position: absolute; border-radius: 12px; border: 4px solid #ff7a59; background: rgba(255,122,89,.10); box-shadow: 0 0 34px 6px rgba(255,122,89,.85), inset 0 0 18px rgba(255,122,89,.5); opacity: 0; transform: scale(1.08); transition: opacity .45s, transform .5s cubic-bezier(.3,1.5,.5,1), box-shadow .6s; }
#${id} .hot.on { opacity: 1; transform: none; animation: lhot 1.8s ease-in-out infinite; }
@keyframes lhot { 50% { border-color: #ffd2bf; } }
#${id} .lside { flex: none; width: 520px; display: flex; flex-direction: column; gap: 16px; margin-top: 30px; }
#${id} .li { padding: 18px 22px; border-radius: 16px; background: rgba(14,11,30,.7); border: 1px solid rgba(255,255,255,.14); opacity: .25; transform: translateX(16px); transition: all .6s cubic-bezier(.2,.8,.2,1); }
#${id} .li.on { opacity: 1; transform: none; border-color: rgba(255,122,89,.7); box-shadow: 0 0 40px -12px rgba(255,122,89,.8); }
#${id} .li b { display: block; font-size: 23px; color: #fff; } #${id} .li small { display: block; margin-top: 6px; font-size: 18px; line-height: 1.4; color: rgba(255,255,255,.72); }
#${id} .credit { position: absolute; bottom: -8px; right: 0; font-size: 15px; color: rgba(255,255,255,.5); }`,
    js: `window.FX['${id}'] = (keys) => { const r = document.getElementById('${id}'); const all = keys === 'all';
      r.querySelector('.lcard').classList.toggle('dim', !!keys && !all);
      r.querySelectorAll('[data-k]').forEach((e) => e.classList.toggle('on', all || (Array.isArray(keys) && keys.includes(e.dataset.k)))); };`,
  };
}

// ------------------------------------------------------------------ a use case becomes a skill, mounted on a host
function skillCard() {
  const skills = [['brd', '01', 'requirements refinement'], ['fdd', '02', 'functional design'], ['tdd', '04', 'technical design'], ['icd', '11', 'interface documents'], ['schema_map', '12', 'schema mapping']];
  return {
    type: 'fx', id: 'x-skill', kicker: 'Inside a host', title: 'A use case becomes <em>a skill on a host</em>',
    html: `<div class="row3">
      <div class="old rise" data-s="0"><div class="lbl">before · its own hosted agent</div><div class="agent">contoso-business-requirements-refinement</div><div class="gone">own identity · own endpoint · own deployment</div></div>
      <div class="arrow rise" data-s="1">➜</div>
      <div class="spec rise" data-s="1"><div class="lbl">now · a skill</div>${[['name', 'brd'], ['use case', '01'], ['was agent', 'contoso-business-requirements-refinement'], ['graph', 'parse → extract → check → render → approve']].map(([k, v], i) => `<div class="kv" style="transition-delay:${0.3 + i * 0.25}s"><span>${k}</span><b>${esc(v)}</b></div>`).join('')}</div></div>
      <div class="host rise" data-s="2"><div class="hh"><span class="hdot"></span><b>contoso-design-author</b><small>one hosted agent · one identity · one endpoint</small></div>
      <div class="slots">${skills.map(([n, uc, d], i) => `<div class="sk ${n === 'brd' ? 'me' : ''}" style="transition-delay:${0.15 * i}s"><b>${n}</b><small>use case ${uc} · ${d}</small></div>`).join('')}</div></div>`,
    css: `${BASE_CSS}
#x-skill .row3 { display: grid; grid-template-columns: 560px 80px 1fr; align-items: center; gap: 10px; }
#x-skill .lbl { font: 600 15px 'Segoe UI'; letter-spacing: .14em; text-transform: uppercase; color: #ffb08f; margin-bottom: 12px; }
#x-skill .old { padding: 24px; border-radius: 20px; background: rgba(255,99,99,.1); border: 1px dashed rgba(255,138,128,.7); }
#x-skill .agent { font: 600 21px 'Cascadia Code', Consolas, monospace; color: #fff; } #x-skill .gone { margin-top: 10px; font-size: 18px; color: rgba(255,255,255,.6); text-decoration: line-through; text-decoration-color: #ff8a80; }
#x-skill .arrow { font-size: 52px; color: #b8a6ff; text-align: center; text-shadow: 0 0 24px rgba(184,166,255,.9); }
#x-skill .spec { padding: 24px; border-radius: 20px; background: rgba(124,92,255,.18); border: 1px solid #b8a6ff; box-shadow: 0 0 60px -20px rgba(124,92,255,.9); }
#x-skill .kv { display: grid; grid-template-columns: 140px 1fr; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,.08); opacity: 0; transform: translateX(-12px); transition: all .5s cubic-bezier(.2,.8,.2,1); }
#x-skill .spec.in .kv { opacity: 1; transform: none; }
#x-skill .kv span { font-size: 18px; color: rgba(255,255,255,.6); } #x-skill .kv b { font: 500 19px 'Cascadia Code', Consolas, monospace; color: #fff; }
#x-skill .host { margin-top: 40px; padding: 22px 26px; border-radius: 22px; background: rgba(18,165,148,.12); border: 1px solid rgba(63,197,182,.7); box-shadow: 0 0 70px -24px rgba(63,197,182,.9); }
#x-skill .hh b { font: 700 26px 'Segoe UI'; color: #fff; margin: 0 14px 0 10px; } #x-skill .hh small { font-size: 18px; color: rgba(255,255,255,.65); }
#x-skill .hdot { display: inline-block; width: 13px; height: 13px; border-radius: 50%; background: #8be9a8; box-shadow: 0 0 14px #8be9a8; }
#x-skill .slots { display: grid; grid-template-columns: repeat(5, 1fr); gap: 16px; margin-top: 18px; }
#x-skill .sk { padding: 16px 18px; border-radius: 14px; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.16); opacity: 0; transform: translateY(14px); transition: all .5s cubic-bezier(.2,.8,.2,1); }
#x-skill .host.in .sk { opacity: 1; transform: none; }
#x-skill .sk b { display: block; font: 700 21px 'Cascadia Code', Consolas, monospace; color: #fff; } #x-skill .sk small { font-size: 16px; color: rgba(255,255,255,.65); }
#x-skill .sk.me { background: rgba(124,92,255,.25); border-color: #b8a6ff; box-shadow: 0 0 34px -6px rgba(184,166,255,.9); }`,
    js: `window.FX['x-skill'] = (step) => { document.getElementById('x-skill').querySelectorAll('[data-s]').forEach((e) => e.classList.toggle('in', Number(e.dataset.s) <= step)); };`,
  };
}

// ------------------------------------------------------------------ how a prompt is assembled: business standard + checked rules
function promptStack() {
  return {
    type: 'fx', id: 'x-prompt', kicker: 'Foundry skills', title: 'One prompt, <em>two owners</em>',
    html: `<div class="pgrid">
      <div class="psrc"><div class="box fsk rise" data-s="1"><div class="lbl">Microsoft Foundry · Tools → Skills</div><b>contoso-requirements-standard</b><small>version 1 · owned by functional leads · editable in the portal</small></div>
        <div class="box code rise" data-s="2"><div class="lbl">the agent's code · reviewed in a pull request</div><b>Checked rules</b><small>excerpts verbatim · source text is only data · no harmful requirements · tested at every release</small></div></div>
      <div class="flowr rise" data-s="1">➜</div>
      <div class="prompt rise" data-s="0"><div class="lbl">the prompt the model receives</div>
        <div class="pl">You are a senior business analyst at Contoso…</div>
        <div class="slot s1" data-s="1"><span>1</span>the business standard <em>· from Foundry, pinned version</em></div>
        <div class="slot s2" data-s="2"><span>2</span>the checked rules <em>· from code</em></div>
        <div class="slot s3" data-s="3"><span>!</span>on any conflict, the checked rules win</div>
        <div class="pl">…the BRD section, as untrusted data</div></div>
      <div class="flowr rise" data-s="3">➜</div><div class="model rise" data-s="3">model</div></div>`,
    css: `${BASE_CSS}
#x-prompt .pgrid { display: grid; grid-template-columns: 470px 70px 640px 70px 1fr; align-items: center; margin-top: 90px; }
#x-prompt .lbl { font: 600 14px 'Segoe UI'; letter-spacing: .14em; text-transform: uppercase; color: rgba(255,255,255,.6); margin-bottom: 8px; }
#x-prompt .box { padding: 22px 24px; border-radius: 18px; margin-bottom: 26px; }
#x-prompt .box b { display: block; font: 700 22px 'Segoe UI'; color: #fff; } #x-prompt .box small { display: block; margin-top: 8px; font-size: 17px; line-height: 1.45; color: rgba(255,255,255,.72); }
#x-prompt .fsk { background: rgba(56,132,255,.16); border: 1px solid #6fa8ff; box-shadow: 0 0 50px -18px #6fa8ff; }
#x-prompt .code { background: rgba(18,165,148,.16); border: 1px solid rgba(63,197,182,.85); box-shadow: 0 0 50px -18px rgba(63,197,182,.9); }
#x-prompt .flowr { font-size: 46px; text-align: center; color: #b8a6ff; text-shadow: 0 0 22px rgba(184,166,255,.9); }
#x-prompt .prompt { padding: 24px; border-radius: 20px; background: #0d1117; border: 1px solid rgba(255,255,255,.18); box-shadow: 0 30px 90px -20px rgba(124,92,255,.55); }
#x-prompt .pl { font: 400 17px 'Cascadia Code', Consolas, monospace; color: rgba(255,255,255,.55); margin: 8px 0; }
#x-prompt .slot { display: flex; align-items: center; gap: 14px; margin: 12px 0; padding: 16px 18px; border-radius: 14px; border: 2px dashed rgba(255,255,255,.2); font-size: 20px; color: rgba(255,255,255,.35); transition: all .6s cubic-bezier(.2,.8,.2,1); }
#x-prompt .slot span { width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center; font: 700 17px 'Segoe UI'; background: rgba(255,255,255,.12); color: #fff; flex: none; }
#x-prompt .slot em { font-style: normal; color: rgba(255,255,255,.5); font-size: 17px; }
#x-prompt .slot.s1.in { border-style: solid; border-color: #6fa8ff; background: rgba(56,132,255,.16); color: #fff; box-shadow: 0 0 30px -8px #6fa8ff; }
#x-prompt .slot.s2.in { border-style: solid; border-color: rgba(63,197,182,.9); background: rgba(18,165,148,.16); color: #fff; box-shadow: 0 0 30px -8px rgba(63,197,182,.9); }
#x-prompt .slot.s3.in { border-style: solid; border-color: #ffb08f; background: rgba(255,176,143,.14); color: #ffd2bf; font-weight: 600; box-shadow: 0 0 30px -8px #ffb08f; }
#x-prompt .model { justify-self: center; width: 150px; height: 150px; border-radius: 50%; display: grid; place-items: center; font: 700 26px 'Segoe UI'; color: #fff; background: radial-gradient(circle at 35% 30%, #a48bff, #3b2a8f); box-shadow: 0 0 60px -6px rgba(164,139,255,.9); }
#x-prompt .model.in { animation: xbeat 1.6s ease-in-out infinite; } @keyframes xbeat { 50% { transform: scale(1.06); } }`,
    js: `window.FX['x-prompt'] = (step) => { document.getElementById('x-prompt').querySelectorAll('[data-s]').forEach((e) => e.classList.toggle('in', Number(e.dataset.s) <= step)); };`,
  };
}

function learnSlides({ hostImg, lifeImg }) {
  return [
    learnSlide({ id: 'x-learn-host', kicker: 'Agents and skills · Microsoft Learn', title: 'A hosted agent in Foundry is <em>a who</em>', img: hostImg, w: 1600, h: 1640, width: 700,
      hot: [['endpoint', 48, 388, 1504, 124], ['versions', 430, 592, 358, 212], ['identity', 812, 592, 358, 212], ['state', 1194, 592, 358, 212]],
      side: [['identity', 'Its own Entra identity', 'created at deploy time; RBAC is granted to it'], ['endpoint', 'One endpoint and protocol', 'Responses or Invocations, Entra-authenticated'], ['state', 'One place its state is kept', 'conversations outlive the compute'], ['versions', 'Its own deployments and versions', 'immutable snapshots, one served at a time']],
      credit: 'Hosted agents in Foundry Agent Service' }),
    learnSlide({ id: 'x-learn-life', kicker: 'Continuous improvement · Microsoft Learn', title: 'Evaluation is <em>a lifecycle</em>, not a step', img: lifeImg, w: 909, h: 484, width: 1290,
      hot: [['pre', 322, 92, 252, 312], ['post', 645, 92, 262, 312]], credit: 'Observability in generative AI (Microsoft Foundry)' }),
  ];
}

module.exports = { THEME_CSS, THEME_JS, asideSlides: (data) => [hype(), where(), gotcha(data), race(data), score(data), verdict(data)], learnSlides, extraSlides: () => [skillCard(), promptStack()] };
