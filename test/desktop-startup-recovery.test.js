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
