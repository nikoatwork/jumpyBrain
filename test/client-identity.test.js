import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readIdentity, writeIdentity } from '../dist/adapters/client-identity/index.js';
import { actorFromArgs } from '../dist/cli/recognition.js';
import { parseArgs } from '../dist/cli/args.js';

const exec = promisify(execFile);
test('CLI setup and actor declarations share a private preference; rename affects only future declarations', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'jb-identity-'));
  const file = path.join(directory, 'identity.json');
  const previous = process.env.JUMPYBRAIN_IDENTITY_FILE;
  process.env.JUMPYBRAIN_IDENTITY_FILE = file;
  t.after(async () => { if (previous === undefined) delete process.env.JUMPYBRAIN_IDENTITY_FILE; else process.env.JUMPYBRAIN_IDENTITY_FILE = previous; await rm(directory, { recursive: true, force: true }); });
  assert.deepEqual(await readIdentity(), { name: '' });
  const cli = (...args) => exec(process.execPath, ['dist/cli.js', 'identity', ...args, '--json'], { env: process.env });
  assert.equal(JSON.parse((await cli('--name', ' Alex ')).stdout).name, 'Alex');
  assert.equal((await stat(file)).mode & 0o777, 0o600);
  const actor = await actorFromArgs(parseArgs(['remember', '--title', 'Fixture', '--actor', 'agent', '--actor-name', 'Codex']));
  assert.deepEqual(actor, { kind: 'agent', name: 'Alex · Codex' });
  assert.equal(await actorFromArgs({ _: [], actor: 'unknown' }), undefined);
  assert.equal(await actorFromArgs({ _: [] }), undefined, 'setup never attributes omitted actors');
  assert.deepEqual(await actorFromArgs({ _: [], actor: 'human' }), { kind: 'human', name: 'Alex' });
  assert.deepEqual(await actorFromArgs({ _: [], actor: 'agent', 'actor-name': 'Alex · Codex' }), actor, 'no duplicate owner prefix');
  await writeIdentity('Sam');
  assert.equal((await actorFromArgs({ _: [], actor: 'agent', 'actor-name': 'Codex' })).name, 'Sam · Codex');
  assert.equal(actor.name, 'Alex · Codex');
  assert.equal(JSON.parse((await cli('--name', '')).stdout).name, '');
  assert.equal(JSON.parse((await cli()).stdout).name, '');
  const before = await readFile(file, 'utf8');
  for (const invalid of ['x'.repeat(49), 'name\nother', null]) await assert.rejects(writeIdentity(invalid), { code: 'invalid_identity' });
  assert.equal(await readFile(file, 'utf8'), before);
  await writeFile(file, 'broken');
  await assert.rejects(readIdentity(), /Could not read/);
  await writeIdentity('Recovered');
  assert.equal((await readIdentity()).name, 'Recovered');
});

test('identity CLI rejects misspellings, repeated options and remote destinations', () => {
  for (const args of [['--name'], ['--name', 'Alex', '--name', 'Sam'], ['--remote-url', 'https://brain.example'], ['--json=true'], ['--nmae', 'Alex']]) {
    assert.throws(() => parseArgs(['identity', ...args]));
  }
});
