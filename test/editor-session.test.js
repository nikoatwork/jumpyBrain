import assert from "node:assert/strict";
import test from "node:test";
import { createLiveEditorSession } from "../dist/adapters/http-server/live-editor-session.js";
import { createCollaborationDraftStore } from "../dist/adapters/http-server/collaboration-drafts.js";
import { applySourceSplices } from "../dist/core/collaboration/source.js";

const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function memoryStorage() {
  const entries = new Map();
  return { get length() { return entries.size; }, key: i => [...entries.keys()][i] ?? null,
    getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value), removeItem: key => entries.delete(key) };
}
function fixture(t, options = {}) {
  const previous = globalThis.WebSocket, frames = [], sockets = [], held = [];
  let canonical = { documentId: "note", epoch: "epoch", revision: 0, prefix: "---\ntitle: Note\n---\n", body: "Saved body", title: "Note", file: "notes/note.md", contentHash: "hash-0", saved: true };
  class Socket {
    static CONNECTING = 0; static OPEN = 1; readyState = 0; bufferedAmount = 0;
    constructor() { sockets.push(this); queueMicrotask(() => { this.readyState = 1; this.onopen?.(); }); }
    send(raw) {
      const frame = JSON.parse(raw); frames.push(frame);
      let result = {};
      if (frame.method === "hello") result = { protocol: 2, principal: { id: "writer", role: options.role ?? "writer" } };
      if (["open", "resync"].includes(frame.method)) result = canonical;
      if (frame.method === "edit") {
        canonical = { ...canonical, revision: canonical.revision + 1, body: applySourceSplices(canonical.body, frame.params.operations), contentHash: "hash-" + (canonical.revision + 1),
          operation: { revision: canonical.revision + 1, splices: frame.params.operations, operationId: frame.params.operationId, actor: JSON.stringify(["writer", "tab"]) } };
        result = canonical;
      }
      const reply = () => this.onmessage?.({ data: JSON.stringify({ id: frame.id, ok: true, result }) });
      if (options.hold === frame.method) held.push(reply); else queueMicrotask(reply);
    }
    close(code = 1000) { this.readyState = 3; this.onclose?.({ code }); }
  }
  globalThis.WebSocket = Socket;
  let current = true, scope = "brain/principal/tab", shown = "", changes = 0, disposed = 0;
  const storage = options.storage ?? memoryStorage(), drafts = createCollaborationDraftStore(storage);
  const session = createLiveEditorSession({ generation: 1, documentId: "note", clientId: "tab", drafts,
    isCurrent: () => current, scope: () => scope,
    connection: options.connection ?? (async () => ({ url: "ws://localhost/ws", scope: "session-test" })),
    reopen: async () => true,
    editor: { getMarkdown: () => shown, applyCollaborativeMarkdown(body) { shown = body; return { status: "applied" }; } },
    onChange(state) { changes++; if (!session.collaboration) shown = state.draft; },
    onDispose() { disposed++; },
  });
  t.after(() => { session.cancel(); globalThis.WebSocket = previous; });
  session.hydrate({ ...canonical, content: canonical.prefix + canonical.body });
  const input = (text = " private") => {
    const before = session.state.draft, body = before + text; shown = body;
    session.input(body, { before, after: body, operations: [{ start: before.length, deleteCount: 0, insert: text }] });
  };
  return { session, frames, sockets, held, drafts, input, get canonical() { return canonical; }, get shown() { return shown; }, get changes() { return changes; }, get disposed() { return disposed; },
    setHold(method) { options.hold = method; },
    metadata(prefix = "---\ntitle: Note\nattention_at: null\n---\n") {
      const revision = canonical.revision + 1;
      canonical = { ...canonical, prefix, revision, contentHash: "metadata-" + revision,
        operation: { revision, splices: [], actor: "metadata-writer", operationId: "metadata-" + revision } };
      return { id: "note", title: canonical.title, content: canonical.prefix + canonical.body, contentHash: canonical.contentHash };
    },
    broadcast() { sockets.at(-1).onmessage?.({ data: JSON.stringify({ event: "document", documentId: "note", snapshot: canonical }) }); },
    replaceSurface(value) { shown = value; },
    changeScope() { scope = "other-brain/principal/tab"; }, retire() { current = false; } };
}

