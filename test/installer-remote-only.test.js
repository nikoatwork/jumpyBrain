// Remote-only installation footprint, exact filesystem reporting and read-only
// command mode, in disposable homes. No real home, release or network is used.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, mkdir, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { gzipSync } from 'node:zlib';
import { durableNode } from '../scripts/install-support.mjs';
import { initializeMemoryRoot } from '../dist/runtime/index.js';
import { startJumpyBrainHttpServer } from '../dist/server/index.js';
import { stopRootBackend } from '../dist/app/backend-host/index.js';
import { installFakeQmd } from './fake-qmd-helper.js';

const run = promisify(execFile);
const repo = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const installer = path.join(repo, 'scripts/public-install.mjs');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const VERSION = '9.9.9';
const fakeCli = `const fs=require('node:fs');const path=require('node:path');const args=process.argv.slice(2);const root=args[args.indexOf('--root')+1];
if(args[0]==='--version'){console.log('${VERSION}');process.exit(0);}
if(args[0]==='init'){fs.mkdirSync(root,{recursive:true});fs.writeFileSync(path.join(root,'jumpybrain.json'),JSON.stringify({canonical:'markdown',memoryDirs:['notes']}));process.exit(0);}
console.log(JSON.stringify(args[0]==='doctor'?{ok:true}:{retrieval:{status:'complete'},results:[]}));`;

async function tree(directory) {
  const out = {};
  async function walk(current) {
    for (const entry of await readdir(current, { withFileTypes: true }).catch(() => [])) {
      const file = path.join(current, entry.name), name = path.relative(directory, file);
      if (entry.isDirectory()) { out[`${name}/`] = 'dir'; await walk(file); }
      else out[name] = entry.isSymbolicLink() ? 'link' : sha(await readFile(file));
    }
  }
  await walk(directory);
  return out;
}

// A home that already holds agent configuration, and tools that record any use.
async function home(t) {
  // The installed CLI resolves its own real path; keep the fixture free of a linked temp directory.
  const base = await realpath(await mkdtemp(path.join(os.tmpdir(), 'jb-remote-only-')));
  t.after(() => rm(base, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }));
  const directory = path.join(base, 'home'), tools = path.join(base, 'tools'), used = path.join(base, 'tool-used');
  await mkdir(path.join(directory, '.claude/skills/other'), { recursive: true }); await mkdir(tools);
  await writeFile(path.join(directory, '.claude/skills/other/SKILL.md'), '# Someone else\'s skill\n');
  await writeFile(path.join(directory, '.claude/settings.json'), '{"shared":true}\n');
  for (const name of ['npm', 'qmd', 'git']) await writeFile(path.join(tools, name), `#!/bin/sh\necho ${name} >> '${used}'\nexit 1\n`, { mode: 0o755 });
  const env = { ...process.env, HOME: directory, PATH: `${tools}:/usr/bin:/bin`, JUMPYBRAIN_QMD_BIN: '/absent/qmd', JUMPYBRAIN_API_KEY: '', JUMPYBRAIN_ENV_FILE: path.join(base, 'absent.env') };
  for (const key of ['JUMPYBRAIN_INSTALL_SOURCE', 'JUMPYBRAIN_INSTALL_REF', 'JUMPYBRAIN_CLI_CONFIG', 'JUMPYBRAIN_READ_ONLY_COMMANDS', 'JUMPYBRAIN_MEMORY_ROOT', 'JUMPYBRAIN_BOOTSTRAP_DIR']) delete env[key];
  const root = path.join(directory, '.jumpybrain');
  const install = (args = [], more = {}) => {
    const result = spawnSync(process.execPath, [installer, '--home', directory, '--json', ...args], { cwd: base, env: { ...env, ...more }, encoding: 'utf8' });
    let report = null; try { report = JSON.parse(result.stdout); } catch {}
    return { ...result, report };
  };
  return { base, home: directory, root, cli: path.join(root, 'bin/jumpybrain'), env, used, install };
}

