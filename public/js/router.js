// Lumen front-end: Hash routing between pages.
import { $, $$ } from './utils.js';
import { S } from './state.js';
import { renderConvList } from './sidebar.js';
import { closeMenu } from './menu.js';
import { renderHome, renderSamplesPage } from './home.js';
import { openConversation } from './chat.js';
import { renderRun, renderRuns } from './runs.js';
import { renderAssistantsPage } from './agents.js';
import { renderRecipesPage } from './prompts.js';
import { renderInsightsPage } from './insights.js';

function route() {
  const h = location.hash.replace(/^#\/?/, '');
  $('#view').onclick = null;
  closeMenu();
  if (h.startsWith('c/')) return openConversation(h.slice(2));
  if (h.startsWith('run/')) { S.current = null; return renderRun(h.slice(4)); }
  S.current = null;
  if (h === 'runs') return renderRuns();
  if (h === 'assistants' || h === 'agents') return renderAssistantsPage();
  if (h === 'recipes' || h === 'prompts') return renderRecipesPage();
  if (h === 'insights') return renderInsightsPage();
  if (h === 'samples') return renderSamplesPage();
  renderHome();
}
const go = (h) => { if (location.hash === `#/${h}`) route(); else location.hash = `/${h}`; };
function setNav(name) { $$('.nav-item').forEach((n) => n.classList.toggle('active', n.dataset.nav === name || (n.dataset.nav === 'home' && name === 'chat'))); renderConvList(); }

export { go, route, setNav };
