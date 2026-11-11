// Lumen front-end: Modal dialogs.
import { icon } from './icons.js';
import { $, $$, esc, toast } from './utils.js';

function modal({ title, sub, body = '', actions = [], wide = false, className = '', onOpen, head, leftAction, dismissable = true }) {
  const root = $('#modalRoot');
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = `
    <div class="modal ${wide ? 'wide' : ''} ${className}" role="dialog" aria-modal="true">
      ${head ?? `<div class="modal-head"><div><h2>${esc(title)}</h2>${sub ? `<p>${esc(sub)}</p>` : ''}</div>${dismissable ? `<button class="icon-btn" data-x>${icon('x')}</button>` : ''}</div>`}
      ${body ? `<div class="modal-body">${body}</div>` : ''}
      ${actions.length || leftAction ? `<div class="modal-foot">${leftAction ? `<button class="btn ${leftAction.danger ? 'danger' : 'ghost'} left" data-left>${leftAction.icon ? icon(leftAction.icon) : ''}${esc(leftAction.label)}</button>` : ''}${actions.map((a, i) => `<button class="btn ${a.primary ? 'primary' : a.grad ? 'grad' : a.danger ? 'primary' : 'ghost'}" data-a="${i}" ${a.danger ? 'style="background:var(--danger);color:#fff"' : ''}>${a.icon ? icon(a.icon) : ''}${esc(a.label)}</button>`).join('')}</div>` : ''}
    </div>`;
  root.appendChild(wrap);
  const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape' && dismissable && root.lastElementChild === wrap) close(); };
  document.addEventListener('keydown', onKey);
  wrap.addEventListener('mousedown', (e) => { if (e.target === wrap && dismissable) close(); });
  wrap.querySelector('[data-x]')?.addEventListener('click', close);
  wrap.querySelector('[data-left]')?.addEventListener('click', async () => { if ((await leftAction.run?.(wrap)) !== false) close(); });
  $$('[data-a]', wrap).forEach((b) => b.addEventListener('click', async () => {
    const a = actions[+b.dataset.a];
    if (!a.run) return close();
    b.disabled = true;
    try { if ((await a.run(wrap)) !== false) close(); } catch (e) { toast(e.message, 'alert'); }
    b.disabled = false;
  }));
  onOpen?.(wrap, close);
  return { el: wrap, close };
}

export { modal };
