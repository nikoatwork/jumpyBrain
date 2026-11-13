import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { initializeMemoryRoot } from '../dist/index.js';
import { ensureRootBackend, stopRootBackend } from '../dist/app/backend-host/index.js';
import { acquireBackendLease, currentBackendIdentity, publishBackendDescriptor, readBackendDescriptor, releaseBackendLease, verifyBackendReady } from '../dist/adapters/backend-host/index.js';
import { startCompanionGateway } from '../integrations/macos-companion/gateway.mjs';
import { ConnectionStore } from '../integrations/macos-companion/connections.mjs';

const runtimeRoot = fileURLToPath(new URL('..', import.meta.url));
const id = 'mem_11111111-1111-4111-8111-111111111111';
const controlKey = 'b'.repeat(64);
async function fixture(t, versionOffset = -1) {
  const temporary = await realpath(await mkdtemp(path.join(os.tmpdir(), 'jb-backend-upgrade-')));
  const finalizers = [];
  const runtime = path.join(temporary, 'runtime'), roots = [path.join(temporary, 'a'), path.join(temporary, 'b')];
  const current = await currentBackendIdentity();
  const parts = current.version.split('.').map(Number);
  // Keep the fixture valid across patch/minor releases without changing build output.
  const previous = parts[2] > 0 ? [parts[0], parts[1], parts[2] - 1] : parts[1] > 0 ? [parts[0], parts[1] - 1, 0] : [Math.max(0, parts[0] - 1), 0, 0];
  const version = versionOffset < 0 ? previous.join('.') : versionOffset > 0 ? [parts[0], parts[1], parts[2] + 1].join('.') : current.version;
  await mkdir(runtime); await cp(path.join(runtimeRoot, 'dist'), path.join(runtime, 'dist'), { recursive: true });
  await writeFile(path.join(runtime, 'package.json'), JSON.stringify({ type: 'module', version }));
  await writeFile(path.join(runtime, 'dist/adapters/diagnostics/build-info.json'), JSON.stringify({ version, build: 'fixture-' + version }));
  const older = await import(pathToFileURL(path.join(runtime, 'dist/app/backend-host/index.js')).href);
  for (const root of roots) {
    await initializeMemoryRoot(root);
    await writeFile(path.join(root, 'notes/fixture.md'), `---\nid: ${id}\ntype: note\ntitle: Existing brain\n---\nPreserved ${path.basename(root)} content.\n`);
  }
  t.after(async () => {
    for (const close of finalizers) await close();
    for (const root of roots) await stopRootBackend(root).catch(() => {});
    await rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
  });
  return { temporary, runtime, roots, older, current, finalizers };
}