async function fakeSource(base) {
  const source = path.join(base, 'source');
  await mkdir(path.join(source, 'dist'), { recursive: true });
  await writeFile(path.join(source, 'package.json'), JSON.stringify({ name: 'jumpybrain', version: VERSION }));
  await writeFile(path.join(source, 'dist/cli.js'), fakeCli);
  return ['--source', source, '--skip-build'];
}

function tarGz(entries) {
  const parts = [];
  for (const [name, data] of entries) {
    const body = Buffer.from(data), header = Buffer.alloc(512);
    header.write(`package/${name}`); header.write('0000644\0', 100); header.write(body.length.toString(8).padStart(11, '0') + '\0', 124);
    header.fill(32, 148, 156); header.write('0', 156); header.write('ustar\0', 257);
    header.write(header.reduce((a, b) => a + b, 0).toString(8).padStart(6, '0') + '\0 ', 148);
    parts.push(header, body, Buffer.alloc((512 - body.length % 512) % 512));
  }
  return gzipSync(Buffer.concat([...parts, Buffer.alloc(1024)]));
}

const rootEntries = async root => (await readdir(root)).sort();
// Everything a run left in the install root must be a reported change (plus the ledger's lock).
function reportedEntries(report, root) {
  const names = report.filesystem.changes.filter(item => item.present && item.path !== root).map(item => path.relative(root, item.path).split(path.sep)[0]);
  if (names.includes('software-retention.json')) names.push('.software-retention.lock');
  return [...new Set(names)].sort();
}

