#!/usr/bin/env node
// Explicit capture/verify; no package installation, model download, or personal brain access.
import { createHash } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { cp, mkdir, readFile, writeFile, readdir, lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const repository = fileURLToPath(new URL('..', import.meta.url));
const contractPath = 'test/fixtures/multiplayer-parity/contract.json';
const gatePaths = ['scripts/multiplayer-verify.mjs', 'scripts/multiplayer-verification/'];
const runtimePaths = ['src', 'integrations', 'scripts', 'package.json', 'package-lock.json', 'tsconfig.json', 'extensions.js', 'extensions.d.ts', 'install.sh', 'uninstall.sh'];
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const json = (value) => JSON.stringify(value, null, 2) + '\n';
const git = (root, args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).trim();
const isGatePath = (file) => gatePaths.some((entry) => entry.endsWith('/') ? file.startsWith(entry) : file === entry);
const relativeFile = (root, file) => path.relative(root, file).split(path.sep).join('/');

export async function filesBelow(root, roots) {
  const files = new Set();
  async function visit(file) {
    const stat = await lstat(file);
    if (stat.isSymbolicLink()) throw new Error('Symbolic link in frozen input: ' + relativeFile(root, file));
    if (stat.isDirectory()) {
      for (const name of (await readdir(file)).sort()) await visit(path.join(file, name));
    } else if (stat.isFile()) files.add(relativeFile(root, file));
    else throw new Error('Non-regular frozen input: ' + relativeFile(root, file));
  }
  for (const entry of roots) await visit(path.resolve(root, entry));
  return [...files].sort();
}

async function fingerprints(root, files) {
  const result = {};
  for (const file of files) result[file] = hash(await readFile(path.join(root, file)));
  return result;
}

export async function assertFingerprints(root, expected, label) {
  for (const [file, expectedHash] of Object.entries(expected)) {
    let actual;
    try {
      const stat = await lstat(path.join(root, file));
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('not a regular file');
      actual = hash(await readFile(path.join(root, file)));
    } catch {
      throw new Error(label + ' missing or unsafe: ' + file);
    }
    if (actual !== expectedHash) throw new Error(label + ' changed: ' + file);
  }
}

export async function assertTreeFingerprints(root, roots, expected, label) {
  const actual = await fingerprints(root, await filesBelow(root, roots));
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(label + ' file set or bytes changed.');
}

export async function installedDependencyIdentity(root) {
  const lockBytes = await readFile(path.join(root, 'package-lock.json'));
  const lock = JSON.parse(lockBytes);
  if (lock.lockfileVersion !== 3 || !lock.packages) throw new Error('Provision dependencies from a version-3 package lock.');
  const packages = {};
  for (const [location, expected] of Object.entries(lock.packages).sort(([a], [b]) => a.localeCompare(b))) {
    if (!location) continue;
    if (!location.startsWith('node_modules/') || location.split('/').includes('..') || expected.link) throw new Error('Unsupported locked dependency location: ' + location);
    const directory = path.join(root, location);
    let bytes;
    try { bytes = await readFile(path.join(directory, 'package.json')); }
    catch (error) {
      if (error.code === 'ENOENT' && expected.optional) continue;
      throw new Error('Missing locked dependency: ' + location + '; run npm ci.');
    }
    const actual = JSON.parse(bytes);
    if (actual.version !== expected.version) throw new Error('Installed dependency disagrees with lock: ' + location + '; run npm ci.');
    const roots = (await readdir(directory)).filter((name) => name !== 'node_modules').sort();
    const content = await fingerprints(directory, await filesBelow(directory, roots));
    packages[location] = { version: actual.version, contentHash: hash(json(content)) };
  }
  return { lockHash: hash(lockBytes), packages };
}

async function resolvedDestination(file) {
  let ancestor = path.resolve(file);
  const tail = [];
  for (;;) {
    try { return path.join(await realpath(ancestor), ...tail); }
    catch (error) {
      if (error.code !== 'ENOENT' || ancestor === path.dirname(ancestor)) throw error;
      tail.unshift(path.basename(ancestor));
      ancestor = path.dirname(ancestor);
    }
  }
}

async function runtimeSnapshot(root) {
  const tracked = git(root, ['ls-files', '-z', '--', ...runtimePaths]).split('\0').filter(Boolean).filter((file) => !isGatePath(file));
  const dirty = git(root, ['diff', '--name-only', 'HEAD', '--', ...runtimePaths]).split('\n').filter(Boolean).filter((file) => !isGatePath(file));
  const untracked = git(root, ['ls-files', '--others', '--exclude-standard', '-z', '--', ...runtimePaths]).split('\0').filter(Boolean).filter((file) => !isGatePath(file));
  return {
    gitSha: git(root, ['rev-parse', 'HEAD']), gitTree: git(root, ['rev-parse', 'HEAD^{tree}']),
    dirtyRuntime: [...new Set([...dirty, ...untracked])].sort(),
    files: await fingerprints(root, tracked),
  };
}

export function tapSummary(text) {
  const summary = {};
  for (const match of text.matchAll(/^# (tests|pass|fail|cancelled|skipped|todo) (\d+)\s*$/gm)) summary[match[1]] = Number(match[2]);
  if (!Number.isInteger(summary.tests) || summary.tests < 1 || !Number.isInteger(summary.pass)
    || !['fail', 'cancelled', 'skipped', 'todo'].every((key) => Number.isInteger(summary[key]))) {
    throw new Error('Missing complete TAP summary; exit zero alone is not a passed test suite.');
  }
  return summary;
}

export function assessCheck(check, execution, baselineCheck) {
  if (execution.error) return { status: 'blocked', reason: execution.error };
  if (execution.timedOut) return { status: 'failed', reason: 'Required command timed out.' };
  if (execution.overflow) return { status: 'failed', reason: 'Required command exceeded bounded log capture.' };
  if (execution.code !== 0) return { status: 'failed', reason: 'Required command exited ' + execution.code + '.' };
  let observation;
  if (check.tap) {
    try { observation = tapSummary(execution.output); }
    catch (error) { return { status: 'failed', reason: error.message }; }
    if (observation.fail || observation.cancelled) return { status: 'failed', reason: 'TAP contains failed or cancelled tests.', observation };
    if (observation.skipped || observation.todo) return { status: 'blocked', reason: 'Required suite contains skipped/TODO checks; coverage is unverified.', observation };
    if (observation.tests !== observation.pass) return { status: 'failed', reason: 'TAP test/pass totals disagree.', observation };
    if (baselineCheck?.observation && observation.tests < baselineCheck.observation.tests) {
      return { status: 'failed', reason: 'Candidate ran fewer tests than the frozen baseline.', observation };
    }
  }
  const missing = (check.markers ?? []).filter((marker) => !execution.output.includes(marker));
  if (missing.length) return { status: 'failed', reason: 'Required semantic completion markers missing.', missing };
  return { status: 'passed', ...(observation ? { observation } : {}) };
}

export async function executeCheck(root, check, { environment = process.env, maxBytes = 8 * 1024 * 1024 } = {}) {
  return new Promise((resolve) => {
    let child, timer, output = '', bytes = 0, timedOut = false, overflow = false, error;
    const stop = () => {
      if (!child?.pid) return;
      try { if (process.platform !== 'win32') process.kill(-child.pid, 'SIGKILL'); else child.kill('SIGKILL'); } catch {}
    };
    try {
      const [command, ...args] = check.command;
      child = spawn(command === 'node' ? process.execPath : command, args, { cwd: root, env: environment, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
      const collect = (chunk) => {
        bytes += chunk.length;
        if (bytes > maxBytes) { overflow = true; stop(); return; }
        output += chunk.toString('utf8');
      };
      child.stdout.on('data', collect); child.stderr.on('data', collect);
      timer = setTimeout(() => { timedOut = true; stop(); }, check.timeoutMs);
      child.on('error', (failure) => { error = failure.code ?? failure.message; });
      child.on('close', (code) => { clearTimeout(timer); resolve({ code, output, timedOut, overflow, ...(error ? { error } : {}) }); });
    } catch (failure) { clearTimeout(timer); stop(); resolve({ code: null, output, error: failure.message }); }
  });
}

async function probeEnvironment(root) {
  const installedDependencies = { root: await installedDependencyIdentity(root) };
  if (process.platform === 'darwin') installedDependencies.electron = await installedDependencyIdentity(path.join(root, 'integrations/electron'));
  const npm = execFileSync('npm', ['--version'], { cwd: root, encoding: 'utf8', timeout: 10000 }).trim();
  const qmd = process.env.JUMPYBRAIN_QMD_BIN;
  if (!qmd || !process.env.JUMPYBRAIN_TEST_QMD_BIN) throw new Error('Provision JUMPYBRAIN_QMD_BIN and JUMPYBRAIN_TEST_QMD_BIN; the gate never installs QMD.');
  const qmdPath = await realpath(qmd);
  const qmdVersion = execFileSync(qmdPath, ['--version'], { cwd: root, encoding: 'utf8', timeout: 10000, maxBuffer: 1024 * 1024 }).trim();
  const testQmd = await realpath(process.env.JUMPYBRAIN_TEST_QMD_BIN);
  if (testQmd !== qmdPath) throw new Error('QMD CLI and real-test executable must resolve to the same provisioned installation.');
  const findPackage = async (entry, name) => {
    let directory = path.dirname(entry);
    while (directory !== path.dirname(directory)) {
      try {
        const file = path.join(directory, 'package.json');
        if (JSON.parse(await readFile(file)).name === name) return file;
      } catch {}
      directory = path.dirname(directory);
    }
    throw new Error('Cannot identify provisioned package: ' + name);
  };
  const packageIdentity = async (file) => {
    const directory = path.dirname(await realpath(file));
    const pkg = JSON.parse(await readFile(path.join(directory, 'package.json')));
    const roots = (await readdir(directory)).filter((name) => name !== 'node_modules').sort();
    const content = await fingerprints(directory, await filesBelow(directory, roots));
    return { name: pkg.name, version: pkg.version, contentHash: hash(json(content)) };
  };
  const requireFromRoot = createRequire(path.join(root, 'package.json'));
  let playwrightPackage;
  try { playwrightPackage = requireFromRoot.resolve('playwright/package.json'); } catch {}
  if (!playwrightPackage) {
    for (const bin of String(process.env.PATH ?? '').split(path.delimiter)) {
      try {
        const candidate = path.resolve(bin, '..', 'playwright', 'package.json');
        if (JSON.parse(await readFile(candidate)).name === 'playwright') { playwrightPackage = candidate; break; }
      } catch {}
    }
  }
  if (!playwrightPackage) throw new Error('Cannot fingerprint provisioned Playwright package.');
  const qmdPackage = await findPackage(qmdPath, '@tobilu/qmd');
  const playwrightCore = createRequire(playwrightPackage).resolve('playwright-core/package.json');
  const toolPackages = {
    qmd: await packageIdentity(qmdPackage),
    playwright: await packageIdentity(playwrightPackage),
    playwrightCore: await packageIdentity(playwrightCore),
  };
  if (process.platform === 'darwin') {
    const electronCompiler = path.join(root, 'integrations/electron/node_modules/esbuild/package.json');
    try { toolPackages.electronEsbuild = await packageIdentity(electronCompiler); }
    catch { throw new Error('Provision locked integrations/electron dependencies (npm ci --prefix integrations/electron --ignore-scripts) before the Mac installation regression tests.'); }
  }
  const { loadPlaywrightChromium, launchPlaywrightChromium } = await import(pathToFileURL(path.join(root, 'scripts/playwright-runtime.mjs')).href);
  const chromium = await loadPlaywrightChromium();
  const browser = await launchPlaywrightChromium({ chromium });
  let browserVersion;
  try { browserVersion = browser.version(); } finally { await browser.close(); }
  const model = process.env.JUMPYBRAIN_SMOKE_MODEL;
  return {
    node: process.version, npm, platform: process.platform, arch: process.arch, osRelease: os.release(),
    qmd: { version: qmdVersion, executableHash: hash(await readFile(qmdPath)) },
    toolPackages,
    installedDependencies,
    browser: browserVersion, browserChannel: process.env.JUMPYBRAIN_PLAYWRIGHT_CHANNEL ?? 'chrome-fallback',
    semanticModelHash: model ? hash(await readFile(model)) : null,
    toolIdentityLimit: 'Root/Electron dependency versions are checked against locks and installed package bytes recorded; this is not a registry tarball authenticity check. QMD CLI/SDK and Playwright/core hashes exclude nested node_modules; external transitive native dependency bytes and browser executable bytes are not fully fingerprinted.',
  };
}

export async function readBaseline(directory, expectedHash) {
  if (!/^[a-f0-9]{64}$/.test(expectedHash ?? '')) throw new Error('An externally pinned --baseline-sha256 digest is required.');
  const bytes = await readFile(path.join(directory, 'manifest.json'));
  if (hash(bytes) !== expectedHash) throw new Error('Baseline manifest digest does not match the pinned digest.');
  const manifest = JSON.parse(bytes);
  const validInventory = (value) => value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length > 0 && Object.entries(value).every(([file, digest]) =>
      !path.isAbsolute(file) && !file.split(/[\\/]/).includes('..') && /^[a-f0-9]{64}$/.test(digest));
  if (manifest.version !== 1 || manifest.status !== 'passed' || !validInventory(manifest.integrity) || !validInventory(manifest.assertions)
    || !validInventory(manifest.harness) || !manifest.harness['scripts/multiplayer-verify.mjs']
    || !Array.isArray(manifest.checks)) throw new Error('Invalid or incomplete baseline manifest.');
  await assertFingerprints(directory, manifest.integrity, 'Baseline evidence');
  await assertTreeFingerprints(directory, ['runtime', 'assertions', 'logs', 'report.json'], manifest.integrity, 'Baseline evidence inventory');
  const assertionCopies = Object.fromEntries(Object.entries(manifest.assertions).map(([file, digest]) => ['assertions/' + file, digest]));
  await assertTreeFingerprints(directory, ['assertions'], assertionCopies, 'Baseline assertion inventory');
  return manifest;
}

function sameEnvironment(baseline, candidate) {
  // OS patch versions are recorded, not silently conflated with controlled runtime dependencies.
  const controlled = (value) => ({ node: value.node, npm: value.npm, platform: value.platform, arch: value.arch, qmd: value.qmd, toolPackages: value.toolPackages, browser: value.browser, browserChannel: value.browserChannel, semanticModelHash: value.semanticModelHash });
  return JSON.stringify(controlled(baseline)) === JSON.stringify(controlled(candidate));
}

export async function runGate({ mode, root = repository, out, baseline, baselineSha256, contractFile = contractPath, probe = probeEnvironment, log = console.log }) {
  if (!['capture', 'verify'].includes(mode)) throw new Error('Mode must be capture or verify.');
  root = await realpath(root);
  const output = await resolvedDestination(out);
  if (baseline) baseline = await realpath(baseline);
  if (baseline && (output === baseline || output.startsWith(baseline + path.sep))) throw new Error('Verification output must not modify the baseline.');
  if (['dist', 'src', 'integrations', 'scripts', 'test', '.git'].includes(path.relative(root, output).split(path.sep)[0])) throw new Error('Evidence must be outside mutable dist and source/assertion directories.');
  await mkdir(path.dirname(output), { recursive: true });
  await mkdir(output); // Exclusive: never replace existing evidence.
  const report = { version: 1, mode, status: 'blocked', startedAt: new Date().toISOString(), checks: [], limits: [] };
  const finish = async () => { report.finishedAt = new Date().toISOString(); await writeFile(path.join(output, 'report.json'), json(report)); };
  try {
    const contractBytes = await readFile(path.join(root, contractFile));
    const contract = JSON.parse(contractBytes);
    if (contract.version !== 1 || !contract.checks?.length || !Array.isArray(contract.assertionRoots)
      || new Set(contract.checks.map((check) => check.id)).size !== contract.checks.length
      || contract.checks.some((check) => !Array.isArray(check.command) || !check.command.length || !Number.isInteger(check.timeoutMs) || check.timeoutMs < 1 || (!check.tap && !check.markers?.length))) {
      throw new Error('Invalid verification contract; required commands need semantic assertions.');
    }
    report.limits = contract.limits ?? [];
    report.checks = contract.checks.map((check) => ({ id: check.id, scenarioIds: check.scenarioIds ?? [], status: 'untested', reason: 'Not executed yet.' }));
    report.contractHash = hash(contractBytes);
    const frozen = mode === 'verify' ? await readBaseline(path.resolve(baseline), baselineSha256) : undefined;
    if (frozen && frozen.contractHash !== report.contractHash) throw new Error('Frozen scenario contract changed.');
    const assertionFiles = await filesBelow(root, contract.assertionRoots);
    const assertions = await fingerprints(root, assertionFiles);
    const harness = await fingerprints(root, await filesBelow(root, ['scripts/multiplayer-verify.mjs']));
    if (frozen) {
      await assertFingerprints(root, frozen.assertions, 'Frozen assertion');
      await assertFingerprints(root, frozen.harness, 'Frozen harness');
    }
    const pkg = JSON.parse(await readFile(path.join(root, 'package.json')));
    const testScript = pkg.scripts?.test;
    if (!testScript || (frozen && frozen.testScript !== testScript)) throw new Error('The frozen npm test script changed or is missing.');
    const source = await runtimeSnapshot(root);
    report.source = source;
    if (source.dirtyRuntime.length) throw new Error('Tracked or untracked runtime edits must be committed before capture/verify: ' + source.dirtyRuntime.join(', '));
    const environment = await probe(root);
    report.environment = environment;
    if (frozen && !sameEnvironment(frozen.environment, environment)) throw new Error('Controlled environment differs from baseline; reproduce its runtime/tool/model versions.');
    if (frozen && (frozen.checks.length !== contract.checks.length || contract.checks.some((check, index) => frozen.checks[index]?.id !== check.id || frozen.checks[index]?.status !== 'passed'))) throw new Error('Baseline required-check evidence is incomplete.');
    await mkdir(path.join(output, 'logs'));
    let artifact;
    for (const [index, check] of contract.checks.entries()) {
      if (check.requires && report.checks.find((result) => result.id === check.requires)?.status !== 'passed') {
        report.checks[index] = { id: check.id, scenarioIds: check.scenarioIds ?? [], status: 'blocked', reason: 'Required predecessor did not pass: ' + check.requires };
        continue;
      }
      log('Running ' + check.id + '...');
      const started = Date.now();
      const execution = await executeCheck(root, check);
      await writeFile(path.join(output, 'logs', check.id + '.log'), execution.output);
      const assessed = assessCheck(check, execution, frozen?.checks.find((result) => result.id === check.id));
      report.checks[index] = { id: check.id, scenarioIds: check.scenarioIds ?? [], ...assessed, durationMs: Date.now() - started, command: check.command, log: 'logs/' + check.id + '.log' };
      log(check.id + ': ' + assessed.status);
      if (index === 0 && assessed.status === 'passed') {
        artifact = await fingerprints(root, await filesBelow(root, ['dist']));
        if (!Object.keys(artifact).length) throw new Error('The tested runtime artifact is empty.');
      }
      else if (artifact) await assertTreeFingerprints(root, ['dist'], artifact, 'Tested runtime artifact during run');
    }
    await assertTreeFingerprints(root, contract.assertionRoots, assertions, 'Assertion input during run');
    await assertFingerprints(root, harness, 'Harness input during run');
    const after = await runtimeSnapshot(root);
    if (JSON.stringify(source) !== JSON.stringify(after)) throw new Error('Runtime source changed during verification.');
    if (environment.installedDependencies) {
      const dependenciesAfter = { root: await installedDependencyIdentity(root) };
      if (environment.installedDependencies.electron) dependenciesAfter.electron = await installedDependencyIdentity(path.join(root, 'integrations/electron'));
      if (JSON.stringify(environment.installedDependencies) !== JSON.stringify(dependenciesAfter)) throw new Error('Installed dependencies changed during verification.');
    }
    report.status = report.checks.every((check) => check.status === 'passed') ? 'passed'
      : report.checks.some((check) => check.status === 'failed') ? 'failed' : 'blocked';
    await finish();
    if (report.status !== 'passed') return report;
    await cp(path.join(root, 'dist'), path.join(output, 'runtime'), { recursive: true, errorOnExist: true, force: false });
    await assertTreeFingerprints(root, ['dist'], artifact, 'Tested runtime artifact before freeze');
    const frozenArtifact = Object.fromEntries(Object.entries(artifact).map(([file, value]) => ['runtime/' + file.slice('dist/'.length), value]));
    await assertTreeFingerprints(output, ['runtime'], frozenArtifact, 'Copied runtime artifact');
    for (const file of Object.keys(assertions)) {
      const destination = path.join(output, 'assertions', file);
      await mkdir(path.dirname(destination), { recursive: true });
      await cp(path.join(root, file), destination, { errorOnExist: true, force: false });
    }
    const manifest = {
      version: 1, status: 'passed', source, environment, contractHash: report.contractHash,
      testScript, assertions, harness, checks: report.checks, limits: report.limits,
      baselineSha256: mode === 'verify' ? baselineSha256 : null,
      integrity: await fingerprints(output, await filesBelow(output, ['runtime', 'assertions', 'logs', 'report.json'])),
    };
    const manifestBytes = json(manifest);
    await writeFile(path.join(output, 'manifest.json'), manifestBytes, { flag: 'wx' });
    report.manifestSha256 = hash(manifestBytes);
    log('Manifest SHA-256: ' + report.manifestSha256);
    return report;
  } catch (error) {
    report.status = 'blocked'; report.error = error.message;
    await finish();
    return report;
  }
}

async function main() {
  const [mode, ...args] = process.argv.slice(2);
  const values = {};
  for (let index = 0; index < args.length; index += 2) {
    if (!['--out', '--baseline', '--baseline-sha256'].includes(args[index]) || !args[index + 1] || args[index + 1].startsWith('--') || values[args[index]]) {
      throw new Error('Usage: multiplayer-verify.mjs capture --out DIR | verify --baseline DIR --baseline-sha256 DIGEST --out DIR');
    }
    values[args[index]] = args[index + 1];
  }
  if (!values['--out'] || (mode === 'verify' && (!values['--baseline'] || !values['--baseline-sha256']))
    || (mode === 'capture' && (values['--baseline'] || values['--baseline-sha256']))) throw new Error('Missing or incompatible evidence arguments.');
  const result = await runGate({ mode, out: values['--out'], baseline: values['--baseline'], baselineSha256: values['--baseline-sha256'] });
  console.log(json({ status: result.status, checks: result.checks.map(({ id, status, reason }) => ({ id, status, ...(reason ? { reason } : {}) })), ...(result.error ? { error: result.error } : {}), ...(result.manifestSha256 ? { manifestSha256: result.manifestSha256 } : {}) }));
  process.exitCode = result.status === 'passed' ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
