import assert from 'node:assert/strict';
import test from 'node:test';
import { meanDocumentVector, strongSemanticLinks, SEMANTIC_LINK_POLICY } from '../dist/core/retrieval-policy/semantic-links.js';
const vector = (file, values) => ({ file, vector: meanDocumentVector([Float32Array.from(values)]) });

test('semantic connections need high similarity, are undirected, and have stable ties', () => {
  const input = [vector('b', [1, .1, 0]), vector('a', [1, 0, 0]), vector('c', [0, 0, 1]), vector('d', [.4, .9, 0])];
  const links = strongSemanticLinks(input);
  assert.equal(links.length, 1);
  assert.equal(links[0].source, 'a'); assert.equal(links[0].target, 'b');
  assert.ok(links[0].similarity > .99);
  assert.deepEqual(strongSemanticLinks(input.reverse()), links);
});

test('mutual top-three limits semantic hubs without forcing weak edges', () => {
  const input = Array.from({ length: 12 }, (_, i) => vector(String(i).padStart(2, '0'), [1, 0]));
  const links = strongSemanticLinks(input);
  for (const doc of input) assert.ok(links.filter(edge => [edge.source, edge.target].includes(doc.file)).length <= 3);
  assert.equal(links.length, 6); // The stable first four agree; other tied neighbors are not mutual.
  assert.throws(() => strongSemanticLinks(Array(SEMANTIC_LINK_POLICY.maxDocuments + 1).fill(input[0])), /budget/);
});

test('document vectors aggregate complete chunks and reject invalid or oversized inputs', () => {
  assert.deepEqual([...meanDocumentVector([new Float32Array([1, 0]), new Float32Array([0, 1])])], [Math.SQRT1_2, Math.SQRT1_2].map(Math.fround));
  for (const chunks of [[], [new Float32Array([0, 0])], [new Float32Array([NaN, 1])], [new Float32Array([1]), new Float32Array([1, 2])], Array(65).fill(new Float32Array([1]))])
    assert.equal(meanDocumentVector(chunks), undefined);
});
