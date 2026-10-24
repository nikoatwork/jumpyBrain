import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { desktopPrerequisites } from '../scripts/desktop-prerequisites.mjs';

test('Desktop preflight reports all missing requirements together and rejects old versions', () => {
  const calls = [];
  const missing = desktopPrerequisites({ platform: 'darwin', nodeVersion: '22.11.0', probe: (command) => {
    calls.push(command);
    return { status: 0, stdout: { sw_vers: '12.7', git: '', npm: '', python3: 'Python 3.8.20', xcrun: '' }[command] };
  } });
  assert.match(missing.join('\n'), /Node 22.12.*macOS 13.*Python 3.9.*Xcode/s);
  assert.deepEqual(calls, ['sw_vers', 'git', 'npm', 'python3', 'xcrun']);
  const failed = desktopPrerequisites({ platform: 'darwin', nodeVersion: '26.7.0', probe: () => ({ status: 1 }) });
  for (const name of ['macOS', 'Git', 'npm', 'Python', 'Xcode']) assert.ok(failed.some(line => line.includes(name)));
});

test('production Desktop --check never installs and presents a concise combined error', { skip: process.platform !== 'darwin' }, async t => {
  const base = await mkdtemp(path.join(os.tmpdir(), 'jb-desktop-preflight-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const tools = path.join(base, 'tools'), home = path.join(base, 'home'); await mkdir(tools);
  const script = fileURLToPath(new URL('../scripts/setup-desktop.mjs', import.meta.url));
  const run = args => spawnSync(process.execPath, [script, ...args], { env: { ...process.env, HOME: home, PATH: tools }, encoding: 'utf8' });
  const failed = run(['--check']);
  assert.equal(failed.status, 1);
  for (const name of ['macOS', 'Git', 'npm', 'Python', 'Xcode']) assert.match(failed.stderr, new RegExp(name));
  assert.doesNotMatch(failed.stderr, /at file:|node:internal/);
  const replies = { sw_vers: '15.7.7', git: 'git version 2.43.0', npm: '11.19.0', python3: 'Python 3.14.7', xcrun: '/fixture/swiftc' };
  for (const [command, reply] of Object.entries(replies)) await writeFile(path.join(tools, command), `#!/bin/sh\nprintf '%s\\n' '${reply}'\n`, { mode: 0o755 });
  const ready = run(['--check']);
  assert.equal(ready.status, 0, ready.stderr);
  assert.match(ready.stdout, /No installation or settings changes/);
  assert.equal(existsSync(home), false);
});
