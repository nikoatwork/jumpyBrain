import assert from "node:assert/strict";
import test from "node:test";
import { createAttentionList } from "../dist/adapters/http-server/browser-attention.js";
import { customSnooze, snoozeChoices } from "../dist/adapters/http-server/note-attention.js";
import { createDocumentEditor, splitEditableDocument, composeEditableDocument } from "../dist/adapters/http-server/document-controller.js";

const id = "mem_a0000000-0000-4000-8000-000000000001";
test("attention reads discard superseded and different-brain responses even if abort is ignored", async () => {
  let scope = "a"; const reads = [], timers = [];
  const list = createAttentionList({ scope: () => scope, enabled: () => true, now: () => 1000,
    fetch: signal => new Promise((resolve, reject) => reads.push({ signal, resolve, reject })),
    setTimer: (callback, delay) => { timers.push({ callback, delay }); return timers.length; }, clearTimer() {}, onChange() {},
  });
  const first = list.load(), second = list.load();
  assert.equal(reads[0].signal.aborted, true);
  reads[0].resolve({ notes: [{ id, title: "Stale" }] }); await first;
  assert.equal(list.state.notes.length, 0);
  reads[1].resolve({ notes: [{ id, title: "Current" }, { id, title: "Duplicate" }], nextWakeAt: new Date(3000).toISOString() }); await second;
  assert.deepEqual(list.state.notes.map(x => x.title), ["Current"]);
  assert.equal(timers[0].delay, 2025);
  timers[0].callback();
  scope = "b";
  reads[2].resolve({ notes: [{ id, title: "Wrong brain" }] });
  await Promise.resolve();
  const fourth = list.load(); assert.equal(list.state.notes.length, 0);
  reads[3].resolve({ notes: [{ id, title: "Brain B" }] }); await fourth;
  assert.deepEqual(list.state.notes.map(x => x.title), ["Brain B"]);
  list.cancel();
});

test("hidden/canceled attention reads cannot rearm timers; errors are retryable and output is bounded", async () => {
  let enabled = false, fail = false; const timers = [];
  const list = createAttentionList({ scope: () => "brain", enabled: () => enabled, now: () => 0,
    fetch: async () => { if (fail) throw { status: 401 }; return { notes: Array.from({ length: 115 }, (_, i) => ({ id: id.slice(0, -3) + String(i).padStart(3, "0"), title: "Note" })), nextWakeAt: "2099-01-01T00:00:00Z" }; },
    setTimer: (callback, delay) => { timers.push(delay); return timers.length; }, clearTimer() {}, onChange() {},
  });
  await list.load(); assert.equal(list.state.status, "idle");
  enabled = true; await list.load(); assert.equal(list.state.notes.length, 100); assert.equal(timers[0], 15_000);
  fail = true; await list.load(); assert.equal(list.state.status, "error"); assert.equal(list.state.notes.length, 0); assert.match(list.state.message, /Connect/);
  fail = false; await list.load(); assert.equal(list.state.status, "ready");
});

test("snooze presets use the next local calendar morning/Monday across DST", () => {
  const previous = process.env.TZ; process.env.TZ = "Europe/Berlin";
  try {
    const now = new Date(2026, 9, 24, 22, 30), choices = snoozeChoices(now);
    assert.equal(choices[0].at - now, 3_600_000);
    assert.equal(choices[1].at - now, 10_800_000);
    assert.equal(choices[2].at.getDate(), 25); assert.equal(choices[2].at.getHours(), 9);
    assert.equal(choices[3].at.getDay(), 1); assert.equal(choices[3].at.getDate(), 26); assert.equal(choices[3].at.getHours(), 9);
    assert.equal(snoozeChoices(new Date(2026, 9, 26, 8))[3].at.getDate(), 2, "Monday means next calendar week's Monday");
    assert.throws(() => customSnooze("2027-03-28T02:30", now.getTime()), /does not exist/);
    assert.throws(() => customSnooze("2026-10-25T02:30", now.getTime()), /occurs twice/);
    assert.throws(() => customSnooze("2026-02-30T12:00", 0), /does not exist/);
    assert.throws(() => customSnooze("2026-10-24T21:00", now.getTime()), /future/);
    assert.equal(customSnooze("2026-10-25T09:00", now.getTime()), "2026-10-25T08:00:00.000Z");
  } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
});

test("visible idle lists refresh without snoozes, recover after errors and isolate settled results", async () => {
  let scope = 'a', enabled = true, fail = false, reads = 0;
  const timers = new Map(); let nextTimer = 0;
  const list = createAttentionList({ scope: () => scope, enabled: () => enabled, now: () => 0,
    fetch: async () => { reads++; if (fail) throw new Error('offline'); return { notes: [], settled: [{ id, title: 'Settled' }], settledTotal: 120 }; },
    setTimer: (callback, delay) => { timers.set(++nextTimer, { callback, delay }); return nextTimer; },
    clearTimer: id => timers.delete(id), onChange() {},
  });
  await list.load(); assert.equal(timers.get(nextTimer).delay, 15_000);
  assert.equal(list.state.settled[0].id, id); assert.equal(list.state.settledTotal, 120);
  timers.get(nextTimer).callback(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(reads, 2);
  fail = true; await list.load(); assert.equal(timers.get(nextTimer).delay, 30_000);
  fail = false; await list.load(); assert.equal(list.state.status, 'ready');
  enabled = false; list.cancel(); const before = reads; await list.load(); assert.equal(reads, before);
  scope = 'b'; await list.load(); assert.deepEqual(list.state.settled, []);
  scope = null; await list.load(); assert.equal(list.state.status, 'idle');
});

test("confirmed metadata patches advance only a matching clean baseline without rebuilding writing", () => {
  const applied = [], writes = [];
  const editor = createDocumentEditor({ generation: 1, documentId: id, debounceMs: 750,
    setTimer: () => 1, clearTimer() {}, isCurrent: () => true,
    splitDocument: splitEditableDocument, composeDocument: composeEditableDocument,
    readDocument: async () => ({}), writeDocument: async (...args) => { writes.push(args); return {}; },
    onChange() {}, onExternalUpdate: body => applied.push(body),
  });
  editor.hydrate({ title: "Note", content: "---\ntitle: Note\n---\nBody", contentHash: "before" });
  editor.setNavigationPending(true);
  const metadata = { title: "Note", content: "---\ntitle: Note\nattention_at: null\n---\nBody", contentHash: "after" };
  assert.equal(editor.acceptMetadata(metadata, "wrong"), false);
  assert.equal(editor.acceptMetadata({ ...metadata, content: "Changed elsewhere" }, "before"), false);
  const token = editor.state.reconcileToken;
  assert.equal(editor.acceptMetadata(metadata, "before"), true);
  assert.equal(editor.state.contentHash, "after"); assert.equal(editor.state.draft, "Body");
  assert.ok(editor.state.reconcileToken > token); assert.match(editor.state.frontmatterPrefix, /attention_at: null/);
  assert.deepEqual(applied, []); assert.deepEqual(writes, []);
  editor.setNavigationPending(false); editor.input("Unsent draft");
  assert.equal(editor.acceptMetadata({ ...metadata, contentHash: "third" }, "after"), false);
  assert.equal(editor.state.contentHash, "after"); assert.equal(editor.state.draft, "Unsent draft");
});
