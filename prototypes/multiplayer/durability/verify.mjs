// Executable M1 design proof; all writable brains are disposable temporary roots.
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, rm, rename, unlink, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readMemoryDocument, updateMemoryDocument } from '../../../dist/runtime/index.js';
import { mergeMemoryDocumentUpdate } from '../../../dist/core/writing/index.js';
import { parseFrontmatter } from '../../../dist/core/canonical/index.js';
import { DocumentSession, ExternalObserver, contentHash, bodyOf, withBody } from './session.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repository = path.resolve(here, '../../..');
const corpusBytes = await readFile(path.join(here, '../corpus.json'));
const corpus = JSON.parse(corpusBytes);
const initial = corpus.canonical.header + corpus.canonical.body;
const id = corpus.canonical.id;
const timestamp = '2026-11-01T12:00:00.000Z';
const hash = (value) => createHash('sha256').update(value).digest('hex');
const scenarios = [];
const clock = () => performance.now();
const changed = (content, before, after) => {
  assert.ok(content.includes(before), 'fixture range must exist');
  return content.replace(before, after);
};
const until = async (predicate) => {
  const deadline = Date.now() + 5000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('deterministic handshake did not arrive');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
};

async function fixture(operation, { content = initial } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'jumpybrain-m1-durability-'));
  const file = path.join(root, 'notes/fixture.md');
  await mkdir(path.dirname(file));
  await writeFile(file, content);
  try { return await operation({ root, file, initial: content }); }
  finally { await rm(root, { recursive: true, force: true }); }
}
async function scenario(name, operation) {
  const started = clock();
  try {
    const evidence = await operation();
    scenarios.push({ id: name, status: 'passed', durationMs: Math.round((clock() - started) * 1000) / 1000, ...evidence });
    console.error('PASS ' + name);
  } catch (error) {
    scenarios.push({ id: name, status: 'failed', durationMs: Math.round((clock() - started) * 1000) / 1000,
      error: error.stack ?? String(error) });
    console.error('FAIL ' + name + ': ' + error.message);
  }
}
const queue = (session, content, operationId = 'edit') => session.queue({ epoch: session.epoch, baseRevision: session.revision, id: operationId, content });
const exactPublished = (base, proposal) => mergeMemoryDocumentUpdate(base, proposal, { updatedAt: timestamp }).content;
const settle = async (observer, at = 0) => { assert.equal((await observer.poll(at)).status, 'stabilizing'); return observer.poll(at + 20); };

await scenario('D01-receipt-after-canonical-publication', () => fixture(async ({ root, file }) => {
  let entered = false, release;
  const barrier = new Promise((resolve) => { release = resolve; });
  const session = await DocumentSession.open(root, id, { publish: async (...args) => {
    entered = true; await barrier; return updateMemoryDocument(...args);
  } });
  const proposal = changed(initial, 'Human anchor.', 'Human anchor edited.');
  const admitted = queue(session, proposal);
  assert.equal(admitted.saved, false);
  assert.equal(await readFile(file, 'utf8'), initial);
  const flush = session.flush();
  await until(() => entered);
  assert.equal(session.receipts.length, 0);
  assert.throws(() => queue(session, proposal + ' retain this client draft', 'busy'), { code: 'publication_busy' });
  assert.equal(await readFile(file, 'utf8'), initial);
  release();
  const receipt = await flush;
  assert.equal(receipt.saved, true);
  assert.equal(await readFile(file, 'utf8'), exactPublished(initial, proposal));
  assert.equal(receipt.contentHash, contentHash(await readFile(file)));
  return { admittedSaved: admitted.saved, receiptSaved: receipt.saved, receiptMatchesDisk: true, inFlightClientEdit: 'explicit backpressure; caller draft retained' };
}));

