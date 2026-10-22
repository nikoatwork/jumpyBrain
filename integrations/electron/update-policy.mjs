import path from 'node:path';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { SOURCE } from './update-release.mjs';

export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export const alive = pid => { if (!Number.isSafeInteger(pid) || pid <= 1) return false; try { process.kill(pid, 0); return true; } catch (error) { if (error.code === 'ESRCH') return false; throw error; } };
export const overlaps = (a, b) => { const r = path.relative(a, b); return r === '' || (!r.startsWith('../') && r !== '..' && !path.isAbsolute(r)); };
export async function readJSON(file) { const bytes = await readFile(file); if (bytes.length > 128 * 1024) throw new Error('Installation metadata exceeds its size limit.'); return JSON.parse(bytes.toString('utf8')); }
export async function regular(file, { directory = false } = {}) {
  const s = await lstat(file);
  if ((directory ? !s.isDirectory() : !s.isFile() || s.nlink !== 1) || s.uid !== process.getuid()) throw new Error('Update paths must be ordinary files/directories owned by your user. Repair the installation.');
  return s;
}
export async function cliPolicy(home) {
  const root = path.join(home, '.jumpybrain'), app = path.join(root, 'app'), shim = path.join(root, 'bin/jumpybrain');
  let manifest, bytes;
  try {
    await regular(root, { directory: true });
    if ((await regular(path.join(root, 'install-manifest.json'))).size > 65536) throw new Error('Manifest too large');
    bytes = await readFile(path.join(root, 'install-manifest.json'));
    manifest = JSON.parse(bytes);
  } catch (error) {
    return { kind: error.code === 'ENOENT' ? 'missing' : 'unmanaged', version: await installedVersion(app),
      detail: error.code === 'ENOENT' ? 'No managed CLI was found. Update the Mac app only; a CLI will not be created.' : 'The CLI ownership record is invalid. Update the Mac app only; the CLI will be left unchanged.' };
  }
  const paths = { installRoot: root, appDir: app, binDir: path.join(root, 'bin'), cliPath: shim };
  if (manifest.installer !== 'jumpybrain-installer' || manifest.version !== 1
    || !['global', 'project'].includes(manifest.scope) || !['auto', 'all', 'none'].includes(manifest.integrationMode)
    || Object.entries(paths).some(([key, value]) => manifest[key] !== value)
    || (manifest.cliConfigPath && manifest.cliConfigPath !== path.join(root, 'cli-config.json'))) {
    return { kind: 'unmanaged', version: await installedVersion(app), detail: 'The CLI has custom ownership or paths. Update the Mac app only; the CLI will be left unchanged.' };
  }
  const base = { version: await installedVersion(app), manifestHash: digest(bytes) };
  if (manifest.source !== SOURCE) return { ...base, kind: 'custom', detail: 'The CLI uses a custom/development source. Update the Mac app only to preserve that source.' };
  if (manifest.ref != null && !['master', 'refs/heads/master'].includes(manifest.ref)) return { ...base, kind: 'pinned', detail: 'The CLI is pinned to a specific ref. Update the Mac app only to preserve that pin.' };
  try {
    await regular(app, { directory: true }); await regular(paths.binDir, { directory: true }); await regular(shim);
    if (await realpath(root) !== root) throw new Error('Linked root');
    const shimBytes = await readFile(shim);
    // Recognize the exact managed shim, never overwrite or follow a foreign executable.
    const quotedConfig = `'${path.join(root, 'cli-config.json').replaceAll("'", "'\\''")}'`;
    const expected = `#!/usr/bin/env sh\nif [ -z "\${JUMPYBRAIN_CLI_CONFIG+x}" ]; then\n  export JUMPYBRAIN_CLI_CONFIG=${quotedConfig}\nfi\nexec node ${JSON.stringify(path.join(app, 'dist/cli.js'))} "$@"\n`;
    if (shimBytes.toString() !== expected) throw new Error('Custom shim');
    const protectedPaths = [manifest.memoryRoot, manifest.cliConfigPath, ...(manifest.integrations || []).map(i => i.path)].filter(Boolean);
    for (const p of protectedPaths) {
      const resolved = await realpath(p).catch(() => p);
      if (!path.isAbsolute(p) || overlaps(app, p) || overlaps(p, app) || overlaps(app, resolved) || overlaps(resolved, app)) throw new Error('Preserved data overlaps CLI');
    }
    return { ...base, kind: 'managed', shimHash: digest(shimBytes), detail: 'The managed CLI will update with the Mac app. Its source policy, memory, targets, and integrations are preserved.' };
  } catch {
    return { ...base, kind: 'unmanaged', detail: 'The CLI files are customized or overlap preserved data. Update the Mac app only; the CLI will be left unchanged.' };
  }
}
export async function installedVersion(root) { try { return (await readJSON(path.join(root, 'package.json'))).version || null; } catch { return null; } }
