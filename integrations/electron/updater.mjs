import path from 'node:path';
import os from 'node:os';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, readFile, writeFile, rm, readdir, realpath } from 'node:fs/promises';
import { discoverRelease, compareVersions } from './update-release.mjs';
import { cliPolicy, readJSON, regular, installedVersion, alive, overlaps } from './update-policy.mjs';
import { atomicJSON } from './update-worker.mjs';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const execute = promisify(execFile);
const files = ['update-worker.mjs', 'update-release.mjs', 'update-policy.mjs', 'update-transaction.py', 'desktop-host.mjs', 'host.mjs'];
export function needsUpdate(version, installed) {
  if (compareVersions(version, installed.app) < 0 || compareVersions(version, installed.runtime) < 0) return false;
  return compareVersions(version, installed.app) > 0 || compareVersions(version, installed.runtime) > 0
    || (installed.cliPolicy.kind === 'managed' && compareVersions(version, installed.cli) > 0);
}

export function createDesktopUpdater({ resources, appVersion, home = os.homedir(), discover = discoverRelease, onRestart, spawnWorker = spawn, entrypoint = 'app' }) {
  const appPath = path.join(home, 'Applications/jumpyBrain.app');
  const root = path.join(home, '.jumpybrain');
  const updates = path.join(home, 'Library/Application Support/jumpyBrain Updates');
  let state = { phase: 'idle', detail: 'Check for a published jumpyBrain release.' }, release, directory, busy = null;
  let restart = false, restartError = null;
  async function installed() {
    const cli = await cliPolicy(home);
    // A closed-app CLI transaction outlives the exchange: its constructor's
    // appVersion describes the old bundle, so re-read the actual installed one.
    const app = entrypoint === 'cli'
      ? (await execute('/usr/bin/plutil', ['-extract', 'CFBundleShortVersionString', 'raw', '-o', '-', path.join(appPath, 'Contents/Info.plist')], { timeout: 10000 })).stdout.trim()
      : appVersion || await installedVersion(path.join(resources, 'runtime'));
    return { app, runtime: await installedVersion(path.join(resources, 'runtime')), cli: cli.version, cliPolicy: cli };
  }
  async function latest() {
    if (directory) return;
    const owner = await readJSON(path.join(root, '.installer-lock/desktop.json')).catch(() => null);
    if (owner && path.dirname(owner.directory || '') === updates && /^update-[\w-]+$/.test(path.basename(owner.directory))) {
      directory = owner.directory; return;
    }
    const entries = await readdir(updates).catch(() => []);
    const candidates = [];
    for (const name of entries.filter(n => /^update-[\w-]+$/.test(n))) {
      const dir = path.join(updates, name);
      const value = await readJSON(path.join(dir, 'state.json')).catch(() => null);
      if (value) candidates.push({ dir, value });
    }
    candidates.sort((a, b) => b.value.updatedAt - a.value.updatedAt);
    if (candidates[0]) directory = candidates[0].dir;
  }
  async function snapshot() {
    await latest();
    if (directory) {
      const value = await readJSON(path.join(directory, 'state.json')).catch(() => null);
      if (value && ((['preparing','ready','updating'].includes(value.phase) && alive(value.pid)) || (value.updatedAt > (state.updatedAt || 0) && !['checking', 'available', 'current'].includes(state.phase)))) {
        state = value;
      }
      const owner = await readJSON(path.join(root, '.installer-lock/desktop.json')).catch(() => null);
      if ((state.pid && !alive(state.pid)) || (owner?.directory === directory && !alive(owner.pid))) {
          const journal = await readJSON(path.join(directory, 'transaction.json')).catch(() => null);
          const recovery = journal && !['success', 'rolled-back'].includes(journal.phase);
          if (journal?.phase === 'success' && state.phase === 'updating') state = { ...state, phase: 'success', detail: 'The update was verified before the helper stopped. Installed versions are shown below.' };
          else if (recovery || ['preparing', 'ready', 'updating'].includes(state.phase)) state = { ...state, phase: 'failed', recovery: !!recovery, detail: 'The updater was interrupted. Retry preparation, or Recover if replacement had started. Your previous installation is retained.' };
      }
      if (!release && state.phase !== 'checking') release = (await readJSON(path.join(directory, 'request.json')).catch(() => null))?.release;
    }
    const versions = await installed();
    const canPrepare = !!release && ['available', 'failed'].includes(state.phase) && !state.recovery;
    const working = ['checking', 'preparing', 'updating'].includes(state.phase);
    const actions = [
      ...(!working && state.phase !== 'ready' && !state.recovery ? ['check'] : []),
      ...(canPrepare ? [versions.cliPolicy.kind === 'managed' ? 'update' : 'app-only'] : []),
      ...(['preparing', 'ready'].includes(state.phase) ? ['cancel'] : []),
      ...(state.phase === 'ready' ? ['restart'] : []),
      ...(state.recovery ? ['recover'] : []),
      ...(directory ? ['log'] : []),
    ];
    return { ...state, restartError, installed: versions, available: release?.version || state.version || null, notes: release?.notes || '', logAvailable: !!directory,
      canPrepare, canRecover: !!state.recovery, actions };
  }
  async function check() {
    const current = await snapshot();
    if (['preparing', 'ready', 'updating'].includes(current.phase) || current.canRecover) return current;
    state = { phase: 'checking', detail: 'Checking public releases, including beta releases…' };
    release = null;
    try {
      release = await discover();
      const versions = await installed();
      const newer = needsUpdate(release.version, versions);
      state = { phase: newer ? 'available' : 'current', detail: newer ? 'A published release is available.' : 'The app is up to date with published releases.' };
    } catch (error) { state = { phase: 'failed', detail: error.message, updatedAt: Date.now() }; }
    return snapshot();
  }
  async function launch(recovering, appOnly) {
    if (process.platform !== 'darwin') throw new Error('GUI updates require macOS 13 or later.');
    if (path.resolve(resources) !== path.join(appPath, 'Contents/Resources')) throw new Error('This app is running from a development/custom location. Install it in your personal Applications folder before using GUI updates.');
    await regular(appPath, { directory: true });
    if (await realpath(appPath) !== appPath) throw new Error('GUI updates require an unlinked app in your personal Applications folder.');
    const versions = await installed();
    if (!recovering && (!release || !needsUpdate(release.version, versions))) throw new Error('Check for a newer published release first.');
    if (!recovering && versions.cliPolicy.kind === 'managed' && compareVersions(versions.cli, release.version) > 0) throw new Error('Your managed CLI is newer than this release. Wait for a matching published release; the GUI will not downgrade it.');
    if (!recovering && versions.cliPolicy.kind !== 'managed' && !appOnly) throw new Error('Choose “Update app only” to preserve the missing/custom/pinned CLI.');
    if (versions.cliPolicy.kind === 'managed' && appOnly) throw new Error('A supported managed CLI updates together with the app.');
    await mkdir(updates, { recursive: true, mode: 0o700 });
    const stat = await regular(updates, { directory: true });
    if (stat.mode & 0o077) throw new Error('The Updates folder must be private to your user. Repair its permissions before updating.');
    await mkdir(root, { recursive: true }); await regular(root, { directory: true });
    const lock = path.join(root, '.installer-lock');
    let acquired = false;
    try {
      try { await mkdir(lock, { mode: 0o700 }); acquired = true; }
      catch (error) {
        if (error.code !== 'EEXIST') throw error;
        await regular(lock, { directory: true });
        const owner = await readJSON(path.join(lock, 'desktop.json')).catch(() => null);
        if (!owner || alive(owner.pid) || path.dirname(owner.directory || '') !== updates) throw new Error('Another installer/update holds the installation lock. Wait for it to finish. Unknown locks require installation repair.');
        const child = await readJSON(path.join(owner.directory, 'child.json')).catch(() => null);
        if (child?.pid && alive(child.pid)) throw new Error('A previous build is still running. Wait for it to finish, then retry.');
        const journal = await readJSON(path.join(owner.directory, 'transaction.json')).catch(() => null);
        if (journal && !['success', 'rolled-back'].includes(journal.phase) && !recovering) throw new Error('An interrupted installation needs recovery first.');
        // Claim an abandoned, proven desktop lock without removing/recreating it.
        await mkdir(path.join(lock, 'reclaim'), { mode: 0o700 }); acquired = true;
        if (recovering) directory = owner.directory;
      }
      if (!recovering) directory = await mkdtemp(path.join(updates, 'update-'));
      if (!directory) throw new Error('No update is available to recover.');
      const configFile = path.join(resources, 'native/jumpyBrain Host.app/Contents/Resources/Configuration.json');
      const native = await readJSON(configFile);
      if (!path.isAbsolute(native.node || '') || !path.isAbsolute(native.qmd || '')) throw new Error('Repair the app’s Node/QMD prerequisites before updating.');
      for (const preserved of [native.supportDirectory, native.memoryRoot]) {
        if (!path.isAbsolute(preserved || '') || [appPath, directory].some(p => overlaps(p, preserved) || overlaps(preserved, p))) throw new Error('App data overlaps the update destination. Move the installation before updating.');
      }
      if (!recovering && versions.cliPolicy.kind === 'managed' && [native.node, native.qmd, native.memoryRoot, native.supportDirectory].some(p => overlaps(path.join(root, 'app'), p))) {
        throw new Error('Node, QMD, or app data is stored inside the CLI replacement folder. Move these prerequisites/data outside the CLI installation before updating.');
      }
      const configuration = { ...native, legacyLaunchAgent: native.legacyLaunchAgent ?? native.launchAgent ?? path.join(home, 'Library/LaunchAgents/local.jumpybrain.companion.plist'), label: 'local.jumpybrain.companion', launchAgent: path.join(home, 'Library/LaunchAgents/local.jumpybrain.desktop.plist') };
      let request = recovering ? await readJSON(path.join(directory, 'request.json')) : { home, appPath, node: native.node, release, configuration,
        installed: versions, cli: versions.cliPolicy, updateCLI: versions.cliPolicy.kind === 'managed', entrypoint, preparedAt: new Date().toISOString() };
      // A GUI recovery of an interrupted CLI transaction must use the app's
      // safe shutdown handoff rather than retain the old CLI parent policy.
      request = { ...request, parentPid: process.pid, entrypoint };
      for (const file of files) await writeFile(path.join(directory, file), await readFile(new URL(file, import.meta.url)), { mode: 0o600 });
      for (const name of ['cancel', 'proceed', 'ack.json', 'state.json']) await rm(path.join(directory, name), { force: true });
      await atomicJSON(path.join(directory, 'request.json'), request);
      await atomicJSON(path.join(lock, 'desktop.json'), { directory, pid: process.pid });
      await rm(path.join(lock, 'reclaim'), { recursive: true, force: true });
      const child = spawnWorker(native.node, [path.join(directory, 'update-worker.mjs'), directory, ...(recovering ? ['--recover'] : [])], {
        cwd: directory, detached: true, stdio: 'ignore', env: { HOME: home, PATH: `${path.dirname(native.node)}:/usr/bin:/bin:/usr/sbin:/sbin` },
      });
      await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
      child.unref();
      // Persist the child ownership before returning; duplicate GUI/CLI calls see it.
      await atomicJSON(path.join(lock, 'desktop.json'), { directory, pid: child.pid });
      state = { phase: 'preparing', detail: recovering ? 'Preparing recovery…' : 'Preparing the selected release…', pid: child.pid, updatedAt: Date.now() };
      return snapshot();
    } catch (error) {
      if (acquired) {
        const owner = await readJSON(path.join(lock, 'desktop.json')).catch(() => null);
        const journal = directory && await readJSON(path.join(directory, 'transaction.json')).catch(() => null);
        if ((!journal || ['success','rolled-back'].includes(journal.phase)) && (!owner || owner.pid === process.pid || !alive(owner.pid))) await rm(lock, { recursive: true, force: true });
      }
      throw error;
    }
  }
  async function action(name) {
    if (name === 'status') return snapshot();
    if (busy) return busy;
    busy = (async () => {
      try {
        const current = await snapshot();
        if (name === 'check') return await check();
        if (name === 'update') {
          if (['preparing', 'ready', 'updating'].includes(current.phase) || current.canRecover) return current;
          // Download the release that was offered; a second discovery must not
          // silently select a different target after the user clicked its icon.
          const checked = current.canPrepare ? current : await check();
          if (!checked.canPrepare || checked.installed.cliPolicy.kind !== 'managed') return checked;
          return await launch(false, false);
        }
        if (name === 'prepare' || name === 'app-only') {
          if (['preparing', 'ready', 'updating'].includes(current.phase)) return current;
          return await launch(false, name === 'app-only');
        }
        if (name === 'recover' && current.canRecover) return await launch(true, false);
        if (name === 'cancel' && ['preparing', 'ready'].includes(current.phase)) {
          await writeFile(path.join(directory, 'cancel'), 'cancel', { mode: 0o600 });
          return { ...current, detail: 'Canceling preparation…' };
        }
        if (name === 'restart' && current.phase === 'ready') { restartError = null; restart = true; onRestart?.(); return current; }
        throw new Error('That update action is unavailable. Refresh and try again.');
      } catch (error) { state = { phase: 'failed', detail: error.message, updatedAt: Date.now() }; return { ...state, installed: await installed() }; }
    })().finally(() => { busy = null; });
    return busy;
  }
  async function beforeStop() {
    if (!restart) {
      const current = await snapshot();
      if (['preparing', 'ready'].includes(current.phase)) await writeFile(path.join(directory, 'cancel'), 'cancel', { mode: 0o600 });
      return;
    }
    const current = await snapshot();
    if (current.phase !== 'ready' || !alive(current.pid)) throw new Error('The prepared updater is no longer ready. Check again.');
    await writeFile(path.join(directory, 'proceed'), 'install', { mode: 0o600 });
    const end = Date.now() + 5000;
    while (Date.now() < end) {
      const ack = await readJSON(path.join(directory, 'ack.json')).catch(() => null);
      if (ack && ack.pid === current.pid && ack.expires > Date.now() && alive(ack.pid)) return;
      await pause(50);
    }
    throw new Error('The updater did not acknowledge restart. The app will stay open.');
  }
  async function cancelRestart() {
    const wasRestarting = restart;
    restart = false;
    if (wasRestarting && directory) {
      const proceed = await readFile(path.join(directory, 'proceed')).catch(() => null);
      if (proceed) await writeFile(path.join(directory, 'cancel'), 'cancel', { mode: 0o600 });
    }
  }
  async function blocksStartup(instance) {
    const owner = await readJSON(path.join(root, '.installer-lock/desktop.json')).catch(() => null);
    if (!owner || path.dirname(owner.directory || '') !== updates) return false;
    const journal = await readJSON(path.join(owner.directory, 'transaction.json')).catch(() => null);
    const progress = await readJSON(path.join(owner.directory, 'state.json')).catch(() => null);
    if (journal?.phase === 'success') return false;
    const child = await readJSON(path.join(owner.directory, 'child.json')).catch(() => null);
    if ((!journal || journal.phase === 'rolled-back') && !(progress?.phase === 'updating' && (alive(owner.pid) || alive(child?.pid)))) return false;
    const launch = await readJSON(path.join(owner.directory, 'launch.json')).catch(() => null);
    return !(instance && launch?.instance === instance && launch.pid === owner.pid && alive(owner.pid));
  }
  async function cliPreparationPending() {
    const owner = await readJSON(path.join(root, '.installer-lock/desktop.json')).catch(() => null);
    if (!owner || !alive(owner.pid) || path.dirname(owner.directory || '') !== updates) return false;
    const request = await readJSON(path.join(owner.directory, 'request.json')).catch(() => null);
    const progress = await readJSON(path.join(owner.directory, 'state.json')).catch(() => null);
    // The lock/request are durable before the worker's first progress packet.
    // Fence that launch interval too, so an editor cannot start mid-CLI update.
    return request?.entrypoint === 'cli' && (!progress || ['preparing', 'ready', 'updating'].includes(progress.phase));
  }
  return { action, snapshot, beforeStop, cancelRestart, blocksStartup, cliPreparationPending, reportRestartFailure: async message => { restartError = message; }, logPath: () => directory && path.join(directory, 'update.log') };
}
