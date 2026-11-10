// Lumen front-end: Azure DevOps Approve cards.
import { icon } from './icons.js';
import { $, $$, api, esc, timeAgo, toast } from './utils.js';
import { S } from './state.js';
import { openSettings } from './settings.js';

// The card is drawn from the change set the server stored, never from the AI's own words. Only Apply writes to Azure DevOps.
const approvalCache = new Map(); // change set id -> described change set
const approvalLoading = new Set();
const AP_STATUS = {
  pending: ['Waiting for your approval', 'warn'], applied: ['Applied', 'ok'], partial: ['Partly applied', 'warn'], discarded: ['Discarded', 'muted'],
  expired: ['Expired', 'muted'], conflict: ['Changed in Azure DevOps first', 'bad'], failed: ["Couldn't apply", 'bad'],
};

function loadApproval(id) {
  const conv = S.current;
  if (!conv?.id || approvalLoading.has(id)) return;
  approvalLoading.add(id);
  api(`/api/chat/${conv.id}/approvals/${id}`)
    .then((d) => { approvalCache.set(id, d); repaintApproval(id); })
    .catch((e) => { approvalCache.set(id, { id, status: 'failed', title: 'Proposed change', rows: [], missing: true, result: { message: e.message, links: [] } }); repaintApproval(id); })
    .finally(() => approvalLoading.delete(id));
}
// Repaints a card and the other cards of the same reply (their "Apply all" count depends on it).
function repaintApproval(id) {
  for (const el of $$(`[data-approval="${id}"]`)) {
    const mid = el.closest('[data-mid]')?.dataset.mid;
    const m = S.current?.messages?.find((x) => x.id === mid);
    for (const sib of m?.approvals || [id]) {
      const card = $(`[data-mid="${mid}"] [data-approval="${sib}"]`);
      if (card && approvalCache.has(sib)) card.outerHTML = approvalCard(sib, m);
    }
  }
}
const apVal = (v) => { const s = String(v ?? ''); return s ? `<div class="ap-val" title="${esc(s.length > 300 ? s.slice(0, 2000) : '')}">${esc(s)}</div>` : '<span class="ap-empty">—</span>'; };

function approvalCard(id, m) {
  const d = approvalCache.get(id);
  if (!d) { setTimeout(() => loadApproval(id)); return `<div class="approval-card loading" data-approval="${esc(id)}"><span class="spinner"></span><span>Loading the proposed change…</span></div>`; }
  const [label, tone] = AP_STATUS[d.status] || [d.status, 'muted'];
  const pending = d.status === 'pending';
  const siblings = (m?.approvals || []).filter((x) => approvalCache.get(x)?.status === 'pending');
  let last = '';
  const hasBefore = (d.rows || []).some((r) => r.before); // new items have no "Now" value: drop the column
  const rows = (d.rows || []).map((r) => { const same = r.target === last; last = r.target; return `<tr><td>${same ? '' : esc(r.target)}</td><td>${esc(r.field)}</td>${hasBefore ? `<td class="ap-now">${apVal(r.before)}</td>` : ''}<td>${apVal(r.after)}</td></tr>`; }).join('');
  const diff = d.diff ? `<details class="ap-diff" ${pending ? 'open' : ''}><summary>${d.diff.tooLarge ? 'The page is too large to compare line by line' : `Page changes: <span class="ap-add">+${d.diff.added}</span> <span class="ap-del">−${d.diff.removed}</span>`}</summary>${d.diff.tooLarge ? '' : `<pre>${d.diff.lines.map((l) => `<span class="dl ${l.t === '+' ? 'add' : l.t === '-' ? 'del' : l.t === '…' ? 'gap' : ''}">${esc(l.t === '…' ? `   ⋯ ${l.s}` : `${l.t} ${l.s}`)}</span>`).join('')}</pre>`}</details>` : '';
  const when = d.decidedAt ? `${d.decidedBy ? ` by ${esc(d.decidedBy)}` : ''} · ${esc(timeAgo(d.decidedAt))}` : pending && d.expiresAt ? ` · expires ${esc(new Date(d.expiresAt).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' }))}` : '';
  const result = d.result && !pending ? `<div class="ap-result ${tone}">${icon(tone === 'ok' ? 'check' : tone === 'bad' ? 'alert' : 'x')}<span>${esc(d.result.message || label)}</span></div>
    ${(d.result.links || []).length ? `<div class="ap-links">${d.result.links.map((l) => `<a href="${esc(/^https?:\/\//i.test(String(l.url)) ? l.url : '#')}" target="_blank" rel="noopener noreferrer">${icon('external')}${esc(l.label)}</a>`).join('')}</div>` : ''}` : '';
  return `<div class="approval-card ${esc(d.status)}" data-approval="${esc(id)}">
    <div class="ap-head">${icon(d.kind === 'wiki' ? 'book' : 'board')}<div class="ap-title"><b>${esc(d.title)}</b><small>Azure DevOps${d.project ? ` · ${esc(d.project)}` : ''}</small></div><span class="status-tag ${tone}">${esc(label)}${when}</span></div>
    ${d.reason ? `<div class="ap-reason"><b>Why:</b> ${esc(d.reason)}</div>` : ''}
    ${rows ? `<div class="ap-table-wrap"><table class="ap-table"><thead><tr><th>Item</th><th>Field</th>${hasBefore ? '<th>Now</th>' : ''}<th>Proposed</th></tr></thead><tbody>${rows}</tbody></table></div>` : ''}
    ${diff}
    ${pending ? `<div class="ap-actions"><button class="btn primary sm" data-ap-apply="${esc(id)}">${icon('check')}Apply</button><button class="btn ghost sm" data-ap-discard="${esc(id)}">Discard</button>${siblings.length > 1 ? `<button class="btn soft sm" data-ap-apply-all>${icon('check')}Apply all ${siblings.length}</button>` : ''}<span class="ap-note">Nothing changes in Azure DevOps until you click Apply.</span></div>` : result}
  </div>`;
}

async function decideApproval(btn, ids, discard = false) {
  const conv = S.current;
  if (!conv?.id) return;
  const card = btn.closest('.approval-card');
  $$('button', card).forEach((b) => { b.disabled = true; });
  if (!discard) btn.innerHTML = `<span class="spinner" style="width:13px;height:13px"></span>Applying…`;
  for (const id of ids) {
    try {
      const d = await api(`/api/chat/${conv.id}/approvals/${id}`, { method: discard ? 'DELETE' : 'POST' });
      approvalCache.set(id, d);
      if (!discard) toast(d.status === 'applied' ? d.result.message : d.result?.message || 'Done', d.status === 'applied' ? 'check' : 'alert');
    } catch (e) {
      if (/name in Settings/i.test(e.message)) { toast(e.message, 'alert'); openSettings(); }
      else toast(e.message, 'alert');
      approvalCache.delete(id); // reload the card's real state
      break;
    }
  }
  for (const id of ids) repaintApproval(id);
}

export { approvalCache, approvalCard, decideApproval };
