#!/usr/bin/env node
// Builds only declared inputs, then exercises real Linux/QMD on a disposable volume.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomBytes } from 'node:crypto';

const execute = promisify(execFile);
const repository = fileURLToPath(new URL('..', import.meta.url));
const temporary = await mkdtemp(path.join(os.tmpdir(), 'jumpybrain-hosted-'));
const context = path.join(temporary, 'context');
const suffix = randomBytes(8).toString('hex');
const image = `jumpybrain-hosted-smoke:${suffix}`;
const container = `jumpybrain-hosted-${suffix}`;
const volume = `${container}-data`;
const oldKey = randomBytes(32).toString('hex'), newKey = randomBytes(32).toString('hex');
let imageCreated = false, volumeCreated = false, containerCreated = false;
const clean = text => text.replaceAll(oldKey, '[redacted]').replaceAll(newKey, '[redacted]');
async function docker(args, options = {}) {
  try { return (await execute('docker', args, { timeout: 120_000, maxBuffer: 16 * 1024 * 1024, ...options })).stdout.trim(); }
  catch (error) { throw new Error(clean(`Docker ${args[0]} failed: ${error.stderr || error.message}`)); }
}
const envFile = path.join(temporary, 'server.env');
async function start(keys) {
  await writeFile(envFile, `JUMPYBRAIN_SERVER_API_KEYS=${keys}\n`, { mode: 0o600 });
  await docker(['run', '-d', '--init', '--name', container, '--env-file', envFile,
    '--mount', `type=volume,src=${volume},dst=/data/jumpybrain`,
    '--memory', '2g', '--cpus', '2', '--pids-limit', '256', image]);
  containerCreated = true;
  await docker(['cp', path.join(repository, 'scripts/hosted-runtime-checks.mjs'), `${container}:/tmp/hosted-runtime-checks.mjs`]);
  await docker(['exec', container, 'node', '/tmp/hosted-runtime-checks.mjs', 'ready']);
}
async function stop() {
  await docker(['stop', '--time', '20', container]);
  const state = JSON.parse(await docker(['inspect', '--format', '{{json .State}}', container]));
  assert.equal(state.ExitCode, 0, 'server must handle SIGTERM without forced kill');
  assert.equal(state.OOMKilled, false);
  await docker(['rm', container]);
  containerCreated = false;
}
const check = mode => docker(['exec', '-e', 'JUMPYBRAIN_API_KEY', container, 'node', '/tmp/hosted-runtime-checks.mjs', mode],
  { env: { ...process.env, JUMPYBRAIN_API_KEY: oldKey } });

try {
  console.log('Checking Docker availability (required; no skip on missing daemon).');
  const platform = await docker(['version', '--format', '{{.Server.Os}}/{{.Server.Arch}}']);
  await mkdir(path.join(context, 'scripts'), { recursive: true });
  for (const file of ['Dockerfile', '.dockerignore', 'package.json', 'package-lock.json', 'tsconfig.json', 'src',
    'scripts/build-editor.mjs', 'scripts/feedback-config.mjs', 'scripts/qmd-install-check.mjs', 'scripts/multiplayer-upgrade.mjs',
    'scripts/engine/package.json', 'scripts/engine/package-lock.json']) {
    await mkdir(path.dirname(path.join(context, file)), { recursive: true });
    await cp(path.join(repository, file), path.join(context, file), { recursive: true });
  }
  const fingerprint = createHash('sha256');
  for (const file of (await readdir(context, { recursive: true, withFileTypes: true })).filter(entry => entry.isFile())
    .map(entry => path.relative(context, path.join(entry.parentPath, entry.name))).sort()) {
    fingerprint.update(file).update('\0').update(await readFile(path.join(context, file))).update('\0');
  }
  const inputDigest = fingerprint.digest('hex');
  // Poison files must be excluded even under otherwise allowed source directories.
  for (const file of ['.env', '.npmrc', 'src/.env', 'src/fixture.key', 'memory/private.md', 'evals/private.md', 'scripts/unrelated.mjs', 'scripts/engine/private.md']) {
    await mkdir(path.dirname(path.join(context, file)), { recursive: true });
    await writeFile(path.join(context, file), 'hosted-context-private-sentinel');
  }
  // Inspect the filtered context itself, not just final COPY destinations.
  await writeFile(path.join(context, 'Dockerfile'), 'FROM scratch\nCOPY . /\n');
  await docker(['build', '--progress=plain', '--output', `type=local,dest=${path.join(temporary, 'filtered')}`, context], { timeout: 600_000 });
  await cp(path.join(repository, 'Dockerfile'), path.join(context, 'Dockerfile'));
  const filtered = await readdir(path.join(temporary, 'filtered'), { recursive: true });
  for (const file of ['.env', '.npmrc', 'src/.env', 'src/fixture.key', 'memory', 'evals', 'scripts/unrelated.mjs', 'scripts/engine/private.md']) {
    assert.ok(!filtered.includes(file), `private build-context entry leaked: ${file}`);
  }
  console.log('Building image from clean declared-input context.');
  await docker(['build', '--progress=plain', '-t', image, context], { timeout: 600_000 });
  imageCreated = true;
  const metadata = JSON.parse(await docker(['image', 'inspect', '--format', '{{json .}}', image]));
  assert.equal(metadata.Config.User, 'node');
  await docker(['volume', 'create', volume]);
  volumeCreated = true;
  await start(oldKey);
  console.log(await check('initial'));
  await stop();
  // Deliberate overlap: prove both bootstrap keys, then recreate without the old key.
  await start(`${oldKey},${newKey}`);
  await check('persistent');
  await docker(['exec', '-e', 'JUMPYBRAIN_API_KEY', container, 'node', '/tmp/hosted-runtime-checks.mjs', 'bootstrap-accepted'],
    { env: { ...process.env, JUMPYBRAIN_API_KEY: newKey } });
  await stop();
  await start(newKey);
  console.log(await check('bootstrap-rejected'));
  console.log(await check('persistent'));
  await stop();
  // No service is running while backup/restore manipulates fixture files.
  console.log(await docker(['run', '--rm', '--init', '--mount', `type=volume,src=${volume},dst=/data/jumpybrain`,
    '--mount', `type=bind,src=${path.join(repository, 'scripts/hosted-runtime-checks.mjs')},dst=/tmp/hosted-runtime-checks.mjs,readonly`,
    image, 'node', '/tmp/hosted-runtime-checks.mjs', 'restore']));
  await start(newKey);
  console.log(await check('persistent'));
  await stop();
  console.log(JSON.stringify({ ok: true, source: (await execute('git', ['rev-parse', 'HEAD'], { cwd: repository })).stdout.trim(),
    workingTree: true, inputDigest, image: metadata.Id, platform, nodeBase: 'node:22-slim', qmd: '2.8.3', semantic: 'untested; lexical only' }));
} catch (error) {
  console.error(clean(error.message)); process.exitCode = 1;
} finally {
  for (const [created, args] of [[containerCreated, ['rm', '-f', container]],
    [volumeCreated, ['volume', 'rm', volume]], [imageCreated, ['image', 'rm', image]]]) {
    if (created) await docker(args).catch(error => { console.error(`Fixture cleanup failed: ${error.message}`); process.exitCode = 1; });
  }
  await rm(temporary, { recursive: true, force: true });
}
