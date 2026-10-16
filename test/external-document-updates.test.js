import assert from "node:assert/strict";
import test from "node:test";
import { createDocumentEditor, splitEditableDocument, composeEditableDocument } from "../dist/adapters/http-server/document-controller.js";
import { externalLineChanges, installExternalDocumentUpdates } from "../dist/adapters/http-server/external-document-updates.js";
import { mergeDocumentEdits } from "../dist/adapters/http-server/document-merge.js";

function harness(overrides = {}) {
  const writes = [], applied = [];
  let current = true;
  const editor = createDocumentEditor({
    generation: 1, documentId: "note", debounceMs: 750, persistentEditing: true,
    setTimer: () => 1, clearTimer() {}, isCurrent: () => current,
    splitDocument: splitEditableDocument, composeDocument: composeEditableDocument,
    readDocument: async () => ({ content: "Original", contentHash: "initial", title: "Note" }),
    writeDocument: (id, content, hash) => new Promise((resolve, reject) => writes.push({ id, content, hash, resolve, reject })),
    onChange() {}, onExternalUpdate: (body) => applied.push(body),
    ...overrides,
  });
  editor.hydrate({ content: "Original", contentHash: "initial", title: "Note" });
  const baseline = () => ({ hash: editor.state.contentHash, revision: editor.state.draftRevision, token: editor.state.reconcileToken });
  const payload = { content: "External body", contentHash: "external", title: "Renamed" };
  return { editor, baseline, payload, writes, applied, cancel: () => { current = false; } };
}

test("clean external snapshots establish a saved baseline without a write; metadata does not rehydrate the body", () => {
  const h = harness();
  assert.equal(h.editor.acceptExternal(h.payload, h.baseline(), () => true), true);
  assert.equal(h.editor.state.draft, "External body");
  assert.equal(h.editor.state.title, "Renamed");
  assert.equal(h.editor.state.contentHash, "external");
  assert.equal(h.editor.state.dirty, false);
  assert.equal(h.editor.state.externalStatus, "updated");
  assert.deepEqual(h.applied, ["External body"]);
  assert.equal(h.writes.length, 0);
  h.editor.clearExternalNotice();
  assert.equal(h.editor.state.externalStatus, "");
  assert.equal(h.editor.acceptExternal({ ...h.payload, contentHash: "metadata", content: "---\nupdated_at: today\n---\nExternal body" }, h.baseline(), () => true), false);
  assert.equal(h.editor.state.contentHash, "metadata");
  assert.deepEqual(h.applied, ["External body"]);
  assert.equal(h.editor.state.externalStatus, "");
});

test("typing after a check starts invalidates the response, even after undo to the saved body", () => {
  const h = harness(), baseline = h.baseline();
  h.editor.input("My typing");
  assert.equal(h.editor.acceptExternal(h.payload, baseline, () => true), false);
  assert.equal(h.editor.state.draft, "My typing");
  h.editor.input("Original");
  assert.equal(h.editor.acceptExternal(h.payload, baseline, () => true), false);
  assert.equal(h.editor.state.contentHash, "initial");
  assert.deepEqual(h.applied, []);
});

test("an existing local draft keeps its text and hash; a stale save fails instead of overwriting external work", async () => {
  const h = harness();
  h.editor.input("My typing");
  assert.equal(h.editor.acceptExternal(h.payload, h.baseline(), () => true), false);
  assert.equal(h.editor.state.externalStatus, "pending");
  assert.equal(h.editor.state.draft, "My typing");
  assert.equal(h.editor.state.contentHash, "initial");
  const save = h.editor.startSave();
  assert.equal(h.writes[0].hash, "initial");
  h.writes[0].reject({ status: 412, message: "Changed elsewhere" });
  await save;
  h.editor.input("Original");
  assert.equal(h.editor.state.unconfirmedSave, true);
  assert.equal(h.editor.acceptExternal(h.payload, h.baseline(), () => true), false);
  assert.equal(h.editor.state.draft, "Original");
  assert.equal(h.editor.state.dirty, true);
  assert.equal(h.editor.state.contentHash, "initial");
});

test("interaction holds an otherwise clean update without advancing its hash", () => {
  const h = harness();
  assert.equal(h.editor.acceptExternal(h.payload, h.baseline(), () => false), false);
  assert.equal(h.editor.state.externalStatus, "pending");
  assert.equal(h.editor.state.draft, "Original");
  assert.equal(h.editor.state.contentHash, "initial");
  assert.equal(h.editor.acceptExternal(h.payload, h.baseline(), () => true), true);
  assert.equal(h.editor.state.externalStatus, "updated");
});

