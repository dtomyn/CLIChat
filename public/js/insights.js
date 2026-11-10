// Lumen front-end: Insights page.
import { $, api, esc, timeAgo } from './utils.js';
import { S, assistantById } from './state.js';
import { go, setNav } from './router.js';
import { fmtDuration } from './chat.js';

async function renderInsightsPage() {
  S.view = 'insights'; setNav('insights');
  $('#view').innerHTML = `<div class="page"><div class="page-inner"><div class="page-head"><div><h1>Insights</h1><p>Which agents and prompts are working, from the 👍 and 👎 people give replies. Everything here comes from chats on this computer and isn't sent anywhere.</p></div></div><div id="insightsBody"><div class="conv-empty"><span class="spinner" style="width:18px;height:18px"></span></div></div></div></div>`;
  let d;
  try { d = await api('/api/insights'); } catch (e) { $('#insightsBody').innerHTML = `<div class="conv-empty">${esc(e.message)}</div>`; return; }
  if (S.view !== 'insights') return;
  const thumbs = (x) => `<td class="num">${x.up || ''}</td><td class="num">${x.down || ''}</td>`;
  const table = (head, rows, empty) => rows.length ? `<div class="table-wrap"><table class="insights-table"><thead><tr>${head}</tr></thead><tbody>${rows.join('')}</tbody></table></div>` : `<p class="insights-empty">${empty}</p>`;
  $('#insightsBody').innerHTML = `
    <div class="section-label"><span>Agents</span></div>
    ${table('<th>Agent</th><th class="num">Chats</th><th class="num">Replies</th><th class="num">👍</th><th class="num">👎</th><th class="num">Typical reply time</th>',
      d.assistants.map((a) => `<tr><td>${esc(a.emoji)} ${esc(a.name)}</td><td class="num">${a.chats}</td><td class="num">${a.replies}</td>${thumbs(a)}<td class="num">${a.medianMs ? fmtDuration(a.medianMs) : '—'}</td></tr>`),
      'No chats yet.')}
    <div class="section-label"><span>Prompts</span></div>
    ${table('<th>Prompt</th><th class="num">Runs</th><th class="num">👍</th><th class="num">👎</th>',
      d.recipes.map((r) => `<tr><td>${esc(r.emoji)} ${esc(r.name)}</td><td class="num">${r.runs}</td>${thumbs(r)}</tr>`),
      'No prompts have been run yet.')}
    <div class="section-label"><span>Recent 👎 replies</span></div>
    ${table('<th>Chat</th><th>Reason</th><th>Note</th><th>When</th>',
      d.recentDown.map((x) => `<tr><td><a data-go-conv="${esc(x.conversationId)}" title="${esc(x.excerpt)}">${esc(assistantById(x.assistantId).emoji)} ${esc(x.title)}</a></td><td>${esc(x.reason) || '—'}</td><td>${esc(x.note) || '—'}</td><td class="nowrap">${timeAgo(x.at)}</td></tr>`),
      "No 👎 yet. When someone marks a reply as not helpful, it shows up here with their note.")}`;
  $('#insightsBody').addEventListener('click', (e) => { const a = e.target.closest('[data-go-conv]'); if (a) go(`c/${a.dataset.goConv}`); });
}

export { renderInsightsPage };
