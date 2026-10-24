import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { installExtension } from '../dist/app/extensions/index.js';
import { createServerMemoryRuntime, startJumpyBrainHttpServer } from '../dist/server/index.js';
import { startCompanionGateway } from '../integrations/macos-companion/gateway.mjs';
const repo = path.resolve('.'), key = 'e'.repeat(64);
const id = 'mem_a0000000-0000-4000-8000-000000000001';
async function fixture(t, options = {}) {
  const temporary = await realpath(await mkdtemp(path.join(os.tmpdir(), 'jb-extension-http-')));
  const directory = path.join(temporary, 'support'), source = path.join(temporary, 'package'), root = path.join(temporary, 'brain');
  await mkdir(directory, { mode: 0o700 }); await mkdir(source);
  await createServerMemoryRuntime({ root }).initializeMemoryRoot();
  await writeFile(path.join(root, 'notes/fixture.md'), `---\nid: ${id}\ntype: note\ntitle: Fixture\n---\n# Saved content\n`);
  await writeFile(path.join(source, 'jumpybrain-extension.json'), JSON.stringify({ apiVersion: 1, id: 'http-fixture', name: 'HTTP fixture', version: '1.0.0', main: 'main.ts', ui: 'ui.ts', capabilities: ['memory.read', 'memory.write'] }));
  await writeFile(path.join(source, 'main.ts'), `export default function(api) {
    for (const method of ['read','search','create','update']) api.registerCommand({id:method,title:method,async handler(input,ctx){
      const result = await ctx.memory[method](input); return {message:JSON.stringify(result)};
    }});
    api.on('document.saved', async (event,ctx) => { try { await ctx.memory.create({type:'note',body:'denied',idempotencyKey:'event'}); } catch { await api.state.set('eventWriteDenied',true); } });
  }`);
  await writeFile(path.join(source, 'ui.ts'), 'export default function(api) {}');
  await installExtension({ directory: path.join(directory, 'extensions'), source });
  const credentials = { get: async () => 'remote-key', set: async () => {}, delete: async () => {} };
  const gateway = await startCompanionGateway({ runtimeRoot: repo, directory, initialRoot: root, port: 0, controlKey: key, credentials,
    localFactory: options => startJumpyBrainHttpServer({ ...options, autoIndex: false }), ...options });
  t.after(async () => { await gateway.close(); await rm(temporary, { recursive: true, force: true }); });
  const native = (route, body, extra = {}) => fetch(gateway.url + route, {
    method: body === undefined ? 'GET' : 'POST', headers: { Authorization: 'Bearer ' + key, 'X-Companion-Generation': String(gateway.coordinator.generation), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...extra },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const session = await native('/companion/session', { token: key });
  const cookie = session.headers.get('set-cookie').split(';')[0];
  const browser = (route, body, extra = {}, method) => fetch(gateway.url + route, {
    method: method ?? (body === undefined ? 'GET' : 'POST'), headers: { Cookie: cookie, Origin: gateway.url, 'X-Companion-Generation': String(gateway.coordinator.generation), 'X-Companion-Tab': 'tab', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...extra },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  await browser('/companion/register', { tabId: 'tab', generation: gateway.coordinator.generation });
  const invoke = (commandId, input, allowWrites = false) => browser('/companion/extensions/invoke', { extensionId: 'http-fixture', commandId, input, allowWrites });
  return { temporary, root, source, directory, gateway, browser, native, invoke };
}

test('real extension HTTP protocol preserves session/origin/generation admission and authenticated revisioned assets', async t => {
  const f = await fixture(t);
  assert.equal((await fetch(f.gateway.url + '/companion/extensions')).status, 401);
  assert.equal((await f.browser('/companion/extensions', undefined, { Origin: 'https://evil.invalid' })).status, 403);
  assert.equal((await f.browser('/companion/extensions', undefined, { 'X-Companion-Tab': 'unknown' })).status, 409);
  assert.equal((await f.native('/companion/extensions/manage', { action: 'reload' }, { 'X-Companion-Generation': '0' })).status, 409);
  const descriptors = await (await f.browser('/companion/extensions')).json();
  assert.equal(descriptors.extensions[0].status, 'active');
  assert.equal(JSON.stringify(descriptors).includes(f.source), false);
  const asset = descriptors.extensions[0].ui;
  assert.equal((await fetch(f.gateway.url + asset)).status, 401);
  // Script subresources carry the cookie, not custom generation/tab headers.
  const session = await f.native('/companion/session', { token: key });
  const script = await fetch(f.gateway.url + asset, { headers: { Cookie: session.headers.get('set-cookie').split(';')[0] } });
  assert.equal(script.status, 200); assert.match(await script.text(), /JumpyBrainExtensions/);
  assert.equal((await f.browser('/companion/extensions/manage', { action: 'install', source: f.source })).status, 400);
  const oldSignal = f.gateway.state().extensions;
  assert.deepEqual(Object.keys(oldSignal).sort(), ['revision', 'safeMode']);
  const disabled = await f.browser('/companion/extensions/manage', { action: 'disable', id: 'http-fixture' });
  assert.equal(disabled.status, 200); assert.notEqual(f.gateway.state().extensions.revision, oldSignal.revision);
  assert.equal((await f.browser(asset)).status, 404);
});

test('real scoped read/create/update retain optimistic conflicts, idempotency replay, saved/indexed outcomes and event write denial', async t => {
  const f = await fixture(t);
  const readResponse = await f.invoke('read', id); assert.equal(readResponse.status, 200);
  const read = JSON.parse((await readResponse.json()).message);
  assert.equal(read.id, id); assert.match(read.hash, /^sha256:/); assert.match(read.content, /Saved content/);
  assert.equal((await f.invoke('create', { type: 'note', title: 'Explicit', body: 'Created body', idempotencyKey: 'explicit-key' })).status, 403);
  const createInput = { type: 'note', title: 'Explicit', body: 'Created body', idempotencyKey: 'explicit-key' };
  const first = await f.invoke('create', createInput, true); assert.equal(first.status, 200, await first.clone().text());
  const created = JSON.parse((await first.json()).message);
  assert.equal(created.saved, true); assert.equal(created.indexing.status, 'pending');
  const replay = JSON.parse((await (await f.invoke('create', createInput, true)).json()).message);
  assert.equal(replay.id, created.id);
  const updated = await f.invoke('update', { id, content: read.content + '\nUpdated body\n', ifMatch: read.hash }, true);
  assert.equal(updated.status, 200, await updated.clone().text());
  const conflict = await f.invoke('update', { id, content: read.content + '\nStale\n', ifMatch: read.hash }, true);
  assert.equal(conflict.status, 412, await conflict.clone().text());
  assert.ok((await conflict.json()).error.code);
  const saved = await f.browser('/companion/extensions/event', { event: { type: 'document.saved', document: { id, title: 'UI metadata' } } });
  assert.equal(saved.status, 200);
  assert.equal(JSON.parse(await readFile(path.join(f.directory, 'extensions/state/http-fixture.json'), 'utf8')).eventWriteDenied, true);
});

test('remote extension memory requests use the selected target credential and enforce target read-only policy independently', async t => {
  const calls = [];
  const f = await fixture(t, { fetchImpl: async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify(url.endsWith('/status') ? { memory: 'all' } : { content: 'Remote body', contentHash: 'sha256:' + 'b'.repeat(64) }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } });
  const state = await (await f.native('/companion/profiles', { profile: { name: 'Remote', kind: 'remote', url: 'https://brain.example', key: 'remote-key', allowWrites: false }, revision: f.gateway.store.snapshot().revision })).json();
  const remoteId = state.profiles.find(profile => profile.kind === 'remote').id;
  await f.browser('/companion/unregister', { tabId: 'tab', generation: f.gateway.coordinator.generation });
  assert.equal((await f.native('/companion/switch', { id: remoteId })).status, 200);
  await f.browser('/companion/register', { tabId: 'tab', generation: f.gateway.coordinator.generation });
  assert.equal((await f.invoke('read', id)).status, 200);
  const read = calls.find(call => call.url === 'https://brain.example/memories/all/documents/' + id);
  assert.equal(read.options.headers.Authorization, 'Bearer remote-key'); assert.ok(read.options.signal);
  const before = calls.length;
  assert.equal((await f.invoke('create', { type: 'note', title: 'Blocked', body: 'body', idempotencyKey: 'key' }, true)).status, 403);
  assert.equal(calls.length, before);
});

const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
async function until(callback) {
  for (let attempt = 0; attempt < 100; attempt++) { if (callback()) return; await new Promise(resolve => setTimeout(resolve, 5)); }
  throw new Error('Expected gateway state did not settle.');
}

test('real target forwarding links invocation cancellation and deadlines through response consumption', async t => {
  for (const action of ['client-abort', 'disable', 'deadline']) await t.test(action, async t => {
    const started = deferred(); let aborted = false;
    const f = await fixture(t, { targetTimeoutMs: action === 'deadline' ? 30 : 1000, fetchImpl: async (_url, options) => {
      const stream = new ReadableStream({ start(controller) {
        controller.enqueue(Buffer.from('{"content":"pending'));
        options.signal.addEventListener('abort', () => { aborted = true; controller.error(new Error('cancelled target response')); }, { once: true });
      } });
      started.resolve();
      return new Response(stream, { status: 200, headers: { 'Content-Type': 'application/json' } });
    } });
    const controller = new AbortController();
    const response = fetch(f.gateway.url + '/companion/extensions/invoke', { method: 'POST', signal: controller.signal,
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', 'X-Companion-Generation': String(f.gateway.coordinator.generation) },
      body: JSON.stringify({ extensionId: 'http-fixture', commandId: 'read', input: id }),
    });
    void response.catch(() => {}); await started.promise;
    assert.ok(f.gateway.coordinator.inFlight > 0);
    if (action === 'client-abort') controller.abort();
    if (action === 'disable') assert.equal((await f.native('/companion/extensions/manage', { action: 'disable', id: 'http-fixture' })).status, 200);
    if (action === 'client-abort') await assert.rejects(response);
    else assert.equal((await response).status, action === 'deadline' ? 504 : 409);
    await until(() => f.gateway.coordinator.inFlight === 0);
    assert.equal(aborted, true);
  });
});

test('cancelled destination resolution drains its captured scope and never forwards after credentials settle', async t => {
  const started = deferred(), release = deferred(); let blocked = false, forwarded = 0;
  const credentials = { get: async () => { if (blocked) { started.resolve(); await release.promise; } return 'remote-key'; }, set: async () => {}, delete: async () => {} };
  const f = await fixture(t, { credentials, fetchImpl: async (url) => { forwarded++; return new Response(JSON.stringify(url.endsWith('/status') ? { memory: 'all' } : {})); } });
  const state = await (await f.native('/companion/profiles', { profile: { name: 'Remote', kind: 'remote', url: 'https://brain.example', key: 'remote-key', allowWrites: false }, revision: f.gateway.store.snapshot().revision })).json();
  const remoteId = state.profiles.find(profile => profile.kind === 'remote').id;
  await f.browser('/companion/unregister', { tabId: 'tab', generation: f.gateway.coordinator.generation });
  assert.equal((await f.native('/companion/switch', { id: remoteId })).status, 200);
  await f.browser('/companion/register', { tabId: 'tab', generation: f.gateway.coordinator.generation });
  blocked = true; const before = forwarded;
  const invocation = f.invoke('read', id); await started.promise;
  assert.equal((await f.native('/companion/extensions/manage', { action: 'disable', id: 'http-fixture' })).status, 200);
  assert.ok(f.gateway.coordinator.inFlight > 0, 'credential settlement remains inside the admitted drain');
  release.resolve(); assert.equal((await invocation).status, 409);
  await until(() => f.gateway.coordinator.inFlight === 0);
  assert.equal(forwarded, before);
});
