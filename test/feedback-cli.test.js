import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parseArgs } from '../dist/cli/args.js';
import { agentInstructions } from '../dist/cli/instructions.js';

const id = '12345678-1234-4234-8234-123456789abc';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
// Test every command through the real binary with a fetch substitute; no live mail.
function cli(args, { input = '', mode = 'forbid', endpoint, env = {} } = {}) {
  const preload = `
    import assert from 'node:assert/strict';
    const mode = ${JSON.stringify(mode)};
    globalThis.fetch = async (url, options) => {
      if (mode === 'forbid') throw new Error('Unexpected network request');
      assert.equal(url.href, 'https://feedback.example/support/feedback');
      assert.equal(options.method, 'POST');
      assert.equal(options.redirect, 'error');
      assert.ok(options.signal instanceof AbortSignal);
      assert.deepEqual(options.headers, { 'Content-Type': 'application/json' });
      const report = JSON.parse(options.body);
      assert.deepEqual(Object.keys(report).sort(), ['diagnostics', 'id', 'message']);
      assert.equal(report.diagnostics, null);
      assert.equal(report.message, 'Version 1: expected A, got B 🐐\\n');
      assert.equal(report.id, '${id}');
      if (mode === 'throw') throw new Error('private-server-secret');
      if (mode === 'mismatch') return Response.json({ accepted: true, id: 'wrong' });
      if (mode === 'bad-json') return new Response('private-server-secret');
      if (mode === 'http-error') return new Response('private-server-secret', { status: 503 });
      return Response.json({ accepted: true, id: report.id });
    };
  `;
  return spawnSync(process.execPath, ['--import', `data:text/javascript,${encodeURIComponent(preload)}`, 'dist/cli.js', 'feedback', ...args], {
    cwd: process.cwd(), encoding: 'utf8', input, timeout: 10_000,
    env: { ...process.env, JUMPYBRAIN_FEEDBACK_URL: endpoint ?? 'https://feedback.example/support/feedback',
      JUMPYBRAIN_API_KEY: 'private-brain-key', JUMPYBRAIN_CLI_CONFIG: '/unreadable/feedback-test-policy.json', ...env },
  });
}

const message = 'Version 1: expected A, got B 🐐\n';

test('CLI feedback sends only explicit text through the shared relay without brain credentials or policy', () => {
  for (const args of [['--message', message], []]) {
    const result = cli([...args, '--id', id, '--json'], { input: message, mode: 'accept' });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), { accepted: true, id });
    assert.equal(result.stderr, '');
  }
  const plain = cli(['--message', message, '--id', id], { mode: 'accept' });
  assert.equal(plain.status, 0, plain.stderr);
  assert.match(plain.stdout, /accepted by the support service/);
  assert.doesNotMatch(plain.stdout, /inbox|private-brain-key/);
});

test('feedback preview returns exact text, a reusable ID and null diagnostics without loading endpoint', () => {
  const result = cli(['--message=Exact\ntext 🐐', '--dry-run', '--json'], { endpoint: 'invalid URL', input: 'ignored stdin' });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.dryRun, true);
  assert.match(output.report.id, uuid);
  assert.equal(output.report.message, 'Exact\ntext 🐐');
  assert.equal(output.report.diagnostics, null);
  assert.equal(Object.hasOwn(output, 'accepted'), false);
  const repeated = cli(['--id', output.report.id, '--dry-run', '--json'], { input: output.report.message });
  assert.deepEqual(JSON.parse(repeated.stdout), output);
});

test('feedback supports bounded piped UTF-8 text and enforces the UI character limit', () => {
  for (const input of ['x'.repeat(4000), '🐐'.repeat(2000), 'é'.repeat(4000)]) {
    const result = cli(['--dry-run', '--json'], { input });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).report.message, input);
  }
  for (const input of ['', ' \n\t', 'x'.repeat(4001), '🐐'.repeat(2001), 'x'.repeat(100000)]) {
    const result = cli(['--dry-run', '--json'], { input });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Feedback.*4,000/);
    assert.equal(result.stdout, '');
  }
  const result = cli(['--message', 'x'.repeat(4001)]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /4,000/);
});

test('feedback parsing rejects target flags, typos, duplicates, valued booleans and invalid IDs before input', () => {
  for (const args of [
    ['--root', '/secret'], ['--target-url'], ['--remote-url=https://private'], ['--include-logs'],
    ['--message'], ['--message='], ['--message', ' '], ['--message', 'a', '--message=b'],
    ['--json=false'], ['--dry-run=false'], ['--json', 'false'], ['--json', '--json'],
    ['unexpected'], ['--id', 'invalid'], ['--id', id, '--id', id],
  ]) assert.throws(() => parseArgs(['feedback', ...args]), undefined, args.join(' '));
  const result = cli(['--target-url', 'https://private']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unknown feedback flag/);
  assert.doesNotMatch(result.stderr, /API key|ENOENT|private-brain-key/);
});

test('feedback unavailable and unconfirmed delivery return nonzero sanitized receipts with stable IDs', () => {
  for (const mode of ['throw', 'mismatch', 'bad-json', 'http-error']) {
    const result = cli(['--message', message, '--id', id, '--json'], { mode });
    assert.equal(result.status, 1, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.accepted, false);
    assert.equal(output.id, id);
    assert.equal(output.error.code, 'feedback_unconfirmed');
    assert.match(output.error.message, /do not retry automatically/);
    assert.doesNotMatch(result.stdout + result.stderr, /private-server-secret|private-brain-key/);
  }
  const result = cli(['--message', message, '--id', id, '--json'], { endpoint: '' });
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stdout).error.code, 'feedback_unavailable');
  const plain = cli(['--message', message, '--id', id], { mode: 'throw' });
  assert.equal(plain.status, 1);
  assert.equal(plain.stdout, '');
  assert.match(plain.stderr, /could not be confirmed/);
  assert.match(plain.stderr, new RegExp(id));
  for (const endpoint of ['http://insecure.example', 'https://user:private-server-secret@host.example', 'invalid']) {
    const invalid = cli(['--message', message, '--id', id, '--json'], { endpoint });
    assert.equal(invalid.status, 1);
    assert.equal(JSON.parse(invalid.stdout).error.code, 'feedback_unconfirmed');
    assert.doesNotMatch(invalid.stdout + invalid.stderr, /private-server-secret/);
  }
});

test('feedback help and both agent instruction surfaces expose explicit authorized support reporting', () => {
  const help = cli(['--help'], { endpoint: 'invalid' });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /user authorization/);
  assert.match(help.stdout, /--dry-run/);
  for (const instructions of [agentInstructions(), readFileSync('skills/jumpybrain-memory/SKILL.md', 'utf8')]) {
    assert.match(instructions, /feedback --message/);
    assert.match(instructions, /--dry-run/);
    assert.match(instructions, /authoriz/);
    assert.match(instructions, /retry automatically/);
  }
});
