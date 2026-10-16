import { packager } from '@electron/packager';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { access, mkdir, mkdtemp, rename, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

if (process.platform !== 'darwin') throw new Error('This prototype installer supports macOS only.');
const source = path.dirname(fileURLToPath(import.meta.url));
const target = path.join(os.homedir(), 'Applications/jumpyBrain Electron.app');
try { await access(target); throw new Error(`An app already exists at ${target}. Quit and move it aside before reinstalling this prototype.`); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const output = await mkdtemp(path.join(os.tmpdir(), 'jumpybrain-electron-package-'));
try {
  const [bundle] = await packager({
    dir: source, name: 'jumpyBrain Electron', appBundleId: 'local.jumpybrain.electron-prototype',
    appVersion: '0.1.0', platform: 'darwin', arch: process.arch, out: output,
    asar: true, prune: true,
    ignore: [/^\/install\.mjs$/, /^\/smoke-app\.mjs$/, /^\/package-lock\.json$/, /^\/README\.md$/, /^\/.*docs\.md$/],
    extendInfo: { NSHumanReadableCopyright: 'jumpyBrain · local Electron prototype' },
  });
  // Keep Finder/Dock identity readable. Electron supplies the local app icon;
  // runtime/frontend assets continue to come from the installed companion.
  await mkdir(path.dirname(target), { recursive: true });
  const staged = path.join(path.dirname(target), `.jumpyBrain Electron-installing-${process.pid}.app`);
  await execCopy(path.join(bundle, 'jumpyBrain Electron.app'), staged);
  try {
    execFileSync('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', staged], { stdio: 'pipe' });
    await rename(staged, target);
  } catch (error) { await rm(staged, { recursive: true, force: true }); throw error; }
  console.log(`Installed local prototype: ${target}\nOpen it with: open '${target}'`);
} finally { await rm(output, { recursive: true, force: true }); }

async function execCopy(from, to) {
  // ditto preserves the framework symlinks and executable permissions.
  execFileSync('/usr/bin/ditto', [from, to], { stdio: 'pipe' });
}
