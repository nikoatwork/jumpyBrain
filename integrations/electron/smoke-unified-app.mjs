// Test-only entrypoint: production application lifecycle, disposable host resources.
import { app, BrowserWindow, dialog, Menu } from 'electron';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import { startDesktopApplication } from './application.mjs';
import { desktopControl } from './desktop-host.mjs';
const fixture = JSON.parse(await readFile(process.env.JUMPYBRAIN_UNIFIED_SMOKE, 'utf8'));
let failure, messages = [], stage = 'startup';
const mark = (value) => { stage = value; console.log('Unified smoke: ' + value); };
dialog.showMessageBox = async (options) => { messages.push(options); return { response: 0 }; };
const application = startDesktopApplication({ resourceDirectory: fixture.resources, userData: fixture.userData, background: true });
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, timeout = 20000) { const end = Date.now() + timeout; while (Date.now() < end) { if (await check()) return; await pause(50); } throw new Error('Unified lifecycle condition timed out: ' + stage + ' (' + messages.map(item => item.detail).join('; ') + ')'); }
async function post(route, body) {
  const connection = application.getHost().connection;
  const response = await fetch(connection.origin + '/companion/' + route, { method: 'POST', headers: { Authorization: 'Bearer ' + connection.key, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal(response.status, 200); return response.json();
}
app.on('will-quit', () => { writeFileSync(fixture.result, JSON.stringify({ ok: !failure, error: failure?.message, mode: fixture.mode })); });
void (async () => {
try {
  await until(() => { if (application.getStartupError()) throw application.getStartupError(); return application.getHost()?.isAlive(); });
  assert.equal(BrowserWindow.getAllWindows().length, 0, 'login launch must not open a window');
  assert.ok(application.getTray() && !application.getTray().isDestroyed());
  if (fixture.mode === 'crash') {
    await writeFile(fixture.result, JSON.stringify({ ok: true, mode: 'crash' }));
    process.kill(process.pid, 'SIGKILL');
  } else {
    mark('open editor'); await application.openEditor();
    await until(async () => {
      const window = BrowserWindow.getAllWindows()[0];
      return window && await window.webContents.executeJavaScript('typeof companionRegistered !== "undefined" && companionRegistered && !companionFrozen');
    });
    let window = BrowserWindow.getAllWindows()[0];
    const connection = application.getHost().connection;
    const before = await desktopControl(connection, 'state');
    mark('blocked quit'); await post('register', { tabId: 'unsaved-browser', generation: before.generation });
    app.quit();
    let state;
    await until(async () => { state = await desktopControl(connection, 'state'); return state.phase === 'preparing'; });
    await post('ack', { tabId: 'unsaved-browser', switchId: state.switchId, ok: false });
    await until(() => messages.some((message) => message.message === 'jumpyBrain is still running'));
    assert.ok(application.getHost().isAlive()); assert.equal(window.isDestroyed(), false);
    await post('unregister', { tabId: 'unsaved-browser', generation: before.generation });
    await until(async () => await window.webContents.executeJavaScript('!companionFrozen'));
    mark('close window'); window.close(); await until(() => window.isDestroyed());
    assert.ok(application.getHost().isAlive(), 'closing last window must keep the brain live');
    assert.ok(!application.getTray().isDestroyed());
    mark('reopen window'); Menu.getApplicationMenu().items.find((item) => item.label === 'File').submenu.items[0].click();
    await until(() => BrowserWindow.getAllWindows().length === 1);
    window = BrowserWindow.getAllWindows()[0];
    await until(async () => await window.webContents.executeJavaScript('typeof companionRegistered !== "undefined" && companionRegistered && !companionFrozen'));
    assert.equal((await desktopControl(connection, 'state')).generation, before.generation);
    mark('settings'); await application.openEditor(true);
    await until(async () => await window.webContents.executeJavaScript('location.pathname === "/settings"'));
    console.log('Unified desktop: background launch, tray, reopen, blocked quit, close keeps service, settings, safe quit');
    app.quit();
  }
} catch (error) {
  failure = error;
  await writeFile(fixture.result, JSON.stringify({ ok: false, error: error.message }));
  await application.getHost()?.stop();
  app.exit(1);
}

})();
