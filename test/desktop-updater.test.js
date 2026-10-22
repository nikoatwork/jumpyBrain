import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, realpath } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { selectRelease, discoverRelease, verifyArtifact, compareVersions, SOURCE } from '../integrations/electron/update-release.mjs';
import { cliPolicy } from '../integrations/electron/update-policy.mjs';
import { createDesktopUpdater } from '../integrations/electron/updater.mjs';
import { createQuitFlow } from '../integrations/electron/lifecycle.mjs';

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
  for (const failure of ['save', 'close', 'handoff', null]) {
    const events = [];
    const quit = createQuitFlow({ getHost: () => ({ isAlive: () => true, stop: async () => events.push('stop') }),
      control: async (_c, _r, body) => { events.push(body.action); if (failure === 'save' && body.action === 'prepare') throw new Error('failed draft'); return { id: 'lease' }; },
      closeWindows: async () => { events.push('close'); return failure !== 'close'; }, flush: async () => {},
      beforeStop: async () => { events.push('handoff'); if (failure === 'handoff') throw new Error('worker died'); },
      cancelClose: () => events.push('resume'), showError: async () => {}, exit: () => events.push('exit') });
    await quit();
    assert.equal(events.includes('stop'), failure === null);
    assert.equal(events.includes('handoff'), failure === null || failure === 'handoff');
    if (!failure) assert.deepEqual(events, ['prepare','close','commit','handoff','stop','exit']);
  }
});
test('Python archive and interrupted exchange recovery tests', { skip: process.platform !== 'darwin' }, async () => {
  const { execFile } = await import('node:child_process'); const { promisify } = await import('node:util');
  const { stderr } = await promisify(execFile)('python3', ['-B', 'integrations/electron/test_update_transaction.py']);
  assert.match(stderr, /OK/);
});