test("live session reads acknowledged source separately from pending positional input", async t => {
  const h = fixture(t, { hold: "edit" });
  await h.session.connect(); await tick();
  const view = h.session.state;
  assert.equal(view.saveStatus, "saved"); assert.equal(view.contentHash, "hash-0"); assert.equal(view.file, "notes/note.md");
  h.input();
  const saving = h.session.flush(); await tick();
  assert.equal(h.frames.filter(f => f.method === "edit").length, 1);
  assert.deepEqual(h.frames.find(f => f.method === "edit").params.operations, [{ start: 10, deleteCount: 0, insert: " private" }]);
  assert.equal(view.draft, "Saved body private"); assert.equal(view.savedBody, "Saved body"); assert.equal(view.contentHash, "hash-0");
  assert.equal(view.saveStatus, "saving"); assert.equal(view.durableDraft, true); assert.equal(h.session.hasPending(), true);
  h.held.shift()(); assert.equal(await saving, true);
  assert.equal(h.session.state, view, "consumer view retains its identity across receipts");
  assert.equal(view.savedBody, h.canonical.body); assert.equal(view.contentHash, h.canonical.contentHash); assert.equal(view.saveStatus, "saved");
  assert.equal(h.session.hasPending(), false);
});

test("live metadata confirmation observes the actual revision without accepting an HTTP-only baseline", async t => {
  const h = fixture(t); await h.session.connect(); await tick();
  h.session.setNavigationPending(true);
  const receipt = h.metadata();
  assert.equal(h.session.state.contentHash, "hash-0");
  const confirmed = await h.session.acceptMetadata(receipt, "hash-0");
  assert.equal(confirmed, true);
  assert.equal(h.session.state.contentHash, receipt.contentHash);
  assert.match(h.session.state.frontmatterPrefix, /attention_at: null/);
  assert.equal(h.session.state.draft, "Saved body");
  assert.equal(h.shown, "Saved body");
  assert.equal(h.frames.filter(frame => frame.method === "open").length, 2);
  assert.equal(h.frames.some(frame => ["edit", "title", "resync"].includes(frame.method)), false);
});

test("live metadata confirmation allows an already observed matching checkpoint and refuses stale receipts", async t => {
  const h = fixture(t); await h.session.connect(); await tick();
  const receipt = h.metadata(); h.broadcast(); await tick();
  assert.equal(h.session.state.contentHash, receipt.contentHash);
  assert.equal(await h.session.acceptMetadata(receipt, "hash-0"), true, "WebSocket checkpoint can arrive before the HTTP receipt");
  const later = h.metadata("---\ntitle: Note\nattention_at: 2027-01-01T00:00:00Z\n---\n");
  h.broadcast(); await tick();
  assert.equal(await h.session.acceptMetadata(receipt, "hash-0"), false);
  assert.equal(h.session.state.contentHash, later.contentHash, "a stale receipt never rewinds the live owner");
});

test("live metadata confirmation protects private input and scoped authorization across its read", async t => {
  for (const transition of ["input", "scope", "cancel"]) await t.test(transition, async t => {
    const h = fixture(t); await h.session.connect(); await tick();
    const receipt = h.metadata(); h.setHold("open");
    const confirming = h.session.acceptMetadata(receipt, "hash-0"); await tick();
    assert.equal(h.held.length, 1);
    if (transition === "input") h.input(); else if (transition === "scope") h.changeScope(); else h.session.cancel();
    h.held.shift()();
    assert.equal(await confirming, false);
    assert.equal(h.session.state.contentHash, "hash-0", "no HTTP receipt is adopted when its observational read is fenced");
    assert.equal(h.session.state.draft, transition === "input" ? "Saved body private" : "Saved body");
  });
  await t.test("reader", async t => {
    const h = fixture(t, { role: "reader" }); await h.session.connect(); await tick();
    const receipt = h.metadata(), before = h.frames.length;
    assert.equal(await h.session.acceptMetadata(receipt, "hash-0"), false);
    assert.equal(h.frames.length, before);
  });
});

test("live metadata confirmation rejects changed source, identity, hash and pending title before reading", async t => {
  const h = fixture(t); await h.session.connect(); await tick();
  const receipt = h.metadata(), before = h.frames.length;
  for (const [payload, expected] of [
    [{ ...receipt, id: "another" }, "hash-0"],
    [{ ...receipt, title: "Changed title" }, "hash-0"],
    [{ ...receipt, content: receipt.content + "new body" }, "hash-0"],
    [receipt, "wrong-hash"],
  ]) assert.equal(await h.session.acceptMetadata(payload, expected), false);
  h.session.inputTitle("");
  assert.equal(await h.session.acceptMetadata(receipt, "hash-0"), false);
  assert.equal(h.frames.length, before);
  assert.equal(h.session.state.savedTitle, "Note");
  assert.equal(h.session.state.title, "");
});

