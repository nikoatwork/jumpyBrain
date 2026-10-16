import assert from 'node:assert/strict';
import test from 'node:test';
import { createFeedbackDiagnostics, feedbackEmailDraft, feedbackMailto } from '../dist/adapters/http-server/feedback.js';
import { isFeedbackMailto, isFeedbackDownload } from '../integrations/electron/host.mjs';

test('feedback diagnostics bound history and capture safe facts without request or environment secrets', () => {
  const log = createFeedbackDiagnostics(() => new Date('2026-10-16T12:00:00Z'));
  for (let i = 0; i < 50; i++) log.record('/memories/all/documents/private-id?key=secret&query=private', 'PUT', 200 + i);
  log.record('/memories/all/search?query=private', 'POST', 'failed');
  log.record('https://private-host/secret-path', 'private-method', 'aborted');
  const text = log.snapshot({ view: 'private-title', connection: 'private-key', companion: true }, 'Mozilla/5.0 (Macintosh; private-user) Electron/44.8.0 private-path');
  assert.doesNotMatch(text, /private|secret/);
  const data = JSON.parse(text);
  assert.equal(data.events.length, 40);
  assert.equal(data.platform, 'macOS');
  assert.equal(data.browser, 'Electron/44.8.0');
  assert.equal(data.events[0].outcome, 212);
  assert.deepEqual(data.events.at(-2), { at: '2026-10-16T12:00:00.000Z', operation: 'search', method: 'POST', outcome: 'failed' });
});

function parts(email) {
  return [...email.matchAll(/Content-Transfer-Encoding: base64\r\n\r\n([A-Za-z0-9+/=\r\n]*?)\r\n--/g)]
    .map((match) => Buffer.from(match[1], 'base64').toString('utf8'));
}
test('email draft contains a Unicode body and optional real attachment with safe headers', () => {
  const message = 'A bug 🐐\nTo: attacker@example.org\n--jumpybrain-feedback-boundary';
  const logs = '{"safe":"ö"}';
  const email = feedbackEmailDraft(message, logs);
  assert.match(email, /^To: jumpybrain@agentmail.to\r\nSubject: jumpyBrain beta feedback\r\nX-Unsent: 1\r\n/);
  assert.match(email, /Content-Disposition: attachment; filename="jumpybrain-diagnostics.txt"/);
  assert.deepEqual(parts(email), [message.replaceAll('\n', '\r\n'), logs]);
  assert.doesNotMatch(email, /attacker@example/);
  const without = feedbackEmailDraft(message, null);
  assert.doesNotMatch(without, /Content-Disposition: attachment|diagnostics.txt/);
  assert.deepEqual(parts(without), [message.replaceAll('\n', '\r\n')]);
});

test('mailto fallback preserves text, defaults to inline logs, and honors opt-out', () => {
  const url = new URL(feedbackMailto('a & b? 🐐\nBcc: nobody', 'safe log'));
  assert.equal(url.pathname, 'jumpybrain@agentmail.to');
  assert.equal(url.searchParams.get('subject'), 'jumpyBrain beta feedback');
  assert.equal(url.searchParams.get('body'), 'a & b? 🐐\nBcc: nobody\n\nDiagnostic log (inline):\nsafe log');
  assert.equal(url.searchParams.has('bcc'), false);
  assert.equal(new URL(feedbackMailto('test', null)).searchParams.get('body'), 'test');
});

test('Electron permits only the fixed support recipient and draft blob downloads', () => {
  const mailto = feedbackMailto('hello', 'safe');
  assert.equal(isFeedbackMailto(mailto), true);
  for (const bad of [mailto.replace('jumpybrain@agentmail.to', 'elsewhere@example.com'), mailto + '&bcc=other@example.com',
    mailto + '&body=second', mailto + '#fragment', 'mailto:jumpybrain@agentmail.to', 'https://agentmail.to',
    mailto.replace('jumpybrain@agentmail.to', '//jumpybrain@agentmail.to')]) assert.equal(isFeedbackMailto(bad), false, bad);
  const origin = 'http://127.0.0.1:3787';
  const download = { url: `blob:${origin}/id`, filename: 'jumpybrain-feedback.eml', mime: 'message/rfc822', size: 2000 };
  assert.equal(isFeedbackDownload(download, origin), true);
  for (const change of [{ url: 'https://example.com/file' }, { url: 'blob:http://localhost:3787/id' },
    { filename: 'other.eml' }, { filename: '../jumpybrain-feedback.eml' }, { mime: 'text/html' }, { size: 65537 }, { size: -1 }]) {
    assert.equal(isFeedbackDownload({ ...download, ...change }, origin), false);
  }
});
