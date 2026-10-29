// Excluded fixture entrypoint. Production does not import this file.
import { app, BrowserWindow, dialog, nativeTheme } from 'electron';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile, writeFile, access, rename } from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const f = JSON.parse(await readFile(process.env.JUMPYBRAIN_ONBOARDING_SMOKE, 'utf8'));
app.setPath('appData', path.join(f.home, 'Library/Application Support'));
app.setPath('home', f.home);
const load = name => import(pathToFileURL(path.join(f.moduleDirectory ?? path.join(f.source, 'integrations/electron'), name)).href);
const { startDesktopApplication } = await load('application.mjs');
const { companionControl } = await load('setup.mjs');
const { createOnboardingWindow } = await load('onboarding.mjs');
let choice = { canceled: true, filePaths: [] }, stage = 'startup', failure;
const checks = [], messages = [];
if (f.phase !== 'physical') dialog.showOpenDialog = async () => choice;
else {
  const nativeChoose = dialog.showOpenDialog.bind(dialog);
  dialog.showOpenDialog = async (...args) => {
    const selected = await nativeChoose(...args);
    checks.push(selected.canceled ? 'actual native chooser canceled' : 'actual native chooser selected ' + selected.filePaths[0]);
    return selected;
  };
}
dialog.showMessageBox = async options => {
  messages.push(options);
  if (f.phase === 'socket') {
    try {
      assert.match(options.message, /path is too long.*notes have not been changed/);
      assert.equal(options.message.includes(f.longUpdateHome), false);
      assert.equal(application.getHost(), null);
      mark('overlong socket path displays actionable startup failure before quit');
    } catch (error) { failure = error; }
  }
  return { response: 0 };
};
const mark = text => { stage = text; console.log('Onboarding: ' + text); checks.push(text); };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn, timeout = 25000) { const end = Date.now() + timeout; while (Date.now() < end) { if (await fn()) return; await pause(50); } throw new Error('Timed out: ' + stage); }
let window;
const js = script => window.webContents.executeJavaScript(script, true);
async function screenshot(name) { await writeFile(path.join(f.screenshotDir, name + '.png'), (await window.webContents.capturePage()).toPNG()); }
async function closeWindow() { const closed = new Promise(resolve => window.once('closed', resolve)); window.close(); await closed; }
async function readyEditor() {
  await until(async () => { window = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().startsWith('http://')); return window && await js('typeof companionRegistered !== "undefined" && companionRegistered && !companionFrozen'); });
}
const application = startDesktopApplication({ resourceDirectory: f.resources, userData: f.userData, background: false,
  updaterOptions: { home: f.phase === 'socket' ? f.longUpdateHome : f.home, appVersion: '0.3.8', discover: async () => ({ version: '0.3.8', notes: 'Current fictional fixture release.' }), spawnWorker: () => assert.fail('No updater preparation') } });
app.on('will-quit', () => writeFileSync(f.result, JSON.stringify({ ok: !failure, phase: f.phase, checks, error: failure?.message })));

