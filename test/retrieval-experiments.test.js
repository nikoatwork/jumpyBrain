import test from 'node:test';
import { markdownStructure } from '../dist/core/canonical/markdown-structure.js';
import { parseFrontmatter } from '../dist/core/frontmatter.js';
import { buildCanonicalLinkTargetLookup, resolveCanonicalLinkTarget } from '../dist/core/canonical/links.js';
import assert from 'node:assert/strict';
import { evidenceContext, injectNeighbors, relationshipProjection } from '../evals/workspace-retrieval/experiment-policy.mjs';
import { excerptMatchesSource, packCompactRecall, serializeCompactRecall } from '../dist/core/retrieval-policy/compact.js';

const dependencies = { markdownStructure, parseFrontmatter, excerptMatchesSource, buildCanonicalLinkTargetLookup, resolveCanonicalLinkTarget };

test('experimental evidence bundle preserves real disjoint citations and governing prose', () => {
  const content = '---\ntitle: Training\naliases: [Nightjar]\n---\n# Training\n\nOnly the empty cabinet is in scope.\n\n## Records\n\n' + 'Record observer conditions.\n'.repeat(30) + '\n## Operation\n\nUse twelve minutes.\n';
  const lines = content.split('\n');
  const index = lines.indexOf('Use twelve minutes.') + 1;
  const passage = { startLine: index, endLine: index, text: 'Use twelve minutes.' };
  const context = evidenceContext(passage, content, dependencies);
  assert.ok(context.some(span => span.text.includes('aliases: [Nightjar]')));
  assert.ok(context.some(span => span.text.includes('Only the empty cabinet is in scope.')));
  assert.ok(context.every(span => excerptMatchesSource(span.text, span.startLine, span.endLine, content)));
  assert.ok(!context.some(span => span.text.includes('Record observer conditions.')));
});

test('experimental context is charged and omitted atomically with the supported passage', () => {
  const content = '# Scope\n\nTraining only.\n\n## Steps\n\n' + 'Do this safely. '.repeat(100);
  const passage = { filePath: 'notes/test.md', pathBasis: 'canonical_root', startLine: 7, endLine: 7,
    text: 'Do this safely. '.repeat(100), scope: 'excerpt', partial: true, date: { basis: 'unknown' }, expansion: { available: false, reason: 'missing_id' } };
  passage.context = evidenceContext(passage, content, dependencies);
  const envelope = { query: 'steps', depth: 'normal', readiness: { freshness: 'fresh', modes: ['lexical'], embedding: 'disabled' }, retrieval: { status: 'complete', warnings: [] } };
  const packed = packCompactRecall(envelope, [{ passages: [passage] }], { maxBytes: 1024 });
  assert.equal(packed.passages.length, 0);
  assert.equal(packed.omitted.passages, 1);
  assert.ok(Buffer.byteLength(serializeCompactRecall(packed)) <= 1024);
});

test('explicit projection handles ambiguous IDs, unresolved links and excludes ordinary navigation', () => {
  const id = 'mem_12345678-1234-1234-1234-123456789abc';
  const documents = [
    { relativePath: 'notes/a.md', frontmatter: { sources: [id, '/notes/b.md', 'missing.md'] }, content: '[navigation](c.md)' },
    { relativePath: 'notes/b.md', frontmatter: { id, supersedes: '/notes/a.md' } },
    { relativePath: 'notes/c.md', frontmatter: { id } },
  ];
  const projection = relationshipProjection(documents, dependencies);
  assert.deepEqual(projection.get('notes/a.md'), ['notes/b.md']);
  assert.deepEqual(projection.get('notes/b.md'), ['notes/a.md']);
});

test('one-hop discovery respects constraints, eligibility and total candidate slots', () => {
  const candidates = Array.from({ length: 40 }, (_, i) => ({ file: `direct-${i}`, score: 1 / (i + 1) }));
  const documents = new Map([...candidates.map(c => [c.file, {}]), ...Array.from({ length: 10 }, (_,i) => [`neighbor-${i}`, {}])]);
  const edges = new Map([['direct-0', Array.from({ length: 10 }, (_,i) => `neighbor-${i}`)], ['neighbor-0', ['recursive-target']]]);
  const result = injectNeighbors(candidates, documents, edges, false);
  assert.equal(result.candidates.length, 40);
  assert.equal(result.added.length, 6);
  assert.ok(!result.candidates.some(c => c.file === 'recursive-target'));
  assert.deepEqual(injectNeighbors(candidates, documents, edges, true).candidates, candidates);
  assert.equal(injectNeighbors(candidates, new Map(), edges, false).added.length, 0);
  const tiny = injectNeighbors(candidates.slice(0, 1), documents, edges, false);
  assert.equal(tiny.candidates.length, 1);
  assert.equal(tiny.added.length, 1);
});
