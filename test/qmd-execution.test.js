import assert from 'node:assert/strict';
import test from 'node:test';
import { getEventListeners, setMaxListeners } from 'node:events';
import { existsSync } from 'node:fs';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { withQmdOperation, runQmdChild, readExecution, qmdExecutionForTests as execution, EXECUTION_LIMITS } from '../dist/adapters/qmd/qmd-execution.js';
import { canonicalPrefixCache } from '../dist/adapters/qmd/qmd-snippets.js';
import { indexMemory, memoryStatus, searchMemory } from '../dist/app/local-memory/index.js';
import { createRemoteIndexRunner } from '../dist/app/server-memory/auto-index.js';
import { readRemoteIndexState, markRemoteIndexFresh } from '../dist/app/server-memory/state.js';
import { startJumpyBrainHttpServer } from '../dist/server/index.js';
import { createRemoteMemoryTransport } from '../dist/adapters/http-client/index.js';
import { installFakeQmd } from './fake-qmd-helper.js';

const fixture = await readFile(fileURLToPath(new URL('./fixtures/qmd-execution-child.cjs.fixture', import.meta.url)), 'utf8');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const code = expected => error => error.code === expected && !/private|credential|server\/root/.test(error.message);
const ownedServers = new Map();
async function waitFor(predicate) {
  const deadline = Date.now() + 10_000;
  while (!await predicate()) { assert.ok(Date.now() < deadline, 'fixture barrier timed out'); await pause(5); }
}
async function temp(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'jb-execution-'));
  t.after(async () => {
    const server = ownedServers.get(root);
    if (server?.server.listening) await server.close();
    ownedServers.delete(root);
    await rm(root, { recursive: true, force: true });
  });
  return root;
}
function child(mode, marker, release, maxBytes = 1024) {
  return runQmdChild(process.execPath, ['-e', fixture, mode, marker ?? '', release ?? ''], { maxBytes });
}

test('finite FIFO admission includes both index/search, root exclusion, overload, queued abort and cleanup', async t => {
  const root = await temp(t);
  const gates = [deferred(), deferred()];
  const starts = [];
  const start = (key, kind, gate, options = {}) => withQmdOperation(path.join(root, key), kind, options, async () => { starts.push(key); await gate.promise; });
  const a = start('a', 'search', gates[0]);
  const b = start('b', 'index', gates[1]);
  await waitFor(() => execution.state().active === 2);
  const controller = new AbortController();
  setMaxListeners(32, controller.signal);
  const queued = Array.from({ length: EXECUTION_LIMITS.queue }, (_, i) => start(i === 0 ? 'a' : `q${i}`, i === 1 ? 'index' : 'search', { promise: Promise.resolve() }, { signal: controller.signal }));
  const rejected = queued.map(p => assert.rejects(p, code('execution_aborted')));
  await waitFor(() => execution.state().queued === EXECUTION_LIMITS.queue);
  await assert.rejects(start('overflow', 'search', gates[0]), code('execution_overloaded'));
  controller.abort();
  await Promise.all(rejected);
  assert.equal(execution.state().queued, 0);
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
  gates.forEach(g => g.resolve());
  await Promise.all([a, b]);
  assert.deepEqual(execution.state(), { active: 0, queued: 0 });

  const gate = deferred();
  const first = start('a', 'search', gate);
  await waitFor(() => execution.state().active === 1);
  const second = start('a', 'index', { promise: Promise.resolve() });
  const third = start('a', 'search', { promise: Promise.resolve() });
  await waitFor(() => execution.state().queued === 2);
  gate.resolve();
  await Promise.all([first, second, third]);
  assert.deepEqual(starts.slice(-3), ['a', 'a', 'a']);
});

test('hung/crashing/overproducing/spawn failures are bounded and content-free', async t => {
  const root = await temp(t);
  for (const [mode, expected] of [['hung', 'execution_timeout'], ['overflow', 'execution_output_limit'], ['crash', 'execution_failed']]) {
    await assert.rejects(withQmdOperation(root, 'search', { timeoutMs: mode === 'hung' ? 120 : 2000 }, () => child(mode)), code(expected));
    assert.deepEqual(execution.state(), { active: 0, queued: 0 });
  }
  await assert.rejects(withQmdOperation(root, 'search', {}, () => runQmdChild('/nonexistent-jumpybrain-executable', [], { maxBytes: 64 })), code('execution_failed'));
});

