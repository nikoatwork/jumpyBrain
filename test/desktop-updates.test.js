import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { EventEmitter } from 'node:events';
import { createDesktopUpdater, trustedUpdateSender, attachUpdateBridge } from '../integrations/electron/updates.mjs';
import { compareVersions, selectRelease, verifyAsset, stageRelease } from '../integrations/electron/update-release.mjs';
import { awaitShutdown, installAfterExit, prepareRestart } from '../integrations/electron/update-handoff.mjs';
import { createQuitFlow } from '../integrations/electron/lifecycle.mjs';

const release = (version, extra = {}) => ({ tag_name: 'v' + version, published_at: '2026-10-22', prerelease: true,
  assets: [{ name: `jumpybrain-${version}.tgz`, state: 'uploaded', size: 3, digest: 'sha256:' + 'a'.repeat(64),
    browser_download_url: `https://github.com/nikoatwork/jumpyBrain/releases/download/v${version}/jumpybrain-${version}.tgz` }], ...extra });
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { resolve, promise }; };
async function temporary(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'jb-update-test-'));
  t.after(() => rm(directory, { recursive: true, force: true })); return directory;
}
test('release discovery orders numeric versions, includes 0.x beta, rejects drafts, prerelease strings and downgrade', () => {
  assert.equal(compareVersions('0.10.0', '0.9.99'), 1);
  assert.equal(selectRelease([release('0.3.3'), release('0.3.4'), release('0.3.5', { draft: true }), release('1.0.0'), release('0.4.0-rc.1')], '0.3.3').version, '0.3.4');
  assert.equal(selectRelease([release('0.3.2'), release('0.3.3')], '0.3.3'), null);
  assert.equal(selectRelease([release('1.0.0', { prerelease: false })], '0.3.3').version, '1.0.0');
});
test('only exact official assets with bounded size and a SHA-256 digest are accepted', () => {
  for (const change of [{ digest: null }, { size: 100 * 1024 * 1024 }, { browser_download_url: 'https://example.com/package.tgz' }, { state: 'new' }]) {
    const candidate = release('0.3.4'); Object.assign(candidate.assets[0], change);
    assert.equal(selectRelease([candidate], '0.3.3'), null);
  }
  const data = Buffer.from('verified');
  const asset = { size: data.length, digest: createHash('sha256').update(data).digest('hex') };
  verifyAsset(data, asset);
  assert.throws(() => verifyAsset(Buffer.from('tampered'), asset));
});
test('failed download verification never invokes extraction/build and cleans its stage', async (t) => {
  const directory = await temporary(t);
  await assert.rejects(stageRelease({ size: 3, digest: 'a'.repeat(64), url: 'https://fixture.test' }, {
    directory, node: process.execPath, fetcher: async () => new Response('bad'), run: () => assert.fail('must not run'),
  }), /verification/);
  const { readdir } = await import('node:fs/promises'); assert.deepEqual(await readdir(directory), []);
});
test('install is explicit and single-flight, failures retry, and only completed preparation allows restart', async () => {
  let builds = 0, restarts = 0, fail = true;
  const wait = deferred();
  const updater = createDesktopUpdater({ currentVersion: '0.3.3', discover: async () => ({ version: '0.3.4' }),
    stage: async (_release, progress) => { builds++; progress('Installing…'); await wait.promise; if (fail) throw new Error('private details'); return { version: '0.3.4' }; },
    restart: async () => { restarts++; },
  });
  await updater.restart(); await updater.install(); assert.equal(builds, 0); assert.equal(restarts, 0);
  await updater.check(); assert.equal(updater.snapshot().status, 'available'); assert.equal(builds, 0);
  const first = updater.install(), second = updater.install(); assert.equal(first, second);
  await Promise.resolve(); assert.equal(updater.snapshot().status, 'installing');
  await updater.restart(); assert.equal(restarts, 0);
  wait.resolve(); await first; assert.equal(updater.snapshot().status, 'error'); assert.equal(updater.snapshot().retry, 'install');
  assert.doesNotMatch(updater.snapshot().message, /private details/);
  fail = false; await updater.install(); assert.equal(updater.snapshot().status, 'ready'); assert.equal(builds, 2);
  await updater.check(); assert.equal(updater.snapshot().status, 'ready');
  await updater.restart(); assert.equal(restarts, 1); assert.equal(updater.snapshot().status, 'ready');
});
test('unsupported installations never discover, install, or restart; network failure can be retried', async () => {
  const unsupported = createDesktopUpdater({ supported: false, currentVersion: '0.3.3', discover: () => assert.fail() });
  await unsupported.check(); await unsupported.install(); await unsupported.restart(); assert.equal(unsupported.snapshot().status, 'unavailable');
  let failure = true;
  const updater = createDesktopUpdater({ currentVersion: '0.3.3', discover: async () => { if (failure) throw new Error('offline'); return null; } });
  await updater.check(); assert.equal(updater.snapshot().retry, 'check'); failure = false;
  await updater.check(); assert.equal(updater.snapshot().status, 'current');
});
test('IPC accepts only the attached window main frame at the exact gateway origin, and removes handlers on close', async () => {
  const frame = { url: 'http://127.0.0.1:3787/' };
  const contents = new EventEmitter(); contents.mainFrame = frame; contents.isDestroyed = () => false; contents.send = () => {};
  const event = { sender: contents, senderFrame: frame };
  assert.equal(trustedUpdateSender(event, contents, 'http://127.0.0.1:3787'), true);
  assert.equal(trustedUpdateSender({ ...event, sender: {} }, contents, 'http://127.0.0.1:3787'), false);
  assert.equal(trustedUpdateSender({ ...event, senderFrame: { ...frame } }, contents, 'http://127.0.0.1:3787'), false);
  frame.url = 'https://example.com'; assert.equal(trustedUpdateSender(event, contents, 'http://127.0.0.1:3787'), false);
  frame.url = 'http://127.0.0.1:3787/';
  const handlers = new Map();
  const ipc = { handle: (key, handler) => handlers.set(key, handler), removeHandler: (key) => handlers.delete(key) };
  attachUpdateBridge(ipc, contents, 'http://127.0.0.1:3787', createDesktopUpdater({ currentVersion: '0.3.3' }));
  assert.equal(handlers.size, 4);
  assert.equal(handlers.get('jumpybrain:update:state')(event).status, 'idle');
  assert.throws(() => handlers.get('jumpybrain:update:install')({ sender: {} }));
  contents.emit('destroyed'); assert.equal(handlers.size, 0);
});
test('handoff requires authorization AND process exit, cancellation always wins', async (t) => {
  const stage = await temporary(t); const request = { stage, parentPid: 999 };
  const options = { timeoutMs: 15, pollMs: 1 };
  await assert.rejects(awaitShutdown(request, { ...options, isAlive: () => false }), /authorized shutdown/);
  await writeFile(path.join(stage, 'proceed'), 'restart\n');
  await assert.rejects(awaitShutdown(request, { ...options, isAlive: () => true }), /authorized shutdown/);
  await awaitShutdown(request, { ...options, isAlive: () => false });
  await writeFile(path.join(stage, 'cancelled'), 'cancelled');
  await assert.rejects(awaitShutdown(request, { ...options, isAlive: () => false }), /cancelled/);
});
test('detached helper readiness, cancellation and a second attempt use real child processes', async (t) => {
  const stage = await temporary(t);
  const prepared = { stage, bundle: '/fixture/app', installer: '/fixture/installer', version: '0.3.4' };
  const first = await prepareRestart(prepared, { node: process.execPath, home: os.homedir() });
  await first.cancel();
  const second = await prepareRestart(prepared, { node: process.execPath, home: os.homedir() });
  await second.cancel();
  assert.equal(await readFile(path.join(stage, 'cancelled'), 'utf8'), 'cancelled\n');
});
test('post-exit install failure never reopens; success installs first and opens the fixed app path', async () => {
  const request = { home: '/fixture/home', installer: '/fixture/install.py', bundle: '/fixture/stage/app' };
  const calls = [];
  await assert.rejects(installAfterExit(request, { wait: async () => {}, execute: async (cmd) => { calls.push(cmd); throw new Error('failed'); } }));
  assert.deepEqual(calls, ['/usr/bin/python3']); calls.length = 0;
  await installAfterExit(request, { wait: async () => calls.push('saved and exited'), execute: async (cmd) => calls.push(cmd) });
  assert.deepEqual(calls, ['saved and exited', '/usr/bin/python3', '/usr/bin/open']);
});
test('restart uses the save barrier and never arms the handoff when a save fails or closing is cancelled', async () => {
  for (const failure of ['save', 'close', null]) {
    const events = [];
    const quit = createQuitFlow({ getHost: () => ({ isAlive: () => true, connection: {}, stop: async () => events.push('stop') }),
      control: async (_c, _r, body) => { events.push(body.action); if (failure === 'save') throw new Error('save failed'); return { id: 'lease' }; },
      closeWindows: async () => failure !== 'close', cancelClose: () => events.push('cancel'), flush: async () => {}, showError: async () => {},
      exit: async () => events.push('arm handoff'),
    });
    assert.equal(await quit(), !failure);
    assert.equal(events.includes('arm handoff'), !failure);
    if (!failure) assert.deepEqual(events, ['prepare', 'commit', 'stop', 'arm handoff']);
  }
});

