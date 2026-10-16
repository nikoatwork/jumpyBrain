#!/usr/bin/env node
// Private-checkout installation. Reuses managed installations without updating
// or restarting their runtime/helper. Fresh installs use the existing installer.
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { access, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { installedCompanion } from '../integrations/electron/host.mjs';

const repo = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('Usage: npm run desktop:setup\nBuilds jumpyBrain Desktop from this trusted checkout on macOS.\nRequires Node 22.12+, npm, Git, Python 3.9+, and Xcode command-line tools.\nFresh installs provision the managed CLI/QMD without agent integrations.\nExisting CLI/helper installations are reused; no automatic updates or restarts.\nChoose your local brain folder in the welcome screen after launching.');
} else {
  if (args.length) throw new Error('Unknown option. Run with --help for usage.');
  if (process.platform !== 'darwin') throw new Error('Desktop setup currently supports macOS 13+ only.');
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 12)) throw new Error('Install Node 22.12+ before running desktop setup.');
  for (const [command, commandArgs] of [['git', ['--version']], ['npm', ['--version']], ['python3', ['--version']], ['xcrun', ['--find', 'swiftc']]]) run(command, commandArgs);
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
  const helpers = [path.join(os.homedir(), 'Applications/jumpyBrain.app'), '/Applications/jumpyBrain.app'];
  let helperExists = false;
  for (const helper of helpers) {
    try { await access(helper); helperExists = true; break; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  if (!helperExists) {
    console.log('\n2/3 · Building the local menu-bar helper…');
    run('python3', [path.join(manifest.appDir, 'integrations/macos-companion/install.py'), '--no-start']);
  } else console.log('\n2/3 · Reusing your installed menu-bar helper.');
  await installedCompanion(); // Fail with repair guidance for a malformed/missing helper runtime.
  console.log('\n3/3 · Building the desktop app with its Finder and Dock icon…');
  run('npm', ['ci'], path.join(repo, 'integrations/electron'));
  run(process.execPath, ['install.mjs'], path.join(repo, 'integrations/electron'));
  console.log('\nReady. Open jumpyBrain Desktop from ~/Applications or Spotlight.\nChoose your local brain folder in the welcome screen.\nAgent integrations are optional; the app’s selection does not change CLI/agent targets.');
}
function run(command, commandArgs, cwd = repo) {
  const result = spawnSync(command, commandArgs, { cwd, stdio: 'inherit' });
  if (result.error || result.status !== 0) throw new Error(`${path.basename(command)} failed. Resolve the error above, then rerun npm run desktop:setup.`);
}
