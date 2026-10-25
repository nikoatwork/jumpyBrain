// Actual sandboxed editor window + production shell; inert updater, disposable profile.
import { app, BrowserWindow } from 'electron';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { publishSystemMessage } from './system-messages.mjs';
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
  window.webContents.debugger.attach('1.3');
  const motion = value => window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value }] });
  await motion('no-preference');
  const evaluate = expression => window.webContents.executeJavaScript(expression);
  const wait = async expression => { const deadline = Date.now() + 6000; while (Date.now() < deadline) { if (await evaluate(expression)) return; await pause(50); } throw new Error('UI timeout: ' + expression); };
  await wait('!!document.getElementById("desktop-updates")');
  assert.equal(await evaluate('document.querySelector("#connection [data-app-version]").textContent'), 'jumpyBrain · Version 0.3.3', 'native app version overrides the browser build version');
  const sidebarBounds = await evaluate('JSON.stringify(document.getElementById("app-sidebar").getBoundingClientRect().toJSON())');
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
      assert.equal(await evaluate('!!document.getElementById("desktop-update-panel")'), false, 'no update text panel is mounted');
      assert.equal(await evaluate('document.getElementById("desktop-updates").textContent'), '');
      assert.equal(await evaluate('document.getElementById("desktop-updates").dataset.attention'), String(['available', 'ready'].includes(phase)));
      const glow = await evaluate('getComputedStyle(document.getElementById("desktop-updates")).boxShadow');
      assert.equal(glow !== 'none', ['available', 'ready'].includes(phase), 'only download/restart readiness glows');
      const halo = await evaluate('(() => { const s = getComputedStyle(document.getElementById("desktop-updates"), "::after"); return { animation: s.animationName, pointerEvents: s.pointerEvents }; })()');
      assert.equal(halo.animation, ['available', 'ready'].includes(phase) ? 'desktop-update-spin' : 'none', 'only actionable readiness has a rotating halo');
      assert.equal(await evaluate('getComputedStyle(document.querySelector("#desktop-updates svg")).animationName'), ['checking', 'preparing'].includes(phase) ? 'desktop-update-spin' : 'none', 'readiness keeps the action glyph still');
      if (['available', 'ready'].includes(phase)) {
        assert.equal(halo.pointerEvents, 'none', 'halo never intercepts clicks');
        const transform = await evaluate('getComputedStyle(document.getElementById("desktop-updates"), "::after").transform');
        await pause(120);
        assert.notEqual(await evaluate('getComputedStyle(document.getElementById("desktop-updates"), "::after").transform'), transform, 'halo actually turns');
      }
      if (phase === 'preparing' || phase === 'ready' || phase === 'available') {
        assert.equal(await evaluate('document.querySelector("main").inert'), false);
        assert.equal(await evaluate('document.getElementById("desktop-updates").getAttribute("aria-label")'), phase === 'ready' ? 'Relaunch to apply update' : phase === 'available' ? 'Download update' : 'Preparing update');
        assert.equal(await evaluate('document.getElementById("desktop-updates").textContent'), '');
        await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
        await writeFile(path.join(output, `${phase}-${theme}.png`), (await window.webContents.capturePage()).toPNG());
      }
      if (['idle', 'current', 'success'].includes(phase)) assert.equal(await evaluate('document.getElementById("desktop-updates").hidden'), true);
      if (phase === 'success') {
        assert.equal(await evaluate('document.getElementById("toast-message").textContent'), 'Update installed successfully.');
        assert.equal(await evaluate('document.getElementById("app-toast").hidden'), false);
        assert.equal(await evaluate('getComputedStyle(document.getElementById("app-toast")).position'), 'absolute');
        assert.equal(await evaluate('document.getElementById("app-toast").getBoundingClientRect().left - document.querySelector(".app-workspace").getBoundingClientRect().left'), 16);
        assert.equal(await evaluate('JSON.stringify(document.getElementById("app-sidebar").getBoundingClientRect().toJSON())'), sidebarBounds, 'notifications never move the sidebar');
        await writeFile(path.join(output, `notification-${theme}.png`), (await window.webContents.capturePage()).toPNG());
        await pause(4500);
        assert.equal(await evaluate('document.getElementById("app-toast").hidden'), true, 'polling does not replay or prolong success');
      }
    }
    await motion('reduce');
    for (const phase of ['available', 'ready', 'preparing']) {
      state = { phase, installed, actions: phase === 'ready' ? ['restart'] : phase === 'available' ? ['update'] : ['cancel'] };
      await pause(1150);
      assert.equal(await evaluate('getComputedStyle(document.getElementById("desktop-updates"), "::after").animationName'), 'none');
      assert.equal(await evaluate('getComputedStyle(document.querySelector("#desktop-updates svg")).animationName'), 'none');
      assert.equal(await evaluate('getComputedStyle(document.getElementById("desktop-updates")).boxShadow !== "none"'), phase !== 'preparing', 'reduced motion preserves the static readiness glow');
      if (phase === 'ready') await writeFile(path.join(output, `ready-reduced-motion-${theme}.png`), (await window.webContents.capturePage()).toPNG());
    }
    await motion('no-preference');
  }
  state = { phase: 'available', actions: ['update', 'check'], installed }; await pause(1150);
  await evaluate('document.getElementById("desktop-updates").focus()');
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Return' });
  window.webContents.sendInputEvent({ type: 'char', keyCode: '\r' });
  window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Return' });
  await pause(200); assert.equal(calls.at(-1), 'update');
  state = { phase: 'available', actions: ['app-only', 'check'], canPrepare: true, installed: { ...installed, cliPolicy: { kind: 'pinned', detail: 'Pinned CLI unchanged.' } } }; await pause(1150);
  assert.match(await evaluate('document.getElementById("desktop-updates").getAttribute("aria-label")'), /Update app only; CLI stays unchanged/);
  assert.equal(await evaluate('document.getElementById("desktop-updates").dataset.attention'), 'true');
  await evaluate('document.getElementById("desktop-updates").click()'); await pause(100); assert.equal(calls.at(-1), 'app-only');
  for (const phase of ['success', 'recovered']) {
    state = { ...state, phase, actions: ['check'] }; await pause(1150);
    assert.equal(await evaluate('!!document.getElementById("desktop-update-panel")'), false);
    assert.equal(await evaluate('document.getElementById("desktop-updates").hidden'), true);
  }
  state = { phase: 'ready', actions: ['restart'], installed, restartError: 'A note has an unsaved draft.' }; await pause(1150);
  assert.match(await evaluate('document.getElementById("desktop-updates").title'), /unsaved draft/);
  assert.equal(await evaluate('document.getElementById("desktop-updates").disabled'), false, 'blocked restart can be retried');
  state = { phase: 'failed', canRecover: true, actions: ['recover'], installed }; await pause(1150);
  await evaluate('document.getElementById("desktop-updates").click()'); await pause(100); assert.equal(calls.at(-1), 'recover');
  state = { phase: 'success', actions: ['check'], installed }; await pause(1150);
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
  await evaluate("window.testDraft = document.createElement('textarea'); testDraft.value = 'unsaved draft'; testDraft.style.cssText = 'position: fixed; left: -9999px; width: 1px; height: 1px'; document.querySelector('main').append(testDraft); testDraft.focus(); testDraft.setSelectionRange(2, 7)");
  state = { phase: 'preparing', actions: ['cancel'], installed }; await pause(1150);
  assert.equal(await evaluate("document.activeElement === testDraft && testDraft.value === 'unsaved draft' && testDraft.selectionStart === 2 && testDraft.selectionEnd === 7"), true);
  window.setMinimumSize(0, 0);
  for (const width of [390, 320]) {
    window.setContentSize(width, 860); await pause(100);
    for (const phase of ['available', 'preparing', 'ready', 'failed', 'success']) {
      state = { phase, installed, actions: phase === 'ready' ? ['restart'] : phase === 'available' ? ['update'] : phase === 'preparing' ? [] : ['check'], detail: 'An update could not be confirmed.' };
      await pause(1150);
      assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
      assert.equal(await evaluate('!!document.getElementById("desktop-update-panel")'), false);
      const bounds = await evaluate('(() => { const r = document.getElementById("app-toast").getBoundingClientRect(); return { left: r.left, right: r.right }; })()');
      assert.ok(bounds.left >= 0 && bounds.right <= width, 'notification fits the narrow viewport');
    }
  }
  // Every native/renderer producer uses the same component and scope fence.
  state = { phase: 'idle', actions: ['check'], installed }; await pause(1150);
  await evaluate('systemMessages.clear()');
  for (const theme of ['light', 'dark']) {
    await evaluate(`document.documentElement.dataset.theme = ${JSON.stringify(theme)}`);
    assert.equal(await publishSystemMessage(window, origin, { source: 'native-warning', text: 'A system warning. <img src=x onerror="window.injected=true">', severity: 'warning' }), true);
    await evaluate('systemMessages.dispatch({ source: "brain-warning", text: "Search needs attention", severity: "warning", action: { label: "Retry", run() { window.retryCalls = (window.retryCalls || 0) + 1; } } })');
    assert.equal(await evaluate('document.querySelectorAll("#app-toast").length'), 1);
    assert.equal(await evaluate('document.getElementById("app-toast").dataset.source'), 'brain-warning');
    await evaluate('document.getElementById("toast-action").focus(); document.getElementById("toast-action").click()');
    assert.equal(await evaluate('window.retryCalls'), theme === 'light' ? 1 : 2);
    await evaluate('credentialRevision++; systemMessages.sync()');
    assert.equal(await evaluate('document.getElementById("app-toast").dataset.source'), 'native-warning', 'brain warnings/actions are fenced while app warnings survive');
    assert.equal(await evaluate('document.querySelectorAll("#app-toast img").length'), 0);
    assert.equal(await evaluate('Boolean(window.injected)'), false);
    assert.equal(await evaluate("testDraft.value === 'unsaved draft' && testDraft.selectionStart === 2 && testDraft.selectionEnd === 7"), true);
    for (const width of [1200, 390, 320]) {
      window.setContentSize(width, 860); await pause(100);
      assert.equal(await evaluate('(() => { const nav = document.getElementById("graph-link"), r = nav.getBoundingClientRect(); return nav.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); })()'), true, 'persistent warnings never cover navigation');
      assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
      await writeFile(path.join(output, `system-warning-${theme}-${width}.png`), (await window.webContents.capturePage()).toPNG());
    }
    await evaluate('document.getElementById("toast-close").click()');
    assert.equal(await evaluate('document.getElementById("app-toast").hidden'), true);
    await evaluate('systemMessages.clear()');
  }
  console.log('Inline updater UI PASS: production shell, both themes, keyboard, icon-only states/glow, rotating readiness halo, static action glyph, reduced motion, floating completion/expiry without polling replay, Settings version, pinned exception, failed restart/recovery, draft stability, restricted actions, narrow layout, shared native/renderer messages, warning priority, safe text and brain/app scope fencing. Screenshots:', output);
  window.destroy(); server.close(); await rm(profile, { recursive: true, force: true }); app.exit(0);
} catch (error) { console.error(error); window?.destroy(); server.close(); app.exit(1); }

}
void run().catch(error => { console.error(error); app.exit(1); });
