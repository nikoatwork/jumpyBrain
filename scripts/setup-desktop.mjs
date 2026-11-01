#!/usr/bin/env node
// Trusted-checkout setup/update of the complete Mac app. CLI installation remains independent.
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { access, readFile, realpath } from 'node:fs/promises';
import { spawnSync, spawn } from 'node:child_process';
import { desktopPrerequisites } from './desktop-prerequisites.mjs';

const repo = fileURLToPath(new URL('..', import.meta.url));
async function main(args = process.argv.slice(2)) {
  if (args[0] === '--prepared') { await preparedSetup(args); return; }
  if (args.includes('--help')) {
    console.log('Usage: npm run desktop:setup [-- --check]\nBuilds and installs the complete jumpyBrain Mac app from this trusted checkout.\n--check checks all prerequisites without installing or changing settings.\nRequires macOS 13+, Node 22.12+, npm, Git, Python 3.9+, and Xcode command-line tools.\nFresh installs provision the managed CLI/QMD without agent integrations.\nExisting CLI settings are retained. Quit older jumpyBrain apps before setup; their bundles are backed up.\nChoose your local brain folder in the welcome screen after launching.');
  } else {
    if (args.length && !(args.length === 1 && args[0] === '--check')) throw new Error('Unknown option. Run with --help for usage.');
    const missing = desktopPrerequisites();
    if (missing.length) throw new Error('Desktop setup needs:\n' + missing.map(item => '- ' + item).join('\n') + '\nFix these requirements, then rerun npm run desktop:setup -- --check. No installation was started.');
    if (args[0] === '--check') { console.log('Desktop prerequisites are ready. No installation or settings changes made.'); return; }
    const installRoot = path.join(os.homedir(), '.jumpybrain');
    const manifestPath = path.join(installRoot, 'install-manifest.json');
    let manifest;
    try { manifest = JSON.parse(await readFile(manifestPath, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw new Error('Cannot read the managed CLI manifest. Repair the CLI installation before setting up Desktop.'); }
    if (!manifest) {
      console.log('\n1/3 · Installing the local memory runtime and search dependencies…');
      run(process.execPath, [path.join(repo, 'scripts/public-install.mjs'), '--source', repo, '--integrations', 'none', '--skip-initial-index']);
      manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    } else console.log('\n1/3 · Reusing your installed CLI and memory settings.');
    if (manifest.installRoot !== installRoot || manifest.appDir !== path.join(installRoot, 'app')) throw new Error('The managed CLI manifest has unexpected paths. Repair the installation before continuing.');
    await access(path.join(manifest.appDir, 'dist/cli.js'));
    console.log('\n2/3 · Building the shared memory engine and editor…');
    run('npm', ['ci']);
    run('npm', ['run', 'build']);
    console.log('\n3/3 · Packaging the app, internal native host, and memory runtime…');
    run('npm', ['ci'], path.join(repo, 'integrations/electron'));
    run(process.execPath, ['install.mjs'], path.join(repo, 'integrations/electron'));
    console.log('\nReady. Open jumpyBrain from ~/Applications or Spotlight. Closing its window leaves the brain live in the menu bar.\nChoose your local brain folder in the welcome screen.\nAgent integrations are optional; the app’s selection does not change CLI/agent targets.');
  }
}
async function preparedSetup(args) {
  if (![4, 5].includes(args.length) || args[2] !== '--home' || args.length === 5 && args[4] !== '--reuse') throw new Error('Invalid prepared Desktop setup arguments.');
  const source = path.resolve(args[1]), home = path.resolve(args[3]);
  const root = path.join(home, '.jumpybrain');
  const manifest = JSON.parse(await readFile(path.join(root, 'install-manifest.json'), 'utf8'));
  if (manifest.installer !== 'jumpybrain-installer' || manifest.appDir !== source || manifest.installRoot !== root) throw new Error('Prepared source does not match the owned CLI installation.');
  const version = JSON.parse(await readFile(path.join(source, 'package.json'), 'utf8')).version;
  if (JSON.parse(await readFile(path.join(source, 'integrations/electron/package.json'), 'utf8')).version !== version) throw new Error('Mac app and CLI versions must match.');
  const missing = desktopPrerequisites();
  if (missing.length) throw new Error('Desktop setup needs:\n' + missing.join('\n'));
  const electron = path.join(source, 'integrations/electron');
  process.env.JUMPYBRAIN_MANAGED_DESKTOP_SETUP = '1';
  if (args[4] === '--reuse') {
    const appPath = path.join(home, 'Applications/jumpyBrain.app');
    try {
      const installed = JSON.parse(await readFile(path.join(appPath, 'Contents/Resources/runtime/package.json'), 'utf8'));
      const nativeConfig = JSON.parse(await readFile(path.join(appPath, 'Contents/Resources/native/jumpyBrain Host.app/Contents/Resources/Configuration.json'), 'utf8'));
      if (installed.version === version && nativeConfig.node === manifest.node && nativeConfig.qmd === manifest.qmd) {
        const { bundledHost } = await import(pathToFileURL(path.join(electron, 'desktop-host.mjs')).href);
        const { probeCompanion, readControlKey } = await import(pathToFileURL(path.join(electron, 'host.mjs')).href);
        const config = await bundledHost(path.join(appPath, 'Contents/Resources'));
        const state = await probeCompanion(config.origin, await readControlKey(config.supportDirectory));
        const active = state.profiles.find(p => p.id === state.activeId);
        if (active?.kind === 'local' && await realpath(active.root) === await realpath(manifest.memoryRoot)) {
          console.log('Existing app and shared local brain verified.'); return;
        }
        throw new Error('The existing app uses another brain; select the CLI folder in Settings.');
      }
    } catch (error) { if (!['ENOENT', 'ECONNREFUSED'].includes(error.code)) throw error; }
  }
  run('npm' , ['ci', '--no-audit', '--no-fund'], electron);
  run(process.execPath, ['install.mjs'], electron);
  const appPath = path.join(home, 'Applications/jumpyBrain.app');
  const resources = path.join(appPath, 'Contents/Resources');
  if (JSON.parse(await readFile(path.join(resources, 'runtime/package.json'), 'utf8')).version !== version) throw new Error('Installed app version does not match the CLI.');
  const { bundledHost, startDesktopHost, desktopControl } = await import(pathToFileURL(path.join(electron, 'desktop-host.mjs')).href);
  const { setupComplete, finishSetup } = await import(pathToFileURL(path.join(electron, 'setup.mjs')).href);
  const config = await bundledHost(resources);
  const host = await startDesktopHost(config, { readinessOnly: true });
  try {
    const state = await desktopControl(host.connection, 'state');
    const active = state.profiles.find(profile => profile.id === state.activeId);
    if (active?.kind !== 'local' || await realpath(active.root) !== await realpath(manifest.memoryRoot)) throw new Error('The app has a different saved brain. Its profiles were preserved. Select the CLI memory folder in Settings, then rerun setup.');
    const userData = path.join(home, 'Library/Application Support/jumpyBrain Electron Prototype');
    if (!await setupComplete(userData)) await finishSetup(userData);
  } finally { await host.stop(); }
  // Launch the installed executable, then authenticate its local host. Do not
  // use LaunchServices, which can select another bundle with the same identity.
  const env = { ...process.env, HOME: home, CFFIXED_USER_HOME: home }; delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(path.join(appPath, 'Contents/MacOS/jumpyBrain'), [], { env, detached: true, stdio: ['ignore', 'ignore', 'pipe'] });
  let launchError = ''; child.stderr.on('data', chunk => { launchError = (launchError + chunk).slice(-2000); });
  let failed; child.on('error', error => { failed = error; });
  child.unref();
  const { probeCompanion, readControlKey } = await import(pathToFileURL(path.join(electron, 'host.mjs')).href);
  const key = await readControlKey(config.supportDirectory);
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (failed || child.exitCode !== null) throw new Error(`The installed Mac app could not launch (exit ${child.exitCode}). ${failed?.message || launchError || 'Reopen it and retry verification.'}`);
    try {
      const state = await probeCompanion(config.origin, key);
      const active = state.profiles.find(profile => profile.id === state.activeId);
      if (active?.kind !== 'local' || await realpath(active.root) !== await realpath(manifest.memoryRoot)) throw new Error('App root mismatch.');
      child.stderr.destroy(); console.log('Desktop launch and shared local brain verified.'); return;
    } catch { await new Promise(resolve => setTimeout(resolve, 200)); }
  }
  throw new Error('The installed app did not become ready. It remains installed; inspect its startup error and rerun.');
}
function run(command, commandArgs, cwd = repo) {
  const result = spawnSync(command, commandArgs, { cwd, stdio: 'inherit' });
  if (result.error || result.status !== 0) throw new Error(`${path.basename(command)} failed. Resolve the error above, then rerun npm run desktop:setup.`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
