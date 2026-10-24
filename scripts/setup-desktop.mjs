#!/usr/bin/env node
// Trusted-checkout setup/update of the complete Mac app. CLI installation remains independent.
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { access, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { desktopPrerequisites } from './desktop-prerequisites.mjs';

const repo = fileURLToPath(new URL('..', import.meta.url));
async function main(args = process.argv.slice(2)) {
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
function run(command, commandArgs, cwd = repo) {
  const result = spawnSync(command, commandArgs, { cwd, stdio: 'inherit' });
  if (result.error || result.status !== 0) throw new Error(`${path.basename(command)} failed. Resolve the error above, then rerun npm run desktop:setup.`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
