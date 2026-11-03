import assert from 'node:assert/strict';
import test from 'node:test';
import { memoryExecutionDeadlineMs, memoryTransportDeadlineMs } from '../dist/runtime/index.js';
import { executionTimeout } from '../dist/adapters/qmd/qmd-execution.js';
import { resolveServerConfig } from '../dist/server/config.js';

test('backend and client/gateway headroom share finite unchanged defaults and configured index budgets', () => {
  assert.equal(memoryExecutionDeadlineMs('index'), 600000);
  assert.equal(memoryTransportDeadlineMs('index'), 610000);
  assert.equal(memoryTransportDeadlineMs('search'), 70000);
  assert.equal(memoryTransportDeadlineMs('index', 900000), 910000);
  assert.equal(executionTimeout('index', { timeoutMs: 900000 }), 900000);
  assert.equal(resolveServerConfig({ root: '/fixture', apiKeys: ['fixture'], indexTimeoutMs: 900000 }, {}).indexTimeoutMs, 900000);
  assert.equal(memoryTransportDeadlineMs('index', 2147483647), 2147483647);
  for (const value of [0, -1, Infinity, NaN, 1.5, 2147483648]) {
    assert.throws(() => memoryExecutionDeadlineMs('index', value), /positive integer/);
    assert.throws(() => memoryTransportDeadlineMs('index', value), /positive integer/);
  }
});

test('local owner RPC forwards one configured index deadline and keeps client headroom through the response', { timeout: 20000 }, async () => {
  const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
  const os = await import('node:os'), path = await import('node:path');
  const { initializeMemoryRoot } = await import('../dist/runtime/index.js');
  const { createLocalMemoryTransport } = await import('../dist/cli/local-transport.js');
  const { stopRootBackend } = await import('../dist/app/backend-host/index.js');
  const root = await mkdtemp(path.join(os.tmpdir(), 'jb-index-budget-'));
  const originalFetch = globalThis.fetch, originalTimeout = AbortSignal.timeout;
  const previous = { binary: process.env.JUMPYBRAIN_QMD_BIN, timeout: process.env.JUMPYBRAIN_INDEX_TIMEOUT_MS };
  const deadlines = new WeakMap(), requests = [];
  try {
    await initializeMemoryRoot(root);
    const binary = path.join(root, 'selected-qmd'); await writeFile(binary, 'fixture executable not invoked', { mode: 0o755 });
    process.env.JUMPYBRAIN_QMD_BIN = binary; process.env.JUMPYBRAIN_INDEX_TIMEOUT_MS = '900000';
    AbortSignal.timeout = ms => { const signal = originalTimeout(ms); deadlines.set(signal, ms); return signal; };
    globalThis.fetch = async (url, options) => {
      if (String(url).endsWith('/_backend/call')) {
        const request = JSON.parse(options.body); requests.push({ request, deadline: deadlines.get(options.signal) });
        return new Response(JSON.stringify({ result: { documents: 0, saved: true } }), { headers: { 'content-type': 'application/json' } });
      }
      return originalFetch(url, options);
    };
    const memory = createLocalMemoryTransport();
    await memory.indexMemory(root);
    assert.equal(requests[0].request.args[0].timeoutMs, 900000); assert.equal(requests[0].deadline, 910000);
    await memory.ensureSavedMemoryIndexed(root, { saved: true, id: 'fixture', file: 'notes/fixture.md' }, { timeoutMs: 150 });
    assert.equal(requests[1].request.args[1].timeoutMs, 150); assert.equal(requests[1].deadline, 10150);
    await assert.rejects(() => memory.indexMemory(root, { timeoutMs: Infinity }), /positive integer/);
    assert.equal(requests.length, 2);
  } finally {
    globalThis.fetch = originalFetch; AbortSignal.timeout = originalTimeout;
    for (const [key, value] of [['JUMPYBRAIN_QMD_BIN', previous.binary], ['JUMPYBRAIN_INDEX_TIMEOUT_MS', previous.timeout]]) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    await stopRootBackend(root).catch(() => {}); await rm(root, { recursive: true, force: true });
  }
});
