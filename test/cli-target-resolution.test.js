import assert from 'node:assert/strict';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, copyFile, writeFile, rm, symlink, readFile, realpath } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveCliTarget } from '../dist/cli/targets.js';
const exec = promisify(execFile), repo = path.resolve('.');
async function fixture(t) {
  const temp = await realpath(await mkdtemp(path.join(os.tmpdir(), 'jb-target-resolution-')));
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^(JUMPYBRAIN_|QMD_|XDG_)/.test(name)));
  env.HOME = temp;
  const cli = (...args) => exec(process.execPath, [path.join(repo, 'dist/cli.js'), ...args], { env, cwd: temp, timeout: 10000 }).then(r => JSON.parse(r.stdout));
  t.after(() => rm(temp, { recursive: true, force: true }));
  return { temp, env, cli };
}

test('explicit selectors override environment, malformed selectors fail and empty configured root never falls back', () => {
  const previous = process.env.JUMPYBRAIN_MEMORY_ROOT;
  try {
    process.env.JUMPYBRAIN_MEMORY_ROOT = '/configured';
    assert.deepEqual(resolveCliTarget({}), { kind: 'local', root: '/configured', source: 'environment' });
    assert.equal(resolveCliTarget({ root: '/explicit' }).root, '/explicit');
    assert.equal(resolveCliTarget({ 'target-url': 'https://example.invalid' }).kind, 'remote');
    process.env.JUMPYBRAIN_MEMORY_ROOT = ' ';
    assert.throws(() => resolveCliTarget({}, { allowDiscovery: true, fallbackRoot: '/fallback' }), /non-empty path/);
    assert.equal(resolveCliTarget({ root: '/explicit' }).root, '/explicit');
    assert.throws(() => resolveCliTarget({ root: ['/one', '/two'] }), /requires a value/);
  } finally {
    if (previous === undefined) delete process.env.JUMPYBRAIN_MEMORY_ROOT; else process.env.JUMPYBRAIN_MEMORY_ROOT = previous;
  }
});

test('owning managed installation supplies its preserved root, ignores cwd manifests and rejects malformed state', async t => {
  const f = await fixture(t), app = path.join(f.temp, 'app');
  await mkdir(path.join(app, 'dist/cli'), { recursive: true });
  const module = path.join(app, 'dist/cli/targets.js');
  await copyFile(path.join(repo, 'dist/cli/targets.js'), module);
  await writeFile(path.join(app, 'package.json'), '{"type":"module"}');
  const manifest = path.join(f.temp, 'install-manifest.json');
  const run = async (args = {}, env = {}) => JSON.parse((await exec(process.execPath, ['--input-type=module', '-e', `const {resolveCliTarget}=await import(${JSON.stringify(pathToFileURL(module).href)}); console.log(JSON.stringify(resolveCliTarget(${JSON.stringify(args)})));`], { cwd: app, env: { ...f.env, ...env } })).stdout);
  const root = path.join(f.temp, 'custom memory');
  await writeFile(manifest, JSON.stringify({ installer: 'jumpybrain-installer', memoryRoot: root }));
  assert.deepEqual(await run(), { kind: 'local', root, source: 'install-manifest' });
  assert.equal((await run({}, { JUMPYBRAIN_MEMORY_ROOT: '/env' })).source, 'environment');
  await writeFile(manifest, '{broken');
  await assert.rejects(run(), /Invalid owning install-manifest/);
  assert.equal((await run({ root: '/explicit' })).root, '/explicit');
  await rm(manifest); await symlink(path.join(app, 'package.json'), manifest);
  await assert.rejects(run(), /Invalid owning install-manifest/);
  await rm(manifest);
  await writeFile(manifest, JSON.stringify({ installer: 'jumpybrain-installer', remoteOnly: true }));
  await assert.rejects(run(), /--root is required/);
});

test('doctor/status/recipes agree on explicit and configured roots; fallback and legacy discovery remain scoped', async t => {
  const f = await fixture(t), root = path.join(f.temp, 'configured'), explicit = path.join(f.temp, 'explicit');
  await f.cli('init', '--root', root, '--json'); await f.cli('init', '--root', explicit, '--json');
  // An untrusted cwd marker never retargets direct commands or doctor.
  await writeFile(path.join(f.temp, 'jumpybrain.json'), '{broken repo configuration');
  await writeFile(path.join(f.temp, 'install-manifest.json'), '{broken unrelated manifest');
  f.env.JUMPYBRAIN_MEMORY_ROOT = root;
  for (const flags of [[], ['--root', explicit]]) {
    const direct = await f.cli('status', ...flags, '--json');
    assert.deepEqual(await f.cli('run', 'memory:status', ...flags, '--json'), direct);
    const doctor = await f.cli('doctor', ...flags, '--json');
    assert.equal(doctor.memoryRoot.root, flags.length ? explicit : root);
    assert.equal(doctor.memoryRoot.source, flags.length ? 'flag' : 'environment');
    assert.equal(direct.target.source, doctor.memoryRoot.source);
  }
  f.env.JUMPYBRAIN_MEMORY_ROOT = path.join(f.temp, 'absent');
  const missing = await f.cli('doctor', '--json');
  assert.match(missing.memoryRoot.message, /Initialize this same root/);
  await assert.rejects(f.cli('status', '--json'), /Initialize this same root/);
  f.env.JUMPYBRAIN_MEMORY_ROOT = '';
  await assert.rejects(f.cli('doctor', '--json'), /non-empty path/);
  delete f.env.JUMPYBRAIN_MEMORY_ROOT;
  const fallback = await f.cli('doctor', '--json');
  assert.equal(fallback.memoryRoot.source, 'personal-fallback');
  assert.equal(fallback.memoryRoot.root, path.join(f.temp, '.jumpybrain/memory'));
  await assert.rejects(f.cli('status', '--json'), /--root is required/);
  await assert.rejects(f.cli('run', 'memory:status', '--json'), /read or parse jumpybrain.json|Failed to read/);
  assert.equal(await readFile(path.join(f.temp, 'jumpybrain.json'), 'utf8'), '{broken repo configuration');
});