test('archive extraction rejects traversal, links and duplicate paths before writing files', async () => {
  const { execFileSync } = await import('node:child_process');
  execFileSync('/usr/bin/python3', ['-B', '-c', `
import importlib.util, io, tarfile, tempfile
from pathlib import Path
spec = importlib.util.spec_from_file_location('extractor', 'integrations/electron/update-extract.py')
module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
for attack in ['package/../../outside', '/package/absolute', 'link', 'duplicate']:
    with tempfile.TemporaryDirectory() as root:
        root = Path(root); archive = root / 'archive.tgz'; destination = root / 'stage'; destination.mkdir()
        with tarfile.open(archive, 'w:gz') as output:
            item = tarfile.TarInfo('package/file'); item.size = 2; output.addfile(item, io.BytesIO(b'ok'))
            if attack == 'duplicate': item = tarfile.TarInfo('package/file')
            elif attack == 'link':
                item = tarfile.TarInfo('package/link'); item.type = tarfile.SYMTYPE; item.linkname = '/tmp'
            else: item = tarfile.TarInfo(attack)
            output.addfile(item)
        try: module.extract(archive, destination)
        except ValueError: pass
        else: raise AssertionError(attack)
        assert not list(destination.iterdir())
`]);
});


test('importing the handoff in a background desktop launch does not interpret flags as paths', async () => {
  const { execFileSync } = await import('node:child_process');
  execFileSync(process.execPath, ['--input-type=module', '-e', "process.argv[1] = '--background'; await import('./integrations/electron/update-handoff.mjs');"]);
});
