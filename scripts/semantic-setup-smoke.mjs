// Opt-in real provisioned-model check. Never downloads or touches a personal brain.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, cp, readFile, writeFile, rename, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeMemoryRoot } from '../dist/runtime/index.js';
import { stopRootBackend } from '../dist/app/backend-host/index.js';
const source = process.argv[2];
assert.ok(source && path.isAbsolute(source), 'Pass an already provisioned EmbeddingGemma Q8_0 file; no downloads.');
const base = await mkdtemp(path.join(os.tmpdir(), 'jb-semantic-setup-'));
const roots = [path.join(base, 'original'), path.join(base, 'clone')];
const env = { ...process.env, JUMPYBRAIN_MODEL_DIRECTORY: path.join(base, 'models') };
const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
const run = args => new Promise((resolve, reject) => {
  const started = performance.now();
  const child = spawn(process.execPath, [cli, ...args, '--json'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', b => stdout += b); child.stderr.on('data', b => stderr += b);
  child.on('error', reject); child.on('close', code => {
    if (code) reject(new Error(stderr)); else { try { resolve({ packet: JSON.parse(stdout), ms: Math.round(performance.now() - started) }); } catch (e) { reject(e); } }
  });
});
try {
  const qmd = await import('../dist/adapters/qmd/qmd-cli.js');
  const sdk = qmd.resolveQmdSdk(), llm = path.join(path.dirname(sdk), 'llm.js');
  const guard = path.join(base, 'no-download.mjs');
  await writeFile(guard, `import {LlamaCpp} from ${JSON.stringify(new URL('file://' + llm).href)};\nconst ensure=LlamaCpp.prototype.ensureLlama;LlamaCpp.prototype.ensureLlama=function(){return ensure.call(this,false)};const original=globalThis.fetch;globalThis.fetch=(url,...args)=>{const host=new URL(String(url)).hostname;if(!['127.0.0.1','localhost','[::1]'].includes(host))throw new Error('External download blocked by semantic setup fixture');return original(url,...args)};\n`);
  env.NODE_OPTIONS = [env.NODE_OPTIONS || '', '--import=' + guard].join(' ').trim();
  await initializeMemoryRoot(roots[0]);
  const content = '---\nid: mem_c0000000-0000-4000-8000-000000000001\ntype: note\ntitle: Orchid calibration\n---\nOrchid calibration records describe telescope sensor alignment.\n';
  await writeFile(path.join(roots[0], 'notes', 'orchid.md'), content);
  const plan = await run(['index', '--root', roots[0], '--setup-semantic']); assert.equal(plan.packet.status, 'consent_required');
  const cold = await run(['index', '--root', roots[0], '--setup-semantic', '--model-file', source]);
  assert.equal(cold.packet.readiness.embedding, 'complete');
  const config = JSON.parse(await readFile(path.join(roots[0], 'jumpybrain.json'), 'utf8'));
  assert.match(config.indexing.modelId, /^sha256:[a-f0-9]{64}$/); assert.equal(config.indexing.model, undefined);
  const warm = await run(['index', '--root', roots[0], '--setup-semantic', '--download-model']);
  assert.equal(warm.packet.readiness.embedding, 'complete'); assert.equal(warm.packet.work.embedded, 0);
  await mkdir(roots[1]); await cp(path.join(roots[0], 'jumpybrain.json'), path.join(roots[1], 'jumpybrain.json'));
  for (const folder of ['notes','pages','sessions','findings','decisions','preferences']) await mkdir(path.join(roots[1], folder));
  await writeFile(path.join(roots[1], 'notes', 'orchid.md'), content);
  const cloned = await run(['index', '--root', roots[1], '--setup-semantic']); assert.equal(cloned.packet.readiness.embedding, 'complete');
  assert.equal((await run(['status', '--root', roots[1]])).packet.semanticSetup.state, 'ready');
  await rename(env.JUMPYBRAIN_MODEL_DIRECTORY, path.join(base, 'offline-models'));
  assert.equal((await run(['status', '--root', roots[1]])).packet.semanticSetup.state, 'unavailable');
  const fallback = await run(['recall', '--root', roots[1], '--topic', 'Orchid calibration', '--read-only', '--compact']);
  assert.ok(fallback.packet.retrieval.warnings.includes('read_only_index'));
  assert.ok(!fallback.packet.readiness.modes.includes('semantic'));
  assert.equal(fallback.packet.readiness.embedding, 'incomplete');
  for (const root of roots) assert.equal(await readFile(path.join(root, 'notes', 'orchid.md'), 'utf8'), content);
  console.log(JSON.stringify({ passed: true, modelId: config.indexing.modelId, coldIndexMs: cold.ms, warmNoOpMs: warm.ms,
    clonedBrain: true, missingModelStatus: 'unavailable', strictReadOnlyLexicalFallback: true, canonicalBytesUnchanged: true,
    limits: 'One tiny fictional corpus, macOS ARM64, provisioned native runtime. Cold/warm labels describe this operation pair; no RAM or broad latency claim.' }, null, 2));
} finally { for (const root of roots) await stopRootBackend(root).catch(() => {}); await rm(base, { recursive: true, force: true }); }
