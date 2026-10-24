import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, realpath, mkdir, readFile, writeFile, readdir, stat, symlink, link, chmod, rm } from 'node:fs/promises';
import { sanitizeDiagnosticEvent, createDiagnosticBuffer, supportReport, diagnosticCode } from '../dist/adapters/diagnostics/events.js';
import { createDiagnosticStore, readNativeDiagnosticSnapshot, newDiagnosticId } from '../dist/adapters/diagnostics/store.js';
import { collectSupportDiagnostics } from '../dist/app/diagnostics/index.js';
import { createFeedbackDiagnostics, feedbackEmailDraft, MAX_FEEDBACK_BYTES } from '../dist/adapters/http-server/feedback.js';
import { createFileLogger, formatLogLine } from '../dist/adapters/logging/index.js';
import { diagnosticServerLogger, diagnosticRequestContext } from '../dist/adapters/diagnostics/server-logging.js';

const at = '2026-10-16T12:00:00.000Z';
const event = (fields = {}) => ({ schema: 1, at, component: 'browser', operation: 'document_write', severity: 'warn', outcome: 'failed', code: 'conflict', ...fields });
async function fixture(t) { const dir = await realpath(await mkdtemp(path.join(os.tmpdir(), 'jb-diagnostics-'))); t.after(() => rm(dir, { recursive: true, force: true })); return dir; }

test('schema discards hostile/nested data, code text, messages/stacks and invalid correlation', () => {
  const input = event({ code: 'private-secret', operation: '/private/note', session: 'Bearer private', request: 'cookie=private', url: 'private',
    error: { message: 'private', stack: 'private' }, details: { authorization: 'private' }, line: Infinity, durationMs: -100, build: 'private', version: 'private' });
  input.circular = input;
  const safe = sanitizeDiagnosticEvent(input);
  assert.doesNotMatch(JSON.stringify(safe), /private|Bearer|cookie/);
  assert.equal(safe.operation, 'request'); assert.equal(safe.code, 'unknown'); assert.equal(safe.durationMs, 0);
  assert.equal(sanitizeDiagnosticEvent({ get component() { throw new Error('private'); } }), null);
  assert.equal(sanitizeDiagnosticEvent(event({ at: 'invalid private' })), null);
  assert.equal(diagnosticCode('precondition_failed'), 'conflict');
  assert.equal(diagnosticCode('save_blocked'), 'switch_rejected');
});

test('failure evidence survives successful polling storms and report references remain correlated and bounded', () => {
  const buffer = createDiagnosticBuffer('browser', 10), request = newDiagnosticId();
  buffer.record(event({ request }));
  for (let i = 0; i < 100; i++) buffer.record(event({ operation: 'poll', severity: 'info', outcome: 'ok', code: 'none' }));
  const snapshot = buffer.snapshot();
  assert.equal(snapshot.events.length, 10); assert.ok(snapshot.dropped > 0);
  assert.ok(snapshot.events.some((e) => e.code === 'conflict'));
  const server = { ...snapshot, component: 'server', events: [event({ component: 'server', request })], availability: 'degraded', failures: 3 };
  const report = supportReport([snapshot, server], 1000);
  assert.ok(Buffer.byteLength(JSON.stringify(report)) <= 1000);
  assert.ok(report.omitted > 0); assert.equal(report.sources[1].failures, 3);
  const correlated = report.events.filter((e) => e.code === 'conflict');
  assert.equal(correlated.length, 2); assert.equal(correlated[0].request, correlated[1].request);
  assert.doesNotMatch(JSON.stringify(report), /d_[a-f0-9]{32}/);
});

test('private diagnostic storage rotates continuously, survives restart, expires only owned segments and stays bounded', async (t) => {
  const root = await fixture(t), directory = path.join(root, 'store');
  let time = Date.parse(at);
  const options = { directory, component: 'server', segmentBytes: 2048, maxSegments: 2, now: () => time };
  const store = createDiagnosticStore(options);
  for (let i = 0; i < 35; i++) { time++; store.record(event({ code: 'conflict', body: 'private', component: 'server' })); }
  assert.equal(await store.flush(2000), true);
  const names = await readdir(directory);
  assert.ok(names.length <= 2); let bytes = 0;
  for (const name of names) { const info = await stat(path.join(directory, name)); bytes += info.size; assert.equal(info.mode & 0o777, 0o600); assert.doesNotMatch(await readFile(path.join(directory, name), 'utf8'), /private/); }
  assert.ok(bytes <= 4096); assert.equal((await stat(directory)).mode & 0o777, 0o700);
  const restarted = createDiagnosticStore(options);
  const previous = await restarted.snapshot(); assert.ok(previous.events.length > 0); assert.equal(previous.events[0].session, store.session);
  await writeFile(path.join(directory, 'manual-admin.log'), 'leave alone');
  time += 8 * 86400000;
  restarted.record({ operation: 'startup', severity: 'info', outcome: 'ok', code: 'none' });
  await restarted.flush(2000);
  const fresh = await restarted.snapshot(); assert.equal(fresh.events.length, 1); assert.equal(fresh.events[0].session, restarted.session);
  assert.equal(await readFile(path.join(directory, 'manual-admin.log'), 'utf8'), 'leave alone');
});

