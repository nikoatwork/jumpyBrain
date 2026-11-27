#!/usr/bin/env node
// Disposable legacy managed CLI → verified release + matching packaged Mac app.
// The legacy runtime is a real tagged build; release transport is the same local
// fixture as agent-install-smoke.mjs and never contacts or publishes to GitHub.
// Usage: node scripts/legacy-migration-smoke.mjs [--legacy-tag v0.3.1]
// Prerequisite: node scripts/pack-local.mjs (writes .local-pack/latest.json).
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { cp, mkdir, mkdtemp, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stopDisposableBackends, waitForExit } from './disposable-backends.mjs';

const repo = fileURLToPath(new URL('..', import.meta.url));
const tagIndex = process.argv.indexOf('--legacy-tag');
const legacyTag = tagIndex > 0 ? process.argv[tagIndex + 1] : 'v0.3.1';
if (process.platform !== 'darwin') throw new Error('The packaged Mac app migration smoke requires macOS.');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const sh = (command, args, options = {}) => { const result = spawnSync(command, args, { encoding: 'utf8', ...options }); if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed: ${result.stderr}`); return result.stdout; };

// 1. Real legacy runtime, built once from its tag (cached under .local-pack).
const legacyRuntime = path.join(repo, '.local-pack', `legacy-runtime-${legacyTag}`);
if (!existsSync(path.join(legacyRuntime, 'dist/cli.js'))) {
  console.log(`Building legacy runtime ${legacyTag}…`);
  await rm(legacyRuntime, { recursive: true, force: true }); await mkdir(legacyRuntime, { recursive: true });
  execFileSync('sh', ['-c', `git -C "${repo}" archive ${legacyTag} | tar -x -C "${legacyRuntime}"`]);
  sh('npm', ['ci', '--no-audit', '--no-fund'], { cwd: legacyRuntime, stdio: 'inherit' });
  sh('npm', ['run', 'build'], { cwd: legacyRuntime, stdio: 'inherit' });
}
const legacyVersion = JSON.parse(await readFile(path.join(legacyRuntime, 'package.json'), 'utf8')).version;

// 2. Release fixture for the exact local package.
const temporary = await realpath(await mkdtemp(path.join('/tmp', 'jb-legacy-smoke-')));
const home = path.join(temporary, 'home'), root = path.join(home, '.jumpybrain'), memory = path.join(home, 'Brain');
const app = path.join(root, 'app'), cliPath = path.join(root, 'bin/jumpybrain');
await mkdir(home);
const metadata = JSON.parse(await readFile(path.join(repo, '.local-pack/latest.json'), 'utf8'));
const archive = await readFile(metadata.tarballPath);
const digest = 'sha256:' + sha(archive);
const url = `https://github.com/nikoatwork/jumpyBrain/releases/download/v${metadata.version}/jumpybrain-${metadata.version}.tgz`;
const release = { id: 1, tag_name: `v${metadata.version}`, published_at: '2026-11-01T00:00:00Z', prerelease: true, assets: [{ id: 2, name: `jumpybrain-${metadata.version}.tgz`, state: 'uploaded', digest, size: archive.length, browser_download_url: url }] };
const preload = path.join(temporary, 'release-fixture.mjs');
await writeFile(preload, `import {readFile} from 'node:fs/promises';const original=globalThis.fetch;globalThis.fetch=async(url,options)=>{if(String(url).startsWith('https://api.github.com/repos/nikoatwork/jumpyBrain/releases?'))return new Response(${JSON.stringify(JSON.stringify([release]))});if(String(url)===${JSON.stringify(url)})return new Response(await readFile(${JSON.stringify(metadata.tarballPath)}));return original(url,options);};`);
// An older QMD on PATH must not shadow the selected compatible private engine.
const shadow = path.join(temporary, 'shadow-bin'); await mkdir(shadow);
await writeFile(path.join(shadow, 'qmd'), '#!/bin/sh\necho "qmd 1.9.0"\n', { mode: 0o755 });
const node = process.env.JUMPYBRAIN_SMOKE_NODE || process.execPath;
const env = { ...process.env, HOME: home, CFFIXED_USER_HOME: home, PATH: `${shadow}:${path.dirname(node)}:/usr/bin:/bin:/usr/sbin:/sbin`, NODE_OPTIONS: `--import=${preload}` };
for (const key of ['JUMPYBRAIN_QMD_BIN', 'JUMPYBRAIN_INSTALL_SOURCE', 'JUMPYBRAIN_INSTALL_REF', 'ELECTRON_RUN_AS_NODE']) delete env[key];
function run(command, args, { input, allowFailure = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, cwd: temporary, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-16000); });
    const timer = setTimeout(() => { child.kill('SIGTERM'); reject(new Error('Disposable migration timed out.')); }, 900000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => { clearTimeout(timer); code === 0 || allowFailure ? resolve({ code, stdout, stderr }) : reject(new Error(`Fixture command failed (${code}): ${stderr}\n${stdout}`)); });
    child.stdin.end(input);
  });
}
const installer = extra => run(node, [path.join(repo, 'scripts/public-install.mjs'), '--home', home, '--json', ...extra], { allowFailure: true })
  .then(result => ({ ...result, report: JSON.parse(result.stdout.trim().split('\n').pop()) }));
