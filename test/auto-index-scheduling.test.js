import assert from 'node:assert/strict';
import test from 'node:test';
import { startRemoteAutoIndexer } from '../dist/app/server-memory/auto-index.js';

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function fakeClock() {
  let time = 0, next = 0;
  const timers = new Map();
  const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
  return {
    now: () => time,
    setTimeout(callback, delay) { const id = ++next; timers.set(id, { at: time + delay, callback }); return id; },
    clearTimeout: id => timers.delete(id),
    count: () => timers.size,
    async advance(ms) {
      const target = time + ms;
      while (true) {
        await flush();
        const entry = [...timers].filter(([, value]) => value.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
        if (!entry) break;
        timers.delete(entry[0]); time = entry[1].at; entry[1].callback();
      }
      time = target;
      await flush();
    },
  };
}

function fixture(run = async () => ({ result: { readiness: { freshness: 'fresh' } }, index: { stale: false } }), overrides = {}) {
  const clock = fakeClock();
  const calls = [];
  const scheduler = startRemoteAutoIndexer({
    root: '/unused', clock, logger: () => {},
    readState: async () => ({ version: 1, stale: false }),
    indexRunner: { isIndexing: () => false, async indexNow(reason, options) { calls.push({ at: clock.now(), reason, signal: options.signal }); return run(options); } },
    ...overrides,
  });
  return { clock, calls, scheduler };
}

test('host startup reconciles once, then five-minute checks detect external writes without tab activity', async () => {
  const { clock, calls, scheduler } = fixture();
  await clock.advance(999); assert.equal(calls.length, 0);
  await clock.advance(1); assert.deepEqual(calls.map(call => call.at), [1000]);
  await clock.advance(299_000); assert.deepEqual(calls.map(call => call.at), [1000, 300_000]);
  scheduler.stop(); assert.equal(clock.count(), 0);
});

test('save bursts wait for quiet, and foreground activity cannot defer maintenance beyond thirty seconds', async () => {
  const { clock, calls, scheduler } = fixture();
  await clock.advance(1000); calls.length = 0;
  scheduler.notifyWrite();
  await clock.advance(3000); scheduler.notifyWrite();
  await clock.advance(3000); scheduler.notifyActivity();
  await clock.advance(4999); assert.equal(calls.length, 0);
  await clock.advance(1); assert.equal(calls.length, 1);
  scheduler.notifyWrite();
  for (let i = 0; i < 9; i++) { await clock.advance(3000); scheduler.notifyActivity(); }
  assert.equal(calls.length, 1);
  await clock.advance(3000); assert.equal(calls.length, 2);
  assert.equal(calls[1].at, 42_000);
  scheduler.stop();
});

test('many tick callers share one joined waiter, and a write during active work schedules one followup', async () => {
  const gate = deferred();
  const { clock, calls, scheduler } = fixture(async () => { await gate.promise; return { result: {}, index: { stale: false } }; });
  const first = scheduler.tick();
  for (let i = 0; i < 100; i++) assert.equal(scheduler.tick(), first);
  await clock.advance(1); assert.equal(calls.length, 1);
  scheduler.notifyWrite();
  await clock.advance(6000); scheduler.notifyWrite();
  assert.equal(calls.length, 1); assert.equal(calls[0].signal.aborted, false);
  gate.resolve(); await first;
  await clock.advance(5000); assert.equal(calls.length, 2);
  scheduler.stop();
});

test('failed automatic jobs retry with bounded exponential backoff and recover quietly', async () => {
  let failures = 0;
  const { clock, calls, scheduler } = fixture(async () => {
    if (++failures <= 3) throw new Error('unavailable');
    return { result: {}, index: { stale: false } };
  });
  await clock.advance(1000); assert.equal(scheduler.status().failed, true);
  await clock.advance(5000); assert.equal(calls.length, 2);
  await clock.advance(9999); assert.equal(calls.length, 2);
  await clock.advance(1); assert.equal(calls.length, 3);
  await clock.advance(20_000); assert.equal(calls.length, 4);
  assert.equal(scheduler.status().failed, false);
  scheduler.stop();
});

test('shutdown cancels its active ownership and all pending timers; explicit timer disabling stays disabled', async () => {
  let signal;
  const { clock, scheduler } = fixture(options => new Promise((resolve, reject) => {
    signal = options.signal;
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  }));
  const running = scheduler.tick();
  await clock.advance(1); scheduler.notifyWrite(); scheduler.stop();
  assert.equal(signal.aborted, true); assert.equal(await running, 'failed');
  await clock.advance(600_000); assert.equal(clock.count(), 0);
  const disabled = fixture(undefined, { startTimer: false });
  disabled.scheduler.notifyWrite();
  await disabled.clock.advance(600_000); assert.equal(disabled.calls.length, 0);
  assert.equal(await disabled.scheduler.tick(), 'skipped-not-stale');
  disabled.scheduler.stop();
});

test('persistent failures cap automatic retry spacing at the reconciliation interval', async () => {
  const { clock, calls, scheduler } = fixture(async () => { throw new Error('unavailable'); });
  await clock.advance(1000);
  for (const [index, delay] of [5000, 10000, 20000, 40000, 80000, 160000, 300000, 300000].entries()) {
    await clock.advance(delay - 1);
    assert.equal(calls.length, index + 1);
    await clock.advance(1);
    assert.equal(calls.length, index + 2);
  }
  assert.equal(scheduler.status().failed, true);
  scheduler.stop();
});

test('foreground activity alone does not start indexing or restart settled maintenance', async () => {
  const { clock, calls, scheduler } = fixture();
  await clock.advance(1000);
  for (let i = 0; i < 30; i++) { scheduler.notifyActivity(); await clock.advance(1000); }
  assert.equal(calls.length, 1);
  assert.equal(clock.count(), 1); // Only the bounded external-write reconciliation.
  scheduler.stop();
});
