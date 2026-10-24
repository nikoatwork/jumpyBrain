// Fresh packaged resources required. Never installs or changes a real app/profile.
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { randomBytes, createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, cp, symlink, realpath } from 'node:fs/promises';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('..', import.meta.url));
const [builtArg, sourceArg = repo, mode = 'fixture'] = process.argv.slice(2);
assert.ok(builtArg && ['fixture', 'physical'].includes(mode), 'Usage: node scripts/desktop-onboarding-smoke.mjs <fresh Resources> [source checkout] [fixture|physical]');
const built = path.resolve(builtArg), source = path.resolve(sourceArg);
// Darwin sockaddr_un permits only 104 bytes, including the terminator.
const base = await realpath(await mkdtemp('/tmp/jb-onboarding-smoke-'));
const home = path.join(base, 'home'), rootA = path.join(home, '.jumpybrain/memory');
const rootB = path.join(base, 'Separate brain B'), invalidRoot = path.join(base, 'Unrelated folder');
const resources = path.join(base, 'Resources'), support = path.join(base, 'support');
await mkdir(support, { mode: 0o700 }); await mkdir(path.join(home, 'Library/Application Support'), { recursive: true }); await mkdir(rootB); await mkdir(invalidRoot);
await writeFile(path.join(invalidRoot, 'keep.txt'), 'Fictional unrelated file; preserve exactly.');
await mkdir(path.join(resources, 'native'), { recursive: true });
await cp(path.join(built, 'native/jumpyBrain Host.app'), path.join(resources, 'native/jumpyBrain Host.app'), { recursive: true, verbatimSymlinks: true });
await cp(path.join(built, 'MenuBarBrain.png'), path.join(resources, 'MenuBarBrain.png'));
await symlink(path.join(built, 'runtime'), path.join(resources, 'runtime'));
const runtimeRoot = path.join(resources, 'runtime');
const cli = path.join(runtimeRoot, 'dist/cli.js');
const env = { ...process.env, HOME: home, JUMPYBRAIN_CLI_CONFIG: path.join(home, '.jumpybrain/cli-config.json'), JUMPYBRAIN_QMD_BIN: process.env.JUMPYBRAIN_QMD_BIN ?? '/opt/homebrew/bin/qmd' };
delete env.ELECTRON_RUN_AS_NODE; delete env.JUMPYBRAIN_API_KEY;
function command(args, input) { return execFileSync(process.execPath, [cli, ...args], { env, cwd: home, input, encoding: 'utf8', timeout: 60000 }); }
command(['init', '--root', rootA, '--json']);
const remembered = JSON.parse(command(['remember', '--root', rootA, '--type', 'note', '--title', 'Fictional cobalt heron', '--json'], 'The fictional cobalt heron visits on Tuesday. Year unspecified.'));
const noteId = remembered.id ?? remembered.memory?.id ?? remembered.note?.id;
assert.ok(noteId, 'CLI remember returns an ID');
const cliConfig = path.join(home, '.jumpybrain/cli-config.json');
await writeFile(cliConfig, JSON.stringify({ schemaVersion: 1, remoteTargets: [] }) + '\n');
const cliBefore = await readFile(cliConfig);
const settingPaths = [path.join(os.homedir(), '.jumpybrain/cli-config.json'), path.join(os.homedir(), '.jumpybrain/install-manifest.json'), path.join(os.homedir(), 'Library/Application Support/jumpyBrain Companion/connections.json'), path.join(os.homedir(), 'Library/Application Support/jumpyBrain Electron Prototype/desktop-setup.json')];
async function fingerprints() { return Promise.all(settingPaths.map(async file => { try { return createHash('sha256').update(await readFile(file)).digest('hex'); } catch (e) { if (e.code === 'ENOENT') return 'absent'; throw e; } })); }
const actualBefore = await fingerprints();
const socket = net.createServer(); await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve)); const port = socket.address().port; await new Promise(resolve => socket.close(resolve));
const configFile = path.join(resources, 'native/jumpyBrain Host.app/Contents/Resources/Configuration.json');
const nativeConfig = JSON.parse(await readFile(configFile, 'utf8'));
await writeFile(configFile, JSON.stringify({ ...nativeConfig, supportDirectory: support, memoryRoot: rootA, port }));
execFileSync('/usr/bin/codesign', ['--force', '--sign', '-', path.join(resources, 'native/jumpyBrain Host.app')], { stdio: 'pipe' });
await writeFile(path.join(support, 'api-key'), randomBytes(32).toString('hex'), { mode: 0o600 });
await writeFile(path.join(resources, 'desktop.json'), JSON.stringify({ schema: 1, supportDirectory: support, port, launchAgent: path.join(base, 'unused-login.plist') }));
const screenshotDir = path.join(base, 'screenshots'); await mkdir(screenshotDir);
const userData = path.join(base, 'electron'); await mkdir(userData);
const entry = path.join(base, 'entry'); await mkdir(entry);
await cp(path.join(repo, 'integrations/electron/smoke-onboarding.mjs'), path.join(entry, 'main.mjs'));
await writeFile(path.join(entry, 'package.json'), JSON.stringify({ name: 'jumpybrain-onboarding-smoke', type: 'module', main: 'main.mjs' }));
const fixturePath = path.join(base, 'fixture.json'), result = path.join(base, 'result.json');
const requireElectron = createRequire(path.join(source, 'integrations/electron/package.json'));
let electron = requireElectron('electron');
if (mode === 'physical') {
  const { packager } = await import(requireElectron.resolve('@electron/packager'));
  const [bundle] = await packager({ dir: entry, name: 'jumpyBrain Onboarding QA', appBundleId: 'local.jumpybrain.onboarding-qa', appVersion: '0.3.8', electronVersion: '44.8.0', platform: 'darwin', arch: process.arch, out: path.join(base, 'qa-app'), asar: false, prune: false });
  electron = path.join(bundle, 'jumpyBrain Onboarding QA.app/Contents/MacOS/jumpyBrain Onboarding QA');
  console.log('Isolated physical QA app: ' + path.dirname(path.dirname(electron)));
}
console.log(JSON.stringify({ base, mode, rootA, rootB, invalidRoot, screenshotDir }));
const longUpdateHome = path.join(base, 'overlong-home-'.repeat(12));
for (const phase of mode === 'fixture' ? ['first', 'reopen', 'missing', 'socket'] : ['physical', 'reopen']) {
  await writeFile(fixturePath, JSON.stringify({ source, moduleDirectory: path.join(built, 'app.asar'), resources, home, longUpdateHome, rootA, rootB, invalidRoot, userData, result, screenshotDir, noteId, phase }));
  const child = spawn(electron, [entry], { env: { ...env, JUMPYBRAIN_ONBOARDING_SMOKE: fixturePath }, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', data => process.stdout.write(data));
  // Bootstrap URLs and native errors remain private, never print raw stderr.
  let stderr = ''; child.stderr.on('data', data => { stderr = (stderr + data).slice(-20000); });
  const timer = setTimeout(() => child.kill('SIGKILL'), phase === 'physical' ? 600000 : 120000);
  const code = await new Promise(resolve => child.once('exit', resolve)); clearTimeout(timer);
  await writeFile(path.join(base, 'private-stderr-' + phase + '.log'), stderr, { mode: 0o600 });
  assert.equal(code, 0, 'Electron fixture failed; inspect private result at ' + result);
  const report = JSON.parse(await readFile(result, 'utf8')); assert.equal(report.ok, true, report.error);
  assert.ok(report.checks.length > 0, 'fixture must finish its behavioral assertions before exit');
  await writeFile(path.join(base, 'report-' + phase + '.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  const deadline = Date.now() + 16000;
  let stopped = false;
  while (Date.now() < deadline) { try { await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(500) }); } catch { stopped = true; break; } await new Promise(resolve => setTimeout(resolve, 100)); }
  assert.ok(stopped, 'native gateway stopped after explicit quit');
  await new Promise(resolve => setTimeout(resolve, 800));
}
const recalled = command(['recall', '--root', rootA, '--query', 'cobalt heron', '--json']);
assert.match(recalled, /Year unspecified/); assert.match(recalled, /Saved from candidate Desktop/);
const compact = JSON.parse(command(['recall', '--root', rootA, '--query', 'cobalt heron', '--compact']));
const handle = compact.passages.find(p => p.expansion?.available).expansion;
const expanded = command(['expand', '--root', rootA, '--id', handle.id, '--if-match', handle.expectedContentHash, '--json']);
assert.match(expanded, /Saved from candidate Desktop/);
assert.deepEqual(await readFile(cliConfig), cliBefore);
assert.deepEqual(await fingerprints(), actualBefore, 'actual app and CLI settings remain byte-identical');
await writeFile(path.join(base, 'summary.json'), JSON.stringify({ ok: true, mode, runtimeRoot, rootA, rootB, checkedRealSettings: settingPaths.length, checkedRealSettingsUnchanged: true, cliPolicyUnchanged: true, recallAndGuardedExpand: true }, null, 2));
console.log('Desktop onboarding PASS: native helper, app lifecycle, CLI roundtrip, separate targets, checked real settings unchanged. Artifacts retained: ' + base);
