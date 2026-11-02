import assert from 'node:assert/strict';
import test from 'node:test';
import { cp, mkdtemp, mkdir, writeFile, readFile, rm, lstat, rename, symlink, chmod, readdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { currentBackendIdentity, readRuntimeGeneration, verifyBackendReady, processAlive } from '../dist/adapters/backend-host/index.js';
import { ensureRootBackend, stopRootBackend } from '../dist/app/backend-host/index.js';

const pinsModule = new URL('../dist/adapters/backend-host/runtime-pins.js', import.meta.url).href;
const retention = new URL('../integrations/electron/update-retention.py', import.meta.url).pathname;
async function fixture(t) {
  const home = await mkdtemp(path.join(os.tmpdir(), 'jb-bundle-pins-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const app = path.join(home, 'jumpyBrain.app'), runtime = path.join(app, 'Contents/Resources/runtime');
  await mkdir(runtime, { recursive: true });
  const executable = path.join(runtime, 'dist/server/daemon.js');
  await cp(new URL('../dist', import.meta.url), path.join(runtime, 'dist'), { recursive: true });
  await writeFile(path.join(runtime, 'package.json'), '{"type":"module"}');
  const generation = await readRuntimeGeneration(executable);
  const base = path.join(home, '.jumpybrain-runtime-pins'), state = path.join(base, generation.replace(':', '-'));
  const env = { ...process.env, HOME: home };
  return { home, app, runtime, executable, generation, base, state, env };
}
function pin(f, instanceId = '00000000-0000-4000-8000-000000000000', extra = '') {
  const lease = { executable: f.executable, runtimeGeneration: f.generation, instanceId, pid: process.pid };
  return spawnSync(process.execPath, ['--input-type=module', '-e', `import {pinBackendRuntime} from ${JSON.stringify(pinsModule)}; ${extra}; await pinBackendRuntime('/fixture/brain', ${JSON.stringify(lease)});`], { env: f.env, encoding: 'utf8' });
}
function retire(f, runtime = f.runtime) {
  return spawnSync('python3', ['-B', retention, '--runtime', runtime], { env: f.env, encoding: 'utf8' });
}
async function unmodified(f) {
  await assert.rejects(lstat(path.join(f.runtime, '.backend-pins')), { code: 'ENOENT' });
  await assert.rejects(lstat(path.join(f.runtime, '.retiring')), { code: 'ENOENT' });
}

test('bundle pins and retirement follow the directory generation outside sealed resources', async t => {
  const f = await fixture(t);
  const result = pin(f); assert.equal(result.status, 0, result.stderr);
  const file = path.join(f.state, '.backend-pins/00000000-0000-4000-8000-000000000000.json');
  for (const entry of [f.base, f.state, path.dirname(file), file]) assert.equal((await lstat(entry)).mode & 0o077, 0);
  const bytes = await readFile(file); assert.equal(JSON.parse(bytes).runtimeGeneration, f.generation);
  assert.notEqual(retire(f).status, 0, 'a live backend prevents retirement');
  await assert.rejects(lstat(path.join(f.state, '.retiring')), { code: 'ENOENT' });
  const moved = path.join(f.home, 'previous.app'); await rename(f.app, moved);
  f.runtime = path.join(moved, 'Contents/Resources/runtime'); f.executable = path.join(f.runtime, 'dist/server/daemon.js');
  assert.equal(await readRuntimeGeneration(f.executable), f.generation);
  assert.notEqual(retire(f).status, 0, 'moving the app does not lose its live pin');
  assert.deepEqual(await readFile(file), bytes);
  await writeFile(file, JSON.stringify({ pid: 99999999 }), { mode: 0o600 });
  assert.equal(retire(f).status, 0);
  assert.notEqual(pin(f, 'retired').status, 0, 'retirement prevents readiness');
  await unmodified(f);
});

test('bundle startup and cleanup reject linked or nonprivate external state', async t => {
  for (const location of ['base', 'state', 'pins', 'public']) await t.test(location, async t => {
    const f = await fixture(t), foreign = path.join(f.home, 'foreign'); await mkdir(foreign);
    await writeFile(path.join(foreign, 'keep'), 'preserve');
    if (location === 'base') await symlink(foreign, f.base);
    else {
      await mkdir(f.base, { mode: 0o700 });
      if (location === 'state') await symlink(foreign, f.state);
      else {
        await mkdir(f.state, { mode: 0o700 });
        if (location === 'pins') await symlink(foreign, path.join(f.state, '.backend-pins'));
        else await chmod(f.state, 0o755);
      }
    }
    assert.notEqual(pin(f).status, 0); assert.notEqual(retire(f).status, 0);
    assert.deepEqual(await readdir(foreign), ['keep']); assert.equal(await readFile(path.join(foreign, 'keep'), 'utf8'), 'preserve');
    await unmodified(f);
  });
});

test('legacy bundle state and unknown protocols remain retained without changing the bundle', async t => {
  const f = await fixture(t), module = path.join(f.runtime, 'dist/adapters/backend-host/runtime-pins.js');
  const source = await readFile(module);
  await writeFile(module, '/* legacy runtime */');
  assert.notEqual(retire(f).status, 0); await assert.rejects(lstat(f.base), { code: 'ENOENT' });
  await writeFile(module, source);
  await mkdir(path.join(f.runtime, '.backend-pins'), { mode: 0o700 });
  await writeFile(path.join(f.runtime, '.backend-pins/legacy.json'), JSON.stringify({ pid: process.pid }), { mode: 0o600 });
  assert.notEqual(retire(f).status, 0);
  await rm(path.join(f.runtime, '.backend-pins'), { recursive: true });
  await writeFile(path.join(f.runtime, '.retiring'), 'legacy fence');
  assert.notEqual(pin(f).status, 0); assert.notEqual(retire(f).status, 0);
  assert.equal(await readFile(path.join(f.runtime, '.retiring'), 'utf8'), 'legacy fence');
});

test('a stale bundle launch cannot pin a replacement directory generation', async t => {
  const f = await fixture(t), original = path.join(f.home, 'original');
  await rename(f.runtime, original); await mkdir(f.runtime);
  const result = pin(f); assert.notEqual(result.status, 0); assert.match(result.stderr, /Runtime changed/);
  await assert.rejects(lstat(f.base), { code: 'ENOENT' }); await unmodified(f);
});

test('retirement racing bundle pin publication either fences readiness or retains the live owner', async t => {
  for (const phase of ['before', 'after']) await t.test(phase, async t => {
    const f = await fixture(t);
    const hook = `import fs from 'node:fs/promises'; import {syncBuiltinESMExports} from 'node:module'; import {spawnSync} from 'node:child_process';
      const original=fs.open; fs.open=async(file,...args)=>{
        if (!String(file).endsWith('.json')) return original(file,...args);
        const cleanup=()=>spawnSync('python3',['-B',${JSON.stringify(retention)},'--runtime',${JSON.stringify(f.runtime)}],{encoding:'utf8'});
        if (${JSON.stringify(phase)}==='before') { if(cleanup().status!==0) throw new Error('retirement should succeed before publication'); }
        const handle=await original(file,...args), sync=handle.sync.bind(handle);
        handle.sync=async()=>{await sync(); if (${JSON.stringify(phase)}==='after' && cleanup().status===0) throw new Error('live owner must block retirement');}; return handle;
      }; syncBuiltinESMExports()`;
    const result = pin(f, '00000000-0000-4000-8000-000000000000', hook);
    if (phase === 'before') { assert.notEqual(result.status, 0); assert.match(result.stderr, /retired/); }
    else assert.equal(result.status, 0, result.stderr);
    await unmodified(f);
  });
});

test('real bundled backends preserve a Mac signature through startup, moves, shutdown and relaunch', { timeout: process.env.JUMPYBRAIN_SIGNED_APP ? 90000 : 30000 }, async t => {
  const f = await fixture(t), root = path.join(f.home, 'brain'); await mkdir(root);
  const note = path.join(root, 'note.md'); await writeFile(note, '# Preserve canonical bytes\n');
  t.after(() => stopRootBackend(root).catch(() => {}));
  if (process.env.JUMPYBRAIN_SIGNED_APP) {
    await rm(f.app, { recursive: true });
    if (process.platform === 'darwin') {
      const copied = spawnSync('/usr/bin/ditto', [process.env.JUMPYBRAIN_SIGNED_APP, f.app], { encoding: 'utf8', timeout: 60000 });
      assert.equal(copied.status, 0, copied.stderr);
    } else await cp(process.env.JUMPYBRAIN_SIGNED_APP, f.app, { recursive: true, verbatimSymlinks: true });
    for (const file of ['adapters/backend-host/runtime-pins.js', 'adapters/diagnostics/build-info.json']) {
      assert.deepEqual(await readFile(path.join(f.runtime, 'dist', file)), await readFile(new URL('../dist/' + file, import.meta.url)), 'supplied bundle must match the tested runtime');
    }
    f.generation = await readRuntimeGeneration(f.executable);
    f.state = path.join(f.base, f.generation.replace(':', '-'));
  } else if (process.platform === 'darwin') {
    await mkdir(path.join(f.app, 'Contents/MacOS'));
    await cp('/usr/bin/true', path.join(f.app, 'Contents/MacOS/fixture'));
    await writeFile(path.join(f.app, 'Contents/Info.plist'), '<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>local.jumpybrain.pin-fixture</string><key>CFBundleExecutable</key><string>fixture</string><key>CFBundlePackageType</key><string>APPL</string></dict></plist>');
    const signed = spawnSync('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', f.app], { encoding: 'utf8' });
    assert.equal(signed.status, 0, signed.stderr);
  } else t.diagnostic('macOS codesign unavailable; real backend and retention checks still run');
  const signature = () => {
    if (process.platform !== 'darwin') return;
    const checked = spawnSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', f.app], { encoding: 'utf8' });
    assert.equal(checked.status, 0, checked.stderr);
  };
  const start = async () => {
    const identity = await currentBackendIdentity(f.executable);
    return ensureRootBackend(root, { identity, spawn: async (root, identity) => {
      const child = spawn(process.execPath, [identity.executable], { env: { ...f.env, JUMPYBRAIN_BACKEND_ROOT: root, JUMPYBRAIN_BACKEND_GENERATION: identity.runtimeGeneration }, detached: true, stdio: 'ignore' });
      await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); }); child.unref();
    } });
  };
  const stop = async backend => {
    assert.equal((await stopRootBackend(root)).stopped, true);
    const deadline = Date.now() + 5000;
    while (processAlive(backend.pid) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(processAlive(backend.pid), false);
  };
  signature();
  const first = await start(); assert.equal(await verifyBackendReady(first), true); signature();
  assert.notEqual(retire(f).status, 0); signature();
  const moved = path.join(f.home, 'moved.app'); await rename(f.app, moved); f.app = moved;
  f.runtime = path.join(moved, 'Contents/Resources/runtime'); f.executable = path.join(f.runtime, 'dist/server/daemon.js');
  assert.notEqual(retire(f).status, 0); signature();
  await stop(first); signature();
  const second = await start(); assert.notEqual(second.instanceId, first.instanceId); signature();
  await stop(second); signature();
  assert.equal(retire(f).status, 0); signature();
  await unmodified(f); assert.equal(await readFile(note, 'utf8'), '# Preserve canonical bytes\n');
});
