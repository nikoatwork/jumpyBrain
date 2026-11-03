#!/usr/bin/env node
// Prepare a separately identified, disposable app; native computer use launches it.
import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify, parseEnv } from 'node:util';
import { directory, runPath } from './run.mjs';

const exec = promisify(execFile), args = process.argv.slice(2);
const value = name => args[args.indexOf(name) + 1];
const read = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const save = async (file, object) => fs.writeFile(file, JSON.stringify(object, null, 2) + '\n', { mode: 0o600 });
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
async function main() {
  if (process.platform !== 'darwin' || !args.includes('--source') || !args.includes('--name')) throw new Error('Usage on macOS: node prepare-candidate.mjs --source <built app> --name <unique candidate name>');
  const source = await fs.realpath(value('--source')), root = runPath(value('--name'));
  await exec('/usr/bin/codesign', ['--verify', '--deep', '--strict', source]);
  const configFile = path.join(directory, '.env.local'), original = await fs.readFile(configFile, 'utf8'), config = parseEnv(original);
  const oldPaths = await read(path.join(config.JB_EVAL_APP, 'Contents/Resources/desktop.json'));
  const connections = await read(path.join(oldPaths.supportDirectory, 'connections.json'));
  const remote = connections.profiles.find(x => x.id === config.JB_EVAL_VPS_PROFILE && x.url === config.JB_EVAL_VPS_URL);
  if (!remote) throw new Error('Configured existing remote profile not found; do not guess a credential reference.');
  await fs.mkdir(root, { mode: 0o700 });
  const app = path.join(root, 'jumpyBrain Eval.app'), resources = path.join(app, 'Contents/Resources');
  // The app's Unix update socket needs a short absolute home, even in a deep checkout.
  const home = await fs.realpath(await fs.mkdtemp('/tmp/jb-ux-'));
  const support = path.join(home, 'support'), userData = path.join(home, 'user-data'), memory = path.join(home, 'memory');
  await fs.writeFile(path.join(root, 'previous.env.local'), original, { mode: 0o600 });
  await exec('/usr/bin/ditto', [source, app]);
  await fs.mkdir(support, { mode: 0o700 }); await fs.mkdir(userData, { mode: 0o700 });
  const nativeFile = path.join(resources, 'native/jumpyBrain Host.app/Contents/Resources/Configuration.json'), native = await read(nativeFile);
  const socket = net.createServer(); await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port; await new Promise(resolve => socket.close(resolve));
  const bundleId = 'local.jumpybrain.experience.' + randomUUID().toLowerCase(), localId = randomUUID();
  await save(nativeFile, { ...native, memoryRoot: memory, supportDirectory: support, port, label: bundleId + '.host', launchAgent: path.join(root, 'unused-login.plist') });
  await save(path.join(resources, 'desktop.json'), { schema: 1, homeDirectory: home, userDataDirectory: userData, supportDirectory: support, port, launchAgent: path.join(home, 'unused-login.plist') });
  await fs.writeFile(path.join(support, 'api-key'), randomBytes(32).toString('hex'), { mode: 0o600 });
  await save(path.join(userData, 'desktop-setup.json'), { version: 1 });
  const cli = path.join(resources, 'runtime/dist/cli.js'), env = { ...process.env, JUMPYBRAIN_QMD_BIN: config.JB_EVAL_QMD }; delete env.ELECTRON_RUN_AS_NODE;
  await exec(native.node, [cli, 'init', '--root', memory, '--json'], { env });
  await save(path.join(support, 'connections.json'), { version: 1, revision: 0, activeId: localId, profiles: [{ id: localId, name: 'Eval local brain', kind: 'local', root: memory, allowWrites: true }, remote] });
  await exec('/usr/libexec/PlistBuddy', ['-c', 'Set :CFBundleIdentifier ' + bundleId, path.join(app, 'Contents/Info.plist')]);
  await exec('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', app]);
  await exec('/usr/bin/codesign', ['--verify', '--deep', '--strict', app]);
  const version = await read(path.join(resources, 'runtime/package.json'));
  await save(path.join(root, 'candidate.json'), { preparedAt: new Date().toISOString(), source, sourceAsarSha256: sha(await fs.readFile(path.join(source, 'Contents/Resources/app.asar'))), configuredAsarSha256: sha(await fs.readFile(path.join(resources, 'app.asar'))), bundleId, version: version.version, app, home, root: memory, port, support, localProfileId: localId, originalInstallationUntouched: true, profileSetup: 'Fixture metadata clones only the already-configured remote credential reference; the native Keychain boundary still supplies credentials.' });
  const next = { ...config, JB_EVAL_NODE: native.node, JB_EVAL_APP: app, JB_EVAL_CLI: cli, JB_EVAL_LOCAL_ROOT: memory, JB_EVAL_LOCAL_PROFILE: localId, JB_EVAL_LOCAL_LANE: 'dedicated-synthetic' };
  await fs.writeFile(configFile, Object.entries(next).map(([k, v]) => k + '=' + JSON.stringify(v)).join('\n') + '\n', { mode: 0o600 });
  console.log(JSON.stringify({ candidate: root, app, bundleId, version: version.version, launch: 'Use native cua.getApp with this exact app path. No app was launched or installed by preparation.' }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
