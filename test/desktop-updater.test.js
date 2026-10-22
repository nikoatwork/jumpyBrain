import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, realpath } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { selectRelease, discoverRelease, verifyArtifact, compareVersions, SOURCE } from '../integrations/electron/update-release.mjs';
import { cliPolicy } from '../integrations/electron/update-policy.mjs';
import { createDesktopUpdater, needsUpdate } from '../integrations/electron/updater.mjs';
import { createQuitFlow } from '../integrations/electron/lifecycle.mjs';
import { runWorker } from '../integrations/electron/update-worker.mjs';
import { nativeUpdateAction } from '../integrations/electron/update-inline.mjs';

test('inline native capability accepts only fixed actions without paths, credentials or arguments', () => {
  for (const action of ['check', 'update', 'app-only', 'cancel', 'restart', 'recover', 'log']) assert.equal(nativeUpdateAction('jumpybrain-update://' + action), action);
  for (const url of ['https://update', 'jumpybrain-update://shell', 'jumpybrain-update://update/', 'jumpybrain-update://update/file', 'jumpybrain-update://update?target=x', 'jumpybrain-update://update#x', 'jumpybrain-update://user@update', 'jumpybrain-update://update:123', 'not a URL']) assert.equal(nativeUpdateAction(url), null, url);
});

