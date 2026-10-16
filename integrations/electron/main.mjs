import { app, dialog } from 'electron';
import path from 'node:path';
import { installedCompanion, connectCompanion } from './host.mjs';
import { createEditorWindow, setApplicationMenu } from './window.mjs';
import { startElectronDiagnostics } from './diagnostics.mjs';

app.setName('jumpyBrain Electron');
app.setPath('userData', path.join(app.getPath('appData'), 'jumpyBrain Electron Prototype'));
let window = null, opening = false;
let diagnostics = null;
let diagnosticQuitReady = false;
process.on('uncaughtExceptionMonitor', () => { diagnostics?.record({ operation: 'exception', severity: 'error', outcome: 'failed', code: 'error' }); void diagnostics?.flush(); });

async function openEditor() {
  if (window && !window.isDestroyed()) {
    if (window.isMinimized()) window.restore();
    window.show(); window.focus(); return;
  }
  if (opening) return;
  opening = true;
  try {
    const config = await installedCompanion();
    // Old/missing runtimes remain connectable; collection availability is explicit.
    if (!diagnostics) diagnostics = await startElectronDiagnostics(config, { directory: app.getPath('userData'), version: app.getVersion() }).catch(() => null);
    const connection = await connectCompanion(config);
    diagnostics?.connect(connection);
    const editor = createEditorWindow(connection, { diagnostics });
    window = editor.window;
    window.on('closed', () => { window = null; });
    await editor.loaded;
    await diagnostics?.checkRenderer(window.webContents);
  } catch (error) {
    diagnostics?.record({ operation: 'startup', severity: 'error', outcome: 'failed', code: 'bootstrap_failed' });
    // Never log loadURL errors: they can include the bootstrap capability.
    const message = window ? 'Could not open the installed editor. Check that the native jumpyBrain companion is running, then reopen this window.' : error.message;
    await dialog.showMessageBox({ type: 'error', title: 'jumpyBrain Electron', message: 'Could not connect to jumpyBrain', detail: message });
  } finally { opening = false; }
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('will-quit', () => { diagnostics?.record({ operation: 'shutdown', severity: 'info', outcome: 'ok', code: 'none' }); });
  app.on('before-quit', (event) => {
    if (!diagnostics || diagnosticQuitReady) return;
    event.preventDefault();
    diagnostics.record({ operation: 'shutdown', severity: 'info', outcome: 'pending', code: 'pending' });
    void diagnostics.flush().finally(() => { diagnosticQuitReady = true; app.quit(); });
  });
  app.on('second-instance', () => { void openEditor(); });
  app.on('activate', () => { if (app.isReady()) void openEditor(); });
  app.whenReady().then(() => {
    setApplicationMenu({ app, getWindow: () => window, reconnect: () => { void openEditor(); } });
    return openEditor();
  }).catch(() => { app.quit(); });
}
