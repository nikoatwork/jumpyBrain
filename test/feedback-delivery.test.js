import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import { createAgentMailSender, createFeedbackForwarder, createFeedbackHandler, validateFeedback } from '../dist/adapters/http-server/feedback-delivery.js';

const report = { id: '12345678-1234-4234-8234-123456789abc', message: 'Feedback 🐐', diagnostics: '{"safe":true}' };
async function fixture(t, send) {
  const handler = createFeedbackHandler(send);
  const server = http.createServer((req, res) => void handler(req, res).catch(() => res.destroy()));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return (body = report, options = {}) => fetch(`http://127.0.0.1:${server.address().port}/feedback`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), ...options,
  });
}

test('feedback validates bounded fixed fields and supports diagnostic opt-out', () => {
  assert.deepEqual(validateFeedback(report), report);
  assert.deepEqual(validateFeedback({ ...report, diagnostics: null }), { ...report, diagnostics: null });
  for (const bad of [null, [], { ...report, id: '../bad' }, { ...report, message: ' ' }, { ...report, message: 'x'.repeat(4001) },
    { ...report, diagnostics: '🐐'.repeat(6001) }, { ...report, diagnostics: undefined }, { ...report, to: 'attacker@example.com' }]) {
    assert.throws(() => validateFeedback(bad));
  }
});

test('feedback receiver acknowledges only successful delivery and keeps errors generic', async t => {
  const sent = [];
  const post = await fixture(t, async value => { if (value.message === 'fail') throw new Error('secret-token'); sent.push(value); });
  let response = await post();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { accepted: true, id: report.id });
  assert.deepEqual(sent, [report]);
  response = await post({ ...report, message: 'fail' });
  assert.equal(response.status, 503); assert.doesNotMatch(await response.text(), /secret-token|accepted/);
  assert.equal((await post({ ...report, to: 'elsewhere' })).status, 400);
  assert.equal((await post(report, { headers: { 'Content-Type': 'text/plain' } })).status, 415);
  assert.equal((await post(undefined, { method: 'GET', body: undefined })).status, 405);
  assert.equal((await post({ ...report, message: 'x'.repeat(70000) })).status, 413);
  assert.equal(sent.length, 1);
});

test('feedback receiver limits public request rate', async t => {
  let sends = 0;
  const post = await fixture(t, async () => { sends++; });
  for (let i = 0; i < 100; i++) assert.equal((await post()).status, 200);
  const blocked = await post();
  assert.equal(blocked.status, 429); assert.equal(sends, 100);
  assert.equal(blocked.headers.get('retry-after'), '3600');
});

test('forwarder uses only configured HTTPS destination and never forwards app credentials', async () => {
  for (const url of ['http://example.com/feedback', 'https://name:secret@example.com/feedback', 'https://example.com/#fragment']) assert.throws(() => createFeedbackForwarder(url));
  let request;
  await createFeedbackForwarder('https://feedback.example/feedback', async (url, options) => {
    request = { url, options }; return Response.json({ accepted: true, id: report.id });
  })(report);
  assert.equal(request.url.href, 'https://feedback.example/feedback');
  assert.deepEqual(request.options.headers, { 'Content-Type': 'application/json' });
  assert.equal(request.options.redirect, 'error');
  assert.deepEqual(JSON.parse(request.options.body), report);
  for (const response of [Response.json({ accepted: false }), Response.json({ accepted: true, id: 'wrong' }), new Response('x'.repeat(9000)), new Response('', { status: 503 })]) {
    await assert.rejects(createFeedbackForwarder('https://feedback.example/feedback', async () => response)(report));
  }
});

test('AgentMail receives only the fixed recipient, optional attachment and stable retry key', async () => {
  const requests = [];
  const send = createAgentMailSender({ apiKey: 'private-mail-key', inbox: 'sender@agentmail.to', fetchImpl: async (url, options) => {
    requests.push({ url, options }); return Response.json({ message_id: 'confirmed-id' });
  } });
  await send(report); await send(report); await send({ ...report, diagnostics: null });
  assert.equal(requests[0].options.headers['Idempotency-Key'], requests[1].options.headers['Idempotency-Key']);
  const body = JSON.parse(requests[0].options.body);
  assert.deepEqual(body.to, ['jumpybrain@agentmail.to']);
  assert.equal(body.text, report.message);
  assert.equal(Buffer.from(body.attachments[0].content, 'base64').toString(), report.diagnostics);
  assert.equal(JSON.parse(requests[2].options.body).attachments, undefined);
  assert.doesNotMatch(requests[0].options.body, /private-mail-key/);
  await assert.rejects(createAgentMailSender({ apiKey: 'key', inbox: 'inbox', fetchImpl: async () => Response.json({}) })(report));
});

test('hosted feedback requires app authentication before calling the relay', async t => {
  const { createJumpyBrainHttpServer } = await import('../dist/adapters/http-server/index.js');
  const sent = [];
  const logger = { log() {}, info() {}, warn() {}, error() {} };
  const server = createJumpyBrainHttpServer({ root: '/unused-feedback-fixture', apiKeys: ['app-secret'], logger,
    feedbackSender: async value => { sent.push(value); } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/feedback`;
  const options = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(report) };
  assert.equal((await fetch(url, options)).status, 401);
  assert.equal(sent.length, 0);
  const response = await fetch(url, { ...options, headers: { ...options.headers, Authorization: 'Bearer app-secret' } });
  assert.equal(response.status, 200);
  assert.deepEqual(sent, [report]);
});

test('relay without mail configuration fails closed without accepting a report', async t => {
  const post = await fixture(t, undefined);
  const response = await post();
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, 'feedback_unavailable');
});

test('an empty runtime feedback URL disables delivery despite the bundled default', async t => {
  const previous = process.env.JUMPYBRAIN_FEEDBACK_URL;
  t.after(() => {
    if (previous === undefined) delete process.env.JUMPYBRAIN_FEEDBACK_URL;
    else process.env.JUMPYBRAIN_FEEDBACK_URL = previous;
  });
  process.env.JUMPYBRAIN_FEEDBACK_URL = '';
  let called = false;
  const send = createFeedbackForwarder(undefined, async () => { called = true; return Response.json({ accepted: true, id: report.id }); });
  await assert.rejects(send(report), /feedback_unavailable/);
  assert.equal(called, false);
});
