// Disposable managed upgrade/rollback rehearsal from the published v0.3.29 release.
//
// Real public installer runs in disposable HOMEs: v0.3.29 installer + digest-pinned
// GitHub release (managed local with Mac app, and remote-only), then a candidate
// commit through the candidate installer (--source <git archive>), then software
// rollback with --source release. Loopback hosted brains run from the pinned v0.3.29
// package and a built candidate copy, including an optional owner handoff.
// The app fixture pins a test Node launcher and denies the gateway access to
// real app settings. The harness verifies the real settings files stay intact.
//
// Usage: node scripts/multi-brain-managed-upgrade-smoke.mjs [--candidate <commit>|working-tree] [--out <dir>]
//          [--only local|remote] [--with-app] [--keep]
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { cp, mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, writeFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const repo = fileURLToPath(new URL('..', import.meta.url));
const scriptFile = fileURLToPath(import.meta.url);
const BASE_TAG = 'v0.3.29', BASE_COMMIT = '43dfa6e3a018e443e3e14d38c02792be552eec27', BASE_VERSION = '0.3.29';
const BASE_DIGEST = '1a2a113c176d41910b93e2074363375619c210903961f087d6cbf17eff9847e7';
const sha = value => createHash('sha256').update(value).digest('hex');
const json = value => JSON.stringify(value, null, 2) + '\n';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const secrets = new Set();
const redact = text => { let result = String(text); for (const value of secrets) result = result.replaceAll(value, '[redacted]'); return result; };
const fingerprint = key => 'sha256:' + sha(key).slice(0, 12);

const { values } = parseArgs({ options: { candidate: { type: 'string' }, out: { type: 'string' }, only: { type: 'string' }, keep: { type: 'boolean' }, 'with-app': { type: 'boolean' } }, strict: true });
if (values.only && !['local', 'remote'].includes(values.only)) throw new Error('--only must be local or remote');
// The packaged native host derives its gateway HOME from the account (homeDirectoryForCurrentUser),
// not the disposable HOME, so a disposable app can read/write the real ~/.config/jumpybrain/.env.
// Run the Mac app scenario only on request, and guard real-home files around every scenario.
if (values.only === 'local' && !values['with-app']) throw new Error('--only local requires --with-app.');
const realHome = os.userInfo().homedir;
const sentinelPaths = ['.config/jumpybrain/.env', 'Library/Application Support/jumpyBrain Companion/connections.json', '.jumpybrain/cli-config.json', '.jumpybrain/identity.json', '.jumpybrain/install-manifest.json'].map(file => path.join(realHome, file));
async function realHomeSentinel() { const result = {}; for (const file of sentinelPaths) { const info = await stat(file).catch(() => null); result[file] = info ? { sha: sha(await readFile(file)), mtimeMs: info.mtimeMs } : null; } return result; }
async function assertRealHomeUnchanged(label, before) { const now = await realHomeSentinel(); const changed = Object.keys(now).filter(file => JSON.stringify(now[file]) !== JSON.stringify(before[file])); if (changed.length) { receipt.realHomeChanged = changed; throw new Error(label + ': real HOME files changed: ' + changed.join(', ')); } }
// working-tree snapshots tracked + untracked non-ignored files (an uncommitted candidate).
const workingTree = values.candidate === 'working-tree';
const candidateCommit = execFileSync('git', ['rev-parse', (workingTree ? 'HEAD' : values.candidate ?? 'HEAD') + '^{commit}'], { cwd: repo, encoding: 'utf8' }).trim();
const out = path.resolve(values.out ?? path.join(repo, '.local-pack/multi-brain-upgrade', new Date().toISOString().replaceAll(':', '-')));
await mkdir(path.join(out, 'logs'), { recursive: true });
// Short base path: app sockets live below the disposable HOME.
const work = await realpath(await mkdtemp(path.join(os.tmpdir(), 'jbmu-')));
const processes = new Set();
const receipt = {
  version: 1, passed: false, startedAt: new Date().toISOString(), work, out,
  checkout: { head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim(), scriptSha256: sha(await readFile(scriptFile)) },
  baseline: { tag: BASE_TAG, commit: BASE_COMMIT, version: BASE_VERSION, releaseAssetSha256: BASE_DIGEST },
  candidate: { commit: candidateCommit },
  machine: { macOS: execFileSync('/usr/bin/sw_vers', ['-productVersion'], { encoding: 'utf8' }).trim(), arch: process.arch, node: process.version },
  steps: [], timings: {}, checks: {}, limits: [
    'Upgrade uses the candidate installer with --source <git archive of the candidate commit>, the supported path for an unpublished build; a published GUI update/jumpybrain update to the candidate is not exercised.',
    'Rollback is the supported reinstall of the published release (--source release); Markdown, keys, profiles and settings are not rolled back (none are expected to change).',
    'Hosted brains are loopback HTTP serve processes (old = pinned v0.3.29 package, new = candidate build); no TLS proxy, VPS, Coolify or browser sessions.',
    'The Mac app is quit by SIGTERM to its exact executable path (no AppleScript, which could address the real same-identity app); no open-edit draft is present during quit.',
  ],
};
const record = (label, extra = {}) => { receipt.steps.push({ label, at: new Date().toISOString(), ...extra }); console.error('[step]', label); };

function cleanEnv(home, extra = {}) {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) if (!/^(JUMPYBRAIN_|QMD_|ELECTRON_RUN_AS_NODE$|npm_)/.test(key)) env[key] = value;
  return { ...env, HOME: home, CFFIXED_USER_HOME: home, npm_config_cache: path.join(home, '.npm'), JUMPYBRAIN_QMD_EMBED: '0', ...extra };
}
function run(label, command, args, { env, cwd = work, input = '', allowFailure = false, timeoutMs = 30 * 60 * 1000 } = {}) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const child = spawn(command, args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    const timer = setTimeout(() => child.kill('SIGTERM'), timeoutMs);
    child.once('error', reject);
    child.once('close', async code => {
      clearTimeout(timer);
      const ms = Date.now() - started;
      await writeFile(path.join(out, 'logs', label.replace(/[^a-z0-9.-]+/gi, '_') + '.log'), redact(`$ ${command} ${args.join(' ')}\n[exit ${code}, ${ms} ms]\n--- stdout\n${stdout}\n--- stderr\n${stderr}`));
      receipt.steps.push({ label, code, ms });
      if (code !== 0 && !allowFailure) return reject(new Error(`${label} exited ${code}: ${redact(stderr.slice(-1500) || stdout.slice(-1500))}`));
      resolve({ code, stdout, stderr, ms });
    });
    child.stdin.end(input);
  });
}
const parse = (text, label) => { try { return JSON.parse(text); } catch { const start = text.indexOf('{'); if (start >= 0) try { return JSON.parse(text.slice(start)); } catch {} throw new Error(label + ' did not return JSON'); } };
async function freePort() { const server = net.createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const { port } = server.address(); await new Promise(resolve => server.close(resolve)); return port; }
async function filesBelow(root, names) {
  const result = {};
  async function walk(relative) {
    const full = path.join(root, relative);
    const info = await stat(full).catch(() => null);
    if (!info) return;
    if (info.isDirectory()) for (const entry of (await readdir(full)).sort()) await walk(path.join(relative, entry));
    else if (info.isFile()) result[relative] = sha(await readFile(full));
  }
  for (const name of names) await walk(name);
  return result;
}
const canonical = root => filesBelow(root, ['notes', 'boards', 'pages', 'decisions', 'jumpybrain.json']);
const bytesOrNull = file => readFile(file).then(sha).catch(() => null);

