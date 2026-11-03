import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { softwareStorage } from '../scripts/installation-storage.mjs';
import { maintainInstalledSoftware } from '../integrations/electron/software-maintenance.mjs';
import { runWorker } from '../integrations/electron/update-worker.mjs';

const repo = new URL('..', import.meta.url).pathname;
test('shared Python policy covers repeated and adversarial installation cycles', () => {
  const result = spawnSync('python3', ['-B', path.join(repo, 'integrations/electron/test_installation_retention.py')], { encoding: 'utf8', timeout: 30000 });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
test('twenty real CLI-only source replacements plateau and the retained CLI still executes', async t => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'jb-software-cycles-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const root = path.join(home, '.jumpybrain'), source = path.join(home, 'source');
  await mkdir(path.join(source, 'dist/adapters/backend-host'), { recursive: true });
  await writeFile(path.join(source, 'package.json'), '{"name":"jumpybrain","version":"0.3.19"}');
  await writeFile(path.join(source, 'dist/cli.js'), 'console.log("0.3.19")');
  await writeFile(path.join(source, 'dist/adapters/backend-host/runtime-pins.js'), 'export const BUNDLE_PIN_PROTOCOL=1;');
  const memory = path.join(root, 'memory'); await mkdir(memory, { recursive: true });
  await writeFile(path.join(memory, 'keep.md'), 'canonical data\n');
  const sizes = [];
  for (let i = 0; i < 20; i++) {
    const result = spawnSync(process.execPath, [path.join(repo, 'scripts/public-install.mjs'), '--home', home, '--source', source,
      '--remote-only', '--skip-build', '--integrations', 'none', '--json'], { encoding: 'utf8', env: { ...process.env, HOME: home } });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).checks.cli, true);
    const containers = (await readdir(root)).filter(n => n.startsWith('app.previous-'));
    assert.equal(containers.length, i === 0 ? 0 : 1, result.stderr);
    sizes.push(JSON.parse(result.stdout).storage.ownedLogicalBytes);
  }
  assert.ok(Math.max(...sizes.slice(2)) - Math.min(...sizes.slice(2)) < 100, JSON.stringify(sizes));
  const preview = softwareStorage('preview', { root, home });
  const rollback = preview.rollbackDetails.cli.paths[0];
  const executable = spawnSync(process.execPath, [path.join(rollback, 'app/dist/cli.js'), '--version'], { encoding: 'utf8' });
  assert.equal(executable.status, 0, executable.stderr); assert.equal(executable.stdout.trim(), '0.3.19');
  assert.equal(await readFile(path.join(memory, 'keep.md'), 'utf8'), 'canonical data\n');
  assert.equal(await readFile(path.join(root, 'app/package.json'), 'utf8'), await readFile(path.join(source, 'package.json'), 'utf8'));
  console.log(JSON.stringify({ sourceCLICycles: 20, retainedGenerations: 1, logicalBytes: sizes.at(-1) }));
});

test('packaged startup retry uses the same policy and defers an existing installer lock', async t => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'jb-software-startup-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const root = path.join(home, '.jumpybrain'); await mkdir(root);
  const resources = path.join(home, 'resources'), tools = path.join(resources, 'installation-tools');
  await mkdir(tools, { recursive: true });
  for (const name of ['installation-retention.py', 'update-retention.py']) {
    await writeFile(path.join(tools, name), await readFile(path.join(repo, 'integrations/electron', name)));
  }
  for (let i = 0; i < 2; i++) {
    const directory = path.join(root, `app.previous-${i}`); await mkdir(directory); await writeFile(path.join(directory, 'software'), 'bytes');
    const generation = softwareStorage('begin', { root, home, producer: 'source-cli', components: ['cli'], payloads: [{ path: directory }] });
    softwareStorage('finish', { root, home, generation });
  }
  const lock = path.join(root, '.installer-lock'); await mkdir(lock);
  await maintainInstalledSoftware({ resources, home });
  assert.equal((await readdir(root)).filter(n => n.startsWith('app.previous-')).length, 2);
  await rm(lock, { recursive: true });
  await maintainInstalledSoftware({ resources, home });
  assert.equal((await readdir(root)).filter(n => n.startsWith('app.previous-')).length, 1);
  assert.equal(softwareStorage('preview', { root, home }).lastCleanup.removed.length, 1);
});

test('twenty handled updater failures compact after their workers exit', { skip: process.platform !== 'darwin' }, async t => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'jb-failed-update-cycles-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const root = path.join(home, '.jumpybrain'), updates = path.join(home, 'Library/Application Support/jumpyBrain Updates');
  await mkdir(root); await mkdir(updates, { recursive: true });
  for (let i = 0; i < 20; i++) {
    const directory = path.join(updates, `update-${i}`); await mkdir(directory);
    for (const name of ['installation-retention.py', 'update-retention.py']) {
      await writeFile(path.join(directory, name), await readFile(path.join(repo, 'integrations/electron', name)));
    }
    const lock = path.join(root, '.installer-lock'); await mkdir(lock, { mode: 0o700 });
    await writeFile(path.join(lock, 'desktop.json'), JSON.stringify({ directory, pid: process.pid }));
    await writeFile(path.join(directory, 'request.json'), JSON.stringify({ home, node: process.execPath, parentPid: process.pid,
      updateCLI: true, release: { version: '0.3.19' }, configuration: { qmd: '/unused/qmd' } }));
    await runWorker(directory, { diskSpace: async () => ({ bavail: 0, bsize: 4096 }) });
    const state = JSON.parse(await readFile(path.join(directory, 'state.json')));
    assert.equal(state.phase, 'failed');
    // Each real worker is a separate process. Model its exit after the in-process
    // fixture returns, then use the normal subsequent-installation retry.
    await writeFile(path.join(directory, 'state.json'), JSON.stringify({ ...state, pid: 99999999 }));
    softwareStorage('apply', { root, home });
    assert.equal((await readdir(updates)).filter(n => n.startsWith('update-')).length, 0);
  }
  const ledger = JSON.parse(await readFile(path.join(root, 'software-retention.json')));
  assert.equal(ledger.history.length, 20); assert.equal(ledger.records.length, 0);
});
