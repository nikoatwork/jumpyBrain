// Shared, read-only compatibility boundary for installer-owned CLI installations.
// Used by the installer, Desktop setup and the standalone uninstaller, so it must
// import only Node built-ins. It never adopts arbitrary directories: every
// accepted shape carries the installer marker, schema 1 and the expected paths.
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const INSTALLER_NAME = 'jumpybrain-installer';
export const MANIFEST_VERSION = 1;
export const DEFAULT_REPO = 'https://github.com/nikoatwork/jumpyBrain.git';
export const BOOTSTRAP_URL = 'https://raw.githubusercontent.com/nikoatwork/jumpyBrain/master/install.sh';

// Demonstrated historical shapes, recovered from installer history (2026-07 →
// 2026-11). Older/unknown shapes stay refused instead of being guessed.
//   legacy-unconfigured: no cliConfigPath (July 2026 installers)
//   legacy-configured:   cliConfigPath, but no state/distribution/engine/hash records (≤ v0.3.15)
//   current:             state, distribution, recorded engine and integration hashes
export const OPTIONAL_LEGACY_FIELDS = ['cliConfigPath', 'state', 'distribution', 'release', 'node', 'qmd', 'remoteOnly', 'integrationHashes'];

export function managedPaths(installRoot) {
  return {
    installRoot, appDir: path.join(installRoot, 'app'), binDir: path.join(installRoot, 'bin'),
    cliPath: path.join(installRoot, 'bin', process.platform === 'win32' ? 'jumpybrain.cmd' : 'jumpybrain'),
    cliConfigPath: path.join(installRoot, 'cli-config.json'),
  };
}

/** Validates ownership fields and reports which optional historical fields are absent. Throws on unsupported shapes. */
export function classifyManifest(manifest, installRoot, { settings = true, refuse = message => `Cannot safely update the existing install: ${message} Refusing to overwrite it.` } = {}) {
  const fail = message => { throw new Error(refuse(message)); };
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest) || manifest.installer !== INSTALLER_NAME) fail(`the manifest is not a ${INSTALLER_NAME} manifest.`);
  if (manifest.version !== MANIFEST_VERSION) fail(`manifest version ${JSON.stringify(manifest.version)} is unsupported.`);
  const expected = managedPaths(installRoot);
  for (const key of ['installRoot', 'appDir', 'binDir', 'cliPath']) {
    if (typeof manifest[key] !== 'string' || manifest[key].length === 0) fail(`manifest ${key} must be a non-empty path.`);
    if (path.resolve(manifest[key]) !== expected[key]) fail(`manifest ${key} does not match ${expected[key]}.`);
  }
  if (manifest.cliConfigPath !== undefined && (typeof manifest.cliConfigPath !== 'string' || path.resolve(manifest.cliConfigPath) !== expected.cliConfigPath)) fail(`manifest cliConfigPath does not match ${expected.cliConfigPath}.`);
  if (settings && !['global', 'project'].includes(manifest.scope)) fail(`manifest scope ${JSON.stringify(manifest.scope)} is unsupported.`);
  if (settings && !['auto', 'all', 'none'].includes(manifest.integrationMode)) fail(`manifest integrationMode ${JSON.stringify(manifest.integrationMode)} is unsupported.`);
  if (manifest.memoryRoot !== undefined && (typeof manifest.memoryRoot !== 'string' || !path.isAbsolute(manifest.memoryRoot))) fail('manifest memoryRoot must be an absolute path.');
  for (const key of ['integrations', 'files']) if (manifest[key] !== undefined && !Array.isArray(manifest[key])) fail(`manifest ${key} must be an array.`);
  if (manifest.integrationHashes !== undefined && (!manifest.integrationHashes || typeof manifest.integrationHashes !== 'object' || Array.isArray(manifest.integrationHashes))) fail('manifest integrationHashes must be an object.');
  const omitted = OPTIONAL_LEGACY_FIELDS.filter(key => manifest[key] === undefined);
  const shape = manifest.cliConfigPath === undefined ? 'legacy-unconfigured' : omitted.some(key => ['state', 'distribution', 'integrationHashes'].includes(key)) ? 'legacy-configured' : 'current';
  return { shape, omitted, expected };
}

/** Source policy as recorded; a missing distribution predates release installs and is therefore source. */
export function sourcePolicy(manifest) {
  if (manifest.distribution === 'release') return { kind: 'release', source: 'release', ref: null };
  const source = manifest.source ?? DEFAULT_REPO, ref = manifest.ref ?? null;
  if (source !== DEFAULT_REPO) return { kind: 'custom', source, ref };
  if (ref === null || ['master', 'refs/heads/master'].includes(ref)) return { kind: 'default-branch', source, ref };
  return { kind: 'pinned', source, ref };
}

/** Static runtime capabilities. Reads files only; never executes the installed runtime. */
export function runtimeCapabilities(appDir, { desktop = false } = {}) {
  const read = file => { try { return JSON.parse(readFileSync(path.join(appDir, file), 'utf8')); } catch { return null; } };
  const pkg = read('package.json');
  const version = pkg?.name === 'jumpybrain' && typeof pkg.version === 'string' ? pkg.version : null;
  const missing = [];
  if (!version) missing.push('runtime package metadata');
  if (!existsSync(path.join(appDir, 'dist/cli.js'))) missing.push('compiled CLI');
  if (desktop) {
    const electron = read('integrations/electron/package.json');
    const files = ['install.mjs', 'desktop-install.py', 'setup.mjs', 'desktop-host.mjs', 'host.mjs'];
    if (!electron || electron.version !== version || files.some(file => !existsSync(path.join(appDir, 'integrations/electron', file)))) missing.push('matching Mac app packaging');
  }
  return { version, missing, compatible: missing.length === 0 };
}

