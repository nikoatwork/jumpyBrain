import assert from 'node:assert/strict';
import test from 'node:test';
import { selectGraphSearchResults, graphLexicalMatch } from '../dist/adapters/http-server/graph-search.js';
import { createRecentWriteSearch } from '../dist/adapters/http-server/recent-write-search.js';
const hit = (name, qmdScore, extra = {}) => ({
  provenance: { file: `notes/${name}.md`, metadata: { title: name } },
  snippet: 'A paraphrase with no literal query words', scoreBreakdown: { qmdScore }, ...extra,
});
test('graph keeps three strong semantic matches and rejects a boosted long tail', () => {
  const strong = [hit('a', .95), hit('b', .9), hit('c', .82)];
  const weak = Array.from({ length: 117 }, (_, n) => hit(`weak-${n}`, .6, { score: 10, scoreBreakdown: { qmdScore: .6, dreamBoost: 4, temporalRelevance: 2 } }));
  assert.deepEqual(selectGraphSearchResults('sleep quality', [...strong, ...weak]), strong);
});
test('absolute floor does not admit an entirely weak semantic set or unknown scores', () => {
  assert.deepEqual(selectGraphSearchResults('sleep quality', [hit('a', .74), hit('b', .3), hit('c', NaN), hit('d', Infinity), hit('e', '1'), hit('f', 3), hit('g', undefined)]), []);
  assert.deepEqual(selectGraphSearchResults('', [hit('a', 1)]), []);
  assert.deepEqual(selectGraphSearchResults('sleep', null), []);
});
test('full-query title and body evidence survives low scores; partial overlap does not', () => {
  const exact = hit('Sleep quality', 0);
  const body = hit('Journal', .1, { snippet: 'Quality improves after uninterrupted sleep.' });
  const passage = hit('Another day', .1, { passages: [{ snippet: 'Sleep quality improved.' }] });
  assert.deepEqual(selectGraphSearchResults('sleep quality', [exact, body, passage, hit('Sleep', .1)]), [exact, body, passage]);
  assert.equal(graphLexicalMatch('C++', 'C'), false);
  assert.equal(graphLexicalMatch('health', 'healthcare'), false);
  assert.equal(graphLexicalMatch('Ｃ++', 'Learning C++ today'), true);
});
test('confirmed saves retain full-body matches beyond the display snippet and respect tombstones', async () => {
  const cache = createRecentWriteSearch({ scope: () => 'a', fetch: async () => ({ results: [], index: { stale: true } }) });
  cache.remember({ id: 'one', title: 'Journal', file: 'notes/one.md', body: 'Unrelated introduction. '.repeat(40) + 'sleep quality' });
  const packet = await cache.search('sleep quality', new AbortController().signal, 120);
  assert.equal(packet.results[0].snippet.includes('sleep'), false);
  assert.equal(selectGraphSearchResults('sleep quality', packet.results).length, 1);
  cache.remove('one');
  assert.deepEqual(selectGraphSearchResults('sleep quality', (await cache.search('sleep quality', new AbortController().signal)).results), []);
});
