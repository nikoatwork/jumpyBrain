import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, stat, rm, writeFile, symlink, link, open, realpath } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { checkDreamSources, readMemoryDocument, updateMemoryDocument } from '../dist/runtime/index.js';
import { pageSourceReferences, checkSourceReference, SOURCE_CHECK_LIMITS } from '../dist/core/dream/source-references.js';
import { hashMemoryDocumentContent, readBoundedCanonicalSource } from '../dist/core/canonical/markdown-store.js';
import { parseArgs } from '../dist/cli/args.js';
import { isReadInvocation } from '../dist/cli/remote-access-policy.js';
import { createRemoteMemoryTransport } from '../dist/adapters/http-client/index.js';
import { startJumpyBrainHttpServer } from '../dist/server/index.js';
import { createDreamHandoff } from '../dist/adapters/http-server/dream-handoff.js';
const ids = [1, 2, 3, 4, 5].map(n => `mem_91000000-0000-4000-8000-${String(n).padStart(12, '0')}`);
const hash = content => `sha256:${createHash('sha256').update(content).digest('hex')}`;
const reference = (id, content) => `[dated evidence](${id} "${hash(content)}")`;
const markdown = (id, body, extra = '') => `---\nid: ${id}\ntype: page\ntitle: ${JSON.stringify(id)}\ncreated_at: 2026-10-01T00:00:00Z\nupdated_at: 2026-10-12T00:00:00Z\n${extra}---\n${body}\n`;
async function fixture(t) {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'living-pages-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  await Promise.all(['pages', 'notes', 'decisions'].map(bucket => mkdir(path.join(root, bucket))));
  const evidence = markdown(ids[0], 'October 12 decision: launch October 27.');
  await writeFile(path.join(root, 'decisions/confirmed.md'), evidence);
  const plan = markdown(ids[3], 'October 1 plan: target October 20.'), proposal = markdown(ids[4], 'October 10 proposal: delay launch; not approved.');
  await writeFile(path.join(root, 'notes/original-plan.md'), plan);
  await writeFile(path.join(root, 'notes/delay-proposal.md'), proposal);
  const body = `# Release plan\n\nSynthesis date: 2026-10-12. Evidence period: October 1–12.\n\nThe confirmed launch is October 27. ${reference(ids[0], evidence)}\n\nThe earlier plan targeted October 20. ${reference(ids[3], plan)} October 10 proposed a delay without approving it. ${reference(ids[4], proposal)}\n\nHuman contribution: customer commitment requires advance notice.\n\n## Latest substantive change\nOctober 12 confirmed October 27, replacing the earlier October 20 plan.\n\n## Open questions\nWho will notify the customer?`;
  await writeFile(path.join(root, 'pages/release.md'), markdown(ids[1], body, 'dream: true\n'));
  return { root, evidence, body };
}
async function served(t, root) {
  const server = await startJumpyBrainHttpServer({ root, apiKeys: ['disposable-living-key'], port: 0, autoIndex: false, logger: { info() {}, warn() {}, error() {}, log() {} } });
  t.after(() => server.close());
  return { ...server, remote: createRemoteMemoryTransport({ url: server.url, apiKey: 'disposable-living-key' }) };
}
function cli(args, input = '', env = {}) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, ['dist/cli.js', ...args], { cwd: process.cwd(), env: { ...process.env, ...env } });
    let stdout = '', stderr = '';
    child.stdout.on('data', x => stdout += x); child.stderr.on('data', x => stderr += x);
    child.on('close', code => resolve({ code, stdout, stderr })); child.stdin.end(input);
  });
}

test('fingerprints remain claim-adjacent, distinct versions never inherit hashes, code/examples are excluded', () => {
  const cite = reference(ids[0], 'version');
  const text = `${cite}\n${reference(ids[0], 'older')}\n[no fingerprint](${ids[0]})\n[external](https://example.com)\n\n\`\`${cite} with \` a single tick\`\`\n\n\`\`\`md\n${cite}\n\`\`\`\`\n\n~~~\n${cite}\n~~~~\n\n    ${cite}\n\n\`\`\`\n${reference(ids[2], 'unclosed')}`;
  const refs = pageSourceReferences(text);
  assert.deepEqual(refs.map(ref => ref.expectedHash), [hash('version'), hash('older'), undefined]);
  assert.ok(refs.every(ref => ref.target === ids[0]));
  assert.deepEqual(pageSourceReferences(`[bracket](<../notes/with space.md> "${hash('v')}")`), [{ kind: 'markdown-link', target: '../notes/with space.md', expectedHash: hash('v') }]);
});

