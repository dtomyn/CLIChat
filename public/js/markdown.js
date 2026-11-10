// Lumen front-end: Markdown rendering (marked + DOMPurify + highlight.js).
import { icon } from './icons.js';
import { $, $$, esc } from './utils.js';

marked.use({ gfm: true, breaks: false });
const renderer = new marked.Renderer();
renderer.code = ({ text, lang }) => {
  const l = (lang || '').split(/\s/)[0];
  return `<pre><div class="code-head"><span>${esc(l || 'text')}</span><button data-copy-code>${icon('copy')}Copy</button></div><code class="${l ? `language-${esc(l)}` : ''}">${esc(text)}</code></pre>`;
};
renderer.table = function (token) {
  const head = token.header.map((c) => `<th${c.align ? ` style="text-align:${c.align}"` : ''}>${this.parser.parseInline(c.tokens)}</th>`).join('');
  const body = token.rows.map((r) => `<tr>${r.map((c) => `<td${c.align ? ` style="text-align:${c.align}"` : ''}>${this.parser.parseInline(c.tokens)}</td>`).join('')}</tr>`).join('');
  return `<div class="table-wrap"><div class="table-tools"><button data-copy-table title="Copy for Excel, Word or Outlook">${icon('copy')}Copy table</button></div><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
};
DOMPurify.addHook('afterSanitizeAttributes', (n) => { if (n.tagName === 'A') { n.setAttribute('target', '_blank'); n.setAttribute('rel', 'noopener noreferrer'); } });
// AI replies can carry text from documents and web pages. The app's click handlers are keyed on data-* attributes
// (Apply, open file, send suggestion…), so replies may not carry data attributes other than the two copy buttons,
// ids that could shadow the app's own elements (#input…), or forms.
const md = (text, cursor = false) => DOMPurify.sanitize(marked.parse(String(text || ''), { renderer }) + (cursor ? '<span class="cursor"></span>' : ''), {
  ALLOW_DATA_ATTR: false, ADD_ATTR: ['target', 'data-copy-code', 'data-copy-table'],
  FORBID_TAGS: ['form', 'textarea', 'select', 'option', 'style'], FORBID_ATTR: ['id', 'name', 'form', 'formaction'],
});
const highlight = (root) => { if (window.hljs) $$('pre code[class*="language-"]:not(.hljs)', root).forEach((b) => { try { hljs.highlightElement(b); } catch {} }); };

export { highlight, md };
