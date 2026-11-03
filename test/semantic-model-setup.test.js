import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile, readdir, lstat, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { provisionLocalModel } from '../dist/adapters/qmd/model-setup.js';
import { parseArgs } from '../dist/cli/args.js';
import { indexingPolicyMatches } from '../dist/core/memory-root/index.js';
const bytes = Buffer.from('GGUF' + 'fixture embedding weights'.repeat(128));
const artifact = { name: 'Fixture', sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length, url: 'https://model.invalid/fixture', terms: 'https://model.invalid/terms' };
async function fixture(t) { const dir = await mkdtemp(path.join(os.tmpdir(), 'jb-model-setup-')); t.after(() => rm(dir, { recursive: true, force: true })); return dir; }

test('model plan is nonmutating without consent; verified local selection is portable and repeatable offline', async t => {
  const root = await fixture(t), directory = path.join(root, 'models');
  const fetchImpl = () => { assert.fail('No implicit network access'); };
  const plan = await provisionLocalModel({ directory, fetchImpl }, artifact);
  assert.equal(plan.status, 'consent_required'); assert.equal(plan.downloadBytes, bytes.length);
  await assert.rejects(lstat(directory), { code: 'ENOENT' });
  const input = path.join(root, 'selected.gguf'); await writeFile(input, bytes);
  const prepared = await provisionLocalModel({ directory, file: input, fetchImpl }, artifact);
  assert.equal(prepared.status, 'available'); assert.equal(prepared.policy.model, undefined);
  assert.equal(prepared.policy.modelId, 'sha256:' + artifact.sha256);
  assert.deepEqual(await readFile(path.join(directory, artifact.sha256 + '.gguf')), bytes);
  const repeated = await provisionLocalModel({ directory, download: true, fetchImpl }, artifact);
  assert.equal(repeated.reused, true);
  assert.equal(indexingPolicyMatches(prepared.policy, { ...prepared.policy, model: '/other-device/model.gguf' }, artifact.sha256), true);
  assert.equal(indexingPolicyMatches(prepared.policy, prepared.policy, 'f'.repeat(64)), false);
});

test('explicit model download verifies bytes; corrupt, oversized, offline and interrupted attempts publish nothing', async t => {
  const root = await fixture(t);
  for (const mode of ['valid', 'corrupt', 'oversized', 'offline', 'aborted']) {
    const directory = path.join(root, mode), controller = new AbortController();
    const fetchImpl = async () => {
      if (mode === 'offline') throw new Error('offline');
      if (mode === 'aborted') controller.abort();
      return new Response(mode === 'corrupt' ? Buffer.alloc(bytes.length) : mode === 'oversized' ? Buffer.concat([bytes, Buffer.from('extra')]) : bytes);
    };
    if (mode === 'valid') assert.equal((await provisionLocalModel({ directory, download: true, fetchImpl }, artifact)).status, 'available');
    else await assert.rejects(() => provisionLocalModel({ directory, download: true, fetchImpl, signal: controller.signal }, artifact));
    assert.deepEqual(await readdir(directory), mode === 'valid' ? [artifact.sha256 + '.gguf'] : []);
  }
});

test('a corrupted cached model remains an explicit failure and never triggers a hidden download', async t => {
  const directory = await fixture(t);
  await writeFile(path.join(directory, artifact.sha256 + '.gguf'), Buffer.alloc(bytes.length));
  await assert.rejects(() => provisionLocalModel({ directory, download: true, fetchImpl: () => assert.fail('No download before conflict inspection') }, artifact), /Cached model fails verification/);
  assert.equal((await readFile(path.join(directory, artifact.sha256 + '.gguf'))).equals(Buffer.alloc(bytes.length)), true);
});

test('CLI model consent and local-only selection reject ambiguous or incomplete flags', () => {
  for (const flags of [['--download-model'], ['--model-file', '/tmp/file'], ['--setup-semantic', '--lexical'], ['--setup-semantic', '--model-file', 'relative'], ['--setup-semantic', '--download-model', '--model-file', '/tmp/file']]) assert.throws(() => parseArgs(['index', ...flags]));
  assert.equal(parseArgs(['index', '--setup-semantic', '--download-model'])["download-model"], true);
});
