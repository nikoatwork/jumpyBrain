import test from 'node:test';
import assert from 'node:assert/strict';
import { prioritizeNamedIdentity } from '../evals/workspace-retrieval/identity-policy.mjs';
const doc = (file, title, extra = {}) => ({ relativePath: file, frontmatter: { title, ...extra } });
const row = file => ({ provenance: { file }, snippet: `Original evidence from ${file}` });
const map = documents => new Map(documents.map(d => [d.relativePath, d]));

test('identity prototype preserves ranked order within matching and other candidates', () => {
  const documents = map([doc('a','Tamar proposal'),doc('b','Selkie plan'),doc('c','Tamar inspection'),doc('d','Field handbook',{tags:['tamar']})]);
  const results = ['b','a','d','c'].map(row);
  assert.deepEqual(prioritizeNamedIdentity(results,documents,'What does Tamar allow?').map(r=>r.provenance.file),['a','d','c','b']);
  assert.ok(prioritizeNamedIdentity(results,documents,'What does Tamar allow?').every(r=>results.includes(r)));
});

test('identity prototype refuses ambiguous names and duplicate-title pseudo-identities', () => {
  const documents = map([doc('a','Tamar plan'),doc('b','Selkie plan'),doc('c','Tamar decision'),doc('d','Selkie decision')]);
  const results = ['b','a','d','c'].map(row);
  assert.deepEqual(prioritizeNamedIdentity(results,documents,'Compare Tamar and Selkie'),results);
  const duplicates=map([doc('a','Field handbook'),doc('b','Field handbook')]);
  assert.deepEqual(prioritizeNamedIdentity(['a','b'].map(row),duplicates,'Field limits'),['a','b'].map(row));
});

test('identity prototype uses literal whole-word canonical names and explicit aliases only', () => {
  const documents=map([doc('a','Workshop record',{aliases:['Nightjar']}),doc('b','Tamar plan'),doc('c','Tamar decision')]);
  const results=['b','c','a'].map(row);
  assert.deepEqual(prioritizeNamedIdentity(results,documents,'Under Nightjar, what is allowed?').map(r=>r.provenance.file),['a','b','c']);
  assert.deepEqual(prioritizeNamedIdentity(results,documents,'What does tamar allow?'),results);
  assert.deepEqual(prioritizeNamedIdentity(results,documents,'What does Tamarind allow?'),results);
  assert.deepEqual(prioritizeNamedIdentity(results,documents,'Search the workshop record'),results);
});