export function migrationCommand({ withApp = false } = {}) {
  return `curl -fsSL ${BOOTSTRAP_URL} | bash -s -- --source release${withApp ? ' --with-app' : ''} --json`;
}

// Rerunning the installer keeps the recorded source/ref policy and re-pins the
// Node that runs it (a private Node when none on PATH works).
export function repairCommand({ withApp = false } = {}) {
  return `curl -fsSL ${BOOTSTRAP_URL} | bash${withApp ? ' -s -- --with-app' : ''}`;
}

export function incompatibleRuntimeError({ installedVersion, required, withApp, policy }) {
  const keep = policy && ['custom', 'pinned'].includes(policy.kind)
    ? ` To keep the recorded ${policy.kind} source instead, pass it explicitly: --source ${policy.source}${policy.ref ? ` --ref ${policy.ref}` : ''}.` : '';
  const error = new Error(`The installed CLI (${installedVersion || 'unknown version'}) lacks ${required.join(' and ')}, which ${withApp ? 'adding the Mac app' : 'this operation'} requires. Nothing was changed. Migrate the managed installation to a verified release: ${migrationCommand({ withApp })}${keep}`);
  error.compatibility = { installedVersion: installedVersion || null, required, eligible: false, nextCommand: migrationCommand({ withApp }) };
  return error;
}

const quote = value => `'${String(value).replaceAll("'", "'\\''")}'`;
/** Exact shim bytes written by historical installers for this layout. */
export function knownShims({ appDir, cliConfigPath }) {
  const cli = path.join(appDir, 'dist/cli.js');
  const config = ['#!/usr/bin/env sh', 'if [ -z "${JUMPYBRAIN_CLI_CONFIG+x}" ]; then', `  export JUMPYBRAIN_CLI_CONFIG=${quote(cliConfigPath)}`, 'fi'];
  return [
    `#!/usr/bin/env sh\nexec node ${JSON.stringify(cli)} "$@"\n`,
    [...config, `exec node ${JSON.stringify(cli)} "$@"`, ''].join('\n'),
    [...config, `exec node ${quote(cli)} "$@"`, ''].join('\n'),
  ];
}

/** Ownership and checkout checks required before converting an existing install's source policy. */
export function migrationBlockers({ paths, currentShims = [] }) {
  const blockers = [];
  const real = (target, directory) => {
    try { const stat = lstatSync(target); return !stat.isSymbolicLink() && (directory ? stat.isDirectory() : stat.isFile()); } catch { return false; }
  };
  if (!real(paths.appDir, true)) blockers.push('The installed runtime is missing or linked; repair it before migrating.');
  if (!real(paths.binDir, true) || !real(paths.cliPath, false)) blockers.push('The installed CLI shim is missing or linked; repair it before migrating.');
  else {
    const bytes = readFileSync(paths.cliPath, 'utf8');
    const candidates = [...knownShims({ appDir: paths.appDir, cliConfigPath: paths.cliConfigPath }), ...currentShims];
    if (!candidates.some(candidate => typeof candidate === 'string' ? candidate === bytes : candidate.test(bytes))) blockers.push(`${paths.cliPath} was customized; preserve it elsewhere before migrating.`);
  }
  if (real(paths.appDir, true) && existsSync(path.join(paths.appDir, '.git'))) {
    const status = spawnSync('git', ['-C', paths.appDir, 'status', '--porcelain', '--untracked-files=normal'], { encoding: 'utf8', timeout: 30000 });
    if (status.error || status.status !== 0) blockers.push('Cannot inspect the installed Git checkout for local changes; install Git or repair the checkout before migrating.');
    else if (status.stdout.trim()) blockers.push(`The installed runtime checkout has ${status.stdout.trim().split('\n').length} locally changed or untracked path(s); move them out of ${paths.appDir} before migrating.`);
  }
  return blockers;
}

/** Distinguish runtimes that cannot report modern readiness from real readiness failures. */
export function classifyVerification(command, { status, error, stdout }, { readOnly = false } = {}) {
  if (error) return { outcome: 'did_not_run', detail: error.code || error.message };
  // A crash and an unknown flag both exit without a result; only parsed output can show an older schema.
  if (!String(stdout || '').trim()) return status === 0 ? { outcome: 'incompatible_output', detail: 'no JSON output' } : { outcome: 'no_result', detail: `exit ${status} without a result` };
  let packet;
  try { packet = JSON.parse(stdout); } catch { return { outcome: 'incompatible_output', detail: 'output is not JSON' }; }
  if (!packet || typeof packet !== 'object') return { outcome: 'incompatible_output', detail: 'output is not a result object' };
  if (command === 'doctor') {
    if (typeof packet.ok !== 'boolean') return { outcome: 'incompatible_output', detail: 'doctor result lacks ok' };
    return packet.ok && status === 0 ? { outcome: 'ready', packet } : { outcome: 'not_ready', packet };
  }
  if (!packet.retrieval || typeof packet.retrieval.status !== 'string') return { outcome: 'incompatible_output', detail: 'recall result lacks retrieval status' };
  if (status !== 0) return { outcome: 'not_ready', packet };
  if (packet.retrieval.status === 'complete') return { outcome: 'ready', packet };
  const readOnlyReady = readOnly && packet.readiness?.freshness === 'fresh' && packet.retrieval.status === 'partial'
    && packet.retrieval.warnings?.length > 0 && packet.retrieval.warnings.every(warning => ['read_only_index', 'read_only_lexical_fallback'].includes(warning));
  return readOnlyReady ? { outcome: 'ready', packet, readOnlyLexical: true } : { outcome: 'not_ready', packet };
}