function release(version, extra = {}) {
  return { tag_name: 'v' + version, id: 1, published_at: '2026-10-22', prerelease: version.startsWith('0.'),
    body: '<script>untrusted release notes</script>', assets: [{ id: 2, name: `jumpybrain-${version}.tgz`, state: 'uploaded', size: 4,
      digest: 'sha256:' + 'a'.repeat(64), browser_download_url: `https://github.com/nikoatwork/jumpyBrain/releases/download/v${version}/jumpybrain-${version}.tgz` }], ...extra };
}
test('release selection includes numeric beta releases and excludes drafts and arbitrary branches', () => {
  assert.equal(selectRelease([release('0.3.9'), release('0.3.10'), release('9.0.0', { draft: true }), release('1.0.0', { tag_name: 'master' })]).version, '0.3.10');
  assert.equal(compareVersions('0.3.10', '0.3.9'), 1);
  assert.throws(() => selectRelease([release('0.3.9'), release('0.3.10', { assets: [] })]), /newest release/);
  for (const change of [{ digest: null }, { size: 1024 ** 3 }, { browser_download_url: 'https://evil.invalid/file' }]) {
    const r = release('0.4.0'); Object.assign(r.assets[0], change); assert.throws(() => selectRelease([r]), /verifiable/);
  }
});
test('current app can align an older managed CLI without downgrading an ahead-of-release app', () => {
  const installed = { app: '0.3.4', runtime: '0.3.4', cli: '0.3.3', cliPolicy: { kind: 'managed' } };
  assert.equal(needsUpdate('0.3.4', installed), true);
  assert.equal(needsUpdate('0.3.4', { ...installed, cli: '0.3.4' }), false);
  assert.equal(needsUpdate('0.3.3', installed), false);
  assert.equal(needsUpdate('0.3.4', { ...installed, cliPolicy: { kind: 'pinned' } }), false);
});
test('bounded unauthenticated discovery handles offline, rate limits, and corrupt artifacts', async () => {
  const urls = [];
  const selected = await discoverRelease({ fetcher: async (url, options) => { urls.push(url); assert.equal(options.headers.Authorization, undefined); return new Response(JSON.stringify([release('0.4.0')])); } });
  assert.equal(selected.version, '0.4.0'); assert.match(urls[0], /releases\?per_page/); assert.ok(!urls[0].includes('/latest'));
  await assert.rejects(discoverRelease({ fetcher: async () => new Response('', { status: 403 }) }), /limited/);
  await assert.rejects(discoverRelease({ fetcher: async () => { throw new Error('offline'); } }), /offline/);
  const bytes = Buffer.from('data'), digest = 'sha256:' + createHash('sha256').update(bytes).digest('hex');
  verifyArtifact(bytes, { size: 4, digest });
  assert.throws(() => verifyArtifact(Buffer.from('evil'), { size: 4, digest }), /verification failed/);
  assert.throws(() => verifyArtifact(bytes, { size: 5, digest }), /verification failed/);
});
async function fixture(t) {
  const home = await realpath(await mkdtemp(path.join(os.tmpdir(), 'jb-updater-test-')));
  t.after(() => rm(home, { recursive: true, force: true }));
  const root = path.join(home, '.jumpybrain'), app = path.join(root, 'app'), bin = path.join(root, 'bin');
  await mkdir(app, { recursive: true }); await mkdir(bin);
  await writeFile(path.join(app, 'package.json'), '{"version":"0.3.3"}');
  const manifest = { installer: 'jumpybrain-installer', version: 1, source: SOURCE, ref: 'master', scope: 'global', integrationMode: 'none',
    installRoot: root, appDir: app, binDir: bin, cliPath: path.join(bin, 'jumpybrain'), memoryRoot: path.join(root, 'memory') };
  const config = `'${path.join(root, 'cli-config.json')}'`;
  await writeFile(manifest.cliPath, `#!/usr/bin/env sh\nif [ -z "\${JUMPYBRAIN_CLI_CONFIG+x}" ]; then\n  export JUMPYBRAIN_CLI_CONFIG=${config}\nfi\nexec node ${JSON.stringify(path.join(app, 'dist/cli.js'))} "$@"\n`);
  const save = () => writeFile(path.join(root, 'install-manifest.json'), JSON.stringify(manifest)); await save();
  return { home, root, app, manifest, save };
}
test('CLI ownership preserves custom, pinned, missing, unmanaged, linked and overlapping installs', async t => {
  const f = await fixture(t);
  assert.equal((await cliPolicy(f.home)).kind, 'managed');
  f.manifest.ref = 'v0.3.3'; await f.save(); assert.equal((await cliPolicy(f.home)).kind, 'pinned');
  f.manifest.ref = 'master'; f.manifest.source = '/dev/checkout'; await f.save(); assert.equal((await cliPolicy(f.home)).kind, 'custom');
  f.manifest.source = SOURCE; f.manifest.memoryRoot = path.join(f.app, 'memory'); await f.save(); assert.equal((await cliPolicy(f.home)).kind, 'unmanaged');
  f.manifest.memoryRoot = path.join(f.root, 'memory'); await f.save();
  await writeFile(f.manifest.cliPath, 'foreign shim'); assert.equal((await cliPolicy(f.home)).kind, 'unmanaged');
  await rm(path.join(f.root, 'install-manifest.json')); assert.equal((await cliPolicy(f.home)).kind, 'missing');
  await symlink('/dev/null', path.join(f.root, 'install-manifest.json')); assert.equal((await cliPolicy(f.home)).kind, 'unmanaged');
});
test('checking is observational and duplicate clicks share one operation', async t => {
  const f = await fixture(t), resources = path.join(f.home, 'Applications/jumpyBrain.app/Contents/Resources');
  await mkdir(path.join(resources, 'runtime'), { recursive: true });
  await writeFile(path.join(resources, 'runtime/package.json'), '{"version":"0.3.3"}');
  const before = await readFile(path.join(f.root, 'install-manifest.json'));
  let checks = 0;
  const updater = createDesktopUpdater({ home: f.home, resources, discover: async () => { checks++; return selectRelease([release('0.3.4')]); } });
  await Promise.all([updater.action('check'), updater.action('check')]);
  const state = await updater.snapshot(); assert.equal(checks, 1); assert.equal(state.phase, 'available'); assert.equal(state.canPrepare, true);
  assert.deepEqual(state.actions, ['check', 'update']);
  assert.deepEqual(await readFile(path.join(f.root, 'install-manifest.json')), before);
  await mkdir(path.join(f.root, '.installer-lock'));
  const locked = await updater.action('prepare'); assert.match(locked.detail, /lock/);
});
test('updater handoff occurs only after all-tab save and lease commit; errors retain host', async () => {
  for (const failure of ['save', 'close', 'handoff', 'cancel-io', null]) {
    const events = [];
    const quit = createQuitFlow({ getHost: () => ({ isAlive: () => true, stop: async () => events.push('stop') }),
      control: async (_c, _r, body) => { events.push(body.action); if (failure === 'save' && body.action === 'prepare') throw new Error('failed draft'); return { id: 'lease' }; },
      closeWindows: async () => { events.push('close'); return failure !== 'close'; }, flush: async () => {},
      beforeStop: async () => { events.push('handoff'); if (failure === 'handoff' || failure === 'cancel-io') throw new Error('worker died'); },
      cancelClose: () => { events.push('resume'); if (failure === 'cancel-io') throw new Error('disk full while canceling'); }, showError: async () => {}, exit: () => events.push('exit') });
    await quit();
    assert.equal(events.includes('stop'), failure === null);
    assert.equal(events.includes('handoff'), failure === null || failure === 'handoff' || failure === 'cancel-io');
    if (!failure) assert.deepEqual(events, ['prepare','close','commit','handoff','stop','exit']);
  }
});
test('Python archive and interrupted exchange recovery tests', { skip: process.platform !== 'darwin' }, async () => {
  const { execFile } = await import('node:child_process'); const { promisify } = await import('node:util');
  const { stderr } = await promisify(execFile)('python3', ['-B', 'integrations/electron/test_update_transaction.py']);
  assert.match(stderr, /OK/);
});

