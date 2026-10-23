import assert from 'node:assert/strict';
import test from 'node:test';
import { installSearchMaintenance } from '../dist/adapters/http-server/search-maintenance.js';

const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
const fresh = (lastIndexedAt = 'one') => ({ index: { lastIndexedAt, stale: false }, readiness: { freshness: 'fresh' }, maintenance: { enabled: true, indexing: false, failed: false } });
const stale = (maintenance = { enabled: true, indexing: false, failed: false }) => ({ index: { stale: true }, readiness: { freshness: 'stale' }, maintenance });
function fixture(read = async () => fresh()) {
  let now = 0, next = 0, scope = 'a', enabled = true;
  const timers = new Map(), calls = [], states = [];
  let refreshes = 0;
  const document = new EventTarget(); document.visibilityState = 'visible';
  const window = new EventTarget();
  window.setTimeout = (callback, delay) => { const id = ++next; timers.set(id, { at: now + delay, callback }); return id; };
  window.clearTimeout = id => timers.delete(id);
  const observer = installSearchMaintenance({ document, window, scope: () => scope, enabled: () => enabled,
    async read(signal) { calls.push({ signal, scope }); return read(signal, scope); },
    onFresh: () => { refreshes++; }, onState: state => states.push(state),
  });
  return { observer, calls, states, document, window, timers, refreshes: () => refreshes,
    setScope(value) { scope = value; }, setEnabled(value) { enabled = value; },
    async advance(ms) {
      const target = now + ms;
      while (true) {
        await flush();
        const entry = [...timers].filter(([, timer]) => timer.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
        if (!entry) break;
        timers.delete(entry[0]); now = entry[1].at; entry[1].callback();
      }
      now = target; await flush();
    },
  };
}

test('fresh initial baseline does not rerun search; new confirmed generation reruns once', async () => {
  let packet = fresh();
  const f = fixture(async () => packet);
  await flush(); assert.deepEqual(f.states, ['ready']); assert.equal(f.refreshes(), 0);
  packet = fresh('two');
  await f.advance(10_000); assert.equal(f.refreshes(), 1);
  await f.advance(10_000); assert.equal(f.refreshes(), 1);
  f.observer.stop(); assert.equal(f.timers.size, 0);
});

test('stale/failure recovery adopts the fresh generation once and current freshness overrides old failure flags', async () => {
  let packet = stale();
  const f = fixture(async () => packet);
  await flush(); assert.deepEqual(f.states, ['updating']);
  packet = stale({ enabled: true, indexing: false, failed: true });
  await f.observer.check(); assert.deepEqual(f.states, ['updating', 'failed']);
  packet = fresh('two'); packet.maintenance.failed = true;
  await f.observer.check(); assert.equal(f.states.at(-1), 'ready'); assert.equal(f.refreshes(), 1);
  await f.observer.check(); assert.equal(f.refreshes(), 1);
  packet = stale({ enabled: false, indexing: false, failed: false });
  await f.observer.check(); assert.equal(f.states.at(-1), 'unavailable');
  f.observer.stop();
});

test('status reads remain serial and a hung read hits its five-second abort deadline', async () => {
  const f = fixture(() => new Promise(() => {}));
  await flush();
  const first = f.observer.check();
  for (let i = 0; i < 100; i++) assert.equal(f.observer.check(), first);
  assert.equal(f.calls.length, 1);
  await f.advance(5000); await first;
  assert.equal(f.calls[0].signal.aborted, true);
  assert.deepEqual(f.states, ['unavailable']);
  await f.advance(10_000); assert.equal(f.calls.length, 2);
  f.observer.stop(); await flush(); assert.equal(f.timers.size, 0);
});

test('scope replacement aborts previous read and fences late old-brain completion', async () => {
  let resolveOld;
  const f = fixture((_signal, scope) => scope === 'a' ? new Promise(resolve => { resolveOld = resolve; }) : Promise.resolve(fresh('b')));
  await flush(); f.setScope('b'); await f.observer.check();
  assert.equal(f.calls[0].signal.aborted, true);
  assert.equal(f.refreshes(), 0); assert.deepEqual(f.states, ['ready']);
  resolveOld(stale()); await flush();
  assert.deepEqual(f.states, ['ready']); assert.equal(f.refreshes(), 0);
  f.observer.stop();
});

test('hidden/disabled/suspended observers abort and release timers; resume/focus checks preserve generation', async () => {
  let packet = fresh();
  const f = fixture(async () => packet);
  await flush();
  f.document.visibilityState = 'hidden'; f.document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(f.timers.size, 0);
  await f.advance(30_000); assert.equal(f.calls.length, 1);
  packet = fresh('two');
  f.document.visibilityState = 'visible'; f.document.dispatchEvent(new Event('visibilitychange')); await flush();
  assert.equal(f.calls.length, 2); assert.equal(f.refreshes(), 1);
  f.setEnabled(false); await f.observer.check(); assert.equal(f.timers.size, 0);
  f.window.dispatchEvent(new Event('focus')); await flush(); assert.equal(f.calls.length, 2);
  f.setEnabled(true); f.window.dispatchEvent(new Event('focus')); await flush(); assert.equal(f.calls.length, 3);
  f.observer.suspend(); assert.equal(f.timers.size, 0);
  f.observer.stop(); f.window.dispatchEvent(new Event('focus')); await flush(); assert.equal(f.calls.length, 3);
});

test('failure followed by the first fresh publication refreshes once, while absent generation never claims adoption', async () => {
  let packet;
  const f = fixture(async () => { if (!packet) throw new Error('offline'); return packet; });
  await flush(); assert.deepEqual(f.states, ['unavailable']);
  packet = fresh(undefined); delete packet.index.lastIndexedAt;
  await f.observer.check(); assert.equal(f.refreshes(), 0);
  packet = fresh('recovered'); await f.observer.check(); assert.equal(f.refreshes(), 1);
  f.observer.stop();
});


test('resuming after a quiet dialog schedules observation without an immediate network read', async () => {
  const f = fixture(async () => fresh());
  await flush(); const before = f.calls.length;
  f.observer.suspend(); f.observer.resume();
  assert.equal(f.calls.length, before);
  await f.advance(9999); assert.equal(f.calls.length, before);
  await f.advance(1); assert.equal(f.calls.length, before + 1);
  f.observer.stop();
});
