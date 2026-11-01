import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, mkdir, symlink } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { integrationSnapshot, assertSameIntegration, newEvidenceDirectory, runPremerge } from './premerge.mjs';

const root = await mkdtemp(path.join(os.tmpdir(), 'jumpybrain-integration-gate-'));
const git = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: 'pipe' }).trim();
const commit = () => { git(['add', '.']); git(['-c', 'user.name=M1 fixture', '-c', 'user.email=m1@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'integration fixture']); };
let checks = 0;
try {
  git(['init', '-q']); await writeFile(path.join(root, '.gitignore'), '.local-pack/\n'); commit();
  git(['branch', 'target']);
  const initial = integrationSnapshot(root, 'target');
  assert.equal(initial.head, initial.targetSha); checks++;
  const eligible = await runPremerge({ root, target: 'target', checkOnly: true });
  assert.equal(eligible.status, 'eligible'); assert.equal(eligible.verified, false); checks++;
  await writeFile(path.join(root, 'dirty.txt'), 'unfinished');
  assert.throws(() => integrationSnapshot(root, 'target'), /clean committed/); checks++;
  commit(); const candidate = integrationSnapshot(root, 'target');
  assert.notEqual(candidate.head, initial.head);
  assert.throws(() => assertSameIntegration(initial, candidate), /moved/); checks++;
  git(['branch', 'candidate']);
  git(['checkout', '-q', 'target']);
  await writeFile(path.join(root, 'target-change.txt'), 'new user behavior'); commit();
  git(['checkout', '-q', 'candidate']);
  assert.throws(() => integrationSnapshot(root, 'target'), /not integrated/); checks++;
  assert.throws(() => integrationSnapshot(root, '--bad-ref'), /explicit target/); checks++;
  await assert.rejects(newEvidenceDirectory(root, path.join(root, 'source/evidence')), /new output below/); checks++;
  const alias = path.join(root, '.local-pack/multiplayer/alias');
  await mkdir(path.dirname(alias), { recursive: true });
  await symlink(path.join(root, '.local-pack'), alias, 'dir');
  await assert.rejects(newEvidenceDirectory(root, path.join(alias, 'evidence')), /symbolic link/); checks++;
  const directory = path.join(root, '.local-pack/multiplayer/exclusive');
  await newEvidenceDirectory(root, directory);
  await assert.rejects(newEvidenceDirectory(root, directory), /EEXIST/); checks++;
  console.log(JSON.stringify({ version: 1, status: 'passed', checks, scope: 'integration ancestry/cleanliness/identity and exclusive safe output; behavior runner is separately required' }));
} finally { await rm(root, { recursive: true, force: true }); }
