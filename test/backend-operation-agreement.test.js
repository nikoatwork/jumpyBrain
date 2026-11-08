import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, writeFile, rm, realpath } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { startJumpyBrainHttpServer } from '../dist/adapters/http-server/index.js';
import { initializeMemoryRoot } from '../dist/runtime/index.js';
import { ensureRootBackend, stopRootBackend } from '../dist/app/backend-host/index.js';
import { callBackend } from '../dist/app/backend-rpc.js';
import { localBackendCall } from '../dist/cli/local-transport.js';
import { backendDocumentPrecondition } from '../dist/adapters/backend-protocol.js';

const id = 'mem_12345678-1234-1234-1234-123456789abc';
async function fixture(t) {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'jb-operation-agreement-')));
  t.after(async () => { await stopRootBackend(root); await rm(root, { recursive: true, force: true }); });
  await initializeMemoryRoot(root);
  const file = path.join(root, 'notes', 'agreement.md');
  await writeFile(file, `---\nid: ${id}\ntype: note\ntitle: Agreement\ncustom: protected\n---\nbody\n`);
  return { root, file };
}

test('typed private calls reject unknown methods, invalid tuples and wrong result assumptions', () => {
  const fixture = new URL('./fixtures/backend-operation-types.ts', import.meta.url).pathname;
  const config = ts.readConfigFile(new URL('../tsconfig.json', import.meta.url).pathname, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, new URL('..', import.meta.url).pathname);
  const program = ts.createProgram([fixture], { ...parsed.options, rootDir: undefined, noEmit: true });
  const diagnostics = ts.getPreEmitDiagnostics(program);
  assert.equal(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCurrentDirectory: ts.sys.getCurrentDirectory, getCanonicalFileName: file => file, getNewLine: () => '\n',
  }));
});

test('guarded private updates, attention and deletion preserve canonical bytes, aliases and stale rejection', async t => {
  const { root, file } = await fixture(t);
  const before = await localBackendCall(root, 'readMemoryDocument', [id]);
  const updated = await localBackendCall(root, 'updateMemoryDocument', [id, before.content + 'next\n', { contentHash: before.contentHash }]);
  assert.equal(updated.oldContentHash, before.contentHash);
  const attention = await localBackendCall(root, 'patchMemoryDocumentAttention', [id, { ifMatch: updated.newContentHash, mutation: { action: 'settle' } }]);
  assert.equal(attention.frontmatter.custom, 'protected');
  assert.equal(attention.frontmatter.attention_at, null);
  assert.equal(attention.contentHash, attention.newContentHash);
  assert.equal(attention.oldContentHash, updated.newContentHash);
  assert.equal(attention.indexed, false);
  assert.deepEqual(attention.indexing, { status: 'pending' });
  assert.equal(Object.hasOwn(attention, 'updatedAt'), false);
  const canonical = await readFile(file, 'utf8');
  assert.equal(attention.content, canonical);
  for (const [method, args] of [
    ['patchMemoryDocumentAttention', [id, { ifMatch: before.contentHash, mutation: { action: 'reactivate' } }]],
    ['deleteMemoryDocument', [id, { ifMatch: before.contentHash, apply: true }]],
  ]) {
    await assert.rejects(localBackendCall(root, method, args), { code: 'precondition_failed' });
    assert.equal(await readFile(file, 'utf8'), canonical);
  }
  const deleted = await localBackendCall(root, 'deleteMemoryDocument', [id, { ifMatch: attention.newContentHash, apply: true }]);
  assert.equal(deleted.removed, true);
  assert.equal(deleted.oldContentHash, attention.newContentHash);
  await assert.rejects(readFile(file), { code: 'ENOENT' });
});

test('legacy guard precedence still accepts extra positional fields without broadening guarded methods', () => {
  for (const method of ['updateMemoryDocument', 'patchMemoryDocumentAttention', 'deleteMemoryDocument']) {
    assert.deepEqual(backendDocumentPrecondition(method, [id, { ifMatch: 'second' }, { ifMatch: 'third', contentHash: 'alias' }]), { id, ifMatch: 'third' });
    assert.deepEqual(backendDocumentPrecondition(method, [id, { ifMatch: 'second' }, { contentHash: 'alias' }]), { id, ifMatch: 'alias' });
    assert.deepEqual(backendDocumentPrecondition(method, [id, { ifMatch: 'second' }]), { id, ifMatch: 'second' });
  }
  assert.equal(backendDocumentPrecondition('rememberMemory', []), undefined);
  assert.equal(backendDocumentPrecondition('unknown', []), undefined);
});