test('background worker failures retain installation and release only their own locks', { skip: process.platform !== 'darwin' }, async t => {
  for (const failure of ['disk', 'prerequisite', 'artifact', 'offline']) {
    const f = await fixture(t), directory = path.join(f.home, 'update'); await mkdir(directory);
    const lock = path.join(f.root, '.installer-lock'); await mkdir(lock);
    await writeFile(path.join(lock, 'desktop.json'), JSON.stringify({ directory, pid: process.pid }));
    await writeFile(path.join(directory, 'request.json'), JSON.stringify({ home: f.home, parentPid: process.pid, node: failure === 'prerequisite' ? '/missing-jumpybrain-node' : process.execPath,
      configuration: { qmd: '/unused/qmd' }, release: selectRelease([release('0.3.4')]) }));
    const before = await readFile(path.join(f.app, 'package.json'));
    await runWorker(directory, { diskSpace: async () => ({ bavail: failure === 'disk' ? 0 : 10 ** 8, bsize: 4096 }),
      download: async () => { if (failure === 'offline') throw new Error('Network unavailable. Retry.'); return Buffer.from('evil'); }, notifyFailure: async () => assert.fail('preparation must not notify/relaunch') });
    const state = JSON.parse(await readFile(path.join(directory, 'state.json')));
    assert.equal(state.phase, 'failed');
    assert.match(state.detail, { disk: /3 GB/, prerequisite: /ENOENT|did not complete/, artifact: /verification failed/, offline: /Network unavailable/ }[failure]);
    assert.deepEqual(await readFile(path.join(f.app, 'package.json')), before);
    await assert.rejects(readFile(path.join(lock, 'desktop.json')), { code: 'ENOENT' });
  }
});

