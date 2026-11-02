import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from '../dist/cli/args.js';
import { commandUsage, helpForArgv, usage } from '../dist/cli/usage.js';

const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url));

test('every command, namespace operation and recipe answers early help under negative side-effect sentinels', () => {
  const scratch = mkdtempSync(path.join(os.tmpdir(), 'jumpy-help-'));
  try {
    const result = JSON.parse(execFileSync(process.execPath, [fileURLToPath(new URL('./fixtures/cli-help-sentinels.mjs', import.meta.url))], {
      cwd: scratch, encoding: 'utf8', timeout: 20_000,
      env: { ...process.env, HOME: scratch, JUMPYBRAIN_API_KEY: '', JUMPYBRAIN_CLI_CONFIG: path.join(scratch, 'unreadable') },
    }));
    assert.ok(result.cases > 250);
    assert.deepEqual(result.sideEffects, []);
  } finally { rmSync(scratch, { recursive: true, force: true }); }
});

test('root help stays short; command help keeps flags, update modes and recipe targeting useful', () => {
  assert.ok(usage().split('\n').length <= 15);
  assert.match(commandUsage(['recall']), /--compact.*--max-bytes/u);
  assert.match(commandUsage(['recall']), /--reference-date/u);
  assert.match(commandUsage(['update']), /--dry-run/u);
  assert.match(commandUsage(['update']), /--if-match/u);
  assert.match(commandUsage(['run', 'memory:update']), /jumpybrain run memory:update/u);
  assert.match(commandUsage(['board', 'add']), /--page.*--column.*--if-match/u);
  assert.match(commandUsage(['extensions', 'check']), /disposable/u);
  assert.equal(helpForArgv(['update', '--bad', '--help']), commandUsage(['update']));
  assert.equal(helpForArgv(['remember', '--title', '--help']), commandUsage(['remember']));
  assert.equal(helpForArgv(['update', '--message=--help']), undefined);
});

test('legacy parser gaps reject unknown, repeated, missing and valued boolean flags', () => {
  for (const prefix of [['recall'], ['search'], ['run', 'memory:recall'], ['run', 'memory:search']]) {
    for (const tail of [
      ['--qurey', 'anything'], ['--topic', 'x', '--topic', 'y'], ['--query'], ['--query', '--json'],
      ['--limit'], ['--json=false'], ['--json', 'false'], ['--unexpected'], ['unexpected'],
    ]) assert.throws(() => parseArgs([...prefix, ...tail]), /Unknown|Unexpected|repeated|requires a value|takes no value/u, [...prefix, ...tail].join(' '));
  }
  for (const prefix of [['status'], ['index'], ['tree'], ['overview'], ['show'], ['update'], ['process'], ['init'], ['serve'], ['wrapup'], ['run', 'memory:show'], ['run', 'memory:update'], ['run', 'memory:process']]) {
    assert.throws(() => parseArgs([...prefix, '--typo']), /Unknown/u);
    assert.throws(() => parseArgs([...prefix, '--json', '--json']), /repeated/u);
    assert.throws(() => parseArgs([...prefix, '--json=false']), /takes no value/u);
  }
  for (const argv of [
    ['show', '--id'], ['status', '--root'], ['update', '--install-root'], ['update', '--id', 'x', '--if-match'],
    ['process', '--apply', '--apply=false'], ['index', '--rebuild', '--rebuild'], ['index', '--semantic-model'],
    ['tree', '--limit'], ['serve', '--api-key'], ['wrapup', '--tag'], ['backend', 'status', '--root'],
    ['access', 'issue', '--name'], ['collaborate', 'open', '--id'],
  ]) assert.throws(() => parseArgs(argv), /requires a value|repeated/u, argv.join(' '));
  assert.throws(() => parseArgs(['dream', '--json', '--json']), /repeated/u);
  assert.throws(() => parseArgs(['--root', '/fixture', 'recall', '--qurey', 'hello']), /Unknown/u);
  assert.throws(() => parseArgs(['index', '--lexical', '--semantic-model', '/model.gguf']), /only one/u);
});

test('strict token parsing preserves deliberate repeatable flags, equals values, aliases and apply authorization', () => {
  assert.deepEqual(parseArgs(['recall', '--query=hello', '--root=/fixture', '--limit=3']), { _: ['recall'], query: 'hello', root: '/fixture', limit: '3' });
  assert.deepEqual(parseArgs(['tree', '--showFiles', '--remote-url', 'https://memory.invalid']), { _: ['tree'], showFiles: true, 'remote-url': 'https://memory.invalid' });
  assert.deepEqual(parseArgs(['wrapup', '--tag', 'one', '--tag=two']).tag, ['one', 'two']);
  assert.deepEqual(parseArgs(['serve', '--api-key', 'one', '--api-key=two'])['api-key'], ['one', 'two']);
  for (const spelling of [[], ['true'], ['false']]) {
    const parsed = parseArgs(['process', '--apply', ...spelling]);
    assert.equal(parsed.apply, spelling[0] ?? true);
  }
  assert.equal(parseArgs(['run', 'memory:process', '--apply=false']).apply, 'false');
  assert.equal(parseArgs(['remember', '--dream=false']).dream, 'false');
  assert.deepEqual(parseArgs(['--root', '/fixture', 'recall', '--query', 'hello']), { _: ['recall'], root: '/fixture', query: 'hello' });
  assert.match(commandUsage(['run', 'memory:update']), /^Usage:.*--id <mem_id>/u);
  assert.doesNotMatch(commandUsage(['run', 'memory:update']), /--dry-run/u);
});

test('executable argument errors stay on stderr before remote policy, secrets or backend work', () => {
  for (const argv of [
    ['recall', '--qurey', 'hello'], ['run', 'memory:search', '--query'], ['show', '--idd', 'x'],
    ['index', '--rebulid'], ['process', '--aply'], ['status', '--json=false'],
  ]) {
    const result = spawnSync(process.execPath, [cli, ...argv, '--target-url', 'https://help.invalid'], {
      encoding: 'utf8', timeout: 5000,
      env: { ...process.env, JUMPYBRAIN_API_KEY: '', JUMPYBRAIN_CLI_CONFIG: '' },
    });
    assert.equal(result.status, 1, argv.join(' '));
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /Unknown|requires a value|takes no value/u);
    assert.doesNotMatch(result.stderr, /JUMPYBRAIN_API_KEY|JUMPYBRAIN_CLI_CONFIG|fetch|backend/u);
  }
});
