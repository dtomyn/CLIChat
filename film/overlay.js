// Film overlay injected into Lumen while filming: cursor, click ripples, camera zoom, title and persona cards.
// The camera transforms <body>; the overlay lives on <html>, so it stays in screen space.
(() => {
  if (window.Film) return;
  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); } else init();
  function init() {
  const css = `
  #film-layer { position: fixed; inset: 0; pointer-events: none; z-index: 2147483000; font-family: 'Inter', 'Segoe UI', system-ui, sans-serif; }
  #film-cursor { position: fixed; left: 0; top: 0; width: 30px; height: 30px; transform: translate(-200px, -200px); filter: drop-shadow(0 3px 6px rgba(0,0,0,.35)); transition: opacity .3s; z-index: 3; }
  #film-cursor svg { width: 30px; height: 30px; display: block; transition: transform .12s; transform-origin: 4px 3px; }
  #film-cursor.down svg { transform: scale(.82); }
  .film-ripple { position: fixed; width: 18px; height: 18px; margin: -9px 0 0 -9px; border-radius: 50%; border: 3px solid rgba(124,92,255,.95); background: rgba(124,92,255,.18); animation: film-ripple .65s cubic-bezier(.2,.8,.2,1) forwards; z-index: 2; }
  @keyframes film-ripple { to { transform: scale(4.2); opacity: 0; } }
  .film-card { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity .7s ease; z-index: 4; overflow: hidden;
    background: radial-gradient(1200px 700px at 30% 20%, #2a1f5c 0%, #120d26 55%, #07060f 100%); color: #fff; }
  .film-card.show { opacity: 1; }
  .film-card .glow { position: absolute; width: 900px; height: 900px; border-radius: 50%; filter: blur(80px); opacity: .55; animation: film-drift 9s ease-in-out infinite alternate; }
  .film-card .g1 { background: #7c5cff; left: -200px; top: -300px; } .film-card .g2 { background: #ff8a5b; right: -300px; bottom: -400px; animation-delay: -3s; } .film-card .g3 { background: #c757d6; left: 40%; top: 30%; width: 500px; height: 500px; opacity: .35; animation-delay: -6s; }
  @keyframes film-drift { to { transform: translate(120px, 80px) scale(1.15); } }
  .film-card .inner { position: relative; text-align: center; max-width: 1100px; padding: 0 60px; }
  .film-card .logo { width: 120px; height: 120px; margin: 0 auto 34px; border-radius: 34px; background: linear-gradient(135deg,#7c5cff,#c757d6 55%,#ff8a5b); display: flex; align-items: center; justify-content: center; box-shadow: 0 30px 80px -10px rgba(124,92,255,.8); }
  .film-card .logo svg { width: 64px; height: 64px; animation: film-spin 12s linear infinite; }
  @keyframes film-spin { to { transform: rotate(360deg); } }
  .film-card h1 { font: 500 92px/1.05 'Fraunces', Georgia, serif; letter-spacing: -.02em; margin: 0 0 18px; }
  .film-card h1 em { font-style: normal; background: linear-gradient(90deg,#b8a6ff,#ffb08f); -webkit-background-clip: text; background-clip: text; color: transparent; }
  .film-card p { font-size: 30px; color: rgba(255,255,255,.78); margin: 0; line-height: 1.4; }
  .film-card .pills { display: flex; gap: 14px; justify-content: center; margin-top: 34px; flex-wrap: wrap; }
  .film-card .pills span { font-size: 21px; padding: 10px 20px; border-radius: 999px; background: rgba(255,255,255,.1); border: 1px solid rgba(255,255,255,.18); }
  .film-card .rise { opacity: 0; transform: translateY(26px); animation: film-rise .9s cubic-bezier(.2,.8,.2,1) forwards; }
  @keyframes film-rise { to { opacity: 1; transform: none; } }
  .film-card .avatar { width: 150px; height: 150px; border-radius: 50%; margin: 0 auto 28px; display: flex; align-items: center; justify-content: center; font-size: 74px; box-shadow: 0 24px 70px -12px rgba(0,0,0,.7), inset 0 0 0 4px rgba(255,255,255,.25); }
  .film-card .kicker { font-size: 22px; letter-spacing: .22em; text-transform: uppercase; color: #ffb08f; margin-bottom: 14px; font-weight: 600; }
  .film-card .need { display: inline-flex; gap: 12px; align-items: center; margin-top: 30px; font-size: 24px; padding: 14px 24px; border-radius: 16px; background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.16); color: rgba(255,255,255,.92); }
  #film-third { position: fixed; left: 48px; bottom: 44px; display: flex; align-items: center; gap: 16px; padding: 14px 26px 14px 14px; border-radius: 22px; background: rgba(18,13,38,.86); backdrop-filter: blur(12px); color: #fff; box-shadow: 0 20px 50px -14px rgba(0,0,0,.6); transform: translateX(-140%); opacity: 0; transition: transform .8s cubic-bezier(.2,.8,.2,1), opacity .5s; z-index: 3; }
  #film-third.show { transform: none; opacity: 1; }
  #film-third .av { width: 58px; height: 58px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 30px; }
  #film-third b { display: block; font-size: 22px; } #film-third span { font-size: 16px; color: rgba(255,255,255,.72); }
  #film-badge { position: fixed; right: 40px; top: 32px; padding: 12px 20px; border-radius: 14px; background: rgba(18,13,38,.86); color: #fff; font-size: 19px; font-weight: 600; display: flex; gap: 10px; align-items: center; transform: translateY(-160%); opacity: 0; transition: transform .7s cubic-bezier(.2,.8,.2,1), opacity .4s; z-index: 3; box-shadow: 0 16px 40px -12px rgba(0,0,0,.5); }
  #film-badge.show { transform: none; opacity: 1; }
  #film-spot { position: fixed; border-radius: 16px; box-shadow: 0 0 0 4px rgba(124,92,255,.9), 0 0 0 9999px rgba(10,8,20,.0); transition: all .6s cubic-bezier(.2,.8,.2,1); opacity: 0; z-index: 1; }
  #film-spot.show { opacity: 1; box-shadow: 0 0 0 4px rgba(124,92,255,.95), 0 0 40px 6px rgba(124,92,255,.45), 0 0 0 9999px rgba(10,8,20,.28); }
  body.film-cam { transition: transform var(--film-ms, 900ms) cubic-bezier(.45,.05,.25,1); transform-origin: 0 0; will-change: transform; }
  `;
  const style = document.createElement('style'); style.textContent = css; document.documentElement.appendChild(style);
  const layer = document.createElement('div'); layer.id = 'film-layer';
  layer.innerHTML = `<div id="film-spot"></div><div id="film-cursor"><svg viewBox="0 0 24 24"><path d="M4 2.5 19.5 13l-7 1.2 4 7.4-3.2 1.6-4-7.5L4 20.6z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg></div><div id="film-third"></div><div id="film-badge"></div>`;
  document.documentElement.appendChild(layer);
  const cursor = layer.querySelector('#film-cursor');
  let cx = -200, cy = -200;
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const place = () => { cursor.style.transform = `translate(${cx - 4}px, ${cy - 3}px)`; };

  const Film = {
    moveTo(x, y, ms = 700) {
      return new Promise((resolve) => {
        const sx = cx, sy = cy, t0 = performance.now();
        if (sx < -100) { cx = x + 260; cy = y + 180; }
        const fx = cx, fy = cy;
        // gentle arc
        const mx = (fx + x) / 2 + (y - fy) * 0.12, my = (fy + y) / 2 - (x - fx) * 0.12;
        const step = (now) => {
          const k = Math.min(1, (now - t0) / ms), e = ease(k);
          cx = (1 - e) * (1 - e) * fx + 2 * (1 - e) * e * mx + e * e * x;
          cy = (1 - e) * (1 - e) * fy + 2 * (1 - e) * e * my + e * e * y;
          place();
          if (k < 1) requestAnimationFrame(step); else resolve();
        };
        requestAnimationFrame(step);
      });
    },
    press() { cursor.classList.add('down'); const r = document.createElement('div'); r.className = 'film-ripple'; r.style.left = `${cx}px`; r.style.top = `${cy}px`; layer.appendChild(r); setTimeout(() => r.remove(), 700); setTimeout(() => cursor.classList.remove('down'), 140); },
    hideCursor(v = true) { cursor.style.opacity = v ? 0 : 1; },

    // Camera: zoom so that rect (viewport coords, unzoomed) fills `scale` and is centred.
    zoom(rect, scale = 1.6, ms = 1100) {
      const b = document.body; b.classList.add('film-cam'); b.style.setProperty('--film-ms', `${ms}ms`);
      const W = innerWidth, H = innerHeight;
      const cxr = rect.x + rect.width / 2, cyr = rect.y + rect.height / 2;
      let tx = W / 2 - cxr * scale, ty = H / 2 - cyr * scale;
      tx = Math.min(0, Math.max(W - W * scale, tx)); ty = Math.min(0, Math.max(H - H * scale, ty));
      b.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
      Film.cam = { tx, ty, scale };
    },
    unzoom(ms = 900) { const b = document.body; b.classList.add('film-cam'); b.style.setProperty('--film-ms', `${ms}ms`); b.style.transform = 'translate(0px, 0px) scale(1)'; Film.cam = { tx: 0, ty: 0, scale: 1 }; },
    cam: { tx: 0, ty: 0, scale: 1 },
    // Convert an element's current on-screen rect back to unzoomed layout coords.
    layoutRect(el) { const r = el.getBoundingClientRect(); const c = Film.cam; return { x: (r.x - c.tx) / c.scale, y: (r.y - c.ty) / c.scale, width: r.width / c.scale, height: r.height / c.scale }; },

    spot(el, pad = 8) {
      const s = layer.querySelector('#film-spot');
      if (!el) { s.classList.remove('show'); return; }
      const r = el.getBoundingClientRect();
      Object.assign(s.style, { left: `${r.x - pad}px`, top: `${r.y - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
      s.classList.add('show');
    },

    card(html, { fadeMs = 700, persist = false } = {}) {
      Film.uncard(0);
      try { if (persist) sessionStorage.filmCard = html; else delete sessionStorage.filmCard; } catch {}
      const c = document.createElement('div'); c.className = 'film-card'; c.id = 'film-card';
      c.innerHTML = `<div class="glow g1"></div><div class="glow g2"></div><div class="glow g3"></div><div class="inner">${html}</div>`;
      c.style.transitionDuration = `${fadeMs}ms`;
      layer.appendChild(c); requestAnimationFrame(() => requestAnimationFrame(() => c.classList.add('show')));
    },
    uncard(ms = 800) { try { delete sessionStorage.filmCard; } catch {} const c = layer.querySelector('#film-card'); if (!c) return; c.style.transitionDuration = `${ms}ms`; c.classList.remove('show'); setTimeout(() => c.remove(), ms + 50); },
    third(html) { const t = layer.querySelector('#film-third'); if (!html) { t.classList.remove('show'); return; } t.innerHTML = html; t.classList.add('show'); },
    badge(html) { const t = layer.querySelector('#film-badge'); if (!html) { t.classList.remove('show'); return; } t.innerHTML = html; t.classList.add('show'); },
  };
  window.Film = Film;
  // A card that was up when the page reloaded comes straight back, so a reload never flashes.
  try { if (sessionStorage.filmCard) { Film.card(sessionStorage.filmCard, { fadeMs: 0, persist: true }); } } catch {}
  }
})();