test('denied storage, full disk, hanging writes and queue overflow report degradation without throwing', async (t) => {
  const root = await fixture(t);
  const denied = path.join(root, 'denied'); await mkdir(denied, { mode: 0o500 });
  const store = createDiagnosticStore({ directory: denied, component: 'server' });
  assert.doesNotThrow(() => store.record(event())); await store.flush();
  const unavailable = await store.snapshot(); assert.equal(unavailable.availability, 'degraded'); assert.ok(unavailable.failures > 0); assert.equal((await stat(denied)).mode & 0o777, 0o500);
  await chmod(denied, 0o700);
  const full = createDiagnosticStore({ directory: path.join(root, 'full'), component: 'server', append: async () => { throw Object.assign(new Error('disk full private'), { code: 'ENOSPC' }); } });
  full.record(event()); await full.flush(); assert.ok((await full.snapshot()).failures > 0);
  const hung = createDiagnosticStore({ directory: path.join(root, 'hung'), component: 'server', append: () => new Promise(() => {}) });
  for (let i = 0; i < 200; i++) hung.record(event());
  const start = Date.now(); assert.equal(await hung.flush(10), false); assert.ok(Date.now() - start < 300);
  const snapshot = await hung.snapshot(); assert.ok(snapshot.dropped > 0); assert.equal(snapshot.availability, 'degraded'); assert.ok(snapshot.events.length <= 120);
  assert.doesNotMatch(JSON.stringify(await full.snapshot()), /private|disk full/);
});

test('export during rotation and excessive directory input stays bounded and preserves safe in-memory evidence', async (t) => {
  const root = await fixture(t), directory = path.join(root, 'rotating');
  let time = Date.now();
  const store = createDiagnosticStore({ directory, component: 'gateway', segmentBytes: 2048, maxSegments: 2, now: () => ++time });
  for (let i = 0; i < 20; i++) store.record({ operation: 'switch', code: 'switch_rejected', severity: 'warn', outcome: 'failed' });
  const reading = store.snapshot();
  for (let i = 0; i < 100; i++) store.record({ operation: 'poll', code: 'none', severity: 'info', outcome: 'ok', body: 'private' });
  const exported = await reading; await store.flush(2000);
  assert.ok(exported.events.length <= 120); assert.doesNotMatch(JSON.stringify(exported), /private/);
  const files = await readdir(directory); assert.ok(files.length <= 2);
  for (let i = 0; i < 65; i++) await writeFile(path.join(directory, 'unrelated-' + i), 'private', { mode: 0o600 });
  const blocked = await store.snapshot(); assert.equal(blocked.availability, 'degraded');
  assert.doesNotMatch(JSON.stringify(blocked), /private|unrelated/);
});

test('healthy background reads coalesce for thirty seconds without suppressing errors or writes', async (t) => {
  const root = await fixture(t); let time = Date.now();
  const store = createDiagnosticStore({ directory: path.join(root, 'sampled'), component: 'server', now: () => time });
  const healthy = { operation: 'document_read', code: 'none', status: 200, severity: 'info', outcome: 'ok' };
  for (let i = 0; i < 100; i++) store.record(healthy);
  for (let i = 0; i < 5; i++) store.record({ ...healthy, code: 'conflict', severity: 'warn', outcome: 'failed', status: 412 });
  for (let i = 0; i < 5; i++) store.record({ ...healthy, operation: 'document_write' });
  time += 30000; store.record(healthy); await store.flush(2000);
  const result = await store.snapshot(); assert.equal(result.coalesced, 99); assert.equal(result.events.length, 12);
  assert.equal(result.events.filter((e) => e.code === 'conflict').length, 5);
});

test('managed directory/segment links, hardlinks, corruption and oversized source files fail safely', async (t) => {
  t.mock.method(Date, 'now', () => Date.parse(at));
  const root = await fixture(t), outside = path.join(root, 'outside'); await mkdir(outside, { mode: 0o700 });
  await symlink(outside, path.join(root, 'linked'));
  const linked = createDiagnosticStore({ directory: path.join(root, 'linked'), component: 'server' }); linked.record(event()); await linked.flush();
  assert.equal((await linked.snapshot()).availability, 'degraded'); assert.deepEqual(await readdir(outside), []);
  const directory = path.join(root, 'store'); await mkdir(directory, { mode: 0o700 });
  const file = path.join(directory, 'events-1792152000000-aaaaaaaa.jsonl');
  await writeFile(path.join(outside, 'secret'), 'private-secret', { mode: 0o600 }); await symlink(path.join(outside, 'secret'), file);
  const store = createDiagnosticStore({ directory, component: 'server' }); assert.equal((await store.snapshot()).availability, 'degraded');
  await rm(file); await link(path.join(outside, 'secret'), file); assert.equal((await store.snapshot()).availability, 'degraded');
  await rm(file); await writeFile(file, 'broken private\n' + JSON.stringify(event({ component: 'server', body: 'private' })) + '\n', { mode: 0o600 });
  const corrupt = await store.snapshot(); assert.equal(corrupt.availability, 'degraded'); assert.doesNotMatch(JSON.stringify(corrupt), /private/);
  const nativeFile = path.join(root, 'native-diagnostics.json');
  await symlink(path.join(outside, 'secret'), nativeFile); assert.equal((await readNativeDiagnosticSnapshot(nativeFile)).availability, 'unavailable');
  await rm(nativeFile); await writeFile(nativeFile, 'x'.repeat(65537), { mode: 0o600 }); assert.equal((await readNativeDiagnosticSnapshot(nativeFile)).availability, 'unavailable');
  await writeFile(nativeFile, JSON.stringify({ events: [event({ component: 'native', operation: 'bridge', code: 'bridge_lost', body: 'private' })] }), { mode: 0o600 });
  const native = await readNativeDiagnosticSnapshot(nativeFile); assert.equal(native.availability, 'available'); assert.equal(native.events[0].code, 'bridge_lost'); assert.doesNotMatch(JSON.stringify(native), /private/);
});

