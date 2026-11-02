// Programmatic native Electron input/AX proof using packaged resources only.
// This does not establish physical IME, VoiceOver usability or publisher identity.
import assert from 'node:assert/strict';
import path from 'node:path';
import net from 'node:net';
import { mkdtemp, realpath, mkdir, cp, readFile, writeFile, symlink, rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { spawn, execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
const repo = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
assert.ok(args.length === 2 && args[0] === '--resources', 'Usage: node scripts/native-collaboration-input-smoke.mjs --resources <matching packaged resources>');
assert.equal(process.platform, 'darwin', 'This proof requires the packaged macOS native host.');
const built = path.resolve(args[1]);
const electron = createRequire(new URL('../integrations/electron/package.json', import.meta.url))('electron');
const temporary = await realpath(await mkdtemp(path.join('/tmp', 'jb-ime-')));
const reportDirectory = path.join(repo, '.local-pack/native-collaboration-input');
let child, nativeConfig, root;
try {
  // Verify supplied signed bytes before relocating the native host for private paths.
  execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', path.dirname(path.dirname(built))], { stdio: 'pipe' });
  const resources = path.join(temporary, 'Resources'); await mkdir(path.join(resources, 'native'), { recursive: true });
  await cp(path.join(built, 'native/jumpyBrain Host.app'), path.join(resources, 'native/jumpyBrain Host.app'), { recursive: true, verbatimSymlinks: true });
  await cp(path.join(built, 'MenuBarBrain.png'), path.join(resources, 'MenuBarBrain.png'));
  await symlink(path.join(built, 'runtime'), path.join(resources, 'runtime'));
  const configFile = path.join(resources, 'native/jumpyBrain Host.app/Contents/Resources/Configuration.json');
  nativeConfig = JSON.parse(await readFile(configFile, 'utf8'));
  const support = path.join(temporary, 'support'); await mkdir(support, { mode: 0o700 });
  root = path.join(temporary, 'memory');
  const { createServerMemoryRuntime } = await import(pathToFileURL(path.join(built, 'runtime/dist/server/index.js')).href);
  await createServerMemoryRuntime({ root }).initializeMemoryRoot();
  const id = 'mem_98888888-8888-4888-8888-888888888888';
  await writeFile(path.join(root, 'notes/native-input.md'), `---\nid: ${id}\ntitle: Native input fixture\ntype: note\n---\nNative editor anchor.\n\n`);
  await writeFile(path.join(support, 'api-key'), randomBytes(32).toString('hex'), { mode: 0o600 });
  const socket = net.createServer(); await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port; await new Promise(resolve => socket.close(resolve));
  await writeFile(configFile, JSON.stringify({ ...nativeConfig, supportDirectory: support, memoryRoot: root, port }));
  execFileSync('/usr/bin/codesign', ['--force', '--sign', '-', path.join(resources, 'native/jumpyBrain Host.app')], { stdio: 'pipe' });
  execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', path.join(resources, 'native/jumpyBrain Host.app')], { stdio: 'pipe' });
  await writeFile(path.join(resources, 'desktop.json'), JSON.stringify({ schema: 1, supportDirectory: support, port, launchAgent: path.join(temporary, 'login.plist') }));
  const userData = path.join(temporary, 'user-data'); await mkdir(userData);
  await writeFile(path.join(userData, 'desktop-setup.json'), '{"version":1}');
  const result = path.join(temporary, 'result.json'), fixture = path.join(temporary, 'fixture.json');
  const packageFile = path.join(built, 'app.asar');
  const installedVersion = JSON.parse(await readFile(path.join(built, "runtime/package.json"), "utf8")).version;
  const packagedElectronVersion = execFileSync('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleVersion', path.join(path.dirname(built), 'Frameworks/Electron Framework.framework/Resources/Info.plist')], { encoding: 'utf8' }).trim();
  await writeFile(fixture, JSON.stringify({ resources, userData, result, installedVersion, packagedElectronVersion, home: temporary, root, id, node: nativeConfig.node,
    cli: path.join(built, 'runtime/dist/cli.js'), application: path.join(packageFile, 'application.mjs'),
    artifact: { appAsarSha256: createHash('sha256').update(await readFile(packageFile)).digest('hex'), build: JSON.parse(await readFile(path.join(built, 'runtime/dist/adapters/diagnostics/build-info.json'), 'utf8')) } }));
  const entry = path.join(temporary, 'entry'); await mkdir(entry);
  await writeFile(path.join(entry, 'package.json'), JSON.stringify({ name: 'jumpybrain-native-input-proof', version: installedVersion, type: 'module', main: path.join(repo, 'scripts/fixtures/native-collaboration-input-electron.mjs') }));
  const env = { ...process.env, JUMPYBRAIN_NATIVE_INPUT_FIXTURE: fixture }; delete env.ELECTRON_RUN_AS_NODE;
  child = spawn(electron, [entry], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', chunk => process.stdout.write(chunk));
  // Electron errors may contain private bootstrap URLs; never echo stderr.
  let stderr = ''; child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-10000); });
  const timer = setTimeout(() => child.kill('SIGKILL'), 90000);
  const code = await new Promise((resolve, reject) => { child.once('exit', resolve); child.once('error', reject); }).finally(() => clearTimeout(timer));
  const report = JSON.parse(await readFile(result, 'utf8'));
  await mkdir(reportDirectory, { recursive: true });
  await writeFile(path.join(reportDirectory, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  assert.equal(report.ok, true, report.error); assert.equal(code, 0); assert.equal(report.versions.electron, packagedElectronVersion, 'The input proof must use the packaged Electron engine version.');
  assert.deepEqual(report.checks, [
    'native AX editor/title labels and multiline/status live semantics',
    'native menu Undo/Redo and keyboard parity preserve canonical body; title input retains native history',
    'CDP native IME preedit blocks flush; remote packaged CLI edit survives Japanese commit and canonical Saved',
    'overlapping native IME retains both versions, blocks flush, exposes labeled readonly recovery fields and actions in AX tree',
    'native menu expired Undo/Redo informs without blocking fresh editing or changing saved source',
  ], 'Every required native input/AX scenario must finish.');
  console.log('Native collaboration IME/accessibility: PASS');
} finally {
  if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  if (root && nativeConfig?.node) {
    await new Promise(resolve => { const stop = spawn(nativeConfig.node, [path.join(built, 'runtime/dist/cli.js'), 'backend', 'stop', '--root', root, '--json'], { stdio: 'ignore' }); const timeout = setTimeout(() => stop.kill('SIGKILL'), 10000); const done = () => {clearTimeout(timeout); resolve();}; stop.once('exit', done); stop.once('error', done); });
  }
  await new Promise(resolve => setTimeout(resolve, 1200));
  await rm(temporary, { recursive: true, force: true });
}
