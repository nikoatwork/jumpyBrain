import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { desktopRepairInstructions, desktopStartupMessage } from '../integrations/electron/setup.mjs';
import { requestDesktopUpdate, serveDesktopUpdates } from '../integrations/electron/update-control.mjs';

test('actual startup repair uses public guidance without exposing raw filesystem errors', () => {
  const message = desktopStartupMessage(Object.assign(new Error('ENOENT: private /Users/example/secret/native-helper'), { code: 'ENOENT' }));
  assert.ok(message.includes(desktopRepairInstructions));
  assert.match(message, /existing brain.*\.jumpybrain\/app.*public source setup/);
  assert.doesNotMatch(message, /ENOENT|\/Users\/example|private Git/);
  assert.match(desktopStartupMessage(new Error('Another jumpyBrain service is using this port. Quit the older app before opening jumpyBrain.')), /Quit the older app/);
});

test('overlong update socket paths fail actionably before filesystem mutation', async t => {
  const base = await mkdtemp(path.join(os.tmpdir(), 'jb-long-update-path-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const home = path.join(base, 'long-home-'.repeat(12));
  const check = error => {
    assert.equal(error.code, 'ERR_DESKTOP_UPDATE_SOCKET_PATH');
    assert.match(desktopStartupMessage(error), /path is too long.*notes have not been changed/);
    assert.doesNotMatch(error.message, new RegExp(base));
    return true;
  };
  await assert.rejects(serveDesktopUpdates(home, { action() { assert.fail('no updater action'); } }), check);
  await assert.rejects(requestDesktopUpdate(home, 'status'), check);
  assert.equal(existsSync(home), false);
});

test('a host whose recorded Node no longer loads gets the installer repair, not desktop:setup', async t => {
  const { EventEmitter } = await import('node:events');
  const { mkdir, writeFile } = await import('node:fs/promises');
  const { startDesktopHost } = await import('../integrations/electron/desktop-host.mjs');
  const { desktopNodeRepairInstructions } = await import('../integrations/electron/setup.mjs');
  const base = await mkdtemp(path.join(os.tmpdir(), 'jb-node-startup-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const supportDirectory = path.join(base, 'support'); await mkdir(supportDirectory, { mode: 0o700 });
  await writeFile(path.join(supportDirectory, 'api-key'), 'a'.repeat(64), { mode: 0o600 });
  const host = path.join(base, 'native/jumpyBrain Host.app/Contents');
  await mkdir(path.join(host, 'Resources'), { recursive: true });
  // Homebrew upgrade shape: the versioned path exists, but dyld refuses it.
  const broken = path.join(base, 'Cellar/node/26.8.1/bin/node'); await mkdir(path.dirname(broken), { recursive: true });
  await writeFile(broken, '#!/bin/sh\necho "dyld: Library not loaded: libsimdjson.33.dylib" >&2\nkill -ABRT $$\n', { mode: 0o755 });
  const config = { supportDirectory, executable: path.join(host, 'MacOS/jumpyBrain'), origin: 'http://127.0.0.1:3787' };
  const start = () => startDesktopHost(config, { deadlineMs: 2000,
    spawnHost: () => { const child = new EventEmitter(); child.kill = () => {}; setTimeout(() => child.emit('exit', 1, null), 20); return child; },
    probe: async () => { throw Object.assign(new Error('refused'), { code: 'ECONNREFUSED' }); } });
  for (const [node, expected] of [[broken, 'ERR_DESKTOP_NODE_UNAVAILABLE'], [process.execPath, undefined]]) {
    await writeFile(path.join(host, 'Resources/Configuration.json'), JSON.stringify({ node }));
    const error = await start().then(() => assert.fail('the host must not start'), error => error);
    assert.equal(error.code, expected);
    const message = desktopStartupMessage(error);
    if (expected) {
      assert.equal(message, desktopNodeRepairInstructions);
      assert.match(message, /no longer starts.*Homebrew.*notes are unchanged.*install\.sh \| bash -s -- --with-app/);
      assert.doesNotMatch(message, /desktop:setup|Cellar|\/Users\//);
    } else assert.ok(message.includes(desktopRepairInstructions), 'other startup failures keep the existing guidance');
  }
});
