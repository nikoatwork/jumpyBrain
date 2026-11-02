import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, realpath, writeFile, readFile, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import path from 'node:path';
import { initializeMemoryRoot } from '../dist/index.js';
import { readBackendDescriptor, currentBackendIdentity } from '../dist/adapters/backend-host/index.js';
import { stopRootBackend, ensureRootBackend } from '../dist/app/backend-host/index.js';
import { startCompanionGateway } from '../integrations/macos-companion/gateway.mjs';
const run = promisify(execFile);
const id = 'mem_11111111-1111-4111-8111-111111111111';
const controlKey = 'b'.repeat(64);
const cli = async (root, ...args) => JSON.parse((await run(process.execPath, ['dist/cli.js', ...args, '--root', root, '--json'])).stdout);

test('production gateway rediscovers the CLI replacement backend without changing browser scope', { timeout: 30000 }, async t => {
  const temporary = await realpath(await mkdtemp(path.join(os.tmpdir(), 'jb-backend-reconnect-')));
  const root = path.join(temporary, 'brain'), directory = path.join(temporary, 'support');
  await initializeMemoryRoot(root); await mkdir(directory, { mode: 0o700 });
  const file = path.join(root, 'notes/fixture.md');
  await writeFile(file, `---\nid: ${id}\ntype: note\ntitle: Restart marker\n---\nCanonical restart evidence.\n`);
  const original = await readFile(file, 'utf8');
  const gateway = await startCompanionGateway({ runtimeRoot: process.cwd(), directory, initialRoot: root, port: 0, controlKey, identityFile: path.join(temporary, 'identity.json'), credentials: { get: async () => null } });
  t.after(async () => { await gateway.close(); await stopRootBackend(root).catch(() => {}); await rm(temporary, { recursive: true, force: true }); });
  const generation = gateway.coordinator.generation, profile = gateway.state().activeId;
  const request = (route, body) => fetch(gateway.url + '/memories/all/' + route, { method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + controlKey, 'X-Companion-Generation': String(generation), 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  assert.equal((await request('documents/' + id)).status, 200);
  const before = await readBackendDescriptor(root);
  assert.equal((await cli(root, 'backend', 'stop')).stopped, true);
  await cli(root, 'recall', '--query', 'restart evidence', '--limit', '1');
  const after = await readBackendDescriptor(root);
  assert.notEqual(after.instanceId, before.instanceId);
  assert.notEqual(after.url, before.url);
  assert.notEqual(after.token, before.token);
  const resumed = await request('documents/' + id);
  assert.equal(resumed.status, 200, await resumed.clone().text());
  assert.equal((await resumed.json()).content, original);
  assert.equal((await request('boards')).status, 200);
  assert.equal((await request('search', { query: 'restart', limit: 5 })).status, 200);
  assert.equal(gateway.coordinator.generation, generation);
  assert.equal(gateway.state().activeId, profile);
  assert.equal(await readFile(file, 'utf8'), original);
});

async function fixture(t, options = {}) {
  const temporary = await realpath(await mkdtemp(path.join(os.tmpdir(), 'jb-reconnect-guard-')));
  const root = path.join(temporary, 'brain'), directory = path.join(temporary, 'support');
  await initializeMemoryRoot(root); await mkdir(directory, { mode: 0o700 });
  const gateway = await startCompanionGateway({ runtimeRoot: process.cwd(), directory, initialRoot: root, port: 0, controlKey, credentials: { get: async () => null }, identityFile: path.join(temporary, 'identity.json'), ...options });
  t.after(async () => { await gateway.close(); await stopRootBackend(root).catch(() => {}); await rm(temporary, { recursive: true, force: true }); });
  const request = (route, options = {}) => fetch(gateway.url + '/memories/all/' + route, { ...options, headers: { Authorization: 'Bearer ' + controlKey, 'X-Companion-Generation': String(gateway.coordinator.generation), 'Content-Type': 'application/json' } });
  return { root, temporary, gateway, request };
}

test('cached local ownership rejects corrupt, foreign and stale descriptors before forwarding', async t => {
  const f = await fixture(t);
  assert.equal((await f.request('status')).status, 200);
  const descriptor = await readBackendDescriptor(f.root), file = path.join(f.root, '.jumpybrain/backend/connection.json');
  for (const changed of [{ ...descriptor, rootId: 'a'.repeat(64) }, { ...descriptor, build: 'foreign-build' }, { ...descriptor, instanceId: '00000000-0000-4000-8000-000000000000' }]) {
    await writeFile(file, JSON.stringify(changed));
    const response = await f.request('status');
    assert.equal(response.status, 503);
    assert.doesNotMatch(await response.text(), new RegExp(descriptor.token));
    await writeFile(file, JSON.stringify(descriptor));
    assert.equal((await f.request('status')).status, 200);
  }
});

test('replacement of the selected directory at the same path fails closed', async t => {
  const { rename } = await import('node:fs/promises');
  const f = await fixture(t);
  assert.equal((await f.request('status')).status, 200);
  await stopRootBackend(f.root);
  await rename(f.root, f.root + '-old'); await initializeMemoryRoot(f.root);
  const response = await f.request('status');
  assert.equal(response.status, 503); assert.match(await response.text(), /folder.*changed/);
  assert.equal(await readBackendDescriptor(f.root), undefined, 'must not start a writer in the replaced folder');
});

test('retired HTTP replies are fenced and a failed mutation is never replayed', async t => {
  let owner = 1, calls = 0, release, arrived;
  const waiting = new Promise(resolve => { arrived = resolve; });
  const f = await fixture(t, {
    localFactory: async () => { const captured = owner; return { url: 'http://127.0.0.1:1', current: async () => captured === owner, close: async () => {} }; },
    fetchImpl: async (url, options) => {
      if (url.endsWith('/notes')) { calls++; arrived(); await new Promise(resolve => { release = resolve; }); return new Response('{"oldBackendReply":true}'); }
      return new Response('{"memory":"all"}');
    },
  });
  const pending = f.request('notes', { method: 'POST', body: '{}' }); await waiting;
  owner = 2; assert.equal((await f.request('status')).status, 200); release();
  const response = await pending; assert.equal(response.status, 409); assert.match(await response.text(), /backend_replaced/);
  assert.equal(calls, 1);
});

test('an unavailable replacement fails clearly and retries one startup per request', async t => {
  let attempts = 0;
  const f = await fixture(t, { localFactory: async () => { attempts++; throw new Error('private bootstrap failure'); } });
  for (let index = 0; index < 2; index++) {
    const response = await f.request('status'); assert.equal(response.status, 503);
    assert.doesNotMatch(await response.text(), /private bootstrap failure/);
  }
  assert.equal(attempts, 2);
});


test('a live backend incompatible with the gateway build returns update guidance without replacing its owner', async t => {
  const f = await fixture(t, { localFactory: async options => ensureRootBackend(options.root, { signal: options.signal, identity: { ...await currentBackendIdentity(), build: 'incompatible-gateway-build' } }) });
  const owner = await ensureRootBackend(f.root);
  const response = await f.request('status');
  assert.equal(response.status, 503);
  assert.match(await response.text(), /backend_version_mismatch.*update the app and CLI together/);
  assert.equal((await readBackendDescriptor(f.root)).instanceId, owner.instanceId);
});

test('a disconnected mutation is not replayed while the next deliberate read reconnects', async t => {
  let starts = 0, writes = 0;
  const f = await fixture(t, {
    localFactory: async () => { starts++; return { url: 'http://127.0.0.1:1', close: async () => {} }; },
    fetchImpl: async url => { if (url.endsWith('/notes')) { writes++; throw new Error('ambiguous transport failure'); } return new Response('{"memory":"all"}'); },
  });
  const response = await f.request('notes', { method: 'POST', body: '{}' });
  assert.equal(response.status, 503); assert.equal(writes, 1); assert.equal(starts, 1);
  assert.equal((await f.request('status')).status, 200);
  assert.equal(writes, 1); assert.equal(starts, 2);
});
