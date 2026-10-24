import assert from 'node:assert/strict';
import test from 'node:test';
import { execFile, spawnSync } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, readdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { initializeMemoryRoot, rememberMemory, readMemoryDocument, updateMemoryDocument } from '../dist/runtime/index.js';
import { writeRemoteMemoryNote } from '../dist/app/writing/remote-writer.js';
import { parseArgs } from '../dist/cli/args.js';
import { createRemoteMemoryTransport } from '../dist/adapters/http-client/index.js';
import { startJumpyBrainHttpServer } from '../dist/server/index.js';
import { parseFrontmatter } from '../dist/core/frontmatter.js';
const exec = promisify(execFile);
const invalidDates = ['', null, true, 20240229, [], {}, '2023-02-29', '2024-02-30', '0000-01-01', '2024-13-01', '2024-01-01T00:00:00', '2024-01-01T24:00:00Z', '2024-01-01T00:00:00+24:00', '02/29/2024', 't-1d', '2024-02-29\n', ' 2024-02-29'];
const draft = { type: 'finding', title: 'Backfilled observation', body: 'Evidence remained provisional.' };
async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'jb-evidence-date-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await initializeMemoryRoot(root);
  return root;
}
for (const [name, create] of [['local', rememberMemory], ['hosted writer', writeRemoteMemoryNote]]) {
  test(`${name} preserves declared dates independently of creation time and body metadata`, async t => {
    const root = await fixture(t);
    for (const date of ['2024-02-29', '2099-12-31', '2020-02-29T23:30:00-03:00', '2024-02-29T01:02:03.123456789Z', undefined]) {
      const before = Date.now();
      const saved = await create(root, { ...draft, date, created_at: '1999-01-01', updated_at: '1999-01-01', id: 'forged', body: '---\ndate: 1900-01-01\ncreated_at: 1900-01-01\n---\nOriginal evidence.' });
      const shown = await readMemoryDocument(root, saved.id);
      assert.equal(shown.frontmatter.date, date);
      assert.equal(Object.hasOwn(shown.frontmatter, 'date'), date !== undefined);
      assert.equal(shown.frontmatter.created_at, shown.frontmatter.updated_at);
      assert.ok(Date.parse(shown.frontmatter.created_at) >= before);
      assert.ok(Date.parse(shown.frontmatter.created_at) <= Date.now());
      assert.equal(path.basename(saved.file).slice(0, 10), shown.frontmatter.created_at.slice(0, 10));
      assert.match(shown.content, /date: 1900-01-01/);
      await updateMemoryDocument(root, saved.id, 'Body-only revision', { ifMatch: shown.contentHash });
      const after = await readMemoryDocument(root, saved.id);
      assert.equal(after.frontmatter.date, date);
      assert.equal(after.frontmatter.created_at, shown.frontmatter.created_at);
      assert.equal(after.id, saved.id);
      await assert.rejects(updateMemoryDocument(root, saved.id, 'Stale revision', { ifMatch: shown.contentHash }), { code: 'precondition_failed' });
      await updateMemoryDocument(root, saved.id, '---\ndate: "2024-03-01"\n---\nExplicit correction', { ifMatch: after.contentHash });
      assert.equal((await readMemoryDocument(root, saved.id)).frontmatter.date, '2024-03-01');
    }
    const before = await readdir(path.join(root, 'findings'));
    for (const date of invalidDates) await assert.rejects(create(root, { ...draft, date }), /date must be a real ISO/);
    assert.deepEqual(await readdir(path.join(root, 'findings')), before, 'invalid dates never publish files');
  });
}

