// Main-process state machine; renderer actions never supply URLs, paths, or commands.
export function createDesktopUpdater({ currentVersion, discover, stage, restart, supported = true }) {
  let state = { status: supported ? 'idle' : 'unavailable', currentVersion,
    message: supported ? '' : 'Updates are available in the installed Mac app.' };
  let release = null, prepared = null, pending = null;
  const listeners = new Set();
  const snapshot = () => ({ ...state });
  const publish = (next) => { state = { ...state, ...next }; for (const listener of listeners) listener(snapshot()); return snapshot(); };
  const exclusive = (work) => {
    if (pending) return pending;
    // Reserve the operation before any observer can trigger another action.
    pending = Promise.resolve().then(work).finally(() => { pending = null; });
    return pending;
  };
  return {
    snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    check() {
      if (!supported || prepared) return Promise.resolve(snapshot());
      return exclusive(async () => {
        publish({ status: 'checking', message: 'Checking for updates…' });
        try {
          release = await discover(currentVersion);
          return publish({ status: release ? 'available' : 'current', version: release?.version,
            message: release ? `Update ${release.version} is available.` : 'You’re up to date.' });
        } catch { return publish({ status: 'error', message: 'Could not check for updates. Try again.', retry: 'check' }); }
      });
    },
    install() {
      if (!supported || !release || prepared) return Promise.resolve(snapshot());
      return exclusive(async () => {
        publish({ status: 'installing', message: 'Downloading update…' });
        try {
          prepared = await stage(release, (message) => publish({ message }));
          return publish({ status: 'ready', message: `Update ${release.version} is ready. Restart when you’re ready.` });
        } catch { return publish({ status: 'error', message: 'Could not install the update. Check your connection and Mac build tools, then retry.', retry: 'install' }); }
      });
    },
    restart() {
      if (!supported || !prepared) return Promise.resolve(snapshot());
      return exclusive(async () => {
        publish({ status: 'restarting', message: 'Saving your work before restarting…' });
        try {
          await restart(prepared);
          // A cancelled save barrier returns here with the current app still alive.
          return publish({ status: 'ready', message: 'Restart paused. Resolve pending saves in open tabs, then try again.' });
        } catch { return publish({ status: 'ready', message: 'Could not restart. Your update is ready; try again.' }); }
      });
    },
  };
}

export function trustedUpdateSender(event, contents, origin) {
  if (event.sender !== contents || !event.senderFrame || event.senderFrame !== contents.mainFrame) return false;
  try { return new URL(event.senderFrame.url).origin === origin; } catch { return false; }
}
export function attachUpdateBridge(ipcMain, contents, origin, updater) {
  const channels = ['state', 'check', 'install', 'restart'];
  for (const action of channels) ipcMain.handle(`jumpybrain:update:${action}`, (event) => {
    if (!trustedUpdateSender(event, contents, origin)) throw new Error('Update control is unavailable.');
    return action === 'state' ? updater.snapshot() : updater[action]();
  });
  const unsubscribe = updater.subscribe((state) => {
    if (!contents.isDestroyed() && trustedUpdateSender({ sender: contents, senderFrame: contents.mainFrame }, contents, origin)) {
      contents.send('jumpybrain:update:state-changed', state);
    }
  });
  contents.once('destroyed', () => { unsubscribe(); for (const action of channels) ipcMain.removeHandler(`jumpybrain:update:${action}`); });
}