await scenario('D02-protected-metadata-and-whole-file-hash', () => fixture(async ({ root, file }) => {
  const session = await DocumentSession.open(root, id);
  const proposal = changed(changed(initial, id, 'mem_77777777-7777-4777-8777-777777777778'), 'source: "manual"', 'source: "spoofed"')
    .replace('2026-01-01T00:00:00.000Z', '2030-01-01T00:00:00.000Z').replace('Human anchor.', 'Human changed.');
  queue(session, proposal);
  const receipt = await session.flush();
  const bytes = await readFile(file);
  const parsed = parseFrontmatter(bytes.toString('utf8'));
  assert.equal(bytes.toString('utf8'), exactPublished(initial, proposal));
  assert.equal(parsed.frontmatter.id, id); assert.equal(parsed.frontmatter.source, 'manual');
  assert.equal(parsed.frontmatter.created_at, '2026-01-01T00:00:00.000Z');
  assert.equal(parsed.frontmatter.custom, 'preserve me');
  assert.equal(parsed.frontmatter.updated_at, timestamp);
  assert.equal(receipt.contentHash, contentHash(bytes));
  return { protectedIdentityPreserved: true, exactCurrentSerializerBytes: true };
}));

await scenario('D03-publisher-failure-keeps-draft-no-saved-receipt', () => fixture(async ({ root, file }) => {
  const session = await DocumentSession.open(root, id, { publish: async () => { throw Object.assign(new Error('Injected storage failure'), { code: 'ENOSPC' }); } });
  const proposal = initial + 'Unpublished text.';
  queue(session, proposal);
  await assert.rejects(session.flush(), { code: 'ENOSPC' });
  assert.equal(await readFile(file, 'utf8'), initial);
  assert.equal(session.pending, proposal); assert.equal(session.receipts.length, 0); assert.equal(session.dirty, true);
  return { diskUnchanged: true, pendingRetained: true, savedReceipts: 0 };
}));

await scenario('D04-legacy-disk-hash-cannot-overwrite-admitted-live-text', () => fixture(async ({ root, file }) => {
  const session = await DocumentSession.open(root, id), baseline = await readMemoryDocument(root, id);
  const proposal = changed(initial, 'Human anchor.', 'Live human edit.');
  queue(session, proposal);
  await assert.rejects(session.legacyReplace({ ifMatch: baseline.contentHash, content: initial + 'Legacy writer.' }), { code: 'live_edits_pending' });
  assert.equal(session.pending, proposal); assert.equal(await readFile(file, 'utf8'), initial);
  await session.flush();
  await assert.rejects(session.legacyReplace({ ifMatch: baseline.contentHash, content: initial + 'Legacy writer.' }), { code: 'precondition_failed' });
  assert.equal(bodyOf(await readFile(file, 'utf8')), bodyOf(proposal));
  return { validDiskHashRejectedDuringLiveEdits: true, staleLegacyWriteRejectedAfterFlush: true };
}));

await scenario('D05-rebuild-from-markdown-epoch-and-recovery-separation', () => fixture(async ({ root, file }) => {
  const session = await DocumentSession.open(root, id);
  queue(session, changed(initial, 'Human anchor.', 'Saved human version.'));
  const receipt = await session.flush();
  const saved = await readFile(file, 'utf8');
  queue(session, saved + 'Private disconnected draft.', 'draft');
  const recovery = await session.preserve('disconnected_client_draft');
  await mkdir(path.join(root, '.jumpybrain/collaboration'), { recursive: true });
  await writeFile(path.join(root, '.jumpybrain/collaboration/state.json'), '{"derived":true}');
  await writeFile(path.join(root, '.jumpybrain/index.json'), '{"derived":true}');
  await rm(path.join(root, '.jumpybrain/collaboration'), { recursive: true });
  await rm(path.join(root, '.jumpybrain/index.json'));
  const reopened = await DocumentSession.open(root, id);
  assert.equal(reopened.baseline.content, saved); assert.equal(contentHash(saved), receipt.contentHash);
  assert.notEqual(reopened.epoch, session.epoch);
  assert.throws(() => reopened.queue({ epoch: session.epoch, baseRevision: 0, id: 'old', content: initial }), { code: 'stale_epoch' });
  assert.equal(await readFile(path.join(recovery, 'pending.md'), 'utf8'), session.pending);
  assert.equal(await readFile(file, 'utf8'), saved);
  return { savedRecoveredWithoutDerivedState: true, staleEpochRejected: true, uniqueDraftSurvivesCacheDeletion: true };
}));

