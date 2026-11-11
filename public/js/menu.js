// Lumen front-end: Pop-up menus.
import { icon } from './icons.js';
import { $, esc } from './utils.js';

let menuEl = null;
// `search` (a placeholder string) adds a filter box above the items: typing narrows them by label and hint,
// arrow keys move, Enter picks. Items marked `keep` (e.g. "Create an agent") stay visible while filtering.
function openMenu(anchor, items, { align = 'left', title, search } = {}) {
  closeMenu();
  menuEl = document.createElement('div');
  menuEl.className = 'menu' + (search ? ' menu-search' : '');
  const itemHTML = (it, i) => it.sep ? '<div class="menu-sep"></div>' : it.heading ? `<div class="menu-title">${esc(it.heading)}</div>` : `
    <button class="menu-item ${it.selected ? 'selected' : ''} ${it.danger ? 'danger' : ''}" data-i="${i}">
      ${it.emoji ? `<span style="font-size:17px;width:20px;text-align:center">${it.emoji}</span>` : it.icon ? icon(it.icon) : ''}
      <span class="mi-text"><span>${esc(it.label)}</span>${it.hint ? `<span class="mi-hint">${esc(it.hint)}</span>` : ''}</span>
      ${it.selected !== undefined ? icon('check', 'check') : ''}
    </button>`;
  menuEl.innerHTML = (title ? `<div class="menu-title">${esc(title)}</div>` : '')
    + (search ? `<input class="menu-filter" type="search" placeholder="${esc(search)}" aria-label="${esc(search)}" autocomplete="off">` : '')
    + `<div class="menu-list">${items.map(itemHTML).join('')}</div>`;
  document.body.appendChild(menuEl);
  if (search) {
    const box = $('.menu-filter', menuEl), list = $('.menu-list', menuEl);
    let shown = [], focus = 0;
    const paintFocus = () => shown.forEach((b, i) => b.classList.toggle('focus', i === focus));
    const filter = () => {
      const q = box.value.trim().toLowerCase();
      if (!q) { list.innerHTML = items.map(itemHTML).join(''); }
      else {
        const hits = items.map((it, i) => [it, i]).filter(([it]) => !it.sep && !it.heading && !it.keep && `${it.label} ${it.hint || ''}`.toLowerCase().includes(q))
          .sort(([a], [b]) => b.label.toLowerCase().startsWith(q) - a.label.toLowerCase().startsWith(q));
        const keep = items.map((it, i) => [it, i]).filter(([it]) => it.keep);
        list.innerHTML = (hits.length ? hits.map(([it, i]) => itemHTML(it, i)).join('') : `<div class="conv-empty" style="padding:10px">Nothing matches “${esc(box.value.trim())}”.</div>`)
          + (keep.length ? '<div class="menu-sep"></div>' + keep.map(([it, i]) => itemHTML(it, i)).join('') : '');
      }
      // The same item can appear twice (e.g. under "Pinned" and "All"); only list it once in keyboard order.
      const ids = new Set();
      shown = [...list.querySelectorAll('[data-i]')].filter((b) => !ids.has(b.dataset.i) && ids.add(b.dataset.i));
      focus = 0; if (q) paintFocus();
      list.scrollTop = 0;
    };
    box.addEventListener('input', filter);
    box.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); closeMenu(); anchor.focus?.(); return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault(); if (!shown.length) return;
        focus = (focus + (e.key === 'ArrowDown' ? 1 : -1) + shown.length) % shown.length;
        paintFocus(); shown[focus].scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter') { e.preventDefault(); shown[focus]?.click(); }
    });
    filter();
  }
  const r = anchor.getBoundingClientRect();
  const mw = menuEl.offsetWidth, mh = menuEl.offsetHeight;
  let top = r.bottom + 6; if (top + mh > innerHeight - 8) top = r.top - mh - 6;
  let left = align === 'right' ? r.right - mw : r.left; left = Math.max(8, Math.min(left, innerWidth - mw - 8));
  Object.assign(menuEl.style, { top: `${Math.max(8, top)}px`, left: `${left}px` });
  menuEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-i]'); if (!b) return;
    const it = items[+b.dataset.i]; closeMenu(); it.run && it.run();
  });
  setTimeout(() => document.addEventListener('mousedown', outside), 0);
  function outside(e) { if (menuEl && !menuEl.contains(e.target)) { closeMenu(); } }
  menuEl._off = () => document.removeEventListener('mousedown', outside);
  if (search) $('.menu-filter', menuEl).focus();
}
function closeMenu() { if (menuEl) { menuEl._off?.(); menuEl.remove(); menuEl = null; } }

export { closeMenu, menuEl, openMenu };
