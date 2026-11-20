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
  // A remote-only release is the compiled package alone: no dependency or engine installation, so no npm.
  const needsNpm = options.remoteOnly ? source !== 'release' && !options.skipBuild : !options.skipBuild || !options.skipQmdInstall;
  if (needsNpm && probe('npm', ['--version']).status !== 0) blockers.push('npm is required.');
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
      // Measured: the compiled package is under 10 MB; allow a staged copy, one rollback copy and headroom.
      const [bytes, label] = options.withApp ? [3 * 1024 ** 3, '3 GB'] : options.remoteOnly && (source === 'release' || options.skipBuild) ? [256 * 1024 ** 2, '256 MB'] : [1024 ** 3, '1 GB'];
      if (disk.bavail * disk.bsize < bytes) blockers.push(`Insufficient free space at ${parent}; ${label} is required.`);
    } catch { blockers.push(`The destination is not writable: ${target}`); }
  }
  if (blockers.length) { const error = new Error('Installation needs:\n' + [...new Set(blockers)].map(x => '- ' + x).join('\n')); error.blockers = [...new Set(blockers)]; throw error; }
}
// Exact filesystem effects of the CLI installer: a plan before any write, then the
// observed outcome. Only path existence is inspected; nothing is created here.
export function filesystemReport({ dryRun, home, installRoot, appDir, cliPath, cliConfigPath, manifestPath, memoryRoot, remoteOnly, existing, reuseApp,
  policy, engine, integrations, agentDirs, skipInitialIndex, withApp, dependencies, source, bootstrapDir, rootExisted, node = process.execPath }) {
  const changes = [], retained = [], untouched = [], temporary = [], network = [];
  const change = (role, file, action, note) => changes.push({ role, path: file, action, ...(note ? { note } : {}) });
  const skip = (file, reason) => untouched.push({ path: file, reason });
  // The installer lock creates the root before this report; the caller observed it earlier.
  const had = { root: rootExisted ?? existsSync(installRoot), app: existsSync(appDir) };
  change('install-root', installRoot, had.root ? 'reuse' : 'create');
  if (reuseApp) skip(appDir, 'installed runtime reused for the Mac app');
  else {
    change('runtime', appDir, had.app ? 'replace' : 'create', dependencies === 'omitted' ? 'compiled package only: no dependency installation and no node_modules' : undefined);
    if (had.app) change('rollback-runtime', `${appDir}.previous-*`, 'create', 'previous runtime kept for rollback; the retention ledger retires older copies when it can (see storage in this result)');
    temporary.push({ path: `${appDir}.installing-*`, note: 'staging directory; renamed into place or removed' });
  }
  change('launcher', cliPath, existsSync(cliPath) ? 'replace' : 'create');
  change('manifest', manifestPath, existsSync(manifestPath) ? 'update' : 'create');
  if (policy.remove) change('cli-policy', cliConfigPath, 'remove');
  else if (policy.write) change('cli-policy', cliConfigPath, existsSync(cliConfigPath) ? 'update' : 'create', policy.description);
  else skip(cliConfigPath, existsSync(cliConfigPath) ? 'preserved' : 'not created: no policy option was given');
  const engines = path.join(installRoot, 'engines');
  if (remoteOnly) {
    skip(memoryRoot, 'remote-only: no local brain is created');
    skip(engines, 'remote-only: no search engine is installed');
  } else {
    if (existing) skip(memoryRoot, 'notes preserved; verification may rebuild a missing derived index under .jumpybrain/');
    else change('memory', memoryRoot, existsSync(memoryRoot) ? 'initialize' : 'create', engine.bin && !skipInitialIndex ? 'derived lexical index under .jumpybrain/' : 'no initial index');
    if (engine.source === 'private-new') change('search-engine', path.resolve(engine.bin, '../../..'), 'create', 'pinned private QMD CLI and SDK');
    else skip(engine.bin || engines, engine.bin ? `existing search engine reused (${engine.source})` : 'search engine installation skipped');
  }
  for (const item of integrations) change(`integration:${item.kind}`, item.path, existing ? 'refresh-if-unmodified' : 'create');
  for (const directory of agentDirs) {
    if (!changes.some(item => item.path.startsWith(directory + path.sep))) skip(directory, 'agent configuration: no integration is installed here');
  }
  skip(path.join(home, '.config/jumpybrain/.env'), 'remote access keys are never read or written by installation');
  change('retention-ledger', path.join(installRoot, 'software-retention.json'), existsSync(path.join(installRoot, 'software-retention.json')) ? 'update' : 'create',
    'rollback bookkeeping with its .software-retention.lock; needs python3 and is skipped without it; kept by uninstall');
  if (withApp) change('mac-app', path.join(home, 'Applications/jumpyBrain.app'), existsSync(path.join(home, 'Applications/jumpyBrain.app')) ? 'verify-or-replace' : 'create',
    'the app keeps its own profile and support state under ~/Library/Application Support; see the Mac app guide');
  temporary.push({ path: path.join(installRoot, '.installer-lock'), note: 'held while installing; removed at the end' });
  if (bootstrapDir) temporary.push({ path: bootstrapDir, note: 'installer helpers downloaded by install.sh; removed when it exits' });
  const runtimes = path.join(installRoot, 'runtimes') + path.sep, privateNode = node.startsWith(runtimes);
  if (privateNode) retained.push({ role: 'node-runtime', path: path.resolve(node, '../..'), note: 'private Node downloaded by the bootstrap; pinned by the launcher and kept by uninstall' });
  if (!reuseApp) retained.push({ role: 'package', path: appDir, note: remoteOnly
    ? 'one full package: the CLI plus docs, skills, installer/update helpers and Mac app and integration sources that a remote-only CLI never builds or runs'
    : 'one full package, including installer/update helpers and Mac app sources' });
  if (bootstrapDir) network.push({ host: 'api.github.com', purpose: 'resolve the installer revision' }, { host: 'raw.githubusercontent.com', purpose: 'installer helpers' });
  if (privateNode) network.push({ host: 'nodejs.org', purpose: 'private Node runtime and its checksum, on first install' });
  if (!reuseApp && source === 'release') network.push({ host: 'api.github.com', purpose: 'select the published release' }, { host: 'github.com', purpose: 'release archive, SHA-256 verified (served from GitHub\'s asset host)' });
  else if (!reuseApp && /^[a-z+]+:\/\//i.test(source) && !source.startsWith('file:')) network.push({ host: source, purpose: 'git clone of the selected source' });
  if (dependencies === 'installed') network.push({ host: 'registry.npmjs.org', purpose: 'runtime dependencies (npm ci)' });
  if (engine.source === 'private-new') network.push({ host: 'registry.npmjs.org', purpose: 'private search engine' });
  return { mode: dryRun ? 'plan' : 'pending', node: { path: node, version: process.version, private: privateNode }, runtimeDependencies: dependencies,
    changes, retained, untouched, temporary, network,
    notes: ['No shell profile, PATH, system Node or global npm package is modified.', ...(dryRun ? ['A dry run writes nothing; this plan lists what a real run would do.'] : [])] };
}
/** Replace the plan's expectations with what is on disk after a real run. */
export function observeFilesystem(report, mode, { rollback } = {}) {
  if (!report || report.mode === 'plan') return report;
  report.mode = mode;
  report.changes = report.changes.filter(item => item.role !== 'rollback-runtime' || rollback).map(item => {
    const file = item.role === 'rollback-runtime' ? rollback : item.path;
    return { ...item, path: file, present: existsSync(file) };
  });
  return report;
}
export function formatFilesystem(report) {
  const lines = [report.mode === 'plan' ? 'Filesystem plan (dry run: nothing was written):' : report.mode === 'applied' ? 'Filesystem changes:' : 'Filesystem changes (interrupted; present shows what exists):'];
  for (const item of report.changes) lines.push(`  ${item.action.padEnd(22)} ${item.role.padEnd(18)} ${item.path}${item.present === false && item.action !== 'remove' ? '  [absent]' : ''}${item.note ? `  (${item.note})` : ''}`);
  lines.push('Not touched:', ...report.untouched.map(item => `  ${item.path}  (${item.reason})`));
  lines.push('Kept on disk:', ...report.retained.map(item => `  ${item.path}  (${item.note})`));
  lines.push('Temporary:', ...report.temporary.map(item => `  ${item.path}  (${item.note})`));
  lines.push(`Node: ${report.node.path} ${report.node.version} (${report.node.private ? 'private runtime' : 'existing Node, reused and pinned by the launcher; never modified'})`);
  lines.push(`Network: ${report.network.length ? report.network.map(item => `${item.host} (${item.purpose})`).join('; ') : 'none'}`);
  return [...lines, ...report.notes].join('\n');
}
export async function atomicJSON(file, value) {
  const temporary = `${file}.tmp-${process.pid}`;
  await writeFile(temporary, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  await rename(temporary, file);
}
export async function selectEngine(options) { return (await selectEngineWithSource(options)).bin; }
// Precedence: explicit override, compatible recorded engine, this installation's
// owned matching private engine, then PATH; otherwise provision the private engine.
// An incompatible explicit or recorded choice fails visibly instead of being skipped.
export async function selectEngineWithSource({ installRoot, appDir, skipInstall, dryRun, remoteOnly, previous }) {
  if (remoteOnly) return { bin: null, source: 'remote-only' };
  const explicit = process.env.JUMPYBRAIN_QMD_BIN?.trim();
  // The app directory is replaceable. A legacy package-local engine must not
  // become the recorded engine for its replacement.
  const insideApp = value => value && path.isAbsolute(value) && (value === appDir || value.startsWith(appDir + path.sep));
  if (insideApp(explicit)) throw new Error('JUMPYBRAIN_QMD_BIN must be outside the replaceable application directory.');
  const recipe = fileURLToPath(new URL('./engine/', import.meta.url));
  const lock = await readFile(path.join(recipe, 'package-lock.json'));
  const id = createHash('sha256').update(lock).digest('hex').slice(0, 12);
  const base = path.join(installRoot, 'engines');
  const target = path.join(base, `qmd-${QMD_VERSION}-${process.platform}-${process.arch}-node${process.versions.modules}-${id}`);
  const bin = path.join(target, 'node_modules/.bin/qmd');
  const ownedEngines = async () => {
    try { return (await lstat(base)).isDirectory() && JSON.parse(await readFile(path.join(base, 'owner.json'), 'utf8'))?.installer === 'jumpybrain-installer'; }
    catch { return false; }
  };
  const candidates = explicit ? [[explicit, 'explicit']]
    : [[insideApp(previous) ? null : previous, 'recorded'], [existsSync(target) && await ownedEngines() ? bin : null, 'private'], ['qmd', 'path']].filter(([value]) => value);
  for (const [candidate, source] of candidates) {
    if (checkQmdInstallation(candidate)) {
      if (source === 'private') return { bin, source };
      const absolute = path.isAbsolute(candidate) ? candidate : (process.env.PATH || '').split(path.delimiter).map(p => path.join(p, candidate)).find(existsSync);
      const resolved = await realpath(absolute);
      if (insideApp(resolved)) {
        if (explicit) throw new Error('JUMPYBRAIN_QMD_BIN resolves inside the replaceable application directory.');
        continue;
      }
      return { bin: resolved, source };
    }
    if (source === 'explicit' || source === 'recorded') {
      if (skipInstall) return { bin: null, source: 'skipped' };
      throw new Error(`Selected QMD is incompatible (${source === 'explicit' ? 'JUMPYBRAIN_QMD_BIN' : 'recorded engine'}: ${candidate}); correct JUMPYBRAIN_QMD_BIN or repair the recorded engine. CLI and SDK @tobilu/qmd@${QMD_VERSION} are required together.`);
    }
  }
  if (skipInstall) return { bin: null, source: 'skipped' };
  if (existsSync(target)) {
    if (checkQmdInstallation(bin)) return { bin, source: 'private' };
    throw new Error(`Recorded engine directory is incomplete: ${target}. Preserve it outside the install root before retrying.`);
  }
  if (dryRun) return { bin, source: 'private-new' };
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
    return { bin, source: 'private-new' };
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
