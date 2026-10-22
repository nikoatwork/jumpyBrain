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
  let editor;
  const click = async id => {
    const recovery = updateWindow();
    const ids = { update: 'desktop-updates', restart: 'desktop-updates', recover: 'desktop-updates', 'app-only': 'desktop-update-app-only', cancel: 'desktop-update-cancel' };
    return (recovery || editor).webContents.executeJavaScript(`document.getElementById(${JSON.stringify(recovery ? id : ids[id])}).click()`);
  };
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
        await until(async () => { editor = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().startsWith('http:')); return editor && !editor.webContents.isLoadingMainFrame() && await editor.webContents.executeJavaScript('!!document.getElementById("desktop-update-panel")'); });
        editor.show(); await pause(250);
        if (fixture.mode === 'app-only') await until(async () => await editor.webContents.executeJavaScript('document.getElementById("desktop-update-status").textContent.includes("Your CLI stays unchanged")'));
        const state = await application.updater.snapshot();
        assert.equal(state.installed.app, fixture.nextVersion); assert.equal(state.installed.runtime, fixture.nextVersion); assert.equal(state.installed.cli, fixture.mode === 'app-only' ? fixture.oldVersion : fixture.nextVersion);
        await writeFile(path.join(fixture.artifactDir, 'success.png'), (await (editor || updateWindow()).webContents.capturePage()).toPNG());
        await writeFile(path.join(fixture.home, 'result.json'), JSON.stringify({ ok: true, versions: state.installed, guiRestart: true }));
        app.quit(); return;
      }
      await until(async () => { editor = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().startsWith('http:')); return editor && await editor.webContents.executeJavaScript('typeof companionRegistered !== "undefined" && companionRegistered && !!document.getElementById("desktop-updates")'); });
      assert.equal(await editor.webContents.executeJavaScript('typeof window.jumpyBrainUpdate'), 'undefined');
      assert.equal(await editor.webContents.executeJavaScript('typeof require'), 'undefined');
      if (fixture.mode === 'cli-open') {
        const cli = spawn('node', [path.join(fixture.home, '.jumpybrain/app/dist/cli.js'), 'update', '--home', fixture.home], { env: { ...process.env, HOME: fixture.home }, stdio: ['ignore', 'pipe', 'pipe'] });
        let output = ''; cli.stdout.on('data', d => { output += d; }); cli.stderr.on('data', d => { output += d; });
        const completed = new Promise((resolve, reject) => { cli.once('error', reject); cli.once('exit', code => code === 0 ? resolve() : reject(new Error(output))); });
        await completed;
        assert.match(output, /Prepared; restart needed/); assert.match(output, /not installed yet/);
        await writeFile(path.join(fixture.artifactDir, 'cli-output.txt'), output);
      } else {
        await click('update');
        if (fixture.mode === 'app-only') {
          await until(async () => (await application.updater.snapshot()).phase === 'available');
          await click('app-only');
        }
        await until(async () => (await application.updater.snapshot()).phase === 'preparing');
        Menu.getApplicationMenu().items[0].submenu.items.find(item => item.label === 'Check for updates…').click();
        assert.equal(updateWindow(), undefined, 'ordinary updates never open a popup');
      }
      if (fixture.mode === 'success') {
        await editor.webContents.executeJavaScript('navigation.navigate(companionScopeUrl("/?note=mem_22222222-2222-4222-8222-222222222222"))');
        await until(async () => await editor.webContents.executeJavaScript('state.editor?.state.loaded && document.getElementById("note-editor").isContentEditable'));
        await editor.webContents.executeJavaScript(`(() => {
          const element = document.getElementById('note-editor'); element.focus();
          const range = document.createRange(); range.selectNodeContents(element); range.collapse(false);
          const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
        })()`);
        await pause(100);
        await editor.webContents.insertText(' Edited during preparation.');
        await until(async () => await editor.webContents.executeJavaScript('richEditor.getMarkdown().includes("Edited during preparation.") && state.editor.state.saveStatus === "saved" && !state.editor.state.dirty'));
        const bytes = await readFile(path.join(fixture.home, 'memory/notes/work.md'));
        assert.match(bytes.toString(), /Edited during preparation/);
        await writeFile(path.join(fixture.home, 'work-before.md'), bytes);
        assert.ok(['preparing', 'ready'].includes((await application.updater.snapshot()).phase));
      }
      await until(async () => { const s = await application.updater.snapshot(); if (s.phase === 'failed') throw new Error(s.detail); return s.phase === 'ready'; }, 12 * 60 * 1000);
      assert.ok(application.getHost().isAlive(), 'editor service stays usable during preparation');
      if (fixture.mode === 'app-crash') { process.kill(process.pid, 'SIGKILL'); return; }
      await writeFile(path.join(fixture.artifactDir, 'ready.png'), (await (editor || updateWindow()).webContents.capturePage()).toPNG());
      await until(async () => await editor.webContents.executeJavaScript('document.getElementById("desktop-updates").getAttribute("aria-label") === "Relaunch to apply update"'));
      assert.equal(updateWindow(), undefined);
      const before = await desktopControl(application.getHost().connection, 'state');
      await post('register', { tabId: 'failed-draft-tab', generation: before.generation });
      await click('restart');
      let state; await until(async () => { state = await desktopControl(application.getHost().connection, 'state'); return state.phase === 'preparing'; });
      await post('ack', { tabId: 'failed-draft-tab', switchId: state.switchId, ok: false });
      await until(async () => !!(await application.updater.snapshot()).restartError);
      assert.equal(messages.length, 0, 'failed saves are explained inline');
      assert.ok(application.getHost().isAlive());
      assert.equal((await application.updater.snapshot()).phase, 'ready');
      await post('unregister', { tabId: 'failed-draft-tab', generation: before.generation });
      await until(async () => await editor.webContents.executeJavaScript('!companionFrozen'));
      if (fixture.mode === 'success') {
        const count = messages.length;
        await post('register', { tabId: 'unresponsive-tab', generation: before.generation });
        await click('restart');
        await until(async () => (await desktopControl(application.getHost().connection, 'state')).phase === 'preparing');
        await until(async () => !!(await application.updater.snapshot()).restartError, 25000);
        assert.equal(messages.length, count, 'unresponsive saves are explained inline');
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