test('interrupted publication blocks ordinary startup and exposes GUI recovery; a worker launch nonce is required', async t => {
  const f = await fixture(t), updates = path.join(f.home, 'Library/Application Support/jumpyBrain Updates'), directory = path.join(updates, 'update-fixture');
  await mkdir(directory, { recursive: true }); await mkdir(path.join(f.root, '.installer-lock'));
  await writeFile(path.join(f.root, '.installer-lock/desktop.json'), JSON.stringify({ directory, pid: process.pid }));
  await writeFile(path.join(directory, 'transaction.json'), '{"phase":"published","exchanges":[]}');
  await writeFile(path.join(directory, 'launch.json'), JSON.stringify({ pid: process.pid, instance: 'expected' }));
  const updater = createDesktopUpdater({ home: f.home, resources: path.join(f.home, 'Applications/jumpyBrain.app/Contents/Resources') });
  assert.equal(await updater.blocksStartup(), true);
  assert.equal(await updater.blocksStartup('foreign'), true);
  assert.equal(await updater.blocksStartup('expected'), false);
  await writeFile(path.join(f.root, '.installer-lock/desktop.json'), JSON.stringify({ directory, pid: 2147483647 }));
  assert.equal(await updater.blocksStartup('expected'), true);
  assert.equal((await updater.snapshot()).canRecover, true);
  await writeFile(path.join(directory, 'transaction.json'), '{"phase":"success","exchanges":[]}');
  assert.equal(await updater.blocksStartup(), false, 'a crash after durable success must not strand the app');
});

test('closed-CLI preparation fences app startup before the worker writes its first status', async t => {
  const f = await fixture(t), directory = path.join(f.home, 'Library/Application Support/jumpyBrain Updates/update-early');
  await mkdir(directory, { recursive: true }); await mkdir(path.join(f.root, '.installer-lock'));
  await writeFile(path.join(f.root, '.installer-lock/desktop.json'), JSON.stringify({ directory, pid: process.pid }));
  await writeFile(path.join(directory, 'request.json'), JSON.stringify({ entrypoint: 'cli' }));
  const updater = createDesktopUpdater({ home: f.home, resources: '/unused' });
  assert.equal(await updater.cliPreparationPending(), true);
  await writeFile(path.join(directory, 'state.json'), JSON.stringify({ phase: 'ready' }));
  assert.equal(await updater.cliPreparationPending(), true);
  await writeFile(path.join(directory, 'state.json'), JSON.stringify({ phase: 'success' }));
  assert.equal(await updater.cliPreparationPending(), false);
});

test('GUI clicks are not lost during status polling and late status cannot overwrite action results', async () => {
  const { runInNewContext } = await import('node:vm');
  const elements = new Map(), requests = [];
  const element = id => { if (!elements.has(id)) elements.set(id, { textContent: '', hidden: false, disabled: false, addEventListener() {} }); return elements.get(id); };
  const context = { document: { getElementById: element, querySelectorAll: () => [] }, setInterval() {}, window: {
    close() {}, jumpyBrainUpdate: { action: name => new Promise(resolve => requests.push({ name, resolve })) },
  } };
  runInNewContext(await readFile(new URL('../integrations/electron/update-renderer.js', import.meta.url), 'utf8'), context);
  assert.equal(requests[0].name, 'status');
  const checking = context.act('check');
  assert.equal(requests[1].name, 'check');
  assert.equal(element('phase').textContent, 'Checking for updates');
  requests[1].resolve({ phase: 'current', detail: 'Current', installed: {} }); await checking;
  requests[0].resolve({ phase: 'idle', detail: 'Stale result', installed: {} });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(element('phase').textContent, 'Up to date'); assert.equal(element('detail').textContent, 'Current');
});

