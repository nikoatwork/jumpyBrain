// Disposable installed old→new GUI upgrade using the production updater and an immutable local release asset.
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import net from 'node:net';
import { mkdtemp, realpath, mkdir, cp, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { createServerMemoryRuntime } from '../dist/server/index.js';
import { loginPlist } from '../integrations/electron/login.mjs';
import { installExtension } from '../dist/app/extensions/index.js';
import { seedV1Extension, v1Context } from './extensions-v1-fixture.mjs';
const repo = fileURLToPath(new URL('..', import.meta.url));
const mode = process.argv[2] || 'success';
const existingClient = process.argv[3] === '--client-v0.3.7';
if (process.argv.length > (existingClient ? 4 : 3) || (existingClient && mode !== 'success')) throw new Error('Usage: desktop-update-smoke.mjs <mode> [--client-v0.3.7 (success only)]');
if (!['success','app-only','relaunch-failure','helper-crash','app-crash','cli-open','cli-closed'].includes(mode)) throw new Error('Unsupported smoke mode');
const asar = await import(path.join(repo, 'integrations/electron/node_modules/@electron/asar/lib/asar.js'));
const home = await realpath(await mkdtemp(path.join(os.tmpdir(), 'jb-update-smoke-')));
const artifactDir = path.join(repo, '.local-pack/update-smoke', existingClient ? 'client-v0.3.7' : mode); await mkdir(artifactDir, { recursive: true });
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
  await writeFile(path.join(memory, 'notes/work.md'), '---\nid: mem_22222222-2222-4222-8222-222222222222\ntype: note\ntitle: Working while preparing\n---\nKeep editing.\n');
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
  const oldVersion = existingClient ? '0.3.7' : '0.3.3', nextVersion = existingClient ? '0.3.8' : '0.3.4';
  assert.equal(pack.files.some(file => /(^|\/)node_modules\//.test(file.path)), false, 'incoming release must not borrow checkout dependencies');
  await json(path.join(source, 'package.json'), { ...pkg, version: oldVersion });
  await json(path.join(source, 'integrations/electron/package.json'), { ...electronPkg, version: oldVersion });
  await rm(path.join(resources, 'runtime/dist'), { recursive: true });
  await cp(path.join(source, 'dist'), path.join(resources, 'runtime/dist'), { recursive: true });
  await json(path.join(resources, 'runtime/package.json'), { ...pkg, version: oldVersion });
  await cp(source, path.join(root, 'app'), { recursive: true });
  // Model a working source-installed old CLI, including its lazy production compiler.
  // The incoming release remains node_modules-free and installs only Electron dependencies.
  await cp(path.join(resources, 'runtime/node_modules'), path.join(root, 'app/node_modules'), { recursive: true });
  const cliPath = path.join(root, 'bin/jumpybrain'), cliConfigPath = path.join(root, 'cli-config.json');
  await writeFile(cliPath, `#!/usr/bin/env sh\nif [ -z "\${JUMPYBRAIN_CLI_CONFIG+x}" ]; then\n  export JUMPYBRAIN_CLI_CONFIG='${cliConfigPath}'\nfi\nexec node ${JSON.stringify(path.join(root, 'app/dist/cli.js'))} "$@"\n`, { mode: 0o755 });
  await json(cliConfigPath, { schemaVersion: 1, remoteTargets: [{ origin: 'https://example.invalid', access: 'read-only' }] });
  const integration = path.join(home, 'agent-skill.md'); await writeFile(integration, 'Preserve agent integration');
  await json(path.join(root, 'install-manifest.json'), { version: 1, installer: 'jumpybrain-installer', source: 'https://github.com/nikoatwork/jumpyBrain.git', ref: mode === 'app-only' ? 'v0.3.3' : 'master', scope: 'global', integrationMode: 'auto', installRoot: root,
    appDir: path.join(root, 'app'), binDir: path.join(root, 'bin'), cliPath, cliConfigPath, memoryRoot: memory, integrations: [{ kind: 'fixture', path: integration }], installedVersion: oldVersion });
  // Optional compatibility gate executes the exact published worker, never a
  // repaired candidate worker. It still installs only the incoming Electron lock.
  const workerFile = path.join(source, 'integrations/electron/update-worker.mjs');
  const candidateWorker = await readFile(workerFile);
  let clientWorkerDigest;
  if (existingClient) {
    const publishedWorker = execFileSync('git', ['show', 'v0.3.7:integrations/electron/update-worker.mjs'], { cwd: repo });
    clientWorkerDigest = createHash('sha256').update(publishedWorker).digest('hex');
    assert.equal(clientWorkerDigest, '9d184e089d493220ffff00ed3d0def06424e99f26949575add64a60b76750858');
    await writeFile(workerFile, publishedWorker);
  }
  await rm(path.join(resources, 'app.asar')); await asar.createPackage(path.join(source, 'integrations/electron'), path.join(resources, 'app.asar'));
  await writeFile(workerFile, candidateWorker);

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
  const extensionDirectory = path.join(support, 'extensions');
  const extensionFiles = await seedV1Extension(extensionDirectory, path.join(home, 'extension-packages/v1'));
  const auditSource = path.join(home, 'extension-packages/probe-audit');
  const auditFile = path.join(home, 'extension-activations.jsonl');
  await mkdir(auditSource, { recursive: true });
  await json(path.join(auditSource, 'jumpybrain-extension.json'), {apiVersion:1,id:'probe-audit',name:'Probe audit',version:'1.0.0',main:'main.ts',ui:'ui.ts'});
  await writeFile(path.join(auditSource, 'main.ts'), `import { appendFileSync } from 'node:fs'; export default async api => { const migrations = Number(await api.state.get('migrations') ?? 0) + 1; await api.state.set('migrations',migrations); appendFileSync(${JSON.stringify(auditFile)}, JSON.stringify({migrations,readinessOnly:process.env.JUMPYBRAIN_READINESS_ONLY === '1'})+'\\n'); api.registerPanel({id:'details',title:'Upgrade audit'}); api.registerCommand({id:'show',title:'Open upgrade audit',slot:'note.actions',handler:()=>({panel:{id:'details',data:{verified:true}}})}); };`);
  await writeFile(path.join(auditSource,'ui.ts'), `export default api => { api.registerPanel('details',(container,data)=>{container.textContent=JSON.stringify(data)}); };`);
  await installExtension({directory:extensionDirectory,source:auditSource});
  const protectedPaths = [...extensionFiles.filter(file => !file.endsWith('/state/v1-contract.json')), path.join(memory, 'notes/keep.md'), cliConfigPath, integration, launchAgent, path.join(support, 'api-key')];
  const before = await Promise.all(protectedPaths.map(file => readFile(file)));
  const env = { ...process.env, HOME: home }; delete env.ELECTRON_RUN_AS_NODE;
  if (mode === 'cli-closed') {
    const preview = execFileSync('node', [path.join(root, 'app/dist/cli.js'), 'update', '--home', home, '--dry-run'], { env, encoding: 'utf8' });
    assert.match(preview, /Paired Mac update preview/);
    const entry = path.join(home, 'run-cli.mjs');
    await writeFile(entry, `
      import { pairedInstallation, runPairedUpdate } from ${JSON.stringify(path.join(root, 'app/integrations/electron/update-cli.mjs'))};
      import { createDesktopUpdater } from ${JSON.stringify(path.join(root, 'app/integrations/electron/updater.mjs'))};
      import { spawn } from 'node:child_process';
      const options = ${JSON.stringify({ home, installRoot: root, source: 'https://github.com/nikoatwork/jumpyBrain.git', ref: 'master' })};
      await runPairedUpdate({ ...options, installation: await pairedInstallation(options), createUpdater: options => createDesktopUpdater({ ...options, discover: async () => (${JSON.stringify(release)}), spawnWorker: (node, args, options) => spawn(node, [${JSON.stringify(path.join(repo, 'integrations/electron/smoke-update-worker.mjs'))}, ...args], options) }) });
    `);
    child = spawn('node', [entry], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  } else child = spawn(path.join(appPath, 'Contents/MacOS/jumpyBrain'), [], { env, stdio: ['ignore', 'pipe', 'pipe'] });
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
  for (let i = 0; i < protectedPaths.length; i++) {
    const after = await readFile(protectedPaths[i]);
    if (/registry(?:\.backup)?\.json$/.test(protectedPaths[i])) {
      const actual = JSON.parse(after), original = JSON.parse(before[i]);
      for (const entry of actual.entries) {
        if (entry.successful) assert.deepEqual(entry.successful, {manifest:entry.manifest,prepared:entry.prepared});
        delete entry.successful;
      }
      assert.deepEqual(actual, original);
    } else assert.deepEqual(after, before[i], protectedPaths[i]);
  }
  if (mode === 'relaunch-failure') {
    await json(fixturePath, { ...JSON.parse(await readFile(fixturePath)), verifyRollback: true });
    child = spawn(path.join(appPath, 'Contents/MacOS/jumpyBrain'), [], { env, stdio: ['ignore','pipe','pipe'] });
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline && !await readFile(path.join(home,'profile-result.json')).catch(()=>null)) await pause(100);
    const profile = JSON.parse(await readFile(path.join(home,'profile-result.json')));
    assert.equal(profile.ok,true,profile.error); report.profilePreferences = true;
    await new Promise(resolve => child.exitCode !== null ? resolve() : child.once('exit',resolve));
  }
  if (['success','relaunch-failure'].includes(mode)) {
    const activations = (await readFile(auditFile,'utf8')).trim().split('\n').map(JSON.parse);
    // Legacy published workers do not request suppression; retain that explicit compatibility limit.
    if (!existingClient) { assert.equal(activations.length,2, 'only the original and actual relaunch may activate/migrate extensions'); assert.equal(activations.some(item=>item.readinessOnly),false); assert.deepEqual(activations.map(item=>item.migrations),[1,2]); assert.equal(JSON.parse(await readFile(path.join(extensionDirectory,'state/probe-audit.json'))).migrations,2); }
    if (existingClient) { assert.equal(activations.length,4, 'historical workers retain their documented two probe activations'); assert.deepEqual(activations.map(item=>item.migrations),[1,2,3,4]); }
    report.extensionActivationCount = activations.length;
  }
  if (mode === 'success') assert.deepEqual(await readFile(path.join(memory, 'notes/work.md')), await readFile(path.join(home, 'work-before.md')));
  // Invoke the frozen external package through the installed replacement runtime, not checkout code.
  const { createExtensionHost } = await import(pathToFileURL(path.join(resources, 'runtime/dist/app/extensions/index.js')).href);
  const extensionHost = await createExtensionHost({ directory: extensionDirectory });
  try {
    assert.equal(extensionHost.snapshot().extensions.find(item => item.id === 'v1-disabled').status, 'disabled');
    const result = await extensionHost.invoke('v1-contract', 'inspect', null, v1Context());
    assert.deepEqual(result.panel.data.state, { from: 'v1' });
    assert.equal(result.panel.data.version, 1);
  } finally { await extensionHost.dispose(); }
  const recovered = ['relaunch-failure', 'helper-crash', 'app-crash'].includes(mode);
  const expectedCLI = recovered || mode === 'app-only' ? oldVersion : nextVersion;
  assert.equal(JSON.parse(await readFile(path.join(root, 'app/package.json'))).version, expectedCLI);
  assert.equal(JSON.parse(await readFile(path.join(resources, 'runtime/package.json'))).version, recovered ? oldVersion : nextVersion);
  const installedFiles = new Set(asar.listPackage(path.join(resources, 'app.asar')));
  for (const file of ['updater.mjs', 'update-worker.mjs', 'update-transaction.py', 'update-release.mjs', 'update-policy.mjs', 'desktop-host.mjs', 'host.mjs', 'update-inline.mjs', 'update-control.mjs', 'update-cli.mjs']) {
    assert.ok(installedFiles.has('/' + file), `Updated app must retain its next-update helper: ${file}`);
  }
  assert.equal(execFileSync(cliPath, ['--version'], { env, encoding: 'utf8' }).trim(), expectedCLI);
  const cliExtension = JSON.parse(execFileSync(cliPath, ['extensions', 'install', '--source', path.join(home, 'extension-packages/v1'), '--directory', path.join(home, 'cli-extension-check/extensions'), '--json'], { env, encoding: 'utf8' }));
  assert.ok(cliExtension.prepared.revision, 'installed CLI must compile a fresh TS/UI extension after upgrade');
  const manifest = JSON.parse(await readFile(path.join(root, 'install-manifest.json')));
  assert.equal(manifest.source, 'https://github.com/nikoatwork/jumpyBrain.git'); assert.equal(manifest.ref, mode === 'app-only' ? 'v0.3.3' : 'master');
  await json(path.join(artifactDir, 'result.json'), { ...report, protectedFiles: protectedPaths.length, sourcePolicyPreserved: true, extensionV1Preserved: true, installedCliExtensionCompilation: true, profilePreferences: ['success','relaunch-failure'].includes(mode), probeActivationSuppressed: !existingClient && ['success','relaunch-failure'].includes(mode), existingClient: existingClient ? 'v0.3.7' : undefined, clientWorkerDigest });
  success = true; console.log('Installed GUI update: PASS', JSON.stringify(report));
} finally {
  server?.close();
  if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
  // Test-only app entry writes its result then quits through the real barrier.
  await pause(3000);
  if (success) await rm(home, { recursive: true, force: true });
  else console.error('Retained disposable failure evidence:', home);
}
