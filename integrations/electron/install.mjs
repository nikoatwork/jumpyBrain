import { packager } from '@electron/packager';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { lstat, mkdir, mkdtemp, readFile, rename, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

if (process.platform !== 'darwin') throw new Error('The desktop installer currently supports macOS only.');
const source = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--output' || !args[1])) throw new Error('Usage: node install.mjs [--output <directory>]');
const outputDirectory = args.length ? path.resolve(args[1]) : path.join(os.homedir(), 'Applications');
const target = path.join(outputDirectory, 'jumpyBrain Desktop.app');
try { await lstat(target); throw new Error(`An app already exists at ${target}. Quit it and move it aside before installing the new build. Your brains and settings are stored separately.`); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const metadata = JSON.parse(await readFile(path.join(source, 'package.json'), 'utf8'));
const output = await mkdtemp(path.join(os.tmpdir(), 'jumpybrain-desktop-package-'));
let staged;
try {
  const [bundle] = await packager({
    dir: source, name: 'jumpyBrain Desktop', appBundleId: 'local.jumpybrain.desktop',
    appVersion: metadata.version, platform: 'darwin', arch: process.arch, out: output,
    icon: path.join(source, 'assets/app-icon.icns'), appCategoryType: 'public.app-category.productivity',
    asar: true, prune: true,
    ignore: [/^\/install\.mjs$/, /^\/smoke.*\.mjs$/, /^\/package-lock\.json$/, /^\/README\.md$/, /^\/.*docs\.md$/],
    extendInfo: { CFBundleDisplayName: 'jumpyBrain', NSHumanReadableCopyright: 'jumpyBrain · Markdown stays yours.', LSMinimumSystemVersion: '13.0' },
  });
  await mkdir(outputDirectory, { recursive: true });
  staged = await mkdtemp(path.join(outputDirectory, '.jumpybrain-install-'));
  const stagedApp = path.join(staged, 'jumpyBrain Desktop.app');
  execFileSync('/usr/bin/ditto', [path.join(bundle, 'jumpyBrain Desktop.app'), stagedApp], { stdio: 'pipe' });
  execFileSync('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', stagedApp], { stdio: 'pipe' });
  execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', stagedApp], { stdio: 'pipe' });
  // Recheck after the long packaging step; never replace an existing app silently.
  try { await lstat(target); throw new Error('An app appeared at the destination during packaging. Move it aside and retry.'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  await rename(stagedApp, target);
  if (!args.length) execFileSync('/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister', ['-f', target], { stdio: 'pipe' });
  console.log(`${args.length ? 'Packaged' : 'Installed'}: ${target}\nOpen from Finder, Spotlight, or the Dock.\nLocal ad-hoc signature verified; distribution to other Macs requires their own build or signing/notarization.`);
} finally { if (staged) await rm(staged, { recursive: true, force: true }); await rm(output, { recursive: true, force: true }); }