void (async () => {
try {
  if (f.phase === 'socket') return; // Production startup owns notification and controlled quit.
  if (f.phase === 'missing') {
    // The caller has already exercised normal startup. Remove only its private helper.
    await readyEditor(); await closeWindow(); await application.getHost().stop();
    const executable = path.join(f.resources, 'native/jumpyBrain Host.app/Contents/MacOS/jumpyBrain');
    await rename(executable, executable + '.held');
    await application.openEditor();
    assert.ok(application.getStartupError(), 'real host absence must be surfaced');
    assert.ok(messages.length, 'startup failure has a native fallback');
    const actualRecovery = messages.at(-1).message;
    assert.match(actualRecovery, /existing brain.*\.jumpybrain\/app.*public source setup/);
    assert.doesNotMatch(actualRecovery, /ENOENT|from your checkout/);
    assert.equal(actualRecovery.includes(f.resources), false);
    await writeFile(path.join(f.screenshotDir, 'missing-helper-message.json'), JSON.stringify(messages.map(m => ({ message: m.message, detail: m.detail }))));
    await rename(executable + '.held', executable);
    // Production first-run recovery surface in both themes, without capabilities.
    const welcome = createOnboardingWindow(null); window = welcome.window; await welcome.loaded;
    await until(async () => await js('document.getElementById("message").textContent.includes("desktop:setup")'));
    assert.match(await js('document.getElementById("message").textContent'), /existing brain.*public source setup/);
    for (const theme of ['light', 'dark']) { nativeTheme.themeSource = theme; window.setSize(680, 620); await pause(80); await screenshot('missing-helper-' + theme); }
    await closeWindow(); mark('missing-helper real startup failure and recovery surface');
    await application.openEditor(); await readyEditor();
    assert.ok(application.getHost().isAlive());
    assert.equal(application.getStartupError(), null);
    mark('restored helper retries into real native-host editor');
  } else {
    await until(() => { if (application.getStartupError()) throw new Error('Native host startup failed'); return application.getHost()?.isAlive(); });
    const connection = application.getHost().connection;
    if (f.phase === 'reopen') {
      await readyEditor(); assert.equal((await companionControl(connection)).active.root, f.rootB);
      assert.equal(BrowserWindow.getAllWindows().length, 1);
      mark('explicit quit/relaunch preserves selected B without welcome');
    } else {
      await until(() => { window = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('/onboarding.html')); return !!window; });
      await until(async () => await js('!document.getElementById("choose").disabled'));
      if (f.phase === 'physical') {
        mark('physical chooser ready; drive only fictional fixture paths');
        await writeFile(path.join(f.screenshotDir, 'physical-ready.json'), JSON.stringify({ rootA: f.rootA, rootB: f.rootB, invalidRoot: f.invalidRoot }));
        await until(() => BrowserWindow.getAllWindows().some(w => w.webContents.getURL().startsWith('http://')), 600000);
        await readyEditor(); // Actual chooser/confirmation driven through native automation.
      } else {
        mark('cancel and invalid picker seam with real native service');
        await js('document.getElementById("choose").click()'); await until(async () => await js('!document.getElementById("choose").disabled'));
        assert.equal(await js('document.getElementById("open").disabled'), false);
        choice = { canceled: false, filePaths: [f.invalidRoot] };
        await js('document.getElementById("choose").click()'); await until(async () => await js('document.getElementById("message").textContent.includes("empty folder")'));
        assert.equal(await js('document.getElementById("open").disabled'), true);
        assert.equal(await readFile(path.join(f.invalidRoot, 'keep.txt'), 'utf8'), 'Fictional unrelated file; preserve exactly.');
        choice = { canceled: false, filePaths: [f.rootA] }; await js('document.getElementById("choose").click()');
        await until(async () => await js('!document.getElementById("open").disabled'));
        assert.equal(await js('document.getElementById("folder-path").textContent'), f.rootA);
        for (const theme of ['light', 'dark']) for (const size of [[960, 720], [680, 620]]) {
          nativeTheme.themeSource = theme; window.setSize(...size); await pause(100);
          await screenshot(`selected-${theme}-${size[0]}`);
          const geometry = await js('({overflow:document.documentElement.scrollWidth>innerWidth, primaryBottom:document.getElementById("open").getBoundingClientRect().bottom,height:innerHeight,continueBottom:document.getElementById("continue").getBoundingClientRect().bottom})');
          await writeFile(path.join(f.screenshotDir, `geometry-${theme}-${size[0]}.json`), JSON.stringify(geometry));
          assert.equal(geometry.overflow, false);
          assert.ok(geometry.primaryBottom <= geometry.height, 'primary action visible without scrolling');
          assert.ok(geometry.continueBottom <= geometry.height, 'existing-brain action visible without scrolling');
        }
        await js('document.getElementById("choose").focus()');
        window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Tab' }); window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Tab' }); await pause(80);
        assert.equal(await js('document.activeElement.id'), 'open'); await screenshot('keyboard-focus-primary');
        await js('document.getElementById("open").click()'); await readyEditor();
      }
      assert.equal((await companionControl(connection)).active.root, f.rootA);
      mark('existing CLI A displayed by native-host application');
      await until(async () => await js(`!!document.querySelector('a[href*="${f.noteId}"]')`));
      await js(`document.querySelector('a[href*="${f.noteId}"]').click()`);
      await until(async () => await js('document.getElementById("note-editor").textContent.includes("Year unspecified.")'));
      await js('document.getElementById("note-editor").focus(); const r=document.createRange(); r.selectNodeContents(document.getElementById("note-editor"));r.collapse(false);const s=getSelection();s.removeAllRanges();s.addRange(r)');
      await pause(60); await window.webContents.insertText(' Saved from candidate Desktop.');
      await until(async () => await js('document.getElementById("note-save-state").textContent === "Saved"'));
      await screenshot('saved-native-host-editor');
      await closeWindow(); assert.ok(application.getHost().isAlive());
      await application.openEditor(); await readyEditor(); assert.equal((await companionControl(connection)).active.root, f.rootA);
      mark('app save and close/reopen keep A and native service');
      {
        await closeWindow(); choice = { canceled: false, filePaths: [f.rootB] };
        const welcome = createOnboardingWindow(connection); window = welcome.window; await welcome.loaded;
        await until(async () => await js('!document.getElementById("choose").disabled'));
        if (f.phase === 'physical') {
          mark('physical B chooser ready; select empty Separate brain B');
          await until(async () => await js('!document.getElementById("open").disabled'), 600000);
        } else {
          await js('document.getElementById("choose").click()'); await until(async () => await js('!document.getElementById("open").disabled'));
        }
        await assert.rejects(access(path.join(f.rootB, 'jumpybrain.json')));
        await js('document.getElementById("open").click()'); assert.equal(await welcome.completed, true);
        assert.equal((await companionControl(connection)).active.root, f.rootB);
        await closeWindow(); await application.openEditor(); await readyEditor();
        assert.equal(await js(`document.body.textContent.includes('Fictional cobalt heron')`), false);
        await application.openEditor(true);
        await until(async () => await js('location.pathname === "/settings"'));
        await screenshot('selected-B-settings');
        const settingsText = await js('document.body.textContent');
        await writeFile(path.join(f.screenshotDir, 'selected-B-path-visible.json'), JSON.stringify({ pathInText: settingsText.includes(f.rootB), pathInInput: await js(`Array.from(document.querySelectorAll('input')).some(input=>input.value===${JSON.stringify(f.rootB)})`) }));
        mark('explicit B creation and app target switch');
      }
    }
  }
  application.quit();
} catch (error) {
  failure = new Error(stage + ': ' + error.message);
  writeFileSync(f.result, JSON.stringify({ ok: false, phase: f.phase, stage, error: failure.message, checks }));
  await application.getHost()?.stop(); app.exit(1);
}
})();
