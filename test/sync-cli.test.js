import assert from 'node:assert/strict';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readFile, rm, readdir, utimes } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { initializeMemoryRoot } from '../dist/runtime/index.js';
import { startJumpyBrainHttpServer } from '../dist/server/index.js';
import { parseArgs } from '../dist/cli/args.js';
import { compareInventories, planRemoteMigration } from '../dist/core/sync/compare.js';

const execute = promisify(execFile), cliPath = path.resolve('dist/cli.js');
const id = () => 'mem_' + randomUUID();
const note = (memId, title, body, updatedAt) => `---\n${memId ? `id: "${memId}"\n` : ''}title: "${title}"\n${updatedAt ? `updated_at: "${updatedAt}"\n` : ''}---\n${body}`;
const scene = label => ({ type: 'excalidraw', version: 2, source: 'test', appState: {}, files: {}, elements: [{ id: 't', type: 'text', text: label }] });

test('diff and migrate remote parsing needs both brains and one write mode', () => {
  for (const argv of [['diff'], ['diff', '--root', 'a'], ['diff', '--target-url', 'http://x'], ['diff', '--root', 'a', '--target-url', 'http://x', '--apply'],
    ['migrate', 'remote', '--root', 'a', '--target-url', 'http://x', '--apply', '--dry-run'], ['migrate', 'remote', '--root', 'a'],
    ['diff', '--root', 'a', '--target-url', 'http://x', '--remote-url', 'http://y'], ['diff', '--root', 'a', '--target-url', 'http://x', 'extra'],
    ['migrate', 'remote', '--root', 'a', '--target-url', 'http://x', '--all']]) assert.throws(() => parseArgs(argv), undefined, argv.join(' '));
  assert.equal(parseArgs(['migrate', 'remote', '--root', 'a', '--target-url', 'http://x', '--apply']).apply, true);
  assert.throws(() => parseArgs(['migrate', 'logseq', '--source', 'a', '--root', 'b', '--target-url', 'http://x']), /local-only/);
});

test('comparison policy: ID beats path, metadata-only is not a difference, unordered changes are never pushed', () => {
  const a = id(), b = id();
  const report = compareInventories(
    { notes: [
      { id: a, file: 'notes/moved-here.md', contentHash: 'h1', bodyHash: 'b1', updatedAt: '2026-11-19T10:00:00Z' },
      { id: null, file: 'notes/plain.md', contentHash: 'h2', bodyHash: 'b2' },
      { id: b, file: 'notes/taken.md', contentHash: 'h3', bodyHash: 'b3' },
    ], drawings: [] },
    { notes: [
      { id: a, file: 'notes/original.md', contentHash: 'h9', bodyHash: 'b9', updatedAt: '2026-11-18T10:00:00Z' },
      { id: null, file: 'notes/plain.md', contentHash: 'h8', bodyHash: 'b2' },
      { id: id(), file: 'notes/taken.md', contentHash: 'h7', bodyHash: 'b7' },
    ], drawings: [] });
  const byFile = Object.fromEntries(report.items.map(item => [(item.local ?? item.remote).file, item]));
  assert.equal(byFile['notes/moved-here.md'].status, 'local-newer'); assert.equal(byFile['notes/moved-here.md'].moved, true);
  assert.equal(byFile['notes/plain.md'].status, 'metadata');
  assert.equal(byFile['notes/taken.md'].status, 'local-only', 'a different ID at the same path is not the same note');
  const plan = planRemoteMigration(report);
  assert.deepEqual(plan.actions.map(action => action.action), ['update-note']);
  assert.equal(plan.actions[0].file, 'notes/original.md', 'updates keep the server path');
  assert.ok(plan.skipped.some(skip => skip.item === 'notes/taken.md' && /already has a different note/.test(skip.reason)));
});

