import assert from 'node:assert/strict';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from '../dist/cli/args.js';
import { initializeMemoryRoot } from '../dist/runtime/index.js';
import { boardStatus } from '../dist/runtime/boards.js';
import { startCompanionGateway } from '../integrations/macos-companion/gateway.mjs';

const execute = promisify(execFile), repo = path.resolve('.'), key = 'b'.repeat(64);
const page = n => `mem_00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const cli = (args, env = {}) => execute(process.execPath, [path.join(repo, 'dist/cli.js'), 'board', ...args], {
  env: { ...process.env, JUMPYBRAIN_API_KEY: '', ...env }, maxBuffer: 1024 * 1024,
});
async function fixture(t, overrides = {}) {
  const temporary = await realpath(await mkdtemp(path.join(os.tmpdir(), 'jb-board-cli-')));
  const support = path.join(temporary, 'support'), root = path.join(temporary, 'memory');
  await mkdir(support, { mode: 0o700 }); await initializeMemoryRoot(root);
  await writeFile(path.join(support, 'api-key'), key, { mode: 0o600 });
  const content = `---\nid: ${page(1)}\ntype: note\ntitle: Venue shortlist\ncreated_at: 2026-10-30T10:00:00Z\n---\n# Venue shortlist\nStatus: researching; no venue booked.\n- [ ] Confirm guest capacity and accessibility.\n- [ ] Compare written quotes.\n`;
  await writeFile(path.join(root, 'notes/venue.md'), content);
  const gateway = await startCompanionGateway({ runtimeRoot: repo, directory: support, initialRoot: root, port: 0, controlKey: key,
    credentials: { get: async () => 'fixture-key', set: async () => {}, delete: async () => {} }, ...overrides });
  t.after(async () => { await gateway.close(); await rm(temporary, { recursive: true, force: true }); });
  const run = async (...args) => JSON.parse((await cli([...args, '--directory', support, '--json'])).stdout);
  const request = async (route, body, headers = {}) => {
    const response = await fetch(gateway.url + route, { method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + key,
      ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: await response.json() };
  };
  return { temporary, support, root, content, gateway, run, request };
}

test('board namespace strictly validates before credentials, host discovery or file reads', async () => {
  for (const args of [
    ['list', '--root'], ['create', '--target-url='], ['show', '--remote-url', 'https://example.test'],
    ['oops'], ['list', '--json=true'], ['list', '--json', 'false'], ['list', '--json', '--json'],
    ['list', '--file', '/no/access'], ['list', '--directory'], ['delete', '--board', 'x'],
    ['create', '--name', 'x', '--name=y'], ['create', '--name', 'x', '--column', 'one'],
    ['create', '--file', 'x', '--name', 'y'], ['update', '--board', 'x', '--if-match', '1'],
    ['update', '--board', 'x', '--if-match', '1', '--archived', 'maybe'],
    ['delete', '--board', 'x', '--if-match', '-1'], ['delete', '--board', 'x', '--if-match', '1e2'],
    ['add', '--board', 'x', '--if-match', '0', '--page', page(1), '--column', '4'],
    ['remove', '--board', 'x', '--if-match', '0', '--page', '../wrong'],
    ['status', '--board', 'x', '--limit', '51'], ['status', '--board', 'x', '--limit', '0'],
  ]) assert.throws(() => parseArgs(['board', ...args]), undefined, args.join(' '));
  assert.equal(parseArgs(['board', 'status', '--board=Wedding planning', '--limit=12']).board, 'Wedding planning');
  assert.match((await cli(['--help'])).stdout, /board create/);
  await assert.rejects(cli(['list', '--target-url'], { JUMPYBRAIN_CLI_CONFIG: '/no/access' }), error => /desktop-local/.test(error.stderr) && !/API key/.test(error.stderr));
});

