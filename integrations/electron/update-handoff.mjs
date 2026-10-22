// Copied outside the running bundle before shutdown; never replace a live app.
import { spawn } from 'node:child_process';
import { readFile, writeFile, realpath, unlink, rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export function alive(pid) {
  try { process.kill(pid, 0); return true; } catch (error) { if (error.code === 'ESRCH') return false; throw error; }
}
export async function awaitShutdown(request, { isAlive = alive, timeoutMs = 120000, pollMs = 100 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { await readFile(path.join(request.stage, 'cancelled')); throw new Error('Update restart cancelled.'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    let authorized = false;
    try { authorized = await readFile(path.join(request.stage, 'proceed'), 'utf8') === 'restart\n'; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (authorized && !isAlive(request.parentPid)) return;
    await sleep(pollMs);
  }
  throw new Error('The app did not finish its authorized shutdown.');
}
export async function prepareRestart(prepared, { node, home, parentPid = process.pid, launch = spawn } = {}) {
  const request = { ...prepared, parentPid, home, node };
  for (const name of ['ready', 'proceed', 'cancelled']) await unlink(path.join(prepared.stage, name)).catch((error) => { if (error.code !== 'ENOENT') throw error; });
  const runner = path.join(prepared.stage, 'update-handoff.mjs');
  // readFile supports Electron's ASAR virtual filesystem; external Node needs a real file.
  await writeFile(runner, await readFile(new URL('./update-handoff.mjs', import.meta.url)), { mode: 0o600 });
  const requestPath = path.join(prepared.stage, 'restart.json');
  await writeFile(requestPath, JSON.stringify(request), { mode: 0o600 });
  const child = launch(node, [runner, requestPath], { detached: true, stdio: 'ignore',
    env: { HOME: home, PATH: `${path.dirname(node)}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin`, LANG: 'en_US.UTF-8' } });
  let failed = false;
  child.once('error', () => { failed = true; });
  child.once('exit', () => { failed = true; });
  const ended = new Promise((resolve) => { child.once('exit', resolve); child.once('error', resolve); });
  child.unref();
  const cancel = async () => {
    await writeFile(path.join(prepared.stage, 'cancelled'), 'cancelled\n', { mode: 0o600 });
    // Wait for this owned child before another attempt can reuse handoff markers.
    child.ref();
    try {
      if (!failed) child.kill('SIGTERM');
      await ended;
    } finally { child.unref(); }
  };
  try {
    const deadline = Date.now() + 5000;
    while (!failed && Date.now() < deadline) {
      try {
        const ready = JSON.parse(await readFile(path.join(prepared.stage, 'ready'), 'utf8'));
        if (ready.pid === child.pid && alive(child.pid)) return {
          cancel,
          commit: async () => {
            if (failed || !alive(child.pid)) throw new Error('The update helper stopped. Try restarting again.');
            await writeFile(path.join(prepared.stage, 'proceed'), 'restart\n', { mode: 0o600 });
          },
        };
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
      await sleep(50);
    }
    throw new Error('Could not start the update helper.');
  } catch (error) { await cancel(); throw error; }
}
function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'ignore' });
    const timer = setTimeout(() => child.kill('SIGKILL'), 120000);
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('close', (code) => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error('Update installation failed.')); });
  });
}
export async function installAfterExit(request, { wait = awaitShutdown, execute = run } = {}) {
  await wait(request);
  await execute('/usr/bin/python3', ['-B', request.installer, 'install', '--bundle', request.bundle, '--home', request.home]);
  await execute('/usr/bin/open', [path.join(request.home, 'Applications/jumpyBrain.app')]);
}
if (path.basename(process.argv[1] || '') === 'update-handoff.mjs' && import.meta.url === pathToFileURL(await realpath(process.argv[1])).href) {
  const request = JSON.parse(await readFile(process.argv[2], 'utf8'));
  await writeFile(path.join(request.stage, 'ready'), JSON.stringify({ pid: process.pid }), { mode: 0o600 });
  try {
    await installAfterExit(request);
    await rm(request.stage, { recursive: true, force: true });
  } catch {
    // Never show dialogs for a cancelled restart while the original app is alive.
    if (!alive(request.parentPid)) {
      await writeFile(path.join(request.stage, 'failed'), 'Update did not complete. Rerun desktop setup to repair the installation.\n', { mode: 0o600 });
      await run('/usr/bin/osascript', ['-e', 'display alert "jumpyBrain update could not finish" message "Your notes are unchanged. Reopen jumpyBrain and retry, or run desktop setup to repair the app." as warning']).catch(() => {});
    }
    process.exitCode = 1;
  }
}
