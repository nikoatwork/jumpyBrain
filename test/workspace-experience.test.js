import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { runPath, guardCommand, cleanupCheck, evidenceFile, validateResult, updateLedger } from '../evals/workspace-experience/run.mjs';

const hash = 'sha256:' + 'a'.repeat(64);
const manifest = { prefix: 'UX run-one ', allowMutations: true };
const ledger = { records: [{ kind: 'note', id: 'mine' }, { kind: 'board', id: 'board-mine' }, { kind: 'note', id: 'deleted', deleted: true }] };

test('experience wrapper cannot retarget mutations or edit records outside the run', () => {
  for (const selector of ['--root', '--target-url=https://other.example', '--remote-url', '--api-key=secret', '--directory']) {
    assert.throws(() => guardCommand(['update', '--id', 'mine', selector, '/other', '--if-match', hash], manifest, ledger), /bound/);
  }
  for (const id of ['personal-note', 'deleted', undefined]) {
    assert.throws(() => guardCommand(['update', '--id', id, '--if-match', hash], manifest, ledger), /ledger/);
  }
  assert.throws(() => guardCommand(['board', 'add', '--board', 'board-mine', '--page', 'personal-note', '--if-match', hash], manifest, ledger), /run-owned/);
  assert.throws(() => guardCommand(['delete', '--id', 'mine', '--apply', '--if-match', hash], manifest, ledger), /bounded/);
  assert.throws(() => guardCommand(['index', '--rebuild'], manifest, ledger), /bounded/);
  assert.doesNotThrow(() => guardCommand(['update', '--id', 'mine', '--if-match', hash], manifest, ledger));
});

test('observation cannot seed, prefix spoofing cannot create unrelated records, and arbitrary board files are refused', () => {
  assert.throws(() => guardCommand(['remember', '--title', 'UX run-one Test'], { ...manifest, allowMutations: false }, ledger), /authorization/);
  assert.throws(() => guardCommand(['remember', '--title', 'Personal decision'], manifest, ledger), /prefix/);
  assert.throws(() => guardCommand(['board', 'create', '--name', 'UX run-one Board', '--file', '/tmp/other.json'], manifest, ledger), /Arbitrary/);
  assert.throws(() => guardCommand(['search', '--query', 'private health notes'], manifest, ledger), /prefix/);
  assert.doesNotThrow(() => guardCommand(['status'], { ...manifest, allowMutations: false }, ledger));
});

test('cleanup fails closed after concurrent edits, unknown verification, and inbound references', () => {
  assert.throws(() => cleanupCheck({ verifiedHash: hash }, 'sha256:' + 'b'.repeat(64)), /changed/);
  assert.throws(() => cleanupCheck({}, hash), /changed/);
  for (const references of [{ links: 1, relationships: 0, truncated: false }, { links: 0, relationships: 1, truncated: false }, { links: 0, relationships: 0, truncated: true }]) {
    assert.throws(() => cleanupCheck({ verifiedHash: hash }, hash, references), /references/);
  }
  assert.doesNotThrow(() => cleanupCheck({ verifiedHash: hash }, hash, { links: 0, relationships: 0, truncated: false }));
});

test('evidence cannot escape run storage, including through symlinks, and missing UI cannot become a pass', async () => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'jb-experience-'));
  const root = path.join(folder, 'run'); await fs.mkdir(path.join(root, 'ui'), { recursive: true }); await fs.mkdir(path.join(root, 'cli'));
  try {
    await fs.writeFile(path.join(folder, 'outside'), 'private'); await fs.symlink(path.join(folder, 'outside'), path.join(root, 'ui', 'escaped.png'));
    await assert.rejects(evidenceFile(root, '../outside'), /relative/);
    await assert.rejects(evidenceFile(root, 'ui/escaped.png'), /inside/);
    const base = { checkpoint: 'J1', attempt: 1, outcome: 'pass', observation: 'Saved verified.', assistance: [], evidence: [] };
    await assert.rejects(validateResult(root, base), /UI screenshot/);
    const item = await validateResult(root, { ...base, outcome: 'unverified' }); assert.equal(item.outcome, 'unverified');
    assert.throws(() => runPath('../other', root), /run name/);
  } finally { await fs.rm(folder, { recursive: true, force: true }); }
});

test('concurrent producer bookkeeping and adoption preserve every record and publish parseable ledgers', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'jb-ledger-'));
  try {
    await fs.writeFile(path.join(root, 'ledger.json'), JSON.stringify({ records: [{ id: 'draft', verifiedHash: 'before' }], intents: [] }));
    // Represents a long-running producer's old snapshot, taken before another process adopts notes.
    const oldSnapshot = JSON.parse(await fs.readFile(path.join(root, 'ledger.json'), 'utf8'));
    const moduleURL = new URL('../evals/workspace-experience/run.mjs', import.meta.url).href;
    const workers = Array.from({ length: 3 }, (_, actor) => promisify(execFile)(process.execPath, ['--input-type=module', '-e', `
      import { updateLedger } from ${JSON.stringify(moduleURL)};
      for (let i = 0; i < 12; i++) await updateLedger(${JSON.stringify(root)}, current => {
        current.records.push({ id: ${JSON.stringify(String(actor))} + '-' + i });
        current.intents.push({ actor: ${actor}, i });
      });
    `]));
    let reading = true;
    const reader = (async () => { while (reading) { JSON.parse(await fs.readFile(path.join(root, 'ledger.json'), 'utf8')); await new Promise(resolve => setTimeout(resolve, 1)); } })();
    try { await Promise.all(workers); } finally { reading = false; await reader; }
    await updateLedger(root, current => { current.records.find(x => x.id === oldSnapshot.records[0].id).verifiedHash = 'after'; });
    const final = JSON.parse(await fs.readFile(path.join(root, 'ledger.json'), 'utf8'));
    assert.equal(final.records.length, 37); assert.equal(new Set(final.records.map(x => x.id)).size, 37);
    assert.equal(final.intents.length, 36); assert.equal(final.records[0].verifiedHash, 'after');
    await assert.rejects(fs.stat(path.join(root, '.ledger.lock')), { code: 'ENOENT' });
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
