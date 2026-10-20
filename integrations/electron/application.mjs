import { app, BrowserWindow, dialog, Menu, Tray, nativeImage, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundledHost, startDesktopHost, desktopControl } from './desktop-host.mjs';
import { createQuitFlow } from './lifecycle.mjs';
import { loginEnabled, setLoginEnabled } from './login.mjs';
import { createEditorWindow, setApplicationMenu } from './window.mjs';
import { startElectronDiagnostics } from './diagnostics.mjs';
import { createOnboardingWindow } from './onboarding.mjs';
import { setupComplete, finishSetup } from './setup.mjs';

export function startDesktopApplication({ resourceDirectory, userData, background = process.argv.includes('--background') } = {}) {
app.setName('jumpyBrain');
app.setAboutPanelOptions({ applicationName: 'jumpyBrain', applicationVersion: app.getVersion(), copyright: 'Your thoughts, connected. Markdown stays yours.' });
// Preserve the existing Electron editor preferences and first-run state.
app.setPath('userData', userData ?? path.join(app.getPath('appData'), 'jumpyBrain Electron Prototype'));
let window = null, opening = false, host = null, starting = null, config = null;
let startupError = null;
let diagnostics = null, tray = null, healthTimer = null, polling = false;
let quitting = false, quitReady = false, status = 'Starting…';
const resources = resourceDirectory ?? (app.isPackaged ? process.resourcesPath : fileURLToPath(new URL('../../.local-pack/desktop/jumpyBrain.app/Contents/Resources', import.meta.url)));
process.on('uncaughtExceptionMonitor', () => { diagnostics?.record({ operation: 'exception', severity: 'error', outcome: 'failed', code: 'error' }); void diagnostics?.flush(); });

async function ensureHost() {
  if (host?.isAlive()) return host;
  return starting ??= (async () => {
    startupError = null;
    config = await bundledHost(resources);
    diagnostics ??= await startElectronDiagnostics(config, { directory: app.getPath('userData'), version: app.getVersion() }).catch(() => null);
    host = await startDesktopHost(config, { onExit: () => { status = 'Local service stopped'; void refreshTray(); } });
    diagnostics?.connect(host.connection);
    return host;
  })().catch((error) => { startupError = error; throw error; }).finally(() => { starting = null; });
}

async function openEditor(settings = false) {
  if (quitting) return;
  if (window && !window.isDestroyed()) {
    if (!host?.isAlive()) {
      try { await ensureHost(); } catch (error) { await showError(error); return; }
    }
    if (window.isMinimized()) window.restore();
    window.show(); window.focus();
    if (settings) await window.webContents.executeJavaScript('document.getElementById("open-connection")?.click()');
    return;
  }
  if (opening) return;
  opening = true;
  try {
    const { connection } = await ensureHost();
    if (quitting) return;
    let welcome;
    if (!await setupComplete(app.getPath('userData'))) {
      welcome = createOnboardingWindow(connection);
      window = welcome.window;
      window.once('closed', () => { if (window === welcome.window) window = null; });
      await welcome.loaded;
      if (!await welcome.completed || quitting) return;
    }
    const editor = createEditorWindow(connection, { diagnostics });
    window = editor.window;
    window.on('closed', () => { if (window === editor.window) window = null; });
    await editor.loaded;
    if (welcome) { await finishSetup(app.getPath('userData')); welcome.window.close(); }
    if (settings) await window.webContents.executeJavaScript('document.getElementById("open-connection")?.click()');
    if (!editor.window.isDestroyed()) await diagnostics?.checkRenderer(editor.window.webContents);
  } catch (error) {
    status = 'Local service unavailable';
    diagnostics?.record({ operation: 'startup', severity: 'error', outcome: 'failed', code: 'bootstrap_failed' });
    if (!quitting) await dialog.showMessageBox({ type: 'error', title: 'jumpyBrain', message: 'Could not open jumpyBrain',
      detail: 'Check the local service and installed app. Run npm run desktop:setup from your checkout to repair the installation. ' + (window ? '' : error.message) });
  } finally { opening = false; void refreshTray(); }
}

async function refreshTray() {
  if (!tray || tray.isDestroyed()) return;
  let login = false;
  if (config && app.isPackaged) login = await loginEnabled(config.launchAgent, process.execPath).catch(() => false);
  if (tray.isDestroyed()) return;
  tray.setToolTip('jumpyBrain — ' + status);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: status, enabled: false }, { type: 'separator' },
    { label: 'Open jumpyBrain', enabled: !quitting, click: () => void openEditor() },
    { label: 'Settings…', enabled: !quitting, click: () => void openEditor(true) },
    { type: 'separator' },
    { label: 'Start at Login', type: 'checkbox', checked: login, enabled: !!config && app.isPackaged && !quitting,
      click: (item) => void setLoginEnabled(config.launchAgent, process.execPath, item.checked).then(refreshTray).catch(showError) },
    { label: 'Update jumpyBrain…', click: () => void dialog.showMessageBox({ message: 'Update from your checkout', detail: 'Pull your chosen revision, quit jumpyBrain, then run npm run desktop:setup. This rebuilds and updates the whole Mac app together. Your brains and connections are retained.' }) },
    { label: 'Show Logs', enabled: !!config, click: () => shell.showItemInFolder(path.join(config.supportDirectory, 'server.log')) },
    { type: 'separator' }, { label: 'Quit jumpyBrain', enabled: !quitting, click: () => app.quit() },
  ]));
}
const showError = (error) => dialog.showMessageBox({ type: 'warning', message: 'jumpyBrain is still running', detail: error.message });

