import { BrowserWindow, dialog, Menu, shell } from 'electron';
import { fileURLToPath } from 'node:url';
import { mountInlineUpdates, nativeUpdateAction } from './update-inline.mjs';
import { isAppNavigation, isFeedbackMailto, isFeedbackDownload } from './host.mjs';
import { installBackNavigation } from './back-navigation.mjs';

export function createEditorWindow({ origin, key }, { confirmClose, openFeedbackEmail = (url) => shell.openExternal(url), diagnostics, updater } = {}) {
  const window = new BrowserWindow({
    title: 'jumpyBrain', icon: fileURLToPath(new URL('./assets/app-icon.png', import.meta.url)), width: 1200, height: 860, minWidth: 480, minHeight: 480,
    show: false, backgroundColor: '#f7f4ed',
    webPreferences: {
      partition: 'persist:jumpybrain-electron-prototype',
      nodeIntegration: false, contextIsolation: true, sandbox: true,
      webSecurity: true, webviewTag: false, navigateOnDragDrop: false,
    },
  });
  const contents = window.webContents;
  installBackNavigation(window, origin);
  const record = (code, details = {}) => diagnostics?.record({ operation: 'renderer', severity: 'error', outcome: 'failed', code, ...details });
  contents.on('render-process-gone', (_event, details) => record(details.reason, { exitCode: details.exitCode }));
  contents.on('unresponsive', () => record('unresponsive'));
  contents.on('did-fail-load', (_event, _code, _description, _url, isMainFrame) => { if (isMainFrame) record('load_failed'); });
  let updatePolling = false, updateActing = false, updateGeneration = 0;
  async function publishUpdate() {
    if (!updater || updatePolling || updateActing || contents.isDestroyed() || !isAppNavigation(contents.getURL(), origin)) return;
    updatePolling = true;
    const generation = updateGeneration;
    try {
      const state = await updater.snapshot();
      if (generation === updateGeneration && !updateActing && !contents.isDestroyed() && isAppNavigation(contents.getURL(), origin)) {
        await contents.executeJavaScript(`(${mountInlineUpdates.toString()})(); document.dispatchEvent(new CustomEvent('jumpybrain-update-state', { detail: ${JSON.stringify(state).replaceAll('<', '\\u003c')} }));`);
      }
    } catch { /* Navigation/destruction is allowed while preparing. */ }
    finally { updatePolling = false; }
  }
  contents.on('did-finish-load', () => { void diagnostics?.checkRenderer(contents); void publishUpdate(); });
  const updateTimer = updater ? setInterval(publishUpdate, 1000) : null;
  contents.once('destroyed', () => clearInterval(updateTimer));
  const session = contents.session;
  // The UI is served entirely by the installed gateway. It needs no external
  // network access, Node bridge, preload script, or remote frames. The only
  // download is a bounded feedback email draft saved through the native dialog.
  // Preserve the existing Copy draft / Copy prompt actions. Never grant
  // programmatic clipboard reads or permissions to another origin/frame.
  session.setPermissionRequestHandler((requestContents, permission, callback, details) => {
    callback(requestContents === contents && permission === 'clipboard-sanitized-write'
      && details.isMainFrame && isAppNavigation(details.requestingUrl, origin));
  });
  session.setPermissionCheckHandler((requestContents, permission, requestingOrigin, details) =>
    requestContents === contents && permission === 'clipboard-sanitized-write'
      && details.isMainFrame && isAppNavigation(requestingOrigin, origin));
  session.webRequest.onBeforeRequest((details, callback) => {
    let allowed = false;
    try { allowed = new URL(details.url).origin === origin; } catch { /* Deny. */ }
    callback({ cancel: !allowed });
  });
  const onDownload = (event, item, source) => {
    if (source !== contents || !isAppNavigation(contents.getURL(), origin)
      || !isFeedbackDownload({ url: item.getURL(), filename: item.getFilename(), mime: item.getMimeType(), size: item.getTotalBytes() }, origin)) event.preventDefault();
  };
  session.on('will-download', onDownload);
  contents.once('destroyed', () => session.removeListener('will-download', onDownload));
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-navigate', (event, url) => {
    const action = nativeUpdateAction(url);
    if (action && updater && isAppNavigation(contents.getURL(), origin)) {
      event.preventDefault();
      if (updateActing) return;
      updateActing = true; updateGeneration++;
      void (async () => {
        try {
          const current = await updater.snapshot();
          if (!current.actions?.includes(action)) return;
          if (action === 'log') { const file = updater.logPath(); if (file) shell.showItemInFolder(file); }
          else await updater.action(action);
        } finally { updateActing = false; void publishUpdate(); }
      })().catch(() => {});
      return;
    }
    if (isFeedbackMailto(url) && isAppNavigation(contents.getURL(), origin)) {
      event.preventDefault();
      void openFeedbackEmail(url).catch(() => dialog.showMessageBox(window, {
        type: 'info', message: 'Could not open an email app',
        detail: 'Download the feedback email draft, or email jumpybrain@agentmail.to manually.',
      }));
      return;
    }
    if (!isAppNavigation(url, origin)) event.preventDefault();
  });
  contents.on('will-frame-navigate', (event) => {
    if (!event.isMainFrame || (!isAppNavigation(event.url, origin) && !isFeedbackMailto(event.url) && !(updater && nativeUpdateAction(event.url)))) event.preventDefault();
  });
  contents.on('will-redirect', (event) => event.preventDefault());
  contents.on('will-attach-webview', (event) => event.preventDefault());
  contents.on('will-prevent-unload', (event) => {
    const discard = confirmClose ? confirmClose() : dialog.showMessageBoxSync(window, {
      type: 'warning', title: 'Keep your draft?',
      message: 'This note has changes that are not confirmed saved.',
      detail: 'Keep editing to let saving finish or copy your draft. Closing now can lose those changes.',
      buttons: ['Keep editing', 'Close and discard changes'], defaultId: 0, cancelId: 0,
      noLink: true,
    }) === 1;
    // Electron uses preventDefault here to override the page's unload veto.
    if (discard) event.preventDefault();
    else window.emit('close-cancelled');
  });
  window.once('ready-to-show', () => window.show());
  // This is the existing Chrome bootstrap. Its own script removes the fragment
  // immediately, then exchanges the token for the gateway's HttpOnly cookie.
  const loaded = window.loadURL(`${origin}/#companion=${key}`);
  return { window, loaded };
}

