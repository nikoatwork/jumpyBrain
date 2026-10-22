// Installed CLI entry into the very same desktop transaction used by the app.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createDesktopUpdater } from './updater.mjs';
import { cliPolicy, regular } from './update-policy.mjs';
import { requestDesktopUpdate } from './update-control.mjs';
const execute = promisify(execFile);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
export async function pairedInstallation({ home, installRoot, source, ref, platform = process.platform }) {
  if (platform !== 'darwin' || installRoot !== path.join(home, '.jumpybrain')) return null;
  const appPath = path.join(home, 'Applications/jumpyBrain.app');
  try { await regular(appPath, { directory: true }); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  const { stdout } = await execute('/usr/bin/plutil', ['-extract', 'CFBundleIdentifier', 'raw', '-o', '-', path.join(appPath, 'Contents/Info.plist')], { timeout: 10000 });
  if (stdout.trim() !== 'local.jumpybrain.desktop') return null; // Legacy companion keeps its existing installer.
  const policy = await cliPolicy(home);
  if (policy.kind !== 'managed' || source !== 'https://github.com/nikoatwork/jumpyBrain.git' || !['master', 'refs/heads/master'].includes(ref)) {
    throw new Error('This Mac app has a custom, pinned, or unowned CLI policy. Update the app with its explicit “Update app only” action; use a separate CLI-only installation for developer source/ref updates. Nothing was changed.');
  }
  const { stdout: version } = await execute('/usr/bin/plutil', ['-extract', 'CFBundleShortVersionString', 'raw', '-o', '-', path.join(appPath, 'Contents/Info.plist')], { timeout: 10000 });
  return { resources: path.join(appPath, 'Contents/Resources'), appVersion: version.trim() };
}
export async function runPairedUpdate({ home, dryRun = false, installation, createUpdater = createDesktopUpdater, request = requestDesktopUpdate, report = console.log }) {
  if (dryRun) {
    report('Paired Mac update preview: one verified published release for the app, bundled runtime and managed CLI.');
    report('If the app is running, prepare in the background and choose Restart there. If closed, install both and verify startup. No files changed.');
    return;
  }
  // An open app owns the worker lifetime and all-tab restart barrier.
  let state = await request(home, 'update');
  const inApp = !!state;
  let updater;
  if (!inApp) {
    const { stdout } = await execute('/bin/ps', ['-axo', 'comm='], { timeout: 10000 });
    const executable = path.resolve(installation.resources, '../MacOS/jumpyBrain');
    if (stdout.split('\n').some(line => line.trim() === executable)) throw new Error('The Mac app is running without the shared updater. Quit it before updating, or bootstrap an older app once with npm run desktop:setup.');
    updater = createUpdater({ ...installation, home, entrypoint: 'cli' });
    state = await updater.action('update');
  }
  const deadline = Date.now() + 30 * 60 * 1000;
  let lastDetail, handedOff = false;
  try {
    while (true) {
      if (state.detail !== lastDetail) { report(state.detail); lastDetail = state.detail; }
      if (state.phase === 'failed') throw new Error(state.detail);
      if (state.phase === 'current') { report('No newer compatible published update is available.'); return state; }
      if (state.canRecover) throw new Error('An interrupted update needs recovery in the Mac app.');
      if (state.phase === 'ready') {
        if (inApp) { report('Prepared; restart needed. Choose Restart in jumpyBrain when ready. The update is not installed yet.'); return state; }
        if (!handedOff) {
          await updater.action('restart');
          await updater.beforeStop();
          handedOff = true;
        }
      }
      if (state.phase === 'success') {
        const target = state.available || state.version;
        if (!target || !state.installed || ['app', 'runtime', 'cli'].some(component => state.installed[component] !== target)) {
          throw new Error('The update helper finished, but installed app/runtime/CLI versions do not agree. Open jumpyBrain for recovery details.');
        }
        report('Update installed and startup verified. App, runtime and CLI are on ' + target + '.');
        return state;
      }
      if (state.phase === 'recovered') return state;
      if (!['checking', 'preparing', 'ready', 'updating'].includes(state.phase)) throw new Error('Update could not start. Open jumpyBrain for update details.');
      if (Date.now() > deadline) throw new Error('Update is still pending. Open jumpyBrain for its status.');
      await pause(250);
      state = inApp ? await request(home, 'status') : await updater.snapshot();
      if (!state) throw new Error('The app closed during preparation. Open jumpyBrain and retry.');
    }
  } catch (error) {
    if (!inApp && updater) await updater.action('cancel');
    throw error;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const options = JSON.parse(process.argv[2]);
  const installation = await pairedInstallation(options);
  if (!installation) throw new Error('The paired Mac installation is no longer available.');
  await runPairedUpdate({ ...options, installation });
}
