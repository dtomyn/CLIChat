// Lumen front-end: Shared app state and lookup helpers.

const S = {
  settings: {}, providers: [], assistants: [], recipes: [], prompts: [], convs: [], pipelines: [], runs: [], schedules: [],
  view: 'home', current: null, search: '',
  live: new Map(), // conversationId -> { ac, msg }
  draft: { text: '', attachments: [], assistantId: null, access: null },
  openSteps: new Set(), recipeTab: 'All', promptTab: '',
  editing: null, // id of the user message being edited inline
};
const isLive = (conv) => !!conv && [...S.live.values()].some((l) => l.conv === conv);
const assistantById = (id) => S.assistants.find((a) => a.id === id) || S.assistants[0] || { id: 'lumen', name: 'Lumen', emoji: '✨', color: 'violet' };
const provider = () => S.providers.find((p) => p.id === S.settings.providerId) || S.providers[0];
const ACCESS = {
  chat: { emoji: '💬', label: 'Just chat', short: 'Chat only', desc: "Answers questions and can search the web. Won't look at your files." },
  read: { emoji: '👀', label: 'Read my files', short: 'Can read files', desc: 'Can open and read documents in your project folder.' },
  edit: { emoji: '✍️', label: 'Create & edit files', short: 'Can edit files', desc: 'Can write new documents and update files in your project folder.' },
};
const COLORS = ['violet', 'teal', 'amber', 'rose', 'blue', 'green', 'slate'];
const EMOJIS = ['✨', '🧭', '📋', '🪶', '📊', '🧠', '🚀', '🎯', '💡', '🛠️', '📈', '🧾', '🗂️', '🤝', '🔍', '🧪', '📣', '🏗️', '💬', '🌱', '⚖️', '🗓️', '🦉', '🎨'];

export { ACCESS, COLORS, EMOJIS, S, assistantById, isLive, provider };