test('remember and recipe parse dates strictly before credentials or stdin', () => {
  for (const command of [['remember'], ['run', 'memory:remember']]) {
    for (const flags of [['--date'], ['--date='], ['--date', '2024-02-29', '--date'], ['--date=2024-02-29', '--date', '2024-02-29'], ['--date', '2023-02-29'], ['--date', '2024-01-01T00:00:00'], ['--date', '2024-02-29', '--typo'], ['--date', '2024-02-29', '--json=false']]) {
      assert.throws(() => parseArgs([...command, ...flags]), undefined, JSON.stringify(flags));
    }
    assert.equal(parseArgs([...command, '--date=2024-02-29']).date, '2024-02-29');
    assert.deepEqual(parseArgs([...command, '--tag', 'one', '--tag=two']).tag, ['one', 'two']);
    assert.equal(parseArgs([...command, '--dream', 'false']).dream, 'false');
    const result = spawnSync(process.execPath, ['dist/cli.js', ...command, '--target-url', 'http://127.0.0.1:1', '--title', 'Invalid', '--date', '2023-02-29'], { encoding: 'utf8', input: 'Evidence', env: { ...process.env, JUMPYBRAIN_API_KEY: '' } });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /date must be a real ISO/);
    assert.doesNotMatch(result.stderr, /API.key is required/i);
  }
});

test('HTTP, client, direct CLI and recipe retain evidence dates and reject malformed payloads', async t => {
  let server;
  t.after(() => server?.close());
  const root = await fixture(t);
  server = await startJumpyBrainHttpServer({ root, apiKeys: ['test-key'], port: 0, autoIndex: false });
  const remote = createRemoteMemoryTransport({ url: server.url, apiKey: 'test-key' });
  const date = '2024-03-01T01:30:00+02:00';
  const saved = await remote.rememberMemory({ ...draft, date });
  const shown = await remote.readMemoryDocument(saved.id);
  assert.equal(shown.frontmatter.date, date);
  await remote.updateMemoryDocument(saved.id, 'Updated remote evidence', { ifMatch: shown.contentHash });
  assert.equal((await remote.readMemoryDocument(saved.id)).frontmatter.date, date);
  const endpoint = server.url + '/memories/all/notes';
  const headers = { Authorization: 'Bearer test-key', 'Content-Type': 'application/json', 'Idempotency-Key': 'evidence-date-replay' };
  const body = JSON.stringify({ ...draft, date: '2024-02-29' });
  const first = await (await fetch(endpoint, { method: 'POST', headers, body })).json();
  const replay = await (await fetch(endpoint, { method: 'POST', headers, body })).json();
  assert.equal(first.id, replay.id);
  assert.equal((await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify({ ...draft, date: '2024-03-01' }) })).status, 409);
  const before = await readdir(path.join(root, 'findings'));
  for (const [i, invalid] of invalidDates.entries()) {
    const response = await fetch(endpoint, { method: 'POST', headers: { ...headers, 'Idempotency-Key': 'invalid-' + i }, body: JSON.stringify({ ...draft, date: invalid }) });
    assert.equal(response.status, 422, JSON.stringify(invalid));
    const error = await response.text();
    assert.doesNotMatch(error, new RegExp(root));
    assert.match(error, /date must be a real ISO/);
  }
  assert.deepEqual(await readdir(path.join(root, 'findings')), before);
  let calls = 0;
  const guarded = createRemoteMemoryTransport({ url: server.url, apiKey: 'test-key', fetchImpl: async () => { calls++; throw new Error('unexpected request'); } });
  for (const date of invalidDates) await assert.rejects(guarded.rememberMemory({ ...draft, date }), /date must be a real ISO/);
  assert.equal(calls, 0);
  for (const command of [['remember'], ['run', 'memory:remember']]) {
    for (const target of [['--root', root], ['--target-url', server.url]]) {
      // execFile does not provide stdin input: spawn the CLI via a short child wrapper.
      const script = `const {spawn}=require('node:child_process');const p=spawn(process.execPath,JSON.parse(process.argv[1]),{stdio:['pipe','inherit','inherit']});p.stdin.end('Historical evidence.');p.on('exit',c=>process.exitCode=c);`;
      const { stdout } = await exec(process.execPath, ['-e', script, JSON.stringify(['dist/cli.js', ...command, ...target, '--title', 'CLI history', '--date', date, '--json'])], {
        env: { ...process.env, HOME: root, JUMPYBRAIN_API_KEY: 'test-key', JUMPYBRAIN_QMD_BIN: path.join(root, 'missing-qmd') }, timeout: 20000,
      });
      const result = JSON.parse(stdout);
      const metadata = parseFrontmatter(await readFile(path.join(root, result.file), 'utf8')).frontmatter;
      assert.equal(metadata.date, date);
      assert.equal(result.saved, true);
    }
  }
});