test('one-click update pins one release, prepares once and preserves pinned CLI exceptions', { skip: process.platform !== 'darwin' }, async t => {
  for (const pinned of [false, true]) {
    const f = await fixture(t), resources = path.join(f.home, 'Applications/jumpyBrain.app/Contents/Resources');
    await mkdir(path.join(resources, 'runtime'), { recursive: true });
    await writeFile(path.join(resources, 'runtime/package.json'), '{"version":"0.3.3"}');
    await mkdir(path.join(resources, 'native/jumpyBrain Host.app/Contents/Resources'), { recursive: true });
    await writeFile(path.join(resources, 'native/jumpyBrain Host.app/Contents/Resources/Configuration.json'), JSON.stringify({ node: process.execPath, qmd: '/external/qmd', memoryRoot: path.join(f.home, 'memory'), supportDirectory: path.join(f.home, 'support') }));
    if (pinned) { f.manifest.ref = 'v0.3.3'; await f.save(); }
    let checks = 0, launches = 0;
    const { EventEmitter } = await import('node:events');
    const updater = createDesktopUpdater({ home: f.home, resources, discover: async () => { checks++; return selectRelease([release('0.3.4')]); },
      spawnWorker: () => { launches++; const child = new EventEmitter(); child.pid = process.pid; child.unref = () => {}; process.nextTick(() => child.emit('spawn')); return child; } });
    const offered = await updater.action('check');
    assert.deepEqual(offered.actions, ['check', pinned ? 'app-only' : 'update']);
    const [a, b] = await Promise.all([updater.action('update'), updater.action('update')]);
    assert.equal(checks, 1); assert.equal(launches, pinned ? 0 : 1); assert.equal(a.phase, b.phase);
    assert.equal(a.phase, pinned ? 'available' : 'preparing');
    if (!pinned) {
      const owner = JSON.parse(await readFile(path.join(f.root, '.installer-lock/desktop.json')));
      const request = JSON.parse(await readFile(path.join(owner.directory, 'request.json')));
      assert.equal(request.release.version, '0.3.4'); assert.equal(request.updateCLI, true);
      await updater.action('update'); assert.equal(launches, 1); assert.equal(checks, 1);
      await writeFile(path.join(owner.directory, 'request.json'), JSON.stringify({ ...request, entrypoint: 'cli' }));
      await writeFile(path.join(owner.directory, 'transaction.json'), '{"phase":"published","exchanges":[]}');
      await writeFile(path.join(owner.directory, 'state.json'), JSON.stringify({ phase: 'updating', pid: 2147483647, updatedAt: Date.now() }));
      await writeFile(path.join(f.root, '.installer-lock/desktop.json'), JSON.stringify({ directory: owner.directory, pid: 2147483647 }));
      assert.equal((await updater.action('recover')).phase, 'preparing');
      assert.equal(JSON.parse(await readFile(path.join(owner.directory, 'request.json'))).entrypoint, 'app', 'GUI recovery of a CLI job must wait for app exit');
    } else assert.equal(a.installed.cliPolicy.kind, 'pinned');
  }
});

test('private desktop channel accepts only fixed actions and shares the app operation', async t => {
  const { serveDesktopUpdates, requestDesktopUpdate } = await import('../integrations/electron/update-control.mjs');
  const f = await fixture(t), calls = [];
  assert.equal(await requestDesktopUpdate(f.home, 'status'), null);
  const previousMask = process.umask();
  const close = await serveDesktopUpdates(f.home, { action: async name => { calls.push(name); return { phase: name === 'update' ? 'ready' : 'idle' }; } });
  try {
    assert.equal(process.umask(), previousMask, 'binding restores the caller umask');
    const { lstat } = await import('node:fs/promises');
    assert.equal((await lstat(path.join(f.root, 'u.sock'))).mode & 0o777, 0o600);
    assert.equal((await requestDesktopUpdate(f.home, 'update')).phase, 'ready');
    assert.equal((await requestDesktopUpdate(f.home, 'status')).phase, 'idle');
    assert.deepEqual(calls, ['update', 'status']);
    await assert.rejects(requestDesktopUpdate(f.home, 'shell'), /Unsupported/);
    await assert.rejects(serveDesktopUpdates(f.home, { action() {} }), /Another app/);
  } finally { await close(); }
  await symlink('/dev/null', path.join(f.root, 'u.sock'));
  await assert.rejects(requestDesktopUpdate(f.home, 'status'), /Unsafe/);
});

