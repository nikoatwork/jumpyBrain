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
  const outlineSnapshot = () => evaluate(`(() => {
    const button = document.getElementById('desktop-updates'), b = getComputedStyle(button), s = getComputedStyle(button, '::after');
    return { animation: s.animationName, angle: s.getPropertyValue('--desktop-update-angle'), background: s.backgroundImage,
      transform: s.transform, radius: s.borderRadius, buttonRadius: b.borderRadius, width: parseFloat(s.width), height: parseFloat(s.height),
      buttonWidth: button.offsetWidth, buttonHeight: button.offsetHeight, left: parseFloat(s.left), top: parseFloat(s.top),
      borderLeft: parseFloat(b.borderLeftWidth), borderTop: parseFloat(b.borderTopWidth), mask: s.maskComposite,
      padding: s.padding, pointerEvents: s.pointerEvents, glyph: document.querySelector('#desktop-updates svg').outerHTML };
  })()`);
  const assertOutline = outline => {
    assert.equal(outline.transform, 'none', 'the rounded outline never rotates or leaves the button perimeter');
    assert.equal(outline.radius, outline.buttonRadius, 'outline follows the shared button corners');
    assert.ok(parseFloat(outline.radius) > 0 && parseFloat(outline.radius) < outline.buttonWidth / 2, 'utility buttons retain their rounded-square shape');
    assert.equal(outline.width, outline.buttonWidth, 'outline width matches the stationary button border');
    assert.equal(outline.height, outline.buttonHeight, 'outline height matches the stationary button border');
    assert.equal(outline.left, -outline.borderLeft);
    assert.equal(outline.top, -outline.borderTop);
    assert.ok(outline.mask.includes('exclude'), 'the animated gradient is cut out of the glyph area');
    assert.equal(outline.padding, '1.5px', 'highlight stays in a thin perimeter band');
    assert.equal(outline.pointerEvents, 'none', 'outline never intercepts clicks');
  };
  const captureOutlineFrames = async (phase, theme) => {
    const before = await outlineSnapshot(); assertOutline(before);
    await pause(120);
    const after = await outlineSnapshot(); assertOutline(after);
    assert.notEqual(after.angle, before.angle, 'the border highlight actually travels');
    assert.notEqual(after.background, before.background, 'the rendered gradient follows the animated angle');
    assert.equal(after.glyph, before.glyph, 'download/relaunch glyph stays unchanged during animation');
    assert.equal(await evaluate(`(() => {
      const animation = document.getElementById('desktop-updates').getAnimations({ subtree: true }).find(a => a.animationName === 'desktop-update-border');
      if (!animation) return false;
      animation.pause(); return true;
    })()`), true);
    const angles = [], frames = [];
    try {
      // Eighth-turn samples cover the straight edges and all four corners.
      for (const time of [0, 350, 700, 1050, 1400, 1750, 2100, 2450]) {
        await evaluate(`(() => { document.getElementById('desktop-updates').getAnimations({ subtree: true }).find(a => a.animationName === 'desktop-update-border').currentTime = ${time}; return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); })()`);
        const outline = await outlineSnapshot(); assertOutline(outline);
        assert.equal(outline.glyph, before.glyph); angles.push(outline.angle);
        const bounds = await evaluate(`(() => { const r = document.querySelector('.nav-utilities').getBoundingClientRect(); return { x: Math.max(0, Math.floor(r.x - 10)), y: Math.max(0, Math.floor(r.y - 10)), width: Math.ceil(r.width + 20), height: Math.ceil(r.height + 20) }; })()`);
        const image = await window.webContents.capturePage(bounds);
        const png = image.toPNG(); frames.push(png.toString('base64'));
        await writeFile(path.join(output, `${phase}-outline-${theme}-${time}ms.png`), png);
      }
      assert.equal(new Set(angles).size, 8, 'each captured frame samples a different highlight position');
      assert.equal(new Set(frames).size, 8, 'the highlight visibly changes across edge/corner captures');
    } finally {
      await evaluate(`document.getElementById('desktop-updates').getAnimations({ subtree: true }).find(a => a.animationName === 'desktop-update-border')?.play()`);
    }
  };
  await wait('!!document.getElementById("desktop-updates")');
  assert.equal(await evaluate('document.querySelector("#connection [data-app-version]").textContent'), 'jumpyBrain · Version 0.3.3', 'native app version overrides the browser build version');
  const sidebarBounds = await evaluate('JSON.stringify(document.getElementById("app-sidebar").getBoundingClientRect().toJSON())');
  for (const theme of ['light', 'dark']) {
    await evaluate(`document.documentElement.dataset.theme = ${JSON.stringify(theme)}`);
    for (const phase of ['idle', 'current', 'canceled', 'available', 'checking', 'preparing', 'updating', 'ready', 'success', 'recovered', 'failed']) {
      const actions = phase === 'ready' ? ['restart', 'cancel', 'log'] : phase === 'available' ? ['update', 'check'] : phase === 'preparing' ? ['cancel', 'log'] : phase === 'updating' ? [] : ['check'];
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
      const outline = await outlineSnapshot();
      assert.equal(outline.animation, ['available', 'ready'].includes(phase) ? 'desktop-update-border' : 'none', 'only actionable readiness has a traveling border highlight');
      assert.equal(await evaluate('getComputedStyle(document.querySelector("#desktop-updates svg")).animationName'), ['checking', 'preparing', 'updating'].includes(phase) ? 'desktop-update-spin' : 'none', 'readiness keeps the action glyph still');
      if (['available', 'ready'].includes(phase)) {
        await captureOutlineFrames(phase, theme);
      }
      if (phase === 'preparing' || phase === 'ready' || phase === 'available') {
        assert.equal(await evaluate('document.querySelector("main").inert'), false);
        assert.equal(await evaluate('document.getElementById("desktop-updates").getAttribute("aria-label")'), phase === 'ready' ? 'Relaunch to apply update' : phase === 'available' ? 'Download update' : 'Preparing update');
        assert.equal(await evaluate('document.getElementById("desktop-updates").textContent'), '');
        await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
        await writeFile(path.join(output, `${phase}-${theme}.png`), (await window.webContents.capturePage()).toPNG());
      }
      if (['idle', 'current', 'canceled', 'success', 'recovered'].includes(phase)) assert.equal(await evaluate('document.getElementById("desktop-updates").hidden'), true);
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
      if (phase !== 'preparing') {
        const before = await outlineSnapshot(); assertOutline(before); await pause(120);
        assert.deepEqual(await outlineSnapshot(), before, 'reduced motion keeps the readiness outline static');
        await writeFile(path.join(output, `${phase}-reduced-motion-${theme}.png`), (await window.webContents.capturePage()).toPNG());
      }
    }
    await motion('no-preference');
  }
  state = { phase: 'available', actions: ['update', 'check'], installed }; await pause(1150);
  await evaluate('document.getElementById("desktop-updates").focus()');
  assert.equal(await evaluate('document.getElementById("desktop-updates").matches(":focus-visible")'), true);
  assert.equal(await evaluate('getComputedStyle(document.getElementById("desktop-updates")).outlineStyle'), 'solid');
  await writeFile(path.join(output, 'available-keyboard-focus.png'), (await window.webContents.capturePage()).toPNG());
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Return' });
  window.webContents.sendInputEvent({ type: 'char', keyCode: '\r' });
  window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Return' });
  await pause(200); assert.equal(calls.at(-1), 'update');
  state = { phase: 'available', actions: ['app-only', 'check'], canPrepare: true, installed: { ...installed, cliPolicy: { kind: 'pinned', detail: 'Pinned CLI unchanged.' } } }; await pause(1150);
  assert.match(await evaluate('document.getElementById("desktop-updates").getAttribute("aria-label")'), /Update app only; CLI stays unchanged/);
  assert.equal(await evaluate('document.getElementById("desktop-updates").dataset.attention'), 'true');
  for (const theme of ['light', 'dark']) {
    await evaluate(`document.documentElement.dataset.theme = ${JSON.stringify(theme)}`);
    assertOutline(await outlineSnapshot());
    await writeFile(path.join(output, `available-app-only-${theme}.png`), (await window.webContents.capturePage()).toPNG());
  }
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
  for (const theme of ['light', 'dark']) {
    await evaluate(`document.documentElement.dataset.theme = ${JSON.stringify(theme)}`);
    for (const width of [390, 320]) {
      window.setContentSize(width, 860); await pause(100);
      for (const phase of ['available', 'preparing', 'ready', 'failed', 'success']) {
        state = { phase, installed, actions: phase === 'ready' ? ['restart'] : phase === 'available' ? ['update'] : phase === 'preparing' ? [] : ['check'], detail: 'An update could not be confirmed.' };
        await pause(1150);
        assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
        assert.equal(await evaluate('!!document.getElementById("desktop-update-panel")'), false);
        const bounds = await evaluate('(() => { const r = document.getElementById("app-toast").getBoundingClientRect(); return { left: r.left, right: r.right }; })()');
        assert.ok(bounds.left >= 0 && bounds.right <= width, 'notification fits the narrow viewport');
        if (['available', 'ready'].includes(phase)) {
          assertOutline(await outlineSnapshot());
          assert.equal(await evaluate(`(() => {
            const button = document.getElementById('desktop-updates'), theme = document.getElementById('color-theme'), r = button.getBoundingClientRect(), t = theme.getBoundingClientRect();
            return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight
              && (r.right <= t.left || r.left >= t.right || r.bottom <= t.top || r.top >= t.bottom)
              && button.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
          })()`), true, 'update border fits the viewport and stays separate from the clickable theme control');
          await writeFile(path.join(output, `${phase}-${theme}-${width}.png`), (await window.webContents.capturePage()).toPNG());
        }
      }
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
  console.log('Inline updater UI PASS: production shell, both themes, keyboard/focus, icon-only states/glow, traveling highlight on a fixed rounded border, eight edge/corner frames, static action glyph, reduced motion, floating completion/expiry without polling replay, Settings version, pinned exception, failed restart/recovery, draft stability, restricted actions, narrow layout, shared native/renderer messages, warning priority, safe text and brain/app scope fencing. Screenshots:', output);
  window.destroy(); server.close(); await rm(profile, { recursive: true, force: true }); app.exit(0);
} catch (error) { console.error(error); window?.destroy(); server.close(); app.exit(1); }

}
void run().catch(error => { console.error(error); app.exit(1); });
