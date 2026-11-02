import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, chmod, lstat, rename } from 'node:fs/promises';
import fsPromises from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import path from 'node:path';
import os from 'node:os';
import { EventEmitter } from 'node:events';
import { spawnSync } from 'node:child_process';
import { refreshManagedIntegrations } from '../integrations/electron/managed-integrations.mjs';
import { digest } from '../integrations/electron/update-policy.mjs';
import { startDesktopHost } from '../integrations/electron/desktop-host.mjs';
import { pinBackendRuntime } from '../dist/adapters/backend-host/runtime-pins.js';
import { currentBackendIdentity, readRuntimeGeneration } from '../dist/adapters/backend-host/index.js';
import { parseArgs } from '../dist/cli/args.js';

async function fixture(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'jb-hygiene-'));
  t.after(() => rm(directory, { recursive: true, force: true })); return directory;
}

test('integration updates require the installed hash; customized, missing, legacy and linked files survive', async t => {
  const home = await fixture(t), appDir = path.join(home, 'app');
  const file = path.join(home, '.agents/skills/jumpybrain-memory/SKILL.md');
  await mkdir(path.dirname(file), { recursive: true });
  await mkdir(path.join(appDir, 'skills/jumpybrain-memory'), { recursive: true });
  const desired = 'new template'; await writeFile(path.join(appDir, 'skills/jumpybrain-memory/SKILL.md'), desired);
  const manifest = { appDir, scope: 'global', cliPath: '/fixture/cli', memoryRoot: '/fixture/brain', integrations: [{ kind: 'codex', path: file }], integrationHashes: { [file]: digest('old') } };
  await writeFile(file, 'old');
  let result = await refreshManagedIntegrations(manifest, { home, dryRun: true });
  assert.equal(result.results[0].status, 'refreshed'); assert.equal(await readFile(file, 'utf8'), 'old');
  result = await refreshManagedIntegrations(manifest, { home });
  assert.equal(result.hashes[file], digest(desired)); assert.equal(await readFile(file, 'utf8'), desired);
  manifest.integrationHashes = result.hashes;
  await writeFile(file, 'customized');
  assert.equal((await refreshManagedIntegrations(manifest, { home })).results[0].status, 'customized');
  assert.equal(await readFile(file, 'utf8'), 'customized');
  delete manifest.integrationHashes[file];
  assert.equal((await refreshManagedIntegrations(manifest, { home })).results[0].status, 'untracked');
  await writeFile(file, desired);
  assert.equal((await refreshManagedIntegrations(manifest, { home })).hashes[file], digest(desired));
  await rm(file);
  assert.equal((await refreshManagedIntegrations(manifest, { home })).results[0].status, 'missing');
  const foreign = path.join(home, 'foreign'); await writeFile(foreign, 'foreign'); await symlink(foreign, file);
  assert.equal((await refreshManagedIntegrations(manifest, { home })).results[0].status, 'unsafe');
  assert.equal(await readFile(foreign, 'utf8'), 'foreign');
  await rm(file); await rm(path.dirname(file), { recursive: true });
  await symlink(path.dirname(foreign), path.dirname(file));
  assert.equal((await refreshManagedIntegrations(manifest, { home })).results[0].status, 'unsafe');
});

test('runtime pins are private and retirement prevents readiness, including linked pin directories', async t => {
  const runtime = await fixture(t); await mkdir(path.join(runtime, 'dist/server'), { recursive: true });
  const executable = path.join(runtime, 'dist/server/daemon.js');
  const lease = { executable, runtimeGeneration: await readRuntimeGeneration(executable), instanceId: 'test', pid: process.pid };
  await pinBackendRuntime('/fixture/brain', lease);
  const record = path.join(runtime, '.backend-pins/test.json');
  assert.equal((await lstat(record)).mode & 0o077, 0);
  assert.equal(JSON.parse(await readFile(record)).pid, process.pid);
  const dead = path.join(runtime, '.backend-pins/00000000-0000-4000-8000-000000000000.json');
  await writeFile(dead, JSON.stringify({ pid: 99999999 }), { mode: 0o600 });
  await pinBackendRuntime('/fixture/brain', { ...lease, instanceId: 'new' });
  await assert.rejects(lstat(dead), { code: 'ENOENT' });
  await writeFile(path.join(runtime, '.retiring'), 'retiring');
  await assert.rejects(pinBackendRuntime('/fixture/brain', { ...lease, instanceId: 'next' }), /retired/);
  await rm(path.join(runtime, '.retiring')); await rm(path.join(runtime, '.backend-pins'), { recursive: true });
  await symlink(os.tmpdir(), path.join(runtime, '.backend-pins'));
  await assert.rejects(pinBackendRuntime('/fixture/brain', lease), /Unsafe/);
});

