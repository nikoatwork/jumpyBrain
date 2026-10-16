// Test-only Electron entrypoint. Never imported by the prototype app.
import { app, Menu, BrowserWindow } from 'electron';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createEditorWindow, setApplicationMenu } from './window.mjs';
import { startElectronDiagnostics } from './diagnostics.mjs';

const config = JSON.parse(await readFile(process.env.JUMPYBRAIN_ELECTRON_SMOKE_FIXTURE, 'utf8'));
app.setPath('userData', config.userData);
const checks = [];
let window, closeChoice = false, closePrompts = 0;
const feedbackEmails = [];
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
  const editor = createEditorWindow(config, { confirmClose: () => { closePrompts++; return closeChoice; },
    openFeedbackEmail: async (url) => { feedbackEmails.push(url); }, diagnostics });
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
  await until('!document.getElementById("feedback-download").disabled');
  assert.equal(await js('document.getElementById("feedback-include-logs").checked'), true);
  await js('document.getElementById("feedback-message").value = "Electron feedback"; document.getElementById("feedback-message").dispatchEvent(new Event("input"))');
  const emailPath = path.join(config.userData, 'jumpybrain-feedback.eml');
  const downloaded = new Promise((resolve, reject) => {
    window.webContents.session.once('will-download', (event, item) => {
      if (event.defaultPrevented) { reject(new Error('Feedback download was denied')); return; }
      item.setSavePath(emailPath);
      item.once('done', (_event, state) => state === 'completed' ? resolve() : reject(new Error('Feedback download failed: ' + state)));
    });
  });
  await js('document.getElementById("feedback-download").click()');
  await downloaded;
  const email = await readFile(emailPath, 'utf8');
  assert.match(email, /To: jumpybrain@agentmail.to/);
  assert.match(email, /Content-Disposition: attachment; filename="jumpybrain-diagnostics.txt"/);
  assert.ok(!email.includes(config.key));
  await js('document.getElementById("feedback-mailto").click()');
  const emailDeadline = Date.now() + 3000;
  while (!feedbackEmails.length && Date.now() < emailDeadline) await pause(40);
  assert.equal(feedbackEmails.length, 1);
  assert.equal(new URL(feedbackEmails[0]).pathname, 'jumpybrain@agentmail.to');
  assert.match(new URL(feedbackEmails[0]).searchParams.get('body'), /Electron feedback/);
  assert.equal(new URL(window.webContents.getURL()).origin, config.origin);
  await js('document.getElementById("feedback-close").click()');
  // Other files still cannot download, even from a renderer-created blob.
  const denied = new Promise((resolve) => window.webContents.session.once('will-download', (event) => resolve(event.defaultPrevented)));
  await js('(() => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["blocked"], {type:"text/plain"})); a.download = "other.txt"; a.click(); })()');
  assert.equal(await denied, true);
  checks.push('feedback attachment download, fixed-recipient email handoff, other downloads denied');

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