const quit = createQuitFlow({
  getHost: () => host, control: desktopControl,
  closeWindows: async () => {
    const results = await Promise.all(BrowserWindow.getAllWindows().map((item) => new Promise((resolve) => {
      const closed = () => { cleanup(); resolve(true); };
      const cancelled = () => { cleanup(); resolve(false); };
      const timer = setTimeout(cancelled, 15000);
      const cleanup = () => { clearTimeout(timer); item.removeListener('closed', closed); item.removeListener('close-cancelled', cancelled); };
      item.once('closed', closed); item.once('close-cancelled', cancelled); item.close();
    })));
    return results.every(Boolean);
  },
  cancelClose: () => { quitting = false; void refreshTray(); },
  flush: async () => { diagnostics?.record({ operation: 'shutdown', severity: 'info', outcome: 'ok', code: 'none' }); await diagnostics?.flush(); },
  exit: () => { clearInterval(healthTimer); tray?.destroy(); quitReady = true; app.quit(); }, showError,
});

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('before-quit', (event) => {
    if (quitReady) return;
    event.preventDefault();
    if (quitting) return;
    quitting = true; void refreshTray();
    void Promise.resolve(starting).catch(() => {}).then(quit);
  });
  app.on('window-all-closed', () => {});
  app.on('second-instance', (_event, argv) => { if (!argv.includes('--background')) void openEditor(); });
  app.on('activate', () => { if (app.isReady()) void openEditor(); });
  app.whenReady().then(async () => {
    const icon = nativeImage.createFromPath(path.join(resources, 'MenuBarBrain.png')).resize({ width: 18, height: 18 });
    icon.setTemplateImage(true); tray = new Tray(icon);
    setApplicationMenu({ app, getWindow: () => window, reconnect: () => void openEditor(), settings: () => void openEditor(true) });
    await refreshTray();
    healthTimer = setInterval(async () => {
      if (polling || quitting || !host?.isAlive()) return;
      polling = true;
      try {
        const state = await desktopControl(host.connection, 'state', undefined, { timeoutMs: 2500 });
        status = `${String(state.active?.name || 'Choose a brain').replace(/[\r\n]/g, ' ').slice(0, 128)} · ${state.health === 'connected' ? 'Connected' : state.health === 'credential_unavailable' ? 'Keychain unavailable' : 'Offline'}`;
      } catch { status = 'Local service unavailable'; }
      finally { polling = false; void refreshTray(); }
    }, 3000);
    if (background) {
      try { await ensureHost(); } catch { status = 'Local service unavailable'; await refreshTray(); }
    } else await openEditor();
  }).catch(() => { app.quit(); });
}

return { openEditor, quit: () => app.quit(), getHost: () => host, getTray: () => tray, getStartupError: () => startupError };
}
