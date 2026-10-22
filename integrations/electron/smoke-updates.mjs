// Test-only real sandbox/preload/IPC + production browser shell. No actual updater writes.
import { app } from 'electron';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createEditorWindow } from './window.mjs';
import { createDesktopUpdater } from './updates.mjs';
const config = JSON.parse(await readFile(process.env.JUMPYBRAIN_ELECTRON_SMOKE_FIXTURE, 'utf8'));
app.setPath('userData', config.userData);
app.on('window-all-closed', () => {});
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let window;
async function smoke() {
try {
  console.log('Update smoke: waiting for Electron');
  await app.whenReady();
  console.log('Update smoke: Electron ready');
  let finish, fail = true, restartCount = 0;
  const updater = createDesktopUpdater({ currentVersion: '0.3.3', discover: async () => ({ version: '0.3.4' }),
    stage: async (_release, progress) => { progress('Installing update… This can take a few minutes.'); await new Promise((resolve) => { finish = resolve; }); if (fail) throw new Error('fixture'); return {}; },
    restart: async () => { restartCount++; },
  });
  await updater.check();
  const editor = createEditorWindow(config, { updater }); window = editor.window; await editor.loaded; console.log('Update smoke: editor loaded');
  const js = (value) => window.webContents.executeJavaScript(value, true);
  const until = async (value) => { const deadline = Date.now() + 10000; while (Date.now() < deadline) { if (await js(value)) return; await sleep(30); } throw new Error('Timed out: ' + value); };
  await until('document.getElementById("desktop-update")?.dataset.state === "available"');
  assert.equal(await js('typeof window.require'), 'undefined');
  assert.equal(await js('Object.keys(window.jumpyBrainUpdates).sort().join(",")'), 'check,install,restart,state,subscribe');
  await js('document.getElementById("desktop-update-toggle").click()');
  assert.equal(await js('document.getElementById("desktop-update-action").textContent'), 'Install update');
  const location = await js('(() => { const a=document.getElementById("app-sidebar").getBoundingClientRect(), b=document.getElementById("desktop-update-toggle").getBoundingClientRect(); return { right:a.right-b.right, bottom:a.bottom-b.bottom }; })()');
  assert.ok(location.right >= 0 && location.right <= 24 && location.bottom <= 24, JSON.stringify(location));
  await writeFile(config.screenshot, (await window.webContents.capturePage()).toPNG());
  await js('document.querySelector("#color-theme").value = "dark"; document.querySelector("#color-theme").dispatchEvent(new Event("change"))');
  await sleep(100);
  await writeFile(config.screenshot.replace('.png', '-dark.png'), (await window.webContents.capturePage()).toPNG());
  await js('document.getElementById("desktop-update-action").click(); document.getElementById("desktop-update-action").click()');
  await until('document.getElementById("desktop-update").dataset.state === "installing"');
  assert.equal(await js('document.getElementById("desktop-update-action").disabled'), true);
  finish(); await until('document.getElementById("desktop-update").dataset.state === "error"');
  await until('!document.getElementById("desktop-update-action").disabled');
  fail = false;
  await js('document.getElementById("desktop-update-action").click()');
  await until('document.getElementById("desktop-update").dataset.state === "installing"');
  finish(); await until('document.getElementById("desktop-update").dataset.state === "ready"');
  await until('!document.getElementById("desktop-update-action").disabled');
  assert.equal(await js('document.getElementById("desktop-update-action").textContent'), 'Restart to update');
  assert.equal(await js('getComputedStyle(document.getElementById("update-restart-icon")).display === "none"'), false);
  await writeFile(config.screenshot.replace('.png', '-ready.png'), (await window.webContents.capturePage()).toPNG());
  await js('document.getElementById("desktop-update-action").click()');
  await until('document.getElementById("desktop-update-message").textContent.includes("Restart paused")');
  assert.equal(restartCount, 1);
  await js('document.getElementById("desktop-update-toggle").focus()');
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'ESC' });
  await until('document.getElementById("desktop-update-panel").hidden');
  // State survives renderer reload; no second update service is created.
  window.webContents.reload(); await until('document.getElementById("desktop-update")?.dataset.state === "ready"');
  window.setSize(520, 740); await sleep(150);
  await js('document.getElementById("desktop-update-toggle").click()');
  const bounds = await js('(() => { const b=document.getElementById("desktop-update-panel").getBoundingClientRect(); return {left:b.left,right:b.right,top:b.top,width:innerWidth}; })()');
  assert.ok(bounds.left >= 0 && bounds.right <= bounds.width && bounds.top >= 0, JSON.stringify(bounds));
  await writeFile(config.screenshot.replace('.png', '-narrow.png'), (await window.webContents.capturePage()).toPNG());
  window.destroy();
  // Ordinary windows have no bridge or visible update control.
  const plain = createEditorWindow(config); window = plain.window; await plain.loaded;
  assert.equal(await window.webContents.executeJavaScript('typeof window.jumpyBrainUpdates'), 'undefined');
  assert.equal(await window.webContents.executeJavaScript('document.getElementById("desktop-update").hidden'), true);
  window.destroy();
  await writeFile(config.result, JSON.stringify({ ok: true }));
  app.exit(0);
} catch (error) { await writeFile(config.result, JSON.stringify({ ok: false, error: error.stack })); app.exit(1); }

}
void smoke();
