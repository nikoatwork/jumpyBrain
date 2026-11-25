import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, link, copyFile, symlink, realpath } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { installFakeQmd } from './fake-qmd-helper.js';
import { extractRelease, preflight, durableNode, nodeRuns, cliShim } from '../scripts/install-support.mjs';
import { desktopCompatibilityBlockers } from '../scripts/setup-desktop.mjs';
const repo = new URL('..', import.meta.url).pathname;
async function fixture(t) {
  const base = await mkdtemp(path.join(os.tmpdir(), 'jb-install-recovery-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const home = path.join(base, 'home'), source = path.join(base, 'source'), root = path.join(home, '.jumpybrain');
  await mkdir(home); await mkdir(path.join(source, 'dist'), { recursive: true });
  await writeFile(path.join(source, 'package.json'), JSON.stringify({ name: 'jumpybrain', version: '0.0.1' }));
  await writeFile(path.join(source, 'dist/cli.js'), `const fs=require('node:fs');const path=require('node:path');const args=process.argv.slice(2);const root=args[args.indexOf('--root')+1];if(args[0]==='init'){fs.mkdirSync(root,{recursive:true});fs.writeFileSync(path.join(root,'jumpybrain.json'),JSON.stringify({canonical:'markdown',memoryDirs:['notes']}));}if(args[0]===process.env.FIXTURE_FAIL)process.exit(1);console.log(JSON.stringify(args[0]==='doctor'?{ok:true}:{retrieval:{status:'complete'},results:[]}));`);
  const { bin } = await installFakeQmd(base); await writeFile(bin, '#!/bin/sh\necho "qmd 2.8.3"\n', { mode: 0o755 });
  const args = [path.join(repo, 'scripts/public-install.mjs'), '--source', source, '--home', home, '--install-root', root, '--skip-build', '--integrations', 'none', '--json'];
  const env = { ...process.env, HOME: home, JUMPYBRAIN_QMD_BIN: bin };
  const run = (extra = [], moreEnv = {}, node = process.execPath) => spawnSync(node, [...args, ...extra], { env: { ...env, ...moreEnv }, encoding: 'utf8' });
  return { base, home, source, root, env, run, bin };
}
test('failed first index is owned and retryable; existing canonical notes survive', async t => {
  const f = await fixture(t);
  const failed = f.run([], { FIXTURE_FAIL: 'index' });
  assert.equal(failed.status, 1, failed.stderr);
  assert.equal(JSON.parse(failed.stdout).state, 'failed');
  const manifest = path.join(f.root, 'install-manifest.json');
  assert.equal(JSON.parse(await readFile(manifest, 'utf8')).state, 'installing');
  const note = path.join(f.root, 'memory/keep.md'); await writeFile(note, '# Keep this\n');
  const retry = f.run(); assert.equal(retry.status, 0, retry.stderr);
  const report = JSON.parse(retry.stdout);
  assert.equal(report.state, 'ready'); assert.equal(report.checks.recall, true);
  assert.equal(await readFile(note, 'utf8'), '# Keep this\n');
  assert.equal(JSON.parse(await readFile(manifest, 'utf8')).state, 'ready');
});
test('JSON preflight failure and dry run make no installation; remote-only needs no QMD or notes', async t => {
  const f = await fixture(t);
  const bad = f.run([], { JUMPYBRAIN_QMD_BIN: process.execPath });
  assert.equal(bad.status, 1); assert.equal(JSON.parse(bad.stdout).state, 'blocked');
  assert.equal(existsSync(path.join(f.root, 'app')), false);
  const dry = f.run(['--dry-run']); assert.equal(dry.status, 0, dry.stderr); assert.equal(JSON.parse(dry.stdout).state, 'planned');
  assert.equal(existsSync(path.join(f.root, 'install-manifest.json')), false);
  const remote = f.run(['--remote-only'], { JUMPYBRAIN_QMD_BIN: '/absent/qmd' });
  assert.equal(remote.status, 0, remote.stderr); const report = JSON.parse(remote.stdout);
  assert.equal(report.engine, null); assert.equal(report.memoryRoot, null); assert.equal(report.checks.cli, true);
  assert.equal(existsSync(path.join(f.root, 'memory')), false); assert.equal(existsSync(path.join(f.root, 'engines')), false);
});
test('dead owned locks recover; live and unowned locks are preserved', async t => {
  const f = await fixture(t); const lock = path.join(f.root, '.installer-lock'); await mkdir(lock, { recursive: true });
  await writeFile(path.join(lock, 'owner.json'), JSON.stringify({ pid: process.pid, host: os.hostname() }));
  assert.notEqual(f.run().status, 0); assert.ok(existsSync(lock));
  await writeFile(path.join(lock, 'owner.json'), JSON.stringify({ pid: 2147483647, host: os.hostname() }));
  assert.equal(f.run().status, 0);
});
test('abandoned Mac app update locks are reclaimed only with proof; unprovable locks stay and say why', async t => {
  const f = await fixture(t), lock = path.join(f.root, '.installer-lock');
  const updates = path.join(f.home, 'Library/Application Support/jumpyBrain Updates'), directory = path.join(updates, 'update-abandoned');
  const reset = async files => {
    await rm(lock, { recursive: true, force: true }); await mkdir(lock, { recursive: true });
    for (const [name, value] of Object.entries(files)) await writeFile(path.join(lock, name), typeof value === 'string' ? value : JSON.stringify(value));
  };
  const refused = async (pattern) => {
    const result = f.run(); assert.equal(result.status, 1, result.stdout);
    assert.match(JSON.parse(result.stdout).error, pattern); assert.ok(existsSync(lock), 'an unprovable lock is never removed');
  };
  await mkdir(directory, { recursive: true });
  // Empty, foreign or unreadable records cannot be attributed to any process.
  await reset({}); await refused(/has no owner record.*cannot be ruled out.*Nothing was changed.*remove that folder/s);
  await reset({ 'owner.json': '{' }); await refused(/unreadable owner record/);
  await reset({ 'owner.json': { pid: 2147483647, host: 'earlier-network-name.local' } }); await refused(/another host name \(earlier-network-name\.local\)/);
  await reset({ 'desktop.json': { directory: path.join(f.base, 'elsewhere/update-x'), pid: 2147483647 } }); await refused(/unknown Mac app update folder/);
  // A live updater or build, or a replacement awaiting recovery, is never taken over.
  await reset({ 'desktop.json': { directory, pid: process.pid } }); await refused(/Mac app update is running/);
  await writeFile(path.join(directory, 'child.json'), JSON.stringify({ pid: process.pid }));
  await reset({ 'desktop.json': { directory, pid: 2147483647 } }); await refused(/Mac app update is running/);
  await writeFile(path.join(directory, 'child.json'), '{');
  await refused(/unreadable Mac app build record/);
  await rm(path.join(directory, 'child.json'));
  await writeFile(path.join(directory, 'transaction.json'), '{"phase":"published","exchanges":[]}');
  await refused(/needs recovery first.*Recover/s);
  // The worker never started (for example, dyld refused its Node): reclaim and install.
  await writeFile(path.join(directory, 'transaction.json'), '{"phase":"rolled-back","exchanges":[]}');
  let result = f.run(); assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /Recovered an abandoned Mac app update lock/);
  assert.equal(existsSync(lock), false, 'the reclaimed lock is released after installation');
  await rm(path.join(directory, 'transaction.json'));
  await reset({ 'desktop.json': { directory, pid: 2147483647 } });
  result = f.run(); assert.equal(result.status, 0, result.stderr); assert.equal(existsSync(lock), false);
});
test('Homebrew Node is pinned through its stable opt link, never a versioned Cellar keg', async t => {
  const f = await fixture(t), prefix = path.join(await realpath(f.base), 'brew'); // process.execPath is a real path
  // Brew layout: opt/node -> ../Cellar/node/<version>; bin/node -> ../Cellar/node/<version>/bin/node.
  const keg = path.join(prefix, 'Cellar/node/26.8.1'), cellarNode = path.join(keg, 'bin/node');
  await mkdir(path.dirname(cellarNode), { recursive: true }); await mkdir(path.join(prefix, 'opt'));
  const real = await realpath(process.execPath);
  try { await link(real, cellarNode); } catch { await copyFile(real, cellarNode); }
  // A Homebrew node loads @rpath/libnode from ../lib; an official static binary ignores it.
  if (existsSync(path.resolve(real, '../../lib'))) await symlink(path.resolve(real, '../../lib'), path.join(keg, 'lib'));
  await symlink('../Cellar/node/26.8.1', path.join(prefix, 'opt/node'));
  const stable = path.join(prefix, 'opt/node/bin/node');
  assert.equal(durableNode(cellarNode), stable);
  assert.equal(durableNode(path.join(prefix, 'Cellar/node@22/22.12.0/bin/node')), path.join(prefix, 'Cellar/node@22/22.12.0/bin/node'), 'no opt link: unchanged');
  assert.equal(durableNode('/usr/local/bin/node'), '/usr/local/bin/node');
  assert.equal(durableNode(path.join(f.root, 'runtimes/node-v24.0.0-darwin-arm64/bin/node')), path.join(f.root, 'runtimes/node-v24.0.0-darwin-arm64/bin/node'));
  if (!nodeRuns(cellarNode)) return t.skip('this Node cannot run from a relocated hard link');
  const installed = f.run([], {}, cellarNode); assert.equal(installed.status, 0, installed.stderr);
  const manifest = JSON.parse(await readFile(path.join(f.root, 'install-manifest.json'), 'utf8'));
  assert.equal(manifest.node, stable);
  const launcher = await readFile(path.join(f.root, 'bin/jumpybrain'), 'utf8');
  assert.equal(launcher, cliShim({ appDir: manifest.appDir, cliConfigPath: manifest.cliConfigPath, node: stable, qmd: manifest.qmd }));
  assert.doesNotMatch(launcher, /Cellar/);
});
test('Desktop setup refuses a recorded Node that exists but no longer loads, with the installer repair', async t => {
  const f = await fixture(t);
  assert.equal(f.run().status, 0);
  const manifest = JSON.parse(await readFile(path.join(f.root, 'install-manifest.json'), 'utf8'));
  const appDir = manifest.appDir;
  await mkdir(path.join(appDir, 'integrations/electron'), { recursive: true });
  await writeFile(path.join(appDir, 'integrations/electron/package.json'), JSON.stringify({ version: '0.0.1' }));
  const broken = path.join(f.base, 'Cellar/node/26.8.1/bin/node'); await mkdir(path.dirname(broken), { recursive: true });
  await writeFile(broken, '#!/bin/sh\necho "dyld: Library not loaded: libsimdjson.33.dylib" >&2\nkill -ABRT $$\n', { mode: 0o755 });
  const passes = () => ({ status: 0 });
  assert.deepEqual(desktopCompatibilityBlockers(manifest, f.root, {}), []);
  const blockers = desktopCompatibilityBlockers({ ...manifest, node: broken }, f.root, {});
  assert.equal(blockers.length, 1); assert.match(blockers[0], /Node\.js recorded for the CLI no longer starts.*Homebrew.*will not reuse it/);
  assert.equal(nodeRuns(broken), false); assert.equal(nodeRuns(process.execPath), true); assert.equal(nodeRuns('relative/node'), false);
  assert.equal(nodeRuns(broken, { probe: passes }), true, 'the probe is injectable');
  // The full setup path names the installer rerun rather than desktop:setup again.
  await writeFile(path.join(f.root, 'install-manifest.json'), JSON.stringify({ ...manifest, node: broken }));
  const setup = spawnSync(process.execPath, [path.join(repo, 'scripts/setup-desktop.mjs'), '--prepared', appDir, '--home', f.home], { env: { ...f.env, PATH: process.env.PATH }, encoding: 'utf8' });
  assert.equal(setup.status, 1);
  if (process.platform === 'darwin' && !/Desktop setup needs/.test(setup.stderr)) {
    assert.match(setup.stderr, /no longer starts.*Nothing was built or installed\. Repair the CLI's Node selection.*install\.sh \| bash -s -- --with-app/s);
    assert.doesNotMatch(setup.stderr, /--source release/);
  }
});
test('bootstrap ignores an unrelated current-directory installer and downloads a consistent helper set', async t => {
  const f = await fixture(t); await mkdir(path.join(f.base, 'scripts'));
  await writeFile(path.join(f.base, 'scripts/public-install.mjs'), 'throw new Error("UNRELATED_EXECUTED");');
  const run = spawnSync('sh', [path.join(repo, 'install.sh'), '--help'], { cwd: f.base, encoding: 'utf8', env: { ...f.env, JUMPYBRAIN_RAW_BASE: `file://${repo}` } });
  assert.equal(run.status, 0, run.stderr); assert.match(run.stdout, /Usage: install.sh/); assert.doesNotMatch(run.stderr, /UNRELATED_EXECUTED/);
});
function archive(entries) {
  const parts = [];
  for (const [name, data = '', type = '0'] of entries) {
    const body = Buffer.from(data), h = Buffer.alloc(512);
    h.write(name); h.write('0000644\0', 100); h.write(body.length.toString(8).padStart(11, '0') + '\0', 124);
    h.fill(32, 148, 156); h.write(type, 156); h.write('ustar\0', 257);
    h.write(h.reduce((a, b) => a + b, 0).toString(8).padStart(6, '0') + '\0 ', 148);
    parts.push(h, body, Buffer.alloc((512 - body.length % 512) % 512));
  }
  return gzipSync(Buffer.concat([...parts, Buffer.alloc(1024)]));
}
test('release extraction rejects links/traversal/duplicates before writing; valid compiled assets extract', async t => {
  const f = await fixture(t);
  for (const entries of [[['package/../outside', 'x']], [['package/link', '', '2']], [['package/a', 'x'], ['package/a', 'y']]]) {
    const destination = path.join(f.base, 'rejected');
    await assert.rejects(extractRelease(archive(entries), destination)); assert.equal(existsSync(destination), false);
  }
  const destination = path.join(f.base, 'accepted');
  await extractRelease(archive([['package/package.json', '{}'], ['package/dist/cli.js', 'ok']]), destination);
  assert.equal(await readFile(path.join(destination, 'dist/cli.js'), 'utf8'), 'ok');
});

test('uninstall preserves an integration edited after installation', async t => {
  const f = await fixture(t);
  await mkdir(path.join(f.source, 'skills/jumpybrain-memory'), { recursive: true });
  await writeFile(path.join(f.source, 'skills/jumpybrain-memory/SKILL.md'), '# Memory\n__JUMPYBRAIN_CLI__\n');
  const installed = f.run(['--integrations', 'auto'], { JUMPYBRAIN_TEST_AVAILABLE_HARNESSES: 'codex' });
  assert.equal(installed.status, 0, installed.stderr);
  const skill = path.join(f.home, '.agents/skills/jumpybrain-memory/SKILL.md');
  await writeFile(skill, '# My customized integration\n');
  const removed = spawnSync(process.execPath, [path.join(repo, 'scripts/public-uninstall.mjs'), '--home', f.home, '--install-root', f.root], { encoding: 'utf8' });
  assert.equal(removed.status, 0, removed.stderr);
  assert.equal(await readFile(skill, 'utf8'), '# My customized integration\n');
  assert.equal(existsSync(path.join(f.root, 'memory')), true);
});


test('a broken replacement fails before publication and preserves the working CLI', async t => {
  const f = await fixture(t);
  assert.equal(f.run().status, 0);
  const installed = path.join(f.root, 'app/dist/cli.js');
  const before = await readFile(installed, 'utf8');
  await writeFile(path.join(f.source, 'dist/cli.js'), 'process.exit(7);');
  const failed = f.run();
  assert.equal(failed.status, 1);
  assert.equal(await readFile(installed, 'utf8'), before);
  assert.equal(JSON.parse(await readFile(path.join(f.root, 'install-manifest.json'), 'utf8')).state, 'ready');
});


test('uninstall removes owned private engines unless the installed app still depends on them', async t => {
  for (const dependent of [false, true]) {
    const f = await fixture(t);
    assert.equal(f.run().status, 0);
    const engines = path.join(f.root, 'engines');
    await mkdir(engines);
    await writeFile(path.join(engines, 'owner.json'), JSON.stringify({installer:'jumpybrain-installer',schemaVersion:1}));
    if (dependent) {
      const resources = path.join(f.home, 'Applications/jumpyBrain.app/Contents/Resources/native/jumpyBrain Host.app/Contents/Resources');
      await mkdir(resources, { recursive: true });
      await writeFile(path.join(resources, 'Configuration.json'), JSON.stringify({qmd:path.join(engines, 'qmd/bin/qmd')}));
    }
    const result = spawnSync(process.execPath, [path.join(repo, 'scripts/public-uninstall.mjs'), '--home', f.home], {env:f.env,encoding:'utf8'});
    assert.equal(result.status, 0, result.stderr);
    assert.equal(existsSync(engines), dependent);
    assert.ok(existsSync(path.join(f.root, 'memory')));
  }
});