export function setApplicationMenu({ app, getWindow, reconnect, settings, updates }) {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'jumpyBrain', submenu: [
      { label: 'About jumpyBrain', click: () => app.showAboutPanel() },
      ...(updates ? [{ label: 'Check for updates…', click: updates }] : []),
      { type: 'separator' },
      { label: 'Settings…', accelerator: 'CommandOrControl+,', click: () => {
        if (settings) { settings(); return; }
        const window = getWindow();
        if (window) void window.webContents.executeJavaScript('document.getElementById("open-connection")?.click()');
      } },
      { type: 'separator' }, { role: 'services' }, { type: 'separator' },
      { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' },
      { type: 'separator' }, { label: 'Quit jumpyBrain', accelerator: 'CommandOrControl+Q', click: () => app.quit() },
    ] },
    { label: 'File', submenu: [
      { label: 'Open Window', accelerator: 'CommandOrControl+N', click: reconnect },
      { type: 'separator' }, { role: 'close' },
    ] },
    { role: 'editMenu' },
    { label: 'View', submenu: [
      { role: 'reload' }, { role: 'toggleDevTools' }, { type: 'separator' },
      { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
      { type: 'separator' }, { role: 'togglefullscreen' },
    ] },
    { role: 'windowMenu' },
  ]));
}