test("a completed save invalidates an earlier watcher read and earlier reconciliation", async () => {
  const h = harness(), baseline = h.baseline();
  h.editor.input("My saved text");
  const save = h.editor.startSave();
  h.writes[0].resolve({ newContentHash: "mine" });
  await save;
  assert.equal(h.editor.acceptExternal(h.payload, baseline, () => true), false);
  assert.equal(h.editor.state.contentHash, "mine");
  assert.equal(h.editor.state.draft, "My saved text");
});

test("navigation, cancellation, malformed reads, and old accepted baselines cannot replace a note", () => {
  const h = harness(), baseline = h.baseline();
  h.editor.setNavigationPending(true);
  assert.equal(h.editor.acceptExternal(h.payload, baseline, () => true), false);
  h.editor.setNavigationPending(false);
  assert.throws(() => h.editor.acceptExternal({ contentHash: "empty" }, baseline, () => true), /Invalid/);
  assert.equal(h.editor.state.draft, "Original");
  h.editor.acceptExternal(h.payload, baseline, () => true);
  assert.equal(h.editor.acceptExternal({ ...h.payload, contentHash: "older", content: "Older response" }, baseline, () => true), false);
  h.cancel();
  assert.equal(h.editor.acceptExternal({ ...h.payload, contentHash: "late" }, h.baseline(), () => true), false);
  assert.equal(h.editor.state.contentHash, "external");
});

test("unchanged and title-only snapshots do not rebuild or highlight the body", () => {
  const h = harness();
  assert.equal(h.editor.acceptExternal({ content: "Original", contentHash: "initial", title: "Note" }, h.baseline(), () => true), false);
  assert.equal(h.editor.acceptExternal({ content: "Original", contentHash: "renamed", title: "New title" }, h.baseline(), () => true), true);
  assert.equal(h.editor.state.title, "New title");
  assert.deepEqual(h.applied, []);
  h.editor.input("Original");
  assert.equal(h.editor.state.externalStatus, "");
  assert.equal(h.writes.length, 0);
});

test("line hints handle additions, deletions, repeats, blank lines, and large notes in linear space", () => {
  assert.deepEqual(externalLineChanges("First\n\nLast", "First\n\nAdded\nLast").changed, [false, false, true, false]);
  assert.deepEqual(externalLineChanges("First\nDeleted\nLast", "First\nLast").changed, [false, false]);
  assert.deepEqual(externalLineChanges("Same\nSame", "Same\nSame\nSame").changed, [false, false, true]);
  assert.deepEqual(externalLineChanges("", "\n").changed, [false, false]);
  const large = Array.from({ length: 10000 }, (_, i) => String(i)).join("\n");
  const changes = externalLineChanges(large, large + "\nNew");
  assert.equal(changes.changed.filter(Boolean).length, 1);
});

test("three-way draft merge keeps independent edits and both end additions, but rejects overlapping replacements", () => {
  assert.equal(mergeDocumentEdits("First\nLast", "First\nLast typed", "Revised\nLast"), "Revised\nLast typed");
  assert.equal(mergeDocumentEdits("Base\n", "Base\nUser typing", "Base\nAgent line\n"), "Base\nUser typing\n\nAgent line\n");
  assert.equal(mergeDocumentEdits("Base", "Base\nUser", "Base\nAgent"), "Base\nUser\nAgent");
  assert.equal(mergeDocumentEdits("Same", "Same edit", "Same edit"), "Same edit");
  assert.equal(mergeDocumentEdits("Same", "Same", "Remote"), "Remote");
  assert.equal(mergeDocumentEdits("Same", "Local", "Same"), "Local");
  assert.equal(mergeDocumentEdits("Old paragraph", "My paragraph", "Agent paragraph"), null);
  assert.equal(mergeDocumentEdits("🦊\nand cat", "🐐\nand cat", "🦊\nand dog"), "🐐\nand dog");
  assert.equal(mergeDocumentEdits("🦊", "🐐", "🦋"), null);
  assert.equal(mergeDocumentEdits("cat", "kat", "carp"), null, "do not blend different edits to one word");
  assert.equal(mergeDocumentEdits("abc", "aXbc", "aYbc"), null, "ambiguous insertion inside the same passage needs review");
});