test('a runtime exchange between identity and pin rejects startup instead of pinning its replacement', async t => {
  const base = await fixture(t), runtime = path.join(base, 'app'), staged = path.join(base, 'staged'), backup = path.join(base, 'previous');
  for (const dir of [runtime, staged]) { await mkdir(path.join(dir, 'dist/server'), { recursive: true }); await writeFile(path.join(dir, 'dist/server/daemon.js'), '// disposable executable'); }
  const identity = await currentBackendIdentity(path.join(runtime, 'dist/server/daemon.js'));
  await rename(runtime, backup); await rename(staged, runtime);
  await assert.rejects(pinBackendRuntime('/fixture/brain', { ...identity, instanceId: 'exchanged', pid: process.pid }), /Runtime changed/);
  await assert.rejects(lstat(path.join(runtime, '.backend-pins')), { code: 'ENOENT' });
  assert.notEqual(await readRuntimeGeneration(identity.executable), identity.runtimeGeneration);
});

test('an exchange and rollback during pin publication cannot make a wrong-generation pin prove readiness', async t => {
  const base = await fixture(t), runtime = path.join(base, 'app'), staged = path.join(base, 'staged'), backup = path.join(base, 'previous');
  for (const dir of [runtime, staged]) { await mkdir(path.join(dir, 'dist/server'), { recursive: true }); await writeFile(path.join(dir, 'dist/server/daemon.js'), '// disposable executable'); }
  const identity = await currentBackendIdentity(path.join(runtime, 'dist/server/daemon.js'));
  const original = fsPromises.open;
  fsPromises.open = async (file, ...args) => {
    if (!String(file).endsWith('/flight.json')) return original(file, ...args);
    await rename(runtime, backup); await rename(staged, runtime);
    await mkdir(path.join(runtime, '.backend-pins'), { mode: 0o700 });
    const handle = await original(file, ...args), sync = handle.sync.bind(handle);
    handle.sync = async () => { await sync(); await rename(runtime, staged); await rename(backup, runtime); };
    return handle;
  };
  syncBuiltinESMExports();
  try { await assert.rejects(pinBackendRuntime('/fixture/brain', { ...identity, instanceId: 'flight', pid: process.pid }), /ENOENT|pin moved|Runtime changed/); }
  finally { fsPromises.open = original; syncBuiltinESMExports(); }
  assert.equal(await readRuntimeGeneration(identity.executable), identity.runtimeGeneration);
  await assert.rejects(lstat(path.join(runtime, '.backend-pins/flight.json')), { code: 'ENOENT' });
  assert.equal(JSON.parse(await readFile(path.join(staged, '.backend-pins/flight.json'))).runtimeGeneration, identity.runtimeGeneration);
});

test('owned child stop is classified separately from crash or launch error', async t => {
  const supportDirectory = await fixture(t); await chmod(supportDirectory, 0o700);
  await writeFile(path.join(supportDirectory, 'api-key'), 'a'.repeat(64), { mode: 0o600 });
  for (const mode of ['stop', 'crash', 'launch-error']) {
    const events = []; const child = new EventEmitter(); child.kill = () => { queueMicrotask(() => child.emit('exit', null, 'SIGTERM')); };
    let probes = 0; const config = { supportDirectory, origin: 'http://127.0.0.1:3787', executable: '/fixture/native' };
    const instance = '00000000-0000-4000-8000-000000000000';
    const pending = startDesktopHost(config, { instance, deadlineMs: 500, onExit: event => events.push(event),
      spawnHost: () => { if (mode === 'launch-error') queueMicrotask(() => child.emit('error', new Error('fixture'))); return child; },
      probe: async () => { if (!probes++) throw Object.assign(new Error(), { code: 'ECONNREFUSED' }); return { hostInstance: instance }; },
    });
    if (mode === 'launch-error') await assert.rejects(pending, /could not start/);
    else { const host = await pending; if (mode === 'stop') await host.stop(); else child.emit('exit', 1, null); }
    assert.equal(events.length, 1); assert.equal(events[0].expected, mode === 'stop');
  }
});

