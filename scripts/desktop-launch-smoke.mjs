// Actual packaged executable, LaunchServices and disposable LaunchAgent. No installed app.
import assert from 'node:assert/strict';
import { mkdtemp, realpath, mkdir, readFile, writeFile, rm, lstat, readdir } from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import os from 'node:os';
import { spawn, execFileSync, spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { loadPlaywrightChromium } from './playwright-runtime.mjs';
import { selectEditorText, editorSelection } from './editor-smoke-helpers.mjs';
import { readBackendDescriptor, processAlive } from '../dist/adapters/backend-host/index.js';
const args = process.argv.slice(2);
const baseline = args.includes('--baseline');
const idle = args.includes('--idle');
const editing = args.includes('--editing');
const appIndex = args.indexOf('--app');
assert.equal(process.platform, 'darwin');
assert.ok(appIndex >= 0 && args[appIndex + 1], 'Usage: node scripts/desktop-launch-smoke.mjs --app <matching-built-app> [--baseline] [--idle] [--editing]');
const source = path.resolve(args[appIndex + 1]);
const home = await realpath(await mkdtemp('/tmp/jb-launch-'));
const app = path.join(home, 'jumpyBrain.app'), resources = path.join(app, 'Contents/Resources');
const executable = path.join(app, 'Contents/MacOS/jumpyBrain');
const bundleId = 'local.jumpybrain.launchproof.' + randomUUID().replaceAll('-', '');
const domain = 'gui/' + process.getuid(), service = domain + '/' + bundleId;
const plist = path.join(home, 'login.plist'), root = path.join(home, 'memory'), userData = path.join(home, 'user-data'), support = path.join(home, 'support');
const report = { checkedAt: new Date().toISOString(), baseline, checks: [], ok: false };
let loaded = false, child, port, debugPort, key, pinState, stopRootBackend, browser;
const cleanEnv = { ...process.env }; delete cleanEnv.ELECTRON_RUN_AS_NODE;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
function mainPids() { return execFileSync('/bin/ps', ['-axo', 'pid=,comm='], { encoding: 'utf8' }).split('\n').flatMap(line => { const match=/^\s*(\d+)\s+(.+)$/.exec(line); return match?.[2] === executable ? [Number(match[1])] : []; }); }
async function until(check, label, timeout = 20000) { const end = Date.now() + timeout; while (Date.now() < end) { if (await check()) return; await pause(50); } throw new Error('Timed out: ' + label); }
async function gateway() {
  try { const response = await fetch(`http://127.0.0.1:${port}/companion/state`, { headers: { Authorization: 'Bearer ' + key }, signal: AbortSignal.timeout(600) }); if (!response.ok) { await response.body?.cancel(); return false; } return response.json(); } catch { return false; }
}
function launch(env, background = true) {
  const next = spawn(executable, [...(background ? ['--background'] : []), ...(!baseline || background ? ['--remote-debugging-port=' + debugPort] : [])], { env, stdio: ['ignore', 'ignore', 'pipe'] });
  next.stderr.resume(); return next;
}
async function quit() {
  await browser?.close(); browser = null;
  execFileSync('/usr/bin/osascript', ['-e', `tell application id "${bundleId}" to quit`], { env: cleanEnv, stdio: 'pipe', timeout: 15000 });
  await until(async () => !await gateway(), 'owned gateway shutdown');
  if (child) await until(() => child.exitCode !== null || child.signalCode !== null, 'owned app exit');
  await until(() => mainPids().length === 0, 'all owned app main processes exit');
  await pause(1200);
}
function mark(name, detail) { report.checks.push({ name, ...detail }); console.log(name + ': PASS'); }
try {
  execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', source], { stdio: 'pipe' });
  execFileSync('/usr/bin/ditto', [source, app], { stdio: 'pipe' });
  const configFile = path.join(resources, 'native/jumpyBrain Host.app/Contents/Resources/Configuration.json');
  const nativeConfig = JSON.parse(await readFile(configFile, 'utf8'));
  const runtime = path.join(resources, 'runtime');
  const { createServerMemoryRuntime } = await import(pathToFileURL(path.join(runtime, 'dist/server/index.js')));
  ({ stopRootBackend } = await import(pathToFileURL(path.join(runtime, 'dist/app/backend-host/index.js'))));
  await createServerMemoryRuntime({ root }).initializeMemoryRoot();
  await mkdir(userData); await mkdir(support, { mode: 0o700 });
  key = randomBytes(32).toString('hex'); await writeFile(path.join(support, 'api-key'), key, { mode: 0o600 });
  await writeFile(path.join(userData, 'desktop-setup.json'), '{"version":1}');
  const socket = net.createServer(); await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve)); port = socket.address().port; await new Promise(resolve => socket.close(resolve));
  const debugSocket = net.createServer(); await new Promise(resolve => debugSocket.listen(0, '127.0.0.1', resolve)); debugPort = debugSocket.address().port; await new Promise(resolve => debugSocket.close(resolve));
  await writeFile(configFile, JSON.stringify({ ...nativeConfig, memoryRoot: root, supportDirectory: support, port }));
  await writeFile(path.join(resources, 'desktop.json'), JSON.stringify({ schema: 1, homeDirectory: home, userDataDirectory: userData, supportDirectory: support, launchAgent: plist, port }));
  execFileSync('/usr/libexec/PlistBuddy', ['-c', 'Set :CFBundleIdentifier ' + bundleId, path.join(app, 'Contents/Info.plist')]);
  execFileSync('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'pipe' });
  const generation = await lstat(runtime, { bigint: true });
  pinState = path.join(os.homedir(), '.jumpybrain-runtime-pins', `${generation.dev}-${generation.ino}`);
  report.artifact = JSON.parse(await readFile(path.join(runtime, 'dist/adapters/diagnostics/build-info.json')));
  child = launch({ ...cleanEnv, ELECTRON_RUN_AS_NODE: '1' }, false);
  if (baseline) {
    await until(() => child.exitCode !== null, 'inherited Node-mode early exit', 5000);
    assert.equal(child.exitCode, 0); assert.equal(await gateway(), false);
    mark('inherited Node-mode reproduces silent exit zero', { exitCode: 0 });
  } else {
    await until(gateway, 'inherited Node-mode launch'); assert.equal(child.exitCode, null);
    mark('inherited Node-mode cannot bypass app startup'); await quit();
  }
  for (const method of ['direct', 'open']) {
    if (method === 'direct') child = launch(cleanEnv);
    else { child = null; execFileSync('/usr/bin/open', ['-n', app, '--args', '--background', '--remote-debugging-port=' + debugPort], { env: cleanEnv, stdio: 'pipe' }); }
    await until(gateway, method + ' launch without loaded service');
    mark(method + ' launch without loaded service'); await quit();
  }
  await writeFile(plist, `<?xml version="1.0"?><plist version="1.0"><dict><key>Label</key><string>${bundleId}</string><key>ProgramArguments</key><array><string>${executable}</string><string>--background</string><string>--remote-debugging-port=${debugPort}</string></array><key>RunAtLoad</key><true/><key>KeepAlive</key><false/></dict></plist>`);
  execFileSync('/bin/launchctl', ['bootstrap', domain, plist], { env: cleanEnv, stdio: 'pipe' }); loaded = true;
  await until(gateway, 'disposable LaunchAgent launch'); mark('disposable LaunchAgent launch');
  execFileSync('/usr/bin/open', [app], { env: cleanEnv, stdio: 'pipe' });
  browser = await (await loadPlaywrightChromium()).connectOverCDP('http://127.0.0.1:' + debugPort);
  await until(() => browser.contexts()[0].pages().length > 0, 'second-instance opens an editor');
  const page = browser.contexts()[0].pages()[0];
  await page.waitForFunction(() => typeof companionRegistered !== 'undefined' && companionRegistered && !companionFrozen);
  await until(gateway, 'gateway remains available after second-instance open');
  mark('open reaches loaded-service instance and opens editor');
  if (idle || editing) {
    const id = 'mem_97777777-7777-4777-8777-000000000001', file = path.join(root, 'notes/idle.md');
    const prefix = `---\nid: ${id}\ntype: note\ntitle: Disposable idle edit\n---\n`;
    const cases = [...(editing ? ['prior-characters', 'selected-prior-text', 'word-delete', 'selected-word-delete', 'forward-delete', 'formatted-character', 'formatted-word', 'repeated-word', 'line-backward', 'line-forward'] : []), ...(idle ? ['unchanged-idle', 'renderer-suspension', 'empty-block'] : [])];
    for (const scenario of cases) {
      const body = scenario === 'repeated-word' ? 'same same same\n\nTail' : ['formatted-character', 'formatted-word'].includes(scenario) ? 'Alpha **same**\n\n\nBeta same\n\nTail' : 'Alpha same\n\n\nBeta same\n\nTail';
      await writeFile(file, prefix + body);
      await page.evaluate(id => navigation.navigate('/?note=' + id), id);
      await page.waitForFunction(body => state.editor?.collaboration?.state.status === 'saved' && richEditor.getMarkdown() === body, body);
      if (scenario === 'empty-block') {
        await page.locator('#note-editor').evaluate(element => {element.focus();const range=document.createRange();range.selectNodeContents(element.children[2]);range.collapse(true);getSelection().removeAllRanges();getSelection().addRange(range);});
        await page.evaluate(() => new Promise(requestAnimationFrame));
      } else if (['prior-characters', 'word-delete', 'formatted-character', 'formatted-word', 'line-backward'].includes(scenario)) await selectEditorText(page, 10);
      else if (scenario === 'repeated-word') await selectEditorText(page, 9);
      else if (['forward-delete', 'line-forward'].includes(scenario)) await selectEditorText(page, 6);
      else await selectEditorText(page, 6, 10);
      const before = await page.evaluate(() => state.editor.collaboration.snapshot);
      const selection = await editorSelection(page), started = Date.now();
      await page.evaluate(() => {window.deletionInputTypes=[];document.getElementById('note-editor').addEventListener('beforeinput',event=>window.deletionInputTypes.push(event.inputType),true);});
      if (scenario === 'renderer-suspension') {
        const session = await page.context().newCDPSession(page);
        await session.send('Page.setWebLifecycleState', {state:'frozen'}); await pause(65000); await session.send('Page.setWebLifecycleState', {state:'active'}); await session.detach();
      } else if (['unchanged-idle', 'empty-block'].includes(scenario)) await pause(scenario === 'unchanged-idle' ? 35000 : 2100);
      if (['prior-characters','forward-delete'].includes(scenario)) for (let index=0;index<4;index++) await page.keyboard.press(scenario === 'forward-delete' ? 'Delete' : 'Backspace');
      else await page.keyboard.press(['word-delete','selected-word-delete','formatted-word','repeated-word'].includes(scenario) ? 'Alt+Backspace' : scenario === 'line-backward' ? 'Meta+Backspace' : scenario === 'line-forward' ? 'Meta+Delete' : 'Backspace');
      await page.evaluate(() => state.editor.flush());
      const live = await page.evaluate(() => ({state:state.editor.collaboration.state,body:richEditor.getMarkdown(),snapshot:state.editor.collaboration.snapshot,inputTypes:window.deletionInputTypes}));
      assert.notEqual(live.state.status, 'conflict', live.state.message);
      await page.waitForFunction(() => state.editor.collaboration.state.status === 'saved');
      const expected = scenario === 'repeated-word' ? 'same  same\n\nTail' : scenario === 'line-backward' ? '\n\n\nBeta same\n\nTail' : scenario === 'empty-block' ? 'Alpha same\n\nBeta same\n\nTail' : scenario === 'formatted-character' ? 'Alpha **sam**\n\n\nBeta same\n\nTail' : 'Alpha \n\n\nBeta same\n\nTail';
      const accepted = await page.evaluate(() => state.editor.collaboration.snapshot);
      assert.equal(accepted.body, expected);
      assert.equal(await readFile(file,'utf8'), accepted.prefix + expected, 'body and acknowledged attribution metadata match canonical bytes');
      await page.reload(); await page.waitForFunction(expected => state.editor?.collaboration?.state.status === 'saved' && richEditor.getMarkdown() === expected, expected);
      mark('packaged editing: ' + scenario, {idleMs:Date.now()-started,epoch:before.epoch,revision:before.revision,selection,beforeInputTypes:live.inputTypes});
    }
  }
  await quit();
  execFileSync('/bin/launchctl', ['bootout', service], { stdio: 'pipe' }); loaded = false;
  execFileSync('/usr/bin/open', ['-n', app, '--args', '--background'], { env: cleanEnv, stdio: 'pipe' });
  await until(gateway, 'open after service unload'); mark('open after service unload'); await quit();
  execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', app], { stdio: 'pipe' }); mark('signature preserved through launch and quit matrix');
  report.ok = true;
} catch (error) {
  report.error = error.message; report.mainPids = mainPids();
  const diagnostic = path.join(userData, 'diagnostics');
  for (const name of await readdir(diagnostic, { recursive: true }).catch(() => [])) {
    if (!name.endsWith('.jsonl')) continue;
    const text = await readFile(path.join(diagnostic, name), 'utf8');
    report.events ??= []; for (const line of text.trim().split('\n')) { try { const event=JSON.parse(line); report.events.push({operation:event.operation,code:event.code,outcome:event.outcome}); } catch {} }
  }
  throw error;
}
finally {
  if (loaded) spawnSync('/bin/launchctl', ['bootout', service], { stdio: 'ignore' });
  await browser?.close().catch(() => {}); browser = null;
  if (await gateway()) { try { await quit(); } catch {} }
  if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  for (const pid of mainPids()) { try { process.kill(pid, 'SIGTERM'); } catch {} }
  let drained = false;
  try {
    if (stopRootBackend) {
      await stopRootBackend(root);
      const descriptor = await readBackendDescriptor(root);
      if (descriptor) await until(() => !processAlive(descriptor.pid), 'fixture backend exits after drain', 5000);
    }
    await until(() => mainPids().length === 0, 'fixture main process cleanup', 5000);
    await until(async () => !await gateway(), 'fixture gateway cleanup', 5000);
    await pause(1300); drained = true;
  } catch { report.ok = false; report.cleanupError = 'Owned process drain unverified; fixture retained.'; report.fixture = home; process.exitCode = 1; }
  const output = path.resolve('.local-pack/desktop-launch-' + (baseline ? 'baseline' : 'current')); await mkdir(output, { recursive: true });
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  // Only this fixture's generation; its owned backend was explicitly drained.
  if (drained) {
    if (pinState) await rm(pinState, { recursive: true, force: true });
    await rm(home, { recursive: true, force: true });
  }
}
