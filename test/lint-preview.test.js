import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readdir, readFile, lstat, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { initializeMemoryRoot, processMemory } from '../dist/index.js';
import { parseArgs } from '../dist/cli/args.js';
const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url));

async function snapshot(directory) {
  const result = {};
  for (const name of (await readdir(directory)).sort()) {
    const file = path.join(directory, name), stat = await lstat(file);
    result[name] = { mtimeMs: stat.mtimeMs, mode: stat.mode, content: stat.isDirectory() ? await snapshot(file) : (await readFile(file)).toString('base64') };
  }
  return result;
}

test('lint preview observes Markdown and derived sentinels without any mutation, backend, index, counters or ID repair', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'jb-lint-preview-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await initializeMemoryRoot(root);
  await writeFile(path.join(root, 'pages/a.md'), '---\ntype: page\ntitle: Quartz ledger\n---\n\n# Quartz ledger\n\nNo source links.\n');
  await writeFile(path.join(root, 'pages/b.md'), '---\ntype: page\ntitle: Quartz ledger\n---\n\n# Quartz ledger\n');
  await mkdir(path.join(root, '.jumpybrain/reports'), { recursive: true });
  for (const file of ['reports/existing.md', 'counters.json', 'index.sqlite', 'index.sqlite-wal', 'recovery.json']) await writeFile(path.join(root, '.jumpybrain', file), 'untouched sentinel\n');
  const before = await snapshot(root);
  const result = JSON.parse(execFileSync(process.execPath, [fileURLToPath(new URL('./fixtures/lint-preview-sentinels.mjs', import.meta.url)), root], {
    encoding: 'utf8', timeout: 10000, env: { ...process.env, HOME: root, JUMPYBRAIN_QMD_BIN: '/must-not-run', JUMPYBRAIN_REMOTE_URL: '', JUMPYBRAIN_MEMORY_ROOT: root },
  }));
  assert.ok(result.issueCount > 0);
  assert.deepEqual(result.calls, []);
  assert.deepEqual(await snapshot(root), before);
  const preview = await processMemory(root, { mode: 'lint', preview: true });
  const applied = await processMemory(root, { mode: 'lint', apply: true });
  assert.deepEqual(applied.issues, preview.issues);
  assert.deepEqual(applied.scope, preview.scope);
  assert.equal(applied.applied, true);
  assert.match(applied.files[0], /^\.jumpybrain\/reports\/lint-/);
  assert.match(await readFile(path.join(root, applied.files[0]), 'utf8'), /PAGE_SOURCES_ABSENT/);
  assert.equal((await readFile(path.join(root, 'pages/a.md'), 'utf8')).includes('id:'), false);
});

test('preview flags are strict for direct/recipe CLI; non-lint, ambiguous apply and remote operation fail closed', async () => {
  for (const prefix of [['process'], ['run', 'memory:process']]) {
    for (const flags of [['--preview=false'], ['--preview', '--preview'], ['--preview', 'true'], ['--preview', '--apply'], ['--preview', '--apply=false'], ['--preview', '--mode', 'synthesize']]) {
      assert.throws(() => parseArgs([...prefix, ...flags]), /preview|boolean|repeated|Unexpected/);
    }
    const result = spawnSync(process.execPath, [cli, ...prefix, '--mode', 'lint', '--preview', '--target-url', 'https://preview.invalid'], {
      encoding: 'utf8', timeout: 5000, env: { ...process.env, HOME: os.tmpdir(), JUMPYBRAIN_CLI_CONFIG: path.join(os.tmpdir(), 'jb-nonexistent-preview-policy'), JUMPYBRAIN_API_KEY: '' },
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /local\/server-side only/);
    assert.doesNotMatch(result.stderr, /API_KEY|fetch failed/);
  }
  await assert.rejects(processMemory('/does-not-exist', { mode: 'lint', preview: true }), /ENOENT/);
});
