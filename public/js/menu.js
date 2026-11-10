// Lumen front-end: Pop-up menus.
import { icon } from './icons.js';
import { $, esc } from './utils.js';

let menuEl = null;
function openMenu(anchor, items, { align = 'left', title } = {}) {
  closeMenu();
  menuEl = document.createElement('div');
  menuEl.className = 'menu';
  menuEl.innerHTML = (title ? `<div class="menu-title">${esc(title)}</div>` : '') + items.map((it, i) => it.sep ? '<div class="menu-sep"></div>' : it.heading ? `<div class="menu-title">${esc(it.heading)}</div>` : `
    <button class="menu-item ${it.selected ? 'selected' : ''} ${it.danger ? 'danger' : ''}" data-i="${i}">
      ${it.emoji ? `<span style="font-size:17px;width:20px;text-align:center">${it.emoji}</span>` : it.icon ? icon(it.icon) : ''}
      <span class="mi-text"><span>${esc(it.label)}</span>${it.hint ? `<span class="mi-hint">${esc(it.hint)}</span>` : ''}</span>
      ${it.selected !== undefined ? icon('check', 'check') : ''}
    </button>`).join('');
  document.body.appendChild(menuEl);
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
}
function closeMenu() { if (menuEl) { menuEl._off?.(); menuEl.remove(); menuEl = null; } }

export { closeMenu, menuEl, openMenu };
