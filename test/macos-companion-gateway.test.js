import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, readFile, writeFile, rm, realpath, symlink } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import { createServer as createHttpsServer } from 'node:https';
import os from 'node:os';
import path from 'node:path';
import { createServer, request as httpRequest } from 'node:http';
import { PassThrough } from 'node:stream';
import { startCompanionGateway, nativeCredentials } from '../integrations/macos-companion/gateway.mjs';
import { SwitchCoordinator } from '../integrations/macos-companion/switch-coordinator.mjs';
import { createServerMemoryRuntime, startJumpyBrainHttpServer } from '../dist/server/index.js';

const runtimeRoot = path.resolve('.');
const controlKey = 'a'.repeat(64);
const id = 'mem_a0000000-0000-4000-8000-000000000001';
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(callback) { for (let i = 0; i < 200; i++) { if (callback()) return; await pause(5); } throw new Error('condition timed out'); }
async function fixture(t, options = {}) {
  const temporary = await realpath(await mkdtemp(path.join(os.tmpdir(), 'jb-connections-gateway-')));
  const directory = path.join(temporary, 'support'); await mkdir(directory, { mode: 0o700 });
  const roots = [];
  for (const name of ['a','b','remote']) {
    const root = path.join(temporary, name);
    const runtime = createServerMemoryRuntime({ root }); await runtime.initializeMemoryRoot();
    await writeFile(path.join(root, 'notes', 'fixture.md'), `---\nid: ${id}\ntype: note\ntitle: Fixture ${name}\n---\nBody ${name}\n`);
    roots.push(root);
  }
  const keys = new Map();
  const credentials = { get: async (ref) => keys.get(ref) ?? null, set: async (ref, key) => { keys.set(ref, key); }, delete: async (ref) => { keys.delete(ref); }, selectFolder: async () => roots[1] };
  const remote = await startJumpyBrainHttpServer({ root: roots[2], apiKeys: ['remote-test-key'], port: 0, autoIndex: false });
  const gateway = await startCompanionGateway({ runtimeRoot, directory, initialRoot: roots[0], port: 0, controlKey, credentials, switchTimeoutMs: 2000, ...options });
  let cookie;
  const native = async (route, body, headers = {}) => fetch(gateway.url + route, {
    method: body === undefined ? 'GET' : 'POST', headers: { Authorization: 'Bearer ' + controlKey, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const browser = async (route, body, headers = {}, method) => fetch(gateway.url + route, {
    method: method || (body === undefined ? 'GET' : 'POST'), headers: { Cookie: cookie || '', Origin: gateway.url, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const session = await browser('/companion/session', { token: controlKey }); assert.equal(session.status, 200);
  cookie = session.headers.get('set-cookie').split(';')[0];
  const save = async (profile) => {
    const response = await native('/companion/profiles', { profile, revision: gateway.store.snapshot().revision });
    assert.equal(response.status, 200, await response.clone().text());
    return response.json();
  };
  const memory = (route, body, tab = 'tab-a', generation = gateway.coordinator.generation, method) => browser('/memories/all/' + route, body,
    { 'X-Companion-Generation': String(generation), 'X-Companion-Tab': tab }, method);
  t.after(async () => { await gateway.close(); if (remote.server.listening) await remote.close(); await rm(temporary, { recursive: true, force: true }); });
  return { temporary, directory, roots, keys, credentials, gateway, remote, native, browser, save, memory };
}

test('coordinator requires every positive ack, drains scopes, fences old writes and crash sessions', async () => {
  const coordinator = new SwitchCoordinator({ timeoutMs: 40 });
  const generation = coordinator.generation;
  coordinator.register('one', generation); coordinator.register('two', generation);
  let activated = false;
  const finish = coordinator.enter(generation, 'one');
  const operation = coordinator.switch('new', async () => { activated = true; });
  const switchId = coordinator.pending.id;
  coordinator.acknowledge('one', switchId, true); coordinator.acknowledge('two', switchId, true);
  assert.equal(activated, false);
  assert.throws(() => coordinator.enter(generation, 'one'), /confirmed/);
  finish(); await operation;
  assert.equal(activated, true); assert.equal(coordinator.generation, generation + 1);
  assert.doesNotThrow(() => coordinator.poll('one', generation));
  assert.throws(() => coordinator.enter(generation, 'one'), /old brain/);
  const restarted = new SwitchCoordinator();
  assert.throws(() => restarted.poll('one', generation), /old brain/);
  coordinator.register('sleeping', coordinator.generation);
  await assert.rejects(coordinator.switch('another', async () => {}), /did not confirm/);
  assert.equal(coordinator.state().phase, 'idle');
});

test('negative ack, leaving tab, competing switch and persistence failure retain generation', async () => {
  const coordinator = new SwitchCoordinator({ timeoutMs: 50 });
  const gen = coordinator.generation; coordinator.register('tab', gen);
  let operation = coordinator.switch('b', async () => {});
  await assert.rejects(coordinator.switch('c', async () => {}), /Another/);
  coordinator.acknowledge('tab', coordinator.pending.id, false); await assert.rejects(operation, /unsaved/);
  operation = coordinator.switch('b', async () => {});
  coordinator.unregister('tab', gen); await assert.rejects(operation, /closed/);
  await assert.rejects(coordinator.switch('b', async () => { throw new Error('disk'); }), /disk/);
  assert.equal(coordinator.generation, gen);
});

test('gateway serves secret-free settings, rejects unauthenticated/control CSRF and unsafe operations', async (t) => {
  const f = await fixture(t);
  const shell = await fetch(f.gateway.url + '/settings'); const html = await shell.text();
  assert.equal(shell.status, 200); assert.match(html, /Brain connections/); assert.ok(!html.includes(controlKey));
  assert.match(shell.headers.get('content-security-policy'), /connect-src 'self'/);
  assert.equal((await fetch(f.gateway.url + '/companion/state')).status, 401);
  assert.equal((await fetch(f.gateway.url + '/companion/session', { method: 'POST', headers: { Origin: 'https://evil.invalid', 'Content-Type': 'application/json' }, body: JSON.stringify({ token: controlKey }) })).status, 403);
  const hostStatus = await new Promise((resolve, reject) => {
    const request = httpRequest(f.gateway.url + '/settings', { headers: { Host: 'evil.invalid' } }, (response) => { response.resume(); resolve(response.statusCode); });
    request.on('error', reject); request.end();
  });
  assert.equal(hostStatus, 403);
  assert.equal((await f.browser('/companion/profiles', { profile: {} })).status, 409);
  assert.equal((await f.memory('recent')).status, 409);
  assert.equal((await f.native('/memories/all/not-supported')).status, 404);
  const response = await f.native('/companion/select-folder', {}); assert.deepEqual(await response.json(), { path: f.roots[1] });
});

test('local A/B switching saves old target, blocks stale writes, and reports new state to acknowledged tabs', async (t) => {
  const f = await fixture(t);
  const initial = f.gateway.state(); const oldGen = initial.generation;
  const saved = await f.save({ name: 'Local B', kind: 'local', root: f.roots[1] });
  const b = saved.profiles.find((profile) => profile.name === 'Local B');
  assert.equal((await f.browser('/companion/register', { tabId: 'tab-a', generation: oldGen })).status, 200);
  const read = await f.memory('documents/' + id); const doc = await read.json(); assert.match(doc.content, /Body a/);
  const operation = f.native('/companion/switch', { id: b.id });
  await until(() => f.gateway.coordinator.pending);
  const update = await f.memory('documents/' + id, { content: doc.content.replace('Body a', 'Saved on A') }, 'tab-a', oldGen, 'PUT');
  // Preserve If-Match protocol: retry the explicit request with the loaded hash.
  assert.equal(update.status, 428);
  const put = await f.browser('/memories/all/documents/' + id, { content: doc.content.replace('Body a', 'Saved on A') },
    { 'X-Companion-Generation': String(oldGen), 'X-Companion-Tab': 'tab-a', 'If-Match': doc.contentHash }, 'PUT');
  assert.equal(put.status, 200, await put.clone().text());
  assert.equal((await f.browser('/companion/ack', { tabId: 'tab-a', switchId: f.gateway.coordinator.pending.id, ok: true })).status, 200);
  assert.equal((await operation).status, 200);
  const polled = await f.browser('/companion/poll', { tabId: 'tab-a', generation: oldGen }); assert.equal(polled.status, 200);
  assert.equal((await polled.json()).activeId, b.id);
  assert.equal((await f.memory('documents/' + id, undefined, 'tab-a', oldGen)).status, 409);
  assert.match(await readFile(path.join(f.roots[0], 'notes/fixture.md'), 'utf8'), /Saved on A/);
  assert.match(await readFile(path.join(f.roots[1], 'notes/fixture.md'), 'utf8'), /Body b/);
  assert.equal((await f.browser('/companion/register', { tabId: 'tab-b', generation: f.gateway.coordinator.generation })).status, 200);
  assert.match((await (await f.memory('documents/' + id, undefined, 'tab-b')).json()).content, /Body b/);
});

test('remote profile keys stay out of state/file/browser, read-only writes blocked; offline selection persists', async (t) => {
  const f = await fixture(t);
  const saved = await f.save({ name: 'Remote', kind: 'remote', url: f.remote.url, key: 'remote-test-key' });
  const remote = saved.profiles.find((profile) => profile.kind === 'remote');
  assert.equal(remote.allowWrites, false); assert.ok(!('credentialRef' in remote));
  assert.equal((await f.native('/companion/switch', { id: remote.id })).status, 200);
  const gen = f.gateway.coordinator.generation;
  await f.browser('/companion/register', { tabId: 'tab-a', generation: gen });
  const read = await f.memory('documents/' + id); assert.match((await read.json()).content, /Body remote/);
  assert.equal((await f.memory('notes', { type: 'note', body: '', dailyDate: '2026-01-01' })).status, 403);
  assert.equal((await f.memory('documents/' + id, { apply: true }, 'tab-a', gen, 'DELETE')).status, 403);
  assert.ok(!(await readFile(path.join(f.directory, 'connections.json'), 'utf8')).includes('remote-test-key'));
  assert.ok(!JSON.stringify(await (await f.native('/companion/state')).json()).includes('remote-test-key'));
  f.gateway.coordinator.unregister('tab-a', gen);
  const allowed = await f.save({ id: remote.id, name: 'Remote', kind: 'remote', url: f.remote.url, allowWrites: true });
  assert.equal(allowed.active.allowWrites, true);
  const newGen = f.gateway.coordinator.generation; await f.browser('/companion/register', { tabId: 'tab-a', generation: newGen });
  const created = await f.browser('/memories/all/notes', { type: 'note', body: '', dailyDate: '2026-01-01' },
    { 'X-Companion-Generation': String(newGen), 'X-Companion-Tab': 'tab-a', 'Idempotency-Key': 'companion-test-remote-create-1' });
  assert.equal(created.status, 200, await created.clone().text());
  f.gateway.coordinator.unregister('tab-a', newGen);
  await f.remote.close();
  const snapshot = await (await f.native('/companion/state')).json();
  // Probe result can be cached for two seconds; selected identity is never changed.
  assert.equal(snapshot.activeId, remote.id);
  assert.equal(f.gateway.store.snapshot().activeId, remote.id);
});

test('empty gateway can save its first profile; replacing its destination invalidates old link identity', async (t) => {
  const f = await fixture(t, { initialRoot: undefined });
  assert.equal(f.gateway.state().activeId, null);
  const first = await f.save({ name: 'First', kind: 'local', root: f.roots[0] });
  assert.ok(first.activeId);
  const generation = f.gateway.coordinator.generation;
  const changed = await f.save({ id: first.activeId, name: 'Replacement', kind: 'local', root: f.roots[1] });
  assert.notEqual(changed.activeId, first.activeId);
  assert.equal(f.gateway.store.get(first.activeId), undefined);
  assert.equal(f.gateway.coordinator.generation, generation + 1);
  const read = await f.native('/memories/all/documents/' + id, undefined, { 'X-Companion-Generation': String(changed.generation) });
  assert.match((await read.json()).content, /Body b/);
});

test('gateway switch timeout retains active brain and shutdown drains requests', async (t) => {
  const f = await fixture(t, { switchTimeoutMs: 30 });
  const saved = await f.save({ name: 'B', kind: 'local', root: f.roots[1] });
  const b = saved.profiles.find((profile) => profile.name === 'B'); const initial = f.gateway.state();
  await f.browser('/companion/register', { tabId: 'sleep', generation: initial.generation });
  const response = await f.native('/companion/switch', { id: b.id }); assert.equal(response.status, 409);
  assert.equal(f.gateway.state().activeId, initial.activeId); assert.equal(f.gateway.state().generation, initial.generation);
});

test('gateway never follows redirects or exposes target credentials; missing Keychain stays offline', async (t) => {
  const f = await fixture(t);
  let received = 0;
  const redirect = createServer((request, response) => { received++; response.writeHead(302, { Location: 'http://127.0.0.1:1/' }); response.end(); });
  await new Promise((resolve) => redirect.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => redirect.close(resolve)));
  const url = 'http://127.0.0.1:' + redirect.address().port;
  const saved = await f.save({ name: 'Redirect', kind: 'remote', url, key: 'private-redirect-key' });
  const target = saved.profiles.find((profile) => profile.name === 'Redirect');
  await f.native('/companion/switch', { id: target.id });
  const gen = f.gateway.coordinator.generation; await f.browser('/companion/register', { tabId: 'tab-a', generation: gen });
  const response = await f.memory('recent'); assert.equal(response.status, 502); assert.ok(received > 0);
  assert.ok(!(await response.text()).includes('private-redirect-key'));
  f.keys.clear(); const missing = await f.memory('recent'); assert.equal(missing.status, 503);
  assert.equal((await missing.json()).error.code, 'credential_unavailable');
});

test('invalid TLS certificates fail closed before target credentials or requests are sent', async (t) => {
  const f = await fixture(t);
  const keyPath = path.join(f.temporary, 'fixture-tls.key'), certPath = path.join(f.temporary, 'fixture-tls.cert');
  const generated = spawnSync('openssl', ['req','-x509','-newkey','rsa:2048','-nodes','-keyout',keyPath,'-out',certPath,'-subj','/CN=localhost','-days','1'], { stdio: 'ignore' });
  if (generated.error?.code === 'ENOENT') { t.skip('openssl is unavailable for the disposable invalid-TLS fixture'); return; }
  assert.equal(generated.status, 0);
  let received = 0;
  const upstream = createHttpsServer({ key: await readFile(keyPath), cert: await readFile(certPath) }, (request, response) => { received++; response.end('{}'); });
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => upstream.close(resolve)));
  const saved = await f.save({ name: 'Invalid TLS', kind: 'remote', url: 'https://127.0.0.1:' + upstream.address().port, key: 'fixture-tls-target-key' });
  const profile = saved.profiles.find((item) => item.name === 'Invalid TLS');
  const switched = await f.native('/companion/switch', { id: profile.id }); assert.equal(switched.status, 200);
  assert.equal(f.gateway.state().health, 'offline'); assert.equal(received, 0);
  const response = await f.native('/memories/all/recent', undefined, { 'X-Companion-Generation': String(f.gateway.coordinator.generation) });
  assert.equal(response.status, 503); assert.equal(received, 0);
  assert.doesNotMatch(await response.text(), /fixture-tls-target-key|\.key|\.cert/);
});

test('standalone gateway starts through an entrypoint symlink and shuts down its listener', async (t) => {
  const f = await fixture(t);
  const entry = path.join(f.temporary, 'aliased-gateway.mjs');
  await symlink(path.join(runtimeRoot, 'integrations/macos-companion/gateway.mjs'), entry);
  const support = path.join(f.temporary, 'standalone'); await mkdir(support, { mode: 0o700 });
  const probe = createServer(); await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port; await new Promise((resolve) => probe.close(resolve));
  const child = spawn(process.execPath, [entry, runtimeRoot, support, f.roots[0], String(port)], {
    env: { ...process.env, JUMPYBRAIN_SERVER_API_KEYS: controlKey }, stdio: ['pipe','pipe','pipe'],
  });
  const exited = new Promise((resolve) => child.once('exit', resolve));
  try {
    let ready = false;
    for (let i = 0; i < 150; i++) {
      assert.equal(child.exitCode, null, 'entrypoint must not silently skip standalone startup');
      try { ready = (await fetch('http://127.0.0.1:' + port + '/health')).status === 200; } catch {}
      if (ready) break; await pause(10);
    }
    assert.equal(ready, true);
  } finally { child.kill('SIGTERM'); await exited; }
  await assert.rejects(fetch('http://127.0.0.1:' + port + '/health'));
});

test('native pipe RPC correlates responses without credentials in errors and fails closed on unknown frames', async () => {
  const input = new PassThrough(), output = new PassThrough();
  const credentials = nativeCredentials(input, output, { timeoutMs: 40 });
  let frame;
  output.once('data', (chunk) => { frame = JSON.parse(chunk); });
  const result = credentials.get('opaque-reference');
  assert.equal(frame.operation, 'get');
  input.write(JSON.stringify({ id: frame.id, result: 'test-private-key' }) + '\n');
  assert.equal(await result, 'test-private-key');
  const denied = credentials.get('another'); input.write('{"id":"unknown","result":"secret"}\n');
  await assert.rejects(denied, (error) => !error.message.includes('secret') && error.code === 'credential_unavailable');
  credentials.close();
});


test('gateway forwards guarded deletion and fences old-generation deletion', async t => {
  const f = await fixture(t);
  const generation = f.gateway.coordinator.generation;
  await f.browser('/companion/register', { tabId: 'delete-tab', generation });
  const preview = await (await f.memory('documents/' + id + '?deletePreview=1', undefined, 'delete-tab', generation)).json();
  assert.equal(preview.permanent, true);
  const headers = { 'X-Companion-Generation': String(generation), 'X-Companion-Tab': 'delete-tab', 'If-Match': preview.contentHash };
  const stale = await f.browser('/memories/all/documents/' + id, { apply: true }, { ...headers, 'X-Companion-Generation': String(generation - 1) }, 'DELETE');
  assert.equal(stale.status, 409);
  const removed = await f.browser('/memories/all/documents/' + id, { apply: true }, headers, 'DELETE');
  assert.equal(removed.status, 200, await removed.clone().text());
  assert.equal((await removed.json()).removed, true);
  assert.match(await readFile(path.join(f.roots[1], 'notes/fixture.md'), 'utf8'), /Body b/);
});
