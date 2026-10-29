import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { packageBudget, validatePackageBudget } from '../scripts/package-budget.mjs';
import { validateLocalPackFiles } from '../scripts/local-pack-manifest.mjs';

const root = new URL('..', import.meta.url);
function pack(cwd) {
  return JSON.parse(execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
    cwd, encoding: 'utf8', timeout: 60_000, maxBuffer: 10 * 1024 * 1024,
  }))[0];
}

test('actual distribution retains install resources within download, disk and runtime budgets', () => {
  const info = pack(root);
  validateLocalPackFiles(info.files.map(file => `package/${file.path}`));
  const metrics = validatePackageBudget(info);
  assert.ok(metrics.runtimeBytes > 0);
  assert.ok(info.files.some(file => file.path === 'docs/licenses/ember.txt'), 'retain shipped asset licenses');
});

test('npm exclusions reject newly added artwork, native tests and private build state', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'jumpybrain-pack-budget-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(path.join(dir, 'docs'));
  await mkdir(path.join(dir, 'integrations/macos-companion'), { recursive: true });
  for (const file of ['docs/.npmignore', 'integrations/macos-companion/.npmignore']) {
    await cp(new URL(file, root), path.join(dir, file));
  }
  await writeFile(path.join(dir, 'package.json'), JSON.stringify({ name: 'footprint-fixture', version: '1.0.0', files: ['docs', 'integrations'] }));
  const excluded = ['docs/assets/future-screenshot.png',
    'integrations/macos-companion/test_future.py', 'integrations/macos-companion/smoke_future.py',
    'integrations/macos-companion/.build/private.json', 'integrations/macos-companion/__pycache__/private.pyc',
    'integrations/macos-companion/Configuration.json', 'integrations/macos-companion/.env'];
  const retained = ['docs/install.md', 'integrations/macos-companion/install.py', 'integrations/macos-companion/Companion.swift'];
  for (const file of [...excluded, ...retained]) {
    await mkdir(path.dirname(path.join(dir, file)), { recursive: true });
    await writeFile(path.join(dir, file), 'fixture');
  }
  const files = new Set(pack(dir).files.map(file => file.path));
  for (const file of excluded) assert.equal(files.has(file), false, `must exclude ${file}`);
  for (const file of retained) assert.ok(files.has(file), `must retain ${file}`);
});

test('package budgets fail on compressed growth, disk growth, runtime growth and file proliferation', () => {
  const valid = { size: 1, unpackedSize: 1, entryCount: 1, files: [{ path: 'dist/index.js', size: 1 }] };
  for (const [metric, mutate] of [
    ['archiveBytes', info => { info.size = packageBudget.archiveBytes + 1; }],
    ['unpackedBytes', info => { info.unpackedSize = packageBudget.unpackedBytes + 1; }],
    ['runtimeBytes', info => { info.files[0].size = packageBudget.runtimeBytes + 1; }],
    ['files', info => { info.entryCount = packageBudget.files + 1; }],
  ]) {
    const info = structuredClone(valid);
    mutate(info);
    assert.throws(() => validatePackageBudget(info), new RegExp(`Package budget exceeded: ${metric}`));
  }
  assert.throws(() => validatePackageBudget({ ...valid, size: undefined }), /Invalid package metric/);
  assert.throws(() => validatePackageBudget({ ...valid, size: NaN }), /Invalid package metric/);
  assert.throws(() => validatePackageBudget({}), /file manifest/);
});

test('build benchmark rejects invalid ceilings and arguments before starting a build', () => {
  const script = new URL('../scripts/benchmark-build.mjs', import.meta.url);
  for (const value of ['0', '-1', 'NaN', 'Infinity', '1.5', '']) {
    const result = spawnSync(process.execPath, [script.pathname], {
      encoding: 'utf8', env: { ...process.env, JUMPYBRAIN_BUILD_MAX_MS: value }, timeout: 5000,
    });
    assert.equal(result.status, 1, value);
    assert.match(result.stderr, /must be a positive integer/);
  }
  const invalid = spawnSync(process.execPath, [script.pathname, '--unknown'], { encoding: 'utf8', timeout: 5000 });
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /no positional arguments/);
  assert.match(execFileSync(process.execPath, [script.pathname, '--help'], { encoding: 'utf8', timeout: 5000 }), /Usage:/);
});
