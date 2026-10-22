// Test-only input/history/retention checks; excluded from distribution.
import { app, BrowserWindow } from 'electron';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createEditorWindow } from './window.mjs';
const config = JSON.parse(await readFile(process.env.JUMPYBRAIN_BACK_FIXTURE, 'utf8'));
app.setPath('userData', config.userData);
app.on('window-all-closed', () => {});
const pause = ms => new Promise(r => setTimeout(r, ms));
let window;
async function js(source) {
  try { return await window.webContents.executeJavaScript(source, true); }
  catch (error) { throw new Error('Renderer script failed: ' + source, { cause: error }); }
}
async function until(source) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    try { if (await js(source)) return; } catch { /* A real brain switch replaces the execution context. */ }
    await pause(30);
  }
  throw new Error('Timed out: ' + source);
}
async function navigate(url) {
  assert.equal(await js(`navigation.navigate(${JSON.stringify(url)})`), true);
  await until('!navigation.isBusy() && (state.view !== "note" || !!state.editor?.state.loaded) && (state.view !== "graph" || !!state.graph)');
}
const note = index => '/?note=' + config.ids[index];
async function telemetry() {
  const contents = window.webContents;
  if (!contents.debugger.isAttached()) contents.debugger.attach('1.3');
  const sample = { time: Date.now(), history: contents.navigationHistory.length(), active: contents.navigationHistory.getActiveIndex(),
    dom: await contents.debugger.sendCommand('Memory.getDOMCounters'),
    heap: await contents.debugger.sendCommand('Runtime.getHeapUsage'),
    processes: app.getAppMetrics().map(p => ({ type: p.type, workingSetKiB: p.memory.workingSetSize })),
    windows: BrowserWindow.getAllWindows().length,
    page: await js('({editor:!!state.editor,graphDom:document.querySelectorAll("[data-testid=graph-node]").length,layoutTimer:!!state.layoutTimer})'),
  };
  // Diagnostic reachability only: raw heap/process samples above remain unforced.
  // No GC hook is added to production, and both comparison hosts use this probe.
  await contents.debugger.sendCommand('HeapProfiler.collectGarbage');
  sample.retainedDom = await contents.debugger.sendCommand('Memory.getDOMCounters');
  return sample;
}
async function cycle() { for (const url of [note(0), '/graph', note(1), '/']) await navigate(url); }
async function mouseBack() {
  // CDP sends real Chromium input including the back button, which Electron's
  // sendInputEvent API cannot name. It also exercises prevention of default Back.
  const debuggerApi = window.webContents.debugger;
  if (!debuggerApi.isAttached()) debuggerApi.attach('1.3');
  for (const type of ['mousePressed', 'mouseReleased']) await debuggerApi.sendCommand('Input.dispatchMouseEvent', {
    type, x: 400, y: 300, button: 'back', buttons: type === 'mousePressed' ? 8 : 0, clickCount: 1,
  });
}
async function settleView(view) { await until(`state.view === ${JSON.stringify(view)} && !navigation.isBusy()`); await pause(120); }
async function run() {
  try {
    await app.whenReady();
    const createWindow = config.windowModule ? (await import(config.windowModule)).createEditorWindow : createEditorWindow;
    const editor = createWindow(config, { confirmClose: () => false });
    window = editor.window; await editor.loaded;
    await until('typeof companionRegistered !== "undefined" && companionRegistered && !companionFrozen');
    const checks = [];
    // Warm every view, then compare identical workload stages across baseline/changed hosts.
    for (let i = 0; i < 3; i++) await cycle();
    await pause(1000);
    const warm = await telemetry();
    for (let i = 0; i < 30; i++) await cycle();
    await pause(3000);
    const repeated = await telemetry();
    assert.equal(repeated.windows, 1);
    assert.equal(repeated.page.editor, false);
    assert.equal(repeated.page.graphDom, 0);
    assert.equal(repeated.page.layoutTimer, false);
    if (!config.baseline) {
      assert.equal(repeated.history, 6);
      assert.equal(repeated.active, 5);
      assert.ok(repeated.retainedDom.jsEventListeners <= warm.retainedDom.jsEventListeners + 5, 'reachable listeners must not accumulate per destination');
      checks.push('120 repeated destinations: six native entries, one window, no hidden graph DOM/timer or accumulating listeners');
      // Same scoped destination, rejected navigation and failed saves cannot consume history.
      const entries = window.webContents.navigationHistory.length();
      assert.equal(await js('navigation.navigate("/")'), false);
      assert.equal(window.webContents.navigationHistory.length(), entries);
      // Back through all five retained destinations, then no-op at the oldest.
      for (let i = 0; i < 5; i++) {
        const index = await js('history.state.jumpyBrainIndex');
        await mouseBack();
        await until(`!navigation.isBusy() && history.state.jumpyBrainIndex === ${index - 1}`);
        await pause(80);
        assert.equal(await js('history.state.jumpyBrainIndex'), index - 1, 'one transition per full mouse sequence');
      }
      assert.equal(window.webContents.navigationHistory.getActiveIndex(), 0);
      const oldest = await js('location.href');
      await mouseBack(); await pause(150);
      assert.equal(await js('location.href'), oldest);
      // Branch from the oldest entry, preserving only actual destinations.
      await navigate(note(0)); await navigate('/graph');
      assert.equal(window.webContents.navigationHistory.length(), 3);
      window.emit('swipe', {}, 'right'); await settleView('note');
      await until('!!state.editor?.state.loaded');
      assert.equal(await js('new URL(location.href).searchParams.get("note")'), config.ids[0]);
      await navigate('/graph');
      window.webContents.sendInputEvent({ type: 'keyDown', keyCode: '[', modifiers: ['meta'] });
      window.webContents.sendInputEvent({ type: 'keyUp', keyCode: '[', modifiers: ['meta'] });
      await settleView('note'); await until('!!state.editor?.state.loaded');
      assert.equal(await js('new URL(location.href).searchParams.get("note")'), config.ids[0]);
      checks.push('mouse down/up/default suppression, five-step boundary, branching, native right-swipe event, driver-mapped Cmd+[');
      // Save failure must retain the source and both history entries, then Retry permits Back.
      await js('window.fixtureFetch = window.fetch; window.fixtureBlockSave = true; window.fetch = (url, options) => options?.method === "PUT" && window.fixtureBlockSave ? Promise.resolve(new Response(JSON.stringify({error:{message:"Fixture save failure"}}), {status:500,headers:{"Content-Type":"application/json"}})) : window.fixtureFetch(url, options); true');
      await js('document.getElementById("note-editor").focus()');
      window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'End', modifiers: ['meta'] });
      window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'End', modifiers: ['meta'] });
      await window.webContents.insertText(' Back draft');
      await until('!document.getElementById("note-retry").hidden');
      const source = await js('location.href');
      await mouseBack(); await pause(250);
      assert.equal(await js('location.href'), source);
      assert.match(await js('document.getElementById("note-editor").textContent'), /Back draft/);
      assert.equal(await js('navigation.isBusy()'), false);
      await js('window.fixtureBlockSave = false; document.getElementById("note-retry").click()');
      await until('document.getElementById("note-save-state").textContent === "Saved"');
      await mouseBack();
      await until('!navigation.isBusy() && location.href !== ' + JSON.stringify(source));
      checks.push('failed-save Back restores draft/URL, explicit Retry saves canonical Markdown and permits Back');
      // A deleted target remains a normal load failure; Back still escapes it.
      await navigate(note(2)); await navigate('/settings');
      await js(`(async () => { const note = await readGraphDocument('${config.ids[2]}'); return graphJson('/memories/all/documents/${config.ids[2]}', {method:'DELETE',headers:{'Content-Type':'application/json','If-Match':note.contentHash},body:JSON.stringify({apply:true})}); })()`);
      await mouseBack(); await until('!document.getElementById("note-load-retry").hidden');
      await mouseBack(); await until('!navigation.isBusy() && new URL(location.href).searchParams.get("note") !== ' + JSON.stringify(config.ids[2]));
      checks.push('deleted destination load error remains escapable');
      // A real companion generation change reloads and clears the previous brain's entries.
      await navigate('/settings');
      await js(`void companionControl("switch", { id: ${JSON.stringify(config.otherId)} })`);
      await until(`typeof companionRegistered !== "undefined" && companionRegistered && !companionFrozen && companionState.activeId === ${JSON.stringify(config.otherId)}`);
      assert.equal(window.webContents.navigationHistory.length(), 1);
      const switched = await js('location.href');
      await mouseBack(); await pause(150);
      assert.equal(await js('location.href'), switched);
      checks.push('real brain switch/generation reload clears prior history and blocks cross-brain Back');
    }
    const closed = new Promise(r => window.once('closed', r)); window.close(); await closed;
    await writeFile(config.result, JSON.stringify({ ok: true, baseline: config.baseline, electron: process.versions.electron,
      checks, warm, repeated }));
    app.exit(0);
  } catch (error) {
    const state = window && !window.isDestroyed() ? await js('JSON.stringify({view:state.view,busy:navigation.isBusy(),message:document.getElementById("note-message")?.textContent,load:document.getElementById("note-load-error")?.textContent})').catch(() => '') : '';
    console.error(error.stack + '\n' + state);
    app.exit(1);
  }
}
void run();
