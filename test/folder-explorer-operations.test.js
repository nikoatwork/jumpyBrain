import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink, link, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { initializeMemoryRoot, readMemoryDocument } from '../dist/runtime/index.js';
import { startJumpyBrainHttpServer } from '../dist/server/index.js';
import { applyServerMemoryFileOperation } from '../dist/app/server-memory/folder-explorer-operations.js';
import { listServerMemoryFiles } from '../dist/app/server-memory/folder-explorer.js';
const id = 'mem_fc000000-0000-4000-8000-000000000001';
const content = `---\nid: ${id}\ntitle: Human title\ncustom: untouched\n---\r\nOriginal bytes.\r\n`;
async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'jb-file-operations-'));
  const cleanup = { close: async () => {} };
  t.after(async () => { await cleanup.close(); await rm(root, { recursive: true, force: true }); });
  await initializeMemoryRoot(root);
  await mkdir(path.join(root, 'notes/source'));
  await mkdir(path.join(root, 'notes/destination'));
  await writeFile(path.join(root, 'notes/source/original.md'), content);
  const snapshot = await readMemoryDocument(root, id);
  const operation = { action: 'move-file', id, file: snapshot.file, destination: 'notes/destination/renamed.md' };
  const apply = (op = operation, hash = snapshot.contentHash) => applyServerMemoryFileOperation({ root, operation: op, ifMatch: hash });
  return { root, snapshot, operation, apply, cleanup };
}
const code = name => error => error.code === name;
test('file rename/move preserves canonical bytes, IDs and metadata and refreshes provenance', async t => {
  const { root, snapshot, apply, operation } = await fixture(t);
  const before = await stat(path.join(root, snapshot.file));
  const result = await apply();
  assert.equal(result.moved, true); assert.equal(result.indexing.status, 'pending');
  assert.equal(result.file, operation.destination); assert.equal(result.contentHash, snapshot.contentHash);
  assert.equal(JSON.stringify(result).includes(root), false);
  assert.equal(await readFile(path.join(root, result.file), 'utf8'), content);
  assert.equal((await stat(path.join(root, result.file))).mtimeMs, before.mtimeMs);
  await assert.rejects(readFile(path.join(root, snapshot.file)), code('ENOENT'));
  assert.equal((await readMemoryDocument(root, id)).file, result.file);
  await assert.rejects(apply(), code('precondition_failed'));
  assert.equal((await apply({ ...operation, file: result.file })).moved, false);
});
test('moves reject missing/stale hashes, wrong source paths, collisions and replacement locks', async t => {
  const { root, snapshot, operation, apply } = await fixture(t);
  await assert.rejects(apply(operation, ''), code('precondition_required'));
  await assert.rejects(apply(operation, 'sha256:' + '0'.repeat(64)), code('precondition_failed'));
  await assert.rejects(apply({ ...operation, file: 'notes/elsewhere.md' }), code('precondition_failed'));
  await writeFile(path.join(root, operation.destination), 'Never overwrite');
  await assert.rejects(apply(), code('validation_failed'));
  assert.equal(await readFile(path.join(root, operation.destination), 'utf8'), 'Never overwrite');
  await rm(path.join(root, operation.destination));
  for (const lock of ['notes/source/.original.md.replace.lock', 'notes/destination/.renamed.md.replace.lock']) {
    await writeFile(path.join(root, lock), 'Other writer');
    await assert.rejects(apply(), code('precondition_failed'));
    assert.equal(await readFile(path.join(root, lock), 'utf8'), 'Other writer');
    await rm(path.join(root, lock));
  }
  assert.equal(await readFile(path.join(root, snapshot.file), 'utf8'), content);
});
test('operations reject traversal, hidden/technical/noncanonical paths, symlinks and hardlinks', async t => {
  const { root, snapshot, operation, apply } = await fixture(t);
  for (const destination of ['../escape.md', '/tmp/escape.md', 'scratch/escape.md', 'notes/../escape.md', 'notes/.hidden.md', 'notes/node_modules/a.md', 'notes/gold.md', 'notes/a.txt', 'notes/a\\b.md', 'notes//a.md']) await assert.rejects(apply({ ...operation, destination }), code('validation_failed'));
  const outside = await mkdtemp(path.join(os.tmpdir(), 'jb-outside-'));
  t.after(() => rm(outside, { recursive: true, force: true }));
  await symlink(outside, path.join(root, 'notes/link'));
  await assert.rejects(apply({ ...operation, destination: 'notes/link/file.md' }));
  await assert.rejects(apply({ action: 'create-folder', path: 'notes/link/folder' }), code('validation_failed'));
  await link(path.join(root, snapshot.file), path.join(outside, 'hardlink.md'));
  await assert.rejects(apply(), code('precondition_failed'));
  assert.equal(await readFile(path.join(root, snapshot.file), 'utf8'), content);
});
test('empty-folder discovery is explicit, read-only, canonical and cancellable; creation is no-clobber', async t => {
  const { root, apply } = await fixture(t);
  const created = await apply({ action: 'create-folder', path: 'notes/destination/Empty folder' });
  assert.equal(created.created, true);
  await assert.rejects(apply({ action: 'create-folder', path: 'notes/destination/Empty folder' }), code('validation_failed'));
  await assert.rejects(apply({ action: 'create-folder', path: 'notes/absent/child' }), code('validation_failed'));
  await mkdir(path.join(root, 'notes/.hidden'));
  await mkdir(path.join(root, 'notes/node_modules'));
  const packet = await listServerMemoryFiles({ root, includeFolders: true });
  assert.ok(packet.folders.includes('notes/destination/Empty folder'));
  assert.ok(!packet.folders.includes('notes/.hidden'));
  assert.ok(!packet.folders.includes('notes/node_modules'));
  assert.equal((await listServerMemoryFiles({ root })).folders, undefined, 'legacy listing shape unchanged');
  await assert.rejects(listServerMemoryFiles({ root, includeFolders: true, signal: AbortSignal.abort() }), error => error.name === 'AbortError');
});
test('concurrent moves serialize and only one source path can succeed', async t => {
  const { apply, operation, root } = await fixture(t);
  const results = await Promise.allSettled([apply(), apply({ ...operation, destination: 'notes/destination/other.md' })]);
  assert.equal(results.filter(item => item.status === 'fulfilled').length, 1);
  assert.equal((await listServerMemoryFiles({ root })).files.filter(file => file.id === id).length, 1);
});
test('HTTP file operations authenticate, validate, hash-guard and return safe errors', async t => {
  const { root, operation, snapshot, cleanup } = await fixture(t);
  const server = await startJumpyBrainHttpServer({ root, apiKeys: ['file-test'], port: 0, autoIndex: false });
  cleanup.close = () => server.close();
  const url = server.url + '/memories/all/files/operations';
  const call = (body, headers = {}) => fetch(url, { method: 'POST', headers: { Authorization: 'Bearer file-test', 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  assert.equal((await fetch(url, { method: 'POST', body: '{}' })).status, 401);
  assert.equal((await fetch(url, { headers: { Authorization: 'Bearer file-test' } })).status, 405);
  assert.equal((await call(operation)).status, 428);
  assert.equal((await call({ action: 'create-folder', path: 'notes/http-folder' })).status, 200);
  const folders = await (await fetch(server.url + '/memories/all/files?includeFolders=1', { headers: { Authorization: 'Bearer file-test' } })).json();
  assert.ok(folders.folders.includes('notes/http-folder'));
  const invalid = await call({ action: 'move-file', ...operation, destination: '/tmp/private.md' }, { 'If-Match': snapshot.contentHash });
  assert.equal(invalid.status, 422); assert.equal((await invalid.text()).includes(root), false);
  const moved = await call(operation, { 'If-Match': snapshot.contentHash });
  assert.equal(moved.status, 200, await moved.clone().text());
  assert.equal((await moved.json()).moved, true);
  assert.equal((await call(operation, { 'If-Match': snapshot.contentHash })).status, 412);
});
