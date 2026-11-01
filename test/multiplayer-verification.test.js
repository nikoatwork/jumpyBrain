import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, readFile, writeFile, rm, copyFile, symlink } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { runGate, assessCheck, executeCheck, readBaseline, tapSummary, assertTreeFingerprints, installedDependencyIdentity } from '../scripts/multiplayer-verify.mjs';

const digest = (value) => createHash('sha256').update(value).digest('hex');
const tap = '# tests 1\n# pass 1\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n';
const environment = { node: process.version, npm: 'fixture', platform: 'fixture', arch: 'fixture', qmd: { version: 'fixture', executableHash: 'fixture' }, browser: 'fixture', browserChannel: 'fixture', semanticModelHash: null };
const canonicalSource = "export const body = 'canonical body';\n";

async function fixture(t) {
  const parent = await mkdtemp(path.join(os.tmpdir(), 'jumpybrain-parity-gate-'));
  const root = path.join(parent, 'source');
  t.after(() => rm(parent, { recursive: true, force: true }));
  await mkdir(path.join(root, 'scripts'), { recursive: true });
  await mkdir(path.join(root, 'test'), { recursive: true });
  await mkdir(path.join(root, 'src'), { recursive: true });
  await writeFile(path.join(root, 'src/index.js'), canonicalSource);
  await writeFile(path.join(root, 'package.json'), JSON.stringify({ scripts: { test: 'fixture semantic assertions' } }));
  await copyFile(new URL('../scripts/multiplayer-verify.mjs', import.meta.url), path.join(root, 'scripts/multiplayer-verify.mjs'));
  const assertion = "import assert from 'node:assert/strict'; import fs from 'node:fs'; fs.mkdirSync('dist', { recursive: true }); fs.copyFileSync('src/index.js', 'dist/index.mjs'); const actual = await import('../dist/index.mjs'); assert.equal(actual.body, 'canonical body'); console.log(" + JSON.stringify(tap) + ");\n";
  await writeFile(path.join(root, 'test/assertion.mjs'), assertion);
  const contract = { version: 1, assertionRoots: ['test'], limits: ['synthetic verification-tool test'], checks: [{ id: 'semantic-fixture', command: ['node', 'test/assertion.mjs'], timeoutMs: 10000, tap: true }] };
  await writeFile(path.join(root, 'contract.json'), JSON.stringify(contract));
  const git = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: 'pipe' });
  git(['init', '-q']);
  git(['add', 'src', 'scripts', 'test', 'package.json', 'contract.json']);
  git(['-c', 'user.name=Parity Fixture', '-c', 'user.email=parity@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'Synthetic verification fixture']);
  const invoke = (mode, options = {}) => runGate({ mode, root, contractFile: 'contract.json', out: path.join(parent, mode + '-' + Math.random().toString(16).slice(2)), probe: async () => environment, log() {}, ...options });
  const baseline = path.join(parent, 'baseline');
  const capture = async () => {
    const result = await invoke('capture', { out: baseline });
    assert.equal(result.status, 'passed', JSON.stringify(result));
    return result.manifestSha256;
  };
  const commit = () => { git(['add', 'src']); git(['-c', 'user.name=Parity Fixture', '-c', 'user.email=parity@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'Synthetic candidate change']); };
  return { parent, root, baseline, invoke, capture, contract, commit };
}

test('a baseline freezes runtime artifacts and semantic assertions; unchanged candidate reproduces it', async (t) => {
  const f = await fixture(t), hash = await f.capture();
  const manifest = await readBaseline(f.baseline, hash);
  assert.equal(manifest.integrity['runtime/index.mjs'], digest(canonicalSource));
  assert.ok(manifest.integrity['assertions/test/assertion.mjs']);
  const result = await f.invoke('verify', { baseline: f.baseline, baselineSha256: hash });
  assert.equal(result.status, 'passed', JSON.stringify(result));
  assert.equal(result.checks[0].observation.tests, 1);
  assert.equal(digest(await readFile(path.join(f.baseline, 'manifest.json'))), hash, 'verification cannot refresh baseline expectations');
});

test('baseline artifact tampering is blocked even when its neighboring manifest remains intact', async (t) => {
  const f = await fixture(t), hash = await f.capture();
  await writeFile(path.join(f.baseline, 'runtime/index.mjs'), 'tampered runtime');
  const result = await f.invoke('verify', { baseline: f.baseline, baselineSha256: hash });
  assert.equal(result.status, 'blocked');
  assert.match(result.error, /Baseline evidence changed: runtime\/index.mjs/);
});

test('manifest rewrites cannot authorize themselves through an editable neighboring digest file', async (t) => {
  const f = await fixture(t), hash = await f.capture();
  const file = path.join(f.baseline, 'manifest.json');
  const manifest = JSON.parse(await readFile(file));
  manifest.checks = [];
  await writeFile(file, JSON.stringify(manifest));
  await writeFile(path.join(f.baseline, 'manifest.sha256'), digest(await readFile(file)));
  const result = await f.invoke('verify', { baseline: f.baseline, baselineSha256: hash });
  assert.equal(result.status, 'blocked');
  assert.match(result.error, /pinned digest/);
  await assert.rejects(readBaseline(f.baseline), /externally pinned/);
});

test('empty and incomplete protection inventories are rejected even with an explicitly re-pinned manifest', async (t) => {
  const f = await fixture(t);
  await f.capture();
  const file = path.join(f.baseline, 'manifest.json');
  const original = JSON.parse(await readFile(file));
  for (const key of ['assertions', 'harness', 'integrity']) {
    const manifest = { ...original, [key]: {} };
    await writeFile(file, JSON.stringify(manifest));
    await assert.rejects(readBaseline(f.baseline, digest(await readFile(file))), /incomplete baseline manifest/);
  }
  const manifest = structuredClone(original);
  delete manifest.assertions[Object.keys(manifest.assertions)[0]];
  await writeFile(file, JSON.stringify(manifest));
  await assert.rejects(readBaseline(f.baseline, digest(await readFile(file))), /incomplete baseline manifest|Baseline assertion inventory/);
  const omitted = structuredClone(original);
  delete omitted.integrity[Object.keys(omitted.integrity)[0]];
  await writeFile(file, JSON.stringify(omitted));
  await assert.rejects(readBaseline(f.baseline, digest(await readFile(file))), /Baseline evidence inventory/);
});

test('installed package versions must match locks and actual package bytes are identified', async (t) => {
  const f = await fixture(t), directory = path.join(f.root, 'node_modules/demo');
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(f.root, 'package-lock.json'), JSON.stringify({ lockfileVersion: 3, packages: {
    '': {}, 'node_modules/demo': { version: '1.0.0' },
    'node_modules/optional-platform': { version: '1.0.0', optional: true },
  } }));
  await writeFile(path.join(directory, 'package.json'), JSON.stringify({ name: 'demo', version: '1.0.0' }));
  await writeFile(path.join(directory, 'index.js'), 'original dependency bytes');
  const before = await installedDependencyIdentity(f.root);
  await writeFile(path.join(directory, 'index.js'), 'changed dependency bytes');
  const after = await installedDependencyIdentity(f.root);
  assert.notEqual(before.packages['node_modules/demo'].contentHash, after.packages['node_modules/demo'].contentHash);
  await writeFile(path.join(directory, 'package.json'), JSON.stringify({ name: 'demo', version: '0.9.0' }));
  await assert.rejects(installedDependencyIdentity(f.root), /disagrees with lock/);
  await rm(directory, { recursive: true });
  await assert.rejects(installedDependencyIdentity(f.root), /Missing locked dependency/);
});

test('a missing required baseline check cannot pass even with a newly supplied trusted manifest hash', async (t) => {
  const f = await fixture(t);
  await f.capture();
  const file = path.join(f.baseline, 'manifest.json');
  const manifest = JSON.parse(await readFile(file));
  manifest.checks = [];
  await writeFile(file, JSON.stringify(manifest));
  const result = await f.invoke('verify', { baseline: f.baseline, baselineSha256: digest(await readFile(file)) });
  assert.equal(result.status, 'blocked');
  assert.match(result.error, /required-check evidence is incomplete/);
});

for (const mutation of ['changed', 'removed']) {
  test('frozen semantic assertions cannot be ' + mutation + ' to make a candidate pass', async (t) => {
    const f = await fixture(t), hash = await f.capture();
    const file = path.join(f.root, 'test/assertion.mjs');
    if (mutation === 'changed') await writeFile(file, "console.log('weakened assertions');\n");
    else await rm(file);
    const result = await f.invoke('verify', { baseline: f.baseline, baselineSha256: hash });
    assert.equal(result.status, 'blocked');
    assert.match(result.error, /Frozen assertion/);
  });
}

test('contract drift and harness drift are blocked before running candidate commands', async (t) => {
  const f = await fixture(t), hash = await f.capture();
  await writeFile(path.join(f.root, 'contract.json'), JSON.stringify({ ...f.contract, checks: [] }));
  let result = await f.invoke('verify', { baseline: f.baseline, baselineSha256: hash });
  assert.equal(result.status, 'blocked');
  assert.match(result.error, /contract/);
  await writeFile(path.join(f.root, 'contract.json'), JSON.stringify(f.contract));
  await writeFile(path.join(f.root, 'scripts/multiplayer-verify.mjs'), 'weakened runner');
  result = await f.invoke('verify', { baseline: f.baseline, baselineSha256: hash });
  assert.equal(result.status, 'blocked');
  assert.match(result.error, /Frozen harness changed/);
});

test('runtime source dirtiness and environment mismatches remain blocked evidence', async (t) => {
  const f = await fixture(t), hash = await f.capture();
  await writeFile(path.join(f.root, 'src/index.js'), 'uncommitted runtime edit');
  let result = await f.invoke('capture');
  assert.equal(result.status, 'blocked');
  assert.match(result.error, /runtime edits must be committed/);
  await writeFile(path.join(f.root, 'src/index.js'), canonicalSource);
  result = await f.invoke('verify', { baseline: f.baseline, baselineSha256: hash, probe: async () => ({ ...environment, browser: 'different' }) });
  assert.equal(result.status, 'blocked');
  assert.match(result.error, /Controlled environment differs/);
});

test('a committed behavior regression fails the unchanged oracle, while equivalent implementation changes pass', async (t) => {
  const f = await fixture(t), hash = await f.capture();
  await writeFile(path.join(f.root, 'src/index.js'), "export const body = 'incorrect replacement';\n");
  f.commit();
  let result = await f.invoke('verify', { baseline: f.baseline, baselineSha256: hash });
  assert.equal(result.status, 'failed', JSON.stringify(result));
  assert.equal(result.checks[0].status, 'failed');
  await writeFile(path.join(f.root, 'src/index.js'), "export const body = 'canonical ' + 'body';\n");
  f.commit();
  result = await f.invoke('verify', { baseline: f.baseline, baselineSha256: hash });
  assert.equal(result.status, 'passed', JSON.stringify(result));
});

test('artifact additions, deletions and byte changes cannot be blessed as the tested file set', async (t) => {
  const f = await fixture(t);
  await mkdir(path.join(f.root, 'dist'));
  const file = path.join(f.root, 'dist/index.mjs');
  const expected = { 'dist/index.mjs': digest(canonicalSource) };
  await writeFile(file, canonicalSource);
  await assertTreeFingerprints(f.root, ['dist'], expected, 'Tested artifact');
  await writeFile(path.join(f.root, 'dist/unexecuted.mjs'), 'unexpected addition');
  await assert.rejects(assertTreeFingerprints(f.root, ['dist'], expected, 'Tested artifact'), /file set or bytes changed/);
  await rm(path.join(f.root, 'dist/unexecuted.mjs'));
  await writeFile(file, 'changed bytes');
  await assert.rejects(assertTreeFingerprints(f.root, ['dist'], expected, 'Tested artifact'), /file set or bytes changed/);
  await rm(file);
  await assert.rejects(assertTreeFingerprints(f.root, ['dist'], expected, 'Tested artifact'), /file set or bytes changed/);
});

test('missing prerequisite and failed commands never produce a passed capture', async (t) => {
  const f = await fixture(t);
  const result = await f.invoke('capture', { probe: async () => { throw new Error('QMD unavailable'); } });
  assert.equal(result.status, 'blocked');
  assert.match(result.error, /QMD unavailable/);
  assert.equal(result.checks[0].status, 'untested');
  assert.equal(assessCheck({}, { code: 0, error: 'ENOENT' }).status, 'blocked');
  assert.equal(assessCheck({}, { code: 1 }).status, 'failed');
  assert.equal(assessCheck({ markers: ['PASS canonical save'] }, { code: 0, output: 'success' }).status, 'failed');
});

test('skips, TODOs, zero tests, missing summaries and disappearing tests cannot satisfy parity', () => {
  const check = { tap: true }, run = (output, baseline) => assessCheck(check, { code: 0, output }, baseline);
  assert.equal(run(tap.replace('# skipped 0', '# skipped 1')).status, 'blocked');
  assert.equal(run(tap.replace('# todo 0', '# todo 1')).status, 'blocked');
  assert.equal(run(tap.replace('# tests 1', '# tests 0').replace('# pass 1', '# pass 0')).status, 'failed');
  assert.equal(run('all good').status, 'failed');
  assert.equal(run(tap, { observation: { tests: 2 } }).status, 'failed');
  assert.equal(run(tap.replace('# fail 0', '# fail 1')).status, 'failed');
  assert.equal(tapSummary(tap).pass, 1);
});

test('timeout and bounded-output failure kill the check rather than recording exit-zero success', async (t) => {
  const f = await fixture(t);
  const timeout = await executeCheck(f.root, { command: ['node', '-e', 'setInterval(() => {}, 1000)'], timeoutMs: 50 });
  assert.equal(timeout.timedOut, true);
  assert.equal(assessCheck({}, timeout).status, 'failed');
  const overflow = await executeCheck(f.root, { command: ['node', '-e', "process.stdout.write('x'.repeat(100000));"], timeoutMs: 10000 }, { maxBytes: 100 });
  assert.equal(overflow.overflow, true);
  assert.equal(assessCheck({}, overflow).status, 'failed');
});

test('evidence outputs are exclusive and verification cannot write into baseline or assertion directories', async (t) => {
  const f = await fixture(t), hash = await f.capture();
  await assert.rejects(f.invoke('capture', { out: f.baseline }), /EEXIST/);
  await assert.rejects(f.invoke('verify', { baseline: f.baseline, baselineSha256: hash, out: path.join(f.baseline, 'candidate') }), /must not modify/);
  await assert.rejects(f.invoke('capture', { out: path.join(f.root, 'dist/evidence') }), /outside mutable dist/);
});

test('symlinked output parents cannot bypass baseline or source directory protection', async (t) => {
  const f = await fixture(t), hash = await f.capture();
  const baselineAlias = path.join(f.parent, 'baseline-alias');
  const sourceAlias = path.join(f.parent, 'source-alias');
  await symlink(f.baseline, baselineAlias, 'dir');
  await symlink(path.join(f.root, 'src'), sourceAlias, 'dir');
  await assert.rejects(f.invoke('verify', { baseline: f.baseline, baselineSha256: hash, out: path.join(baselineAlias, 'nested/evidence') }), /must not modify/);
  await assert.rejects(f.invoke('capture', { out: path.join(sourceAlias, 'nested/evidence') }), /outside mutable dist/);
  await assert.rejects(readFile(path.join(f.baseline, 'nested/evidence/report.json')), /ENOENT/);
  await assert.rejects(readFile(path.join(f.root, 'src/nested/evidence/report.json')), /ENOENT/);
});
