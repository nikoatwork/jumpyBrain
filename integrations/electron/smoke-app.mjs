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
  assert.equal(await js('document.getElementById("open").disabled'), false);
  assert.match(await js('document.getElementById("agent-folder-hint").textContent'), /~\/\.jumpybrain\/memory.*⌘⇧G.*~\/\.jumpybrain\/app/);
  assert.equal(await js('document.getElementById("folder-help").open'), false);
  assert.equal(await js('typeof require'), 'undefined');
  assert.equal(await js('fetch("https://example.com").then(() => false, () => true)'), true);
  await js('window.open("https://example.com")');
  assert.equal(BrowserWindow.getAllWindows().length, 1);
  await js('document.getElementById("choose").click()');
  await until('!document.getElementById("choose").disabled');
  assert.equal(await js('document.getElementById("open").disabled'), false);
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
  assert.match(await js('document.getElementById("open").textContent'), /Open my notes/);
  assert.equal(await js('document.getElementById("folder-help").open'), false);
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
  const starterPage = welcome.starterPage;
  assert.ok(starterPage);
  const starterWindow = createEditorWindow(config, { starterPage });
  window = starterWindow.window; await starterWindow.loaded;
  await until(`document.querySelector('[data-page-link="${starterPage.id}"]')`);
  await js(`document.querySelector('[data-page-link="${starterPage.id}"]').click()`);
  await until(`document.querySelectorAll('[role="checkbox"]').length === 20`);
  for (const [width, theme] of [[1200, 'light'], [480, 'light'], [1200, 'dark'], [480, 'dark']]) {
    window.setSize(width, 1000);
    await js(`document.documentElement.dataset.theme = ${JSON.stringify(theme)}`);
    await pause(150);
    assert.equal(await js('document.documentElement.scrollWidth <= innerWidth'), true);
    await writeFile(config.screenshot.replace('welcome.png', `focus-${width}-${theme}.png`), (await window.webContents.capturePage()).toPNG());
    await js(`Array.from(document.querySelectorAll('h2')).find(node => node.textContent === 'The rest').scrollIntoView({block:'center'})`);
    await pause(100);
    await writeFile(config.screenshot.replace('welcome.png', `focus-rest-${width}-${theme}.png`), (await window.webContents.capturePage()).toPNG());
    await js(`document.getElementById('note-title').scrollIntoView()`);
  }
  await js(`document.querySelector('[role="checkbox"]').click()`);
  await until('document.getElementById("note-save-state").textContent.includes("Saved")');
  assert.match(await readFile(path.join(config.setupRoot, starterPage.file), 'utf8'), /- \[x\]/);
  await js(`document.querySelector('[data-page-pin="${starterPage.id}"]').click()`);
  await until(`!document.querySelector('#sidebar-pinned [data-page-link="${starterPage.id}"]')`);
  await window.webContents.reload();
  await pause(500);
  assert.equal(await js(`!!document.querySelector('#sidebar-pinned [data-page-link="${starterPage.id}"]')`), false);
  // Simulate a user re-pin, then exercise the existing Settle action.
  await js(`(() => {
    const key = ${JSON.stringify('jumpybrain.pageNavigation.v1:' + starterPage.scope)};
    const value = JSON.parse(localStorage.getItem(key)); value.pinned.push(${JSON.stringify({ id: starterPage.id, title: 'Today' })});
    localStorage.setItem(key, JSON.stringify(value)); window.dispatchEvent(new StorageEvent('storage', {key, newValue:JSON.stringify(value)}));
  })()`);
  await until(`document.querySelector('[data-page-action="${starterPage.id}:settle"]')`);
  await js(`document.querySelector('[data-page-action="${starterPage.id}:settle"]').click()`);
  await until(`!document.querySelector('[data-page-link="${starterPage.id}"]')`);
  { const closed = new Promise(resolve => window.once('closed', resolve)); window.close(); await closed; }
  const reopenedStarter = createEditorWindow(config, { starterPage });
  window = reopenedStarter.window; await reopenedStarter.loaded; await pause(500);
  assert.equal(await js(`!!document.querySelector('#sidebar-pinned [data-page-link="${starterPage.id}"]')`), false);
  { const closed = new Promise(resolve => window.once('closed', resolve)); window.close(); await closed; }
  checks.push('starter 10/5/5, native light/dark wide/narrow, checkbox persistence, unpin/reload, settle/relaunch, idempotent handoff');

  // Reopening welcome never initializes anything unless a button is chosen.
  welcome = createOnboardingWindow(config);
  window = welcome.window; await welcome.loaded;
  console.log('Electron smoke: second welcome loaded');
  await until('!document.getElementById("open").disabled');
  await js('document.getElementById("open").click()');
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
  await js('document.getElementById("new-board").click()');
  await until('document.getElementById("board-title").textContent === "Untitled board"');
  await js(`document.querySelector('[aria-label="Rename board"]').click(); const renameInput=document.querySelector('.board-rename-input');renameInput.value='Desktop board';renameInput.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));`);
  await until('document.getElementById("board-title").textContent === "Desktop board"');
  assert.equal(await js('document.querySelectorAll(".board-column").length'), 3);
  await js(`document.querySelector('[aria-label="Add note to To do"]').click();const input=document.querySelector('.board-composer input');input.value='Native board note';input.dispatchEvent(new Event('input',{bubbles:true}));`);
  await until(`document.querySelector('.board-composer [role="option"]:not(:disabled)')`);
  await js(`document.querySelector('.board-composer [role="option"]:not(:disabled)').click()`);
  await until(`document.querySelector('.board-card')?.textContent.includes('Native board note')`);
  assert.equal(await js(`document.querySelector('.board-composer input').value`),'');
  await js(`document.querySelector('.board-composer input').value='Keep typing';document.querySelector('.board-composer input').focus();window.nativeComposer=document.activeElement;boardsUI.refresh()`);
  await until(`document.querySelector('.board-card')?.textContent.includes('Native board note')`);
  assert.equal(await js(`document.activeElement===window.nativeComposer && document.activeElement.value==='Keep typing'`),true);
  await js(`document.querySelector('.board-composer input').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
  assert.equal(await js(`document.activeElement.getAttribute('aria-label')`),'Add note to To do');
  await writeFile(config.screenshot.replace('welcome.png', 'board-native.png'), (await window.webContents.capturePage()).toPNG());
  await js(`document.querySelector('[aria-label="Settle Desktop board"]').click()`);
  await until(`!document.querySelector('#sidebar-boards [aria-label="Settle Desktop board"]')`);
  await js('document.getElementById("notes-link").click()');
  await until('document.body.dataset.view === "home"');
  checks.push('native immediate board creation, inline rename, repeated note composer, refresh focus, Escape, sidebar settle and guarded return');


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
  // Automated native input can run while another app occludes the test window.
  // Keep its animation-frame observers and smooth scroll clock advancing.
  window.webContents.setBackgroundThrottling(false);
  await until('!document.getElementById("note-outline").hidden && document.querySelectorAll(".note-outline-tick").length === 2');
  await js('document.getElementById("note-outline-control").focus()');
  // Let editor selection/focus reconciliation finish before native key input.
  await js('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  for (const keyCode of ['End', 'Return']) {
    window.webContents.sendInputEvent({ type: 'keyDown', keyCode });
    window.webContents.sendInputEvent({ type: 'keyUp', keyCode });
  }
  // Let native smooth scrolling settle before user-gesture renderer polling.
  await pause(700);
  await until('document.getElementById("note-panel").scrollTop > 0 && document.querySelector("#note-editor h2").getBoundingClientRect().bottom < document.getElementById("note-panel").getBoundingClientRect().bottom && document.querySelectorAll(".note-outline-tick")[1].dataset.current === "true"');
  assert.match(await js('document.getElementById("note-outline-title").textContent'), /Next section/);
  assert.equal(await readFile(existingNote, 'utf8'), existingBytes, 'section navigation never edits Markdown');
  checks.push('heading rail keyboard navigation');
  const findItem = Menu.getApplicationMenu().items.find(item => item.label === 'Edit').submenu.items.find(item => item.label === 'Find in Note…');
  assert.equal(findItem.accelerator, 'CommandOrControl+F');
  findItem.click();
  await until('!document.getElementById("note-find").hidden && document.activeElement.id === "note-find-input"');
  await window.webContents.insertText('fixture');
  await until('document.getElementById("note-find-count").textContent === "1 of 2"');
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Return' });
  window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Return' });
  await until('document.getElementById("note-find-count").textContent === "2 of 2"');
  for (const width of [1200, 480]) for (const theme of ['light', 'dark']) {
    window.setSize(width, 860);
    await js(`localStorage.setItem('jumpybrain.theme', '${theme}'); document.documentElement.dataset.theme = '${theme}'`);
    await pause(100);
    await writeFile(config.screenshot.replace('welcome.png', `find-${width}-${theme}.png`), (await window.webContents.capturePage()).toPNG());
    assert.equal(await js('document.documentElement.scrollWidth <= innerWidth'), true);
    await js('if (document.getElementById("page-details").hidden) document.getElementById("toggle-page-details").click()');
    await until('!document.getElementById("page-details").hidden');
    await js('document.getElementById("delete-note").click()');
    await until('!document.getElementById("delete-confirm").disabled');
    assert.match(await js('document.getElementById("document-delete").textContent'), /Deleting this note cannot be undone/);
    await writeFile(config.screenshot.replace('welcome.png', `delete-${width}-${theme}.png`), (await window.webContents.capturePage()).toPNG());
    await js('document.getElementById("delete-cancel").click()');
    await js('if (!document.getElementById("note-details-content").hidden) document.getElementById("toggle-page-details").click()');
    assert.equal(await readFile(existingNote, 'utf8'), existingBytes);
  }
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
  window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
  await until('document.getElementById("note-find").hidden');
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'f', modifiers: ['meta'] });
  window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'f', modifiers: ['meta'] });
  await until('!document.getElementById("note-find").hidden');
  await js('document.getElementById("note-find-close").click()');
  assert.equal(await readFile(existingNote, 'utf8'), existingBytes, 'native find never mutates canonical Markdown');
  window.setSize(1200, 860);
  checks.push('native Find menu and Command-F, match navigation, Escape, immutable Markdown and 1200/480px themes');
  await js('document.getElementById("note-editor").focus()');
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'End', modifiers: ['meta'] });
  window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'End', modifiers: ['meta'] });
  await window.webContents.insertText(' Saved from Electron');
  await until('document.getElementById("note-save-state").textContent === "Saved"');
  checks.push('editing and autosave');
  assert.equal(await js('document.getElementById("copy-note-draft").getAttribute("aria-label")'), 'Copy');
  assert.equal(await js('document.getElementById("format-controls").hidden'), true);
  assert.equal(await js('document.getElementById("insert-reference").textContent.trim()'), 'Link');

  const foldedBytes = await readFile(existingNote, 'utf8');
  await js('document.getElementById("toggle-note-format").focus()');
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Return' });
  window.webContents.sendInputEvent({ type: 'char', keyCode: '\r' });
  window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Return' });
  await until('!document.getElementById("format-controls").hidden');
  await js('document.querySelector("[data-format=bold]").focus()');
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
  window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
  await until('document.getElementById("format-controls").hidden');
  assert.equal(await js('document.activeElement.id'), 'toggle-note-format');
  assert.equal(await readFile(existingNote, 'utf8'), foldedBytes, 'format disclosure never writes Markdown');
  assert.equal(await js('document.getElementById("note-details-content").hidden'), true);
  await js('document.getElementById("toggle-page-details").click()');
  await until('!document.getElementById("page-details").hidden');
  assert.equal(await js('document.getElementById("note-outline-list")'), null);
  assert.equal(await js('document.getElementById("saved-version-editor").textContent'), 'You');
  assert.equal(await js('document.getElementById("note-file").textContent'), 'notes/electron-fixture.md');
  for (const theme of ['light', 'dark']) {
    await js(`document.documentElement.dataset.theme = '${theme}'`);
    await js('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
    await writeFile(config.screenshot.replace('welcome.png', `note-workspace-${theme}.png`), (await window.webContents.capturePage()).toPNG());
    await js('document.getElementById("toggle-note-format").click()');
    await js('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
    await writeFile(config.screenshot.replace('welcome.png', `note-format-${theme}.png`), (await window.webContents.capturePage()).toPNG());
    await js('document.getElementById("toggle-note-format").click()');
  }
  await js('document.getElementById("toggle-page-details").focus()');
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
  window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
  await until('document.getElementById("note-details-content").hidden');
  assert.equal(await js('document.activeElement.id'), 'toggle-page-details');
  checks.push('folded formatting keyboard/Enter/Escape, direct Link, immutable fold, accessible copy, sticky action card/folded details, saved-version actor/location and focus return');


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
