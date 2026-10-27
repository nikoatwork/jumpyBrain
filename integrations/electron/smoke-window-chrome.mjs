// Test-only native entrypoint, excluded from the app bundle. Never uses the installed app or personal brain.
import { app } from 'electron';
import assert from 'node:assert/strict';
import { readFile, writeFile, rm, access } from 'node:fs/promises';
import path from 'node:path';
import { createEditorWindow, setApplicationMenu } from './window.mjs';
// Do not await app readiness at ESM top level: Electron waits for module
// evaluation before its ready event, so that would deadlock startup.
async function run() {
const config = JSON.parse(await readFile(process.env.JUMPYBRAIN_CHROME_FIXTURE, 'utf8'));
app.setPath('userData', config.userData);
app.on('window-all-closed', () => {});
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let window, closePrompts = 0;
const checks = [];
const js = source => window.webContents.executeJavaScript(source, true);
async function until(source) {
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) { if (await js(source)) return; await pause(40); }
  throw new Error('Timed out: ' + source);
}
async function navigate(url) {
  await js(`navigation.navigate(${JSON.stringify(url)})`);
  await until('!navigation.isBusy() && (state.view !== "note" || !!state.editor?.state.loaded) && (state.view !== "graph" || !!state.graph)');
}
async function screenshot(name) {
  await writeFile(path.join(config.screenshots, name + '.png'), (await window.webContents.capturePage()).toPNG());
}
async function click(id) {
  const p = await js(`(() => { const r = document.getElementById(${JSON.stringify(id)}).getBoundingClientRect(); return {x: Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}; })()`);
  for (const type of ['mouseDown', 'mouseUp']) window.webContents.sendInputEvent({ type, ...p, button: 'left', clickCount: 1 });
  await pause(80);
}
function chord(keyCode, modifiers = ['meta']) {
  for (const type of ['keyDown', 'keyUp']) window.webContents.sendInputEvent({ type, keyCode, modifiers });
}
async function fullscreen(value) {
  const event = value ? 'enter-full-screen' : 'leave-full-screen';
  const changed = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Native full-screen transition timed out')), 12000);
    window.once(event, () => { clearTimeout(timer); resolve(); });
  });
  window.setFullScreen(value); await changed; await pause(150);
}
try {
  await app.whenReady();
  const editor = createEditorWindow(config, { confirmClose: () => { closePrompts++; return false; } });
  window = editor.window; await editor.loaded;
  await until('typeof companionRegistered !== "undefined" && companionRegistered && !companionFrozen && document.documentElement.dataset.nativeMac === "true"');
  assert.deepEqual(window.getWindowButtonPosition(), { x: 16, y: 18 });
  const prefs = window.webContents.getLastWebPreferences();
  assert.equal(prefs.sandbox, true); assert.equal(prefs.contextIsolation, true); assert.equal(prefs.nodeIntegration, false);
  assert.equal(await js('typeof require'), 'undefined');
  // Deterministic indexed-search packet only. Note GETs, navigation, creation and saves remain real.
  await js(`window.chromeFixtureFetch = window.fetch; window.fetch = (url, options) => {
    if (String(url).endsWith('/memories/all/search')) return Promise.resolve(new Response(${JSON.stringify(JSON.stringify(config.search))}, {headers:{'Content-Type':'application/json'}}));
    if (window.chromeFixtureBlockSave && options?.method === 'PUT') return Promise.resolve(new Response('{}', {status:500,headers:{'Content-Type':'application/json'}}));
    return window.chromeFixtureFetch(url, options);
  }; true`);
  await until('document.querySelectorAll("#sidebar-recent a").length > 0');
  assert.equal(await js(`!!document.querySelector('[data-page-link="${config.ids[0]}"]')`), false);
  for (const width of [1200, 480]) {
    window.setSize(width, 860); await pause(120);
    for (const theme of ['light', 'dark']) {
      await js(`colorTheme.setPreference(${JSON.stringify(theme)})`);
      for (const [view, url] of [['home', '/'], ['note', '/?note=' + config.ids[9]], ['graph', '/graph']]) {
        await navigate(url);
        assert.equal(await js('document.documentElement.scrollWidth <= innerWidth'), true);
        const header = await js('(() => { const t=document.getElementById("toggle-sidebar"), b=document.getElementById("home-link"), r=t.getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,brand:b.textContent,weight:getComputedStyle(b).fontWeight,drag:getComputedStyle(document.querySelector(".nav-brand")).webkitAppRegion,noDrag:getComputedStyle(t).webkitAppRegion}; })()');
        assert.equal(header.x, 88); assert.equal(header.y, 8); assert.equal(header.w, 32);
        assert.equal(header.brand, 'jumpyBrain'); assert.equal(header.weight, '400');
        assert.equal(header.drag, 'drag'); assert.equal(header.noDrag, 'no-drag');
        await screenshot(`mac-${theme}-${width}-${view}`);
        await click('toggle-sidebar');
        assert.equal(await js('getComputedStyle(document.getElementById("app-sidebar")).display'), 'none');
        assert.equal(await js('document.getElementById("toggle-sidebar").getBoundingClientRect().x'), 88);
        await screenshot(`mac-${theme}-${width}-${view}-collapsed`);
        await click('toggle-sidebar');
      }
    }
  }
  checks.push('real sandboxed Mac window: native traffic-light position, draggable header/no-drag toggle, both themes, Home/note/graph at 1200/480, pointer collapse/expand');
  window.setSize(1200, 860); await navigate('/');
  await fullscreen(true);
  await click('toggle-sidebar'); await screenshot('mac-fullscreen-collapsed');
  await click('toggle-sidebar'); await screenshot('mac-fullscreen-expanded');
  await fullscreen(false);
  window.minimize(); await pause(200); assert.equal(window.isMinimized(), true);
  window.restore(); window.show(); await pause(200); assert.equal(window.isMinimized(), false);
  checks.push('native API full-screen/collapse/restore and minimize/restore; physical traffic-light clicks and dragging remain manual');
  await click('open-search');
  await until('document.getElementById("note-search").open');
  await js('document.getElementById("note-search-input").focus()');
  await window.webContents.insertText('Outside sidebar');
  await until('document.getElementById("search-results").textContent.includes("Outside sidebar")');
  chord('Enter', []);
  await until(`state.editor?.state.documentId === ${JSON.stringify(config.ids[0])} && state.editor.state.loaded`);
  chord('k'); await until('document.getElementById("note-search").open');
  chord('Escape', []); await until('!document.getElementById("note-search").open');
  await click('new-note');
  await until('!creatingNote && !!state.editor?.state.loaded');
  const first = await js('state.editor.state.documentId');
  assert.ok(!config.ids.includes(first));
  chord('Enter');
  await until(`!creatingNote && !!state.editor?.state.loaded && state.editor.state.documentId !== ${JSON.stringify(first)}`);
  checks.push('global pointer search opens a canonical note absent from sidebar via deterministic search transport, Cmd+K and pointer/Cmd+Enter real note creation');
  await js('window.chromeFixtureBlockSave = true; document.getElementById("note-editor").focus()');
  await window.webContents.insertText(' Draft must survive chrome');
  await until('state.editor.state.saveStatus === "failed"');
  const draft = await js('richEditor.getMarkdown()');
  await click('new-note'); await until('!creatingNote');
  assert.equal(await js('richEditor.getMarkdown()'), draft);
  await click('toggle-sidebar'); await click('toggle-sidebar');
  window.close(); await pause(250);
  assert.equal(window.isDestroyed(), false); assert.equal(closePrompts, 1);
  assert.equal(await js('richEditor.getMarkdown()'), draft);
  await js('window.chromeFixtureBlockSave = false; document.getElementById("note-retry").click()');
  await until('state.editor.state.saveStatus === "saved" && !state.editor.state.dirty');
  const closed = new Promise(resolve => window.once('closed', resolve)); window.close(); await closed;
  assert.equal(app.isReady(), true, 'closing the editor leaves the fixture host running');
  const reopened = createEditorWindow(config); window = reopened.window; await reopened.loaded;
  await until('companionRegistered && document.documentElement.dataset.nativeMac === "true"');
  checks.push('failed-save New note and close guards preserve draft; Retry saves, editor close leaves host alive, reopen reestablishes native header');
  if (config.inspect) {
    // Keep a disposable production window available for native UI inspection.
    const complete = path.join(config.screenshots, 'inspection-complete');
    await rm(complete, { force: true });
    const events = [];
    let evidence = Promise.resolve();
    const record = (event, inspected) => {
      events.push({ event, ...(inspected.isDestroyed() ? {} : { bounds: inspected.getBounds(), minimized: inspected.isMinimized(), fullScreen: inspected.isFullScreen() }) });
      const snapshot = JSON.stringify(events);
      evidence = evidence.then(() => writeFile(path.join(config.screenshots, 'inspection-events.json'), snapshot));
    };
    const observe = inspected => {
      record('opened', inspected);
      for (const event of ['move', 'minimize', 'restore', 'enter-full-screen', 'leave-full-screen', 'closed']) inspected.on(event, () => record(event, inspected));
    };
    observe(window);
    setApplicationMenu({ app, getWindow: () => window?.isDestroyed() ? null : window, reconnect: () => {
      if (window && !window.isDestroyed()) { window.restore(); window.show(); return; }
      const editor = createEditorWindow(config); window = editor.window; observe(window);
      void editor.loaded.catch(error => console.error(error.message.split(config.key).join('[redacted]')));
    } });
    await writeFile(path.join(config.screenshots, 'inspection-ready.json'), JSON.stringify({ pid: process.pid, complete }));
    const deadline = Date.now() + 720000;
    while (true) {
      try { await access(complete); break; } catch { /* Released by the inspector after native checks. */ }
      if (Date.now() > deadline) throw new Error('Native inspection was not completed');
      await pause(250);
    }
    checks.push('disposable native window inspection completed; individual physical checks recorded in task evidence');
    await evidence;
    await rm(path.join(config.screenshots, 'inspection-ready.json'), { force: true });
  }
  await writeFile(config.result, JSON.stringify({ ok: true, checks }));
  app.exit(0);
} catch (error) {
  await writeFile(config.result, JSON.stringify({ ok: false, checks, error: error.message.split(config.key).join('[redacted]') }));
  console.error(error.message.split(config.key).join('[redacted]')); app.exit(1);
}
}
void run().catch(error => { console.error(error); app.exit(1); });
