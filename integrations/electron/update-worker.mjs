// Runs from a private handoff directory, outside both replacement trees.
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, rename, rm, statfs } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { boundedFetch, verifyArtifact } from './update-release.mjs';
import { readJSON, alive, installedVersion, cliPolicy } from './update-policy.mjs';
import { bundledHost, startDesktopHost } from './desktop-host.mjs';
import { probeCompanion, readControlKey } from './host.mjs';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
export async function atomicJSON(file, value) {
  const temporary = file + '.' + randomUUID() + '.tmp';
  await writeFile(temporary, JSON.stringify(value) + '\n', { mode: 0o600 });
  await rename(temporary, file);
}
export async function runWorker(directory, { recovering = false, notifyFailure, diskSpace = statfs, download = boundedFetch } = {}) {
  const request = await readJSON(path.join(directory, 'request.json'));
  const root = path.join(request.home, '.jumpybrain');
  const lock = path.join(root, '.installer-lock');
  const env = { HOME: request.home, PATH: `${path.dirname(request.node)}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin`,
    LANG: 'en_US.UTF-8', JUMPYBRAIN_QMD_BIN: request.configuration.qmd, JUMPYBRAIN_NO_UPDATE_CHECK: '1',
    npm_config_audit: 'false', npm_config_fund: 'false' };
  let log = Buffer.alloc(0), stopped = false, launched = null, published = false;
  const controller = new AbortController();
  const timings = [], marks = {};
  const saveTimings = () => atomicJSON(path.join(directory, 'timings.json'), { schema: 1, timings, marks });
  async function measure(stage, operation) {
    const started = performance.now();
    try { return await operation(); }
    finally {
      const durationMs = Math.round(performance.now() - started);
      timings.push({ stage, durationMs });
      if (stage === 'download') marks.downloadFinished = Date.now();
      await saveTimings();
      output(`\n[timing] ${stage}: ${durationMs} ms\n`);
    }
  }
  const status = async (phase, detail) => {
    marks[phase] ??= Date.now();
    await saveTimings();
    await atomicJSON(path.join(directory, 'state.json'), { phase, detail, pid: process.pid, version: request.release.version, updatedAt: Date.now() });
  };
  const output = bytes => { log = Buffer.concat([log, Buffer.isBuffer(bytes) ? bytes : Buffer.from(String(bytes))]).subarray(-256 * 1024); };
  async function run(command, args, cwd = directory, timeout = 20 * 60 * 1000) {
    if (controller.signal.aborted) throw new Error('Update preparation canceled.');
    const child = spawn(command, args, { cwd, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', output); child.stderr.on('data', output);
    const completed = new Promise((resolve, reject) => { child.once('error', reject); child.once('close', code => code === 0 ? resolve() : reject(new Error(`${path.basename(command)} did not complete. Check the private update log and retry. Repair Node 22.12+, npm, Python 3, Xcode Command Line Tools or external QMD if missing.`))); });
    // Install listeners before any filesystem await (ENOENT may arrive immediately).
    void completed.catch(() => {});
    const kill = () => { try { process.kill(-child.pid, 'SIGKILL'); } catch {} };
    const timer = setTimeout(kill, timeout);
    controller.signal.addEventListener('abort', kill, { once: true });
    try {
      await atomicJSON(path.join(directory, 'child.json'), { pid: child.pid || null });
      if (controller.signal.aborted) kill();
      await completed;
    } finally {
      clearTimeout(timer); controller.signal.removeEventListener('abort', kill);
      await rm(path.join(directory, 'child.json'), { force: true });
      await writeFile(path.join(directory, 'update.log'), log, { mode: 0o600 });
    }
  }
  let monitor;
  try {
  const ownedLock = await readJSON(path.join(lock, 'desktop.json'));
  if (ownedLock.directory !== directory || ![request.parentPid, process.pid].includes(ownedLock.pid)) throw new Error('Updater lock changed.');
  await atomicJSON(path.join(lock, 'desktop.json'), { directory, pid: process.pid });
  monitor = setInterval(async () => {
    try {
      if (!stopped && (!alive(request.parentPid) || await readFile(path.join(directory, 'cancel'), 'utf8').catch(() => '') === 'cancel')) controller.abort();
    } catch { controller.abort(); }
  }, 300);
    if (!recovering) {
      await status('preparing', 'Checking prerequisites and free space… You can keep editing.');
      const space = await diskSpace(directory);
      if (space.bavail * space.bsize < 3 * 1024 ** 3) throw new Error('At least 3 GB of free space is needed to prepare and retain the previous installation. Free space and retry.');
      for (const [cmd, args] of [[request.node, ['-e', 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||a===22&&b>=12?0:1)']], ['npm', ['--version']], ['python3', ['--version']], ['/usr/bin/xcrun', ['--find', 'swiftc']]]) await run(cmd, args, directory, 15000);
      await status('preparing', `Downloading verified release ${request.release.version}…`);
      const bytes = await measure('download', () => download(request.release.url, { signal: controller.signal, limit: 128 * 1024 * 1024, timeout: 120000 }));
      verifyArtifact(bytes, request.release);
      await writeFile(path.join(directory, 'release.tgz'), bytes, { mode: 0o600 });
      await measure('extract', () => run('python3', ['-B', path.join(directory, 'update-transaction.py'), 'extract', directory]));
      const source = path.join(directory, 'unpacked/package'), electron = path.join(source, 'integrations/electron');
      if (await installedVersion(source) !== request.release.version || await installedVersion(electron) !== request.release.version) throw new Error('Release app and runtime versions do not match. Nothing was installed.');
      // A supported next release must carry its updater too.
      try { for (const file of ['update-worker.mjs', 'update-transaction.py', 'update-control.mjs', 'update-inline.mjs', 'update-cli.mjs', 'package-lock.json']) await readFile(path.join(electron, file)); }
      catch { throw new Error('This release lacks the desktop updater build resources. Nothing was installed. Check again after a compatible release is published.'); }
      await run(request.node, [path.join(source, 'dist/cli.js'), '--version'], source, 20000);
      await status('preparing', 'Building the Mac app for this Mac… You can keep editing.');
      await measure('dependencies', () => run('npm', ['ci', '--include=dev', '--prefer-offline', '--no-audit', '--no-fund'], electron));
      await measure('build', () => run(request.node, ['install.mjs', '--output', path.join(directory, 'built')], electron));
      await status('ready', 'Ready to restart. All open editor tabs must save before installation. You can restart later.');
    } else await status('ready', 'Recovery is ready. Restart to restore the previous installation safely.');

    const readyDeadline = Date.now() + 24 * 60 * 60 * 1000;
    while (true) {
      if (controller.signal.aborted) throw new Error('Update preparation canceled. Your installation is unchanged.');
      if (Date.now() > readyDeadline) throw new Error('Prepared update expired after 24 hours. Check again to prepare a fresh update.');
      if (await readFile(path.join(directory, 'proceed'), 'utf8').catch(() => '') === 'install') {
        marks.applyAuthorized = Date.now();
        await saveTimings();
        await atomicJSON(path.join(directory, 'ack.json'), { pid: process.pid, expires: Date.now() + 45000 });
        // Once authorized, parent exit is expected; a crash without proceed never installs.
        stopped = true; clearInterval(monitor);
        const end = Date.now() + 45000;
        while (request.entrypoint !== 'cli' && alive(request.parentPid) && Date.now() < end) {
          if (await readFile(path.join(directory, 'cancel'), 'utf8').catch(() => '') === 'cancel') throw new Error('Restart canceled. Nothing was replaced.');
          await delay(100);
        }
        if (request.entrypoint !== 'cli' && alive(request.parentPid)) throw new Error('The app did not finish closing. Nothing was replaced.');
        if (await readFile(path.join(directory, 'cancel'), 'utf8').catch(() => '') === 'cancel') throw new Error('Restart canceled. Nothing was replaced.');
        break;
      }
      await delay(200);
    }
    await status('updating', recovering ? 'Restoring the previous installation…' : 'Verifying local service readiness…');
    if (recovering) await run('python3', ['-B', path.join(directory, 'update-transaction.py'), 'rollback', directory]);
    else {
      if (request.updateCLI) {
        const current = await cliPolicy(request.home);
        if (current.kind !== 'managed' || current.manifestHash !== request.cli.manifestHash || current.shimHash !== request.cli.shimHash) throw new Error('CLI ownership or configuration changed. Nothing was installed.');
      }
      await measure('staged-readiness', async () => {
        const stagedHost = await startDesktopHost(await bundledHost(path.join(directory, 'built/jumpyBrain.app/Contents/Resources')), { readinessOnly: true });
        await stagedHost.stop();
      });
      await status('updating', 'Installing the prepared app and CLI. Previous versions are retained for recovery…');
      await measure('publish', () => run('python3', ['-B', path.join(directory, 'update-transaction.py'), 'publish', directory]));
      published = true;
      const expected = request.release.version;
      if (await installedVersion(path.join(request.appPath, 'Contents/Resources/runtime')) !== expected
        || (request.updateCLI && await installedVersion(path.join(root, 'app')) !== expected)) throw new Error('Installed component versions do not match. Restoring the previous installation.');
      if (request.updateCLI) await run(request.node, [path.join(root, 'app/dist/cli.js'), '--version'], directory, 20000);
      await measure('installed-readiness', async () => {
        const installedHost = await startDesktopHost(await bundledHost(path.join(request.appPath, 'Contents/Resources')), { readinessOnly: true });
        await installedHost.stop();
      });
    }
    await status('updating', 'Reopening jumpyBrain and checking its local service…');
    const launchInstance = randomUUID();
    await atomicJSON(path.join(directory, 'launch.json'), { instance: launchInstance, pid: process.pid });
    launched = spawn(path.join(request.appPath, 'Contents/MacOS/jumpyBrain'), ['--background'], { env: { ...env, JUMPYBRAIN_UPDATE_INSTANCE: launchInstance }, detached: true, stdio: 'ignore' });
    let launchError = null; launched.on('error', error => { launchError = error; });
    const config = await bundledHost(path.join(request.appPath, 'Contents/Resources'));
    const key = await readControlKey(config.supportDirectory);
    const deadline = Date.now() + 45000; let ready = false;
    while (Date.now() < deadline && !launchError && launched.exitCode === null) {
      try { const value = await probeCompanion(config.origin, key); if (value.hostInstance === launchInstance) { ready = true; break; } } catch {}
      await delay(200);
    }
    if (!ready) throw new Error('Relaunch did not become ready. Previous components will be restored; open jumpyBrain again after recovery.');
    // Only show the editor after its specific new host has authenticated.
    await run('/usr/bin/open', [request.appPath], directory, 15000);
    launched.unref();
    if (published) {
      const journal = await readJSON(path.join(directory, 'transaction.json'));
      await atomicJSON(path.join(directory, 'transaction.json'), { ...journal, phase: 'success' });
    }
    await status(recovering ? 'recovered' : 'success', recovering ? 'Previous installation restored and reopened.' : (request.updateCLI ? 'App, bundled runtime, and managed CLI updated and reopened.' : 'App and bundled runtime updated and reopened. The CLI was left unchanged as requested.'));
  } catch (error) {
    if (launched && launched.exitCode === null) {
      launched.kill('SIGTERM');
      await Promise.race([new Promise(resolve => launched.once('exit', resolve)), delay(15000)]);
      if (launched.exitCode === null && launched.signalCode === null) launched.kill('SIGKILL');
      await delay(2500); // Owned native/gateway watchdogs release their locks.
    }
    let recoveryError = null;
    try {
      const journal = await readJSON(path.join(directory, 'transaction.json')).catch(() => null);
      if (journal && !['success', 'rolled-back'].includes(journal.phase)) await run('python3', ['-B', path.join(directory, 'update-transaction.py'), 'rollback', directory]);
    } catch (failure) { recoveryError = failure; }
    await status('failed', `${error.message}${recoveryError ? ' Automatic recovery failed. Keep the update folder and use Recover in Updates.' : published ? ' Previous components restored. Open jumpyBrain again.' : ''}`);
    output('\n' + error.message);
    if (stopped) {
      // Arguments are data, never interpolated into AppleScript. Failure to
      // display a notification cannot change the durable installation outcome.
      if (notifyFailure) await notifyFailure(error.message);
      else {
      const alert = spawn('/usr/bin/osascript', ['-e', 'on run argv\ndisplay alert "jumpyBrain update needs attention" message (item 1 of argv) buttons {"OK"} default button "OK"\nend run',
        `${error.message}\nOpen jumpyBrain → Updates to inspect status or recover.\nPrivate log: ${path.join(directory, 'update.log')}`], { env, detached: true, stdio: 'ignore' });
      alert.on('error', () => {}); alert.unref();
      }
    }
  } finally {
    clearInterval(monitor);
    await writeFile(path.join(directory, 'update.log'), log, { mode: 0o600 });
    const journal = await readJSON(path.join(directory, 'transaction.json')).catch(() => null);
    // Retain the lock for an incomplete journal. GUI recovery owns that lock.
    if (!journal || ['success', 'rolled-back'].includes(journal.phase)) {
      const owner = await readJSON(path.join(lock, 'desktop.json')).catch(() => null);
      if (owner?.directory === directory && owner.pid === process.pid) await rm(lock, { recursive: true });
    }
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await runWorker(path.resolve(process.argv[2]), { recovering: process.argv[3] === '--recover' }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