test('one deadline spans multiple calls and admission; abort cleans listeners and owned POSIX tree', async t => {
  const root = await temp(t);
  const controller = new AbortController();
  const marker = path.join(root, 'tree.json');
  const work = withQmdOperation(root, 'search', { signal: controller.signal }, () => child(process.platform === 'win32' ? 'hung' : 'tree', marker));
  const rejected = assert.rejects(work, code('execution_aborted'));
  await waitFor(() => existsSync(marker));
  const pids = JSON.parse(await readFile(marker, 'utf8'));
  controller.abort();
  await rejected;
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
  assert.throws(() => process.kill(pids.pid, 0), /ESRCH/);
  if (pids.descendant) await waitFor(() => { try { process.kill(pids.descendant, 0); return false; } catch { return true; } });

  const marker2 = path.join(root, 'first.json');
  const release = path.join(root, 'release');
  const sequence = withQmdOperation(root, 'search', { timeoutMs: 500 }, async () => {
    await child('gate', marker2, release);
    return child('hung');
  });
  const timeout = assert.rejects(sequence, code('execution_timeout'));
  await waitFor(() => existsSync(marker2));
  await writeFile(release, 'go');
  await timeout;
  assert.deepEqual(execution.state(), { active: 0, queued: 0 });
});

test('ordinary wrapper crash cleans same-group descendants even when their stdio is closed', { skip: process.platform === 'win32' }, async t => {
  const root = await temp(t);
  const marker = path.join(root, 'orphan.json');
  await assert.rejects(withQmdOperation(root, 'search', {}, () => child('orphan', marker)), code('execution_failed'));
  const { descendant } = JSON.parse(await readFile(marker, 'utf8'));
  await waitFor(() => { try { process.kill(descendant, 0); return false; } catch { return true; } });
  assert.deepEqual(execution.state(), { active: 0, queued: 0 });
});

test('queued deadlines release admission and joined index waiter bounds are finite', async t => {
  const root = await temp(t);
  const gate = deferred();
  const held = withQmdOperation(root, 'search', {}, () => gate.promise);
  await waitFor(() => execution.state().active === 1);
  await assert.rejects(withQmdOperation(root, 'index', { timeoutMs: 20 }, async () => assert.fail('queued operation launched')), code('execution_timeout'));
  assert.equal(execution.state().queued, 0);
  gate.resolve(); await held;

  const indexGate = deferred();
  const runner = createRemoteIndexRunner({ root, indexMemory: async () => { await indexGate.promise; return { root, documents: 0, qmdCollection: 'jumpybrain' }; }, markFresh: async () => ({ version: 1, stale: false }) });
  const waiters = Array.from({ length: 16 }, () => runner.indexNow());
  await assert.rejects(runner.indexNow(), code('execution_overloaded'));
  indexGate.resolve(); await Promise.all(waiters);
  await runner.stop();
});

test('read-only discovery can stop promptly without detaching mutating or child work', async t => {
  const root = await temp(t);
  const gate = deferred();
  await assert.rejects(withQmdOperation(root, 'search', { timeoutMs: 20 }, () => readExecution(gate.promise)), code('execution_timeout'));
  assert.deepEqual(execution.state(), { active: 0, queued: 0 });
  gate.resolve();
});

test('prefix reuse is request-local, bounded and retains per-file failures', async () => {
  let reads = 0;
  const read = async file => { reads++; if (file === 'missing') throw Object.assign(new Error(), { code: 'ENOENT' }); return { lines: [file], truncated: false }; };
  const cache = canonicalPrefixCache(128 * 1024 + 1, read);
  assert.strictEqual(await cache('a'), await cache('a'));
  await cache('b'); await cache('b');
  assert.equal(reads, 3); // overflow uncached; no eviction/invalidation system
  const missing = canonicalPrefixCache(undefined, read);
  await assert.rejects(missing('missing'));
  await assert.rejects(missing('missing'));
  assert.equal(reads, 4);
  await canonicalPrefixCache(undefined, read)('a');
  assert.equal(reads, 5);
});

async function product(t) {
  const root = await temp(t);
  const { bin } = await installFakeQmd(root);
  const previous = process.env.JUMPYBRAIN_QMD_BIN;
  process.env.JUMPYBRAIN_QMD_BIN = bin;
  t.after(() => { if (previous === undefined) delete process.env.JUMPYBRAIN_QMD_BIN; else process.env.JUMPYBRAIN_QMD_BIN = previous; });
  await mkdir(path.join(root, 'notes'));
  await writeFile(path.join(root, 'notes/a.md'), '---\ntitle: Quartz\n---\nQuartz evidence.\n');
  const marker = path.join(root, '.jumpybrain/query-ready');
  const release = path.join(root, '.jumpybrain/query-release');
  await writeFile(bin, `#!/usr/bin/env node\nrequire('node:fs').writeFileSync(${JSON.stringify(marker)}, String(process.pid)); const timer = setInterval(() => { if (require('node:fs').existsSync(${JSON.stringify(release)})) { clearInterval(timer); console.log('[]'); } }, 5);`);
  await chmod(bin, 0o755);
  await indexMemory(root, { indexing: { mode: 'lexical' } });
  return { root, marker, release, bin };
}
const auth = { Authorization: 'Bearer fixture-key', 'Content-Type': 'application/json' };

