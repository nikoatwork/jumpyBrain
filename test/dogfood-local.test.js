import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile, rm, access } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { snapshot, matchesCandidate, desktopEnvironment } from '../scripts/dogfood-local.mjs';

test('candidate captures exact committed files and excludes dirty work and local secrets', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dogfood-source-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const checkout = path.join(root, 'repo'), destination = path.join(root, 'candidate');
  await mkdir(path.join(checkout, 'integrations/electron'), { recursive: true });
  await mkdir(destination);
  const git = (...args) => execFileSync('git', args, { cwd: checkout, encoding: 'utf8' });
  git('init'); git('config', 'user.name', 'Fixture'); git('config', 'user.email', 'fixture@example.invalid');
  for (const file of ['package.json', 'integrations/electron/package.json']) await writeFile(path.join(checkout, file), JSON.stringify({ version: '0.3.12' }));
  await writeFile(path.join(checkout, 'example.txt'), 'committed');
  git('add', '.'); git('commit', '-m', 'fixture');
  const commit = git('rev-parse', 'HEAD').trim();
  await writeFile(path.join(checkout, 'example.txt'), 'unfinished edit');
  await writeFile(path.join(checkout, '.env'), 'PRIVATE=not-to-copy');
  const result = await snapshot(checkout, destination);
  assert.equal(result.commit, commit);
  assert.equal(await readFile(path.join(result.source, 'example.txt'), 'utf8'), 'committed');
  await assert.rejects(access(path.join(result.source, '.env')));
  assert.equal(JSON.parse(await readFile(path.join(result.source, 'package.json'))).jumpybrain.localBuild.commit, commit);
  assert.equal(await readFile(path.join(checkout, 'example.txt'), 'utf8'), 'unfinished edit');
  await assert.rejects(snapshot(checkout, path.join(root, 'bad'), '--output=oops'));
});

test('status rejects a published replacement or mismatched app/CLI even at the same base version', () => {
  const receipt = { phase: 'installed', commit: 'abc', version: '0.3.12' };
  const candidate = { version: '0.3.12', jumpybrain: { localBuild: { commit: 'abc' } } };
  assert.equal(matchesCandidate(receipt, candidate, candidate, '0.3.12'), true);
  assert.equal(matchesCandidate(receipt, { version: '0.3.12' }, candidate, '0.3.12'), false);
  assert.equal(matchesCandidate(receipt, candidate, { ...candidate, version: '0.3.13' }, '0.3.12'), false);
  assert.equal(matchesCandidate(receipt, candidate, candidate, '0.3.13'), false);
  assert.equal(matchesCandidate({ ...receipt, phase: 'rolled-back' }, candidate, candidate, '0.3.12'), false);
});


test('desktop launch strips agent Node mode without mutating the parent environment', () => {
  const environment = { PATH: '/usr/bin', ELECTRON_RUN_AS_NODE: '1' };
  assert.deepEqual(desktopEnvironment(environment), { PATH: '/usr/bin' });
  assert.equal(environment.ELECTRON_RUN_AS_NODE, '1');
});
