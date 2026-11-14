// Disposable legacy managed-install migration checks. A deterministic fake release
// replaces GitHub; fake runtimes model old/new readiness contracts. No real home.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, symlink, lstat, realpath } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { installFakeQmd } from './fake-qmd-helper.js';
import { classifyManifest, classifyVerification, sourcePolicy } from '../scripts/install-compatibility.mjs';
import { selectEngineWithSource } from '../scripts/install-support.mjs';
import { QMD_VERSION } from '../scripts/qmd-install-check.mjs';
import { desktopCompatibilityBlockers } from '../scripts/setup-desktop.mjs';

const repo = new URL('..', import.meta.url).pathname;
const shapes = JSON.parse(await readFile(path.join(repo, 'test/fixtures/legacy-installs/manifests.json'), 'utf8'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const RELEASE = '0.4.0';
// Modern fake CLI; env switches model a crash, an older result schema and an unready brain.
const modernCli = `const fs=require('node:fs');const path=require('node:path');const args=process.argv.slice(2);const root=args[args.indexOf('--root')+1];
if(args[0]==='--version'){console.log('${RELEASE}');process.exit(0);}
if(args[0]==='init'){fs.mkdirSync(root,{recursive:true});fs.writeFileSync(path.join(root,'jumpybrain.json'),JSON.stringify({canonical:'markdown',memoryDirs:['notes']}));process.exit(0);}
if(args[0]===process.env.FIXTURE_FAIL)process.exit(1);
if(process.env.FIXTURE_FAIL_PUBLISHED&&args[0]==='doctor'&&__dirname.endsWith(path.join('app','dist')))process.exit(1);
const marker=process.env.FIXTURE_INDEX_MARKER;if(marker&&args[0]==='index')process.exit(9);if(marker&&args[0]==='recall'&&!args.includes('--read-only'))fs.writeFileSync(marker,'');
if(marker&&!fs.existsSync(marker)){if(args[0]==='doctor'){console.log(JSON.stringify({ok:true,memoryRoot:{ok:true,readiness:{freshness:'missing'}}}));process.exit(0);}if(args.includes('--read-only')){console.error('read-only index missing');process.exit(1);}}
if(process.env.FIXTURE_OLD_SCHEMA){console.log(JSON.stringify({cli:{ok:true},results:[]}));process.exit(0);}
if(process.env.FIXTURE_NOT_READY&&args[0]==='doctor'){console.log(JSON.stringify({ok:false,cli:{ok:true},qmd:{ok:false},memoryRoot:{ok:true}}));process.exit(1);}
console.log(JSON.stringify(args[0]==='doctor'?{ok:true}:{retrieval:{status:'complete'},results:[]}));`;
const legacyCli = `console.log(JSON.stringify({legacy:true}));`;

function tarGz(entries) {
  const parts = [];
  for (const [name, data] of entries) {
    const body = Buffer.from(data), h = Buffer.alloc(512);
    h.write(`package/${name}`); h.write('0000644\0', 100); h.write(body.length.toString(8).padStart(11, '0') + '\0', 124);
    h.fill(32, 148, 156); h.write('0', 156); h.write('ustar\0', 257);
    h.write(h.reduce((a, b) => a + b, 0).toString(8).padStart(6, '0') + '\0 ', 148);
    parts.push(h, body, Buffer.alloc((512 - body.length % 512) % 512));
  }
  return gzipSync(Buffer.concat([...parts, Buffer.alloc(1024)]));
}

async function tree(dir) {
  const out = {};
  async function walk(current) {
    for (const entry of await readdir(current, { withFileTypes: true }).catch(() => [])) {
      const file = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(file);
      else out[path.relative(dir, file)] = entry.isSymbolicLink() ? 'link' : sha(await readFile(file));
    }
  }
  await walk(dir);
  return out;
}

async function legacyFixture(t, shape = 'legacy-unconfigured', { config = false, integration = false } = {}) {
  const base = await mkdtemp(path.join(os.tmpdir(), 'jb-legacy-migration-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const home = path.join(base, 'home'), root = path.join(home, '.jumpybrain'), memory = path.join(home, 'brain');
  const app = path.join(root, 'app'), cliPath = path.join(root, 'bin/jumpybrain'), manifestPath = path.join(root, 'install-manifest.json');
  await mkdir(path.join(app, 'dist'), { recursive: true }); await mkdir(path.dirname(cliPath), { recursive: true });
  await writeFile(path.join(app, 'package.json'), JSON.stringify({ name: 'jumpybrain', version: shapes[shape].installedVersion }));
  await writeFile(path.join(app, 'dist/cli.js'), legacyCli);
  // The v0.3.1 shim form (config export, JSON-quoted target); July installs had no config export.
  const target = JSON.stringify(path.join(app, 'dist/cli.js'));
  await writeFile(cliPath, shape === 'legacy-unconfigured' ? `#!/usr/bin/env sh\nexec node ${target} "$@"\n`
    : `#!/usr/bin/env sh\nif [ -z "\${JUMPYBRAIN_CLI_CONFIG+x}" ]; then\n  export JUMPYBRAIN_CLI_CONFIG='${path.join(root, 'cli-config.json')}'\nfi\nexec node ${target} "$@"\n`, { mode: 0o755 });
  await mkdir(path.join(memory, 'notes'), { recursive: true });
  await writeFile(path.join(memory, 'jumpybrain.json'), JSON.stringify({ canonical: 'markdown', memoryDirs: ['notes'] }));
  await writeFile(path.join(memory, 'notes/keep.md'), '# Keep\n\nCanonical bytes stay exactly as written.\n');
  const manifest = JSON.parse(JSON.stringify(shapes[shape]).replaceAll('${installRoot}', root).replaceAll('${memoryRoot}', memory));
  const skill = path.join(home, '.agents/skills/jumpybrain-memory/SKILL.md');
  if (integration) {
    await mkdir(path.dirname(skill), { recursive: true }); await writeFile(skill, '# My customized memory skill\n');
    manifest.integrations = [{ kind: 'codex', path: skill }]; manifest.files.push(skill);
  }
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  if (config) await writeFile(path.join(root, 'cli-config.json'), JSON.stringify({ schemaVersion: 1, remoteTargets: [{ origin: 'https://memory.example.com', access: 'read-only' }] }));
  // Deterministic verified release served through a fetch preload.
  const archive = path.join(base, `jumpybrain-${RELEASE}.tgz`);
  const lock = JSON.stringify({ name: 'jumpybrain', version: RELEASE, lockfileVersion: 3, requires: true, packages: { '': { name: 'jumpybrain', version: RELEASE } } });
  const bytes = tarGz([['package.json', JSON.stringify({ name: 'jumpybrain', version: RELEASE })], ['dist/cli.js', modernCli], ['dist/runtime-package-lock.json', lock],
    ['skills/jumpybrain-memory/SKILL.md', '# Memory\n__JUMPYBRAIN_CLI__\n']]);
  await writeFile(archive, bytes);
  const url = `https://github.com/nikoatwork/jumpyBrain/releases/download/v${RELEASE}/jumpybrain-${RELEASE}.tgz`;
  const release = [{ id: 1, tag_name: `v${RELEASE}`, published_at: '2026-11-14T00:00:00Z', prerelease: true, assets: [{ id: 2, name: `jumpybrain-${RELEASE}.tgz`, state: 'uploaded', digest: `sha256:${sha(bytes)}`, size: bytes.length, browser_download_url: url }] }];
  const preload = path.join(base, 'release-fixture.mjs');
  await writeFile(preload, `import {readFile} from 'node:fs/promises';const original=globalThis.fetch;globalThis.fetch=async(u,o)=>{if(String(u).startsWith('https://api.github.com/repos/nikoatwork/jumpyBrain/releases?'))return new Response(${JSON.stringify(JSON.stringify(release))});if(String(u)===${JSON.stringify(url)})return new Response(await readFile(${JSON.stringify(archive)}));throw new Error('unexpected network '+u);};`);
  const { bin } = await installFakeQmd(base); await writeFile(bin, '#!/bin/sh\necho "qmd 2.8.3"\n', { mode: 0o755 });
  const env = { ...process.env, HOME: home, JUMPYBRAIN_QMD_BIN: bin, NODE_OPTIONS: `--import=${preload}` };
  delete env.JUMPYBRAIN_INSTALL_SOURCE; delete env.JUMPYBRAIN_INSTALL_REF;
  const run = (extra = [], moreEnv = {}) => {
    const result = spawnSync(process.execPath, [path.join(repo, 'scripts/public-install.mjs'), '--home', home, '--json', ...extra], { env: { ...env, ...moreEnv }, encoding: 'utf8' });
    let report; try { report = JSON.parse(result.stdout); } catch { report = null; }
    return { ...result, report };
  };
  return { base, home, root, memory, app, cliPath, manifestPath, skill, bin, env, run };
}

test('only demonstrated historical manifest shapes are supported', () => {
  const root = '/disposable/.jumpybrain', fill = shape => JSON.parse(JSON.stringify(shapes[shape]).replaceAll('${installRoot}', root).replaceAll('${memoryRoot}', '/disposable/brain'));
  assert.equal(classifyManifest(fill('legacy-unconfigured'), root).shape, 'legacy-unconfigured');
  assert.deepEqual(classifyManifest(fill('legacy-configured'), root).omitted, ['state', 'distribution', 'release', 'node', 'qmd', 'remoteOnly', 'integrationHashes']);
  assert.throws(() => classifyManifest(fill('pre-settings'), root), /integrationMode undefined is unsupported/);
  assert.throws(() => classifyManifest({ ...fill('legacy-configured'), appDir: '/elsewhere/app' }, root), /appDir does not match/);
  assert.throws(() => classifyManifest({ ...fill('legacy-configured'), memoryRoot: 'relative' }, root), /memoryRoot must be an absolute path/);
  assert.equal(sourcePolicy(fill('legacy-configured')).kind, 'default-branch');
  assert.equal(sourcePolicy({ ...fill('legacy-configured'), ref: 'v0.3.1' }).kind, 'pinned');
  assert.equal(sourcePolicy({ ...fill('legacy-configured'), source: '/checkout' }).kind, 'custom');
});

test('verification distinguishes older result schemas, crashes and unready brains', () => {
  assert.equal(classifyVerification('doctor', { status: 0, stdout: '{"cli":{"ok":true}}' }).outcome, 'incompatible_output');
  assert.equal(classifyVerification('doctor', { status: 1, stdout: '' }).outcome, 'no_result');
  assert.equal(classifyVerification('doctor', { status: 1, stdout: '{"ok":false}' }).outcome, 'not_ready');
  assert.equal(classifyVerification('recall', { status: 0, stdout: '{"results":[]}' }).outcome, 'incompatible_output');
  assert.equal(classifyVerification('recall', { status: 0, stdout: '{"retrieval":{"status":"partial"}}' }).outcome, 'not_ready');
  assert.equal(classifyVerification('recall', { status: 0, stdout: '{"retrieval":{"status":"complete"}}' }).outcome, 'ready');
  assert.equal(classifyVerification('doctor', { error: Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }) }).outcome, 'did_not_run');
});

test('a default add-app rerun refuses an incompatible legacy CLI before any change', async t => {
  const f = await legacyFixture(t);
  const before = await tree(f.root);
  const result = f.run(['--with-app']);
  assert.equal(result.status, 1, result.stderr);
  assert.equal(result.report.state, 'blocked');
  assert.equal(result.report.compatibility.installedVersion, '0.2.0');
  assert.equal(result.report.compatibility.action, 'reuse');
  assert.match(result.report.compatibility.nextCommand, /--source release --with-app/);
  assert.match(result.report.error, /lacks matching Mac app packaging.*Nothing was changed/);
  assert.deepEqual(await tree(f.root), before);
});

test('a packaged older CLI that cannot report current readiness is not reused for the app', async t => {
  const { desktopPrerequisites } = await import('../scripts/desktop-prerequisites.mjs');
  if (process.platform !== 'darwin' || desktopPrerequisites().length) return t.skip('Mac app prerequisites unavailable');
  const f = await legacyFixture(t, 'legacy-configured');
  await mkdir(path.join(f.app, 'integrations/electron'), { recursive: true });
  await writeFile(path.join(f.app, 'integrations/electron/package.json'), JSON.stringify({ version: '0.3.1' }));
  for (const file of ['install.mjs', 'desktop-install.py', 'setup.mjs', 'desktop-host.mjs', 'host.mjs']) await writeFile(path.join(f.app, 'integrations/electron', file), '');
  const before = await tree(f.root);
  const result = f.run(['--with-app']);
  assert.equal(result.status, 1, result.stderr);
  assert.equal(result.report.failure.outcome, 'incompatible_output'); assert.equal(result.report.failure.runtime, 'installed');
  assert.equal(result.report.failure.changed, false); assert.match(result.report.failure.nextCommand, /--source release --with-app/);
  assert.match(result.report.error, /version incompatibility, not a search failure\. Nothing was replaced/);
  assert.deepEqual(await tree(f.root), before);
});

test('explicit release migration replaces legacy software, keeps notes/config/integrations and records coherent release metadata', async t => {
  for (const shape of ['legacy-unconfigured', 'legacy-configured']) {
    const f = await legacyFixture(t, shape, { config: true, integration: true });
    const notes = await tree(f.memory), config = await readFile(path.join(f.root, 'cli-config.json')), oldManifest = await readFile(f.manifestPath);
    const migrated = f.run(['--source', 'release']);
    assert.equal(migrated.status, 0, migrated.stderr);
    const report = migrated.report;
    assert.equal(report.state, 'ready'); assert.equal(report.checks.doctor, true); assert.equal(report.checks.recall, true);
    assert.equal(report.compatibility.action, 'migrate-to-release'); assert.equal(report.compatibility.manifestShape, shape);
    assert.equal(report.compatibility.candidateVersion, RELEASE); assert.equal(report.policyChange.from.kind, 'default-branch');
    assert.equal(report.engineSource, 'explicit');
    const manifest = JSON.parse(await readFile(f.manifestPath, 'utf8'));
    assert.equal(manifest.distribution, 'release'); assert.equal(manifest.ref, null); assert.equal(manifest.release.version, RELEASE);
    assert.equal(manifest.installedVersion, RELEASE); assert.equal(manifest.state, 'ready'); assert.equal(manifest.memoryRoot, f.memory);
    assert.equal(typeof manifest.qmd, 'string'); assert.equal(manifest.node, process.execPath);
    // A pre-existing config is used but only becomes owned if an earlier manifest recorded it.
    assert.equal(manifest.cliConfigPath, shape === 'legacy-configured' ? path.join(f.root, 'cli-config.json') : undefined);
    assert.deepEqual(await tree(f.memory), notes);
    assert.deepEqual(await readFile(path.join(f.root, 'cli-config.json')), config);
    assert.equal(await readFile(f.skill, 'utf8'), '# My customized memory skill\n');
    assert.equal(manifest.integrationHashes[f.skill], undefined);
    // The previous runtime and manifest are retained for recovery.
    const previous = (await readdir(f.root)).filter(name => name.startsWith('app.previous-'));
    assert.equal(previous.length, 1);
    assert.equal(JSON.parse(await readFile(path.join(f.root, previous[0], 'app/package.json'), 'utf8')).version, shapes[shape].installedVersion);
    assert.deepEqual(await readFile(path.join(f.root, previous[0], 'install-manifest.json')), oldManifest);
    // Ordinary reruns now keep the release policy.
    const rerun = f.run();
    assert.equal(rerun.status, 0, rerun.stderr); assert.equal(rerun.report.policyChange, undefined); assert.equal(rerun.report.source, 'release');
    if (shape === 'legacy-unconfigured') {
      const removed = spawnSync(process.execPath, [path.join(repo, 'scripts/public-uninstall.mjs'), '--home', f.home], { env: f.env, encoding: 'utf8' });
      assert.equal(removed.status, 0, removed.stderr);
      assert.deepEqual(await readFile(path.join(f.root, 'cli-config.json')), config);
      assert.equal(await readFile(f.skill, 'utf8'), '# My customized memory skill\n');
      assert.deepEqual(await tree(f.memory), notes); assert.equal(existsSync(f.app), false);
    }
  }
});

test('a never-indexed legacy brain migrates: recall is verified after the installed runtime builds the index', async t => {
  const f = await legacyFixture(t, 'legacy-configured');
  const notes = await tree(f.memory), marker = path.join(f.base, 'index-built');
  const migrated = f.run(['--source', 'release'], { FIXTURE_INDEX_MARKER: marker });
  assert.equal(migrated.status, 0, migrated.stderr);
  assert.equal(migrated.report.indexPending, true); assert.equal(migrated.report.indexBuilt, true);
  assert.equal(migrated.report.checks.recall, true); assert.ok(existsSync(marker));
  assert.deepEqual(await tree(f.memory), notes);
});

test('failed candidate verification leaves the legacy predecessor; retry completes once', async t => {
  const f = await legacyFixture(t, 'legacy-configured');
  const before = await tree(f.root), notes = await tree(f.memory);
  const cases = [
    [{ FIXTURE_FAIL: 'doctor' }, 'no_result', /could not complete doctor .*Nothing was replaced/],
    [{ FIXTURE_OLD_SCHEMA: '1' }, 'incompatible_output', /version incompatibility, not a search failure/],
    [{ FIXTURE_NOT_READY: '1' }, 'not_ready', /reported doctor not ready \(qmd\)/],
  ];
  for (const [env, outcome, message] of cases) {
    const failed = f.run(['--source', 'release'], env);
    assert.equal(failed.status, 1);
    assert.equal(failed.report.failure.outcome, outcome); assert.equal(failed.report.failure.runtime, 'candidate');
    assert.equal(failed.report.failure.version, RELEASE); assert.equal(failed.report.failure.changed, false);
    assert.equal(failed.report.checks.doctor, false); assert.match(failed.report.error, message);
    const after = await tree(f.root);
    assert.deepEqual(Object.keys(after).filter(key => !(key in before)), []);
    for (const [key, digest] of Object.entries(before)) assert.equal(after[key], digest, key);
    assert.deepEqual(await tree(f.memory), notes);
  }
  // Failure after publication: the new runtime is live, the old manifest and runtime remain recoverable.
  const oldManifest = await readFile(f.manifestPath);
  const published = f.run(['--source', 'release'], { FIXTURE_FAIL_PUBLISHED: '1' });
  assert.equal(published.status, 1);
  assert.equal(published.report.failure.runtime, 'installed'); assert.equal(published.report.failure.changed, true);
  assert.match(published.report.error, /previous runtime is retained for recovery/);
  assert.deepEqual(await readFile(f.manifestPath), oldManifest);
  assert.equal(JSON.parse(await readFile(path.join(f.app, 'package.json'), 'utf8')).version, RELEASE);
  const retained = async () => { const versions = [];
    for (const name of (await readdir(f.root)).filter(item => item.startsWith('app.previous-'))) versions.push(JSON.parse(await readFile(path.join(f.root, name, 'app/package.json'), 'utf8')).version);
    return versions; };
  assert.deepEqual(await retained(), ['0.3.1']);
  // Retrying the same command recognizes its own current-form shim and completes once.
  const retry = f.run(['--source', 'release']);
  assert.equal(retry.status, 0, retry.stderr);
  assert.equal(JSON.parse(await readFile(f.manifestPath, 'utf8')).distribution, 'release');
  assert.ok((await retained()).includes('0.3.1'));
  assert.deepEqual(await tree(f.memory), notes);
});

test('release migration refuses customized shims, dirty checkouts and ref conflicts; dry runs change nothing', async t => {
  const f = await legacyFixture(t, 'legacy-configured');
  let before = await tree(f.root);
  const dry = f.run(['--source', 'release', '--dry-run']);
  assert.equal(dry.status, 0, dry.stderr); assert.equal(dry.report.state, 'planned');
  assert.equal(dry.report.compatibility.action, 'migrate-to-release'); assert.equal(dry.report.compatibility.candidateVersion, RELEASE);
  assert.deepEqual(await tree(f.root), before);
  const conflict = f.run(['--source', 'release', '--ref', 'v0.3.1']);
  assert.equal(conflict.status, 1); assert.match(conflict.report.error, /cannot be combined with --source release/);
  await writeFile(f.cliPath, '#!/bin/sh\nexec my-own-cli "$@"\n', { mode: 0o755 });
  before = await tree(f.root);
  const custom = f.run(['--source', 'release']);
  assert.equal(custom.status, 1); assert.match(custom.report.error, /was customized/); assert.deepEqual(await tree(f.root), before);

  const g = await legacyFixture(t, 'legacy-configured');
  const git = args => spawnSync('git', ['-C', g.app, ...args], { encoding: 'utf8' });
  if (git(['--version']).status !== 0) return t.skip('git unavailable');
  git(['init', '-q']); git(['add', '.']); git(['-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'old']);
  await writeFile(path.join(g.app, 'local-change.txt'), 'keep\n');
  const dirty = g.run(['--source', 'release']);
  assert.equal(dirty.status, 1); assert.match(dirty.report.error, /1 locally changed or untracked path/);
  assert.equal(await readFile(path.join(g.app, 'local-change.txt'), 'utf8'), 'keep\n');
  assert.equal(JSON.parse(await readFile(path.join(g.app, 'package.json'), 'utf8')).version, '0.3.1');
});

test('ordinary legacy reruns preserve source policy; remote-only migration creates no engine or brain', async t => {
  const f = await legacyFixture(t, 'legacy-unconfigured');
  const source = path.join(f.base, 'source');
  await mkdir(path.join(source, 'dist'), { recursive: true });
  await writeFile(path.join(source, 'package.json'), JSON.stringify({ name: 'jumpybrain', version: '0.3.99' }));
  await writeFile(path.join(source, 'dist/cli.js'), modernCli);
  const manifest = JSON.parse(await readFile(f.manifestPath, 'utf8'));
  await writeFile(f.manifestPath, JSON.stringify({ ...manifest, source, installerOptions: { ...manifest.installerOptions, skipBuild: true } }));
  const rerun = f.run();
  assert.equal(rerun.status, 0, rerun.stderr);
  const updated = JSON.parse(await readFile(f.manifestPath, 'utf8'));
  assert.equal(updated.source, await realpath(source)); assert.equal(updated.distribution, 'source'); assert.equal(updated.state, 'ready');
  assert.equal(updated.installedVersion, '0.3.99'); assert.equal(updated.cliConfigPath, path.join(f.root, 'cli-config.json'));

  const r = await legacyFixture(t, 'legacy-configured');
  await rm(r.memory, { recursive: true });
  const remote = JSON.parse(await readFile(r.manifestPath, 'utf8'));
  await writeFile(r.manifestPath, JSON.stringify({ ...remote, remoteOnly: true, integrationMode: 'none' }));
  const migrated = r.run(['--source', 'release'], { JUMPYBRAIN_QMD_BIN: '/absent/qmd' });
  assert.equal(migrated.status, 0, migrated.stderr);
  assert.equal(migrated.report.engine, null); assert.equal(migrated.report.checks.cli, true);
  assert.equal(existsSync(path.join(r.root, 'engines')), false); assert.equal(existsSync(r.memory), false);
  assert.equal(JSON.parse(await readFile(r.manifestPath, 'utf8')).distribution, 'release');
});

test('engine precedence: explicit, recorded, owned private engine, then PATH; Desktop setup shares it', async t => {
  const base = await mkdtemp(path.join(os.tmpdir(), 'jb-engine-precedence-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const { bin } = await installFakeQmd(base); await writeFile(bin, '#!/bin/sh\necho "qmd 2.8.3"\n', { mode: 0o755 });
  const installRoot = path.join(base, 'install'), appDir = path.join(installRoot, 'app');
  const id = sha(await readFile(path.join(repo, 'scripts/engine/package-lock.json'))).slice(0, 12);
  const privateBin = path.join(installRoot, 'engines', `qmd-${QMD_VERSION}-${process.platform}-${process.arch}-node${process.versions.modules}-${id}`, 'node_modules/.bin/qmd');
  await mkdir(path.dirname(privateBin), { recursive: true }); await symlink(bin, privateBin);
  const pathDir = path.join(base, 'path'); await mkdir(pathDir); await symlink(bin, path.join(pathDir, 'qmd'));
  const saved = { PATH: process.env.PATH, JUMPYBRAIN_QMD_BIN: process.env.JUMPYBRAIN_QMD_BIN };
  t.after(() => { process.env.PATH = saved.PATH; if (saved.JUMPYBRAIN_QMD_BIN === undefined) delete process.env.JUMPYBRAIN_QMD_BIN; else process.env.JUMPYBRAIN_QMD_BIN = saved.JUMPYBRAIN_QMD_BIN; });
  process.env.PATH = `${pathDir}:/usr/bin:/bin`; delete process.env.JUMPYBRAIN_QMD_BIN;
  const select = previous => selectEngineWithSource({ installRoot, appDir, skipInstall: true, previous });
  assert.equal((await select()).source, 'path', 'an unowned engines directory is not trusted');
  await writeFile(path.join(installRoot, 'engines/owner.json'), JSON.stringify({ installer: 'jumpybrain-installer', schemaVersion: 1 }));
  assert.deepEqual(await select(), { bin: privateBin, source: 'private' });
  assert.equal((await select(bin)).source, 'recorded');
  process.env.JUMPYBRAIN_QMD_BIN = process.execPath;
  await assert.rejects(selectEngineWithSource({ installRoot, appDir, skipInstall: false, previous: bin }), /Selected QMD is incompatible \(JUMPYBRAIN_QMD_BIN/);
  delete process.env.JUMPYBRAIN_QMD_BIN;

  // Desktop setup consumes the recorded engine and refuses legacy/disagreeing selections before builds.
  await mkdir(path.join(appDir, 'dist'), { recursive: true }); await writeFile(path.join(appDir, 'dist/cli.js'), '');
  await writeFile(path.join(appDir, 'package.json'), JSON.stringify({ name: 'jumpybrain', version: '0.3.1' }));
  const legacy = JSON.parse(JSON.stringify(shapes['legacy-configured']).replaceAll('${installRoot}', installRoot).replaceAll('${memoryRoot}', path.join(base, 'brain')));
  assert.match(desktopCompatibilityBlockers(legacy, installRoot, {}).join('\n'), /predates recorded Node\/engine selection/);
  const current = { ...legacy, state: 'ready', distribution: 'release', node: process.execPath, qmd: privateBin, remoteOnly: false, integrationHashes: {} };
  assert.deepEqual(desktopCompatibilityBlockers(current, installRoot, {}), []);
  assert.deepEqual(desktopCompatibilityBlockers(current, installRoot, { JUMPYBRAIN_QMD_BIN: bin }), [], 'the same engine through another path is accepted');
  assert.match(desktopCompatibilityBlockers(current, installRoot, { JUMPYBRAIN_QMD_BIN: process.execPath }).join('\n'), /differs from the engine recorded/);
  assert.ok((await lstat(privateBin)).isSymbolicLink());
});