test('version policy reports changed, missing, duplicate IDs and partial uniqueness without guessing', () => {
  const ref = { target: ids[0], kind: 'markdown-link', expectedHash: hash('v1') };
  const doc = { relativePath: 'notes/a.md', frontmatter: { id: ids[0] }, contentHash: hash('v1') };
  assert.equal(checkSourceReference('pages/p.md', ref, [doc], true).status, 'unchanged');
  assert.equal(checkSourceReference('pages/p.md', { ...ref, expectedHash: hash('old') }, [doc], true).status, 'changed');
  assert.equal(checkSourceReference('pages/p.md', ref, [], true).status, 'missing');
  assert.equal(checkSourceReference('pages/p.md', ref, [doc, { ...doc, relativePath: 'notes/b.md' }], true).status, 'ambiguous');
  assert.equal(checkSourceReference('pages/p.md', ref, [doc], false).status, 'not_checked');
  assert.equal(checkSourceReference('pages/p.md', { ...ref, target: '../../../notes/a.md' }, [doc], true).status, 'not_checked');
  assert.equal(checkSourceReference('pages/p.md', { ...ref, target: 'a' }, [doc], true).status, 'not_checked', 'no basename guessing');
  assert.equal(checkSourceReference('pages/p.md', { ...ref, target: '../notes/a.md' }, [doc], true).status, 'unchanged');
});

test('saved and draft checks preserve all page/source bytes and dates and detect changed/missing evidence', async t => {
  const { root, evidence } = await fixture(t);
  const page = path.join(root, 'pages/release.md'), original = await readFile(page), before = await stat(page);
  const packet = await checkDreamSources(root, { id: ids[1] });
  assert.equal(packet.page.contentHash, hash(original)); assert.equal(packet.coverage, 'complete');
  assert.equal(packet.sources[0].status, 'unchanged');
  const draft = await checkDreamSources(root, { content: original.toString(), file: 'pages/release.md' });
  assert.deepEqual(draft.sources, packet.sources);
  await writeFile(path.join(root, 'decisions/confirmed.md'), evidence + '\nNew suggestion, not a decision.');
  assert.equal((await checkDreamSources(root, { id: ids[1] })).sources[0].status, 'changed');
  await rm(path.join(root, 'decisions/confirmed.md'));
  assert.equal((await checkDreamSources(root, { id: ids[1] })).sources[0].status, 'missing');
  assert.deepEqual(await readFile(page), original); assert.equal((await stat(page)).mtimeMs, before.mtimeMs);
});

test('path-only sources stay ID-less; unversioned and empty legacy pages cannot imply checked coverage', async t => {
  const { root } = await fixture(t);
  await writeFile(path.join(root, 'notes/no-id.md'), 'Legacy evidence.');
  const draft = { content: reference('../notes/no-id.md', 'Legacy evidence.'), file: 'pages/release.md' };
  const result = await checkDreamSources(root, draft);
  assert.equal(result.sources[0].status, 'unchanged'); assert.equal(result.sources[0].id, undefined);
  assert.equal(await readFile(path.join(root, 'notes/no-id.md'), 'utf8'), 'Legacy evidence.');
  for (const content of ['', `[old source](${ids[0]})`]) assert.equal((await checkDreamSources(root, { ...draft, content })).coverage, 'partial');
});

test('checker budgets report incomplete coverage, reference omissions, oversized files and ambiguous identities', async t => {
  const { root } = await fixture(t);
  await writeFile(path.join(root, 'notes/duplicate.md'), markdown(ids[0], 'Conflicting identity.'));
  assert.equal((await checkDreamSources(root, { id: ids[1] })).sources[0].status, 'ambiguous');
  await writeFile(path.join(root, 'notes/oversized.md'), 'x'.repeat(SOURCE_CHECK_LIMITS.fileBytes + 1));
  const partial = await checkDreamSources(root, { id: ids[1] });
  assert.equal(partial.coverage, 'partial'); assert.equal(partial.unreadFiles, 1); assert.equal(partial.sources[0].status, 'not_checked');
  const many = await checkDreamSources(root, { content: Array.from({ length: 35 }, (_, n) => reference(`notes/source-${n}.md`, 'v')).join('\n'), file: 'pages/p.md' });
  assert.equal(many.sources.length, 32); assert.equal(many.omittedReferences, 3); assert.equal(many.coverage, 'partial');
  await assert.rejects(checkDreamSources(root, { content: 'x'.repeat(65537), file: 'pages/p.md' }), /64 KiB/);
});

