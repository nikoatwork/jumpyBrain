import test from 'node:test';
import assert from 'node:assert/strict';
import { parseOptions, queryFeedback } from '../scripts/check-feedback.mjs';

test('inbox query is read-only, paginates received mail and separates labeled tests', async () => {
  const requests = [];
  const result = await queryFeedback(parseOptions([]), { key: 'private-key', fetchImpl: async (url, options) => {
    requests.push({ url: new URL(url), options });
    assert.equal(options.method, undefined);
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Authorization, 'Bearer private-key');
    return Response.json(requests.length === 1 ? { messages: [{ preview: '[TEST — verification]', message_id: 'test' }], next_page_token: 'second' }
      : { messages: [{ preview: 'Actual feedback', message_id: 'feedback', thread_id: 'thread', subject: 'Feedback' }] });
  } });
  assert.equal(requests[0].url.searchParams.get('labels'), 'received');
  assert.equal(requests[1].url.searchParams.get('page_token'), 'second');
  assert.equal(result.complete, true);
  assert.equal(result.excludedTests, 1);
  assert.equal(result.messages[0].id, 'feedback');
  assert.doesNotMatch(JSON.stringify(result), /private-key/);
});

test('bounded inbox query reports its continuation and UTC date scope', async () => {
  const options = parseOptions(['--since', '2026-10-23T00:00:00+02:00', '--max-pages', '1', '--include-tests']);
  const result = await queryFeedback(options, { key: 'key', fetchImpl: async url => {
    assert.equal(url.searchParams.get('after'), '2026-10-22T22:00:00.000Z');
    return Response.json({ messages: [{ preview: '[TEST] delivery' }], next_page_token: 'next' });
  } });
  assert.equal(result.complete, false);
  assert.equal(result.nextPageToken, 'next');
  assert.equal(result.messages[0].test, true);
  for (const args of [['--since', '2026-10-23'], ['--limit', '0'], ['--max-pages', '101'], ['--send'], ['--message']]) assert.throws(() => parseOptions(args));
});

test('message lookup encodes IDs and authentication errors never echo provider bodies or keys', async () => {
  const result = await queryFeedback(parseOptions(['--message', '<a/b@example.com>']), { key: 'key', fetchImpl: async url => {
    assert.ok(url.endsWith('/%3Ca%2Fb%40example.com%3E'));
    return Response.json({ message_id: 'id', text: 'Message body' });
  } });
  assert.equal(result.message.text, 'Message body');
  await assert.rejects(queryFeedback(parseOptions([]), { key: 'private-key', fetchImpl: async () => new Response('private body', { status: 403 }) }), /HTTP 403; use a key authorized to read this inbox/);
});