test('support collection has a deadline and does not expose provider errors or malformed sources', async () => {
  const result = await collectSupportDiagnostics([
    { component: 'gateway', snapshot: () => new Promise(() => {}) },
    { component: 'server', snapshot: async () => { throw new Error('private root and provider output'); } },
    { component: 'native', snapshot: async () => ({ component: 'native', events: [event({ component: 'native', details: 'private' })], failures: Infinity, availability: 'available' }) },
  ], 10);
  assert.deepEqual(result.slice(0, 2).map((s) => s.availability), ['unavailable', 'unavailable']);
  assert.doesNotMatch(JSON.stringify(result), /private|provider/); assert.equal(result[2].failures, 0);
});

test('browser distinguishes network loss, auth, conflict, unconfirmed save and saved-but-index-failed', () => {
  const log = createFeedbackDiagnostics(() => new Date(at));
  for (const status of [401, 412, 504]) {
    const response = new Response(JSON.stringify({ error: { code: status === 412 ? 'precondition_failed' : status === 504 ? 'backend_timeout' : 'unauthorized', message: 'private' } }), { status });
    log.finish('/memories/all/documents/private?key=private', 'PUT', log.begin(), response);
    log.result('/memories/all/documents/private', 'PUT', response, { error: { code: status === 412 ? 'precondition_failed' : status === 504 ? 'backend_timeout' : 'unauthorized', message: 'private' } });
  }
  log.finish('/memories/all/documents/private', 'PUT', log.begin());
  log.event('save', { outcome: 'unconfirmed', code: 'unconfirmed', severity: 'warn', body: 'private' });
  const saved = new Response('{}', { status: 200 }); log.finish('/memories/all/notes', 'POST', log.begin(), saved);
  log.result('/memories/all/notes', 'POST', saved, { saved: true, indexing: { status: 'failed' }, title: 'private', file: '/private/path' });
  const report = log.snapshot({ view: 'note', connection: 'connected', companion: false }, 'Chrome/150.0 private-user');
  const codes = JSON.parse(report).events.map((e) => e.code);
  for (const code of ['unauthorized', 'conflict', 'backend_timeout', 'network', 'unconfirmed', 'index_failed']) assert.ok(codes.includes(code), code);
  assert.doesNotMatch(report, /private/);
  assert.ok(Buffer.byteLength(feedbackEmailDraft('\ud800'.repeat(4000), report)) <= MAX_FEEDBACK_BYTES);
  assert.throws(() => feedbackEmailDraft('message', 'x'.repeat(65536)), /limit/);
});

test('server log mirror preserves publication versus index failure and opaque correlation', async (t) => {
  const root = await fixture(t), store = createDiagnosticStore({ directory: path.join(root, 'store'), component: 'server' });
  const noop = () => {};
  const logger = diagnosticServerLogger({ log: noop, info: noop, warn: noop, error: noop }, store);
  const request = newDiagnosticId();
  diagnosticRequestContext.run(request, () => logger.info('remote_write_success', { path: '/memories/all/notes', saved: true, indexing_status: 'failed', stale: true, file: '/private/file' }));
  await store.flush(); const snapshot = await store.snapshot();
  assert.ok(snapshot.events.some((e) => e.code === 'saved' && e.outcome === 'ok'));
  assert.ok(snapshot.events.some((e) => e.code === 'index_state_failed' && e.outcome === 'pending'));
  assert.ok(snapshot.events.every((e) => e.request === request));
  assert.doesNotMatch(JSON.stringify(snapshot), /private/);
});

test('legacy formatter handles nested/circular objects, errors and poisoned getters without exposing named secrets', () => {
  const nested = { password: 'private', items: [{ authorization: 'private', safe: 'Bearer private' }], error: new Error('private') }; nested.loop = nested;
  const line = formatLogLine({ date: new Date(at), level: 'info', event: 'test', details: { nested } });
  assert.doesNotMatch(line, /private/);
  const logger = createFileLogger({ root: '/unused', name: 'fixture', append: async () => {} });
  assert.doesNotThrow(() => logger.info('test', { get nested() { throw new Error('private'); } }));
});