test("a known stale save waits for idle, merges independent changes, and saves with the fresh precondition", async () => {
  let allowed = false, reads = 0;
  const h = harness({ canApplyExternal: () => allowed, readDocument: async () => {
    reads++; return { content: "Original\nAgent line\n", title: "Renamed", contentHash: "remote" };
  } });
  h.editor.input("Original\nMy typing");
  const first = h.editor.startSave(); h.writes[0].reject({ status: 412, message: "Document content hash is stale" }); await first;
  assert.equal(h.editor.state.saveStatus, "editing");
  assert.equal(h.editor.state.saveError, "");
  assert.equal(h.editor.state.unconfirmedSave, false, "a confirmed 412 did not commit a write");
  assert.equal(await h.editor.startSave(), false);
  assert.equal(reads, 0, "do not read/rebase the active typing surface");
  assert.equal(h.editor.state.contentHash, "initial");
  allowed = true;
  const merged = h.editor.startSave(); await tick();
  assert.equal(h.writes[1].hash, "remote");
  assert.ok(h.writes[1].content.includes("My typing\nAgent line"));
  assert.equal(h.editor.state.title, "Renamed");
  h.writes[1].resolve({ newContentHash: "merged" }); await merged;
  assert.equal(h.editor.state.saveStatus, "saved");
  assert.equal(h.editor.state.dirty, false);
  assert.equal(h.editor.state.contentHash, "merged");
});

test("real overlapping edits retain the draft with a useful review message and no force write", async () => {
  const h = harness({ canApplyExternal: () => true, readDocument: async () => ({ content: "Agent replacement", title: "Note", contentHash: "remote" }) });
  h.editor.input("My replacement");
  const first = h.editor.startSave(); h.writes[0].reject({ status: 412, message: "raw hash error" }); await first;
  await h.editor.startSave();
  assert.equal(h.editor.state.draft, "My replacement");
  assert.equal(h.editor.state.contentHash, "initial");
  assert.equal(h.editor.state.saveErrorCode, "precondition_failed");
  assert.match(h.editor.state.saveError, /Your writing is kept here.*Review both versions/);
  assert.doesNotMatch(h.editor.state.saveError, /hash|412|raw/);
  assert.equal(h.writes.length, 1);
});

test("typing or changing brain scope during merge reads invalidates the result", async () => {
  for (const change of ["typing", "scope"]) {
    let resolve, scope = "one";
    const h = harness({ canApplyExternal: () => true, scope: () => scope, readDocument: () => new Promise((yes) => { resolve = yes; }) });
    h.editor.input("Original local");
    const first = h.editor.startSave(); h.writes[0].reject({ status: 412 }); await first;
    const merging = h.editor.startSave();
    if (change === "typing") h.editor.input("Original local still typing"); else scope = "two";
    resolve({ content: "Original\nAgent", title: "Note", contentHash: "remote" }); await merging;
    assert.equal(h.editor.state.draft, change === "typing" ? "Original local still typing" : "Original local");
    assert.equal(h.editor.state.contentHash, "initial");
    assert.equal(h.writes.length, 1);
  }
});

test("concurrent title changes need review; missing merge reads retain the draft", async () => {
  for (const failure of ["title", "offline"]) {
    const h = harness({ canApplyExternal: () => true, readDocument: async () => {
      if (failure === "offline") throw new Error("offline");
      return { content: "Original", title: "Agent title", contentHash: "remote" };
    } });
    h.editor.inputTitle("My title");
    const first = h.editor.startSave(); h.writes[0].reject({ status: 412 }); await first;
    await h.editor.startSave();
    assert.equal(h.editor.state.title, "My title");
    assert.equal(h.editor.state.contentHash, "initial");
    assert.match(h.editor.state.saveError, /writing is kept here/);
    assert.equal(h.writes.length, 1);
  }
});

test("automatic conflict resolution is bounded when another writer keeps winning", async () => {
  const h = harness({ canApplyExternal: () => true, readDocument: async () => ({ content: "Original\nAgent", title: "Note", contentHash: "remote" }) });
  h.editor.input("Original\nLocal");
  for (let index = 0; index < 3; index++) {
    const save = h.editor.startSave(); await tick();
    h.writes[index].reject({ status: 412 }); await save;
  }
  assert.equal(h.editor.state.autoSaveBlocked, true);
  assert.match(h.editor.state.saveError, /keeps changing/);
  assert.ok(h.editor.state.draft.includes("Local"));
  assert.equal(h.writes.length, 3);
});

