// Lumen server: Usage numbers for the Insights page.
const store = require('../store');

/** Usage numbers for the Insights page, read from every saved conversation. Feedback never leaves this computer. */
function insights() {
  const assistants = new Map(), recipes = new Map(), down = [];
  const median = (xs) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b), h = s.length >> 1; return s.length % 2 ? s[h] : Math.round((s[h - 1] + s[h]) / 2); };
  const bucket = (map, key) => { if (!map.has(key)) map.set(key, { id: key, chats: 0, runs: 0, replies: 0, up: 0, down: 0, times: [] }); return map.get(key); };
  for (const { id } of store.conversations.list()) {
    const c = store.conversations.get(id); if (!c) continue;
    const a = bucket(assistants, c.assistantId || 'lumen');
    a.chats++;
    let recipe = null;
    for (const msg of c.messages) {
      if (msg.copied) continue; // copied into a branch: already counted in the original chat
      if (msg.role === 'user') { recipe = msg.recipeId ? bucket(recipes, msg.recipeId) : null; if (recipe) recipe.runs++; continue; }
      if (!msg.content && !msg.error) continue;
      a.replies++;
      if (msg.usage?.durationMs) a.times.push(msg.usage.durationMs);
      const r = msg.feedback?.rating;
      if (r) { a[r]++; if (recipe) recipe[r]++; }
      if (r === 'down') down.push({ conversationId: c.id, title: c.title, messageId: msg.id, assistantId: c.assistantId, reason: msg.feedback.reason || '', note: msg.feedback.note || '', at: msg.feedback.at, excerpt: String(msg.content || msg.error).replace(/\s+/g, ' ').slice(0, 160) });
    }
  }
  const allAssistants = store.assistants.all(), allRecipes = store.recipes.all();
  return {
    assistants: [...assistants.values()].map(({ id, chats, replies, up, down: dn, times }) => {
      const def = allAssistants.find((x) => x.id === id);
      return { id, name: def?.name || 'Deleted assistant', emoji: def?.emoji || '🗑️', chats, replies, up, down: dn, medianMs: median(times) };
    }).sort((x, y) => y.replies - x.replies),
    recipes: [...recipes.values()].map(({ id, runs, up, down: dn }) => {
      const def = allRecipes.find((x) => x.id === id);
      return { id, name: def?.name || 'Deleted prompt', emoji: def?.emoji || '🗑️', runs, up, down: dn };
    }).sort((x, y) => y.runs - x.runs),
    recentDown: down.sort((x, y) => y.at - x.at).slice(0, 20),
  };
}

module.exports = { insights };
