// Disposable production Electron window; started only by scripts/extensions-desktop-smoke.mjs.
import { app, BrowserWindow } from 'electron';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createEditorWindow } from './window.mjs';

async function run() {
const config = JSON.parse(await readFile(process.env.JUMPYBRAIN_EXTENSIONS_FIXTURE, 'utf8'));
app.setPath('userData', config.userData);
app.on('window-all-closed', () => {});
const windows = [];
const errors = [];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let window;
const js = source => window.webContents.executeJavaScript(source, true);
async function wait(source) {
  const until = Date.now() + 12000;
  while (Date.now() < until) { try { if (await js(source)) return; } catch { /* Brain switching replaces a context. */ } await pause(30); }
  throw new Error('Desktop extension timeout: ' + source);
}
async function manage(action, id) {
  return js(`graphJson('/companion/extensions/manage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(${JSON.stringify({action,id})})})`);
}
async function sample(label) {
  const contents = window.webContents;
  if (!contents.debugger.isAttached()) contents.debugger.attach('1.3');
  const value = { label, time: Date.now(), windows: BrowserWindow.getAllWindows().length,
    processes: app.getAppMetrics().map(p => ({ type: p.type, workingSetKiB: p.memory.workingSetSize })),
    heap: await contents.debugger.sendCommand('Runtime.getHeapUsage'), dom: await contents.debugger.sendCommand('Memory.getDOMCounters') };
  // Test-only reachability diagnosis; raw measurements above are captured first.
  await contents.debugger.sendCommand('HeapProfiler.collectGarbage');
  value.retainedDom = await contents.debugger.sendCommand('Memory.getDOMCounters');
  return value;
}
async function panelCycle() {
  await js(`document.querySelector('[data-extension-slot="note.actions"] button').click()`);
  await wait(`document.querySelector('#extension-panel[open] #extension-panel-content li button')`);
  await js(`document.getElementById('extension-panel-close').click()`);
  await wait(`!document.getElementById('extension-panel').open`);
}
try {
  await app.whenReady();
  console.log('Extension desktop: Electron ready');
  const started = performance.now();
  const editor = createEditorWindow({ origin: config.url, key: config.key }, { confirmClose: () => false });
  window = editor.window; windows.push(window); window.webContents.setBackgroundThrottling(false);
  window.webContents.on('console-message', (_event, details) => { if (details.level === 'error') errors.push(details.message); });
  await editor.loaded;
  console.log('Extension desktop: editor loaded');
  await wait('companionRegistered && !companionFrozen');
  const startupMs = performance.now() - started;
  await js(`navigation.navigate(companionScopeUrl('/?note=${config.ids[0]}'))`);
  await wait(`state.editor?.state.loaded && state.editor.state.documentId==='${config.ids[0]}'`);
  assert.equal(await js('typeof require'), 'undefined');
  assert.equal(await js('typeof process'), 'undefined');
  await pause(1200);
  const baseline = await sample('no-extensions-enabled');
  console.log('Extension desktop: disabled baseline sampled');
  for (const id of config.packageIds) await manage('enable', id);
  await wait(`!!document.querySelector('[data-extension-slot="note.actions"] button')`);
  await panelCycle(); await pause(1200);
  const warm = await sample('examples-enabled-warm');
  console.log('Extension desktop: examples warm');
  for (let i = 0; i < 10; i++) await panelCycle();
  await pause(500);
  const repeated = await sample('after-ten-panel-open-close-cycles');
  console.log('Extension desktop: repeated panels sampled');
  assert.ok(repeated.retainedDom.jsEventListeners <= warm.retainedDom.jsEventListeners + 8, 'panel cycles do not retain one listener set per mount');
  assert.ok(repeated.retainedDom.nodes <= warm.retainedDom.nodes + 15, 'panel cycles release owned DOM');
  assert.equal(await js(`document.getElementById('extension-panel-content').childElementCount`), 0);

  // Actual Chromium input reaches the shared command dispatcher.
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'R', modifiers: ['meta', 'shift'] });
  window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'R', modifiers: ['meta', 'shift'] });
  await wait(`document.getElementById('extension-panel').open`);
  await js(`document.getElementById('extension-panel-close').click()`);
  const other = createEditorWindow({ origin: config.url, key: config.key }, { confirmClose: () => false });
  windows.push(other.window); other.window.webContents.setBackgroundThrottling(false); await other.loaded;
  await wait(`companionRegistered && !companionFrozen`);
  assert.equal(BrowserWindow.getAllWindows().length, 2);
  await pause(300);
  // A native shutdown prepare still asks every actual renderer to save and acknowledge.
  const shutdown = await fetch(config.url + '/companion/shutdown', { method: 'POST', headers: { Authorization: 'Bearer ' + config.key, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'prepare' }) });
  assert.equal(shutdown.status, 200, await shutdown.clone().text());
  const lease = await shutdown.json();
  const cancelled = await fetch(config.url + '/companion/shutdown', { method: 'POST', headers: { Authorization: 'Bearer ' + config.key, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'cancel', id: lease.id }) });
  assert.equal(cancelled.status, 200); await wait('!companionFrozen');
  other.window.destroy();
  for (const id of config.packageIds) await manage('disable', id);
  await wait(`!document.querySelector('[data-extension-slot="note.actions"] button')`);
  await pause(500);
  const disabled = await sample('disabled-after-use');
  const result = { ok: true, startupMs, baseline, warm, repeated, disabled, errors,
    checks: ['production sandboxed Electron window', 'real Node extension and nonce UI asset', 'real lexical search', 'ten panel cycles release reachable DOM/listeners', 'native keyboard dispatch', 'two actual windows acknowledge shutdown preparation', 'disable removes contributions'],
    limits: 'Short disposable editor/gateway diagnostic, not a packaged native-helper/full-app budget or long-run leak proof. Raw heap/process samples precede test-only GC used for reachable DOM checks.' };
  await writeFile(config.result, JSON.stringify(result, null, 2) + '\n');
  for (const w of windows) if (!w.isDestroyed()) w.destroy();
  app.exit(0);
} catch (error) {
  await writeFile(config.result, JSON.stringify({ ok: false, error: error.stack, errors }, null, 2)).catch(() => {});
  console.error(error);
  for (const w of windows) if (!w.isDestroyed()) w.destroy();
  app.exit(1);
}
}
void run().catch(error => { console.error(error); app.exit(1); });
