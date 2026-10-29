import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);

test('range audit normalizes only declared run roots and timing, rejecting evidence drift', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'workspace-range-audit-'));
  try {
    const control = path.join(temp, 'control'), replica = path.join(temp, 'replica');
    const manifest = { arm: 'baseline', runtimeRoot: process.cwd(), inputDigest: 'same-input', productDigest: 'same-product', qmd: null, model: null, tokenizer: null, modes: ['lexical'] };
    const query = { id: 'question', query: 'What is recorded?' };
    await mkdir(path.join(control, 'fixture'), { recursive: true });
    await writeFile(path.join(control, 'fixture/queries.json'), JSON.stringify([query]));
    const packet = root => ({ id: query.id, search: { root: path.join(root, 'lexical-1/memory'), query: query.query, results: [] }, recall: { passages: [] }, expansions: [], requests: [], wires: ['{}\n'], timing: { elapsed: root === control ? 1 : 2 } });
    for (const dir of [control, replica]) {
      await mkdir(path.join(dir, 'lexical-1/packets'), { recursive: true });
      await writeFile(path.join(dir, 'FREEZE.json'), JSON.stringify(manifest));
      await writeFile(path.join(dir, 'REPORT.json'), JSON.stringify({ reports: [{ repeat: 1, records: [{ id: query.id, initial: [], final: [] }] }] }));
      await writeFile(path.join(dir, 'lexical-1/packets/question.json'), JSON.stringify(packet(dir)));
    }
    const output = path.join(temp, 'audit.json');
    const args = ['evals/workspace-retrieval/audit-constraint-range.mjs', control, output, replica];
    await exec(process.execPath, args);
    assert.equal(JSON.parse(await readFile(output)).runs.length, 2);
    const changed = packet(replica);
    changed.search.query = 'Different evidence request';
    await writeFile(path.join(replica, 'lexical-1/packets/question.json'), JSON.stringify(changed));
    await assert.rejects(exec(process.execPath, args), /Control nondeterminism/);
    changed.search.query = query.query;
    changed.search.root = path.join(temp, 'unexpected');
    await writeFile(path.join(replica, 'lexical-1/packets/question.json'), JSON.stringify(changed));
    await assert.rejects(exec(process.execPath, args), /Unexpected rich-search root/);
  } finally { await rm(temp, { recursive: true, force: true }); }
});
