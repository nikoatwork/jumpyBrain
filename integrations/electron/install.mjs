import { packager } from '@electron/packager';
import { downloadArtifact, FetchDownloader } from '@electron/get';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { lstat, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

if (process.platform !== 'darwin') throw new Error('The desktop installer currently supports macOS only.');
const source = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--output' || !args[1])) throw new Error('Usage: node install.mjs [--output <directory>]');
const outputDirectory = args.length ? path.resolve(args[1]) : path.resolve(source, '../../.local-pack/desktop');
const metadata = JSON.parse(await readFile(path.join(source, 'package.json'), 'utf8'));
const output = await mkdtemp(path.join(os.tmpdir(), 'jumpybrain-desktop-package-'));
// Fixed, content-free records go to the worker's existing private bounded log.
function timing(stage, started, outcome = 'ok') {
  console.log('[build-timing] ' + JSON.stringify({ schema: 1, stage, durationMs: Math.round(performance.now() - started), outcome }));
}
async function measure(stage, operation) {
  const started = performance.now();
  let outcome = 'failed';
  try { const result = await operation(); outcome = 'ok'; return result; }
  finally { timing(stage, started, outcome); }
}
try {
  const downloader = new FetchDownloader();
  // Use the same verified downloader as packager, before unpacking, so network,
  // cache/checksum work and unpacking can be measured independently. Never pass
  // an unchecked archive or disable the downloader's checksum validation.
  const zip = await measure('electron-acquire-verify', () => downloadArtifact({
    version: metadata.devDependencies.electron, platform: 'darwin', arch: process.arch, artifactName: 'electron',
    downloader: { download: (url, target, options) => measure(url.endsWith('.zip') ? 'electron-network-archive' : 'electron-network-checksums', () => downloader.download(url, target, options)) },
  }));
  let phaseStarted = performance.now();
  const phase = stage => async () => { timing(stage, phaseStarted); phaseStarted = performance.now(); };
  const [bundle] = await measure('electron-package', () => packager({
    dir: source, name: 'jumpyBrain', appBundleId: 'local.jumpybrain.desktop',
    appVersion: metadata.version, platform: 'darwin', arch: process.arch, out: output,
    icon: path.join(source, 'assets/app-icon.icns'), appCategoryType: 'public.app-category.productivity',
    asar: true, prune: true,
    electronZipDir: path.dirname(zip),
    afterExtract: [phase('electron-unpack-and-setup')],
    afterCopy: [phase('electron-copy-source')],
    afterPrune: [phase('electron-prune')],
    afterAsar: [phase('electron-asar')],
    afterComplete: [phase('electron-finalize')],
    ignore: [/^\/install\.mjs$/, /^\/__pycache__(?:\/|$)/, /^\/(?:desktop-install|test_.*)\.py$/, /^\/smoke.*\.mjs$/, /^\/package-lock\.json$/, /^\/README\.md$/, /^\/.*docs\.md$/],
    extendInfo: { CFBundleDisplayName: 'jumpyBrain', NSHumanReadableCopyright: 'jumpyBrain · Markdown stays yours.', LSMinimumSystemVersion: '13.0' },
  }));
  const built = path.join(bundle, 'jumpyBrain.app');
  await measure('desktop-prepare', () => execFileSync('python3', ['-B', path.join(source, 'desktop-install.py'), 'prepare', '--bundle', built], { stdio: 'inherit' }));
  // Nested host keeps its own identifier and credential service; sign it before the outer app.
  await measure('desktop-sign', () => execFileSync('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', built], { stdio: 'pipe' }));
  await measure('desktop-verify', () => execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', built], { stdio: 'pipe' }));
  await mkdir(outputDirectory, { recursive: true });
  const target = path.join(outputDirectory, 'jumpyBrain.app');
  // Output is a replaceable build artifact, never the live Applications destination.
  if (outputDirectory === path.join(os.homedir(), 'Applications') || outputDirectory === '/Applications') throw new Error('Use desktop:setup to install into Applications. --output is for build artifacts.');
  if (outputDirectory !== path.resolve(source, '../../.local-pack/desktop')) {
    try { await lstat(target); throw new Error('A build already exists at the requested output. Choose an empty output directory.'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  } else await rm(target, { recursive: true, force: true });
  await measure('desktop-copy-final', () => execFileSync('/usr/bin/ditto', [built, target], { stdio: 'pipe' }));
  console.log(`Packaged: ${target}`);
  if (!args.length) {
    execFileSync('python3', ['-B', path.join(source, 'desktop-install.py'), 'install', '--bundle', target], { stdio: 'inherit' });
    execFileSync('/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister', ['-f', path.join(os.homedir(), 'Applications/jumpyBrain.app')], { stdio: 'pipe' });
    console.log('Open jumpyBrain from Finder, Spotlight, or the Dock. Closing its window keeps the brain live in the menu bar.');
  }
} finally { await rm(output, { recursive: true, force: true }); }
