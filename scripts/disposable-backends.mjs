// Stop the root backends a smoke started inside its own disposable directory,
// before that directory is removed or retained for inspection. Only owners
// registered under the directory are contacted, through their authenticated
// drain; never a process-name, port or PID-only kill. Not a standalone check.
import { lstat, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = fileURLToPath(new URL('..', import.meta.url));
const skipped = new Set(['node_modules', '.git', 'engines', 'models']);

/** Memory roots with a backend registration below `directory` (bounded walk, no symlinks). */
export async function registeredRoots(directory, depth = 6) {
  const roots = [];
  const walk = async (dir, level) => {
    let entries;
    try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
    if (entries.some(entry => entry.isDirectory() && entry.name === '.jumpybrain')) {
      try { if ((await lstat(path.join(dir, '.jumpybrain/backend/owner.json'))).isFile()) roots.push(dir); } catch {}
    }
    if (level >= depth) return;
    for (const entry of entries) {
      if (!entry.isDirectory() || skipped.has(entry.name) || entry.name.endsWith('.app')) continue;
      await walk(path.join(dir, entry.name), level + 1);
    }
  };
  await walk(path.resolve(directory), 0);
  return roots;
}

/**
 * Drain every registered backend below `directory`. Never throws: cleanup must
 * not mask the smoke's own result. Returns per-root outcomes for reporting.
 * Stop hosts that could restart a backend (desktop app, gateway) first.
 */
export async function stopDisposableBackends(directory, { runtime = repo, timeoutMs = 15000 } = {}) {
  let stopRootBackend;
  try { ({ stopRootBackend } = await import(pathToFileURL(path.join(runtime, 'dist/app/backend-host/index.js')).href)); }
  catch (error) { return [{ directory, error: 'backend-host module unavailable: ' + error.message }]; }
  const results = [];
  for (const root of await registeredRoots(directory)) {
    try { results.push({ root, ...await stopRootBackend(root, { timeoutMs }) }); }
    catch (error) { results.push({ root, error: error.code || error.message }); }
  }
  for (const result of results) if (result.error) console.error(`Disposable backend at ${result.root ?? result.directory} was not stopped: ${result.error}`);
  return results;
}

/** Wait (bounded) for processes this smoke signalled, so they cannot restart a backend. */
export async function waitForExit(pids, timeoutMs = 10000) {
  const alive = pid => { try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; } };
  const end = Date.now() + timeoutMs;
  while (pids.some(alive) && Date.now() < end) await new Promise(resolve => setTimeout(resolve, 50));
  return !pids.some(alive);
}
