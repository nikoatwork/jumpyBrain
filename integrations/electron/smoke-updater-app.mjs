// Test-only entry installed into disposable fixtures. Never packaged in production.
import { app, BrowserWindow, dialog, Menu } from 'electron';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { desktopControl } from './desktop-host.mjs';
export async function run(fixturePath) {
  // Exercise the installed ASAR code, including its local renderer/preload and
  // extraction of the external worker, rather than importing the checkout app.
  const { startDesktopApplication } = await import(path.join(process.resourcesPath, 'app.asar/application.mjs'));
  const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));
  if (fixture.mode === 'relaunch-failure' && app.getVersion() === fixture.nextVersion) { app.exit(4); return; }
  if (fixture.mode === 'helper-crash' && app.getVersion() === fixture.nextVersion) {
    await writeFile(path.join(fixture.home, 'launched.json'), JSON.stringify({ pid: process.pid }));
    while (!await readFile(path.join(fixture.home, 'continue')).catch(() => null)) await new Promise(resolve => setTimeout(resolve, 50));
  }
  const messages = []; dialog.showMessageBox = async options => { messages.push(options); return { response: 0 }; };
  const application = startDesktopApplication({ resourceDirectory: process.resourcesPath, userData: fixture.userData,
    updaterOptions: { home: fixture.home, discover: async () => fixture.release,
      spawnWorker: (node, args, options) => spawn(node, [fileURLToPath(new URL('./smoke-update-worker.mjs', import.meta.url)), ...args], options) } });
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const until = async (check, timeout = 30000) => { const end = Date.now() + timeout; while (Date.now() < end) { if (await check()) return; await pause(100); } throw new Error('UI condition timed out: ' + JSON.stringify(await application.updater.snapshot())); };
  const updateWindow = () => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('/update.html'));
  const click = async id => updateWindow().webContents.executeJavaScript(`document.getElementById(${JSON.stringify(id)}).click()`);
  const post = async (route, body) => {
    const { origin, key } = application.getHost().connection;
    const response = await fetch(origin + '/companion/' + route, { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal(response.status, 200); return response.json();
  };
  void (async () => {
    try {
      if (fixture.mode === 'helper-crash' && app.getVersion() === fixture.nextVersion) {
        await until(() => updateWindow());
        await until(async () => await updateWindow().webContents.executeJavaScript('!document.getElementById("recover").hidden'));
        assert.equal(application.getHost(), null);
        await click('recover'); await until(async () => (await application.updater.snapshot()).phase === 'ready');
        await until(async () => await updateWindow().webContents.executeJavaScript('!document.getElementById("restart").hidden'));
        await click('restart'); return;
      }
      await until(() => { if (application.getStartupError()) throw application.getStartupError(); return application.getHost()?.isAlive(); });
      if (fixture.mode === 'helper-crash' && await readFile(path.join(fixture.home, 'continue')).catch(() => null)) {
        await until(async () => (await application.updater.snapshot()).phase === 'recovered');
        await writeFile(path.join(fixture.home, 'result.json'), JSON.stringify({ ok: true, recoveryThroughGUI: true }));
        app.quit(); return;
      }
      if (app.getVersion() === fixture.nextVersion) {
        await until(async () => (await application.updater.snapshot()).phase === 'success');
        application.openUpdates(); await until(() => updateWindow()?.webContents.getURL().endsWith('/update.html'));
        await until(async () => await updateWindow().webContents.executeJavaScript('document.getElementById("phase").textContent === "Update complete"'));
        const state = await application.updater.snapshot();
        assert.equal(state.installed.app, fixture.nextVersion); assert.equal(state.installed.runtime, fixture.nextVersion); assert.equal(state.installed.cli, fixture.mode === 'app-only' ? fixture.oldVersion : fixture.nextVersion);
        await writeFile(path.join(fixture.artifactDir, 'success.png'), (await updateWindow().webContents.capturePage()).toPNG());
        await writeFile(path.join(fixture.home, 'result.json'), JSON.stringify({ ok: true, versions: state.installed, guiRestart: true }));
        app.quit(); return;
      }
      let editor;
      await until(async () => { editor = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().startsWith('http:')); return editor && await editor.webContents.executeJavaScript('typeof companionRegistered !== "undefined" && companionRegistered && !!document.getElementById("desktop-updates")'); });
      assert.equal(await editor.webContents.executeJavaScript('typeof window.jumpyBrainUpdate'), 'undefined');
      await editor.webContents.executeJavaScript('document.getElementById("desktop-updates").click()');
      await until(() => updateWindow());
      Menu.getApplicationMenu().items[0].submenu.items.find(item => item.label === 'Update jumpyBrain…').click();
      assert.equal(BrowserWindow.getAllWindows().filter(w => w === updateWindow()).length, 1);
      await until(async () => await updateWindow().webContents.executeJavaScript('typeof window.jumpyBrainUpdate !== "undefined"'));
      assert.equal(await updateWindow().webContents.executeJavaScript('typeof require'), 'undefined');
      const rejected = await updateWindow().webContents.executeJavaScript('window.jumpyBrainUpdate.action({command:"touch /tmp/no"}).then(()=>false,()=>true)'); assert.equal(rejected, true);
      await click('check'); await until(async () => (await application.updater.snapshot()).phase === 'available');
      const prepareAction = fixture.mode === 'app-only' ? 'app-only' : 'prepare';
      await click(prepareAction); await until(async () => (await application.updater.snapshot()).phase === 'preparing');
      await until(async () => await updateWindow().webContents.executeJavaScript('!document.getElementById("cancel").hidden'));
      await click('cancel'); await until(async () => (await application.updater.snapshot()).phase === 'failed');
      await pause(1000); await click('check'); await until(async () => (await application.updater.snapshot()).phase === 'available');
      await click(prepareAction);
      await until(async () => { const s = await application.updater.snapshot(); if (s.phase === 'failed') throw new Error(s.detail); return s.phase === 'ready'; }, 12 * 60 * 1000);
      assert.ok(application.getHost().isAlive(), 'editor service stays usable during preparation');
      if (fixture.mode === 'app-crash') { process.kill(process.pid, 'SIGKILL'); return; }
      await writeFile(path.join(fixture.artifactDir, 'ready.png'), (await updateWindow().webContents.capturePage()).toPNG());
      await click('defer'); await until(() => !updateWindow()); application.openUpdates(); await until(() => updateWindow());
      await until(async () => await updateWindow().webContents.executeJavaScript('!document.getElementById("restart").hidden'));
      const before = await desktopControl(application.getHost().connection, 'state');
      await post('register', { tabId: 'failed-draft-tab', generation: before.generation });
      await click('restart');
      let state; await until(async () => { state = await desktopControl(application.getHost().connection, 'state'); return state.phase === 'preparing'; });
      await post('ack', { tabId: 'failed-draft-tab', switchId: state.switchId, ok: false });
      await until(() => messages.some(m => m.message === 'jumpyBrain is still running'));
      assert.ok(application.getHost().isAlive());
      assert.equal((await application.updater.snapshot()).phase, 'ready');
      await post('unregister', { tabId: 'failed-draft-tab', generation: before.generation });
      await until(async () => await editor.webContents.executeJavaScript('!companionFrozen'));
      if (fixture.mode === 'success') {
        const count = messages.length;
        await post('register', { tabId: 'unresponsive-tab', generation: before.generation });
        await click('restart');
        await until(() => messages.length > count, 25000);
        assert.ok(application.getHost().isAlive());
        assert.equal((await application.updater.snapshot()).phase, 'ready');
        await post('unregister', { tabId: 'unresponsive-tab', generation: before.generation });
        await until(async () => await editor.webContents.executeJavaScript('!companionFrozen'));
      }
      await click('restart');
    } catch (error) {
      await writeFile(path.join(fixture.home, 'result.json'), JSON.stringify({ ok: false, error: error.stack }));
      await application.updater.action('cancel').catch(() => {});
      await application.getHost()?.stop(); app.exit(1);
    }
  })();
}