for (const mode of ['in-place', 'atomic-rename']) {
  await scenario('D06-independent-external-' + mode + '-without-watch-event', () => fixture(async ({ root, file }) => {
    const session = await DocumentSession.open(root, id), observer = new ExternalObserver(session);
    queue(session, changed(initial, 'Human anchor.', 'Human independent edit.'));
    const external = changed(initial, 'Agent anchor.', 'Raw external edit.');
    if (mode === 'in-place') await writeFile(file, external);
    else { await writeFile(file + '.swap', external); await rename(file + '.swap', file); }
    const result = await settle(observer);
    assert.equal(result.status, 'merged_pending'); assert.equal(result.saved, false);
    assert.ok(session.pending.includes('Human independent edit.') && session.pending.includes('Raw external edit.'));
    assert.equal(await readFile(file, 'utf8'), external);
    await session.flush();
    const bytes = await readFile(file, 'utf8');
    assert.ok(bytes.includes('Human independent edit.') && bytes.includes('Raw external edit.'));
    assert.equal((await observer.poll(40)).status, 'self_or_unchanged');
    return { exactExternalBeforePublish: true, bothEditsPublished: true, watcherEventsRequired: 0 };
  }));
}

await scenario('D07-overlap-preserves-exact-observed-versions', () => fixture(async ({ root, file }) => {
  const session = await DocumentSession.open(root, id), observer = new ExternalObserver(session);
  const proposal = changed(initial, 'Human anchor.', 'Human live replacement.');
  const external = changed(initial, 'Human anchor.', 'Raw overlapping replacement.');
  queue(session, proposal); await writeFile(file, external);
  const result = await settle(observer);
  assert.equal(result.status, 'conflict'); assert.equal(result.reason, 'external_overlap');
  assert.equal(await readFile(path.join(result.recovery, 'base.md'), 'utf8'), initial);
  assert.equal(await readFile(path.join(result.recovery, 'pending.md'), 'utf8'), proposal);
  assert.equal(await readFile(path.join(result.recovery, 'external.md'), 'utf8'), external);
  assert.equal(await readFile(file, 'utf8'), external);
  await assert.rejects(session.flush(), { code: 'session_blocked' });
  return { observedVersionsByteExact: true, overlapGuessedThrough: false };
}));

await scenario('D08-truncate-then-write-never-hydrates-temporary-empty-file', () => fixture(async ({ root, file }) => {
  const session = await DocumentSession.open(root, id), observer = new ExternalObserver(session);
  await writeFile(file, '');
  assert.equal((await observer.poll(0)).status, 'stabilizing'); assert.equal(session.pending, initial);
  const external = changed(initial, 'Agent anchor.', 'Completed raw write.');
  await writeFile(file, external);
  assert.equal((await observer.poll(10)).status, 'stabilizing');
  assert.equal((await observer.poll(30)).status, 'external_accepted');
  assert.equal(session.pending, external);
  return { temporaryTruncationAccepted: false, completeObservedWriteAccepted: true };
}));

await scenario('D09-intentional-empty-body-is-valid-content', () => fixture(async ({ root, file }) => {
  const session = await DocumentSession.open(root, id), observer = new ExternalObserver(session);
  const empty = withBody(initial, '');
  await writeFile(file, empty);
  assert.equal((await settle(observer)).status, 'external_accepted');
  assert.equal(session.pending, empty); assert.equal(bodyOf(session.pending), '');
  assert.equal(await readFile(file, 'utf8'), empty);
  return { emptyBodyAcceptedWithoutRecreation: true };
}));