test('backend list is bounded and strict, with help resolving before all operation work', () => {
  assert.deepEqual(parseArgs(['backend', 'list', '--root', '/one', '--root=/two']).root, ['/one', '/two']);
  assert.throws(() => parseArgs(['backend', 'status', '--root', '/one', '--root', '/two']), /repeated/);
  for (const argv of [['backend', 'list', '--root'], ['backend', 'list', '--root', '/one', '--scan'], ['backend', 'list', '--json=false']]) assert.throws(() => parseArgs(argv));
  const result = spawnSync(process.execPath, ['dist/cli.js', 'backend', 'list', '--root', '--help'], { encoding: 'utf8', env: { ...process.env, JUMPYBRAIN_CLI_CONFIG: '/does-not-exist' } });
  assert.equal(result.status, 0, result.stderr); assert.match(result.stdout, /1\.\.32/);
});

test('pre-host bootstrap breadcrumb is bounded and never follows a linked destination', async t => {
  const home = await fixture(t), main = path.join(home, 'main.mjs');
  const electron = 'data:text/javascript,' + encodeURIComponent(`export const app = { getPath: () => ${JSON.stringify(home)}, exit: code => { process.exitCode = code; } };`);
  const source = (await readFile(new URL('../integrations/electron/main.mjs', import.meta.url), 'utf8')).replace("'electron'", JSON.stringify(electron));
  await writeFile(main, source);
  await writeFile(path.join(home, 'application.mjs'), "throw new Error('secret fixture path and raw exception');");
  const run = () => spawnSync(process.execPath, [main], { encoding: 'utf8' });
  const first = run(); assert.equal(first.status, 1); assert.doesNotMatch(first.stderr, /secret fixture/);
  const breadcrumb = path.join(home, 'startup-failure.json');
  const bytes = await readFile(breadcrumb); assert.ok(bytes.length < 200); assert.equal(JSON.parse(bytes).code, 'bootstrap_failed');
  assert.equal((await lstat(breadcrumb)).mode & 0o077, 0);
  await rm(breadcrumb); const foreign = path.join(home, 'foreign'); await writeFile(foreign, 'preserve');
  await symlink(foreign, breadcrumb); assert.equal(run().status, 1); assert.equal(await readFile(foreign, 'utf8'), 'preserve');
});

