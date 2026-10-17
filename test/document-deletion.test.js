import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, writeFile, rm, link, symlink, readdir, mkdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { initializeMemoryRoot, readMemoryDocument, updateMemoryDocument, deleteMemoryDocument, previewMemoryDocumentDeletion, graphMemory } from '../dist/runtime/index.js';
import { createRemoteMemoryTransport } from '../dist/adapters/http-client/index.js';
import { startJumpyBrainHttpServer } from '../dist/server/index.js';
import { parseArgs } from '../dist/cli/args.js';
const id = 'mem_d0000000-0000-4000-8000-000000000001';
const other = 'mem_d0000000-0000-4000-8000-000000000002';
const markdown = (id, title, body = 'Original body') => `---\nid: "${id}"\ntitle: "${title}"\ntype: "note"\n---\n${body}\n`;
async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'jumpybrain-delete-test-'));
  const cleanup = { close: async () => {} };
  t.after(async () => { await cleanup.close(); await rm(root, { recursive: true, force: true }); });
  await initializeMemoryRoot(root);
  const file = path.join(root, 'notes/hashed-source.md');
  await writeFile(file, markdown(id, 'Human title'));
  const source = path.join(root, 'notes/backlink.md');
  await writeFile(source, markdown(other, 'Backlink', '[[Human title]]'));
  return { root, file, source, cleanup };
}
const code = name => error => error.code === name;
test('deletion preview is observational, counts title backlinks and preserves surviving bytes', async t => {
  const { root, file, source } = await fixture(t);
  const before = await readFile(source);
  const preview = await previewMemoryDocumentDeletion(root, id);
  assert.equal(preview.references.links, 1);
  assert.equal(preview.permanent, true);
  assert.deepEqual(await readFile(file, 'utf8'), markdown(id, 'Human title'));
  const removed = await deleteMemoryDocument(root, id, { ifMatch: preview.contentHash, apply: true });
  assert.equal(removed.removed, true);
  assert.equal(removed.indexing.status, 'pending');
  await assert.rejects(readMemoryDocument(root, id), code('missing_id'));
  assert.deepEqual(await readFile(source), before);
  assert.equal((await graphMemory(root, { includeUnresolved: true })).nodes.some(node => node.documentId === id), false);
  await assert.rejects(deleteMemoryDocument(root, id, { ifMatch: preview.contentHash, apply: true }), code('missing_id'));
});
test('deletion rejects absent authorization, stale hashes and duplicate IDs', async t => {
  const { root, file } = await fixture(t);
  const original = await readMemoryDocument(root, id);
  await assert.rejects(deleteMemoryDocument(root, id, { ifMatch: original.contentHash, apply: false }), code('validation_failed'));
  await assert.rejects(deleteMemoryDocument(root, id, { apply: true }), code('precondition_required'));
  await writeFile(file, markdown(id, 'Changed title'));
  await assert.rejects(deleteMemoryDocument(root, id, { ifMatch: original.contentHash, apply: true }), code('precondition_failed'));
  await writeFile(path.join(root, 'notes/duplicate.md'), markdown(id, 'Duplicate'));
  await assert.rejects(previewMemoryDocumentDeletion(root, id), code('duplicate_id'));
});
test('deletion shares replacement exclusion and rejects hardlinks and symlink targets', async t => {
  const { root, file } = await fixture(t);
  const original = await readMemoryDocument(root, id);
  const lock = path.join(root, 'notes/.hashed-source.md.replace.lock');
  await writeFile(lock, '');
  await assert.rejects(deleteMemoryDocument(root, id, { ifMatch: original.contentHash, apply: true }), code('precondition_failed'));
  assert.equal((await readdir(path.dirname(file))).includes(path.basename(lock)), true, 'must not remove another writer lock');
  await rm(lock);
  const alias = path.join(root, 'outside.md');
  await link(file, alias);
  await assert.rejects(deleteMemoryDocument(root, id, { ifMatch: original.contentHash, apply: true }), code('precondition_failed'));
  await rm(alias);
  await rm(file);
  await writeFile(alias, markdown(id, 'External'));
  await symlink(alias, file);
  await assert.rejects(deleteMemoryDocument(root, id, { ifMatch: original.contentHash, apply: true }), code('missing_id'));
  assert.match(await readFile(alias, 'utf8'), /External/);
});
test('cooperating update/delete races preserve any winning update', async t => {
  const { root, file } = await fixture(t);
  const original = await readMemoryDocument(root, id);
  const [edit, deletion] = await Promise.allSettled([
    updateMemoryDocument(root, id, original.content.replace('Original body', 'New body'), { ifMatch: original.contentHash }),
    deleteMemoryDocument(root, id, { ifMatch: original.contentHash, apply: true }),
  ]);
  assert.notEqual(edit.status === 'fulfilled', deletion.status === 'fulfilled', 'exactly one old-revision mutation wins');
  if (edit.status === 'fulfilled') assert.match(await readFile(file, 'utf8'), /New body/);
  else await assert.rejects(readFile(file), { code: 'ENOENT' });
});
test('a separate process holding the cooperating replacement lock blocks removal', async t => {
  const { root, file } = await fixture(t);
  const { contentHash } = await readMemoryDocument(root, id);
  const lock = path.join(root, 'notes/.hashed-source.md.replace.lock');
  // A lock left by a separate cooperating writer is never reaped automatically.
  execFileSync(process.execPath, ['-e', "require('fs').writeFileSync(process.argv[1], '', {flag:'wx'})", lock]);
  await assert.rejects(deleteMemoryDocument(root, id, { ifMatch: contentHash, apply: true }), code('precondition_failed'));
  assert.match(await readFile(file, 'utf8'), /Original body/);
});
test('HTTP client preview/apply require auth and If-Match and remove only the selected file', async t => {
  const { root, source, cleanup } = await fixture(t);
  const server = await startJumpyBrainHttpServer({ root, apiKeys: ['disposable-test-key'], port: 0, autoIndex: false });
  cleanup.close = () => server.close();
  const endpoint = server.url + '/memories/all/documents/' + id;
  assert.equal((await fetch(endpoint, { method: 'DELETE' })).status, 401);
  const headers = { Authorization: 'Bearer disposable-test-key', 'Content-Type': 'application/json' };
  assert.equal((await fetch(endpoint, { method: 'DELETE', headers, body: '{"apply":true}' })).status, 428);
  const remote = createRemoteMemoryTransport({ url: server.url, apiKey: 'disposable-test-key' });
  const preview = await remote.previewMemoryDocumentDeletion(id);
  assert.equal(preview.root, 'remote:all');
  assert.equal(preview.references.links, 1);
  assert.equal((await fetch(endpoint, { method: 'DELETE', headers: { ...headers, 'If-Match': preview.contentHash }, body: '{"apply":false}' })).status, 400);
  const removed = await remote.deleteMemoryDocument(id, { ifMatch: preview.contentHash, apply: true });
  assert.equal(removed.removed, true);
  assert.equal(removed.root, 'remote:all');
  assert.match(await readFile(source, 'utf8'), /\[\[Human title\]\]/);
});
test('CLI deletion parsing is strict and recipes share the same preview/apply contract', async t => {
  const { root, file } = await fixture(t);
  for (const flags of [['--apply=true'], ['--apply','false'], ['--force'], ['--id',id,'--id',id], ['--if-match']]) {
    assert.throws(() => parseArgs(['delete', '--root', root, '--id', id, ...flags]));
  }
  const preview = JSON.parse(execFileSync(process.execPath, ['dist/cli.js', 'delete', '--root',root,'--id',id,'--json'], { encoding: 'utf8' }));
  assert.match(await readFile(file, 'utf8'), /Original body/);
  const result = JSON.parse(execFileSync(process.execPath, ['dist/cli.js', 'run','memory:delete','--root',root,'--id',id,'--apply','--if-match',preview.contentHash,'--json'], { encoding:'utf8' }));
  assert.equal(result.removed, true);
});