await scenario('D10-empty-idless-file-bounds-wait-and-preserves-raw-bytes', () => fixture(async ({ root, file }) => {
  const session = await DocumentSession.open(root, id), observer = new ExternalObserver(session);
  await writeFile(file, '');
  assert.equal((await observer.poll(0)).status, 'stabilizing');
  assert.equal((await observer.poll(20)).status, 'stabilizing');
  const result = await observer.poll(100);
  assert.equal(result.status, 'conflict'); assert.equal(result.reason, 'invalid_identity_or_partial_file');
  assert.equal(await readFile(path.join(result.recovery, 'external.md'), 'utf8'), '');
  assert.equal(await readFile(file, 'utf8'), ''); assert.equal(session.pending, initial);
  return { maxWaitMs: 100, emptyFileMistakenForDeletion: false, rawFileAutomaticallyRewritten: false };
}));

await scenario('D11-continuous-partial-writer-reaches-finite-recovery', () => fixture(async ({ root, file }) => {
  const session = await DocumentSession.open(root, id), observer = new ExternalObserver(session);
  queue(session, initial + 'Live pending draft.');
  let result, external;
  for (const now of [0, 15, 30, 45, 60, 75, 90, 105]) {
    external = initial + 'Unsettled writer chunk ' + now;
    await writeFile(file, external); result = await observer.poll(now);
  }
  assert.equal(result.status, 'conflict'); assert.equal(result.reason, 'external_unstable');
  assert.equal(await readFile(path.join(result.recovery, 'external.md'), 'utf8'), external);
  assert.equal(await readFile(path.join(result.recovery, 'pending.md'), 'utf8'), session.pending);
  return { boundedRecoveryAtMs: 105, latestObservedAndPendingPreserved: true };
}));

await scenario('D12-delete-recreate-requires-new-session-epoch', () => fixture(async ({ root, file }) => {
  const session = await DocumentSession.open(root, id), observer = new ExternalObserver(session);
  queue(session, initial + 'Unsaved before delete.');
  await unlink(file);
  const result = await settle(observer);
  assert.equal(result.reason, 'source_deleted');
  assert.equal(JSON.parse(await readFile(path.join(result.recovery, 'recovery.json'))).externalMissing, true);
  const replacement = changed(initial, 'Human anchor.', 'Recreated content.');
  await writeFile(file, replacement);
  const reopened = await DocumentSession.open(root, id);
  assert.notEqual(session.epoch, reopened.epoch);
  assert.throws(() => reopened.queue({ epoch: session.epoch, baseRevision: 0, id: 'old', content: session.pending }), { code: 'stale_epoch' });
  assert.equal(await readFile(file, 'utf8'), replacement);
  return { deletedObserved: true, oldSessionCannotReplayIntoRecreatedFile: true };
}));

await scenario('D13-duplicate-identities-never-select-an-arbitrary-file', () => fixture(async ({ root, file }) => {
  const session = await DocumentSession.open(root, id), observer = new ExternalObserver(session);
  const external = initial + 'External observed.';
  await writeFile(file, external); await writeFile(path.join(root, 'notes/duplicate.md'), initial);
  const result = await settle(observer);
  assert.equal(result.status, 'conflict'); assert.match(result.reason, /duplicate|ambiguous/);
  assert.equal(await readFile(file, 'utf8'), external);
  assert.equal(await readFile(path.join(result.recovery, 'external.md'), 'utf8'), external);
  return { arbitraryDuplicateSelection: false };
}));

await scenario('D14-corpus-publication-matches-existing-canonical-policy', async () => {
  const results = [];
  for (const item of corpus.cases) {
    await fixture(async ({ root, file, initial: original }) => {
      const session = await DocumentSession.open(root, id);
      const proposal = withBody(original, item.markdown + '\nAgent chunk.');
      queue(session, proposal);
      const receipt = await session.flush();
      assert.equal(await readFile(file, 'utf8'), exactPublished(original, proposal));
      assert.equal(receipt.contentHash, contentHash(await readFile(file)));
      results.push({ id: item.id, exactCurrentPolicy: true });
    }, { content: corpus.canonical.header + item.markdown });
  }
  return { corpusCases: results };
});