test('a real backend pins a moved staging runtime until authenticated drain; notes remain byte-identical', { timeout: 30000 }, async t => {
  const { cp } = await import('node:fs/promises');
  const { currentBackendIdentity, processAlive, verifyBackendReady } = await import('../dist/adapters/backend-host/index.js');
  const { ensureRootBackend, stopRootBackend } = await import('../dist/app/backend-host/index.js');
  const home = await fixture(t), updates = path.join(home, 'updates'), root = path.join(home, 'brain');
  await mkdir(updates); await mkdir(root); await writeFile(path.join(root, 'note.md'), '# Preserve canonical bytes\n');
  t.after(() => stopRootBackend(root).catch(() => {}));
  for (let number = 0; number < 4; number++) {
    const dir = path.join(updates, 'update-' + number); await mkdir(dir);
    await writeFile(path.join(dir, 'state.json'), JSON.stringify({ phase: 'success', pid: 99999999, updatedAt: number }));
    await writeFile(path.join(dir, 'retention.json'), JSON.stringify({ schema: 1, terminal: true }));
    await writeFile(path.join(dir, 'transaction.json'), JSON.stringify({ phase: 'success' }));
  }
  const runtime = path.join(updates, 'update-0/unpacked/package'); await mkdir(runtime, { recursive: true });
  await cp(new URL('../dist', import.meta.url), path.join(runtime, 'dist'), { recursive: true });
  await writeFile(path.join(runtime, 'package.json'), '{"type":"module"}');
  const identity = await currentBackendIdentity(path.join(runtime, 'dist/server/daemon.js'));
  const backend = await ensureRootBackend(root, { identity });
  assert.equal(await verifyBackendReady(backend), true);
  const listed = spawnSync(process.execPath, ['dist/cli.js', 'backend', 'list', '--root', root, '--root', path.join(home, 'absent'), '--json'], { encoding: 'utf8' });
  assert.equal(listed.status, 0, listed.stderr);
  const items = JSON.parse(listed.stdout).backends;
  assert.equal(items[0].pidAlive, true); assert.equal(items[0].backend.executable, backend.executable);
  assert.equal(items[1].status, 'invalid'); assert.equal(listed.stdout.includes(backend.token), false);
  const { rename } = await import('node:fs/promises');
  const moved = path.join(updates, 'update-moved'); await rename(path.dirname(path.dirname(runtime)), moved);
  const cleanup = () => {
    const result = spawnSync('python3', ['-B', 'integrations/electron/update-retention.py', updates, '--apply'], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr); return JSON.parse(result.stdout);
  };
  assert.equal(cleanup().some(item => item.directory === moved), false);
  assert.equal(await verifyBackendReady(backend), true);
  assert.equal((await stopRootBackend(root)).stopped, true);
  const deadline = Date.now() + 5000;
  while (processAlive(backend.pid) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(processAlive(backend.pid), false);
  assert.equal(cleanup().some(item => item.directory === moved), true);
  assert.equal(await readFile(path.join(root, 'note.md'), 'utf8'), '# Preserve canonical bytes\n');
});

test('foreign/frozen runtimes remain usable without writes, and are ineligible for automatic retirement', async t => {
  const runtime = await fixture(t); await mkdir(path.join(runtime, 'dist/server'), { recursive: true });
  await chmod(runtime, 0o500);
  await pinBackendRuntime('/fixture/brain', { executable: path.join(runtime, 'dist/server/daemon.js'), instanceId: 'frozen', pid: process.pid });
  await assert.rejects(lstat(path.join(runtime, '.backend-pins')), { code: 'ENOENT' });
  const result = spawnSync('python3', ['-B', 'integrations/electron/update-retention.py', '--runtime', runtime], { encoding: 'utf8' });
  assert.notEqual(result.status, 0); await assert.rejects(lstat(path.join(runtime, '.retiring')), { code: 'ENOENT' });
  await chmod(runtime, 0o700);
});

test('CLI installer update retains its own previous runtime while a shared backend still uses it', { timeout: 30000 }, async t => {
  const { cp, readdir } = await import('node:fs/promises');
  const { currentBackendIdentity, verifyBackendReady } = await import('../dist/adapters/backend-host/index.js');
  const { ensureRootBackend, stopRootBackend } = await import('../dist/app/backend-host/index.js');
  const home = await fixture(t), source = path.join(home, 'source'), install = path.join(home, 'install');
  await mkdir(source); await cp(new URL('../dist', import.meta.url), path.join(source, 'dist'), { recursive: true });
  await writeFile(path.join(source, 'package.json'), '{"name":"jumpybrain","type":"module","version":"0.3.17"}');
  const installOnce = () => spawnSync(process.execPath, ['scripts/public-install.mjs', '--source', source, '--home', home, '--install-root', install,
    '--integrations', 'none', '--skip-build', '--skip-qmd-install', '--skip-initial-index'], { encoding: 'utf8', env: { ...process.env, HOME: home } });
  let result = installOnce(); assert.equal(result.status, 0, result.stderr);
  const root = path.join(install, 'memory'); await writeFile(path.join(root, 'notes/keep.md'), '# Keep canonical bytes\n');
  const identity = await currentBackendIdentity(path.join(install, 'app/dist/server/daemon.js'));
  const backend = await ensureRootBackend(root, { identity });
  try {
    result = installOnce(); assert.equal(result.status, 0, result.stderr); assert.match(result.stdout, /Previous runtime retained/);
    const backups = (await readdir(install)).filter(name => name.startsWith('app.previous-'));
    assert.equal(backups.length, 1);
    assert.equal((await lstat(path.join(install, backups[0], 'app/.backend-pins', backend.instanceId + '.json'))).isFile(), true);
    assert.equal(await verifyBackendReady(backend), true);
    assert.equal(await readFile(path.join(root, 'notes/keep.md'), 'utf8'), '# Keep canonical bytes\n');
  } finally { await stopRootBackend(root); }
});
