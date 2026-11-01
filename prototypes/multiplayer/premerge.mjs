#!/usr/bin/env node
// Explicit local merge procedure: verifies a prepared integration commit; never merges.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { executeCheck, readBaseline } from '../../scripts/multiplayer-verify.mjs';

const repository = fileURLToPath(new URL('../..', import.meta.url));
const git = (root, args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const json = (value) => JSON.stringify(value, null, 2) + '\n';

export function integrationSnapshot(root, target) {
  if (!target || target.startsWith('-')) throw new Error('Choose an explicit target ref.');
  const targetSha = git(root, ['rev-parse', '--verify', '--end-of-options', target + '^{commit}']);
  const head = git(root, ['rev-parse', 'HEAD']);
  const tree = git(root, ['rev-parse', 'HEAD^{tree}']);
  try { execFileSync('git', ['merge-base', '--is-ancestor', targetSha, head], { cwd: root, stdio: 'pipe' }); }
  catch (error) {
    if (error.status === 1) throw new Error('Target is not integrated into HEAD. Prepare and review the actual integration commit, including its new behavior contract, before verification.');
    throw error;
  }
  if (git(root, ['status', '--porcelain=v1', '--untracked-files=normal'])) throw new Error('Integration verification requires a clean committed worktree.');
  return { target, targetSha, head, tree };
}

export function assertSameIntegration(before, after) {
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('HEAD, integration tree or target moved; prior passing checks do not authorize this integration.');
}

export async function newEvidenceDirectory(root, output) {
  const requestedRoot = path.resolve(root);
  root = await realpath(root);
  const requestedOut = path.resolve(output);
  const out = requestedOut.startsWith(requestedRoot + path.sep)
    ? path.join(root, path.relative(requestedRoot, requestedOut)) : requestedOut;
  const prefix = path.join(root, '.local-pack', 'multiplayer') + path.sep;
  if (!out.startsWith(prefix)) throw new Error('Use a new output below this worktree .local-pack/multiplayer/.');
  let current = root;
  for (const part of path.relative(root, out).split(path.sep)) {
    current = path.join(current, part);
    try { if ((await lstat(current)).isSymbolicLink()) throw new Error('Evidence output may not traverse a symbolic link.'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  await mkdir(path.dirname(out), { recursive: true });
  await mkdir(out);
  return out;
}

export async function runPremerge({ root = repository, target, baseline, baselineSha256, designContractSha256, out, checkOnly = false }) {
  const snapshot = integrationSnapshot(root, target);
  if (checkOnly) return { version: 1, status: 'eligible', verified: false, snapshot,
    reason: 'Ancestry and cleanliness only. No behavior or stage checks ran; this is not merge approval.' };
  await readBaseline(path.resolve(baseline), baselineSha256);
  if (!/^[a-f0-9]{64}$/.test(designContractSha256 ?? '')) throw new Error('Pin the independently reviewed design contract digest.');
  const output = await newEvidenceDirectory(root, out);
  const report = { version: 1, status: 'blocked', snapshot, baselineSha256, checks: [], limits: [
    'Local procedure only; it does not install branch protection, merge, push, or settle a thread.',
    'A later target/head/tree change invalidates this result. The merge must use this exact verified integration tree.',
  ] };
  try {
    for (const check of [
      { id: 'M0-parity', command: ['node', 'scripts/multiplayer-verify.mjs', 'verify', '--baseline', path.resolve(baseline), '--baseline-sha256', baselineSha256, '--out', path.join(output, 'M0')], timeoutMs: 900000 },
      { id: 'M1-design', command: ['node', 'prototypes/multiplayer/verify.mjs', '--out', path.join(output, 'M1'), '--contract-sha256', designContractSha256], timeoutMs: 300000 },
    ]) {
      console.log('Running ' + check.id);
      const run = await executeCheck(root, check);
      await writeFile(path.join(output, check.id + '.log'), run.output);
      const passed = run.code === 0 && !run.error && !run.timedOut && !run.overflow;
      report.checks.push({ id: check.id, status: passed ? 'passed' : 'failed', exitCode: run.code,
        timedOut: run.timedOut, overflow: run.overflow, ...(run.error ? { error: run.error } : {}) });
      if (!passed) throw new Error(check.id + ' did not pass; integration remains blocked.');
      if (check.id === 'M0-parity') {
        const bytes = await readFile(path.join(output, 'M0/manifest.json'));
        const evidence = await readBaseline(path.join(output, 'M0'), digest(bytes));
        if (evidence.source.gitSha !== snapshot.head || evidence.baselineSha256 !== baselineSha256) throw new Error('M0 evidence does not describe this integration input.');
        report.M0ManifestSha256 = digest(bytes);
      } else {
        const bytes = await readFile(path.join(output, 'M1/report.json'));
        const evidence = JSON.parse(bytes);
        if (evidence.status !== 'passed' || evidence.source.head !== snapshot.head || evidence.source.tree !== snapshot.tree) throw new Error('M1 evidence does not describe this integration input.');
        report.M1ReportSha256 = digest(bytes);
      }
    }
    assertSameIntegration(snapshot, integrationSnapshot(root, target));
    report.status = 'passed';
  } catch (error) { report.error = error.message; }
  await writeFile(path.join(output, 'integration.json'), json(report), { flag: 'wx' });
  return report;
}

async function main() {
  const flags = {};
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--check-only') { flags.checkOnly = true; continue; }
    const key = { '--target': 'target', '--baseline': 'baseline', '--baseline-sha256': 'baselineSha256', '--design-contract-sha256': 'designContractSha256', '--out': 'out' }[args[i]];
    if (!key || flags[key] || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error('Use --target REF --baseline DIR --baseline-sha256 DIGEST --design-contract-sha256 DIGEST --out NEW_DIR, or --target REF --check-only.');
    flags[key] = args[++i];
  }
  if (!flags.target || (!flags.checkOnly && (!flags.baseline || !flags.baselineSha256 || !flags.designContractSha256 || !flags.out))) throw new Error('Missing integration evidence arguments.');
  const report = await runPremerge(flags);
  console.log(json(report));
  process.exitCode = report.status === 'passed' || report.status === 'eligible' ? 0 : 1;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(json({ status: 'blocked', error: error.message })); process.exitCode = 1; });
}
