// Actual sandboxed editor window + production shell; inert updater, disposable profile.
import { app, BrowserWindow } from 'electron';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createEditorWindow } from './window.mjs';
import { graphPageHtml } from '../../dist/adapters/http-server/graph-page.js';
async function run() {
const profile = await mkdtemp(path.join(os.tmpdir(), 'jb-inline-ui-'));
app.setPath('userData', profile); app.on('window-all-closed', () => {});
const output = path.resolve('.local-pack/update-inline-ui'); await mkdir(output, { recursive: true });
const server = http.createServer((_req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'nonce-fixture'; style-src 'nonce-fixture'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-src 'none'");
  res.end(graphPageHtml('fixture'));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const installed = { app: '0.3.3', runtime: '0.3.3', cli: '0.3.3', cliPolicy: { kind: 'managed', detail: 'Managed CLI updates together.' } };
let state = { phase: 'idle', installed, actions: ['check'] }, calls = [], window, onAction;
const updater = { snapshot: async () => state, action: async action => { calls.push(action); onAction?.(action); return state; }, logPath: () => null };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  await app.whenReady();
  const editor = createEditorWindow({ origin, key: 'fixture' }, { updater }); window = editor.window;
  // Other disposable app fixtures may cover this window; screenshot frame
  // flushing must not wait forever on macOS occlusion-throttled animation.
  window.webContents.setBackgroundThrottling(false); await editor.loaded;
  const evaluate = expression => window.webContents.executeJavaScript(expression);
  const wait = async expression => { const deadline = Date.now() + 6000; while (Date.now() < deadline) { if (await evaluate(expression)) return; await pause(50); } throw new Error('UI timeout: ' + expression); };
  await wait('!!document.getElementById("desktop-updates")');
  for (const theme of ['light', 'dark']) {
    await evaluate(`document.documentElement.dataset.theme = ${JSON.stringify(theme)}`);
    for (const phase of ['idle', 'current', 'available', 'checking', 'preparing', 'ready', 'success', 'failed']) {
      const actions = phase === 'ready' ? ['restart', 'cancel', 'log'] : phase === 'available' ? ['update', 'check'] : phase === 'preparing' ? ['cancel', 'log'] : ['check'];
      state = { phase, actions, installed, available: '0.3.4', detail: 'Actionable failure or progress.', logAvailable: true, notes: '<script>window.untrusted = true</script>' };
      await pause(1150);
      assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
      assert.equal(await evaluate('Boolean(window.untrusted)'), false);
      assert.equal(await evaluate('typeof require'), 'undefined');
      assert.equal(BrowserWindow.getAllWindows().length, 1);
      if (phase === 'preparing' || phase === 'ready') {
        assert.equal(await evaluate('document.querySelector("main").inert'), false);
        assert.equal(await evaluate('document.getElementById("desktop-updates").getAttribute("aria-label")'), phase === 'ready' ? 'Relaunch to apply update' : 'Preparing update');
        assert.equal(await evaluate('document.getElementById("desktop-updates").textContent'), '');
        await evaluate('document.getElementById("desktop-update-details").open = false');
        await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
        await writeFile(path.join(output, `${phase}-${theme}.png`), (await window.webContents.capturePage()).toPNG());
      }
      if (['idle', 'current', 'success'].includes(phase)) assert.equal(await evaluate('document.getElementById("desktop-updates").hidden'), true);
    }
  }
  state = { phase: 'available', actions: ['update', 'check'], installed }; await pause(1150);
  await evaluate('document.getElementById("desktop-updates").focus()');
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Return' });
  window.webContents.sendInputEvent({ type: 'char', keyCode: '\r' });
  window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Return' });
  await pause(200); assert.equal(calls.at(-1), 'update');
  state = { phase: 'available', actions: ['app-only', 'check'], canPrepare: true, installed: { ...installed, cliPolicy: { kind: 'pinned', detail: 'Pinned CLI unchanged.' } } }; await pause(1150);
  assert.equal(await evaluate('document.getElementById("desktop-update-app-only").hidden'), false);
  assert.equal(await evaluate('document.getElementById("desktop-update-details").open'), true);
  await evaluate('document.getElementById("desktop-update-app-only").click()'); await pause(100); assert.equal(calls.at(-1), 'app-only');
  for (const phase of ['success', 'recovered']) {
    state = { ...state, phase, actions: ['check'] }; await pause(1150);
    assert.equal(await evaluate('document.getElementById("desktop-update-status").textContent.includes("Your CLI stays unchanged")'), true);
    assert.equal(await evaluate('document.getElementById("desktop-updates").hidden'), true);
  }
  // Unrecognized schemes/actions/arguments never reach the native capability.
  const count = calls.length;
  await evaluate("location.href = 'jumpybrain-update://update?url=https://evil.invalid'"); await pause(100); assert.equal(calls.length, count);
  // Current authoritative capabilities also reject syntactically valid stale actions.
  await evaluate("location.href = 'jumpybrain-update://restart'"); await pause(100); assert.equal(calls.length, count);
  await evaluate("document.body.insertAdjacentHTML('beforeend', '<iframe src=\"jumpybrain-update://app-only\"></iframe>')"); await pause(100); assert.equal(calls.length, count);
  // A pre-action poll may finish after the native action. It must not restore
  // stale available state or unlock another download while the action runs.
  state = { phase: 'available', actions: ['update'], installed }; await pause(1150);
  const stale = state;
  let releasePoll;
  updater.snapshot = async () => {
    if (!releasePoll) return new Promise(resolve => { releasePoll = resolve; });
    return state;
  };
  const pollDeadline = Date.now() + 6000;
  while (!releasePoll && Date.now() < pollDeadline) await pause(50);
  assert.ok(releasePoll, 'a status poll is held');
  onAction = () => { state = { phase: 'ready', actions: ['restart', 'cancel'], installed }; };
  const beforeAction = calls.length;
  await evaluate('document.getElementById("desktop-updates").click(); document.getElementById("desktop-updates").click()');
  await pause(100); assert.equal(calls.length, beforeAction + 1);
  releasePoll(stale);
  await wait('document.getElementById("desktop-updates").getAttribute("aria-label") === "Relaunch to apply update"');
  assert.equal(calls.length, beforeAction + 1);
  updater.snapshot = async () => state; onAction = undefined;
  // Native update rendering never replaces editor nodes or the focused draft.
  await evaluate("window.testDraft = document.createElement('textarea'); testDraft.value = 'unsaved draft'; document.querySelector('main').append(testDraft); testDraft.focus(); testDraft.setSelectionRange(2, 7)");
  state = { phase: 'preparing', actions: ['cancel'], installed }; await pause(1150);
  assert.equal(await evaluate("document.activeElement === testDraft && testDraft.value === 'unsaved draft' && testDraft.selectionStart === 2 && testDraft.selectionEnd === 7"), true);
  window.setMinimumSize(0, 0);
  for (const width of [390, 320]) {
    window.setContentSize(width, 860); await pause(100);
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
  }
  console.log('Inline updater UI PASS: production shell, both themes, keyboard, working/ready, pinned exception, literal notes, restricted actions. Screenshots:', output);
  window.destroy(); server.close(); await rm(profile, { recursive: true, force: true }); app.exit(0);
} catch (error) { console.error(error); window?.destroy(); server.close(); app.exit(1); }

}
void run().catch(error => { console.error(error); app.exit(1); });