test('real gateway CRUD, movement, fresh status evidence and board-only deletion preserve Markdown', async t => {
  const f = await fixture(t);
  assert.deepEqual((await f.run('list')).boards, []);
  const created = await f.run('create', '--name', 'Wedding planning', '--column', 'Ideas', '--column', 'Booking', '--column', 'Confirmed');
  assert.equal(created.revision, 1); assert.equal(created.brain.root, f.root);
  assert.deepEqual(created.board.columns.map(column => column.name), ['Ideas', 'Booking', 'Confirmed']);
  const id = created.board.id;
  let saved = await f.run('add', '--board', id, '--page', page(1), '--column', '1', '--if-match', '1');
  saved = await f.run('add', '--board', 'Wedding planning', '--page', page(1), '--column', '2', '--if-match', String(saved.revision));
  assert.deepEqual(saved.board.columns.map(column => column.pages), [[], [page(1)], []]);
  const status = await f.run('status', '--board', id);
  assert.equal(status.totalCards, 1); assert.equal(status.partial, false);
  const evidence = status.columns[1].cards[0];
  assert.match(evidence.excerpt, /no venue booked/); assert.equal(evidence.title, 'Venue shortlist');
  assert.equal(evidence.startLine, 7); assert.equal(evidence.endLine, 10); assert.match(evidence.contentHash, /^sha256:/);
  assert.equal(evidence.writtenAt, '2026-10-30T10:00:00Z'); assert.equal(evidence.updatedAt, null);
  assert.equal(f.content.split('\n').slice(evidence.startLine - 1, evidence.endLine).join('\n'), evidence.excerpt);
  const printed = await cli(['status', '--board', id, '--directory', f.support]);
  assert.match(printed.stdout, /Booking \(1\)/); assert.match(printed.stdout, /notes\/venue.md:7-10/);
  const revisedContent = f.content.replace('researching; no venue booked.', 'waiting for written quotes.');
  await writeFile(path.join(f.root, 'notes/venue.md'), revisedContent);
  assert.match((await f.run('status', '--board', id)).columns[1].cards[0].excerpt, /waiting for written quotes/);
  saved = await f.run('update', '--board', id, '--if-match', String(saved.revision), '--name', 'Our wedding', '--archived', 'true');
  assert.equal(saved.board.archived, true);
  assert.equal((await f.run('list')).boards[0].name, 'Our wedding');
  saved = await f.run('update', '--board', id, '--if-match', String(saved.revision), '--archived', 'false');
  saved = await f.run('remove', '--board', id, '--page', page(1), '--if-match', String(saved.revision));
  assert.deepEqual(saved.board.columns[1].pages, []);
  const removed = await f.run('delete', '--board', id, '--if-match', String(saved.revision));
  assert.equal(removed.notesPreserved, true); assert.equal(removed.deleted, true);
  assert.deepEqual((await f.run('list')).boards, []);
  assert.equal(await readFile(path.join(f.root, 'notes/venue.md'), 'utf8'), revisedContent);
});

