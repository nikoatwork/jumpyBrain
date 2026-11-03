// Real local/hosted CLI publication and quiet indexing, in disposable roots.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { initializeMemoryRoot, readMemoryDocument, memoryRootStatus, searchMemory } from '../dist/runtime/index.js';
import { startJumpyBrainHttpServer } from '../dist/server/index.js';
import { stopRootBackend } from '../dist/app/backend-host/index.js';
const base = await mkdtemp(path.join(os.tmpdir(), 'jb-write-outcomes-'));
const run = (args, input = '', env = {}) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, ['dist/cli.js', ...args, '--json'], { env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', b => stdout += b); child.stderr.on('data', b => stderr += b);
  child.on('error', reject); child.on('close', code => {
    if (code) reject(new Error(stderr)); else { try { resolve(JSON.parse(stdout)); } catch (e) { reject(e); } }
  }); child.stdin.end(input);
});
const results = [];
try {
  for (const kind of ['local', 'hosted']) {
    const root = path.join(base, kind); await initializeMemoryRoot(root);
    let server;
    try {
      if (kind === 'hosted') server = await startJumpyBrainHttpServer({ root, apiKeys: ['fixture'], port: 0 });
      const target = server ? ['--target-url', server.url] : ['--root', root];
      const env = server ? { JUMPYBRAIN_API_KEY: 'fixture' } : {};
      const note = await run(['remember', ...target, '--type', 'note', '--title', 'Orchid outcome'], 'Orchid evidence before removal.', env);
      const wrapup = await run(['wrapup', ...target, '--title', 'Orchid wrapup'], '## Findings\nOrchid evidence is durable.\n## Decisions\nKeep canonical Markdown.\n## Conflicts / Corrections\nNone.\n## Open Questions\nNo additional evidence.', env);
      for (const saved of [note, wrapup]) { assert.equal(saved.saved, true); assert.ok(['indexed', 'pending', 'failed'].includes(saved.indexing.status)); }
      const doc = await readMemoryDocument(root, note.id);
      const removed = await run(['delete', ...target, '--id', note.id, '--apply', '--if-match', doc.contentHash], '', env);
      assert.equal(removed.removed, true); assert.equal(removed.indexing.status, 'pending');
      let immediate;
      try { immediate = await searchMemory(root, 'Orchid', 10, { refresh: false }); }
      catch (error) { assert.match(String(error.message), /index|generation/i); }
      assert.ok(!immediate?.results.some(hit => hit.provenance.metadata?.id === note.id));
      const deadline = Date.now() + 20000;
      while ((await memoryRootStatus(root)).readiness.freshness !== 'fresh') {
        assert.ok(Date.now() < deadline, 'Quiet host maintenance must converge without a repeated write or explicit index');
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      const recalled = await run(['search', ...target, '--query', 'Orchid'], '', env);
      assert.ok(recalled.results.some(hit => hit.provenance.metadata?.id === wrapup.id));
      assert.ok(!recalled.results.some(hit => hit.provenance.metadata?.id === note.id));
      results.push({ kind, remember: note.indexing.status, wrapup: wrapup.indexing.status, delete: removed.indexing.status, quietConvergence: true });
    } finally { await server?.close(); await stopRootBackend(root).catch(() => {}); }
  }
  console.log(JSON.stringify({ passed: true, results }, null, 2));
} finally { await rm(base, { recursive: true, force: true }); }
