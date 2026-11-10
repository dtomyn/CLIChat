// Lumen front-end: the chat page's click handler (message actions, file cards, Approve cards, copy buttons).
import { icon } from './icons.js';
import { $, api, toast } from './utils.js';
import { S, isLive } from './state.js';
import { go } from './router.js';
import { setPins, submit } from './composer.js';
import { approvalCache, decideApproval } from './ado-approvals.js';
import { branchFrom, rateReply, rewind, saveAsRecipe, saveEdit, saveReplyMenu, setEditing } from './chat-actions.js';
import { showDiff } from './runs.js';

function chatClicks(e) {
  const ap = e.target.closest('[data-ap-apply],[data-ap-discard],[data-ap-apply-all]');
  if (ap) {
    if (ap.dataset.apApply) decideApproval(ap, [ap.dataset.apApply]);
    else if (ap.dataset.apDiscard) decideApproval(ap, [ap.dataset.apDiscard], true);
    else {
      const m = S.current?.messages?.find((x) => x.id === ap.closest('[data-mid]')?.dataset.mid);
      decideApproval(ap, (m?.approvals || []).filter((x) => approvalCache.get(x)?.status === 'pending'));
    }
    return;
  }
  const t = e.target.closest('[data-toggle-steps],[data-copy-msg],[data-retry],[data-open-file],[data-pin-file],[data-diff-file],[data-copy-code],[data-copy-table],[data-starter],[data-suggest],[data-edit-msg],[data-edit-save],[data-edit-cancel],[data-branch],[data-go-conv],[data-save-as],[data-rate],[data-save-recipe]');
  if (!t) return;
  const c = S.current;
  const mid = t.closest('[data-mid]')?.dataset.mid;
  if (t.dataset.pinFile) setPins(c, [...new Set([...pinsFor(c), t.dataset.pinFile])]);
  else if (t.dataset.diffFile) showDiff(t.dataset.diffFile, mid, c.workspace);
  else if (t.dataset.toggleSteps) { const id = t.dataset.toggleSteps; S.openSteps.has(id) ? S.openSteps.delete(id) : S.openSteps.add(id); t.parentElement.classList.toggle('open'); }
  else if ('saveAs' in t.dataset) saveReplyMenu(c, mid, t);
  else if (t.dataset.rate) rateReply(c, mid, t.dataset.rate);
  else if ('saveRecipe' in t.dataset) saveAsRecipe(c, mid);
  else if (t.dataset.copyMsg) { const m = c.messages.find((x) => x.id === t.dataset.copyMsg); navigator.clipboard.writeText(m.content); flash(t, 'Copied'); }
  else if ('copyCode' in t.dataset) { navigator.clipboard.writeText(t.closest('pre').querySelector('code').innerText); flash(t, 'Copied'); }
  else if ('copyTable' in t.dataset) copyTable(t);
  else if (t.dataset.suggest) {
    if (e.shiftKey) { const i = $('#input'); if (i) { i.value = t.dataset.suggest; i.dispatchEvent(new Event('input')); i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }
    else if (!isLive(c)) submit(t.dataset.suggest);
  }
  else if ('editMsg' in t.dataset) { if (!isLive(c)) setEditing(mid); }
  else if ('editCancel' in t.dataset) setEditing(null);
  else if ('editSave' in t.dataset) saveEdit(mid);
  else if (t.dataset.branch) { if (!isLive(c)) branchFrom(c, t.dataset.branch); }
  else if (t.dataset.goConv) go(`c/${t.dataset.goConv}`);
  else if (t.dataset.retry) {
    if (isLive(c)) return;
    const idx = c.messages.findIndex((x) => x.id === t.dataset.retry);
    const uIdx = c.messages.slice(0, idx).map((x) => x.role).lastIndexOf('user');
    if (uIdx < 0) return;
    const prevUser = c.messages[uIdx];
    rewind(c, uIdx, prevUser.content, { retryNote: true });
  }
  else if (t.dataset.openFile) api('/api/folder/open', { method: 'POST', body: { path: t.dataset.openFile, workspace: c.workspace } });
}
function flash(btn, text) { const html = btn.innerHTML; btn.innerHTML = `${icon('check')}${text}`; setTimeout(() => { btn.innerHTML = html; }, 1400); }

// Copy a rendered table as HTML (keeps the grid in Outlook/Word) and as tab-separated text (separate cells in Excel).
async function copyTable(btn) {
  const table = btn.closest('.table-wrap')?.querySelector('table'); if (!table) return;
  const tsv = [...table.rows].map((r) => [...r.cells].map((cell) => cell.innerText.replace(/[\t\r\n]+/g, ' ').trim()).join('\t')).join('\n');
  const clone = table.cloneNode(true);
  clone.setAttribute('border', '1');
  clone.style.cssText = 'border-collapse:collapse;font-family:Calibri,Arial,sans-serif;font-size:11pt';
  clone.querySelectorAll('th,td').forEach((cell) => Object.assign(cell.style, { border: '1px solid #999', padding: '4px 8px', verticalAlign: 'top' }));
  clone.querySelectorAll('th').forEach((cell) => Object.assign(cell.style, { background: '#f2f2f2', fontWeight: 'bold' }));
  try {
    if (window.ClipboardItem && navigator.clipboard.write) {
      await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([clone.outerHTML], { type: 'text/html' }), 'text/plain': new Blob([tsv], { type: 'text/plain' }) })]);
    } else await navigator.clipboard.writeText(tsv);
    flash(btn, 'Copied');
  } catch { toast("Couldn't copy the table", 'alert'); }
}

export { chatClicks };