const tick = () => new Promise((resolve) => setImmediate(resolve));
function watcherHarness() {
  const h = harness(), doc = new EventTarget(), win = new EventTarget();
  const timers = new Map(), requests = [];
  let id = 0, scope = "brain:1", enabled = true, updates = 0;
  Object.assign(win, { HTMLElement: class {},
    setTimeout: (callback, delay) => { timers.set(++id, { callback, delay }); return id; },
    clearTimeout: (id) => timers.delete(id), getSelection: () => null });
  Object.assign(doc, { defaultView: win, visibilityState: "visible", querySelector: () => null, activeElement: null });
  const stop = installExternalDocumentUpdates({
    document: doc, editor: () => h.editor, scope: () => scope, enabled: () => enabled,
    read: (_, options) => new Promise((resolve, reject) => requests.push({ ...options, resolve, reject })),
    onUpdated: () => updates++,
  });
  return { ...h, doc, win, timers, requests, stop,
    setScope: (value) => { scope = value; }, disable: () => { enabled = false; },
    get updates() { return updates; },
    fire(delay) {
      const [key, value] = [...timers].find(([, value]) => value.delay === delay) ?? [];
      assert.ok(value, `timer with delay ${delay}`); timers.delete(key); value.callback();
    },
  };
}

test("watcher serializes reads, backs off failures, and does not replace a note on read errors", async () => {
  const h = watcherHarness();
  h.fire(2000);
  h.win.dispatchEvent(new Event("focus"));
  assert.equal(h.requests.length, 1);
  assert.deepEqual([...h.timers.values()].map((timer) => timer.delay), [10000], "only the deadline exists while a request runs");
  h.requests[0].reject(new Error("offline")); await tick();
  assert.equal(h.editor.state.draft, "Original");
  h.fire(4000);
  h.requests[1].reject({ status: 404 }); await tick();
  assert.equal(h.editor.state.draft, "Original");
  h.fire(8000);
  h.requests[2].resolve(h.payload); await tick();
  assert.equal(h.editor.state.draft, "External body");
  assert.equal(h.updates, 1);
  assert.ok([...h.timers.values()].some((timer) => timer.delay === 2000));
  h.stop(); assert.equal(h.timers.size, 0);
});

test("hidden pages cancel reads and discard late responses even if transport ignores abort", async () => {
  const h = watcherHarness(); h.fire(2000);
  h.doc.visibilityState = "hidden"; h.doc.dispatchEvent(new Event("visibilitychange"));
  assert.equal(h.requests[0].signal.aborted, true);
  h.requests[0].resolve(h.payload); await tick();
  assert.equal(h.editor.state.draft, "Original");
  assert.equal(h.timers.size, 0);
  h.doc.visibilityState = "visible"; h.doc.dispatchEvent(new Event("visibilitychange")); h.fire(0);
  h.requests[1].resolve(h.payload); await tick();
  assert.equal(h.editor.state.draft, "External body");
  h.stop();
});

test("credentials/brain changes and expired sessions fence in-flight watcher responses", async () => {
  for (const invalidate of [(h) => h.setScope("brain:2"), (h) => h.disable(), (h) => h.editor.cancel()]) {
    const h = watcherHarness(); h.fire(2000); invalidate(h);
    h.requests[0].resolve(h.payload); await tick();
    assert.equal(h.editor.state.draft, "Original");
    assert.equal(h.updates, 0); h.stop();
  }
});

test("watcher deadlines and page lifecycle never accept aborted responses", async () => {
  const h = watcherHarness(); h.fire(2000); h.fire(10000);
  assert.equal(h.requests[0].signal.aborted, true);
  h.requests[0].resolve(h.payload); await tick();
  assert.equal(h.editor.state.draft, "Original");
  h.fire(2000); h.win.dispatchEvent(new Event("pagehide"));
  h.requests[1].resolve(h.payload); await tick();
  assert.equal(h.timers.size, 0);
  assert.equal(h.editor.state.draft, "Original");
  h.win.dispatchEvent(new Event("pageshow")); h.fire(0);
  h.requests[2].resolve(h.payload); await tick();
  assert.equal(h.updates, 1); h.stop();
});
