// Production updater + sandboxed native bridges, controlled discovery/worker events.
// Real replacement/rollback is checked separately by scripts/desktop-update-smoke.mjs.
import { app } from 'electron';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, rm, realpath } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createDesktopUpdater } from './updater.mjs';
import { discoverRelease } from './update-release.mjs';
import { createEditorWindow } from './window.mjs';
import { createUpdateWindow } from './update-window.mjs';
import { graphPageHtml } from '../../dist/adapters/http-server/graph-page.js';

async function run() {
const baseline = process.argv.includes('--reproduce-baseline');
const home = await realpath(await mkdtemp(path.join(os.tmpdir(), 'jb-readiness-ui-')));
app.setPath('userData', path.join(home, 'profile'));
app.on('window-all-closed', () => {});
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const until = async check => {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) { if (await check()) return; await pause(40); }
  throw new Error('Readiness UI condition timed out: ' + check.toString());
};
const json = (file, value) => writeFile(file, JSON.stringify(value));
const resources = path.join(home, 'Applications/jumpyBrain.app/Contents/Resources');
const old = path.join(home, 'Library/Application Support/jumpyBrain Updates/update-old');
let editor, recovery, worker, workers = 0, checks = 0, restarting = 0, response = 'offline', pendingResponse;
const server = http.createServer((req, res) => {
  if (req.url === '/release-feed') {
    void (async () => {
      if (response === 'wait') await new Promise(resolve => { pendingResponse = resolve; });
      if (response === 'offline') { req.socket.destroy(); return; }
      res.writeHead(response === 'limited' ? 429 : 200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(response === 'unavailable' ? [] : publication(response)));
    })();
    return;
  }
  res.setHeader('Content-Type', 'text/html');
  res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'nonce-fixture'; style-src 'nonce-fixture'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-src 'none'");
  res.end(graphPageHtml('fixture'));
});
const publication = version => [{ tag_name: 'v' + version, published_at: '2026-11-04', id: 1, assets: [{
  id: 2, name: `jumpybrain-${version}.tgz`, state: 'uploaded', size: 4, digest: 'sha256:' + 'a'.repeat(64),
  browser_download_url: `https://github.com/nikoatwork/jumpyBrain/releases/download/v${version}/jumpybrain-${version}.tgz`,
}] }];
// This child implements only the preparation/handoff protocol. It never installs.
const controlledWorker = `
  const fs = require('node:fs/promises'), path = require('node:path');
  const dir = process.argv[1];
  const save = async (name, value) => { const f = path.join(dir, name); await fs.writeFile(f + '.tmp', JSON.stringify(value)); await fs.rename(f + '.tmp', f); };
  (async () => {
    await save('state.json', { phase: 'preparing', pid: process.pid, updatedAt: Date.now(), detail: 'Controlled preparation' });
    setInterval(async () => {
      const event = await fs.readFile(path.join(dir, 'event'), 'utf8').catch(() => '');
      if (event) { await fs.rm(path.join(dir, 'event')); await save('state.json', { phase: event, pid: process.pid, updatedAt: Date.now(), detail: 'Controlled ' + event }); }
      if (await fs.readFile(path.join(dir, 'proceed'), 'utf8').catch(() => '') === 'install') await save('ack.json', { pid: process.pid, expires: Date.now() + 45000 });
    }, 100);
  })().catch(e => { console.error(e); process.exit(1); });
`;
try {
  await mkdir(path.join(resources, 'runtime'), { recursive: true });
  await mkdir(path.join(home, 'profile'), { recursive: true });
  await json(path.join(resources, 'runtime/package.json'), { version: '0.3.20' });
  await mkdir(path.join(resources, 'native/jumpyBrain Host.app/Contents/Resources'), { recursive: true });
  // Electron is not the worker's Node runtime; use the explicit fixture runner Node.
  const node = process.env.JUMPYBRAIN_SMOKE_NODE;
  assert.ok(node && path.isAbsolute(node), 'set JUMPYBRAIN_SMOKE_NODE to the Node executable');
  const configFile = path.join(resources, 'native/jumpyBrain Host.app/Contents/Resources/Configuration.json');
  await json(configFile, { node, qmd: '/external/fictional-qmd', memoryRoot: path.join(home, 'memory'), supportDirectory: path.join(home, 'support') });
  await mkdir(path.dirname(old), { recursive: true, mode: 0o700 });
  await mkdir(old);
  await json(path.join(old, 'state.json'), { phase: 'success', pid: 2147483647, updatedAt: Date.now() - 1000, detail: 'Previous update complete.' });
  await json(path.join(old, 'transaction.json'), { phase: 'success' });
  const previous = await discoverRelease({ fetcher: async () => new Response(JSON.stringify(publication('0.3.20'))) });
  await json(path.join(old, 'request.json'), { release: previous });
  const updater = createDesktopUpdater({ home, resources, onRestart: () => { restarting++; },
    discover: () => discoverRelease({ fetcher: async (url, options) => {
      checks++; assert.ok(url.startsWith('https://api.github.com/repos/nikoatwork/jumpyBrain/releases?'));
      return fetch(`http://127.0.0.1:${server.address().port}/release-feed`, options);
    } }),
    spawnWorker: (executable, args, options) => {
      workers++; worker = spawn(executable, ['-e', controlledWorker, args[1]], options); return worker;
    },
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  await app.whenReady();
  const created = createEditorWindow({ origin: `http://127.0.0.1:${server.address().port}`, key: 'fictional' }, { updater });
  editor = created.window; editor.webContents.setBackgroundThrottling(false); await created.loaded;
  const evaluate = expression => editor.webContents.executeJavaScript(expression);
  const label = () => evaluate('document.getElementById("desktop-updates")?.getAttribute("aria-label")');
  const click = () => evaluate('document.getElementById("desktop-updates").click()');
  await until(async () => await label() === 'Up to date; check for updates');
  await click(); await until(async () => (await updater.snapshot()).phase === 'failed');
  if (baseline) {
    await until(async () => (await label()).startsWith('Update app only;'));
    await click();
    await until(async () => (await updater.snapshot()).detail === 'Check for a newer published release first.');
    assert.equal(workers, 0);
    console.log('Baseline reproduced in production sidebar/bridge: completed same-version transaction + failed check offers app-only preparation; click returns "Check for a newer published release first." Historical cause unproven.');
  } else {
    const assertCheckOnly = async () => {
      const state = await updater.snapshot(); assert.equal(state.canPrepare, false); assert.deepEqual(state.actions, ['check', 'log']);
      await until(async () => (await label()).startsWith('Retry update'));
    };
    await assertCheckOnly();
    recovery = createUpdateWindow(updater);
    await new Promise(resolve => recovery.webContents.once('did-finish-load', resolve));
    const recoveryEval = expression => recovery.webContents.executeJavaScript(expression);
    for (const result of ['limited', 'unavailable', 'offline']) {
      response = result; const before = checks;
      await recoveryEval('document.getElementById("check").click()');
      await until(async () => checks > before && (await updater.snapshot()).phase === 'failed');
      await assertCheckOnly();
      await until(async () => await recoveryEval('!document.getElementById("check").hidden && document.getElementById("app-only").hidden && document.getElementById("prepare").hidden'));
    }
    response = '0.3.20'; await recoveryEval('act("check")');
    assert.equal((await updater.snapshot()).phase, 'current'); assert.equal(workers, 0);
    await until(async () => await recoveryEval('!pending && !document.getElementById("check").disabled'));
    response = 'wait'; await recoveryEval('document.getElementById("check").click()');
    await until(() => pendingResponse);
    const count = checks;
    const concurrent = [updater.action('check'), updater.checkInBackground()];
    response = '0.3.21'; pendingResponse(); await Promise.all(concurrent);
    assert.equal(checks, count, 'concurrent checks share discovery');
    await until(async () => (await updater.snapshot()).phase === 'available');
    await until(async () => await recoveryEval('!pending && !document.getElementById("app-only").hidden'));
    await recoveryEval('document.getElementById("app-only").click(); document.getElementById("app-only").click()');
    await until(async () => (await updater.snapshot()).phase === 'preparing');
    assert.equal(workers, 1);
    let directory = path.dirname(updater.logPath());
    await writeFile(path.join(directory, 'event'), 'failed');
    await until(async () => (await updater.snapshot()).phase === 'failed');
    worker.kill(); await new Promise(resolve => worker.once('exit', resolve)); worker = null;
    await until(async () => (await label()).startsWith('Update app only;'));
    // Retry through the sidebar's real fixed-navigation bridge, using the pinned offer.
    await click(); await until(async () => (await updater.snapshot()).phase === 'preparing');
    assert.equal(workers, 2); assert.equal(checks, count);
    directory = path.dirname(updater.logPath());
    await writeFile(path.join(directory, 'event'), 'ready');
    await until(async () => (await updater.snapshot()).phase === 'ready');
    const restored = createDesktopUpdater({ home, resources, discover: () => assert.fail('ready state must not rediscover') });
    assert.equal((await restored.checkOnStartup()).phase, 'ready');
    assert.equal((await restored.snapshot()).available, '0.3.21');
    await until(async () => await label() === 'Relaunch to apply update');
    await click(); await until(() => restarting === 1);
    await updater.beforeStop();
    assert.equal(await readFile(path.join(directory, 'proceed'), 'utf8'), 'install');
    await updater.cancelRestart();
    assert.equal(await readFile(path.join(directory, 'cancel'), 'utf8'), 'cancel');
    assert.equal(await evaluate('typeof require'), 'undefined');
    assert.equal(await evaluate('typeof window.jumpyBrainUpdate'), 'undefined');
    await assert.rejects(recoveryEval('window.jumpyBrainUpdate.action("shell")'), /Unsupported/);
    console.log('Readiness production UI/bridge smoke passed: persisted terminal failure, rate limit/no release/offline/current, retry, shared check, preparation failure/retry, restored live readiness, restart acknowledgement/cancel. Worker protocol controlled; no installation performed by this smoke.');
  }
} finally {
  if (worker) { const exit = new Promise(resolve => worker.once('exit', resolve)); worker.kill(); await exit; }
  editor?.destroy(); recovery?.destroy();
  await new Promise(resolve => server.close(resolve));
  await rm(home, { recursive: true, force: true });
}
app.exit(0);
}
void run().catch(error => { console.error(error); app.exit(1); });