test('JSON layout import, duplicate names, bounded and missing evidence, corrupt input and stale revisions', async t => {
  const f = await fixture(t), file = path.join(f.temporary, 'board.json');
  const definition = { name: 'Wedding', columns: [{ name: 'Plan', pages: [page(1), page(2)] }, { name: 'Arrange', pages: [] }, { name: 'Ready', pages: [] }] };
  await writeFile(file, JSON.stringify(definition));
  const created = await f.run('create', '--file', file);
  const bounded = await f.run('status', '--board', created.board.id, '--limit', '1');
  assert.equal(bounded.omittedCards, 1); assert.equal(bounded.partial, true);
  const missing = await f.run('status', '--board', created.board.id);
  assert.equal(missing.unavailableCards, 1); assert.equal(missing.columns[0].cards[1].availability, 'missing');
  await f.run('create', '--name', 'Wedding');
  await assert.rejects(f.run('show', '--board', 'Wedding'), error => /ambiguous/.test(error.stderr));
  await assert.rejects(f.run('delete', '--board', created.board.id, '--if-match', '1'), error => /Boards changed/.test(error.stderr));
  const before = await readFile(path.join(f.support, 'collections.json'), 'utf8');
  for (const invalid of ['{bad', JSON.stringify({ ...definition, id: 'injected' }), JSON.stringify({ ...definition, columns: [{name:'one',pages:[]}] }), JSON.stringify({ ...definition, columns: definition.columns.map(c=>({...c,pages:[page(1)]})) })]) {
    await writeFile(file, invalid); await assert.rejects(f.run('create', '--file', file));
    assert.equal(await readFile(path.join(f.support, 'collections.json'), 'utf8'), before);
  }
  await writeFile(file, JSON.stringify({ ...definition, name: 'Revised wedding', archived: true }));
  const revised = await f.run('update', '--board', created.board.id, '--if-match', '2', '--file', file);
  assert.equal(revised.board.name, 'Revised wedding'); assert.equal(revised.board.archived, true);
  const concurrent = await Promise.allSettled([
    f.run('update', '--board', created.board.id, '--if-match', '3', '--name', 'A'),
    f.run('update', '--board', created.board.id, '--if-match', '3', '--name', 'B'),
  ]);
  assert.equal(concurrent.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal((await f.run('list')).revision, 4);
});

test('native collection requests fence supplied generation and profile; remote board mutations remain local', async t => {
  const f = await fixture(t, { fetchImpl: async () => { throw new Error('offline'); } });
  const initial = f.gateway.state();
  assert.equal((await f.request('/companion/collections', undefined, { 'X-Companion-Generation': String(initial.generation - 1) })).status, 409);
  assert.equal((await f.request('/companion/collections', {revision:0,boards:[]}, { 'X-Companion-Generation': String(initial.generation - 1) })).status, 409);
  assert.equal((await f.request('/companion/collections', undefined, { 'X-Collection-Brain': 'wrong' })).status, 409);
  await assert.rejects(f.run('create', '--name', 'Wrong brain', '--brain', 'wrong'), error => /not selected/.test(error.stderr));
  await f.run('create', '--name', 'Local');
  const added = await f.request('/companion/profiles', { revision: initial.revision, profile: { name: 'Shared', kind: 'remote', url: 'https://offline.invalid', key: 'fixture', allowWrites: false } });
  assert.equal(added.status, 200);
  const remote = added.body.profiles.find(profile => profile.kind === 'remote');
  assert.equal((await f.request('/companion/switch', { id: remote.id })).status, 200);
  assert.deepEqual((await f.run('list')).boards, []);
  const created = await f.run('create', '--name', 'Remote personal board');
  const withCard = await f.run('add', '--board', created.board.id, '--page', page(1), '--column', '1', '--if-match', String(created.revision));
  const status = await f.run('status', '--board', withCard.board.id);
  assert.equal(status.columns[0].cards[0].availability, 'unavailable'); assert.equal(status.partial, true);
  await f.request('/companion/switch', { id: initial.active.id });
  assert.deepEqual((await f.run('list')).boards.map(board => board.name), ['Local']);
  assert.equal(await readFile(path.join(f.root, 'notes/venue.md'), 'utf8'), f.content);
});

test('status preserves whole lines and uncertainty and refuses auth/scope failures', async () => {
  const board = { id: 'x', name: 'Planning', archived: false, columns: [{name:'Ideas',pages:[page(1)]},{name:'Waiting',pages:[]},{name:'Booked',pages:[]}] };
  const result = await boardStatus(board, async id => ({ id, title: 'Budget', file: 'notes/budget.md', contentHash: 'sha256:' + 'a'.repeat(64), content: 'x'.repeat(1001) + '\nnot confirmed\n' }));
  assert.equal(result.columns[0].cards[0].excerpt, ''); assert.equal(result.columns[0].cards[0].startLine, null);
  assert.equal(result.truncatedCards, 1); assert.equal(result.partial, true);
  for (const status of [401, 403, 409]) await assert.rejects(boardStatus(board, async () => { throw Object.assign(new Error('rejected'), { status }); }), /rejected/);
});

test('closed host guidance does not create collections or initialize a brain', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'jb-no-board-host-'));
  t.after(() => rm(directory, {recursive:true,force:true}));
  await assert.rejects(cli(['create', '--name', 'Wedding', '--directory', directory]), error => /Open the jumpyBrain Mac app/.test(error.stderr));
  await assert.rejects(readFile(path.join(directory, 'collections.json')));
});

test('status refuses a layout edited while card evidence is being read', async t => {
  let f, changed = false;
  f = await fixture(t, { fetchImpl: async (url, options) => {
    const response = await fetch(url, options);
    if (url.includes('/documents/') && !changed) {
      changed = true;
      const packet = (await f.request('/companion/collections')).body;
      packet.boards[0].name = 'Changed during read';
      assert.equal((await f.request('/companion/collections', packet)).status, 200);
    }
    return response;
  } });
  const created = await f.run('create', '--name', 'Wedding');
  await f.run('add', '--board', created.board.id, '--page', page(1), '--column', '1', '--if-match', '1');
  await assert.rejects(f.run('status', '--board', created.board.id), error => /changed during status/.test(error.stderr) && error.stdout === '');
  assert.equal((await f.run('show', '--board', created.board.id)).board.name, 'Changed during read');
});

test('older app without board CLI capability fails before reading or writing collections', async t => {
  const { createServer } = await import('node:http');
  const support = await realpath(await mkdtemp(path.join(os.tmpdir(), 'jb-old-board-host-')));
  let calls = 0;
  const server = createServer((request, response) => {
    calls++;
    assert.equal(request.url, '/companion/state');
    assert.equal(request.headers.authorization, 'Bearer ' + key);
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ generation: 1, active: { id: 'old-brain' } }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await rm(support, {recursive:true,force:true}); });
  await writeFile(path.join(support, 'api-key'), key, {mode:0o600});
  await writeFile(path.join(support, 'extensions-control.json'), JSON.stringify({ version:1, directory:support, origin:`http://127.0.0.1:${server.address().port}`, pid:process.pid }), {mode:0o600});
  await assert.rejects(cli(['create', '--name', 'Wedding', '--directory', support]), error => /Update the app and CLI together/.test(error.stderr));
  assert.equal(calls, 1);
});