test('HTTP health/lightweight reads remain serviceable during real adapter child wait; client abort releases it', async t => {
  const f = await product(t);
  const started = await startJumpyBrainHttpServer({ root: f.root, apiKeys: ['fixture-key'], port: 0, autoIndex: false });
  ownedServers.set(f.root, started);

  const controller = new AbortController();
  const response = fetch(`${started.url}/memories/all/search`, { method: 'POST', headers: auth, body: JSON.stringify({ query: 'quartz' }), signal: controller.signal });
  const aborted = assert.rejects(response);
  await waitFor(() => existsSync(f.marker));
  assert.equal(execution.state().active, 1);
  assert.equal((await fetch(`${started.url}/health`)).status, 200);
  assert.equal((await fetch(`${started.url}/memories/all/recent`, { headers: auth })).status, 200);
  assert.equal(execution.state().active, 1); // not a timing-only responsiveness assertion
  controller.abort();
  await aborted;
  await waitFor(() => execution.state().active === 0);
  const pid = Number(await readFile(f.marker, 'utf8'));
  assert.throws(() => process.kill(pid, 0), /ESRCH/);
});

test('runtime and HTTP timeout errors agree; shutdown cancels child and incomplete body', async t => {
  const f = await product(t);
  await assert.rejects(searchMemory(f.root, 'quartz', 5, { timeoutMs: 150 }), code('execution_timeout'));
  const started = await startJumpyBrainHttpServer({ root: f.root, apiKeys: ['fixture-key'], port: 0, autoIndex: false, searchTimeoutMs: 150 });
  ownedServers.set(f.root, started);
  const transport = createRemoteMemoryTransport({ url: started.url, apiKey: 'fixture-key' });
  await assert.rejects(transport.searchMemory('quartz', 5), code('execution_timeout'));
  const slow = transport.searchMemory('quartz', 5);
  const canceled = assert.rejects(slow, code('execution_aborted'));
  await waitFor(() => execution.state().active === 1);
  const incomplete = http.request(`${started.url}/memories/all/search`, { method: 'POST', headers: { ...auth, 'Content-Length': '100' } });
  incomplete.on('error', () => {});
  incomplete.write('{');
  await pause(20);
  await started.close();
  incomplete.destroy();
  await canceled;
  assert.deepEqual(execution.state(), { active: 0, queued: 0 });
});

test('server close drains disconnected handlers through owned-child cleanup', async t => {
  const f = await product(t);
  await writeFile(f.bin, '#!/usr/bin/env node\nprocess.on("SIGTERM", () => {}); require("node:fs").writeFileSync(' + JSON.stringify(f.marker) + ', String(process.pid)); setInterval(() => {},1000);');
  const started = await startJumpyBrainHttpServer({ root: f.root, apiKeys: ['fixture-key'], port: 0, autoIndex: false });
  ownedServers.set(f.root, started);
  const controller = new AbortController();
  const fetchWork = fetch(`${started.url}/memories/all/search`, { method: 'POST', headers: auth, body: JSON.stringify({ query: 'quartz' }), signal: controller.signal });
  const disconnected = assert.rejects(fetchWork);
  await waitFor(() => existsSync(f.marker));
  const pid = Number(await readFile(f.marker, 'utf8'));
  controller.abort(); await disconnected;
  await started.close();
  assert.throws(() => process.kill(pid, 0), /ESRCH/);
  assert.deepEqual(execution.state(), { active: 0, queued: 0 });
});

test('index caller cancellation detaches only its ownership; abandoned-job retry, rebuild serialization and shutdown', async t => {
  const root = await temp(t);
  let calls = 0, fresh = 0;
  const gates = [];
  const runner = createRemoteIndexRunner({ root,
    indexMemory: async (root, options) => {
      calls++;
      const gate = deferred(); gates.push(gate);
      await gate.promise;
      options.signal.throwIfAborted();
      return { root, documents: calls, qmdCollection: 'jumpybrain' };
    }, markFresh: async () => { fresh++; return { version: 1, stale: false }; },
  });
  const controller = new AbortController();
  const one = runner.indexNow('manual', { signal: controller.signal });
  const aborted = assert.rejects(one, code('execution_aborted'));
  const two = runner.indexNow('auto');
  controller.abort(); await aborted;
  gates[0].resolve(); await two;
  assert.equal(calls, 1); assert.equal(fresh, 1);

  const abandoned = new AbortController();
  const three = runner.indexNow('manual', { signal: abandoned.signal });
  const detached = assert.rejects(three, code('execution_aborted'));
  abandoned.abort(); await detached;
  const retry = runner.indexNow();
  gates[1].resolve();
  await waitFor(() => calls === 3);
  gates[2].resolve(); await retry;
  assert.equal(fresh, 2);

  const ordinary = runner.indexNow();
  const rebuild1 = runner.indexNow('manual', { rebuild: true });
  const rebuild2 = runner.indexNow('manual', { rebuild: true });
  gates[3].resolve(); await ordinary;
  await waitFor(() => calls === 5); gates[4].resolve(); await rebuild1;
  await waitFor(() => calls === 6); gates[5].resolve(); await rebuild2;
  assert.equal(fresh, 5);
  await runner.stop();
  await assert.rejects(runner.indexNow(), code('execution_aborted'));
});

