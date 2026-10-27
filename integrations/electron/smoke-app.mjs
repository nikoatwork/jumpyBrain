// Test-only Electron entrypoint. Never imported by the prototype app.
import { app, Menu, BrowserWindow } from 'electron';
import assert from 'node:assert/strict';
import { readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { createOnboardingWindow } from './onboarding.mjs';
import { companionControl, setupComplete, finishSetup } from './setup.mjs';
import { createEditorWindow, setApplicationMenu } from './window.mjs';
import { startElectronDiagnostics } from './diagnostics.mjs';

const config = JSON.parse(await readFile(process.env.JUMPYBRAIN_ELECTRON_SMOKE_FIXTURE, 'utf8'));
app.setPath('userData', config.userData);
app.on('window-all-closed', () => {}); // Keep the test host alive between welcome/editor windows.
const checks = [];
let window, closeChoice = false, closePrompts = 0;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const js = async (script) => {
  try { return await window.webContents.executeJavaScript(script, true); }
  catch { throw new Error('Renderer script failed: ' + script); }
};
async function until(script) {
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) { if (await js(script)) return; await pause(40); }
  throw new Error('Timed out: ' + script);
}
async function smoke() {
try {
  await app.whenReady();
  const diagnostics = await startElectronDiagnostics({ ...config, runtimeRoot: config.runtimeRoot }, { directory: config.userData });
  diagnostics.connect(config);
  // Exercise the actual packaged page/preload/native boundary with a picker seam.
  console.log('Electron smoke: onboarding start');
  const before = await companionControl(config);
  let choice = { canceled: true, filePaths: [] };
  let welcome = createOnboardingWindow(config, { chooseFolder: async () => choice });
  window = welcome.window;
  await welcome.loaded;
  await until('!document.getElementById("choose").disabled');
  assert.equal(await js('document.getElementById("open").disabled'), true);
  assert.match(await js('document.getElementById("agent-folder-hint").textContent'), /~\/\.jumpybrain\/memory.*⌘⇧G.*~\/\.jumpybrain\/app/);
  assert.match(await js('document.getElementById("setup-detail").textContent'), /agents keep their current folder/);
  assert.equal(await js('typeof require'), 'undefined');
  assert.equal(await js('fetch("https://example.com").then(() => false, () => true)'), true);
  await js('window.open("https://example.com")');
  assert.equal(BrowserWindow.getAllWindows().length, 1);
  await js('document.getElementById("choose").click()');
  await until('!document.getElementById("choose").disabled');
  assert.equal(await js('document.getElementById("open").disabled'), true);
  await writeFile(config.screenshot, (await window.webContents.capturePage()).toPNG());
  choice = { canceled: false, filePaths: [config.invalidRoot] };
  await js('document.getElementById("choose").click()');
  await until('document.getElementById("message").textContent.includes("empty folder")');
  assert.equal(await js('document.getElementById("open").disabled'), true);
  assert.equal(await readFile(path.join(config.invalidRoot, 'keep.txt'), 'utf8'), 'Untouched');
  // Existing CLI brain: choose and open exactly the same canonical files.
  const existingNote = path.join(config.existingRoot, 'notes/electron-fixture.md');
  const existingBytes = await readFile(existingNote, 'utf8');
  choice = { canceled: false, filePaths: [config.existingRoot] };
  await js('document.getElementById("choose").click()');
  await until('!document.getElementById("open").disabled');
  assert.match(await js('document.getElementById("open").textContent'), /Open my local brain/);
  assert.match(await js('document.getElementById("setup-detail").textContent'), /agents keep their current folder/);
  await js('document.getElementById("open").click()');
  assert.equal(await welcome.completed, true);
  assert.equal((await companionControl(config)).active.root, config.existingRoot);
  assert.equal(await readFile(existingNote, 'utf8'), existingBytes);
  { const closed = new Promise((resolve) => window.once('closed', resolve)); window.close(); await closed; }
  welcome = createOnboardingWindow(config, { chooseFolder: async () => choice });
  window = welcome.window; await welcome.loaded;
  await until('!document.getElementById("choose").disabled');
  window.setSize(680, 620);
  await pause(100);
  assert.equal(await js('document.getElementById("open").getBoundingClientRect().bottom <= innerHeight'), true, 'primary action is visible at the minimum window size');
  assert.equal(await js('document.documentElement.scrollWidth <= innerWidth'), true);
  await writeFile(config.screenshot.replace('.png', '-small.png'), (await window.webContents.capturePage()).toPNG());
  choice = { canceled: false, filePaths: [config.setupRoot] };
  await js('document.getElementById("choose").click()');
  await until('!document.getElementById("open").disabled');
  await assert.rejects(access(path.join(config.setupRoot, 'jumpybrain.json')));
  await js('document.getElementById("open").click()');
  await until('document.getElementById("message").dataset.error === "true" || document.getElementById("message").textContent.includes("Creating")');
  const completed = await Promise.race([welcome.completed, pause(15000).then(async () => { throw new Error('Setup did not finish: ' + await js('document.getElementById("message").textContent')); })]);
  assert.equal(completed, true);
  assert.equal((await companionControl(config)).active.root, config.setupRoot);
  assert.equal(await setupComplete(config.userData), false);
  await finishSetup(config.userData); assert.equal(await setupComplete(config.userData), true);
  console.log('Electron smoke: created local brain');
  { const closed = new Promise((resolve) => window.once('closed', resolve)); window.close(); await closed; }
  // Reopening welcome never initializes anything unless a button is chosen.
  welcome = createOnboardingWindow(config);
  window = welcome.window; await welcome.loaded;
  console.log('Electron smoke: second welcome loaded');
  await until('!document.getElementById("continue").hidden');
  await js('document.getElementById("continue").click()');
  assert.equal(await welcome.completed, true);
  { const closed = new Promise((resolve) => window.once('closed', resolve)); window.close(); await closed; }
  // Missing prerequisite has a readable recovery screen; no capabilities run.
  welcome = createOnboardingWindow(null);
  window = welcome.window; await welcome.loaded;
  await until('document.getElementById("message").textContent.includes("desktop:setup")');
  const recovery = await js('document.getElementById("message").textContent');
  assert.match(recovery, /existing brain.*\.jumpybrain\/app.*public source setup/);
  assert.doesNotMatch(recovery, /private Git checkout/);
  assert.equal(await js('document.getElementById("choose").hidden'), true);
  { const closed = new Promise((resolve) => window.once('closed', resolve)); window.close(); await closed; }
  assert.equal(await welcome.completed, false);
  console.log('Electron smoke: restoring fixture brain');
  await companionControl(config, 'switch', { id: before.activeId });
  console.log('Electron smoke: editor start');
  checks.push('local-first onboarding, sandboxed bridge, cancel/invalid folder, explicit creation, relaunch, prerequisite recovery');
  const editor = createEditorWindow(config, { confirmClose: () => { closePrompts++; return closeChoice; },
    diagnostics });
  window = editor.window;
  setApplicationMenu({ app, getWindow: () => window, reconnect: () => {} });
  await editor.loaded;
  await until('typeof companionRegistered !== "undefined" && companionRegistered && !companionFrozen');
  assert.equal(await js('document.querySelector("#home h1")?.textContent'), "What's on your mind?");
  assert.equal(new URL(window.webContents.getURL()).hash, '');
  const storage = await js('JSON.stringify({ local: {...localStorage}, session: {...sessionStorage}, token: companionToken })');
  assert.ok(!storage.includes(config.key));
  const cookies = await window.webContents.session.cookies.get({ url: config.origin });
  assert.ok(cookies.some((cookie) => cookie.httpOnly && cookie.sameSite === 'strict'));
  checks.push('existing UI and cookie handshake');

  const prefs = window.webContents.getLastWebPreferences();
  assert.equal(prefs.nodeIntegration, false); assert.equal(prefs.contextIsolation, true); assert.equal(prefs.sandbox, true);
  assert.equal(await js('typeof require'), 'undefined');
  assert.equal(await js('navigator.permissions.query({name:"clipboard-write"}).then(result => result.state)'), 'granted');
  assert.equal(await js('navigator.permissions.query({name:"clipboard-read"}).then(result => result.state)'), 'denied');
  await js('window.open("https://example.com")'); await pause(100);
  assert.equal(BrowserWindow.getAllWindows().length, 1);
  assert.equal(await js('fetch("https://example.com").then(() => false, () => true)'), true);
  await js('location.href = "https://example.com"'); await pause(100);
  assert.equal(new URL(window.webContents.getURL()).origin, config.origin);
  checks.push('renderer isolation and navigation restrictions');

  await js('document.getElementById("open-feedback").click()');
  await until('document.getElementById("feedback-dialog").open');
  await until('document.getElementById("feedback-dialog").dataset.collecting === "false"');
  assert.equal(await js('document.getElementById("feedback-include-logs").checked'), true);
  await js('document.getElementById("feedback-message").value = "Electron feedback"; document.getElementById("feedback-message").dispatchEvent(new Event("input"))');
  assert.equal(await js('document.querySelectorAll("#feedback-dialog details").length'), 0);
  assert.equal(await js('document.getElementById("feedback-close").getAttribute("aria-label")'), 'Close feedback');
  await js('document.getElementById("feedback-send").click()');
  await until('!document.getElementById("feedback-dialog").open && document.getElementById("toast-message").textContent.includes("Feedback sent")');
  assert.equal(await js('document.getElementById("feedback-message").value'), '');
  assert.equal(await js('document.activeElement === document.getElementById("open-feedback")'), true);
  // Other files still cannot download, even from a renderer-created blob.
  const denied = new Promise((resolve) => window.webContents.session.once('will-download', (event) => resolve(event.defaultPrevented)));
  await js('(() => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["blocked"], {type:"text/plain"})); a.download = "other.txt"; a.click(); })()');
  assert.equal(await denied, true);
  checks.push('compact feedback dialog, direct feedback and diagnostic attachment through gateway, other downloads denied');

  const settingsItem = Menu.getApplicationMenu().items[0].submenu.items.find((item) => item.label === 'Settings…');
  settingsItem.click();
  await until('!document.getElementById("companion-settings").hidden');
  checks.push('native Settings menu');
  // Use ordinary in-page navigation so existing save/session guards run.
  await js('document.getElementById("home-link").click()');
  await until('!document.getElementById("home").hidden && companionRegistered && !companionFrozen');
  await js('document.getElementById("graph-link").click()');
  await until('location.pathname === "/graph" && companionRegistered && !companionFrozen');
  checks.push('graph navigation');
  await js('document.getElementById("home-link").click()');
  await until('location.pathname === "/" && companionRegistered && !companionFrozen');
  await until(`!!document.querySelector('a[href*="${config.id}"]')`);
  await js(`document.querySelector('a[href*="${config.id}"]').click()`);
  await until('!document.getElementById("note-editor").hidden && document.getElementById("note-editor").textContent.includes("Original fixture body.")');
  await js('document.getElementById("note-editor").focus()');
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'End', modifiers: ['meta'] });
  window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'End', modifiers: ['meta'] });
  await window.webContents.insertText(' Saved from Electron');
  await until('document.getElementById("note-save-state").textContent === "Saved"');
  checks.push('editing and autosave');

  // A deterministic pending draft exercises the production browser unload veto
  // and the production Electron close handler without altering canonical data.
  await js('window.addEventListener("beforeunload", function fixturePending(event) { event.preventDefault(); event.returnValue = ""; })');
  window.close(); await pause(150);
  assert.equal(window.isDestroyed(), false); assert.equal(closePrompts, 1);
  closeChoice = true;
  const closed = new Promise((resolve) => window.once('closed', resolve));
  window.close(); await closed;
  assert.equal(closePrompts, 2);
  checks.push('keep/discard close guard');
  await writeFile(config.result, JSON.stringify({ ok: true, checks }));
  app.exit(0);
} catch (error) {
  if (window && !window.isDestroyed()) console.log('Electron smoke: failure state', await js('JSON.stringify({save:document.getElementById("note-save-state")?.textContent, message:document.getElementById("note-message")?.textContent})').catch(() => 'unavailable'));
  await writeFile(config.result, JSON.stringify({ ok: false, checks, error: error.message.split(config.key).join('[redacted]') }));
  console.error(error.message.split(config.key).join('[redacted]'));
  app.exit(1);
}
}
// Electron waits for ESM evaluation before emitting ready. Await readiness inside
// a detached async function, never at module top level.
void smoke();
