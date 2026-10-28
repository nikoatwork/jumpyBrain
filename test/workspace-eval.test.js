import assert from 'node:assert/strict';
import test from 'node:test';
import { chooseExpansions, scoreEvidence, scoreSearch } from '../evals/workspace-retrieval/score.mjs';
import { requiredLocalPackFiles, validateLocalPackFiles } from '../scripts/local-pack-manifest.mjs';

test('evidence scoring rejects incomplete clauses, wrong source and invalid provenance', () => {
  const units = [{ label: 'scope', alternatives: [{ file: 'notes/a.md', required: ['Pilot only; public use remains blocked.', 'An observer must attend.'] }] }];
  const span = text => ({ file: 'notes/a.md', text, verified: true });
  assert.equal(scoreEvidence(units, [span('Pilot only'), span('An observer must attend.')])[0].covered, false);
  assert.equal(scoreEvidence(units, [{ ...span('Pilot only; public use remains blocked. An observer must attend.'), file: 'notes/b.md' }])[0].covered, false);
  assert.equal(scoreEvidence(units, [{ ...span('Pilot only; public use remains blocked. An observer must attend.'), verified: false }])[0].covered, false);
  assert.equal(scoreEvidence(units, [span('Pilot only; public use remains blocked.'), span('An observer must attend.')])[0].covered, true);
});

test('follow-up reads use returned order and unique available handles, not gold answers', () => {
  const available = id => ({ expansion: { available: true, id, expectedContentHash: `hash-${id}` } });
  const packet = { passages: [{ expansion: { available: false } }, available('b'), available('b'), available('a'), available('c'), available('d')] };
  const reads = chooseExpansions(packet);
  assert.deepEqual(reads.map(read => read.id), ['b', 'a', 'c']);
  assert.ok(reads.every(read => read.startLine === 1 && read.maxBytes === 8192));
});

test('search scoring distinguishes first useful page from coverage of all required pages', () => {
  const results = ['noise.md', 'a.md', 'a.md'].map(file => ({ provenance: { file } }));
  assert.deepEqual(scoreSearch(['a.md', 'b.md'], results), { rank: 2, success5: true, success10: true, reciprocalRank: .5, requiredFileCoverage10: .5 });
});

test('installable package validation rejects development evaluation assets', () => {
  assert.throws(() => validateLocalPackFiles([...requiredLocalPackFiles, 'package/evals/workspace-retrieval/gold/rubric.json']), /package\/evals\//);
});
