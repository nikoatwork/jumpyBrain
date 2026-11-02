// Disposable packaged application proof, using its native helper and real CLI.
import { app, BrowserWindow, dialog } from 'electron';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
const fixture = JSON.parse(await readFile(process.env.JUMPYBRAIN_BACKEND_RESTART_FIXTURE, 'utf8'));
const { startDesktopApplication } = await import(pathToFileURL(fixture.application));
const evidence = { ok: false, artifact: fixture.artifact, versions: { electron: process.versions.electron }, checks: [], restarts: [], limits: ['Disposable macOS ARM64 packaged resources and ad-hoc signed helper. No installed app, launch service, physical sleep, Intel or published updater claim.'] };
let window, stage = 'startup', completed = false, failure;
const application = startDesktopApplication({ resourceDirectory: fixture.resources, userData: fixture.userData, background: true, updaterOptions: { home: fixture.home, appVersion: fixture.installedVersion, discover: async () => null, spawnWorker: () => assert.fail('No updater in this proof') } });
dialog.showMessageBox = async () => ({ response: 0 });
const js = source => window.webContents.executeJavaScript(source, true);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, timeout = 20000) { const end = Date.now() + timeout; while (Date.now() < end) { if (application.getStartupError()) throw application.getStartupError(); if (await check()) return; await pause(30); } throw new Error('Restart proof timeout at ' + stage); }
const cli = (args, input = '') => new Promise((resolve, reject) => {
  const env = { ...process.env, JUMPYBRAIN_QMD_EMBED: '0' }; delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(fixture.node, [fixture.cli, ...args, '--root', fixture.root, '--json'], { env, stdio: ['pipe','pipe','pipe'] });
  let output = ''; child.stdout.on('data', data => { output += data; }); child.stderr.resume();
  const timer = setTimeout(() => child.kill('SIGKILL'), 20000);
  child.once('error', reject); child.once('exit', code => { clearTimeout(timer); if (code === 0) { try { resolve(JSON.parse(output)); } catch (error) { reject(error); } } else reject(new Error('Packaged CLI failed at ' + stage)); }); child.stdin.end(input);
});
const descriptor = async () => JSON.parse(await readFile(fixture.root + '/.jumpybrain/backend/connection.json', 'utf8'));
const canonical = () => readFile(fixture.root + '/notes/restart.md', 'utf8');
const saved = () => until(() => js("state.editor?.collaboration?.state.status === 'saved'"));
const read = route => js(`(async()=>{const response=await fetch(${JSON.stringify('/memories/all/' + route)},{headers:{'X-Companion-Generation':String(companionState.generation),'X-Companion-Tab':companionTabId}});return {status:response.status,packet:await response.json()}})()`);
async function restart(stoppedOwner) {
  const before = stoppedOwner || await descriptor();
  if (!stoppedOwner) assert.equal((await cli(['backend','stop'])).stopped, true);
  await cli(['recall','--query','canonical anchor','--limit','1']);
  const after = await descriptor(); assert.notEqual(after.instanceId, before.instanceId); assert.notEqual(after.url, before.url);
  evidence.restarts.push({ oldInstance: before.instanceId, newInstance: after.instanceId, oldPort: new URL(before.url).port, newPort: new URL(after.url).port });
  // Retry the existing companion session while retaining its editor and brain.
  window.webContents.session.webRequest.onBeforeRequest(null);
  await js('startCompanion()');
  await js('state.editor.collaboration.connect()');
  await until(() => js("['saved','conflict'].includes(state.editor?.collaboration?.state.status)"));
}
async function typeAtStart(text) {
  await js("(()=>{const e=document.getElementById('note-editor');e.focus();const r=document.createRange();r.selectNodeContents(e);r.collapse(true);getSelection().removeAllRanges();getSelection().addRange(r)})()");
  await window.webContents.debugger.sendCommand('Input.insertText', { text });
}
function mark(value) { stage = value; console.log('Restart proof: ' + value); }
app.on('will-quit', () => writeFileSync(fixture.result, JSON.stringify({ ...evidence, ok: completed && !failure, error: failure?.message })));
(async () => {
  try {
    await until(() => application.getHost()?.isAlive()); await application.openEditor(); window = BrowserWindow.getAllWindows()[0];
    await until(() => js('typeof companionRegistered !== "undefined" && companionRegistered && !companionFrozen'));
    await js(`navigation.navigate('/?note=' + ${JSON.stringify(fixture.id)})`); await saved();
    window.show(); window.focus(); window.webContents.focus(); window.webContents.debugger.attach('1.3');
    const scope = await js('({brain:companionState.activeId,generation:companionState.generation})'), original = await canonical();
    mark('clean saved note restart'); await restart(); await saved();
    assert.equal(await canonical(), original);
    assert.deepEqual(await js('({brain:companionState.activeId,generation:companionState.generation})'), scope);
    assert.equal((await read('documents/' + fixture.id)).status, 200);
    evidence.checks.push('saved note and stable browser brain/generation survive CLI stop, replacement and Retry');
    mark('boards and search');
    const board = await cli(['board','create','--name','Restart board']);
    const boards = await read('boards'); assert.equal(boards.status, 200); assert.match(JSON.stringify(boards.packet), /Restart board/);
    const search = await js("(async()=>{const r=await fetch('/memories/all/search',{method:'POST',headers:{'Content-Type':'application/json','X-Companion-Generation':String(companionState.generation),'X-Companion-Tab':companionTabId},body:JSON.stringify({query:'canonical anchor',limit:5})});return {status:r.status,packet:await r.json()}})()");
    assert.equal(search.status, 200); assert.match(JSON.stringify(search.packet), /Restart fixture/);
    evidence.checks.push('canonical boards and indexed search are available through the recovered gateway');
    mark('fresh editing after restart'); await typeAtStart('Saved after restart. '); await saved(); assert.match(await canonical(), /Saved after restart/);
    evidence.checks.push('new native editor input saves against the replacement epoch');
    // Seed an unsent positional draft through the production editor binding
    // while the test-only session interceptor holds new WebSocket handshakes.
    // Canonical servers, authentication and draft storage remain unmodified.
    for (const changed of [false, true]) {
      mark(changed ? 'conflicting private draft' : 'unchanged-base private draft');
      const before = await canonical();
      window.webContents.session.webRequest.onBeforeRequest({ urls: ['ws://127.0.0.1:*/*'] }, (_request, callback) => callback({ cancel: true }));
      const stoppedOwner = await descriptor();
      assert.equal((await cli(['backend','stop'])).stopped, true);
      await until(() => js("state.editor.collaboration.state.status === 'offline'"));
      await js(`(()=>{const before=state.editor.collaboration.body,insert='Private retained draft. ',after=insert+before;richEditor.setMarkdown(after);state.editor.collaboration.input(after,{before,after,operations:[{start:0,deleteCount:0,insert}]});})()`);
      assert.equal(await js('state.editor.flush()'), false, 'an unsent old-epoch draft must not pass the save barrier');
      assert.equal(await canonical(), before);
      if (changed) await writeFile(fixture.root + '/notes/restart.md', before.replace('Restart canonical anchor.', 'External changed anchor.'));
      const expected = await canonical();
      await restart(stoppedOwner);
      await until(() => js("state.editor.collaboration.state.status === 'conflict' && richEditor.getMarkdown().includes('Private retained draft.')"));
      assert.equal(await js('state.editor.flush()'), false, 'an unsent old-epoch draft must not pass the save barrier'); assert.equal(await canonical(), expected);
      assert.ok((await js('state.editor.collaboration.body')).includes('Private retained draft.'));
      assert.equal(await js('state.editor.collaboration.state.durableDraft'), true);
      // Explicit acceptance for this disposable proof only; never auto publish.
      assert.equal(await js('state.editor.collaboration.resolveConflict("saved")'), true); await saved();
      evidence.checks.push(changed ? 'conflicting private draft remains available without overwriting changed Markdown' : 'private draft over unchanged Markdown remains available without automatic publication');
    }
    mark('clean quit'); completed = true; app.quit();
  } catch (error) {
    failure = error; let stateSummary;
    try { stateSummary = await js('({state:state.editor?.collaboration?.state,message:document.getElementById("note-message")?.textContent})'); } catch {}
    await writeFile(fixture.result, JSON.stringify({ ...evidence, ok: false, stage, stateSummary, error: error.stack }));
    await application.getHost()?.stop(); app.exit(1);
  }
})();
