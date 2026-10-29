import test from 'node:test';
import assert from 'node:assert/strict';
import { supplementNamedCandidates } from '../evals/workspace-retrieval/discovery-policy.mjs';

const doc = (relativePath, title, extra = {}) => ({ relativePath, frontmatter: { title, ...extra } });
const map = documents => new Map(documents.map(d => [d.relativePath, d]));
const row = (file, score = 0.8) => ({ file, score, snippet: `Original candidate ${file}` });
const files = result => result.candidates.map(c => c.file);

test('named discovery admits missing metadata sources while retaining every original score and object', () => {
  const documents = map([
    doc('notes/aspen/brief.md', 'Aspen introduction'),
    doc('decisions/aspen/scope.md', 'Aspen accepted trial'),
    doc('findings/aspen/site.md', 'Host restriction', { tags: ['aspen'] }),
    doc('noise.md', 'Unrelated material'),
  ]);
  const candidates = [row('noise.md'), row('decisions/aspen/scope.md', 0.4)];
  const result = supplementNamedCandidates(candidates, documents,
    'Bring a teammate up to speed on Aspen, its purpose, coordinator and approved trial.');
  assert.equal(result.anchor, 'Aspen');
  assert.deepEqual(files(result), ['noise.md', 'decisions/aspen/scope.md', 'findings/aspen/site.md', 'notes/aspen/brief.md']);
  assert.deepEqual(result.added, [{ file: 'findings/aspen/site.md', score: 0 }, { file: 'notes/aspen/brief.md', score: 0 }]);
  assert.equal(result.candidates[0], candidates[0]);
  assert.equal(result.candidates[1], candidates[1]);
  assert.equal(candidates.length, 2);
});

test('named discovery guards preserve constrained navigation and temporal candidate pools', () => {
  const documents = map([doc('a.md', 'Aspen introduction'), doc('b.md', 'Aspen decision')]);
  const candidates = [row('a.md')];
  for (const flag of ['constrained', 'exactNavigation', 'temporal']) {
    const result = supplementNamedCandidates(candidates, documents, 'Aspen trial purpose', { [flag]: true });
    assert.equal(result.candidates, candidates);
    assert.deepEqual(result.added, []);
  }
});

test('named discovery refuses ambiguous subjects, duplicate-title pseudo-identities and substring inference', () => {
  const documents = map([
    doc('a.md', 'Aspen introduction'), doc('b.md', 'Aspen decision'),
    doc('c.md', 'Birch introduction'), doc('d.md', 'Birch decision'),
  ]);
  const candidates = [row('a.md')];
  for (const query of ['Compare Aspen and Birch', 'What does aspen allow?', 'Aspenwood trial purpose', 'Unrecorded coordinator']) {
    assert.equal(supplementNamedCandidates(candidates, documents, query).candidates, candidates);
  }
  const duplicates = map([doc('a.md', 'Field handbook'), doc('b.md', 'Field handbook')]);
  assert.equal(supplementNamedCandidates(candidates, duplicates, 'Field limits').candidates, candidates);
});

test('named discovery recognizes literal single-word aliases and refuses body-only or tag-only inferred identities', () => {
  const documents = map([
    doc('a.md', 'Workshop introduction', { aliases: ['Nightjar'] }),
    doc('b.md', 'Host restriction', { tags: ['nightjar'] }),
    { ...doc('c.md', 'Unrelated'), content: 'Aster is coordinated by someone.' },
    doc('d.md', 'Only tags', { tags: ['Aster'] }),
  ]);
  assert.deepEqual(files(supplementNamedCandidates([], documents, 'Who coordinates Nightjar?')), ['a.md', 'b.md']);
  assert.deepEqual(files(supplementNamedCandidates([], documents, 'Who coordinates Aster?')), []);
});

test('named discovery canonicalizes known QMD lookup aliases and never duplicates a discovered file', () => {
  const a = doc('Notes/Aspen_Brief.md', 'Aspen introduction');
  const b = doc('decisions/aspen.md', 'Aspen decision');
  const documents = map([a, b]);
  documents.set('notes/aspen-brief.md', a);
  const candidates = [row('NOTES/ASPEN_BRIEF.MD')];
  const result = supplementNamedCandidates(candidates, documents, 'Aspen trial purpose', {
    normalizeFile: file => file.toLowerCase().replace(/_/g, '-'),
  });
  assert.deepEqual(result.added, [{ file: 'decisions/aspen.md', score: 0 }]);
});

test('named discovery has an eight-file additive bound independent of manifest order and preserves a full ordinary pool', () => {
  const documents = Array.from({ length: 30 }, (_, i) => doc(`aspen-${String(i).padStart(2, '0')}.md`, `Aspen document ${i}`));
  const candidates = Array.from({ length: 208 }, (_, i) => row(`existing-${i}.md`, 1 / (i + 1)));
  const forward = supplementNamedCandidates(candidates, map(documents), 'Aspen trial purpose');
  const reverse = supplementNamedCandidates(candidates, map([...documents].reverse()), 'Aspen trial purpose');
  assert.equal(forward.candidates.length, 216);
  assert.equal(forward.added.length, 8);
  assert.equal(forward.omittedDocuments, 22);
  assert.deepEqual(forward.added, reverse.added);
  assert.ok(candidates.every((candidate, index) => forward.candidates[index] === candidate));
});
