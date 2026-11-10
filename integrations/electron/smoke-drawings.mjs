// Test-only real Electron editor/host entrypoint; excluded from shipped bundles.
import { app, BrowserWindow } from 'electron';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createEditorWindow } from './window.mjs';
async function run() {
  const config = JSON.parse(await readFile(process.env.JUMPYBRAIN_DRAWINGS_FIXTURE, 'utf8'));
  app.setPath('userData', config.userData); app.on('window-all-closed', () => {});
  let window;
  const js = source => window.webContents.executeJavaScript(source, true);
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  async function until(source, label) {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) { if (await js(source)) return; await pause(40); }
    throw new Error('Drawing fixture timed out: ' + label);
  }
  try {
    await app.whenReady();
    const editor = createEditorWindow(config, {});
    window = editor.window; await editor.loaded;
    window.webContents.setBackgroundThrottling(false);
    await until('typeof companionRegistered!=="undefined" && companionRegistered && !companionFrozen', 'companion registration');
    assert.equal(window.webContents.mainFrame.frames.length, 0, 'the app starts without subframes');
    await js('document.getElementById("new-drawing").click(); true');
    await until('window.__jumpyBrainDrawingReady === true', 'drawing editor frame');
    assert.equal(await js('new URL(location.href).searchParams.get("drawing")'), 'Untitled drawing');
    const frames = window.webContents.mainFrame.frames;
    assert.equal(frames.length, 1, 'exactly one subframe exists');
    assert.equal(frames[0].url, config.origin + '/drawing-frame');
    assert.equal(await frames[0].executeJavaScript('typeof require + ":" + typeof process'), 'undefined:undefined', 'the frame has no Node bridge');
    assert.equal(await frames[0].executeJavaScript('fetch("https://example.com").then(() => false, () => true)'), true, 'the frame cannot reach the network');

    // Draw with native mouse input inside the frame.
    await pause(500);
    const box = await js('(()=>{const r=document.getElementById("drawing-frame").getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})()');
    const point = (fx, fy) => ({ x: Math.round(box.x + box.width * fx), y: Math.round(box.y + box.height * fy) });
    const click = point(0.02, 0.98);
    for (const type of ['mouseDown', 'mouseUp']) window.webContents.sendInputEvent({ type, ...click, button: 'left', clickCount: 1 });
    window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'r' });
    window.webContents.sendInputEvent({ type: 'char', keyCode: 'r' });
    window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'r' });
    await pause(150);
    const from = point(0.55, 0.35), to = point(0.7, 0.5);
    window.webContents.sendInputEvent({ type: 'mouseMove', ...from });
    window.webContents.sendInputEvent({ type: 'mouseDown', ...from, button: 'left', clickCount: 1 });
    for (let step = 1; step <= 5; step++) {
      window.webContents.sendInputEvent({ type: 'mouseMove', x: Math.round(from.x + (to.x - from.x) * step / 5), y: Math.round(from.y + (to.y - from.y) * step / 5), button: 'left' });
      await pause(20);
    }
    window.webContents.sendInputEvent({ type: 'mouseUp', ...to, button: 'left', clickCount: 1 });
    await until('document.getElementById("drawing-state").textContent !== "Saved" || true', 'edit registered');
    await pause(400);
    await until('document.getElementById("drawing-state").textContent === "Saved" && !drawingsUI.hasPending()', 'drawing saved');
    if (config.screenshot) await writeFile(config.screenshot, (await window.webContents.capturePage()).toPNG());

    // Every other subframe destination stays blocked.
    await js(`(() => { for (const src of [${JSON.stringify(config.origin)} + "/", ${JSON.stringify(config.origin)} + "/drawing-frame?x=1", "https://example.com/"]) {
      const frame = document.createElement("iframe"); frame.className = "fixture-frame"; frame.src = src; document.body.append(frame); } return true; })()`);
    await pause(800);
    // A cancelled navigation can still report its requested URL; ask each frame what it actually committed.
    const committed = [];
    for (const frame of window.webContents.mainFrame.frames) {
      if (frame.url === config.origin + '/drawing-frame') continue;
      committed.push(await frame.executeJavaScript('location.href + "|" + (document.body ? document.body.childElementCount : 0) + "|" + typeof window.jumpyBrainDrawing').catch(() => 'unavailable'));
    }
    assert.equal(committed.length, 3);
    assert.deepEqual(committed.filter(entry => /^https?:/.test(entry) || /\|object$/.test(entry)), [], 'no other subframe loads content: ' + committed.join(', '));
    assert.equal(BrowserWindow.getAllWindows().length, 1);
    assert.equal(new URL(window.webContents.getURL()).origin, config.origin);

    // Leaving the drawing releases the frame.
    await js('document.querySelectorAll(".fixture-frame").forEach(frame => frame.remove()); navigation.navigate("/"); true');
    await until('!document.getElementById("drawing-frame") && document.body.dataset.view === "home"', 'frame released on leaving');
    await writeFile(config.result, JSON.stringify({ ok: true }));
    console.log('PASS real Electron opens the drawing editor as its only subframe, draws with native input, saves to the local brain and blocks other frames');
  } catch (error) { await writeFile(config.result, JSON.stringify({ ok: false, error: String(error.message).split(config.key).join('[redacted]') })); process.exitCode = 1; }
  finally { window?.destroy(); app.exit(process.exitCode || 0); }
}
run().catch(() => app.exit(1));
