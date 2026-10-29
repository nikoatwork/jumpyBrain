import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const compare = new URL('../evals/workspace-retrieval/compare-experiments.mjs', import.meta.url);

test('paired comparison detects protected evidence swaps and rejects backend identity drift', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'workspace-discovery-compare-'));
  try {
    const baseline = path.join(dir, 'baseline'), arm = path.join(dir, 'arm'), output = path.join(dir, 'comparison.json');
    const manifest = { protocol: 'workspace-v5', inputDigest: 'same-inputs', productDigest: 'same-product',
      qmd: { version: 'pinned' }, model: null, tokenizer: { version: 'pinned' }, modes: ['lexical'] };
    const row = { id: 'fresh-protected', fresh: true, journey: 'protected', split: 'reserved',
      search: { success5: true, success10: true, reciprocalRank: 1, requiredFileCoverage10: 1 },
      initial: [{ label: 'scope', covered: true }],
      final: [{ label: 'approval', covered: true }, { label: 'hours', covered: false }],
      cost: { tokens: 100, bytes: 100, expansions: 0 }, timing: { searchMs: 1, recallMs: 1, interactionMs: 1 },
      retrieval: { status: 'complete' }, provenanceFailures: 0, recallFiles: ['a.md'] };
    for (const [root, kind, record] of [[baseline, 'baseline', row], [arm, 'discovery', {
      ...row, final: [{ label: 'approval', covered: false }, { label: 'hours', covered: true }],
    }]]) {
      await mkdir(path.join(root, 'lexical-1'), { recursive: true });
      await writeFile(path.join(root, 'FREEZE.json'), JSON.stringify({ ...manifest, arm: kind }));
      await writeFile(path.join(root, 'lexical-1/scores.json'), JSON.stringify({
        overall: { provenanceFailures: 0, interactionTokens: 100 }, records: [record],
      }));
    }
    await exec(process.execPath, [compare.pathname, baseline, output, arm]);
    const result = JSON.parse(await readFile(output, 'utf8')).arms[0];
    assert.deepEqual(result.unitRegressions, []);
    assert.deepEqual(result.lostRequiredUnits, [{ id: row.id, labels: ['approval'] }]);
    assert.deepEqual(result.protectedRegressions, [row.id]);
    assert.equal(result.provenancePass, true);
    await writeFile(path.join(arm, 'FREEZE.json'), JSON.stringify({ ...manifest, arm: 'discovery', qmd: { version: 'changed' } }));
    await assert.rejects(exec(process.execPath, [compare.pathname, baseline, output, arm]), /Comparison qmd identities differ/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
