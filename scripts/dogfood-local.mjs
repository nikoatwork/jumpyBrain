#!/usr/bin/env node
// Maintainer-only local candidate workflow. No publication and no memory writes.
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, writeFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { cliPolicy, readJSON } from '../integrations/electron/update-policy.mjs';
import { bundledHost, startDesktopHost } from '../integrations/electron/desktop-host.mjs';
import { probeCompanion, readControlKey } from '../integrations/electron/host.mjs';
import { desktopPrerequisites } from './desktop-prerequisites.mjs';

const repo = fileURLToPath(new URL('..', import.meta.url));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
function run(command, args, cwd = repo, capture = false) {
  return execFileSync(command, args, { cwd, encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit' });
}
async function json(file, value) {
  await writeFile(file + '.tmp', JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  await rename(file + '.tmp', file);
}
export async function snapshot(checkout, directory, ref = 'HEAD') {
  const commit = run('git', ['rev-parse', '--verify', '--end-of-options', ref + '^{commit}'], checkout, true).trim();
  const archive = path.join(directory, 'source.tar');
  const source = path.join(directory, 'unpacked/package');
  await mkdir(source, { recursive: true });
  run('git', ['archive', '--format=tar', '--output', archive, commit], checkout);
  run('tar', ['-xf', archive, '-C', source]);
  await rm(archive);
  const metadata = await readJSON(path.join(source, 'package.json'));
  const electron = await readJSON(path.join(source, 'integrations/electron/package.json'));
  if (metadata.version !== electron.version) throw new Error('Committed app and CLI versions differ.');
  metadata.jumpybrain = { ...metadata.jumpybrain, localBuild: { commit, builtAt: new Date().toISOString() } };
  await json(path.join(source, 'package.json'), metadata);
  return { source, commit, version: metadata.version };
}
export function matchesCandidate(receipt, cli, runtime, appVersion) {
  return receipt?.phase === 'installed' && cli?.jumpybrain?.localBuild?.commit === receipt.commit
    && runtime?.jumpybrain?.localBuild?.commit === receipt.commit
    && cli.version === receipt.version && runtime.version === receipt.version && appVersion === receipt.version;
}
function appVersion(app) {
  return run('/usr/bin/plutil', ['-extract', 'CFBundleShortVersionString', 'raw', '-o', '-', path.join(app, 'Contents/Info.plist')], repo, true).trim();
}
function running(app) {
  return run('/bin/ps', ['-axo', 'comm='], repo, true).split('\n').some(line => line.trim() === path.join(app, 'Contents/MacOS/jumpyBrain'));
}
async function quit(app) {
  if (!running(app)) return;
  console.log('Asking jumpyBrain to save all tabs and quit…');
  run('/usr/bin/osascript', ['-e', 'on run argv\ntell application (item 1 of argv) to quit\nend run', app]);
  const deadline = Date.now() + 45000;
  while (running(app) && Date.now() < deadline) await pause(200);
  if (running(app)) throw new Error('jumpyBrain is still running. Resolve its unsaved tabs and retry. Nothing was replaced.');
}
async function ready(app) {
  const host = await startDesktopHost(await bundledHost(path.join(app, 'Contents/Resources')), { readinessOnly: true });
  await host.stop();
}
export function desktopEnvironment(environment = process.env) {
  const result = { ...environment };
  delete result.ELECTRON_RUN_AS_NODE;
  return result;
}
async function reopen(app) {
  execFileSync('/usr/bin/open', [app], { env: desktopEnvironment(), stdio: 'inherit', timeout: 15000 });
  const config = await bundledHost(path.join(app, 'Contents/Resources'));
  const key = await readControlKey(config.supportDirectory);
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try { await probeCompanion(config.origin, key); return; } catch { await pause(250); }
  }
  throw new Error('Software installed, but startup was not verified. Open jumpyBrain and inspect its status.');
}
async function status(root, app) {
  let receipt;
  try { receipt = await readJSON(path.join(root, 'dogfood/current.json')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; console.log('No local candidate has been installed with this workflow.'); return; }
  const cli = await readJSON(path.join(root, 'app/package.json'));
  const runtime = await readJSON(path.join(app, 'Contents/Resources/runtime/package.json'));
  const current = matchesCandidate(receipt, cli, runtime, appVersion(app));
  console.log(JSON.stringify({ ...receipt, current, elapsedHours: current ? Math.max(0, (Date.now() - Date.parse(receipt.installedAt)) / 3600000) : null,
    guidance: 'About a day of normal use before release; shorter testing is an owner decision. Elapsed time does not prove use.' }, null, 2));
  if (!current) throw new Error('The recorded candidate is no longer installed across all components.');
}
async function main(args) {
  const [action = 'install', ref = 'HEAD'] = args;
  if (action === '--help') {
    console.log('Usage: node scripts/dogfood-local.mjs install [git-ref] | status | rollback\nInstalls committed HEAD by default into the existing managed Mac app and CLI.\nUncommitted work is excluded. No fetch, version bump, publication or nightly job.\nThe app saves/quits normally; previous software is retained for rollback.'); return;
  }
  if (!['install', 'status', 'rollback'].includes(action) || args.length > (action === 'install' ? 2 : 1)) throw new Error('Unsupported arguments; use --help.');
  if (process.platform !== 'darwin') throw new Error('Local app dogfooding currently requires macOS.');
  const home = os.homedir(), root = path.join(home, '.jumpybrain'), app = path.join(home, 'Applications/jumpyBrain.app');
  if (action === 'status') return status(root, app);
  const missing = desktopPrerequisites();
  if (missing.length) throw new Error(missing.join('\n'));
  const policy = await cliPolicy(home);
  if (policy.kind !== 'managed') throw new Error('This command requires the default managed CLI. ' + policy.detail);
  const store = path.join(root, 'dogfood');
  await mkdir(store, { recursive: true, mode: 0o700 });
  const lock = path.join(root, '.installer-lock');
  await mkdir(lock, { mode: 0o700 }); // Fail closed if any installer owns it.
  let directory, retainLock = false;
  try {
    if (action === 'rollback') {
      const receipt = await readJSON(path.join(store, 'current.json'));
      if (receipt.phase !== 'installed' || path.dirname(receipt.directory) !== store) throw new Error('No installed candidate is available for rollback.');
      directory = receipt.directory;
      // Inode checks in guarded_rollback reject later replacements, even at the same version.
      await quit(app);
      const journalPath = path.join(directory, 'transaction.json');
      const journal = await readJSON(journalPath);
      if (journal.phase !== 'success') throw new Error('Incomplete transaction; inspect ' + directory);
      await json(journalPath, { ...journal, phase: 'published' });
      run('python3', ['-B', path.join(directory, 'update-transaction.py'), 'rollback', directory]);
      await json(path.join(store, 'current.json'), { ...receipt, phase: 'rolled-back', rolledBackAt: new Date().toISOString() });
      console.log('Previous app, CLI and install manifest restored. Brain files and settings were not rolled back.');
      await reopen(app);
      return;
    }
    directory = await mkdtemp(path.join(store, 'candidate-'));
    const candidate = await snapshot(repo, directory, ref);
    console.log(`Building committed ${candidate.commit} (base version ${candidate.version}). Working-tree edits are excluded.`);
    const { source } = candidate;
    await copyFile(path.join(source, 'integrations/electron/update-transaction.py'), path.join(directory, 'update-transaction.py'));
    run('npm', ['ci', '--no-audit', '--no-fund'], source);
    run('npm', ['run', 'build'], source);
    run('npm', ['ci', '--no-audit', '--no-fund'], path.join(source, 'integrations/electron'));
    run(process.execPath, ['install.mjs', '--output', path.join(directory, 'built')], path.join(source, 'integrations/electron'));
    const configuration = JSON.parse(run('python3', ['-B', '-c',
      'import importlib.util,json,pathlib,sys; s=importlib.util.spec_from_file_location("desktop",sys.argv[1]); m=importlib.util.module_from_spec(s); s.loader.exec_module(m); print(json.dumps(m.configuration(pathlib.Path.home())))',
      path.join(source, 'integrations/electron/desktop-install.py')], source, true));
    const request = { home, appPath: app, configuration, installed: { app: appVersion(app) }, updateCLI: true, cli: policy,
      release: { version: candidate.version, channel: 'local', commit: candidate.commit }, preparedAt: new Date().toISOString() };
    await json(path.join(directory, 'request.json'), request);
    await quit(app);
    await ready(path.join(directory, 'built/jumpyBrain.app'));
    run('python3', ['-B', path.join(directory, 'update-transaction.py'), 'publish', directory]);
    await ready(app);
    const manifest = await readJSON(path.join(root, 'install-manifest.json'));
    run(path.join(root, 'bin/jumpybrain'), ['doctor', '--root', manifest.memoryRoot, '--check']);
    const receipt = { schema: 1, phase: 'installed', commit: candidate.commit, version: candidate.version,
      installedAt: new Date().toISOString(), directory, memoryRoot: manifest.memoryRoot };
    if (!matchesCandidate(receipt, await readJSON(path.join(root, 'app/package.json')),
      await readJSON(path.join(app, 'Contents/Resources/runtime/package.json')), appVersion(app))) throw new Error('Installed candidate components disagree.');
    const journalPath = path.join(directory, 'transaction.json');
    await json(journalPath, { ...await readJSON(journalPath), phase: 'success' });
    await json(path.join(store, 'current.json'), receipt);
    console.log(`Installed local candidate ${candidate.commit}. Previous software retained in ${directory}.`);
    await reopen(app);
    await status(root, app);
  } catch (error) {
    if (directory) {
      const journal = await readJSON(path.join(directory, 'transaction.json')).catch(() => null);
      if (journal && !['success', 'rolled-back'].includes(journal.phase)) {
        try { run('python3', ['-B', path.join(directory, 'update-transaction.py'), 'rollback', directory]); }
        catch { retainLock = true; console.error('Recovery needs inspection. Installer lock and backups retained: ' + directory); }
      }
      console.error('Candidate/build evidence: ' + directory);
    }
    throw error;
  } finally {
    if (!retainLock) await rm(lock, { recursive: true });
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
