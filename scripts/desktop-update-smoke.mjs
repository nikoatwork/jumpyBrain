// Disposable installed old→new GUI upgrade using the production updater and an immutable local release asset.
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import net from 'node:net';
import { mkdtemp, realpath, mkdir, cp, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { createServerMemoryRuntime } from '../dist/server/index.js';
import { loginPlist } from '../integrations/electron/login.mjs';
const repo = fileURLToPath(new URL('..', import.meta.url));
const mode = process.argv[2] || 'success';
if (!['success','app-only','relaunch-failure','helper-crash','app-crash'].includes(mode)) throw new Error('Unsupported smoke mode');
const asar = await import(path.join(repo, 'integrations/electron/node_modules/@electron/asar/lib/asar.js'));
const home = await realpath(await mkdtemp(path.join(os.tmpdir(), 'jb-update-smoke-')));
const artifactDir = path.join(repo, '.local-pack/update-smoke', mode); await mkdir(artifactDir, { recursive: true });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let child, server, success = false;
console.log('Disposable update home:', home);
async function json(file, value) { await writeFile(file, JSON.stringify(value, null, 2)); }
try {
  const appPath = path.join(home, 'Applications/jumpyBrain.app'); await mkdir(path.dirname(appPath), { recursive: true });
  await cp(path.join(repo, '.local-pack/desktop/jumpyBrain.app'), appPath, { recursive: true, verbatimSymlinks: true });
  const resources = path.join(appPath, 'Contents/Resources');
  const root = path.join(home, '.jumpybrain'), memory = path.join(home, 'memory'), support = path.join(home, 'support');
  await mkdir(support, { mode: 0o700 }); await mkdir(path.join(root, 'bin'), { recursive: true });
  await createServerMemoryRuntime({ root: memory }).initializeMemoryRoot();
  await writeFile(path.join(memory, 'notes/keep.md'), '---\nid: 11111111-1111-4111-8111-111111111111\ntype: note\ntitle: Keep me\n---\nCanonical bytes must survive.\n');
  await writeFile(path.join(support, 'api-key'), randomBytes(32).toString('hex'), { mode: 0o600 });
  const socket = net.createServer(); await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port; await new Promise(resolve => socket.close(resolve));
  const nativeFile = path.join(resources, 'native/jumpyBrain Host.app/Contents/Resources/Configuration.json');
  const native = JSON.parse(await readFile(nativeFile, 'utf8'));
  const launchAgent = path.join(home, 'Library/LaunchAgents/local.jumpybrain.desktop.plist'); await mkdir(path.dirname(launchAgent), { recursive: true });
  await writeFile(launchAgent, loginPlist(path.join(appPath, 'Contents/MacOS/jumpyBrain')));
  await json(nativeFile, { ...native, supportDirectory: support, memoryRoot: memory, port, launchAgent });
  await json(path.join(resources, 'desktop.json'), { schema: 1, supportDirectory: support, launchAgent, port });
  // Build an actual npm package and use only its distribution contents.
  const pack = JSON.parse(execFileSync('npm', ['pack', '--json', '--pack-destination', home], { cwd: repo, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }))[0];
  execFileSync('tar', ['-xzf', path.join(home, pack.filename), '-C', home]);
  const source = path.join(home, 'package');
  const fixturePath = path.join(home, 'fixture.json');
  const entry = `import { run } from ${JSON.stringify(path.join(repo, 'integrations/electron/smoke-updater-app.mjs'))};\nawait run(${JSON.stringify(fixturePath)});\n`;
  await writeFile(path.join(source, 'integrations/electron/main.mjs'), entry);
  const pkg = JSON.parse(await readFile(path.join(source, 'package.json'), 'utf8'));
  const electronPkg = JSON.parse(await readFile(path.join(source, 'integrations/electron/package.json'), 'utf8'));
  const oldVersion = '0.3.3', nextVersion = '0.3.4';
  await json(path.join(source, 'package.json'), { ...pkg, version: oldVersion });
  await json(path.join(source, 'integrations/electron/package.json'), { ...electronPkg, version: oldVersion });
  await rm(path.join(resources, 'runtime/dist'), { recursive: true });
  await cp(path.join(source, 'dist'), path.join(resources, 'runtime/dist'), { recursive: true });
  await json(path.join(resources, 'runtime/package.json'), { ...pkg, version: oldVersion });
  await cp(source, path.join(root, 'app'), { recursive: true });
  const cliPath = path.join(root, 'bin/jumpybrain'), cliConfigPath = path.join(root, 'cli-config.json');
  await writeFile(cliPath, `#!/usr/bin/env sh\nif [ -z "\${JUMPYBRAIN_CLI_CONFIG+x}" ]; then\n  export JUMPYBRAIN_CLI_CONFIG='${cliConfigPath}'\nfi\nexec node ${JSON.stringify(path.join(root, 'app/dist/cli.js'))} "$@"\n`, { mode: 0o755 });
  await json(cliConfigPath, { schemaVersion: 1, remoteTargets: [{ origin: 'https://example.invalid', access: 'read-only' }] });
  const integration = path.join(home, 'agent-skill.md'); await writeFile(integration, 'Preserve agent integration');
  await json(path.join(root, 'install-manifest.json'), { version: 1, installer: 'jumpybrain-installer', source: 'https://github.com/nikoatwork/jumpyBrain.git', ref: mode === 'app-only' ? 'v0.3.3' : 'master', scope: 'global', integrationMode: 'auto', installRoot: root,
    appDir: path.join(root, 'app'), binDir: path.join(root, 'bin'), cliPath, cliConfigPath, memoryRoot: memory, integrations: [{ kind: 'fixture', path: integration }], installedVersion: oldVersion });
  await rm(path.join(resources, 'app.asar')); await asar.createPackage(path.join(source, 'integrations/electron'), path.join(resources, 'app.asar'));
  execFileSync('/usr/libexec/PlistBuddy', ['-c', `Set :CFBundleShortVersionString ${oldVersion}`, path.join(appPath, 'Contents/Info.plist')]);
  execFileSync('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'pipe' });
  execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', appPath], { stdio: 'pipe' });
  await json(path.join(source, 'package.json'), { ...pkg, version: nextVersion });
  await json(path.join(source, 'integrations/electron/package.json'), { ...electronPkg, version: nextVersion });
  const lockFile = path.join(source, 'integrations/electron/package-lock.json'), lock = JSON.parse(await readFile(lockFile, 'utf8'));
  lock.version = nextVersion; lock.packages[''].version = nextVersion; await json(lockFile, lock);
  const archive = path.join(home, 'release.tgz'); execFileSync('tar', ['-czf', archive, '-C', home, 'package'], { env: { ...process.env, COPYFILE_DISABLE: '1' } });
  const bytes = await readFile(archive);
  server = http.createServer((_req, res) => { setTimeout(() => { res.writeHead(200, { 'Content-Length': bytes.length }); res.end(bytes); }, 600); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const release = { version: nextVersion, tag: 'v' + nextVersion, size: bytes.length, digest: 'sha256:' + createHash('sha256').update(bytes).digest('hex'),
    url: `http://127.0.0.1:${server.address().port}/release.tgz`, notes: 'Disposable immutable GUI upgrade fixture. <script>must remain text</script>' };
  const userData = path.join(home, 'user-data'); await mkdir(userData); await json(path.join(userData, 'desktop-setup.json'), { version: 1 });
  await json(fixturePath, { home, userData, support, oldVersion, nextVersion, release, artifactDir, mode });
  const protectedPaths = [path.join(memory, 'notes/keep.md'), cliConfigPath, integration, launchAgent, path.join(support, 'api-key')];
  const before = await Promise.all(protectedPaths.map(file => readFile(file)));
  const env = { ...process.env, HOME: home }; delete env.ELECTRON_RUN_AS_NODE;
  child = spawn(path.join(appPath, 'Contents/MacOS/jumpyBrain'), [], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', data => process.stdout.write(data));
  let stderr = ''; child.stderr.on('data', data => { stderr = (stderr + data).slice(-16000); });
  const deadline = Date.now() + 15 * 60 * 1000;
  let report;
  let interrupted = false;
  while (Date.now() < deadline) {
    report = await readFile(path.join(home, 'result.json'), 'utf8').then(JSON.parse).catch(() => null);
    if (report) break;
    if (mode === 'helper-crash' && !interrupted && await readFile(path.join(home, 'launched.json')).catch(() => null)) {
      const owner = JSON.parse(await readFile(path.join(root, '.installer-lock/desktop.json')));
      assert.equal(path.dirname(owner.directory), path.join(home, 'Library/Application Support/jumpyBrain Updates'));
      process.kill(owner.pid, 'SIGKILL'); interrupted = true;
      await writeFile(path.join(home, 'continue'), 'continue');
    }
    if (mode === 'relaunch-failure' || mode === 'app-crash') {
      const dirs = await readdir(path.join(home, 'Library/Application Support/jumpyBrain Updates')).catch(() => []);
      for (const name of dirs) {
        const dir = path.join(home, 'Library/Application Support/jumpyBrain Updates', name);
        const state = await readFile(path.join(dir, 'state.json'), 'utf8').then(JSON.parse).catch(() => null);
        const journal = await readFile(path.join(dir, 'transaction.json'), 'utf8').then(JSON.parse).catch(() => null);
        if (state?.phase === 'failed' && (journal?.phase === 'rolled-back' || (mode === 'app-crash' && state.detail.includes('canceled') && !journal))) report = { ok: true, rollback: mode !== 'app-crash', canceledAfterAppCrash: mode === 'app-crash', detail: state.detail };
      }
      if (report) break;
    }
    if (child.exitCode && child.exitCode !== 0) throw new Error('Old app failed: ' + stderr);
    await pause(500);
  }
  assert.ok(report, 'installed upgrade timed out'); assert.equal(report.ok, true, report?.error);
  for (let i = 0; i < protectedPaths.length; i++) assert.deepEqual(await readFile(protectedPaths[i]), before[i], protectedPaths[i]);
  const recovered = ['relaunch-failure', 'helper-crash', 'app-crash'].includes(mode);
  const expectedCLI = recovered || mode === 'app-only' ? oldVersion : nextVersion;
  assert.equal(JSON.parse(await readFile(path.join(root, 'app/package.json'))).version, expectedCLI);
  assert.equal(JSON.parse(await readFile(path.join(resources, 'runtime/package.json'))).version, recovered ? oldVersion : nextVersion);
  const installedFiles = new Set(asar.listPackage(path.join(resources, 'app.asar')));
  for (const file of ['updater.mjs', 'update-worker.mjs', 'update-transaction.py', 'update-release.mjs', 'update-policy.mjs', 'desktop-host.mjs', 'host.mjs']) {
    assert.ok(installedFiles.has('/' + file), `Updated app must retain its next-update helper: ${file}`);
  }
  assert.equal(execFileSync(cliPath, ['--version'], { env, encoding: 'utf8' }).trim(), expectedCLI);
  const manifest = JSON.parse(await readFile(path.join(root, 'install-manifest.json')));
  assert.equal(manifest.source, 'https://github.com/nikoatwork/jumpyBrain.git'); assert.equal(manifest.ref, mode === 'app-only' ? 'v0.3.3' : 'master');
  await json(path.join(artifactDir, 'result.json'), { ...report, protectedFiles: protectedPaths.length, sourcePolicyPreserved: true });
  success = true; console.log('Installed GUI update: PASS', JSON.stringify(report));
} finally {
  server?.close();
  if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
  // Test-only app entry writes its result then quits through the real barrier.
  await pause(3000);
  if (success) await rm(home, { recursive: true, force: true });
  else console.error('Retained disposable failure evidence:', home);
}
