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