test('desktop update channel decodes release text split across UTF-8 chunks', async t => {
  const { createServer } = await import('node:net');
  const { chmod } = await import('node:fs/promises');
  const { requestDesktopUpdate } = await import('../integrations/electron/update-control.mjs');
  const f = await fixture(t), socket = path.join(f.root, 'u.sock');
  const detail = 'Ready 🌙 — keep editing';
  const packet = Buffer.from(JSON.stringify({ state: { phase: 'ready', detail } }) + '\n');
  const split = packet.indexOf(Buffer.from('🌙')) + 1;
  const server = createServer(client => client.once('data', () => {
    client.write(packet.subarray(0, split));
    setTimeout(() => client.end(packet.subarray(split)), 10);
  }));
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(socket, resolve); });
  await chmod(socket, 0o600);
  try { assert.equal((await requestDesktopUpdate(f.home, 'status')).detail, detail); }
  finally { await new Promise(resolve => server.close(resolve)); }
});

test('CLI reports prepared rather than installed while app runs; dry-run has no operation', async () => {
  const { runPairedUpdate } = await import('../integrations/electron/update-cli.mjs');
  const lines = [], calls = [];
  const options = { home: '/unused', report: line => lines.push(line), createUpdater: () => assert.fail('open app owns the updater'),
    request: async (_home, action) => { calls.push(action); return { phase: 'ready', detail: 'Ready' }; } };
  await runPairedUpdate(options);
  assert.match(lines.at(-1), /not installed yet/); assert.deepEqual(calls, ['update']);
  calls.length = 0; await runPairedUpdate({ ...options, dryRun: true }); assert.equal(calls.length, 0);
  await assert.rejects(runPairedUpdate({ ...options, request: async () => ({ phase: 'failed', detail: 'Do not downgrade' }) }), /Do not downgrade/);
  await assert.rejects(runPairedUpdate({ ...options, request: async () => ({ phase: 'success', available: '0.3.4', installed: { app: '0.3.3', runtime: '0.3.4', cli: '0.3.4' } }) }), /versions do not agree/);
  await runPairedUpdate({ ...options, request: async () => ({ phase: 'success', available: '0.3.4', installed: { app: '0.3.4', runtime: '0.3.4', cli: '0.3.4' } }) });
  assert.match(lines.at(-1), /installed and startup verified/);
});

test('paired CLI detection leaves CLI-only installs alone and protects pinned/source policy', { skip: process.platform !== 'darwin' }, async t => {
  const { pairedInstallation } = await import('../integrations/electron/update-cli.mjs');
  const f = await fixture(t), options = { home: f.home, installRoot: f.root, source: SOURCE, ref: 'master' };
  assert.equal(await pairedInstallation(options), null);
  const app = path.join(f.home, 'Applications/jumpyBrain.app'); await mkdir(path.join(app, 'Contents'), { recursive: true });
  await writeFile(path.join(app, 'Contents/Info.plist'), '<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>local.jumpybrain.desktop</string><key>CFBundleShortVersionString</key><string>0.3.3</string></dict></plist>');
  assert.equal((await pairedInstallation(options)).appVersion, '0.3.3');
  const before = await readFile(path.join(f.root, 'install-manifest.json'));
  await assert.rejects(pairedInstallation({ ...options, ref: 'v0.3.3' }), /Nothing was changed/);
  await assert.rejects(pairedInstallation({ ...options, source: '/developer/checkout' }), /Nothing was changed/);
  assert.deepEqual(await readFile(path.join(f.root, 'install-manifest.json')), before);
  f.manifest.ref = 'v0.3.3'; await f.save();
  await assert.rejects(pairedInstallation(options), /Nothing was changed/);
  assert.equal(await pairedInstallation({ ...options, installRoot: path.join(f.home, 'custom-root') }), null);
});