test('desktop opens both persisted pre-update brains and concurrent first reads upgrade one authenticated owner', { timeout: 30000 }, async t => {
  const f = await fixture(t), before = [];
  for (const root of f.roots) {
    const owner = await f.older.ensureRootBackend(root);
    const issued = await fetch(owner.url + '/access', { method: 'POST', headers: { Authorization: 'Bearer ' + owner.token, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Existing reader', role: 'reader' }) });
    assert.equal(issued.status, 201);
    before.push({ owner, reader: (await issued.json()).token, content: await readFile(path.join(root, 'notes/fixture.md'), 'utf8') });
  }
  const directory = path.join(f.temporary, 'support');
  const store = await ConnectionStore.open({ directory, initialRoot: f.roots[0], credentials: { get: async () => null } });
  const profiles = await store.save({ name: 'Second existing brain', kind: 'local', root: f.roots[1] }, store.snapshot().revision);
  const gateway = await startCompanionGateway({ runtimeRoot, directory, initialRoot: f.roots[0], port: 0, controlKey, credentials: { get: async () => null }, identityFile: path.join(f.temporary, 'identity.json') });
  f.finalizers.push(() => gateway.close());
  const request = route => fetch(gateway.url + '/memories/all/' + route, { headers: { Authorization: 'Bearer ' + controlKey, 'X-Companion-Generation': String(gateway.coordinator.generation) } });
  for (let index = 0; index < f.roots.length; index++) {
    if (index) {
      // The second root was not active when the new gateway started.
      assert.equal((await readBackendDescriptor(f.roots[index])).instanceId, before[index].owner.instanceId);
      const switched = await fetch(gateway.url + '/companion/switch', { method: 'POST', headers: { Authorization: 'Bearer ' + controlKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ id: profiles.profiles[1].id }) });
      assert.equal(switched.status, 200, await switched.clone().text());
    }
    const replies = await Promise.all(Array.from({ length: 6 }, (_, n) => request(n % 2 ? 'boards' : 'documents/' + id)));
    for (const response of replies) assert.equal(response.status, 200, await response.clone().text());
    const owner = await readBackendDescriptor(f.roots[index]);
    assert.notEqual(owner.instanceId, before[index].owner.instanceId);
    assert.equal(owner.version, f.current.version); assert.equal(owner.build, f.current.build);
    assert.equal(await verifyBackendReady(owner), true);
    assert.equal(await readFile(path.join(f.roots[index], 'notes/fixture.md'), 'utf8'), before[index].content);
    const access = await fetch(owner.url + '/capabilities', { headers: { Authorization: 'Bearer ' + before[index].reader } });
    assert.equal(access.status, 200); assert.equal((await access.json()).principal.name, 'Existing reader');
  }
  assert.equal(gateway.store.snapshot().profiles.length, 2);
});

for (const offset of [0, 1]) test(`desktop upgrade opt-in leaves ${offset ? 'newer-version' : 'same-version different-build'} owners untouched`, { timeout: 20000 }, async t => {
  const f = await fixture(t, offset), owner = await f.older.ensureRootBackend(f.roots[0]);
  await assert.rejects(ensureRootBackend(f.roots[0], { upgradeOlder: true }), { code: 'backend_version_mismatch' });
  assert.equal((await readBackendDescriptor(f.roots[0])).instanceId, owner.instanceId);
  assert.equal(await verifyBackendReady(owner), true);
});

test('ordinary callers keep explicit mismatch guidance and aborted desktop upgrade does not stop the old owner', { timeout: 20000 }, async t => {
  const f = await fixture(t), root = f.roots[0], owner = await f.older.ensureRootBackend(root);
  await assert.rejects(ensureRootBackend(root), { code: 'backend_version_mismatch' });
  const controller = new AbortController(); controller.abort();
  await assert.rejects(ensureRootBackend(root, { upgradeOlder: true, signal: controller.signal }), { code: 'backend_start_aborted' });
  assert.equal((await readBackendDescriptor(root)).instanceId, owner.instanceId);
  assert.equal(await verifyBackendReady(owner), true);
});

test('upgrade refuses corrupt registry state without stopping the authenticated old owner', { timeout: 20000 }, async t => {
  const f = await fixture(t), root = f.roots[0], owner = await f.older.ensureRootBackend(root);
  const file = path.join(root, '.jumpybrain/backend/connection.json'), original = await readFile(file, 'utf8');
  await writeFile(file, JSON.stringify({ ...owner, rootId: 'a'.repeat(64) }));
  try { await assert.rejects(ensureRootBackend(root, { upgradeOlder: true }), { code: 'backend_state_invalid' }); }
  finally { await writeFile(file, original); }
  assert.equal(await verifyBackendReady(owner), true);
});

test('upgrade cannot stop an endpoint whose authenticated readiness identity is wrong', { timeout: 10000 }, async t => {
  const f = await fixture(t), root = f.roots[0]; let stopRequests = 0;
  const olderIdentity = { ...f.current, version: '0.0.1', build: 'older-fixture' };
  const lease = await acquireBackendLease(root, olderIdentity);
  const server = createServer((request, response) => {
    if (request.url === '/_backend/stop') stopRequests++;
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ ...lease, instanceId: '00000000-0000-4000-8000-000000000000' }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  await publishBackendDescriptor({ ...lease, root, url: 'http://127.0.0.1:' + server.address().port, token: 'a'.repeat(64) });
  try {
    await assert.rejects(ensureRootBackend(root, { upgradeOlder: true }), { code: 'backend_identity_mismatch' });
    assert.equal(stopRequests, 0);
  } finally { await releaseBackendLease(root, lease.instanceId); await new Promise(resolve => server.close(resolve)); }
});


test('automatic upgrade leaves an explicitly hosted older foreground server listening', { timeout: 20000 }, async t => {
  const f = await fixture(t), root = f.roots[0];
  const reservation = createServer();
  await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port; await new Promise(resolve => reservation.close(resolve));
  const child = spawn(process.execPath, [path.join(f.runtime, 'dist/cli.js'), 'serve', '--root', root, '--host', '127.0.0.1', '--port', String(port), '--api-key', 'foreground-fixture-key'], { stdio: ['ignore', 'pipe', 'pipe'] });
  const ended = new Promise(resolve => child.once('exit', resolve));
  let output = '', errors = '';
  child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { errors += chunk; });
  f.finalizers.push(async () => { await stopRootBackend(root); await ended; });
  const deadline = Date.now() + 5000;
  while (!output.includes('server listening') && child.exitCode === null && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
  assert.match(output, /server listening/, errors);
  const owner = await readBackendDescriptor(root);
  await assert.rejects(ensureRootBackend(root, { upgradeOlder: true }), { code: 'backend_version_mismatch' });
  assert.equal((await readBackendDescriptor(root)).instanceId, owner.instanceId);
  assert.equal(await verifyBackendReady(owner), true);
  const response = await fetch('http://127.0.0.1:' + port + '/capabilities', { headers: { Authorization: 'Bearer foreground-fixture-key' } });
  assert.equal(response.status, 200);
  assert.equal(child.exitCode, null);
});


test('an exact-instance stop request cannot stop a replacement owner', { timeout: 10000 }, async t => {
  const f = await fixture(t), root = f.roots[0], owner = await ensureRootBackend(root);
  assert.deepEqual(await stopRootBackend(root, { expectedInstanceId: '00000000-0000-4000-8000-000000000000' }), { stopped: false });
  assert.equal((await readBackendDescriptor(root)).instanceId, owner.instanceId);
  assert.equal(await verifyBackendReady(owner), true);
});

test('separate concurrent desktop callers converge on one replacement owner', { timeout: 20000 }, async t => {
  const f = await fixture(t), root = f.roots[0], old = await f.older.ensureRootBackend(root);
  const replies = await Promise.all(Array.from({ length: 6 }, () => ensureRootBackend(root, { upgradeOlder: true })));
  assert.ok(replies.every(owner => owner.instanceId === replies[0].instanceId));
  assert.notEqual(replies[0].instanceId, old.instanceId);
  assert.equal(replies[0].version, f.current.version);
});

async function slowOwner(f, onStop = () => {}) {
  const root = f.roots[0]; let stopRequests = 0;
  const lease = await acquireBackendLease(root, { ...f.current, version: '0.0.1', build: 'slow-old-fixture' });
  const server = createServer((request, response) => {
    response.setHeader('Content-Type', 'application/json');
    if (request.url === '/_backend/stop') {
      stopRequests++; response.end('{"stopping":true}'); onStop();
    } else {
      // The known detached daemon readiness shape deliberately excludes lease.startedAt.
      const { startedAt, ...ready } = lease; response.end(JSON.stringify(ready));
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const descriptor = { ...lease, root, url: 'http://127.0.0.1:' + server.address().port, token: 'a'.repeat(64) };
  await publishBackendDescriptor(descriptor);
  f.finalizers.push(async () => { await releaseBackendLease(root, lease.instanceId); await new Promise(resolve => server.close(resolve)); });
  return { root, descriptor, stops: () => stopRequests };
}

test('slow authenticated drain times out without spawning a competing owner or forcing a kill', { timeout: 10000 }, async t => {
  const f = await fixture(t), old = await slowOwner(f); let spawns = 0;
  // Leave time for authenticated discovery under the full suite's I/O load;
  // the fixture never releases its lease, so drain must still time out.
  await assert.rejects(ensureRootBackend(old.root, { upgradeOlder: true, timeoutMs: 2000, spawn: async () => { spawns++; } }), { code: 'backend_stop_pending' });
  assert.equal(old.stops(), 1); assert.equal(spawns, 0);
  assert.equal((await readBackendDescriptor(old.root)).instanceId, old.descriptor.instanceId);
  assert.equal(await verifyBackendReady(old.descriptor), true);
});

test('cancellation after the graceful stop request leaves a draining owner alone', { timeout: 10000 }, async t => {
  const f = await fixture(t), controller = new AbortController();
  const old = await slowOwner(f, () => setTimeout(() => controller.abort(), 30)); let spawns = 0;
  await assert.rejects(ensureRootBackend(old.root, { upgradeOlder: true, signal: controller.signal, timeoutMs: 2000, spawn: async () => { spawns++; } }), { code: 'backend_start_aborted' });
  assert.equal(old.stops(), 1); assert.equal(spawns, 0);
  assert.equal((await readBackendDescriptor(old.root)).instanceId, old.descriptor.instanceId);
  assert.equal(await verifyBackendReady(old.descriptor), true);
});
