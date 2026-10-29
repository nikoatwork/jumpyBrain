import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { naturalQuestion } from '../evals/workspace-retrieval/constraint-policy.mjs';
import { chooseCitedExpansions } from '../evals/workspace-retrieval/read-policy.mjs';
import { chooseExpansions } from '../evals/workspace-retrieval/score.mjs';
import { isValidMemoryDocumentId } from '../dist/core/document-id.js';
import { hasQueryConstraints } from '../dist/adapters/qmd/qmd-query.js';

const passage = (id, startLine) => ({ startLine, expansion: { available: true, id, expectedContentHash: `hash-${id}` } });
test('natural questions reinterpret lowercase negation and alphabetic hyphens only inside bounded questions', () => {
  for (const query of ['Why does Thistledown not allow unlabelled seed?', 'Has Bellwether key-holder access changed?', 'Can a volunteer act without the steward?', 'Is there no signed replacement?']) {
    assert.equal(hasQueryConstraints(query), true);
    const amendment = naturalQuestion(query);
    assert.ok(amendment);
    assert.equal(hasQueryConstraints(amendment.constraintProbe), false);
  }
  assert.equal(naturalQuestion('Has Bellwether key-holder access changed?').query, 'Has Bellwether key holder access changed?');
  assert.equal(naturalQuestion('Why does Thistledown not allow unlabelled seed?').query, 'Why does Thistledown not allow unlabelled seed?');
  assert.equal(naturalQuestion('Thistledown not picnic'), null);
  assert.equal(naturalQuestion('Why does Thistledown not allow this'), null);
});
test('explicit phrases, exclusions, filters and identifier forms remain constrained', () => {
  for (const query of ['What Bellwether NOT picnic?', 'What Bellwether -picnic?', 'What "key-holder" changed?', "What 'exact phrase' changed?", 'What path:notes changed?', 'What foo/bar changed?', 'What AB-12 changed?', 'What thing.name changed?', 'What camelCase changed?', 'What A+B changed?', 'What foo* changed?', 'What X OR Y changed?', 'What X AND Y changed?', 'What [X] changed?', 'What X\\Y changed?', 'What `X` changed?']) {
    assert.equal(hasQueryConstraints(query), true, query);
    assert.equal(naturalQuestion(query), null, query);
  }
});
test('cited reads retain baseline source order and hashes while following the first visible range', () => {
  const packet = { passages: [{ expansion: { available: false } }, passage('a', 4), passage('a', 90), passage('b', 120), passage('c', 33), passage('d', 200)] };
  const requests = chooseCitedExpansions(packet);
  assert.deepEqual(requests.map(r => r.id), chooseExpansions(packet).map(r => r.id));
  assert.deepEqual(requests.map(r => r.startLine), [1, 112, 25]);
  assert.ok(requests.every(r => r.expectedContentHash === `hash-${r.id}` && r.maxBytes === 8192 && !('endLine' in r)));
  assert.deepEqual(chooseCitedExpansions(packet, 0), []);
  assert.deepEqual(chooseCitedExpansions({ passages: [] }), []);
});
test('long diagnostic sources and rubrics regenerate byte-for-byte without retrieval outputs', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'jumpybrain-range-fixture-'));
  try {
    execFileSync('python3', ['evals/workspace-retrieval/build-constraint-range.py', temp]);
    const compare = async relative => {
      for (const entry of await readdir(path.join(temp, relative), { withFileTypes: true })) {
        const file = path.join(relative, entry.name);
        if (entry.isDirectory()) await compare(file);
        else {
          const bytes = await readFile(path.join(temp, file));
          assert.deepEqual(bytes, await readFile(path.join('evals/workspace-retrieval/constraint-range', file)), file);
          if (file.endsWith('.md')) assert.ok(isValidMemoryDocumentId(bytes.toString('utf8').match(/^id: (.+)$/m)?.[1]), file);
        }
      }
    };
    await compare('');
    const queries = JSON.parse(await readFile(path.join(temp, 'queries.json')));
    const rubric = JSON.parse(await readFile(path.join(temp, 'rubric.json')));
    assert.equal(queries.length, 16);
    assert.deepEqual(queries.map(q => q.id), rubric.map(r => r.id));
    for (const row of rubric) for (const unit of row.units) for (const alt of unit.alternatives) {
      const text = await readFile(path.join(temp, 'corpus', alt.file), 'utf8');
      for (const clause of alt.required) assert.ok(text.includes(clause));
    }
    for (const slug of ['thistledown', 'bellwether']) {
      const text = await readFile(path.join(temp, `corpus/notes/${slug}/handbook.md`), 'utf8');
      assert.ok(Buffer.byteLength(text) > 32768);
      assert.ok(text.indexOf('## Detailed observation procedure') > 8192);
    }
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('real compiled query seam changes only natural-question constraint interpretation', () => {
  const script = `
    import assert from 'node:assert/strict';
    import { installExperiment } from './evals/workspace-retrieval/experiment-hooks.mjs';
    await installExperiment({ repo: process.cwd(), arm: 'natural-question' });
    const query = await import('./dist/adapters/qmd/qmd-query.js');
    assert.equal(query.hasQueryConstraints('Why does Thistledown not allow this?'), false);
    assert.equal(query.hasQueryConstraints('What Thistledown NOT picnic?'), true);
    assert.equal(query.hasQueryConstraints('What Thistledown -picnic?'), true);
    assert.deepEqual(query.qmdLexQueries('What Thistledown NOT picnic?'), ['What Thistledown NOT picnic?']);
    const variants = query.qmdLexQueries('Has Thistledown key-holder access changed?');
    assert.ok(variants.length > 1);
    assert.ok(variants.every(value => !value.includes('key-holder')));
  `;
  execFileSync(process.execPath, ['--input-type=module', '-e', script]);
});