test("blank names and offline private drafts retain barriers; clean offline reads can leave", async t => {
  const h = fixture(t); await h.session.connect(); await tick();
  h.session.inputTitle("");
  assert.equal(h.session.state.title, ""); assert.equal(h.session.state.savedTitle, "Note");
  assert.equal(await h.session.flush(), false); assert.equal(h.session.state.durableDraft, true);
  assert.equal(h.frames.some(f => f.method === "title"), false);
  h.session.inputTitle("Note"); assert.equal(await h.session.flush(), true);
  h.sockets[0].close(1012); assert.equal(h.session.state.liveStatus, "offline"); assert.equal(await h.session.flush(), true);
  h.input(); assert.equal(await h.session.flush(), false); assert.equal(h.session.state.unconfirmedSave, true);
});

test("credential fencing retains the old private draft and prevents late receipts and retries", async t => {
  const h = fixture(t, { hold: "edit" }); await h.session.connect(); await tick();
  h.input(); const saving = h.session.flush(); await tick();
  h.changeScope(); h.session.block("Credentials changed", true);
  const changes = h.changes, count = h.frames.length;
  h.held.shift()(); await tick();
  assert.equal(await saving, false); assert.equal(h.changes, changes);
  assert.equal(h.session.state.liveStatus, "blocked"); assert.equal(h.session.state.liveCanWrite, false);
  assert.equal(h.session.state.draft, "Saved body private"); assert.equal(h.session.state.savedBody, "Saved body");
  assert.equal(h.session.state.saveStatus, "failed"); assert.equal(await h.session.retry(), false); assert.equal(h.frames.length, count);
  h.session.cancel(); assert.equal(h.disposed, 1, "fencing and cancellation share one disposal");
  assert.equal(h.drafts.list({ scope: "session-test", principalId: "writer", documentId: "note" }).value[0].body, "Saved body private");
});

test("capability reads and delayed open replies cannot attach to a retired scope", async t => {
  for (const transition of ["cancel", "scope", "note"]) await t.test(transition, async t => {
    const connection = deferred(), h = fixture(t, { connection: () => connection.promise });
    const opening = h.session.connect();
    if (transition === "cancel") h.session.cancel(); else if (transition === "scope") h.changeScope(); else h.retire();
    connection.resolve({ url: "ws://localhost/ws", scope: "retired" }); await opening;
    assert.equal(h.sockets.length, 0); assert.equal(await h.session.flush(), false);
  });
  await t.test("scope changed before open can paint", async t => {
    const h = fixture(t, { hold: "open" }); await h.session.connect(); await tick();
    h.changeScope(); h.replaceSurface("Another note's surface");
    h.held.shift()(); await tick();
    assert.equal(h.shown, "Another note's surface"); assert.equal(h.session.state.cancelled, true);
    assert.equal(await h.session.flush(), false);
  });
  await t.test("open receipt", async t => {
    const h = fixture(t, { hold: "open" }); await h.session.connect(); await tick();
    h.session.cancel(); const changes = h.changes;
    h.held.shift()(); await tick();
    assert.equal(h.changes, changes); assert.equal(h.session.state.savedBody, "Saved body");
    assert.equal(h.session.state.cancelled, true); assert.equal(h.disposed, 1);
  });
});

test("a late canonical read cannot hydrate a different scope", t => {
  const h = fixture(t); h.changeScope();
  h.session.hydrate({ content: "Late old-scope source", title: "Stale", contentHash: "stale" });
  assert.equal(h.session.state.cancelled, true); assert.equal(h.session.state.contentHash, "hash-0");
  assert.equal(h.shown, "Saved body");
});

test("failed draft storage remains visible and cannot discard unique work during recovery", async t => {
  const storage = memoryStorage(), h = fixture(t, { storage }); await h.session.connect(); await tick();
  h.sockets[0].close(1012);
  storage.setItem = () => { throw new Error("quota"); };
  h.input(); assert.equal(h.session.state.durableDraft, false); assert.match(h.session.state.saveError, /copy your draft/);
  const other = { version: 2, scope: "session-test", principalId: "writer", documentId: "note", clientId: "another-tab", epoch: "epoch", baseRevision: 0, baseBody: "Saved body", body: "Other unique draft", updatedAt: 1 };
  assert.equal(h.session.recoverDraft(other), false); assert.equal(h.session.state.draft, "Saved body private");
  assert.equal(await h.session.flush(), false);
});

test("read-only and unavailable editing keep confirmed source readable without publication", async t => {
  const h = fixture(t, { role: "reader" }); await h.session.connect(); await tick();
  assert.equal(h.session.state.liveStatus, "readonly"); assert.equal(h.session.state.liveCanWrite, false);
  assert.equal(await h.session.flush(), true);
  h.session.block("Saved content is shown");
  assert.equal(h.session.state.saveStatus, "saved"); assert.equal(h.session.state.savedBody, "Saved body");
  assert.equal(await h.session.flush(), true); assert.equal(await h.session.reloadSaved(), true);
  assert.equal(h.frames.some(f => ["edit", "title", "resync"].includes(f.method)), false);
});
