// Test-only renderer smoke: real sandboxed update window, inert updater, disposable profile.
// Run: env -u ELECTRON_RUN_AS_NODE integrations/electron/node_modules/.bin/electron integrations/electron/smoke-updater-ui.mjs
import { app, nativeTheme } from 'electron';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createUpdateWindow } from './update-window.mjs';

app.on('window-all-closed', () => {});
async function run() {
const profile = await mkdtemp(path.join(os.tmpdir(), 'jumpybrain-update-ui-'));
app.setPath('userData', profile);
const output = path.resolve('.local-pack/update-ui');
await mkdir(output, { recursive: true });
await app.whenReady();
const installed = { app: '0.3.3', runtime: '0.3.3', cli: '0.3.3', cliPolicy: { kind: 'managed', detail: 'The managed CLI will update with the Mac app. Its source policy, memory, targets, and integrations are preserved.' } };
let state = {}, clicks = [], window;
const updater = { action: async name => { if (name !== 'status') clicks.push(name); return state; }, snapshot: async () => state, logPath: () => null };
const evaluate = expression => window.webContents.executeJavaScript(expression);
async function show(phase, extra = {}) {
  state = { phase, installed, available: '0.3.4', detail: 'Building the Mac app for this Mac… You can keep editing.', notes: 'A small release.\n<script>window.untrusted = true</script>', canPrepare: phase === 'available', ...extra };
  await evaluate('act("status")');
  await evaluate('document.fonts.ready');
}
async function capture(name) {
  // Allow Chromium to paint the DOM/theme change before capturing its compositor.
  await new Promise(resolve => setTimeout(resolve, 100));
  const image = await window.webContents.capturePage();
  await writeFile(path.join(output, `${name}.png`), image.toPNG());
}
try {
  window = createUpdateWindow(updater);
  await new Promise(resolve => window.webContents.once('did-finish-load', resolve));
  await new Promise(resolve => setTimeout(resolve, 100));
  for (const theme of ['light', 'dark']) {
    nativeTheme.themeSource = theme;
    for (const phase of ['idle', 'checking', 'current', 'available', 'preparing', 'ready', 'updating', 'success', 'recovered']) {
      await show(phase);
      assert.equal(await evaluate('document.getElementById("details").open'), false);
      assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
      assert.equal(await evaluate('document.querySelector("#details > summary").getBoundingClientRect().bottom <= innerHeight'), true, `${theme}/${phase} must fit`);
      if (phase === 'available') {
        assert.equal(await evaluate('document.getElementById("check").hidden'), true);
        await evaluate('document.getElementById("prepare").click()');
        assert.equal(clicks.at(-1), 'prepare');
      }
      if (phase === 'preparing') {
        assert.equal(await evaluate('document.getElementById("hint").textContent'), 'You can keep working.');
        assert.equal(await evaluate('document.getElementById("version-summary").textContent'), '0.3.3 → 0.3.4');
        assert.equal(await evaluate('document.getElementById("phase").title'), state.detail);
        await capture(`preparing-${theme}`);
      }
      if (phase === 'ready') {
        assert.equal(await evaluate('document.getElementById("restart").hidden'), false);
        assert.equal(await evaluate('document.getElementById("defer").hidden'), false);
        await capture(`ready-${theme}`);
      }
    }
  }
  nativeTheme.themeSource = 'light';
  window.setSize(420, 360);
  await show('available', { installed: { ...installed, cliPolicy: { kind: 'pinned', detail: 'Pinned CLI remains unchanged.' } } });
  assert.equal(await evaluate('document.getElementById("app-only").hidden'), false);
  assert.equal(await evaluate('document.getElementById("prepare").hidden'), true);
  assert.match(await evaluate('document.getElementById("scope").textContent'), /CLI stays unchanged/);
  await capture('app-only');
  window.focus();
  await evaluate('document.querySelector("#details > summary").focus()');
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Return' });
  window.webContents.sendInputEvent({ type: 'char', keyCode: '\r' });
  window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Return' });
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(await evaluate('document.getElementById("details").open'), true, 'keyboard opens details');
  assert.equal(await evaluate('document.getElementById("notes").textContent'), state.notes);
  assert.equal(await evaluate('Boolean(window.untrusted)'), false);
  await capture('details');
  await evaluate('document.getElementById("details").open = false');
  await show('failed', { canRecover: true, logAvailable: true, detail: 'The updater was interrupted. Recover the previous installation.' });
  assert.equal(await evaluate('document.getElementById("details").open'), true, 'errors reveal actionable detail');
  assert.equal(await evaluate('document.getElementById("recover").hidden'), false);
  assert.equal(await evaluate('document.getElementById("log").hidden'), false);
  await capture('recovery');
  await evaluate('document.getElementById("details").open = false');
  await show('failed', { canRecover: true });
  assert.equal(await evaluate('document.getElementById("details").open'), false, 'polling respects disclosure choice');
  console.log(`Updater UI smoke passed: all phases, light/dark, compact layout, app-only, keyboard details, recovery. Screenshots: ${output}`);
  window.destroy();
  await rm(profile, { recursive: true, force: true });
  app.exit(0);
} catch (error) {
  console.error(error);
  window?.destroy();
  await rm(profile, { recursive: true, force: true });
  app.exit(1);
}

}
void run().catch(error => { console.error(error); app.exit(1); });