test('derived dispatch replaces serialized signals with host cancellation at every supported option slot', async t => {
  const { root } = await fixture(t);
  const saved = await callBackend(root, 'rememberMemory', [{ type: 'note', title: 'Saved first', body: 'Unique saved evidence.' }]);
  assert.equal(saved.saved, true);
  for (const [method, args] of [
    ['indexMemory', [{ signal: { aborted: false } }]],
    ['ensureSavedMemoryIndexed', [saved, { signal: { aborted: false } }]],
    ['searchMemory', ['evidence', 5, { signal: { aborted: false } }]],
    ['compactSearchMemory', ['evidence', 5, { signal: { aborted: false } }]],
  ]) {
    if (method === 'ensureSavedMemoryIndexed') {
      const result = await callBackend(root, method, args, AbortSignal.abort());
      assert.equal(result.id, saved.id);
      assert.equal(result.saved, true);
      assert.equal(result.indexing.diagnostic.code, 'execution_aborted');
    } else await assert.rejects(callBackend(root, method, args, AbortSignal.abort()), { code: 'execution_aborted' });
  }
});

test('caller preserves index timeout slots and trailing optional omission without replay', async t => {
  const { root } = await fixture(t);
  await ensureRootBackend(root);
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, init) => {
    if (!String(url).endsWith('/_backend/call')) return originalFetch(url, init);
    requests.push(JSON.parse(init.body));
    return Response.json({ result: {} });
  };
  try {
    await localBackendCall(root, 'indexMemory', [{ timeoutMs: 12345 }]);
    await localBackendCall(root, 'ensureSavedMemoryIndexed', [{ saved: true }, { timeoutMs: 23456 }]);
    await localBackendCall(root, 'abandonDreamBatch', ['batch-id', undefined]);
    await localBackendCall(root, 'updateMemoryDocument', [id, 'proposal', undefined]);
  } finally { globalThis.fetch = originalFetch; }
  assert.equal(requests.length, 4);
  assert.equal(requests[0].args[0].timeoutMs, 12345);
  assert.equal(requests[1].args[1].timeoutMs, 23456);
  assert.deepEqual(requests[2].args, ['batch-id']);
  assert.deepEqual(requests[3].args, [id, 'proposal']);
  for (const request of requests) assert.equal(Object.hasOwn(request, 'root'), false);
});


test('private guarded publications settle and notify an open live document before successful replies', async t => {
  const { root, file } = await fixture(t);
  const token = 'private-operation-fixture';
  let writes = 0;
  const server = await startJumpyBrainHttpServer({ root, apiKeys: [token], port: 0, autoIndex: false, onMemoryWrite: () => writes++ });
  const ws = new WebSocket(server.url.replace(/^http/, 'ws') + '/ws');
  const events = [], pending = new Map();
  let serial = 0;
  try {
    await once(ws, 'open');
    ws.on('message', data => {
      const message = JSON.parse(data.toString());
      if (message.event) events.push(message);
      else { const waiter = pending.get(message.id); if (waiter) { pending.delete(message.id); clearTimeout(waiter.timer); waiter.resolve(message); } }
    });
    const rpc = (method, params) => new Promise((resolve, reject) => {
      const id = String(++serial), timer = setTimeout(() => reject(new Error('Live RPC timed out: ' + method)), 3000);
      pending.set(id, { resolve, timer }); ws.send(JSON.stringify({ id, method, params }));
    });
    assert.equal((await rpc('hello', { token, protocol: 2 })).ok, true);
    assert.equal((await rpc('open', { documentId: id, clientId: 'human' })).ok, true);
    const post = async (method, args) => {
      const response = await fetch(server.url + '/_backend/call', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: JSON.stringify({ method, args }) });
      return { status: response.status, ...await response.json() };
    };
    const barrier = async () => { const pong = once(ws, 'pong'); ws.ping(); await pong; };
    const before = (await post('readMemoryDocument', [id])).result;
    const updated = await post('updateMemoryDocument', [id, before.content + 'private publication\n', { contentHash: before.contentHash }]);
    assert.equal(updated.status, 200);
    await barrier();
    assert.ok(events.some(event => event.snapshot?.contentHash === updated.result.newContentHash && event.snapshot.body === 'body\nprivate publication\n'));
    const settled = await post('patchMemoryDocumentAttention', [id, { ifMatch: updated.result.newContentHash, mutation: { action: 'settle' } }]);
    assert.equal(settled.status, 200);
    await barrier();
    assert.ok(events.some(event => event.snapshot?.contentHash === settled.result.newContentHash));
    const canonical = await readFile(file, 'utf8');
    const writesBeforeStale = writes;
    const stale = await post('deleteMemoryDocument', [id, { ifMatch: before.contentHash, apply: true }]);
    assert.equal(stale.status, 400);
    assert.equal(stale.error.code, 'precondition_failed');
    assert.equal(await readFile(file, 'utf8'), canonical);
    assert.equal(writes, writesBeforeStale, 'failed stale operations must not notify publication');
    const removed = await post('deleteMemoryDocument', [id, { ifMatch: settled.result.newContentHash, apply: true }]);
    assert.equal(removed.status, 200);
    assert.equal(removed.result.removed, true);
    assert.ok(writes > writesBeforeStale, 'successful deletion notifies publication');
  } finally {
    ws.terminate();
    for (const waiter of pending.values()) clearTimeout(waiter.timer);
    await server.close();
  }
});