await scenario('D15-uniform-crlf-publication-preserves-current-body-bytes', () => fixture(async ({ root, file }) => {
  const body = 'Human anchor.\r\n\r\nKeep CRLF bytes.\r\n';
  const original = corpus.canonical.header.replaceAll('\n', '\r\n') + body;
  await writeFile(file, original);
  const session = await DocumentSession.open(root, id);
  const proposal = withBody(original, body + 'Agent chunk.');
  queue(session, proposal); await session.flush();
  const published = await readFile(file, 'utf8');
  assert.equal(published, exactPublished(original, proposal));
  assert.equal(bodyOf(published), bodyOf(proposal), 'complete pipeline restores uniform CRLF on publication');
  return { uniformCRLFBodyPreserved: true, actualCurrentPolicyReproduced: true };
}));

await scenario('D17-partial-invalid-utf8-is-not-silently-replaced', () => fixture(async ({ root, file }) => {
  const session = await DocumentSession.open(root, id), observer = new ExternalObserver(session);
  const invalid = Buffer.concat([Buffer.from(initial), Buffer.from([0xff, 0xfe])]);
  await writeFile(file, invalid);
  assert.equal((await observer.poll(0)).status, 'stabilizing');
  assert.equal((await observer.poll(20)).status, 'stabilizing');
  const result = await observer.poll(100);
  assert.equal(result.reason, 'invalid_utf8_or_partial_file');
  assert.deepEqual(await readFile(path.join(result.recovery, 'external.md')), invalid);
  assert.deepEqual(await readFile(file), invalid);
  assert.equal(session.pending, initial);
  return { invalidObservedBytesPreserved: true, replacementCharactersHydrated: false };
}));