test('bounded canonical reads reject symlink ancestors, symlink files, hardlinks, directories and oversize', async t => {
  const { root } = await fixture(t);
  const absolute = path.join(root, 'decisions/confirmed.md');
  await symlink(absolute, path.join(root, 'notes/symlink.md'));
  await symlink(path.join(root, 'decisions'), path.join(root, 'notes/alias'));
  await link(absolute, path.join(root, 'notes/hardlink.md'));
  for (const file of ['notes/symlink.md', 'notes/alias/confirmed.md', 'notes/hardlink.md', 'notes']) await assert.rejects(readBoundedCanonicalSource(root, path.join(root, file), 10000));
  await assert.rejects(readBoundedCanonicalSource(root, absolute, 1));
  await assert.rejects(readBoundedCanonicalSource(root, path.join(root, '../outside.md'), 10000));
});

test('ordinary Dream checks refuse non-Dream pages and malformed draft/transport inputs', async t => {
  const { root } = await fixture(t);
  await assert.rejects(checkDreamSources(root, { id: ids[0] }), /dream: true/);
  for (const request of [{}, { id: ids[1], content: '' }, { content: '', file: '../outside.md' }, { content: '', file: 'pages/../notes/x.md' }, { content: '', file: 'pages/x.md', root: '/wrong' }, { id: 1 }]) await assert.rejects(checkDreamSources(root, request));
});

test('exact no-op preserves bytes/mtime, but stale human edits still reject and require reconciliation', async t => {
  const { root } = await fixture(t);
  const before = await readMemoryDocument(root, ids[1]), file = path.join(root, before.file), info = await stat(file);
  const noop = await updateMemoryDocument(root, ids[1], before.content, { ifMatch: before.contentHash });
  assert.equal(noop.unchanged, true); assert.equal(noop.newContentHash, before.contentHash);
  assert.equal((await stat(file)).mtimeMs, info.mtimeMs); assert.equal(await readFile(file, 'utf8'), before.content);
  await writeFile(file, before.content + '\nHuman: do not announce until customer agrees.\n');
  await assert.rejects(updateMemoryDocument(root, ids[1], before.content, { ifMatch: before.contentHash }), error => error.code === 'precondition_failed');
  const latest = await readMemoryDocument(root, ids[1]);
  const revised = latest.content.replace('Who will notify the customer?', 'Customer approval remains required; owner of notification is unresolved.');
  await updateMemoryDocument(root, ids[1], revised, { ifMatch: latest.contentHash });
  const after = await readMemoryDocument(root, ids[1]);
  assert.match(after.content, /Human: do not announce until customer agrees/);
  assert.match(after.content, /customer commitment requires advance notice/);
});

test('HTTP and CLI checks match local policy, require auth, never mutate, and no-op hosted update keeps index bookkeeping', async t => {
  const { root } = await fixture(t), { remote, url } = await served(t, root);
  const local = await checkDreamSources(root, { id: ids[1] }), hosted = await remote.checkDreamSources({ id: ids[1] });
  assert.deepEqual(hosted.sources, local.sources); assert.deepEqual(hosted.page, local.page); assert.equal(JSON.stringify(hosted).includes(root), false);
  const endpoint = url + '/memories/all/dream/sources/check';
  assert.equal((await fetch(endpoint, { method: 'POST', body: '{}' })).status, 401);
  const headers = { Authorization: 'Bearer disposable-living-key', 'Content-Type': 'application/json' };
  assert.equal((await fetch(endpoint, { headers })).status, 405);
  assert.equal((await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify({ root }) })).status, 422);
  const page = await remote.readMemoryDocument(ids[1]);
  const noOp = await remote.updateMemoryDocument(ids[1], page.content, { ifMatch: page.contentHash });
  assert.equal(noOp.unchanged, true);
  await assert.rejects(readFile(path.join(root, '.jumpybrain/remote/index-state.json')), { code: 'ENOENT' });
  const localCli = await cli(['dream', '--root', root, '--check-sources', '--id', ids[1], '--json']);
  assert.equal(localCli.code, 0, localCli.stderr); assert.deepEqual(JSON.parse(localCli.stdout).sources, local.sources);
  const remoteCli = await cli(['dream', '--target-url', url, '--check-sources', '--draft', '--page-file', 'pages/release.md', '--json'], page.content, { JUMPYBRAIN_API_KEY: 'disposable-living-key' });
  assert.equal(remoteCli.code, 0, remoteCli.stderr); assert.deepEqual(JSON.parse(remoteCli.stdout).sources, local.sources);
});

