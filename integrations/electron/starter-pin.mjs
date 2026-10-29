// Runs once in the editor after successful new-brain onboarding. No native bridge.
export function installStarterPin(page) {
  const key = 'jumpybrain.pageNavigation.v1:' + page.scope;
  const marker = 'jumpybrain.focusStarter.v1:' + page.scope;
  if (localStorage.getItem(marker)) return;
  let history;
  try { history = JSON.parse(localStorage.getItem(key) || 'null'); } catch {}
  if (!history || !Array.isArray(history.pinned) || !Array.isArray(history.recent)) history = { pinned: [], recent: [] };
  history.pinned = [{ id: page.id, title: page.title }, ...history.pinned.filter(item => item.id !== page.id)].slice(0, 50);
  localStorage.setItem(key, JSON.stringify(history));
  localStorage.setItem(marker, page.id);
  window.dispatchEvent(new StorageEvent('storage', { key, newValue: JSON.stringify(history) }));
}