async function crashProbe(mode, expectedStage) {
  return fixture(async ({ root, file }) => {
    const proposal = changed(initial, 'Human anchor.', 'Child published version.');
    const proposalFile = path.join(root, 'proposal.md');
    await writeFile(proposalFile, proposal);
    const messages = [], output = [];
    const child = fork(path.join(here, 'crash-child.mjs'), [root, id, mode, proposalFile], { execArgv: [], stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    child.stdout.on('data', (chunk) => output.push(chunk.toString())); child.stderr.on('data', (chunk) => output.push(chunk.toString()));
    let closed = false, exit;
    const close = new Promise((resolve) => child.once('close', (code, signal) => { closed = true; exit = { code, signal }; resolve(); }));
    child.on('message', (message) => messages.push(message));
    try {
      await until(() => {
        if (closed) throw new Error('Crash child exited before handshake: ' + JSON.stringify(exit) + output.join(''));
        return messages.some((message) => message.stage === expectedStage);
      });
      child.kill('SIGKILL'); await close;
      const stage = messages.find((message) => message.stage === expectedStage);
      if (['before-rename', 'after-rename', 'rename-failure'].includes(mode))
        assert.equal(stage.publisherSourceSha256, hash(await readFile(path.join(repository, 'dist/core/canonical/markdown-store.js'))));
      const published = ['after-rename', 'after-call', 'receipt'].includes(mode);
      const expected = published ? exactPublished(initial, proposal) : initial;
      assert.equal(await readFile(file, 'utf8'), expected, 'canonical file must be complete old or complete new Markdown');
      assert.equal(messages.some((message) => message.saved === true), mode === 'receipt');
      const snapshot = await readMemoryDocument(root, id);
      assert.equal(snapshot.contentHash, contentHash(expected));
      // Simulate the loss of all disposable collaboration/index caches. No
      // recovery data or access/configuration is swept under a cache label.
      await mkdir(path.join(root, '.jumpybrain/collaboration'), { recursive: true });
      await writeFile(path.join(root, '.jumpybrain/collaboration/state.json'), '{"disposable":true}');
      await rm(path.join(root, '.jumpybrain/collaboration'), { recursive: true });
      const reopened = await DocumentSession.open(root, id);
      assert.equal(reopened.baseline.content, expected);
      if (mode === 'receipt') assert.equal(stage.contentHash, reopened.baseline.contentHash);
      if (mode === 'before-rename') assert.ok((await readdir(path.dirname(file))).some((name) => name.endsWith('.tmp')), 'probe actually reached staged publication');
      if (mode === 'rename-failure') assert.equal(stage.code, 'ENOSPC');
      return { crashStage: expectedStage, processSignal: exit.signal, canonical: published ? 'complete-new' : 'complete-old',
        receiptEmitted: mode === 'receipt', markdownOnlyRecovery: true,
        staleOwnedLockPossible: ['before-rename', 'after-rename'].includes(mode) };
    } finally { if (!closed) { child.kill('SIGKILL'); await close; } }
  });
}
for (const [mode, stage] of [['before-call', 'before-call'], ['before-rename', 'before-rename'], ['after-rename', 'after-rename'],
  ['after-call', 'after-call'], ['receipt', 'receipt'], ['rename-failure', 'failure']]) {
  await scenario('D16-crash-' + mode, () => crashProbe(mode, stage));
}

const result = {
  version: 1, candidate: 'durability-v1', status: scenarios.every((item) => item.status === 'passed') ? 'passed' : 'error',
  scope: 'M1 design-only publication and reconciliation seam over actual existing runtime; no production host or collaboration algorithm selected.',
  corpusSha256: hash(corpusBytes),
  sourceHashes: Object.fromEntries(await Promise.all(['session.mjs', 'crash-child.mjs', 'verify.mjs'].map(async (file) => [file, hash(await readFile(path.join(here, file)))]))),
  runtimeHashes: Object.fromEntries(await Promise.all(['dist/runtime/index.js', 'dist/core/canonical/markdown-store.js', 'dist/core/document-update.js']
    .map(async (file) => [file, hash(await readFile(path.join(repository, file)))]))),
  counts: { passed: scenarios.filter((item) => item.status === 'passed').length, failed: scenarios.filter((item) => item.status === 'failed').length },
  cases: scenarios.map((item) => ({ ...item, status: item.status === 'passed' ? 'passed' : 'error' })),
  limits: [
    'Process SIGKILL probes at guarded rename/API boundaries do not prove sudden-power-loss durability; directory fsync is best-effort in the existing publisher.',
    'Cooperating locks are not portable filesystem compare-and-swap. An unobserved noncooperating raw overwrite can still be lost; only observed versions are recoverable.',
    'This seam rejects writes while publication is in flight; client drafts must retain/retry them. It is not a complete concurrent operation transform.',
    'Recovery copies are unique private data under .jumpybrain/recovery, not derived caches. Disk failure can also prevent writing a recovery copy.',
    'Uniform CRLF body is preserved by the complete current publisher; header layout and mixed line endings follow current serializer policy rather than a new losslessness claim.',
    'Prototype recovery files use per-file fsync and best-effort directory fsync; multi-file recovery bundles are not an atomic transaction.',
    'No browser/offline storage, authenticated principals, live Linux/VPS, real semantic indexing, or installed-app lifecycle is established here.',
  ],
};
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--out')) throw new Error('Usage: node prototypes/multiplayer/durability/verify.mjs [--out FILE]');
const reportFile = path.resolve(args[1] ?? process.env.JUMPYBRAIN_M1_DURABILITY_OUT ?? path.join(repository, '.local-pack/multiplayer/M1-durability.json'));
await mkdir(path.dirname(reportFile), { recursive: true });
await writeFile(reportFile, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(result, null, 2));
process.exitCode = result.status === 'passed' ? 0 : 1;