test('successful removal remains success when remote index bookkeeping fails', async t => {
  const { root } = await fixture(t);
  const { contentHash } = await readMemoryDocument(root, id);
  await mkdir(path.join(root, '.jumpybrain/remote/index-state.json'), { recursive: true });
  const { deleteServerMemoryDocument } = await import('../dist/app/server-memory/index.js');
  const result = await deleteServerMemoryDocument({ root, id, ifMatch: contentHash, apply: true });
  assert.equal(result.removed, true);
  assert.equal(result.indexing.status, 'failed');
  await assert.rejects(readMemoryDocument(root, id), code('missing_id'));
});


test('an old ID/hash never deletes a different document recreated at the same path', async t => {
  const { root, file } = await fixture(t);
  const { contentHash } = await readMemoryDocument(root, id);
  await rm(file);
  const replacement = markdown('mem_d0000000-0000-4000-8000-000000000003', 'Replacement owner');
  await writeFile(file, replacement);
  await assert.rejects(deleteMemoryDocument(root, id, { ifMatch: contentHash, apply: true }), code('missing_id'));
  assert.equal(await readFile(file, 'utf8'), replacement);
});

test('uncertain DELETE delivery is never automatically retried or used to remove a replacement', async t => {
  const { root, file, cleanup } = await fixture(t);
  const server = await startJumpyBrainHttpServer({ root, apiKeys: ['test-key'], port: 0, autoIndex: false });
  cleanup.close = () => server.close();
  let requests = 0;
  const remote = createRemoteMemoryTransport({ url: server.url, apiKey: 'test-key', fetchImpl: async (...args) => {
    requests++;
    const response = await fetch(...args);
    await response.arrayBuffer();
    throw new TypeError('Simulated lost response after canonical removal');
  } });
  const { contentHash } = await readMemoryDocument(root, id);
  await assert.rejects(remote.deleteMemoryDocument(id, { ifMatch: contentHash, apply: true }), /lost response/);
  assert.equal(requests, 1);
  await assert.rejects(readFile(file), { code: 'ENOENT' });
  await writeFile(file, markdown(other, 'New owner'));
  await assert.rejects(deleteMemoryDocument(root, id, { ifMatch: contentHash, apply: true }), code('missing_id'));
  assert.match(await readFile(file, 'utf8'), /New owner/);
});

