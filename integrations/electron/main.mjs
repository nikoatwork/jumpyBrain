import { app, dialog } from 'electron';
import path from 'node:path';
import { installedCompanion, connectCompanion } from './host.mjs';
import { createEditorWindow, setApplicationMenu } from './window.mjs';

app.setName('jumpyBrain Electron');
app.setPath('userData', path.join(app.getPath('appData'), 'jumpyBrain Electron Prototype'));
let window = null, opening = false;

async function openEditor() {
  if (window && !window.isDestroyed()) {
    if (window.isMinimized()) window.restore();
    window.show(); window.focus(); return;
  }
  if (opening) return;
  opening = true;
  try {
    const connection = await connectCompanion(await installedCompanion());
    const editor = createEditorWindow(connection);
    window = editor.window;
    window.on('closed', () => { window = null; });
    await editor.loaded;
  } catch (error) {
    // Never log loadURL errors: they can include the bootstrap capability.
    const message = window ? 'Could not open the installed editor. Check that the native jumpyBrain companion is running, then reopen this window.' : error.message;
    await dialog.showMessageBox({ type: 'error', title: 'jumpyBrain Electron', message: 'Could not connect to jumpyBrain', detail: message });
  } finally { opening = false; }
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { void openEditor(); });
  app.on('activate', () => { if (app.isReady()) void openEditor(); });
  app.whenReady().then(() => {
    setApplicationMenu({ app, getWindow: () => window, reconnect: () => { void openEditor(); } });
    return openEditor();
  }).catch(() => { app.quit(); });
}
