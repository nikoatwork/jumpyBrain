// Fixture only, excluded from the desktop package. Never imported by production.
import { app } from 'electron';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createEditorWindow } from '../../integrations/electron/window.mjs';
import { startElectronDiagnostics } from '../../integrations/electron/diagnostics.mjs';
const config = JSON.parse(await readFile(process.env.JUMPYBRAIN_DIAGNOSTICS_FIXTURE, 'utf8'));
app.setPath('userData', config.userData);
let window, stage = 'startup';
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const js = (script) => window.webContents.executeJavaScript(script, true);
async function until(script) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) { if (await js(script)) return; await pause(25); }
  throw new Error('condition timed out');
}
async function run() {
  try {
    await app.whenReady();
    const prior = await startElectronDiagnostics(config, { directory: config.userData });
    prior.record({ operation: 'startup', severity: 'error', outcome: 'failed', code: 'bootstrap_failed', message: config.key });
    await prior.store.flush();
    const diagnostics = await startElectronDiagnostics(config, { directory: config.userData }); diagnostics.connect(config);
    assert.ok((await diagnostics.store.snapshot()).events.some((event) => event.session === prior.store.session && event.code === 'bootstrap_failed'));
    const editor = createEditorWindow(config, { diagnostics }); window = editor.window; await editor.loaded;
    await until('typeof companionRegistered !== "undefined" && companionRegistered && !companionFrozen');
    stage = 'renderer crash';
    const crash = new Promise((resolve) => window.webContents.once('render-process-gone', resolve));
    window.webContents.forcefullyCrashRenderer(); await crash;
    window.webContents.reload();
    await until('typeof companionRegistered !== "undefined" && companionRegistered && !companionFrozen');
    window.webContents.emit('unresponsive');
    await diagnostics.checkRenderer(window.webContents); await diagnostics.flush();
    stage = 'feedback collection';
    await js(`window.dispatchEvent(new ErrorEvent('error', { error: new TypeError('private body ${config.key}'), filename: location.origin + '/?note=private', lineno: 10, colno: 20 })); window.dispatchEvent(new PromiseRejectionEvent('unhandledrejection', { promise: Promise.resolve(), reason: new RangeError('private body') }));`);
    await js('document.getElementById("open-feedback").click()');
    await until('document.getElementById("feedback-dialog").dataset.collecting === "false"');
    async function send(message) {
      await js(`document.getElementById("feedback-message").value = ${JSON.stringify(message)}; document.getElementById("feedback-message").dispatchEvent(new Event("input")); document.getElementById("feedback-send").click()`);
      await until('document.getElementById("feedback-status").textContent.includes("Feedback sent")');
      return JSON.parse(await readFile(config.received, 'utf8'));
    }
    const first = await send('Synthetic diagnostics test');
    const report = JSON.parse(first.diagnostics);
    for (const code of ['bootstrap_failed', 'unresponsive']) assert.ok(report.events.some((e) => e.component === 'electron' && e.code === code));
    assert.ok(report.events.some((e) => e.component === 'electron' && ['crashed', 'killed', 'abnormal-exit'].includes(e.code)));
    assert.ok(report.events.some((e) => e.component === 'browser' && e.code === 'type_error' && e.operation === 'exception' && e.line === 10));
    assert.ok(report.events.some((e) => e.operation === 'rejection' && e.code === 'range_error'));
    assert.doesNotMatch(JSON.stringify(report), /private|d_[a-f0-9]{32}/); assert.ok(!JSON.stringify(report).includes(config.key));
    const frozen = first.diagnostics;
    await js('feedbackDiagnostics.event("exception", {severity:"error",outcome:"failed",code:"syntax_error"})');
    stage = 'frozen attachment submission';
    const second = await send('🐐'.repeat(2000));
    assert.equal(second.diagnostics, frozen);
    assert.ok(Buffer.byteLength(JSON.stringify(second)) <= 65536);
    stage = 'collection opt-out and cancellation';
    await js('document.getElementById("feedback-close").click(); document.getElementById("open-feedback").click(); document.getElementById("feedback-include-logs").click()');
    const without = await send('No diagnostics');
    assert.equal(without.diagnostics, null);
    await js('document.getElementById("feedback-include-logs").click(); document.getElementById("feedback-close").click()');
    await pause(250);
    assert.equal(await js('document.getElementById("feedback-dialog").open'), false);
    assert.deepEqual(JSON.parse(await readFile(config.received, 'utf8')), without);
    await diagnostics.store.flush();
    window.destroy();
    await writeFile(config.result, JSON.stringify({ ok: true, stage: 'complete' })); app.exit(0);
  } catch (error) {
    await writeFile(config.result, JSON.stringify({ ok: false, stage, error: String(error.message).replaceAll(config.key, '[fixture-key]') })); app.exit(1);
  }
}
void run();
