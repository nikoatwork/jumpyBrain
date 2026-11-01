// Installer infrastructure: bounded diagnostics, private dependencies and release extraction.
import { spawnSync } from 'node:child_process';
import { constants, existsSync } from 'node:fs';
import { access, copyFile, mkdir, mkdtemp, readFile, realpath, rename, rm, lstat, statfs, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { checkQmdInstallation, QMD_VERSION } from './qmd-install-check.mjs';
import { desktopPrerequisites } from './desktop-prerequisites.mjs';
import { discoverRelease, boundedFetch, verifyArtifact } from '../integrations/electron/update-release.mjs';

export { cliShim } from '../integrations/electron/install-shim.mjs';
export function run(command, args, { cwd, env = process.env, capture = false, timeout = 600000 } = {}) {
  const result = spawnSync(command, args, { cwd, env, timeout, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024,
    stdio: capture ? 'pipe' : ['ignore', 2, 2] });
  if (result.error || result.status !== 0) throw new Error(`${path.basename(command)} failed (${result.error?.code || result.status}): ${capture ? (result.stderr || '').slice(-2000) : 'see progress output; correct the failure and rerun the same command.'}`);
  return result.stdout;
}
export async function preflight({ options, installRoot, memoryRoot, source, home }) {
  const blockers = [];
  const probe = (cmd, args) => spawnSync(cmd, args, { encoding: 'utf8', timeout: 10000 });
  if (!['darwin', 'linux'].includes(process.platform)) blockers.push('macOS or Linux is required.');
  if (Number(process.versions.node.split('.')[0]) < 22) blockers.push('Node 22 or newer is required.');
  if (!options.skipBuild || !options.skipQmdInstall) {
    if (probe('npm', ['--version']).status !== 0) blockers.push('npm is required.');
  }
  if (source !== 'release' && !existsSync(source) && !source.startsWith('file:') && probe('git', ['--version']).status !== 0) blockers.push('Git is required for this source installation.');
  if (options.withApp) {
    blockers.push(...desktopPrerequisites());
    if (options.remoteOnly || options.skipQmdInstall || options.skipInitialIndex) blockers.push('--with-app requires a verified local engine and index.');
    if (installRoot !== path.join(home, '.jumpybrain')) blockers.push('--with-app currently requires the default managed install root; CLI custom roots remain supported.');
  }
  for (const target of [installRoot, ...(!options.remoteOnly ? [memoryRoot] : [])]) {
    let parent = target;
    while (!existsSync(parent) && path.dirname(parent) !== parent) parent = path.dirname(parent);
    try {
      await access(parent, constants.W_OK | constants.X_OK);
      const disk = await statfs(parent);
      if (disk.bavail * disk.bsize < (options.withApp ? 3 : 1) * 1024 ** 3) blockers.push(`Insufficient free space at ${parent}; ${options.withApp ? 3 : 1} GB is required.`);
    } catch { blockers.push(`The destination is not writable: ${target}`); }
  }
  if (blockers.length) { const error = new Error('Installation needs:\n' + [...new Set(blockers)].map(x => '- ' + x).join('\n')); error.blockers = [...new Set(blockers)]; throw error; }
}
export async function atomicJSON(file, value) {
  const temporary = `${file}.tmp-${process.pid}`;
  await writeFile(temporary, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  await rename(temporary, file);
}
export async function selectEngine({ installRoot, appDir, skipInstall, dryRun, remoteOnly, previous }) {
  if (remoteOnly) return null;
  const explicit = process.env.JUMPYBRAIN_QMD_BIN?.trim();
  // The app directory is replaceable. A legacy package-local engine must not
  // become the recorded engine for its replacement.
  const insideApp = value => value && path.isAbsolute(value) && (value === appDir || value.startsWith(appDir + path.sep));
  if (insideApp(explicit)) throw new Error('JUMPYBRAIN_QMD_BIN must be outside the replaceable application directory.');
  const candidates = explicit ? [explicit] : [insideApp(previous) ? null : previous, 'qmd'].filter(Boolean);
  for (const bin of candidates) {
    if (checkQmdInstallation(bin)) {
      const absolute = path.isAbsolute(bin) ? bin : (process.env.PATH || '').split(path.delimiter).map(p => path.join(p, bin)).find(existsSync);
      const resolved = await realpath(absolute);
      if (insideApp(resolved)) {
        if (explicit) throw new Error('JUMPYBRAIN_QMD_BIN resolves inside the replaceable application directory.');
        continue;
      }
      return resolved;
    }
    if (explicit || bin === previous) {
      if (skipInstall) return null;
      throw new Error('Selected QMD is incompatible; correct JUMPYBRAIN_QMD_BIN or repair the recorded engine. CLI and SDK @tobilu/qmd@2.8.3 are required together.');
    }
  }
  if (skipInstall) return null;
  const recipe = fileURLToPath(new URL('./engine/', import.meta.url));
  const lock = await readFile(path.join(recipe, 'package-lock.json'));
  const id = createHash('sha256').update(lock).digest('hex').slice(0, 12);
  const base = path.join(installRoot, 'engines');
  const target = path.join(base, `qmd-${QMD_VERSION}-${process.platform}-${process.arch}-node${process.versions.modules}-${id}`);
  const bin = path.join(target, 'node_modules/.bin/qmd');
  if (existsSync(target)) {
    if (checkQmdInstallation(bin)) return bin;
    throw new Error(`Recorded engine directory is incomplete: ${target}. Preserve it outside the install root before retrying.`);
  }
  if (dryRun) return bin;
  if (existsSync(base)) {
    if (!(await lstat(base)).isDirectory()) throw new Error('Private engine root must be an ordinary directory.');
    const marker = JSON.parse(await readFile(path.join(base, 'owner.json'), 'utf8').catch(() => 'null'));
    if (marker?.installer !== 'jumpybrain-installer') throw new Error('Refusing an unowned engine directory.');
  } else {
    await mkdir(base, { recursive: true });
    await atomicJSON(path.join(base, 'owner.json'), { installer: 'jumpybrain-installer', schemaVersion: 1 });
  }
  const stage = await mkdtemp(path.join(base, '.installing-'));
  try {
    for (const name of ['package.json', 'package-lock.json']) await copyFile(path.join(recipe, name), path.join(stage, name));
    run('npm', ['ci', '--no-audit', '--no-fund'], { cwd: stage, env: { ...process.env, NODE_LLAMA_CPP_SKIP_DOWNLOAD: 'true' } });
    if (!checkQmdInstallation(path.join(stage, 'node_modules/.bin/qmd'))) throw new Error('The private QMD installation failed CLI/SDK validation.');
    await rename(stage, target);
    return bin;
  } finally { await rm(stage, { recursive: true, force: true }); }
}

// Parse the verified npm tarball without adding Python or a global tar dependency.
// Reject links/devices, traversal, duplicates and expansion bombs before writing.
export async function extractRelease(bytes, destination) {
  const tar = gunzipSync(bytes, { maxOutputLength: 512 * 1024 * 1024 });
  const entries = [], seen = new Set(); let pax = {};
  for (let offset = 0; offset + 512 <= tar.length;) {
    const header = tar.subarray(offset, offset + 512); offset += 512;
    if (header.every(b => b === 0)) break;
    const string = (a, b) => header.subarray(a, b).toString('utf8').split('\0')[0];
    const octal = (a, b) => { const value = string(a, b).trim(); if (!/^[0-7]+$/.test(value)) throw new Error('Invalid release tar number.'); return parseInt(value, 8); };
    const checksum = header.reduce((sum, byte, index) => sum + (index >= 148 && index < 156 ? 32 : byte), 0);
    if (checksum !== octal(148, 156)) throw new Error('Invalid release tar checksum.');
    const size = octal(124, 136), type = string(156, 157), mode = octal(100, 108);
    if (offset + size > tar.length) throw new Error('Truncated release archive.');
    const body = tar.subarray(offset, offset + size); offset += Math.ceil(size / 512) * 512;
    if (type === 'x') {
      pax = {}; let p = 0;
      while (p < body.length) {
        const space = body.indexOf(32, p), count = Number(body.subarray(p, space).toString());
        if (space < p || !Number.isSafeInteger(count) || count <= space - p + 1 || p + count > body.length) throw new Error('Invalid release metadata.');
        const item = body.subarray(space + 1, p + count - 1).toString(), equals = item.indexOf('=');
        pax[item.slice(0, equals)] = item.slice(equals + 1); p += count;
      }
      continue;
    }
    const prefix = string(345, 500);
    const name = pax.path || (prefix ? prefix + '/' : '') + string(0, 100); pax = {};
    const parts = name.replace(/\/$/, '').split('/');
    if (parts.shift() !== 'package' || parts.some(p => !p || p === '.' || p === '..') || name.includes('\\') || name.includes('\0') || !['', '0', '5'].includes(type)) throw new Error('Unsafe release archive entry.');
    if (!parts.length && type === '5') continue;
    const relative = parts.join('/');
    if (!relative || seen.has(relative) || entries.length >= 20000) throw new Error('Duplicate or excessive release entries.');
    seen.add(relative); entries.push({ relative, body, directory: type === '5', mode });
  }
  if (!seen.has('dist/cli.js') || !seen.has('package.json')) throw new Error('Release lacks the compiled CLI.');
  for (const e of entries) {
    const file = path.join(destination, e.relative);
    await mkdir(e.directory ? file : path.dirname(file), { recursive: true });
    if (!e.directory) await writeFile(file, e.body, { flag: 'wx', mode: e.mode & 0o111 ? 0o755 : 0o644 });
  }
}
export async function installRelease(destination, release) {
  const bytes = await boundedFetch(release.url, { limit: 128 * 1024 * 1024, timeout: 120000 });
  verifyArtifact(bytes, release);
  await extractRelease(bytes, destination);
  const pkg = JSON.parse(await readFile(path.join(destination, 'package.json'), 'utf8'));
  if (pkg.version !== release.version) throw new Error('Release version does not match its artifact.');
  await copyFile(path.join(destination, 'dist/runtime-package-lock.json'), path.join(destination, 'package-lock.json')).catch(() => { throw new Error('This release predates reproducible installer assets. Use an explicit trusted --source until a compatible release is published.'); });
}
export { discoverRelease };