test('diff and migrate remote against a real server: plan, guarded apply, re-diff, read-only origin', { timeout: 60000 }, async t => {
  const base = await mkdtemp(path.join(os.tmpdir(), 'jb-sync-cli-'));
  const local = path.join(base, 'local'), remote = path.join(base, 'remote');
  await initializeMemoryRoot(local); await initializeMemoryRoot(remote);
  const server = await startJumpyBrainHttpServer({ root: remote, apiKeys: ['sync-fixture-key'], host: '127.0.0.1', port: 0, autoIndex: false });
  t.after(async () => { await server.close(); await rm(base, { recursive: true, force: true }); });
  const env = { ...process.env, JUMPYBRAIN_API_KEY: 'sync-fixture-key', JUMPYBRAIN_CLI_CONFIG: path.join(base, 'cli-config.json') };
  const cli = (...args) => execute(process.execPath, [cliPath, ...args], { env, maxBuffer: 8 * 1024 * 1024 });
  const both = ['--root', local, '--target-url', server.url];
  const write = async (root, file, content) => { await mkdir(path.dirname(path.join(root, file)), { recursive: true }); await writeFile(path.join(root, file), content); };

  const ids = { same: id(), localOnly: id(), remoteOnly: id(), localNewer: id(), remoteNewer: id(), metadata: id(), unordered: id() };
  const same = note(ids.same, 'Same', 'Shared body\n', '2026-11-01T00:00:00Z');
  await write(local, 'notes/same.md', same); await write(remote, 'notes/same.md', same);
  const localOnly = note(ids.localOnly, 'Local only', 'Only here\r\nwith CRLF\r\n', '2026-11-02T00:00:00Z');
  await write(local, 'notes/team/deep/local-only.md', localOnly);
  await write(remote, 'notes/remote-only.md', note(ids.remoteOnly, 'Remote only', 'Server note\n'));
  const localNewer = note(ids.localNewer, 'Local newer', 'Edited locally\n', '2026-11-19T12:00:00Z');
  await write(local, 'notes/local-newer.md', localNewer); await write(remote, 'notes/local-newer.md', note(ids.localNewer, 'Local newer', 'Old text\n', '2026-11-10T00:00:00Z'));
  await write(local, 'notes/remote-newer.md', note(ids.remoteNewer, 'Remote newer', 'Old local\n', '2026-11-10T00:00:00Z'));
  await write(remote, 'notes/remote-newer.md', note(ids.remoteNewer, 'Remote newer', 'Teammate edit\n', '2026-11-19T12:00:00Z'));
  await write(local, 'notes/metadata.md', note(ids.metadata, 'Metadata', 'Same body\n', '2026-11-11T00:00:00Z'));
  await write(remote, 'notes/metadata.md', note(ids.metadata, 'Metadata', 'Same body\n', '2026-11-12T00:00:00Z'));
  // No declared dates: file times never order notes, whatever they are.
  await write(local, 'notes/unordered.md', note(ids.unordered, 'Unordered', 'Local version\n'));
  await write(remote, 'notes/unordered.md', note(ids.unordered, 'Unordered', 'Remote version\n'));
  await utimes(path.join(local, 'notes/unordered.md'), new Date('2030-01-01'), new Date('2030-01-01'));
  await write(local, 'drawings/Changed.excalidraw', JSON.stringify(scene('Local drawing edit')));
  await write(remote, 'drawings/Changed.excalidraw', JSON.stringify(scene('Remote drawing edit')));
  await write(local, 'notes/no-id.md', '# Plain Markdown without an ID\n');
  await write(local, 'drawings/Architecture.excalidraw', JSON.stringify(scene('Local only drawing')));
  await write(local, 'drawings/Shared.excalidraw', JSON.stringify(scene('Same drawing')));
  await write(remote, 'drawings/Shared.excalidraw', JSON.stringify(scene('Same drawing')));

  const diff = JSON.parse((await cli('diff', ...both, '--json')).stdout);
  const status = Object.fromEntries(diff.items.map(item => [item.kind === 'drawing' ? 'drawing:' + item.name : (item.local ?? item.remote).file, item.status]));
  assert.deepEqual(status, {
    'notes/same.md': 'same', 'notes/team/deep/local-only.md': 'local-only', 'notes/remote-only.md': 'remote-only', 'notes/local-newer.md': 'local-newer',
    'notes/remote-newer.md': 'remote-newer', 'notes/metadata.md': 'metadata', 'notes/unordered.md': 'differs', 'notes/no-id.md': 'local-only',
    'drawing:Architecture': 'local-only', 'drawing:Shared': 'same', 'drawing:Changed': 'differs',
  });
  assert.equal(JSON.stringify(diff).includes('Shared body'), false, 'diff output carries hashes, not bodies');
  const text = (await cli('diff', ...both)).stdout;
  assert.match(text, /Summary: 2 same, 1 same body, metadata differs, 1 local newer, 1 remote newer, 2 both changed, order unknown, 3 local only, 1 remote only/);
  assert.doesNotMatch(text, /notes\/same\.md/); assert.match((await cli('diff', ...both, '--all')).stdout, /notes\/same\.md/);

  const remoteBefore = await readdir(remote, { recursive: true });
  const dry = JSON.parse((await cli('migrate', 'remote', ...both, '--json')).stdout);
  assert.equal(dry.dryRun, true);
  assert.deepEqual(dry.actions.map(action => action.action + ':' + (action.file ?? action.name)).sort(),
    ['create-drawing:Architecture', 'create-note:notes/team/deep/local-only.md', 'update-note:notes/local-newer.md']);
  assert.deepEqual(dry.skipped.map(skip => skip.item).sort(), ['drawings/Changed', 'notes/no-id.md', 'notes/remote-newer.md', 'notes/remote-only.md', 'notes/unordered.md']);
  assert.deepEqual(await readdir(remote, { recursive: true }), remoteBefore, 'a dry run writes nothing');
  assert.match((await cli('migrate', 'remote', ...both, '--dry-run')).stdout, /would\s+copy note notes\/team\/deep\/local-only\.md[\s\S]*Apply: jumpybrain migrate remote/);

  // A device-local read-only origin allows diff and dry run but refuses --apply before any request.
  await writeFile(env.JUMPYBRAIN_CLI_CONFIG, JSON.stringify({ schemaVersion: 1, remoteTargets: [{ origin: new URL(server.url).origin, access: 'read-only' }] }));
  await cli('diff', ...both); await cli('migrate', 'remote', ...both);
  await assert.rejects(cli('migrate', 'remote', ...both, '--apply'), error => /JUMPYBRAIN_REMOTE_TARGET_READ_ONLY/.test(error.stderr));
  await rm(env.JUMPYBRAIN_CLI_CONFIG);

  // A wrong key is explained against the server, not the local root.
  await assert.rejects(execute(process.execPath, [cliPath, 'diff', ...both], { env: { ...env, JUMPYBRAIN_API_KEY: 'wrong' } }), error => /rejected the access key \(HTTP 401/.test(error.stderr));

  const applied = JSON.parse((await cli('migrate', 'remote', ...both, '--apply', '--json')).stdout);
  assert.deepEqual(applied.outcomes.map(outcome => outcome.outcome), ['done', 'done', 'done']);
  assert.equal(await readFile(path.join(remote, 'notes/team/deep/local-only.md'), 'utf8'), localOnly, 'copied byte for byte, CRLF included');
  assert.match(await readFile(path.join(remote, 'notes/local-newer.md'), 'utf8'), /Edited locally/);
  assert.match(await readFile(path.join(remote, 'notes/remote-newer.md'), 'utf8'), /Teammate edit/, 'newer server work untouched');
  assert.match(await readFile(path.join(remote, 'notes/unordered.md'), 'utf8'), /Remote version/);
  assert.equal(JSON.parse(await readFile(path.join(remote, 'drawings/Architecture.excalidraw'), 'utf8')).elements[0].text, 'Local only drawing');
  assert.equal(JSON.parse(await readFile(path.join(remote, 'drawings/Changed.excalidraw'), 'utf8')).elements[0].text, 'Remote drawing edit');

  const after = JSON.parse((await cli('diff', ...both, '--json')).stdout);
  const afterStatus = Object.fromEntries(after.items.map(item => [item.kind === 'drawing' ? 'drawing:' + item.name : (item.local ?? item.remote).file, item.status]));
  assert.equal(afterStatus['notes/team/deep/local-only.md'], 'same');
  assert.equal(afterStatus['notes/local-newer.md'], 'metadata', 'the pushed body matches; the server stamped its own edit metadata');
  assert.equal(afterStatus['drawing:Architecture'], 'same', 'the server pretty-prints the scene; formatting is not a difference');
  const again = JSON.parse((await cli('migrate', 'remote', ...both, '--json')).stdout);
  assert.deepEqual(again.actions, [], 'a second run has nothing left to copy');

  // copy-in is a batch with per-note results: existing paths, used or repeated IDs, unsafe paths and missing IDs are refused individually.
  const http = (body) => fetch(server.url + '/memories/all/files/operations', { method: 'POST', headers: { Authorization: 'Bearer sync-fixture-key', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const goldId = id(), freshId = id();
  // Imported vault notes whose names match an ignored pattern ("gold") are visible in discovery, so they copy too.
  const imported = `---\nid: "${goldId}"\ntype: "note"\nsource: "logseq-migration"\nsource_path: "pages/goldpan.ai.md"\n---\nImported page\n`;
  const batch = await http({ action: 'copy-in', notes: [
    { path: 'notes/same.md', content: note(id(), 'X', 'x\n') },
    { path: 'notes/new-path.md', content: note(ids.same, 'X', 'x\n') },
    { path: '../escape.md', content: note(id(), 'X', 'x\n') },
    { path: 'notes/no-id-copy.md', content: '# no id\n' },
    { path: 'notes/goldpan.ai.md', content: imported },
    { path: 'notes/gold-answers.md', content: note(id(), 'Not imported', 'x\n') },
    { path: 'notes/fresh.md', content: note(freshId, 'Fresh', 'x\n') },
    { path: 'notes/fresh-again.md', content: note(freshId, 'Fresh twice', 'x\n') },
  ] });
  assert.equal(batch.status, 200);
  const packet = await batch.json();
  assert.deepEqual(packet.results.map(result => result.ok ? 'ok' : result.code),
    ['validation_failed', 'duplicate_id', 'validation_failed', 'invalid_id', 'ok', 'validation_failed', 'ok', 'duplicate_id']);
  assert.equal(packet.copied, 2); assert.equal(packet.indexing.status, 'pending');
  assert.equal(await readFile(path.join(remote, 'notes/same.md'), 'utf8'), same, 'an existing file is never replaced');
  assert.equal((await http({ action: 'copy-in', notes: [] })).status, 422);
  assert.equal((await http({ action: 'copy-in', path: 'notes/x.md', content: 'x' })).status, 422, 'only the batch form is accepted');
  const listing = await (await fetch(server.url + '/memories/all/files?hashes=1', { headers: { Authorization: 'Bearer sync-fixture-key' } })).json();
  assert.ok(listing.files.some(file => file.id === goldId), 'the imported copy is listed on the server');
  // Agents guessing X-API-Key are told which header works.
  const guessed = await fetch(server.url + '/memories/all/status', { headers: { 'X-API-Key': 'sync-fixture-key' } });
  assert.equal(guessed.status, 401); assert.match((await guessed.json()).error.message, /Authorization: Bearer <key>/);
});
