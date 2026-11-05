import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createDesktopUpdater } from '../integrations/electron/updater.mjs';
import { selectRelease, SOURCE } from '../integrations/electron/update-release.mjs';

function published(version) {
  return selectRelease([{ tag_name: `v${version}`, id: 1, published_at: '2026-11-04', assets: [{
    id: 2, name: `jumpybrain-${version}.tgz`, state: 'uploaded', size: 4, digest: 'sha256:' + 'a'.repeat(64),
    browser_download_url: `https://github.com/nikoatwork/jumpyBrain/releases/download/v${version}/jumpybrain-${version}.tgz`,
  }] }]);
}
async function restored(t, phase, version = '0.3.20', managed = false) {
  const home = await realpath(await mkdtemp(path.join(os.tmpdir(), 'jb-readiness-')));
  t.after(() => rm(home, { recursive: true, force: true }));
  const resources = path.join(home, 'Applications/jumpyBrain.app/Contents/Resources');
  await mkdir(path.join(resources, 'runtime'), { recursive: true });
  await writeFile(path.join(resources, 'runtime/package.json'), JSON.stringify({ version: '0.3.20' }));
  if (managed) {
    const root = path.join(home, '.jumpybrain'), app = path.join(root, 'app'), bin = path.join(root, 'bin');
    await mkdir(app, { recursive: true }); await mkdir(bin);
    await writeFile(path.join(app, 'package.json'), JSON.stringify({ version: '0.3.20' }));
    const cliPath = path.join(bin, 'jumpybrain');
    await writeFile(cliPath, `#!/usr/bin/env sh\nif [ -z "\${JUMPYBRAIN_CLI_CONFIG+x}" ]; then\n  export JUMPYBRAIN_CLI_CONFIG='${path.join(root, 'cli-config.json')}'\nfi\nexec node ${JSON.stringify(path.join(app, 'dist/cli.js'))} "$@"\n`);
    await writeFile(path.join(root, 'install-manifest.json'), JSON.stringify({ installer: 'jumpybrain-installer', version: 1,
      source: SOURCE, ref: 'master', scope: 'global', integrationMode: 'none', installRoot: root, appDir: app, binDir: bin, cliPath,
      memoryRoot: path.join(home, 'memory') }));
  }
  const directory = path.join(home, 'Library/Application Support/jumpyBrain Updates/update-restored');
  await mkdir(directory, { recursive: true });
  const stateFile = path.join(directory, 'state.json');
  await writeFile(stateFile, JSON.stringify({ phase, pid: ['preparing', 'ready', 'updating'].includes(phase) ? process.pid : 2147483647,
    updatedAt: Date.now() - 1000, version, detail: 'Restored fixture update.' }));
  await writeFile(path.join(directory, 'request.json'), JSON.stringify({ release: published(version) }));
  if (phase === 'success') await writeFile(path.join(directory, 'transaction.json'), JSON.stringify({ phase: 'success' }));
  return { home, resources, directory, stateFile };
}
test('failed manual discovery never turns a persisted transaction into a preparation offer', async t => {
  for (const managed of [false, true]) for (const version of ['0.3.20', '0.3.21']) await t.test(`${version}/${managed ? 'managed' : 'app-only'}`, async t => {
    const f = await restored(t, 'success', version, managed);
    const original = await readFile(f.stateFile, 'utf8');
    let checks = 0;
    const updater = createDesktopUpdater({ ...f, discover: async () => {
      checks++; if (checks === 1) throw new Error('Controlled offline discovery'); return published('0.3.21');
    }, spawnWorker: () => assert.fail('checks must never launch preparation') });
    const failed = await updater.action('check');
    assert.equal(failed.phase, 'failed');
    assert.equal(failed.checkFailed, true);
    assert.equal(failed.canPrepare, false);
    assert.deepEqual(failed.actions, ['check', 'log']);
    assert.equal((await updater.snapshot()).canPrepare, false, 'polling cannot resurrect the old offer');
    assert.equal((await updater.action('app-only')).checkFailed, true, 'stale native preparation requests keep the check failure');
    assert.equal((await updater.action('prepare')).checkFailed, true);
    assert.equal(checks, 1, 'unavailable preparation neither discovers nor downloads');
    const retried = await updater.action('check');
    assert.equal(checks, 2); assert.equal(retried.phase, 'available'); assert.equal(retried.canPrepare, true);
    assert.equal(await readFile(f.stateFile, 'utf8'), original, 'discovery leaves transaction evidence intact');
  });
});
test('restored offers and preparation failures only offer preparation for a newer target', async t => {
  for (const phase of ['available', 'failed']) for (const version of ['0.3.19', '0.3.20', '0.3.21']) await t.test(`${phase}/${version}`, async t => {
    const f = await restored(t, phase, version);
    const updater = createDesktopUpdater({ ...f, discover: async () => published('0.3.20'),
      spawnWorker: () => assert.fail('unavailable actions must not launch') });
    const state = await updater.snapshot();
    assert.equal(state.canPrepare, version === '0.3.21');
    assert.equal(state.actions.includes('app-only'), version === '0.3.21');
    if (!state.canPrepare) assert.deepEqual(await updater.action('app-only'), state);
    const checked = await updater.action('check');
    assert.equal(checked.phase, 'current'); assert.equal(checked.canPrepare, false);
    assert.equal((await updater.snapshot()).canPrepare, false, 'persisted failure cannot overwrite the current publication check');
  });
});
test('restored live readiness keeps its pinned target, but a dead worker only offers valid preparation', async t => {
  for (const version of ['0.3.20', '0.3.21']) await t.test(version, async t => {
    const f = await restored(t, 'ready', version);
    const updater = createDesktopUpdater({ ...f, discover: () => assert.fail('live ready work must not rediscover') });
    const ready = await updater.checkOnStartup();
    assert.equal(ready.phase, 'ready'); assert.equal(ready.available, version);
    assert.equal(ready.actions.includes('restart'), true); assert.equal(ready.canPrepare, false);
    await writeFile(f.stateFile, JSON.stringify({ phase: 'ready', pid: 2147483647, updatedAt: Date.now() + 1 }));
    const interrupted = await updater.snapshot();
    assert.equal(interrupted.phase, 'failed'); assert.equal(interrupted.actions.includes('restart'), false);
    assert.equal(interrupted.canPrepare, version === '0.3.21');
  });
});
test('missing installed metadata keeps restored status accessible without offering preparation', async t => {
  const f = await restored(t, 'failed', '0.3.21');
  await rm(path.join(f.resources, 'runtime/package.json'));
  const updater = createDesktopUpdater({ ...f, discover: async () => published('0.3.21') });
  assert.equal((await updater.snapshot()).canPrepare, false);
  const checked = await updater.action('check');
  assert.equal(checked.canPrepare, false); assert.match(checked.detail, /Repair the installation/);
});
