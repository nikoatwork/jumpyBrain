import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { initializeMemoryRoot, rememberMemory, readMemoryDocument, listMemoryAttention } from '../dist/runtime/index.js';
import { startJumpyBrainHttpServer } from '../dist/server/index.js';
import { stopRootBackend } from '../dist/app/backend-host/index.js';
import { AccessStore } from '../dist/adapters/access-control/index.js';
import { parseArgs } from '../dist/cli/args.js';
import { isReadInvocation } from '../dist/cli/remote-access-policy.js';
const exec = promisify(execFile);
const cli = async (args, env = {}) => JSON.parse((await exec(process.execPath, ['dist/cli.js', 'attention', ...args, '--json'], { env: { ...process.env, ...env } })).stdout);

test('attention rejects malformed mutations before target lookup and classifies protected writes', () => {
  for (const args of [['list', '--id', 'bad'], ['settle', '--id', 'bad'], ['snooze'], ['list', '--json=false'], ['list', '--root', 'x', '--root', 'y']])
    assert.throws(() => parseArgs(['attention', ...args]));
  assert.equal(isReadInvocation(parseArgs(['attention', 'list'])), true);
  assert.equal(isReadInvocation({ _: ['attention', 'settle'] }), false);
});

test('local and hosted CLI attention share canonical state, stale guards and actor declarations', { timeout: 30000 }, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'jumpy-attention-cli-'));
  let server;
  try {
    await initializeMemoryRoot(root);
    const saved = await rememberMemory(root, { type: 'note', title: 'A resurfacing note', body: 'Keep my body', actor: { kind: 'agent', name: 'Fixture' } });
    const args = ['--root', root];
    const before = await cli(['list', ...args]);
    assert.equal(before.notes[0].creator.name, 'Fixture');
    assert.equal(before.omittedNotes, 0);
    let note = await readMemoryDocument(root, saved.id);
    await cli(['settle', ...args, '--id', saved.id, '--if-match', note.contentHash]);
    assert.equal((await listMemoryAttention(root)).notes.length, 0);
    await assert.rejects(() => cli(['bring-back', ...args, '--id', saved.id, '--if-match', note.contentHash]));
    note = await readMemoryDocument(root, saved.id);
    await cli(['bring-back', ...args, '--id', saved.id, '--if-match', note.contentHash]);
    const access = new AccessStore(root);
    const reader = await access.issue({ name: 'Fixture reader', role: 'reader' }); access.close();
    server = await startJumpyBrainHttpServer({ root, apiKeys: ['fixture-key'], port: 0, autoIndex: false });
    const remote = ['--target-url', server.url], env = { JUMPYBRAIN_API_KEY: 'fixture-key' };
    const listed = await cli(['list', ...remote], env);
    assert.deepEqual(listed.notes, (await listMemoryAttention(root)).notes);
    note = await readMemoryDocument(root, saved.id);
    await cli(['snooze', ...remote, '--id', saved.id, '--if-match', note.contentHash, '--until', '2099-01-01T12:00:00Z'], env);
    assert.equal((await listMemoryAttention(root)).notes.length, 0);
    assert.match((await readMemoryDocument(root, saved.id)).content, /Keep my body/);
    await cli(['list', ...remote], { JUMPYBRAIN_API_KEY: reader.token });
    note = await readMemoryDocument(root, saved.id);
    await assert.rejects(() => cli(['settle', ...remote, '--id', saved.id, '--if-match', note.contentHash], { JUMPYBRAIN_API_KEY: reader.token }), /reader access/i);
    assert.equal((await readMemoryDocument(root, saved.id)).contentHash, note.contentHash);
  } finally { await server?.close(); await stopRootBackend(root).catch(() => {}); await rm(root, { recursive: true, force: true }); }
});