async function snapshot(dir, skip = () => false) {
  const out = {};
  async function walk(current) {
    for (const entry of await readdir(current, { withFileTypes: true }).catch(() => [])) {
      const file = path.join(current, entry.name), relative = path.relative(dir, file);
      if (skip(relative)) continue;
      if (entry.isDirectory()) await walk(file); else out[relative] = entry.isSymbolicLink() ? 'link' : sha(await readFile(file));
    }
  }
  await walk(dir); return out;
}
const canonical = () => snapshot(memory, relative => relative === '.jumpybrain' || relative.startsWith('.jumpybrain/'));
const freePort = async () => { const server = net.createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const { port } = server.address(); await new Promise(resolve => server.close(resolve)); return port; };

let appPath;
try {
  // 3. Seed a default-branch managed source install exactly as the legacy installer laid it out.
  console.log(`Seeding legacy managed CLI ${legacyVersion}…`);
  await mkdir(path.dirname(cliPath), { recursive: true });
  await cp(legacyRuntime, app, { recursive: true });
  sh('git', ['init', '-q'], { cwd: app }); sh('git', ['add', '-A'], { cwd: app });
  sh('git', ['-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', legacyTag], { cwd: app });
  const configPath = path.join(root, 'cli-config.json');
  await writeFile(cliPath, `#!/usr/bin/env sh\nif [ -z "\${JUMPYBRAIN_CLI_CONFIG+x}" ]; then\n  export JUMPYBRAIN_CLI_CONFIG='${configPath}'\nfi\nexec node ${JSON.stringify(path.join(app, 'dist/cli.js'))} "$@"\n`, { mode: 0o755 });
  await writeFile(configPath, JSON.stringify({ schemaVersion: 1, remoteTargets: [{ origin: 'https://memory.example.com', access: 'read-only' }] }, null, 2) + '\n');
  const credentials = path.join(home, '.config/jumpybrain/.env');
  await mkdir(path.dirname(credentials), { recursive: true }); await writeFile(credentials, 'JUMPYBRAIN_API_KEY=fixture-placeholder-not-a-secret\n', { mode: 0o600 });
  const skill = path.join(home, '.claude/skills/jumpybrain-memory/SKILL.md');
  await mkdir(path.dirname(skill), { recursive: true }); await writeFile(skill, '# My customized jumpyBrain skill\n');
  const shapes = JSON.parse(await readFile(path.join(repo, 'test/fixtures/legacy-installs/manifests.json'), 'utf8'));
  const manifest = JSON.parse(JSON.stringify(shapes['legacy-configured']).replaceAll('${installRoot}', root).replaceAll('${memoryRoot}', memory));
  Object.assign(manifest, { installedVersion: legacyVersion, integrationMode: 'auto', integrations: [{ kind: 'claude', path: skill }], files: [cliPath, skill] });
  await writeFile(path.join(root, 'install-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  await run(cliPath, ['init', '--root', memory]);
  const saved = await run(cliPath, ['remember', '--root', memory, '--type', 'note', '--title', 'Legacy canary'], { input: 'The legacy canary remembers cobalt lighthouses.\n' });
  assert.match(saved.stdout, /Remembered memory/);
  const brain = await canonical(), protectedFiles = [configPath, credentials, skill];
  const protectedBytes = await Promise.all(protectedFiles.map(file => readFile(file)));
  const port = await freePort();

  console.log('A · Default add-app rerun must refuse the incompatible legacy CLI before changes…');
  const rootBefore = await snapshot(root);
  const blocked = await installer(['--with-app', '--app-port', String(port)]);
  assert.equal(blocked.code, 1); assert.equal(blocked.report.state, 'blocked');
  assert.equal(blocked.report.compatibility.installedVersion, legacyVersion);
  assert.match(blocked.report.compatibility.nextCommand, /--source release --with-app/);
  assert.deepEqual(await snapshot(root), rootBefore); assert.equal(existsSync(path.join(home, 'Applications')), false);

  console.log('B · Induced failure: release migration succeeds for the CLI, Desktop publication is refused by an occupying foreign app…');
  appPath = path.join(home, 'Applications/jumpyBrain.app');
  await mkdir(path.join(appPath, 'Contents'), { recursive: true });
  const foreignPlist = path.join(appPath, 'Contents/Info.plist');
  sh('/usr/bin/plutil', ['-create', 'xml1', foreignPlist]); sh('/usr/bin/plutil', ['-insert', 'CFBundleIdentifier', '-string', 'com.example.unrelated', foreignPlist]);
  const foreignBytes = await readFile(foreignPlist);
  const interrupted = await installer(['--source', 'release', '--with-app', '--app-port', String(port)]);
  assert.equal(interrupted.code, 1, interrupted.stderr);
  assert.equal(interrupted.report.compatibility.action, 'migrate-to-release');
  assert.equal(interrupted.report.checks.doctor, true); assert.equal(interrupted.report.checks.recall, true);
  assert.equal(interrupted.report.indexPending, true, 'the never-indexed legacy brain defers recall until after publication');
  assert.deepEqual(await readFile(foreignPlist), foreignBytes, 'the unrelated app is untouched');
  const midManifest = JSON.parse(await readFile(path.join(root, 'install-manifest.json'), 'utf8'));
  assert.equal(midManifest.distribution, 'release'); assert.equal(midManifest.installedVersion, metadata.version); assert.equal(midManifest.ref, null);
  assert.deepEqual(await canonical(), brain);

  console.log('C · Recovery: remove the foreign app; the default add-app rerun now reuses the migrated CLI…');
  await rm(appPath, { recursive: true });
  const recovered = await installer(['--with-app', '--app-port', String(port)]);
  assert.equal(recovered.code, 0, recovered.stderr + recovered.stdout);
  const report = recovered.report;
  assert.equal(report.compatibility.action, 'reuse'); assert.equal(report.compatibility.installedVersion, metadata.version);
  assert.equal(report.checks.doctor, true); assert.equal(report.checks.recall, true); assert.equal(report.checks.desktop, true);
  assert.match(report.engine, /\/engines\/qmd-/); assert.ok(['recorded', 'private'].includes(report.engineSource));

  console.log('D · Verifying shared root/profile, engine identity, preserved data and retained predecessor…');
  const finalManifest = JSON.parse(await readFile(path.join(root, 'install-manifest.json'), 'utf8'));
  assert.equal(finalManifest.distribution, 'release'); assert.equal(finalManifest.release.digest, digest); assert.equal(finalManifest.qmd, report.engine);
  const resources = path.join(appPath, 'Contents/Resources');
  assert.equal(JSON.parse(await readFile(path.join(resources, 'runtime/package.json'), 'utf8')).version, metadata.version);
  const nativeConfig = JSON.parse(await readFile(path.join(resources, 'native/jumpyBrain Host.app/Contents/Resources/Configuration.json'), 'utf8'));
  assert.equal(nativeConfig.qmd, finalManifest.qmd, 'CLI and app share one engine'); assert.equal(nativeConfig.node, finalManifest.node);
  const { bundledHost, desktopControl } = await import('../integrations/electron/desktop-host.mjs');
  const { readControlKey } = await import('../integrations/electron/host.mjs');
  const config = await bundledHost(resources);
  const state = await desktopControl({ ...config, key: await readControlKey(config.supportDirectory) }, 'state');
  const active = state.profiles.find(profile => profile.id === state.activeId);
  assert.equal(active?.kind, 'local'); assert.equal(await realpath(active.root), await realpath(memory));
  assert.equal(state.profiles.filter(profile => profile.kind === 'local').length, 1, 'no second brain was created');
  // An ordinary recall uses the derived index; an explicit index would persist policy into jumpybrain.json.
  const recalled = JSON.parse((await run(cliPath, ['recall', '--root', memory, '--query', 'cobalt lighthouses', '--limit', '2', '--json'])).stdout);
  assert.ok(recalled.results.some(result => /legacy-canary/.test(result.file || result.path || JSON.stringify(result))), 'legacy note is recalled by the migrated CLI');
  assert.deepEqual(await canonical(), brain);
  for (const [index, file] of protectedFiles.entries()) assert.deepEqual(await readFile(file), protectedBytes[index], file);
  const previous = [];
  for (const name of (await readdir(root)).filter(item => item.startsWith('app.previous-'))) previous.push(JSON.parse(await readFile(path.join(root, name, 'app/package.json'), 'utf8')).version);
  assert.ok(previous.includes(legacyVersion), 'legacy runtime retained for recovery');
  console.log(JSON.stringify({ ok: true, legacy: legacyVersion, migratedTo: metadata.version, digest, blockedBeforeChanges: true, inducedDesktopFailure: true, recoveredWithReuse: true,
    engine: path.relative(root, report.engine), engineSource: report.engineSource, sharedRoot: true, canonicalBytesPreserved: Object.keys(brain).length, retainedPredecessor: true, home }, null, 2));
} finally {
  const executable = path.join(home, 'Applications/jumpyBrain.app/Contents/MacOS/jumpyBrain');
  const apps = [];
  for (const row of execFileSync('/bin/ps', ['-axo', 'pid=,comm='], { encoding: 'utf8' }).split('\n').filter(line => line.trim().replace(/^\d+\s+/, '') === executable)) {
    try { const pid = Number(row.trim().match(/^\d+/)[0]); process.kill(pid, 'SIGTERM'); apps.push(pid); } catch {}
  }
  // The app could restart a backend; then drain the brains this fixture started.
  await waitForExit(apps);
  await stopDisposableBackends(temporary);
  console.log('Disposable fixture retained at ' + temporary);
}
