import { BrowserWindow, dialog, ipcMain } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectBrainFolder, activateLocalBrain, companionControl } from './setup.mjs';

const directory = path.dirname(fileURLToPath(import.meta.url));
const page = new URL('./onboarding.html', import.meta.url).href;
export function createOnboardingWindow(connection, { chooseFolder, activate = activateLocalBrain, control = companionControl, setupError } = {}) {
  const window = new BrowserWindow({ title: 'Welcome to jumpyBrain', width: 960, height: 720, minWidth: 680, minHeight: 620,
    show: false, backgroundColor: '#f7f4ed', autoHideMenuBar: true,
    webPreferences: { preload: path.join(directory, 'onboarding-preload.cjs'), partition: 'jumpybrain-setup',
      sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, webviewTag: false },
  });
  const contents = window.webContents;
  const session = contents.session;
  let selected = null, busy = false, settled = false;
  let resolve;
  const completed = new Promise((done) => { resolve = done; });
  const success = () => { settled = true; resolve(true); };
  const handlers = {
    status: async () => {
      if (!connection) return { error: setupError || 'The local helper is missing. Run npm run desktop:setup from your private Git checkout, then reopen jumpyBrain.' };
      try {
        const state = await control(connection);
        return { active: state.profiles.find((profile) => profile.id === state.activeId) || null };
      } catch { return { error: 'The local helper is unavailable. Quit and reopen jumpyBrain, then try again.' }; }
    },
    choose: async () => {
      if (!connection) throw new Error('Install the local helper first.');
      const result = chooseFolder ? await chooseFolder(window) : await dialog.showOpenDialog(window, {
        title: 'Choose your brain folder', buttonLabel: 'Choose folder',
        properties: ['openDirectory', 'createDirectory', 'dontAddToRecent'],
      });
      if (result.canceled || !result.filePaths?.[0]) return null;
      selected = null;
      selected = await inspectBrainFolder(result.filePaths[0]);
      return selected;
    },
    open: async () => {
      if (!connection || !selected) throw new Error('Choose your brain folder first.');
      // Reinspection permits retry after initialization succeeded but activation failed.
      selected = await inspectBrainFolder(selected.root);
      await activate(connection, selected); success(); return { ok: true };
    },
    continue: async () => {
      if (!connection) throw new Error('Install the local helper first.');
      const state = await control(connection);
      if (!state.activeId) throw new Error('Choose your brain folder first.');
      success(); return { ok: true };
    },
  };
  for (const [name, handler] of Object.entries(handlers)) {
    ipcMain.handle('desktop-setup:' + name, async (event) => {
      if (event.sender !== contents || event.senderFrame !== contents.mainFrame || event.senderFrame.url !== page) throw new Error('Setup is unavailable.');
      if (busy || settled) return { error: 'Wait for the current step to finish.' };
      busy = true;
      try { return await handler(); }
      catch (error) { return { error: error.message }; }
      finally { busy = false; }
    });
  }
  session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.setPermissionCheckHandler(() => false);
  session.webRequest.onBeforeRequest((details, callback) => {
    let allowed = false;
    try { const url = new URL(details.url); allowed = url.protocol === 'file:' && [page, new URL('./onboarding.css', import.meta.url).href, new URL('./onboarding-renderer.js', import.meta.url).href, new URL('./assets/app-icon.svg', import.meta.url).href].includes(url.href); } catch {}
    callback({ cancel: !allowed });
  });
  contents.on('will-navigate', (event) => event.preventDefault());
  contents.on('will-frame-navigate', (event) => event.preventDefault());
  contents.on('will-redirect', (event) => event.preventDefault());
  contents.on('will-attach-webview', (event) => event.preventDefault());
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  session.on('will-download', denyDownload);
  function denyDownload(event) { event.preventDefault(); }
  window.on('closed', () => {
    for (const name of Object.keys(handlers)) ipcMain.removeHandler('desktop-setup:' + name);
    session.removeListener('will-download', denyDownload);
    if (!settled) resolve(false);
  });
  window.once('ready-to-show', () => window.show());
  const loaded = window.loadFile(path.join(directory, 'onboarding.html'));
  return { window, loaded, completed };
}