test('a remote-only consumer installs and reads a shared brain without QMD, npm, dependencies or agent files', async t => {
  const f = await home(t);
  const before = await tree(f.home);
  const installed = f.install(['--remote-only', '--source', repo, '--skip-build']);
  assert.equal(installed.status, 0, installed.stderr);
  const report = installed.report;
  assert.deepEqual([report.state, report.remoteOnly, report.engine, report.memoryRoot, report.checks.cli, report.commandMode], ['ready', true, null, null, true, 'read-write']);
  assert.deepEqual(report.integrations, []);

  // Footprint: the compiled package only. No engine, brain, dependencies or Electron.
  for (const absent of ['engines', 'memory', 'app/node_modules', 'app/integrations/electron/node_modules', 'cli-config.json', 'runtimes']) assert.equal(existsSync(path.join(f.root, absent)), false, absent);
  assert.equal(existsSync(f.used), false, 'npm, qmd and git were never run');
  const manifest = JSON.parse(await readFile(path.join(f.root, 'install-manifest.json'), 'utf8'));
  assert.deepEqual([manifest.remoteOnly, manifest.integrationMode, manifest.qmd, manifest.integrations, manifest.state], [true, 'none', null, [], 'ready']);
  assert.doesNotMatch(await readFile(f.cli, 'utf8'), /JUMPYBRAIN_QMD_BIN/);

  // Side effects: only the install root changed, and every entry in it is reported.
  const after = await tree(f.home);
  for (const [name, value] of Object.entries(before)) assert.equal(after[name], value, `${name} changed`);
  assert.deepEqual(Object.keys(after).filter(name => !(name in before) && !name.startsWith('.jumpybrain/')), []);
  assert.equal(report.filesystem.mode, 'applied');
  assert.deepEqual(await rootEntries(f.root), reportedEntries(report, f.root));
  assert.ok(report.filesystem.changes.every(item => item.present && item.path.startsWith(f.root)));
  const untouched = Object.fromEntries(report.filesystem.untouched.map(item => [item.path, item.reason]));
  for (const name of ['.claude', '.agents', '.pi', '.codex', '.config/jumpybrain/.env', '.jumpybrain/memory', '.jumpybrain/engines']) assert.ok(untouched[path.join(f.home, name)], name);
  assert.deepEqual(report.filesystem.node, { path: durableNode(process.execPath), version: process.version, private: false });
  assert.deepEqual(report.filesystem.network, [], 'a local source with --skip-build contacts nothing');

  // A real server with a reader key: remote reads work, and the server refuses a write.
  const brain = await mkdtemp(path.join(os.tmpdir(), 'jb-remote-only-brain-')); await initializeMemoryRoot(brain);
  const server = await startJumpyBrainHttpServer({ root: brain, apiKeys: ['disposable-operator-key'], port: 0, autoIndex: false });
  t.after(async () => { await server.close(); await rm(brain, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }); });
  const issued = await (await fetch(`${server.url}/access`, { method: 'POST', headers: { Authorization: 'Bearer disposable-operator-key', 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Headless agent', role: 'reader' }) })).json();
  await mkdir(path.join(brain, 'notes'), { recursive: true });
  await writeFile(path.join(brain, 'notes/shared.md'), '---\nid: mem_00000000-0000-4000-8000-000000000001\ntitle: Shared decision\ntype: decision\n---\n\nRelease on Tuesdays.\n');
  const consumer = (args, key = issued.token) => {
    const pending = run(f.cli, [...args, '--target-url', server.url], { env: { ...f.env, JUMPYBRAIN_API_KEY: key }, timeout: 30000 });
    pending.child.stdin.end('A body the server must never store.\n');
    return pending;
  };
  const status = JSON.parse((await consumer(['status', '--json'])).stdout);
  assert.equal(status.target.kind, 'remote');
  assert.match((await consumer(['tree'])).stdout, /shared\.md|Shared decision|notes/);
  assert.match((await consumer(['show', '--id', 'mem_00000000-0000-4000-8000-000000000001'])).stdout, /Release on Tuesdays\./);
  await assert.rejects(consumer(['remember', '--title', 'Denied', '--type', 'decision'], issued.token), error => /403|read.only|reader/i.test(error.stderr) && !/JUMPYBRAIN_READ_ONLY_COMMANDS/.test(error.stderr));

  // Read-only command mode: the same installation now refuses writes itself, even with a writer key.
  const policy = f.install(['--read-only-commands']);
  assert.equal(policy.status, 0, policy.stderr);
  assert.equal(policy.report.commandMode, 'read-only');
  assert.deepEqual(JSON.parse(await readFile(path.join(f.root, 'cli-config.json'), 'utf8')), { schemaVersion: 1, remoteTargets: [], commands: 'read-only' });
  assert.deepEqual(await rootEntries(f.root), reportedEntries(policy.report, f.root));
  const rollback = policy.report.filesystem.changes.find(item => item.role === 'rollback-runtime');
  assert.ok(rollback.present && /app\.previous-/.test(rollback.path));
  assert.equal(existsSync(path.join(f.root, 'app/node_modules')), false);
  for (const args of [['remember', '--title', 'Denied', '--type', 'decision'], ['index'], ['access', 'issue', '--name', 'Eve', '--role', 'admin'], ['delete', '--id', 'mem_00000000-0000-4000-8000-000000000001']]) {
    await assert.rejects(consumer(args, 'disposable-operator-key'), error => /JUMPYBRAIN_READ_ONLY_COMMANDS/.test(error.stderr), args.join(' '));
  }
  assert.match((await consumer(['show', '--id', 'mem_00000000-0000-4000-8000-000000000001'])).stdout, /Release on Tuesdays\./);
  assert.deepEqual((await readdir(path.join(brain, 'notes'))).sort(), ['shared.md'], 'nothing was written to the shared brain');

  // The installed update preview works without dependencies and changes nothing.
  const snapshot = await tree(f.home);
  const preview = await run(f.cli, ['update', '--dry-run', '--home', f.home], { env: f.env });
  assert.match(preview.stdout, /Filesystem plan \(dry run: nothing was written\)/);
  assert.deepEqual(await tree(f.home), snapshot);

  const lifted = f.install(['--allow-write-commands']);
  assert.equal(lifted.status, 0, lifted.stderr);
  assert.equal(lifted.report.commandMode, 'read-write');
  assert.equal(existsSync(path.join(f.root, 'cli-config.json')), false);
  assert.equal(existsSync(f.used), false);

  // Uninstall reports no brain for an installation that never had one; it keeps the ledger files and rollback copies.
  const removed = spawnSync(process.execPath, [path.join(repo, 'scripts/public-uninstall.mjs'), '--home', f.home], { env: f.env, encoding: 'utf8' });
  assert.equal(removed.status, 0, removed.stderr);
  assert.doesNotMatch(removed.stdout, /Memory preserved|\.jumpybrain\/memory/);
  assert.deepEqual((await rootEntries(f.root)).filter(name => !name.startsWith('app.previous-')), ['.software-retention.lock', 'software-retention.json']);
});

test('fresh local provisioning completes outside read-only command mode while the installed CLI stays restricted', async t => {
  for (const mode of ['flag', 'environment']) {
    const f = await home(t);
    const { bin } = await installFakeQmd(f.base);
    await mkdir(path.dirname(bin), { recursive: true });
    await writeFile(bin, `#!${process.execPath}\nconsole.log(process.argv.includes('--version') ? 'qmd 2.8.3' : '[]');\n`, { mode: 0o755 });
    const extra = { JUMPYBRAIN_QMD_BIN: bin, ...(mode === 'environment' ? { JUMPYBRAIN_READ_ONLY_COMMANDS: '1' } : {}) };
    const args = ['--source', repo, '--skip-build', '--skip-qmd-install', '--integrations', 'none', ...(mode === 'flag' ? ['--read-only-commands'] : [])];
    const brain = path.join(f.root, 'memory');
    try {
      const installed = f.install(args, extra);
      assert.equal(installed.status, 0, `${mode}: ${installed.stderr}`);
      assert.equal(installed.report.state, 'ready');
      assert.equal(installed.report.checks.recall, true, 'init, index and retrieval verification all completed');
      assert.equal(JSON.parse(await readFile(path.join(f.root, 'install-manifest.json'), 'utf8')).state, 'ready');
      assert.equal(existsSync(path.join(brain, 'jumpybrain.json')), true);
      const blocked = spawnSync(f.cli, ['init', '--root', path.join(f.base, 'must-not-create')], { env: { ...f.env, ...extra }, encoding: 'utf8' });
      assert.equal(blocked.status, 1);
      assert.match(blocked.stderr, /JUMPYBRAIN_READ_ONLY_COMMANDS/);
      assert.equal(existsSync(path.join(f.base, 'must-not-create')), false);
      const policy = path.join(f.root, 'cli-config.json');
      const before = existsSync(policy) ? await readFile(policy, 'utf8') : null;
      // Resume the fresh-install path with an already persisted policy, as after
      // an interruption between installing the launcher and provisioning the root.
      const manifestPath = path.join(f.root, 'install-manifest.json');
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
      await writeFile(manifestPath, JSON.stringify({ ...manifest, state: 'installing' }));
      const repeated = f.install(['--source', repo, '--skip-build', '--skip-qmd-install', '--integrations', 'none'], extra);
      assert.equal(repeated.status, 0, repeated.stderr);
      assert.equal(repeated.report.checks.recall, true);
      assert.equal(existsSync(policy) ? await readFile(policy, 'utf8') : null, before, 'rerun does not lift the installed restriction');
    } finally { await stopRootBackend(brain).catch(() => {}); }
  }
});

test('a remote-only release install needs no npm and installs no runtime dependencies', async t => {
  const f = await home(t);
  const archive = path.join(f.base, `jumpybrain-${VERSION}.tgz`);
  const lock = JSON.stringify({ name: 'jumpybrain', version: VERSION, lockfileVersion: 3, requires: true, packages: { '': { name: 'jumpybrain', version: VERSION, dependencies: { esbuild: '0.28.2' } } } });
  const bytes = tarGz([['package.json', JSON.stringify({ name: 'jumpybrain', version: VERSION, dependencies: { esbuild: '0.28.2' } })], ['dist/cli.js', fakeCli], ['dist/runtime-package-lock.json', lock]]);
  await writeFile(archive, bytes);
  const url = `https://github.com/nikoatwork/jumpyBrain/releases/download/v${VERSION}/jumpybrain-${VERSION}.tgz`;
  const release = [{ id: 1, tag_name: `v${VERSION}`, published_at: '2026-11-20T00:00:00Z', assets: [{ id: 2, name: `jumpybrain-${VERSION}.tgz`, state: 'uploaded', digest: `sha256:${sha(bytes)}`, size: bytes.length, browser_download_url: url }] }];
  const preload = path.join(f.base, 'release-fixture.mjs');
  await writeFile(preload, `import {readFile} from 'node:fs/promises';globalThis.fetch=async u=>{if(String(u).startsWith('https://api.github.com/repos/nikoatwork/jumpyBrain/releases?'))return new Response(${JSON.stringify(JSON.stringify(release))});if(String(u)===${JSON.stringify(url)})return new Response(await readFile(${JSON.stringify(archive)}));throw new Error('unexpected network '+u);};`);
  const fixture = { NODE_OPTIONS: `--import=${preload}` };

  for (const [args, action] of [[['--remote-only'], 'create'], [[], 'replace']]) {
    const result = f.install(args, fixture);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual([result.report.state, result.report.version, result.report.filesystem.runtimeDependencies], ['ready', VERSION, 'omitted']);
    assert.equal(result.report.filesystem.changes.find(item => item.role === 'runtime').action, action);
    assert.deepEqual(result.report.filesystem.network.map(item => item.host), ['api.github.com', 'github.com']);
    assert.equal(existsSync(path.join(f.root, 'app/node_modules')), false);
    assert.equal(existsSync(f.used), false, 'npm was never run');
    assert.deepEqual(await rootEntries(f.root), reportedEntries(result.report, f.root));
  }
  assert.equal(JSON.parse(await readFile(path.join(f.root, 'install-manifest.json'), 'utf8')).remoteOnly, true, 'a plain rerun stays remote-only');
});

test('dry runs are observational: the plan names every path and nothing in the home changes', async t => {
  const f = await home(t);
  const before = await tree(f.base);
  const remote = f.install(['--remote-only', '--dry-run', '--read-only-commands', ...await fakeSource(f.base)]);
  const source = await tree(path.join(f.base, 'source'));
  assert.equal(remote.status, 0, remote.stderr);
  assert.deepEqual([remote.report.state, remote.report.filesystem.mode, remote.report.commandMode], ['planned', 'plan', 'read-only']);
  assert.deepEqual(remote.report.filesystem.changes.map(item => [item.role, item.action, path.relative(f.home, item.path)]), [
    ['install-root', 'create', '.jumpybrain'], ['runtime', 'create', '.jumpybrain/app'], ['launcher', 'create', '.jumpybrain/bin/jumpybrain'],
    ['manifest', 'create', '.jumpybrain/install-manifest.json'], ['cli-policy', 'create', '.jumpybrain/cli-config.json'], ['retention-ledger', 'create', '.jumpybrain/software-retention.json'],
  ]);

  // A local plan with every integration lists the agent files it would create, and creates none.
  const local = f.install(['--dry-run', '--integrations', 'all', '--skip-qmd-install', '--skip-initial-index', '--source', path.join(f.base, 'source'), '--skip-build']);
  assert.equal(local.status, 0, local.stderr);
  const planned = Object.fromEntries(local.report.filesystem.changes.map(item => [path.relative(f.home, item.path), item.action]));
  for (const file of ['.claude/skills/jumpybrain-memory/SKILL.md', '.agents/skills/jumpybrain-memory/SKILL.md', '.pi/agent/extensions/jumpybrain-memory.ts', '.jumpybrain/memory']) assert.equal(planned[file], 'create', file);
  const skipped = local.report.filesystem.untouched.map(item => path.relative(f.home, item.path));
  assert.ok(skipped.includes('.codex') && !skipped.includes('.claude'));
  for (const report of [remote.report, local.report]) {
    for (const item of [...report.filesystem.changes, ...report.filesystem.untouched, ...report.filesystem.temporary]) assert.ok(item.path.startsWith(f.home + path.sep), item.path);
  }

  const after = await tree(f.base);
  for (const name of Object.keys(source)) delete after[`source/${name}`];
  delete after['source/'];
  assert.deepEqual(after, before, 'neither dry run wrote anything');
  assert.equal(existsSync(f.used), false);

  // An update plan for an existing installation is observational too.
  const source2 = ['--source', path.join(f.base, 'source'), '--skip-build'];
  assert.equal(f.install(['--remote-only', ...source2]).status, 0);
  const installed = await tree(f.home);
  const update = f.install(['--dry-run', ...source2]);
  assert.deepEqual([update.status, update.report.state, update.report.filesystem.mode], [0, 'planned', 'plan']);
  assert.ok(update.report.filesystem.changes.some(item => item.role === 'rollback-runtime' && item.action === 'create'));
  assert.deepEqual(await tree(f.home), installed);
});

test('conflicting modes stop before any change', async t => {
  const f = await home(t);
  const source = await fakeSource(f.base);
  const fake = path.join(f.base, 'qmd-ok'); await writeFile(fake, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  for (const [args, message] of [
    [['--remote-only', '--with-app'], /--remote-only requires --integrations none and cannot include --with-app/],
    [['--remote-only', '--integrations', 'all'], /--remote-only requires --integrations none/],
    [['--remote-only', '--memory-root', path.join(f.base, 'brain')], /creates no local brain/],
    [['--read-only-commands', '--allow-write-commands'], /cannot be combined/],
  ]) {
    const result = f.install([...args, ...source]);
    assert.equal(result.status, 1, args.join(' ')); assert.match(result.stderr, message);
    assert.equal(existsSync(f.root), false, args.join(' '));
  }

  // A local installation cannot be converted in place: its engine and brain would be orphaned.
  const local = f.install(['--integrations', 'none', '--skip-qmd-install', '--skip-initial-index', ...source]);
  assert.equal(local.status, 0, local.stderr);
  const before = await tree(f.home);
  const converted = f.install(['--remote-only', ...source]);
  assert.equal(converted.status, 1);
  assert.deepEqual([converted.report.state, converted.report.blockers.length], ['blocked', 1]);
  assert.match(converted.report.error, /cannot convert it.*Nothing was changed/);
  assert.deepEqual(await tree(f.home), before);
  assert.equal(JSON.parse(await readFile(path.join(f.root, 'install-manifest.json'), 'utf8')).remoteOnly, false);

  // A remote-only installation cannot gain the Mac app.
  const g = await home(t);
  const remoteSource = await fakeSource(g.base);
  assert.equal(g.install(['--remote-only', ...remoteSource]).status, 0);
  const remoteBefore = await tree(g.home);
  const app = g.install(['--with-app', ...remoteSource]);
  assert.equal(app.status, 1); assert.equal(app.report.state, 'blocked');
  assert.match(app.report.error, /is remote-only.*Mac app cannot be added/);
  assert.deepEqual(await tree(g.home), remoteBefore);
});

test('read-only command mode is installer-managed, reversible and leaves existing target policy intact', async t => {
  const f = await home(t);
  const source = await fakeSource(f.base);
  const config = path.join(f.root, 'cli-config.json');
  const read = async () => JSON.parse(await readFile(config, 'utf8'));
  assert.equal(f.install(['--remote-only', '--read-only-target', 'https://memory.example/path', ...source]).status, 0);
  const original = await readFile(config, 'utf8');
  assert.deepEqual(JSON.parse(original), { schemaVersion: 1, remoteTargets: [{ origin: 'https://memory.example', access: 'read-only' }] }, 'no command key unless the mode is on');

  const on = f.install(['--read-only-commands', ...source]);
  assert.equal(on.status, 0, on.stderr);
  assert.deepEqual(await read(), { schemaVersion: 1, remoteTargets: [{ origin: 'https://memory.example', access: 'read-only' }], commands: 'read-only' });
  const plain = f.install(source);
  assert.deepEqual([plain.status, plain.report.commandMode], [0, 'read-only'], 'a plain rerun preserves and reports the mode');
  assert.match(plain.stderr, /preserved at .*\(read-only commands\)/);
  assert.equal(f.install(['--allow-write-target', 'https://memory.example', ...source]).status, 0);
  assert.deepEqual(await read(), { schemaVersion: 1, remoteTargets: [], commands: 'read-only' }, 'target flags do not lift the command mode');
  assert.equal(f.install(['--read-only-target', 'https://memory.example', '--allow-write-commands', ...source]).status, 0);
  assert.equal(await readFile(config, 'utf8'), original, 'lifting the mode restores the earlier file exactly');

  await writeFile(config, JSON.stringify({ schemaVersion: 1, remoteTargets: [], commands: 'everything' }));
  const refused = f.install(['--read-only-commands', ...source]);
  assert.equal(refused.status, 1); assert.match(refused.stderr, /unsupported or ambiguous schema/);
  const preserved = await readFile(config, 'utf8');
  const invalid = f.install([...source, '--dry-run']);
  assert.equal(invalid.status, 0, invalid.stderr);
  assert.equal(invalid.report.commandMode, 'invalid');
  assert.match(invalid.stderr, /invalid policy; state-changing commands are blocked/);
  assert.equal(await readFile(config, 'utf8'), preserved);
});

test('the bootstrap skips engine and Mac app helpers for --remote-only and reports its temporary directory', async t => {
  const f = await home(t);
  const source = await fakeSource(f.base);
  const raw = path.join(f.base, 'raw');
  const helpers = (await readFile(path.join(repo, 'install.sh'), 'utf8')).match(/^HELPERS='([^']+)'/m)[1].split(' ');
  assert.ok(helpers.length > 10 && !helpers.some(name => /engine|setup-desktop/.test(name)));
  for (const name of helpers) await cp(path.join(repo, name), path.join(raw, name));
  const before = await tree(f.home);
  const bootstrap = args => spawnSync('sh', [path.join(repo, 'install.sh'), '--home', f.home, '--json', '--dry-run', ...source, ...args], {
    cwd: f.base, encoding: 'utf8', env: { ...f.env, PATH: `${path.dirname(process.execPath)}:${f.env.PATH}`, JUMPYBRAIN_RAW_BASE: `file://${raw}` } });
  const remote = bootstrap(['--remote-only']);
  assert.equal(remote.status, 0, remote.stderr);
  const report = JSON.parse(remote.stdout);
  assert.equal(report.state, 'planned');
  const temporary = report.filesystem.temporary.find(item => /install\.sh/.test(item.note));
  assert.ok(temporary && !existsSync(temporary.path), 'the helper directory is reported and removed on exit');
  assert.deepEqual(report.filesystem.network.map(item => item.host), ['api.github.com', 'raw.githubusercontent.com']);
  assert.deepEqual(await tree(f.home), before);

  const local = bootstrap(['--integrations', 'none', '--skip-qmd-install']);
  assert.equal(local.status, 1);
  assert.match(local.stderr, /Could not download the selected installer/, 'a local install still needs the engine and Mac app helpers');
});
