import { BrowserWindow, ipcMain, shell } from 'electron';
import { fileURLToPath } from 'node:url';
export function createUpdateWindow(updater) {
  const url = new URL('./update.html', import.meta.url).href;
  const window = new BrowserWindow({ title: 'jumpyBrain Updates', width: 600, height: 680, minWidth: 420, minHeight: 480,
    backgroundColor: '#f7f4ed', webPreferences: { partition: 'jumpybrain-updates', preload: fileURLToPath(new URL('./update-preload.cjs', import.meta.url)),
      nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, webviewTag: false } });
  const allowed = new Set(['status', 'check', 'prepare', 'app-only', 'cancel', 'restart', 'recover', 'log']);
  ipcMain.handle('jumpybrain:update', async (event, action) => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || event.senderFrame.url !== url
      || typeof action !== 'string' || !allowed.has(action)) throw new Error('Unsupported desktop update request.');
    if (action === 'log') { const file = updater.logPath(); if (file) shell.showItemInFolder(file); return updater.snapshot(); }
    return updater.action(action);
  });
  window.once('closed', () => ipcMain.removeHandler('jumpybrain:update'));
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.on('will-frame-navigate', event => event.preventDefault());
  window.webContents.session.setPermissionRequestHandler((_c, _p, callback) => callback(false));
  window.webContents.session.webRequest.onBeforeRequest((details, callback) => callback({ cancel: !details.url.startsWith(new URL('./', import.meta.url).href) }));
  void window.loadURL(url);
  return window;
}