test('slow index serves health, excludes reads, and cancellation retains generation and stale remote state', async t => {
  const f = await product(t);
  const before = await readFile(path.join(f.root, '.jumpybrain/index.json'), 'utf8');
  await markRemoteIndexFresh(f.root, { root: f.root, documents: 1, qmdCollection: 'jumpybrain' });
  const sdk = path.join(f.root, '.jumpybrain/fake-qmd/dist/index.js');
  const original = await readFile(sdk, 'utf8');
  const marker = path.join(f.root, '.jumpybrain/index-ready');
  await writeFile(sdk, `import fs from 'node:fs'; fs.writeFileSync(${JSON.stringify(marker)}, String(process.pid)); while (!fs.existsSync(${JSON.stringify(f.release)})) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,5);\n` + original);
  const started = await startJumpyBrainHttpServer({ root: f.root, apiKeys: ['fixture-key'], port: 0, autoIndex: false });
  ownedServers.set(f.root, started);

  const controller = new AbortController();
  const index = fetch(`${started.url}/memories/all/index`, { method: 'POST', headers: auth, body: '{}', signal: controller.signal });
  const disconnected = assert.rejects(index);
  await waitFor(() => existsSync(marker));
  const searchController = new AbortController();
  const search = searchMemory(f.root, 'quartz', 5, { signal: searchController.signal });
  const searchCanceled = assert.rejects(search, code('execution_aborted'));
  await waitFor(() => execution.state().queued === 1);
  assert.equal(existsSync(f.marker), false); // no query child against mutating DB
  assert.equal((await fetch(`${started.url}/health`)).status, 200);
  searchController.abort(); await searchCanceled;
  controller.abort(); await disconnected;
  await waitFor(() => execution.state().active === 0);
  assert.equal(await readFile(path.join(f.root, '.jumpybrain/index.json'), 'utf8'), before);
  assert.equal((await memoryStatus(f.root)).readiness.freshness, 'stale');
  await waitFor(async () => (await readRemoteIndexState(f.root)).stale);
  assert.equal((await readRemoteIndexState(f.root)).lastWriteAt, undefined);
  await writeFile(sdk, original);
  await writeFile(f.release, 'go');
  await indexMemory(f.root);
  assert.equal((await memoryStatus(f.root)).readiness.freshness, 'fresh');
});

test('local CLI SIGTERM cancels owned query wrapper and releases root lock', async t => {
  const f = await product(t);
  const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
  const processChild = spawn(process.execPath, [cli, 'search', '--root', f.root, '--query', 'quartz', '--json'], { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  processChild.stderr.on('data', chunk => { stderr += chunk; });
  const closed = new Promise(resolve => processChild.once('close', resolve));
  await waitFor(() => existsSync(f.marker));
  const pid = Number(await readFile(f.marker, 'utf8'));
  processChild.kill('SIGTERM');
  assert.equal(await closed, 1);
  assert.match(stderr, /Memory operation canceled/);
  assert.throws(() => process.kill(pid, 0), /ESRCH/);
  assert.equal(existsSync(path.join(f.root, '.jumpybrain/index.lock')), false);
});

test('malformed query output is failure, never an empty or path-bearing result', async t => {
  const f = await product(t);
  for (const output of ['{}', '[null]', '[{"file":4}]', '[{"snippet":4}]']) {
    await writeFile(f.bin, '#!/usr/bin/env node\nconsole.log(' + JSON.stringify(output) + ');');
    await assert.rejects(searchMemory(f.root, 'quartz', 5), /no backend query succeeded/);
  }
});

test('HTTP client lifecycle options are never serialized and stalled fetch receives abort', async () => {
  const controller = new AbortController();
  let seen;
  const transport = createRemoteMemoryTransport({ url: 'https://memory.example', apiKey: 'secret', fetchImpl: async (_url, init) => {
    seen = init;
    return new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true }));
  } });
  const pending = transport.indexMemory({ rebuild: true, signal: controller.signal, timeoutMs: 500 });
  const rejected = assert.rejects(pending, code('execution_aborted'));
  controller.abort(); await rejected;
  assert.deepEqual(JSON.parse(seen.body), { rebuild: true });
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
  await assert.rejects(transport.searchMemory('private query', 5, { timeoutMs: 20 }), code('execution_timeout'));
});