test('HTTP deletion permission failures retain the file and hide filesystem messages', async t => {
  const fs = (await import('node:fs/promises')).default;
  const { syncBuiltinESMExports } = await import('node:module');
  const { root, file, cleanup } = await fixture(t);
  const server = await startJumpyBrainHttpServer({ root, apiKeys: ['test-key'], port: 0, autoIndex: false });
  cleanup.close = () => server.close();
  const { contentHash } = await readMemoryDocument(root, id);
  const unlink = fs.unlink;
  const canonicalFile = await fs.realpath(file);
  t.mock.method(fs, 'unlink', async target => {
    if (target === canonicalFile) throw Object.assign(new Error('EACCES secret canonical body at ' + canonicalFile), { code: 'EACCES' });
    return unlink(target);
  });
  syncBuiltinESMExports();
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
  const response = await fetch(server.url + '/memories/all/documents/' + id, {
    method: 'DELETE', headers: { Authorization: 'Bearer test-key', 'Content-Type': 'application/json', 'If-Match': contentHash }, body: '{"apply":true}',
  });
  assert.equal(response.status, 500);
  const error = await response.text();
  assert.ok(!error.includes(root));
  assert.ok(!error.includes('secret canonical body'));
  assert.equal(await readFile(file, 'utf8'), markdown(id, 'Human title'));
  assert.equal((await readdir(path.dirname(file))).some(name => name.endsWith('.replace.lock')), false);
});

test('preview warnings are bounded and distinguish declared relationships from inbound links', async t => {
  const { root } = await fixture(t);
  for (let i = 0; i < 22; i++) await writeFile(path.join(root, `notes/related-${i}.md`), `---\nrelated_to: ["${id}"]\n---\nSurviving record ${i}\n`);
  const preview = await previewMemoryDocumentDeletion(root, id);
  assert.equal(preview.references.links, 1);
  assert.equal(preview.references.relationships, 22);
  assert.equal(preview.references.examples.length, 20);
  assert.equal(preview.references.truncated, true);
});
