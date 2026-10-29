import assert from 'node:assert/strict';
import test from 'node:test';
import { chooseSpreadExpansions } from '../evals/workspace-retrieval/read-policy.mjs';
import { chooseExpansions } from '../evals/workspace-retrieval/score.mjs';

const passage = id => ({ expansion: { available: true, id, expectedContentHash: `hash-${id}` } });
test('rank-spread uses unique available handles and spends the last slot on a lower-ranked source', () => {
  const packet = { passages: [{ expansion: { available: false } }, passage('a'), passage('a'), passage('b'), passage('c'), passage('d'), passage('e')] };
  assert.deepEqual(chooseExpansions(packet).map(r => r.id), ['a', 'b', 'c']);
  assert.deepEqual(chooseSpreadExpansions(packet), ['a', 'b', 'e'].map(id => ({ id, expectedContentHash: `hash-${id}`, startLine: 1, maxBytes: 8192 })));
});
test('rank-spread keeps small packets, unavailable handles and zero budget bounded', () => {
  assert.deepEqual(chooseSpreadExpansions({ passages: [] }), []);
  assert.deepEqual(chooseSpreadExpansions({ passages: [passage('a'), passage('a'), passage('b')] }).map(r => r.id), ['a', 'b']);
  assert.deepEqual(chooseSpreadExpansions({ passages: [passage('a')] }, 0), []);
  assert.deepEqual(chooseSpreadExpansions({ passages: [passage('a'), passage('b')] }, 1).map(r => r.id), ['b']);
});
