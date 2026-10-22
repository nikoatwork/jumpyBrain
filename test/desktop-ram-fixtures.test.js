import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, symlink, utimes, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createCorpus, fingerprintTree, prepare } from '../scripts/desktop-ram-fixtures.mjs';
import { buildCanonicalLinkTargetLookup, extractCanonicalLinks, listCanonicalMemoryMarkdownFiles,
  readMarkdownDocuments, resolveCanonicalLinkTarget } from '../dist/core/canonical/index.js';
import { memoryRootStatus, configuredIndexingPolicy } from '../dist/core/memory-root/index.js';

async function temporary(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'jb-ram-fixture-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test('RAM fixtures match canonical discovery, link resolution, byte counts and index policy', async (t) => {
  const parent = await temporary(t);
  for (const [count, bytes] of [[0, 0], [100, 286720], [1000, 2867200], [10000, 28672000]]) {
    const root = path.join(parent, String(count));
    const manifest = await createCorpus(root, count);
    assert.equal((await memoryRootStatus(root)).compatible, true);
    assert.deepEqual(await configuredIndexingPolicy(root), { mode: 'lexical' });
    await assert.rejects(readFile(path.join(root, '.jumpybrain/state.json')), { code: 'ENOENT' });
    const files = await listCanonicalMemoryMarkdownFiles(root);
    assert.equal(files.length, count);
    assert.equal(manifest.markdownBytes, bytes);
    let actualBytes = 0;
    for (const file of files) actualBytes += (await readFile(file)).length;
    assert.equal(actualBytes, bytes);
    // Exercise every link kind against the real canonical resolver, not generator formulas.
    if (count !== 100) continue;
    const documents = await readMarkdownDocuments(root);
    assert.equal(documents.length, 100);
    assert.equal(new Set(documents.map((doc) => doc.frontmatter.id)).size, 100);
    const lookup = buildCanonicalLinkTargetLookup(documents);
    let resolved = 0, unresolved = 0;
    const participating = new Set();
    for (const document of documents) {
      for (const link of extractCanonicalLinks(await readFile(document.absolutePath, 'utf8'))) {
        const target = resolveCanonicalLinkTarget(document.relativePath, link.target, link.kind, lookup);
        if (target) { resolved++; participating.add(target); participating.add(document.relativePath); }
        else { unresolved++; assert.match(link.target, /^Missing RAM target /); }
      }
    }
    assert.deepEqual({ resolvedOccurrences: resolved, unresolvedOccurrences: unresolved,
      orphanDocuments: documents.length - participating.size },
    { resolvedOccurrences: 270, unresolvedOccurrences: 9, orphanDocuments: 10 });
    assert.deepEqual(manifest.links, { resolvedOccurrences: resolved, unresolvedOccurrences: unresolved, orphanDocuments: 10 });
  }
});

test('fixtures are byte-reproducible across roots and refuse to overwrite any existing root', async (t) => {
  const parent = await temporary(t);
  const first = path.join(parent, 'first');
  const a = await createCorpus(first, 100);
  const b = await createCorpus(path.join(parent, 'second'), 100);
  assert.equal(a.tree.sha256, b.tree.sha256);
  assert.equal(a.markdownSha256, b.markdownSha256);
  await writeFile(path.join(first, 'personal-sentinel'), 'keep');
  await assert.rejects(createCorpus(first, 100), { code: 'EEXIST' });
  assert.equal(await readFile(path.join(first, 'personal-sentinel'), 'utf8'), 'keep');
});

test('tree fingerprints detect edits/additions and reject escaped symlinks without counting framework aliases twice', async (t) => {
  const parent = await temporary(t);
  const root = path.join(parent, 'corpus');
  const initial = await createCorpus(root, 0);
  await utimes(path.join(root, 'jumpybrain.json'), new Date(), new Date());
  assert.equal((await fingerprintTree(root)).sha256, initial.tree.sha256, 'copy times do not change identity');
  await symlink('jumpybrain.json', path.join(root, 'alias'));
  const alias = await fingerprintTree(root);
  assert.equal(alias.bytes, initial.tree.bytes);
  assert.notEqual(alias.sha256, initial.tree.sha256);
  await writeFile(path.join(root, 'jumpybrain.json'), '{}\n');
  const edited = await fingerprintTree(root);
  assert.notEqual(edited.sha256, alias.sha256);
  assert.equal(edited.entries.find((entry) => entry.file === 'jumpybrain.json').sha256,
    createHash('sha256').update('{}\n').digest('hex'));
  await writeFile(path.join(parent, 'outside'), 'external');
  await symlink('../outside', path.join(root, 'escape'));
  await assert.rejects(fingerprintTree(root), /symlink escapes/);
});

test('preparation cannot place fixtures inside the selected app or reuse an existing directory',
  { skip: process.platform !== 'darwin' }, async (t) => {
    const parent = await temporary(t);
    const app = path.join(parent, 'app');
    await createCorpus(app, 0);
    await symlink('app', path.join(parent, 'app-alias'));
    await assert.rejects(prepare({ app, output: path.join(parent, 'app-alias/fixtures') }), /outside the app artifact/);
    await assert.rejects(prepare({ app, output: parent }), { code: 'EEXIST' });
    await assert.rejects(readFile(path.join(app, 'fixtures/manifest.json')), { code: 'ENOENT' });
  });
