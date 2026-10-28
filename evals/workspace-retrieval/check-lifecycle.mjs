#!/usr/bin/env node
// Supplemental correctness/transport checks, separate from scored quality runs.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as runtime from '../../dist/runtime/index.js';
import { startJumpyBrainHttpServer } from '../../dist/server/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const runName = process.argv[2];
assert.ok(runName && /^[\w-]+$/.test(runName), 'Pass an existing run name.');
const output = path.join(here, '.runs', runName);
const root = path.join(output, 'lifecycle-memory');
await mkdir(root, { recursive: false });
await cp(path.join(here, 'corpus'), root, { recursive: true });
await runtime.initializeMemoryRoot(root);
await runtime.indexMemory(root, { indexing: { mode: 'lexical' } });
const checks = [];
const hash = content => `sha256:${createHash('sha256').update(content).digest('hex')}`;
async function cli(args, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['dist/cli.js', ...args], { cwd: repo, env: { ...process.env, ...extraEnv } });
    let stdout = '', stderr = '';
    child.stdout.on('data', data => stdout += data);
    child.stderr.on('data', data => stderr += data);
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve(JSON.parse(stdout)) : reject(new Error(`CLI failed ${code}: ${stderr}`)));
    child.stdin.end();
  });
}
const server = await startJumpyBrainHttpServer({ root, apiKeys: ['workspace-eval-loopback-only'], port: 0, autoIndex: false });
try {
  for (const query of ['Harbor migration checklist', 'What is the confirmed Harbor launch plan?', 'Who approved the Harbor public-launch exception?']) {
    const local = await runtime.compactSearchMemory(root, query, 5, { depth: 'normal', refresh: false, maxBytes: 8192 });
    const flags = ['recall', '--query', query, '--compact', '--limit', '5', '--depth', 'normal', '--max-bytes', '8192', '--no-refresh'];
    const localCli = await cli([...flags, '--root', root]);
    assert.deepEqual(localCli, local);
    const hostedCli = await cli([...flags, '--target-url', server.url], { JUMPYBRAIN_API_KEY: 'workspace-eval-loopback-only' });
    assert.deepEqual(hostedCli, local);
    checks.push({ name: 'runtime/local-CLI/hosted-CLI compact parity', query, passed: true });
  }
} finally { await server.close(); }

const file = path.join(root, 'decisions/harbor/approved.md');
const original = await readFile(file, 'utf8');
const id = original.match(/^id: (.+)$/m)[1];
const oldHash = hash(original);
const draft = { file: 'pages/checked.md', content: `# Checked claim\n\nThe decision has a bounded scope. [decision](${id} "${oldHash}")\n` };
assert.equal((await runtime.checkDreamSources(root, draft)).sources[0].status, 'unchanged');
const changed = original.replace('starting on October 22.', 'starting on October 29.');
assert.notEqual(changed, original);
await writeFile(file, changed);
assert.equal((await runtime.memoryRootStatus(root)).readiness.freshness, 'stale');
await assert.rejects(runtime.expandMemoryDocument(root, { id, expectedContentHash: oldHash, maxBytes: 8192 }), error => error.code === 'precondition_failed');
assert.equal((await runtime.checkDreamSources(root, draft)).sources[0].status, 'changed');
checks.push({ name: 'external decision edit invalidates handle and source-version check', passed: true });
await runtime.ensureMemoryIndexed(root);
assert.equal((await runtime.memoryRootStatus(root)).readiness.freshness, 'fresh');
const current = await runtime.readMemoryDocument(root, id);
assert.ok(current.content.includes('starting on October 29.'));
checks.push({ name: 'incremental repair exposes changed decision bytes', passed: true });
const renamed = path.join(root, 'decisions/harbor/renamed-approval.md');
await rename(file, renamed);
await runtime.ensureMemoryIndexed(root);
assert.equal((await runtime.readMemoryDocument(root, id)).file, 'decisions/harbor/renamed-approval.md');
const afterRename = await runtime.expandMemoryDocument(root, { id, expectedContentHash: hash(changed), maxBytes: 8192 });
assert.equal(afterRename.filePath, 'decisions/harbor/renamed-approval.md');
checks.push({ name: 'rename preserves canonical identity and guarded expansion', passed: true });
await rm(renamed);
await runtime.ensureMemoryIndexed(root);
assert.equal((await runtime.checkDreamSources(root, draft)).sources[0].status, 'missing');
await assert.rejects(runtime.expandMemoryDocument(root, { id, expectedContentHash: hash(changed), maxBytes: 8192 }));
checks.push({ name: 'deletion invalidates evidence and source check without changing the page', passed: true });
const before = await runtime.compactSearchMemory(root, 'Harbor migration checklist', 5, { refresh: false });
await rm(path.join(root, '.jumpybrain'), { recursive: true });
await runtime.indexMemory(root);
const after = await runtime.compactSearchMemory(root, 'Harbor migration checklist', 5, { refresh: false });
assert.deepEqual(after, before);
checks.push({ name: 'derived-state deletion/rebuild preserves retrieval packet', passed: true });
const report = { checks, limits: 'Disposable local macOS lexical root and authenticated localhost CLI transport only; no Linux/VPS capacity or browser usability claim.' };
await writeFile(path.join(output, 'lifecycle.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