test('source check flags are strict read-only invocations; malformed input fails before target credentials', async () => {
  for (const flags of [['--check-sources', '--check-sources'], ['--check-sources=false'], ['--check-sources', '--draft=false'], ['--check-sources', '--id'], ['--check-sources', '--unknown']]) assert.throws(() => parseArgs(['dream', ...flags]));
  assert.equal(isReadInvocation(parseArgs(['dream', '--check-sources', '--id', ids[1]])), true);
  const invalid = await cli(['dream', '--target-url', 'https://unreachable.invalid', '--check-sources', '--id', ids[1], '--draft']);
  assert.notEqual(invalid.code, 0); assert.match(invalid.stderr, /Select one saved Dream page/);
});

test('hosted selection is literal and bounded, with source checks and semantic preservation in the handoff', () => {
  const result = createDreamHandoff('https://brain.example', new Date('2026-10-24T12:00:00Z'), 'Release plan');
  assert.match(result.prompt, /Requested topic.*"Release plan"/); assert.match(result.prompt, /--check-sources --draft/);
  assert.match(result.prompt, /human commitments/); assert.match(result.prompt, /Latest substantive change/);
  assert.throws(() => createDreamHandoff('https://brain.example', new Date(), 'x'.repeat(201)));
  assert.throws(() => createDreamHandoff('https://brain.example', new Date(), 'a\nb'));
  assert.equal(hashMemoryDocumentContent('test'), hash('test'));
});

test('old hosted servers and malformed packets fail without inventing source-check success or falling back', async () => {
  for (const status of [404, 405]) {
    let requests = 0;
    const remote = createRemoteMemoryTransport({ url: 'https://old.invalid', apiKey: 'synthetic', fetchImpl: async () => { requests++; return Response.json({ error: { code: 'not_found', message: 'Unknown route' } }, { status }); } });
    await assert.rejects(remote.checkDreamSources({ id: ids[1] }), /Upgrade.*no check was recorded/);
    assert.equal(requests, 1);
  }
  const malformed = createRemoteMemoryTransport({ url: 'https://old.invalid', apiKey: 'synthetic', fetchImpl: async () => Response.json({}) });
  await assert.rejects(malformed.checkDreamSources({ id: ids[1] }), /unsupported source-check response/);
});

test('file-count and aggregate-byte budgets remain partial rather than treating omitted source identities as missing', async t => {
  const { root } = await fixture(t);
  const draft = { file: 'pages/p.md', content: reference(ids[0], 'unknown') };
  await Promise.all(Array.from({ length: 501 }, (_, n) => writeFile(path.join(root, `notes/tiny-${n}.md`), 'x')));
  const fileLimited = await checkDreamSources(root, draft);
  assert.equal(fileLimited.scannedFiles, 500); assert.equal(fileLimited.unreadFiles, 5);
  assert.equal(fileLimited.sources[0].status, 'not_checked');
  await Promise.all(Array.from({ length: 501 }, (_, n) => rm(path.join(root, `notes/tiny-${n}.md`))));
  await Promise.all(Array.from({ length: 18 }, (_, n) => writeFile(path.join(root, `notes/large-${n}.md`), 'x'.repeat(262144))));
  const byteLimited = await checkDreamSources(root, draft);
  assert.ok(byteLimited.scannedFiles < 20); assert.ok(byteLimited.unreadFiles > 0);
  assert.equal(byteLimited.sources[0].status, 'not_checked'); assert.equal(byteLimited.coverage, 'partial');
});


test('source mutation during a bounded read is detected deterministically rather than publishing a current version result', async t => {
  const { root, evidence } = await fixture(t), file = path.join(root, 'decisions/confirmed.md');
  const handle = await open(file, 'r'), prototype = Object.getPrototypeOf(handle), originalRead = prototype.read;
  await handle.close();
  let injected = false;
  t.mock.method(prototype, 'read', async function (...args) {
    const result = await originalRead.apply(this, args);
    if (!injected) { injected = true; await writeFile(file, evidence + '\nChanged during read.\n'); }
    return result;
  });
  await assert.rejects(readBoundedCanonicalSource(root, file, 10000), /changed during read/);
  assert.equal(injected, true);
});
