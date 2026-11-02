// Only the authorized installer/update flow calls this; never scans for integrations.
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, readFile, rename, unlink } from 'node:fs/promises';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

export function renderIntegration(content, { memoryRoot, cliPath, asset }) {
  const shell = value => "'" + value.replaceAll("'", "'\\''") + "'";
  return asset === 'skill' ? content
    .replaceAll('__JUMPYBRAIN_CLI_COMMAND__', () => shell(cliPath))
    .replaceAll('__JUMPYBRAIN_ROOT_ARGUMENT__', () => shell(memoryRoot))
    .replaceAll('__JUMPYBRAIN_MEMORY_ROOT__', () => memoryRoot)
    .replaceAll('__JUMPYBRAIN_CLI__', () => cliPath)
    : content.replaceAll('__JUMPYBRAIN_MEMORY_ROOT__', () => JSON.stringify(memoryRoot).slice(1, -1))
      .replaceAll('__JUMPYBRAIN_CLI__', () => JSON.stringify(cliPath).slice(1, -1));
}

export async function refreshManagedIntegrations(manifest, { home, dryRun = false } = {}) {
  const results = [], hashes = { ...manifest.integrationHashes };
  const targets = {
    codex: ['.agents/skills/jumpybrain-memory/SKILL.md', 'skills/jumpybrain-memory/SKILL.md'],
    claude: ['.claude/skills/jumpybrain-memory/SKILL.md', 'skills/jumpybrain-memory/SKILL.md'],
    pi: ['.pi/agent/extensions/jumpybrain-memory.ts', 'integrations/pi/jumpybrain-memory.ts'],
  };
  for (const item of (manifest.integrations || []).slice(0, 3)) {
    const target = targets[item.kind];
    // Project installs need their recorded owner; unknown legacy destinations stay untouched.
    const base = manifest.scope === 'global' ? home : manifest.projectRoot;
    const relative = manifest.scope === 'project' && item.kind === 'pi' ? '.pi/extensions/jumpybrain-memory.ts' : target?.[0];
    const result = { path: item.path, status: 'untracked' }; results.push(result);
    if (!target || !base || item.path !== path.join(base, relative)) continue;
    try {
      // Reject linked ancestors too: a valid-looking leaf must not redirect writes.
      for (let parent = path.dirname(item.path); parent !== path.dirname(base); parent = path.dirname(parent)) {
        const info = await lstat(parent); if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== process.getuid()) throw new Error();
      }
      const file = await open(item.path, constants.O_RDWR | constants.O_NOFOLLOW);
      try {
        const info = await file.stat();
        if (!info.isFile() || info.nlink !== 1 || info.uid !== process.getuid() || info.size > 131072) throw new Error();
        const current = await file.readFile(), hash = digest(current);
        const desired = Buffer.from(renderIntegration(await readFile(path.join(manifest.appDir, target[1]), 'utf8'), {
          memoryRoot: manifest.memoryRoot, cliPath: manifest.cliPath, asset: item.kind === 'pi' ? 'pi-extension' : 'skill',
        }));
        if (hash === digest(desired)) { hashes[item.path] = hash; result.status = 'current'; }
        else if (hashes[item.path] !== hash) result.status = hashes[item.path] ? 'customized' : 'untracked';
        else {
          result.status = 'refreshed';
          if (!dryRun) {
            // Publish a complete file; recheck the installed generation before rename.
            const temporary = item.path + '.' + randomUUID() + '.tmp';
            const candidate = await open(temporary, 'wx', info.mode & 0o777);
            try {
              await candidate.writeFile(desired); await candidate.sync();
              const latest = await lstat(item.path);
              if (latest.ino !== info.ino || latest.dev !== info.dev) throw new Error();
              if (digest(await readFile(item.path)) !== hash) throw new Error();
              await rename(temporary, item.path);
            } finally { await candidate.close(); await unlink(temporary).catch(() => {}); }
            hashes[item.path] = digest(desired);
          }
        }
      } finally { await file.close(); }
    } catch (error) { result.status = error.code === 'ENOENT' ? 'missing' : 'unsafe'; }
  }
  return { results, hashes };
}
