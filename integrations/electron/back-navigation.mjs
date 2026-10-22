import { isAppNavigation } from './host.mjs';

// Runs in the existing sandboxed page; no preload, IPC, or second history stack.
function installMouseBack() {
  for (const type of ['mousedown', 'mouseup', 'auxclick']) {
    window.addEventListener(type, (event) => {
      if (event.button !== 3) return;
      event.preventDefault();
      if (type === 'mouseup') navigation.back();
    }, true);
  }
  // Some mouse drivers emit the standard Mac Back shortcut instead of button 3.
  window.addEventListener('keydown', (event) => {
    if (event.metaKey && !event.altKey && !event.ctrlKey && !event.shiftKey && event.code === 'BracketLeft') {
      event.preventDefault();
      if (!event.repeat && !event.isComposing) navigation.back();
    }
  }, true);
}

export function installBackNavigation(window, origin) {
  const contents = window.webContents;
  const history = contents.navigationHistory;
  let brain;
  function trim(_event, url, isMainFrame) {
    if (!isMainFrame || !isAppNavigation(url, origin)) return;
    const nextBrain = new URL(url).searchParams.get('brain');
    if (brain !== nextBrain) history.clear();
    brain = nextBrain;
    // Current page plus five previous destinations. Forward entries already fit
    // this same six-entry window; a new push drops the forward branch naturally.
    while (history.getActiveIndex() > 5 && history.removeEntryAtIndex(0)) { /* Drop oldest. */ }
  }
  contents.on('did-navigate-in-page', trim);
  contents.on('did-finish-load', () => {
    if (!isAppNavigation(contents.getURL(), origin)) return;
    history.clear(); // Reloads/brain switches start a fresh window-local history.
    brain = new URL(contents.getURL()).searchParams.get('brain');
    void contents.executeJavaScript(`(${installMouseBack.toString()})();`).catch(() => {});
  });
  const swipe = (_event, direction) => {
    if (direction !== 'right' || contents.isDestroyed() || !isAppNavigation(contents.getURL(), origin)) return;
    // Renderer traversal emits popstate and uses the existing save/restore guard.
    void contents.executeJavaScript('navigation.back();').catch(() => {});
  };
  window.on('swipe', swipe);
  contents.once('destroyed', () => window.removeListener('swipe', swipe));
}