async function waitFor(label, check, timeoutMs = 45000) {
  const deadline = Date.now() + timeoutMs; let last;
  while (Date.now() < deadline) { try { const value = await check(); if (value) return value; } catch (error) { last = error; } await pause(250); }
  throw new Error(`${label} timed out${last ? ': ' + redact(last.message) : ''}`);
}
async function capabilities(origin, key) {
  const response = await fetch(origin + '/capabilities', { headers: { Authorization: 'Bearer ' + key } });
  return { status: response.status, body: response.status === 200 ? await response.json() : null };
}

// ---------- Hosted loopback brains ----------
function serveProcess(label, runtime, root, port, adminKey, home) {
  const env = cleanEnv(home, { JUMPYBRAIN_SERVER_API_KEYS: adminKey, JUMPYBRAIN_QMD_BIN: qmdBin, JUMPYBRAIN_CLI_CONFIG: path.join(home, 'cli-config.json') });
  const child = spawn(process.execPath, [path.join(runtime, 'dist/cli.js'), 'serve', '--root', root, '--host', '127.0.0.1', '--port', String(port)], { cwd: work, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; child.stdout.on('data', c => { log += c; }); child.stderr.on('data', c => { log += c; });
  child.once('close', code => { writeFile(path.join(out, 'logs', `serve-${label}-${Date.now()}.log`), redact(`[exit ${code}]\n` + log)).catch(() => {}); });
  processes.add(child); child.once('close', () => processes.delete(child));
  return child;
}
async function stopChild(child, timeoutMs = 20000) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const done = new Promise(resolve => child.once('close', resolve));
  child.kill('SIGTERM');
  await Promise.race([done, pause(timeoutMs).then(() => { child.kill('SIGKILL'); return done; })]);
}

// ---------- Mac app process control by exact executable path ----------
function appPids(home) {
  const executable = path.join(home, 'Applications/jumpyBrain.app/Contents/MacOS/jumpyBrain');
  return execFileSync('/bin/ps', ['-axo', 'pid=,comm='], { encoding: 'utf8' }).split('\n').map(line => line.trim().match(/^(\d+)\s+(.*)$/)).filter(m => m && m[2] === executable).map(m => Number(m[1]));
}
function processesUnder(home) {
  return execFileSync('/bin/ps', ['-axo', 'pid=,command='], { encoding: 'utf8' }).split('\n').map(line => line.trim().match(/^(\d+)\s+(.*)$/)).filter(m => m && m[2].includes(home + '/') && Number(m[1]) !== process.pid).map(m => ({ pid: Number(m[1]), command: redact(m[2]).slice(0, 200) }));
}
async function quitApp(home) {
  const pids = appPids(home); if (!pids.length) return { ms: 0, wasRunning: false };
  const started = Date.now();
  for (const pid of pids) try { process.kill(pid, 'SIGTERM'); } catch {}
  await waitFor('app quit', () => appPids(home).length === 0, 45000);
  return { ms: Date.now() - started, wasRunning: true };
}
async function launchApp(home, cli, env) {
  const started = Date.now();
  const executable = path.join(home, 'Applications/jumpyBrain.app/Contents/MacOS/jumpyBrain');
  // Match the installer launch. Only the gateway needs the credential
  // sandbox, which the verified fixture Node applies before running it.
  const child = spawn(executable, [], { env, detached: true, stdio: ['ignore', 'ignore', 'pipe'] });
  let detail = '';
  child.stderr.on('data', chunk => { detail = (detail + chunk).slice(-2000); });
  child.unref();
  try {
    const state = await waitFor('app reopen', async () => {
      if (child.exitCode !== null || child.signalCode !== null) throw new Error(`app exited ${child.exitCode ?? child.signalCode}: ${detail}`);
      const r = await run('connections-list-reopen', cli, ['connections', 'list', '--json'], { env, allowFailure: true });
      return r.code === 0 ? parse(r.stdout, 'connections list') : null;
    }, 30000);
    return { ms: Date.now() - started, state };
  } finally {
    child.stderr.destroy();
  }
}

// ---------- Shared checks ----------
const qmdBin = '/opt/homebrew/bin/qmd';
async function recallExpand(label, cli, env, selector, needle) {
  const recalled = parse((await run(label + '-recall', cli, ['recall', ...selector, '--query', needle, '--json'], { env })).stdout, 'recall');
  const hit = (recalled.results ?? []).find(item => JSON.stringify(item).includes(needle));
  assert.ok(hit, `${label}: recall found ${needle}`);
  const id = hit.provenance?.metadata?.id;
  let hash = JSON.stringify(recalled).match(/sha256:[a-f0-9]{64}/)?.[0];
  if (!hash) hash = JSON.stringify(parse((await run(label + '-show', cli, ['show', ...selector, '--id', id, '--json'], { env })).stdout, 'show')).match(/sha256:[a-f0-9]{64}/)?.[0];
  assert.ok(id && hash, `${label}: recall/show gave id and content hash`);
  const expanded = parse((await run(label + '-expand', cli, ['expand', ...selector, '--id', id, '--if-match', hash, '--json'], { env })).stdout, 'expand');
  assert.ok(JSON.stringify(expanded).includes(needle), `${label}: expand returned evidence`);
  return true;
}
function connectionsSummary(state) {
  return { activeId: state.activeId, profiles: (state.profiles ?? []).map(p => ({ id: p.id, name: p.name, kind: p.kind, root: p.root, origin: p.origin ?? p.url })).sort((a, b) => a.id.localeCompare(b.id)) };
}

async function main() {
  const t0 = Date.now();
  // ---------- Sources and runtimes ----------
  assert.equal(execFileSync('git', ['rev-parse', BASE_TAG + '^{commit}'], { cwd: repo, encoding: 'utf8' }).trim(), BASE_COMMIT);
  assert.match(execFileSync(qmdBin, ['--version'], { encoding: 'utf8' }), /^qmd 2\.8\.3/);
  const baseSrc = path.join(work, 'src-v0.3.29'), candSrc = path.join(work, 'src-candidate'), oldRuntime = path.join(work, 'rt-old'), newRuntime = path.join(work, 'rt-new');
  for (const [commit, dir] of [[BASE_COMMIT, baseSrc], [candidateCommit, candSrc]]) {
    await mkdir(dir);
    if (dir === candSrc && workingTree) {
      const files = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], { cwd: repo, encoding: 'utf8' }).split('\0').filter(Boolean).filter(file => existsSync(path.join(repo, file))).sort();
      const digest = createHash('sha256');
      for (const file of files) { const bytes = await readFile(path.join(repo, file)); digest.update(file + '\0' + sha(bytes) + '\n'); await mkdir(path.dirname(path.join(dir, file)), { recursive: true }); await writeFile(path.join(dir, file), bytes, { mode: (await stat(path.join(repo, file))).mode }); }
      receipt.candidate.workingTree = { base: candidateCommit, files: files.length, snapshotSha256: digest.digest('hex'), status: execFileSync('git', ['status', '--short'], { cwd: repo, encoding: 'utf8' }).trim().split('\n') };
    } else execFileSync('/bin/sh', ['-c', `git -C "$1" archive "$2" | tar -x -C "$3"`, 'sh', repo, commit, dir]);
  }
  receipt.candidate.packageVersion = JSON.parse(await readFile(path.join(candSrc, 'package.json'))).version;
  const releaseTgz = path.join(repo, '.local-pack/jumpybrain-0.3.29.tgz');
  assert.equal(sha(await readFile(releaseTgz)), BASE_DIGEST, 'local v0.3.29 package must equal the published asset');
  await mkdir(oldRuntime); execFileSync('tar', ['-xzf', releaseTgz, '-C', oldRuntime]);
  const oldPkg = path.join(oldRuntime, 'package');
  await writeFile(path.join(oldPkg, 'package-lock.json'), await readFile(path.join(oldPkg, 'dist/runtime-package-lock.json')));
  const toolHome = path.join(work, 'tool-home'); await mkdir(toolHome);
  await run('npm-old-runtime', 'npm', ['ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: oldPkg, env: cleanEnv(toolHome) });
  await cp(candSrc, newRuntime, { recursive: true });
  await run('npm-candidate', 'npm', ['ci', '--no-audit', '--no-fund'], { cwd: newRuntime, env: cleanEnv(toolHome) });
  await run('build-candidate', 'npm', ['run', 'build'], { cwd: newRuntime, env: cleanEnv(toolHome) });
  receipt.candidate.build = JSON.parse(await readFile(path.join(newRuntime, 'dist/adapters/diagnostics/build-info.json'))).build ?? null;
  receipt.baseline.serverBuild = JSON.parse(await readFile(path.join(oldPkg, 'dist/adapters/diagnostics/build-info.json'))).build ?? null;
  receipt.timings.prepareMs = Date.now() - t0;
  // --brain is listed in per-command help (target selectors), not the top-level summary.
  const candidateHelp = (await run('candidate-recall-help', process.execPath, [path.join(newRuntime, 'dist/cli.js'), 'recall', '--help'], { env: cleanEnv(toolHome) })).stdout;
  assert.match(candidateHelp, /--brain\b/, 'candidate must implement named targets');
  receipt.candidate.brainSelector = true;

  // ---------- Two hosted brains (old server) ----------
  const serverHome = path.join(work, 'server-home'); await mkdir(serverHome);
  const oldCli = (label, args, opts = {}) => run(label, process.execPath, [path.join(oldPkg, 'dist/cli.js'), ...args], { env: cleanEnv(serverHome, { JUMPYBRAIN_QMD_BIN: qmdBin, JUMPYBRAIN_CLI_CONFIG: path.join(serverHome, 'cli-config.json') }), ...opts });
  const hosted = {};
  for (const name of ['product', 'it']) {
    const root = path.join(work, 'hosted-' + name), key = randomBytes(32).toString('hex'), needle = 'hosted' + name + randomBytes(4).toString('hex');
    secrets.add(key);
    await oldCli('hosted-init-' + name, ['init', '--root', root, '--json']);
    await oldCli('hosted-remember-' + name, ['remember', '--root', root, '--title', 'Hosted ' + name, '--type', 'note', '--json'], { input: needle + ' hosted marker\n' });
    await oldCli('hosted-index-' + name, ['index', '--root', root, '--lexical', '--json']);
    const writer = parse((await oldCli('hosted-access-issue-' + name, ['access', 'issue', '--root', root, '--name', 'Upgrade writer ' + name, '--role', 'writer', '--json'])).stdout, 'access issue');
    secrets.add(writer.token);
    await oldCli('hosted-backend-stop-' + name, ['backend', 'stop', '--root', root, '--json'], { allowFailure: true });
    const port = await freePort();
    hosted[name] = { root, key, needle, writer, port, origin: `http://127.0.0.1:${port}`, version: 'v0.3.29' };
    hosted[name].child = serveProcess(name + '-old', oldPkg, root, port, key, serverHome);
    await waitFor('hosted ' + name, async () => (await capabilities(hosted[name].origin, key)).status === 200);
  }
  assert.equal((await capabilities(hosted.product.origin, hosted.it.key)).status, 401, 'brains reject each other\'s keys');
  receipt.checks.hostedCrossKeyRejected = true;
  record('hosted brains ready', { product: fingerprint(hosted.product.key), it: fingerprint(hosted.it.key) });

  const sentinel = await realHomeSentinel();
  if (values['with-app'] && values.only !== 'remote') { await managedLocal(baseSrc, candSrc, hosted); await assertRealHomeUnchanged('managed local + app', sentinel); }
  else receipt.limits.push('Managed local + Mac app scenario requires --with-app and its fixture Node and sandbox.');
  if (values.only !== 'local') { await remoteOnly(baseSrc, candSrc, hosted, newRuntime); await assertRealHomeUnchanged('remote-only', sentinel); }
  if (!values.only) await handoff(hosted, oldPkg, newRuntime, serverHome);
  await assertRealHomeUnchanged('handoff', sentinel);
  receipt.checks.realHomeUnchanged = true;
  receipt.timings.totalMs = Date.now() - t0;
  receipt.passed = true;
}

// ---------- Scenario A: managed local CLI + Mac app ----------
async function managedLocal(baseSrc, candSrc, hosted) {
  const home = path.join(work, 'ha'); await mkdir(home);
  const env = cleanEnv(home);
  const scenario = receipt.checks.managedLocal = { home };
  const appPort = await freePort();
  // The native host deliberately resets HOME to the account directory. Use the
  // installer's normal pinned Node path to put the actual gateway in this fixture.
  const fixture = path.join(home, 'fixture-runtime');
  await mkdir(fixture, { mode: 0o700 });
  const node = path.join(fixture, 'node'), preload = path.join(fixture, 'pin.cjs');
  const sandbox = path.join(fixture, 'isolation.sb'), nodeMarker = path.join(fixture, 'gateway-starts');
  const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";
  await writeFile(preload, `process.execPath = ${JSON.stringify(node)};\n`, { mode: 0o600 });
  await writeFile(node, [
    '#!/bin/sh',
    `export HOME=${quote(home)} CFFIXED_USER_HOME=${quote(home)}`,
    `case "$1" in */gateway.mjs)`,
    `  echo gateway >> ${quote(nodeMarker)}`,
    `  exec /usr/bin/sandbox-exec -f ${quote(sandbox)} ${quote(process.execPath)} --require ${quote(preload)} "$@" ;;`,
    'esac',
    `exec ${quote(process.execPath)} --require ${quote(preload)} "$@"`,
    '',
  ].join('\n'), { mode: 0o700 });
  const protectedPaths = [
    '.config/jumpybrain', '.jumpybrain', 'Applications/jumpyBrain.app',
    'Library/Application Support/jumpyBrain Companion',
    'Library/Application Support/jumpyBrain Electron Prototype',
    'Library/LaunchAgents/local.jumpybrain.desktop.plist',
  ].map(value => path.join(realHome, value));
  await writeFile(sandbox, '(version 1)\n(allow default)\n' + protectedPaths.map(value =>
    `(deny file-read-data file-write* (subpath ${JSON.stringify(value)}))`
  ).join('\n') + '\n', { mode: 0o600 });
  assert.equal((await run('fixture-node-home', '/usr/bin/sandbox-exec', ['-f', sandbox, node, '-p', 'require("node:os").homedir()'], { env })).stdout.trim(), home);
  // Check the OS policy before running any fixture that could otherwise see real keys.
  const probe = await run('fixture-native-isolation', '/usr/bin/sandbox-exec', ['-f', sandbox, node, '-e',
    'try { require("node:fs").readFileSync(process.argv[1]); } catch (error) { process.exit(error.code === "EPERM" || error.code === "EACCES" ? 0 : 2); } process.exit(3);',
    sentinelPaths[0],
  ], { env, allowFailure: true });
  assert.equal(probe.code, 0, 'sandbox must refuse access to the real credential file');
  async function select(cli, profileId, label) {
    const listed = parse((await run(label + '-list', cli, ['connections', 'list', '--json'], { env })).stdout, label);
    await run(label, cli, ['connections', 'select', '--id', profileId, '--revision', String(listed.revision), '--json'], { env });
  }
  const install = async (label, installerSrc, args) => {
    const started = Date.now();
    const result = parse((await run(label, node, [
      path.join(installerSrc, 'scripts/public-install.mjs'), '--home', home, ...args, '--integrations', 'none', '--yes', '--json',
    ], { env, cwd: home })).stdout, label);
    const appConfig = path.join(home, 'Applications/jumpyBrain.app/Contents/Resources/native/jumpyBrain Host.app/Contents/Resources/Configuration.json');
    assert.equal(JSON.parse(await readFile(appConfig)).node, node, 'packaged native host must use the fixture Node');
    assert.ok((await readFile(nodeMarker, 'utf8')).includes('gateway'), 'the packaged gateway ran through the fixture Node');
    scenario[label] = { ms: Date.now() - started, state: result.state, version: result.version, release: result.release ? { tag: result.release.tag, digest: result.release.digest } : null };
    return result;
  };
  const base = await install('install-baseline', baseSrc, ['--source', 'release', '--with-app', '--app-port', String(appPort)]);
  assert.equal(base.version, BASE_VERSION); assert.equal(base.release?.digest, 'sha256:' + BASE_DIGEST);
  const cli = path.join(home, '.jumpybrain/bin/jumpybrain');
  const manifestFile = path.join(home, '.jumpybrain/install-manifest.json');
  const manifest0 = JSON.parse(await readFile(manifestFile));
  const memory = manifest0.memoryRoot;
  // Seed exact Markdown bytes and a second local brain.
  const needleM = 'personalquartz' + randomBytes(4).toString('hex'), needleW = 'workquartz' + randomBytes(4).toString('hex');
  await run('a-remember-default', cli, ['remember', '--title', 'Personal marker', '--type', 'note', '--json'], { env, cwd: home, input: needleM + ' personal\n' });
  const exactBody = `---\nid: mem_${randomUUID()}\ntitle: Exact bytes\ntype: note\ncustom: unchanged\n---\n${needleM} exact  bytes\twith tab\r\nand CRLF line\n`;
  await writeFile(path.join(memory, 'notes/exact-bytes.md'), exactBody);
  const work2 = path.join(home, 'Brains/work');
  await run('a-init-work', cli, ['init', '--root', work2, '--json'], { env, cwd: home });
  await run('a-remember-work', cli, ['remember', '--root', work2, '--title', 'Work marker', '--type', 'note', '--json'], { env, cwd: home, input: needleW + ' work\n' });
  for (const root of [memory, work2]) await run('a-index-' + path.basename(root), cli, ['index', '--root', root, '--lexical', '--json'], { env, cwd: home });
  async function stopLocalOwners(phase) {
    for (const root of [memory, work2]) {
      await run(phase + '-backend-stop-' + path.basename(root), cli, ['backend', 'stop', '--root', root, '--json'], { env, cwd: home });
    }
  }
  // Keep the managed start-up folder selected for installer readiness.
  let state = parse((await run('a-connections-initial', cli, ['connections', 'list', '--json'], { env, cwd: home })).stdout, 'connections');
  const add = async (label, args, input) => { state = parse((await run(label, cli, ['connections', 'add', ...args, '--revision', String(state.revision), '--json'], { env, cwd: home, input })).stdout, label); if (state.revision === undefined) state = parse((await run(label + '-list', cli, ['connections', 'list', '--json'], { env, cwd: home })).stdout, 'connections'); };
  await add('a-connections-add-work', ['--name', 'Work', '--root', work2]);
  await add('a-connections-add-product', ['--name', 'Product', '--url', hosted.product.origin, '--key-stdin'], hosted.product.key);
  await add('a-connections-add-it', ['--name', 'IT', '--url', hosted.it.origin, '--key-stdin'], hosted.it.key);
  const workProfile = state.profiles.find(p => p.kind === 'local' && p.name === 'Work');
  assert.ok(workProfile, 'work profile registered');
  state = parse((await run('a-connections-list', cli, ['connections', 'list', '--json'], { env, cwd: home })).stdout, 'connections');
  assert.equal(state.profiles.find(profile => profile.id === state.activeId).root, memory);
  const expected = connectionsSummary(state);
  assert.equal(expected.profiles.length, 4, 'two local + two hosted profiles');
  const envFile = path.join(home, '.config/jumpybrain/.env');
  const remoteIds = expected.profiles.filter(p => p.kind !== 'local').map(p => p.id);

  const snapshot = async () => ({
    memory: await canonical(memory), work: await canonical(work2), exact: await readFile(path.join(memory, 'notes/exact-bytes.md'), 'utf8'),
    envFile: await bytesOrNull(envFile), cliConfig: await bytesOrNull(path.join(home, '.jumpybrain/cli-config.json')),
    identity: await bytesOrNull(path.join(home, '.jumpybrain/identity.json')),
    brainsFiles: await filesBelow(home, ['.config/jumpybrain', ...(await readdir(path.join(home, '.jumpybrain'))).filter(name => /brains/i.test(name)).map(name => path.join('.jumpybrain', name))]).then(all => Object.fromEntries(Object.entries(all).filter(([file]) => /brains/i.test(file)))),
  });
  let before = await snapshot();
  assert.ok(before.envFile, 'app saved hosted keys in ~/.config/jumpybrain/.env');
  const verify = async (phase, expectVersion, expectedSelection = expected) => {
    const now = await snapshot();
    assert.deepEqual(now, before, phase + ': Markdown bytes, saved keys, CLI policy and identity unchanged');
    const listed = connectionsSummary(parse((await run(phase + '-connections-list', cli, ['connections', 'list', '--json'], { env, cwd: home })).stdout, 'connections'));
    assert.deepEqual(listed, expectedSelection, phase + ': app profiles, IDs and active selection preserved');
    for (const id of remoteIds) { const tested = (await run(phase + '-connections-test-' + id, cli, ['connections', 'test', '--id', id, '--json'], { env, cwd: home })).stdout; assert.match(tested, /connected/, phase + ': hosted connection works with the saved key'); }
    const manifest = JSON.parse(await readFile(manifestFile));
    for (const key of ['memoryRoot', 'installRoot', 'appDir', 'cliPath', 'integrationMode', 'scope', 'desktopPort', 'profile']) assert.deepEqual(manifest[key], manifest0[key], phase + ': manifest ' + key);
    const project = parse((await run(phase + '-project-status', cli, ['project', 'status', '--json'], { env, cwd: home })).stdout, 'project status');
    assert.ok(JSON.stringify(project).includes(memory), phase + ': CLI default stays the configured folder, independent of the app selection');
    await recallExpand(phase + '-default', cli, env, [], needleM);
    await recallExpand(phase + '-work', cli, env, ['--root', work2], needleW);
    const status = (await run(phase + '-remote-status', cli, ['status', '--target-url', hosted.product.origin], { env, cwd: home })).stdout;
    assert.match(status, /accepted/i, phase + ': CLI uses the app-saved key for the same origin');
    await recallExpand(phase + '-remote-product', cli, env, ['--target-url', hosted.product.origin], hosted.product.needle);
    await recallExpand(phase + '-remote-it', cli, env, ['--target-url', hosted.it.origin], hosted.it.needle);
    assert.equal((await run(phase + '-cli-version', cli, ['--version'], { env, cwd: home })).stdout.trim(), expectVersion);
    const appVersion = JSON.parse(await readFile(path.join(home, 'Applications/jumpyBrain.app/Contents/Resources/runtime/package.json'))).version;
    const appBuild = JSON.parse(await readFile(path.join(home, 'Applications/jumpyBrain.app/Contents/Resources/runtime/dist/adapters/diagnostics/build-info.json')));
    const cliBuild = JSON.parse(await readFile(path.join(home, '.jumpybrain/app/dist/adapters/diagnostics/build-info.json')));
    scenario[phase] = { ok: true, appVersion, appBuild: appBuild.build ?? null, cliBuild: cliBuild.build ?? null, source: manifest.source, ref: manifest.ref ?? null };
    record('managed local ' + phase + ' verified');
  };
  await verify('baseline', BASE_VERSION);

  // Upgrade to the candidate through the candidate installer.
  scenario.quitBeforeUpgrade = await quitApp(home);
  // The public installer uses source replacement here. Explicitly retire the
  // owners too, since both test builds report version 0.3.29.
  await stopLocalOwners('before-upgrade');
  await install('install-candidate', candSrc, ['--source', candSrc, '--with-app']);
  await waitFor('candidate app ready', async () => (await run('a-candidate-ready', cli, ['connections', 'list', '--json'], { env, cwd: home, allowFailure: true })).code === 0, 60000);
  await verify('upgraded', receipt.candidate.packageVersion);
  if (receipt.candidate.brainSelector) {
    // Optional named targets on the upgraded CLI; the app selection must stay independent.
    await run('a-brains-add-work', cli, ['brains', 'add', 'work', '--root', work2, '--json'], { env, cwd: home });
    await run('a-brains-add-it', cli, ['brains', 'add', 'it', '--target-url', hosted.it.origin, '--key-stdin', '--json'], { env, cwd: home, input: hosted.it.key });
    await recallExpand('a-brain-work', cli, env, ['--brain', 'work'], needleW);
    await recallExpand('a-brain-it', cli, env, ['--brain', 'it'], hosted.it.needle);
    const brainStatus = (await run('a-brain-status-it', cli, ['status', '--brain', 'it'], { env, cwd: home })).stdout;
    assert.ok(!brainStatus.includes(hosted.it.key), 'status never prints the key');
    const missing = await run('a-brain-unknown', cli, ['recall', '--brain', 'nope', '--query', 'x', '--json'], { env, cwd: home, allowFailure: true });
    assert.notEqual(missing.code, 0, 'unknown alias fails closed');
    assert.deepEqual(connectionsSummary(parse((await run('a-brains-connections', cli, ['connections', 'list', '--json'], { env, cwd: home })).stdout, 'connections')), expected, 'aliases do not change app profiles or selection');
    const after = await snapshot();
    scenario.aliasChangedFiles = Object.keys(after).filter(key => JSON.stringify(after[key]) !== JSON.stringify(before[key]));
    before = after; // aliases are new optional CLI config; later phases must preserve them
    scenario.aliases = true;
  }
  if (receipt.candidate.build) assert.deepEqual(scenario.upgraded.cliBuild, receipt.candidate.build, 'managed CLI runs the candidate build');
  assert.deepEqual(scenario.upgraded.appBuild, scenario.upgraded.cliBuild, 'app runtime and CLI are the same candidate build');
  // Packaged candidate must remember an explicitly selected different brain.
  await select(cli, workProfile.id, 'a-select-work-before-reopen');
  const selectedWork = { ...expected, activeId: workProfile.id };
  scenario.quitCandidate = await quitApp(home);
  const reopened = await launchApp(home, cli, env);
  assert.deepEqual(connectionsSummary(reopened.state), selectedWork, 'reopened candidate app keeps profiles and selection');
  scenario.reopenCandidateMs = reopened.ms;
  await verify('reopened', receipt.candidate.packageVersion, selectedWork);

  // Supported software rollback: reinstall the published release.
  await select(cli, expected.activeId, 'a-select-managed-brain-before-rollback');
  scenario.quitBeforeRollback = await quitApp(home);
  await stopLocalOwners('before-rollback');
  const rolled = await install('install-rollback', candSrc, ['--source', 'release', '--with-app']);
  assert.equal(rolled.version, BASE_VERSION);
  await waitFor('rolled back app ready', async () => (await run('a-rollback-ready', cli, ['connections', 'list', '--json'], { env, cwd: home, allowFailure: true })).code === 0, 60000);
  await verify('rolledBack', BASE_VERSION);
  if (scenario.aliases) {
    // Downgrade: v0.3.29 has no --brain; existing selectors keep working (verified above) and the alias file is left in place.
    const old = await run('a-rolledback-brain-flag', cli, ['recall', '--brain', 'work', '--query', needleW, '--json'], { env, cwd: home, allowFailure: true });
    scenario.rolledBackBrainFlag = { exit: old.code, message: redact(old.stderr.trim().split('\n')[0] ?? '') };
  }
  assert.deepEqual(scenario.rolledBack.cliBuild, scenario.baseline.cliBuild, 'rollback restores the v0.3.29 build');
  scenario.quitRolledBack = await quitApp(home);
  const reopenedOld = await launchApp(home, cli, env);
  assert.deepEqual(connectionsSummary(reopenedOld.state), expected, 'reopened v0.3.29 app keeps profiles and selection after rollback');
  scenario.reopenRolledBackMs = reopenedOld.ms;
  scenario.retention = parse((await run('a-storage-preview', process.execPath, [path.join(home, '.jumpybrain/app/scripts/installation-storage.mjs'), '--preview', '--json'], { env, cwd: home, allowFailure: true })).stdout || '{}', 'storage').rollback ?? null;
  await quitApp(home);
  await stopLocalOwners('after-rollback');
  scenario.passed = true;
}

// ---------- Scenario B: remote-only CLI ----------
async function remoteOnly(baseSrc, candSrc, hosted, newRuntime) {
  const home = path.join(work, 'hb'); await mkdir(home);
  const env = cleanEnv(home);
  const scenario = receipt.checks.remoteOnly = { home };
  const install = async (label, installerSrc, args) => {
    const result = parse((await run('b-' + label, process.execPath, [path.join(installerSrc, 'scripts/public-install.mjs'), '--home', home, ...args, '--yes', '--json'], { env, cwd: home })).stdout, label);
    scenario[label] = { state: result.state, version: result.version, release: result.release ? { tag: result.release.tag, digest: result.release.digest } : null };
    return result;
  };
  const base = await install('install-baseline', baseSrc, ['--source', 'release', '--remote-only', '--read-only-target', hosted.it.origin]);
  assert.equal(base.version, BASE_VERSION); assert.equal(base.release?.digest, 'sha256:' + BASE_DIGEST);
  const cli = path.join(home, '.jumpybrain/bin/jumpybrain');
  const manifestFile = path.join(home, '.jumpybrain/install-manifest.json');
  const manifest0 = JSON.parse(await readFile(manifestFile));
  assert.equal(manifest0.remoteOnly, true);
  // Documented fallback credential: JUMPYBRAIN_API_KEY in ~/.config/jumpybrain/.env (writer key for product).
  const envFile = path.join(home, '.config/jumpybrain/.env');
  await mkdir(path.dirname(envFile), { recursive: true, mode: 0o700 });
  await writeFile(envFile, `JUMPYBRAIN_API_KEY=${hosted.product.writer.token}\n`, { mode: 0o600 });
  const before = { envFile: await bytesOrNull(envFile), cliConfig: await bytesOrNull(manifest0.cliConfigPath ?? path.join(home, '.jumpybrain/cli-config.json')) };
  assert.ok(before.cliConfig, 'read-only target policy file exists');
  const writes = [];
  const verify = async phase => {
    assert.deepEqual({ envFile: await bytesOrNull(envFile), cliConfig: await bytesOrNull(manifest0.cliConfigPath ?? path.join(home, '.jumpybrain/cli-config.json')) }, before, phase + ': saved key and CLI policy bytes unchanged');
    const manifest = JSON.parse(await readFile(manifestFile));
    assert.equal(manifest.remoteOnly, true, phase + ': remote-only mode kept');
    assert.equal(existsSync(path.join(home, '.jumpybrain/memory')), false, phase + ': no local brain created');
    const status = (await run('b-' + phase + '-status-product', cli, ['status', '--target-url', hosted.product.origin], { env, cwd: home })).stdout;
    assert.match(status, /accepted/i);
    await recallExpand('b-' + phase + '-product', cli, env, ['--target-url', hosted.product.origin], hosted.product.needle);
    // Per-command environment key for the second brain (old syntax: --remote-url alias).
    const itEnv = { ...env, JUMPYBRAIN_API_KEY: hosted.it.key };
    await recallExpand('b-' + phase + '-it', cli, itEnv, ['--remote-url', hosted.it.origin], hosted.it.needle);
    const wrong = await run('b-' + phase + '-wrong-key', cli, ['recall', '--target-url', hosted.product.origin, '--query', 'x', '--json'], { env: itEnv, cwd: home, allowFailure: true });
    assert.notEqual(wrong.code, 0, phase + ': another brain\'s key is rejected');
    const needle = 'remotewrite' + phase.toLowerCase() + randomBytes(3).toString('hex');
    await run('b-' + phase + '-remember-product', cli, ['remember', '--target-url', hosted.product.origin, '--title', 'Remote ' + phase, '--type', 'note', '--json'], { env, cwd: home, input: needle + '\n' });
    writes.push(needle);
    const blocked = await run('b-' + phase + '-remember-it-readonly', cli, ['remember', '--target-url', hosted.it.origin, '--title', 'Blocked', '--type', 'note', '--json'], { env: itEnv, cwd: home, input: 'blocked\n', allowFailure: true });
    assert.notEqual(blocked.code, 0, phase + ': device read-only target policy still enforced');
    scenario[phase] = { ok: true, version: (await run('b-' + phase + '-version', cli, ['--version'], { env, cwd: home })).stdout.trim(), source: manifest.source };
    record('remote-only ' + phase + ' verified');
  };
  await verify('baseline');
  await install('install-candidate', candSrc, ['--source', candSrc]);
  await verify('upgraded');
  assert.equal(scenario.upgraded.version, receipt.candidate.packageVersion);
  if (receipt.candidate.brainSelector) {
    await run('b-brains-add-it', cli, ['brains', 'add', 'it', '--target-url', hosted.it.origin, '--key-stdin', '--json'], { env, cwd: home, input: hosted.it.key });
    await recallExpand('b-brain-it', cli, env, ['--brain', 'it'], hosted.it.needle);
    const blocked = await run('b-brain-it-readonly', cli, ['remember', '--brain', 'it', '--title', 'Blocked', '--type', 'note', '--json'], { env, cwd: home, input: 'blocked\n', allowFailure: true });
    assert.notEqual(blocked.code, 0, 'read-only policy applies through an alias');
    before.envFile = await bytesOrNull(envFile); before.cliConfig = await bytesOrNull(manifest0.cliConfigPath ?? path.join(home, '.jumpybrain/cli-config.json'));
    scenario.aliases = true;
  }
  await install('install-rollback', candSrc, ['--source', 'release']);
  await verify('rolledBack');
  assert.equal(scenario.rolledBack.version, BASE_VERSION);
  scenario.remoteWrites = writes.length;
  scenario.cli = cli; scenario.env = null;
  receipt.remoteOnlyCli = { cli, home };
  scenario.passed = true;
}

// ---------- Optional hosted owner handoff (same root, same origin) ----------
async function handoff(hosted, oldPkg, newRuntime, serverHome) {
  const brain = hosted.product, scenario = receipt.checks.handoff = {};
  const accessFile = path.join(brain.root, '.jumpybrain/access.json');
  const accessBefore = await bytesOrNull(accessFile);
  const swap = async (label, runtime) => {
    const before = await canonical(brain.root);
    const started = Date.now();
    await stopChild(brain.child);
    const stoppedAt = Date.now();
    assert.notEqual((await fetch(brain.origin + '/capabilities').then(r => r.status).catch(() => 'down')), 200);
    brain.child = serveProcess('product-' + label, runtime, brain.root, brain.port, brain.key, serverHome);
    await waitFor('handoff ' + label, async () => (await capabilities(brain.origin, brain.key)).status === 200);
    const timing = { drainStopMs: stoppedAt - started, unavailableMs: Date.now() - stoppedAt, totalMs: Date.now() - started };
    assert.deepEqual(await canonical(brain.root), before, label + ': Markdown unchanged by the owner swap');
    assert.equal(await bytesOrNull(accessFile), accessBefore, label + ': issued access unchanged');
    const writer = await capabilities(brain.origin, brain.writer.token);
    assert.equal(writer.status, 200, label + ': issued writer key still accepted'); assert.equal(writer.body.principal.id, brain.writer.credential.id);
    assert.equal((await capabilities(brain.origin, hosted.it.key)).status, 401, label + ': other brain key still rejected');
    return timing;
  };
  const clients = [];
  if (receipt.remoteOnlyCli) clients.push(['v0.3.29-remote-only', receipt.remoteOnlyCli.cli, cleanEnv(receipt.remoteOnlyCli.home)]);
  const candEnv = cleanEnv(serverHome, { JUMPYBRAIN_CLI_CONFIG: path.join(serverHome, 'cand-cli-config.json'), JUMPYBRAIN_API_KEY: brain.writer.token });
  const candidateCli = path.join(work, 'candidate-cli.sh');
  await writeFile(candidateCli, `#!/bin/sh\nexec "${process.execPath}" "${path.join(newRuntime, 'dist/cli.js')}" "$@"\n`, { mode: 0o755 });
  clients.push(['candidate', candidateCli, candEnv]);
  const exercise = async label => {
    for (const [name, cli, env] of clients) {
      await recallExpand(`h-${label}-${name}`, cli, env, ['--target-url', brain.origin], brain.needle);
      const needle = 'handoff' + label + randomBytes(3).toString('hex');
      const saved = parse((await run(`h-${label}-${name}-remember`, cli, ['remember', '--target-url', brain.origin, '--title', 'Handoff ' + label, '--type', 'note', '--json'], { env, cwd: work, input: needle + '\n' })).stdout, 'remember');
      // Canonical read-after-write first; hosted indexing may be deferred (index_deferred), so recall is retried.
      const shown = (await run(`h-${label}-${name}-show`, cli, ['show', '--target-url', brain.origin, '--id', saved.id, '--json'], { env, cwd: work })).stdout;
      assert.ok(shown.includes(needle), `${label}/${name}: written note readable by id`);
      const started = Date.now();
      await waitFor(`${label}/${name} recall after write`, () => recallExpand(`h-${label}-${name}-readback`, cli, env, ['--target-url', brain.origin], needle), 90000);
      (scenario.indexLagMs ??= {})[`${label}/${name}`] = Date.now() - started;
    }
  };
  await exercise('old');
  scenario.toCandidate = await swap('candidate', newRuntime);
  await exercise('new');
  scenario.rollbackToOld = await swap('rollback', oldPkg);
  await exercise('rolledback');
  scenario.passed = true;
  record('hosted owner handoff and rollback verified', scenario);
}

let exitCode = 0;
try { await main(); console.log('Multi-brain managed upgrade smoke: PASS'); }
catch (error) { exitCode = 1; receipt.error = redact(error.stack ?? error.message); console.error('Multi-brain managed upgrade smoke: FAIL\n' + receipt.error); }
finally {
  for (const child of processes) await stopChild(child);
  for (const home of [path.join(work, 'ha'), path.join(work, 'hb')]) {
    if (!existsSync(home)) continue;
    await quitApp(home).catch(() => {});
    for (const { pid } of processesUnder(home)) try { process.kill(pid, 'SIGTERM'); } catch {}
    const app = path.join(home, 'Applications/jumpyBrain.app');
    // Undo the LaunchServices registration the installer adds for this disposable bundle.
    if (existsSync(app)) try { execFileSync('/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister', ['-u', app], { stdio: 'pipe' }); } catch {}
  }
  await pause(1500);
  receipt.leftoverProcesses = processesUnder(work);
  receipt.finishedAt = new Date().toISOString();
  await writeFile(path.join(out, 'report.json'), redact(json(receipt)));
  console.log(redact(json(receipt)));
  if (!values.keep && receipt.passed && !receipt.leftoverProcesses.length) await rm(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  else console.error('Retained disposable work directory:', work);
  process.exitCode = exitCode;
}
