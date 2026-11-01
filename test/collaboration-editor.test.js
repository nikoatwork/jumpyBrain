import assert from "node:assert/strict";
import test from "node:test";
import { createCollaborationEditor, sourceDifference, reconcileSource } from "../dist/adapters/http-server/collaboration-editor.js";
import { collaborationClientId, createCollaborationDraftStore } from "../dist/adapters/http-server/collaboration-drafts.js";
import { createCollaborationClient } from "../dist/adapters/http-server/collaboration-client.js";

test("source differences reconstruct UTF-16 edits without splitting emoji", () => {
  const bodies = ["", "a", "a🐐b", "a🐈b", "🐐", "x\r\nβ\n", "**bold**", "# h\n\ntext", "é日本語"];
  for (const before of bodies) for (const after of bodies) {
    const diff = sourceDifference(before, after);
    assert.equal(before.slice(0, diff.start) + diff.insert + before.slice(diff.start + diff.deleteCount), after);
    assert.ok(!/[\uD800-\uDBFF]$/.test(before.slice(0, diff.start)), "start does not bisect surrogate");
    assert.ok(!/^[\uDC00-\uDFFF]/.test(before.slice(diff.start + diff.deleteCount)), "end does not bisect surrogate");
  }
});
test("source reconciliation keeps disjoint edits, same-position insertions, and both versions on overlap", () => {
  assert.deepEqual(reconcileSource("one two", "ONE two", "one TWO"), { body: "ONE TWO", conflict: false });
  assert.deepEqual(reconcileSource("ab", "aLOCALb", "aREMOTEb"), { body: "aREMOTELOCALb", conflict: false });
  assert.deepEqual(reconcileSource("ab", "aXXb", "aXXb"), { body: "aXXXXb", conflict: false }, "identical intentional inserts by different writers both survive");
  assert.deepEqual(reconcileSource("text", "draft", "saved"), { body: "draft", conflict: true });
});
function memoryStorage() {
  const entries = new Map();
  return { get length() { return entries.size; }, key(index) { return [...entries.keys()][index] ?? null; }, getItem(key) { return entries.get(key) ?? null; }, setItem(key, value) { entries.set(key, value); }, removeItem(key) { entries.delete(key); } };
}
test("recovery drafts are principal, brain, note and tab scoped; storage denial is explicit", () => {
  const storage = memoryStorage(), drafts = createCollaborationDraftStore(storage);
  const base = { version: 2, scope: "brain", principalId: "writer", documentId: "note", clientId: "tab-a", epoch: "epoch", baseRevision: 0, baseBody: "saved", body: "draft", updatedAt: 1 };
  assert.equal(drafts.save(base).value, true);
  assert.equal(drafts.save({ ...base, clientId: "tab-b", body: "other draft" }).value, true);
  assert.equal(drafts.read(base).value.body, "draft");
  assert.equal(drafts.list(base).value.length, 2);
  assert.equal(drafts.list({ ...base, principalId: "another" }).value.length, 0);
  assert.equal(drafts.list({ ...base, scope: "another" }).value.length, 0);
  drafts.remove(base); assert.equal(drafts.list(base).value[0].body, "other draft");
  const remainingKey = storage.key(0), retainedRecord = storage.getItem(remainingKey);
  storage.setItem(remainingKey, JSON.stringify({ ...base, scope: "wrong-brain", clientId: "tab-b" }));
  assert.equal(drafts.read({ ...base, clientId: "tab-b" }).value, null, "payload cannot cross its keyed scope");
  assert.ok(drafts.read({ ...base, clientId: "tab-b" }).error);
  assert.equal(drafts.list(base).value.length, 0);
  assert.ok(storage.getItem(remainingKey), "mis-scoped bytes are retained for manual recovery");
  storage.setItem(remainingKey, retainedRecord);
  const denied = createCollaborationDraftStore({ ...storage, setItem() { throw new Error("quota"); } });
  assert.equal(denied.save(base).value, false); assert.match(denied.save(base).error, /could not be stored/);
});

test("supervisor authenticates in first frame, shares scope socket and never replays an unconfirmed mutation", async () => {
  const previous = globalThis.WebSocket, sockets = [], frames = [];
  class Socket {
    static CONNECTING = 0; static OPEN = 1; readyState = 0; bufferedAmount = 0;
    constructor(url) { this.url = url; sockets.push(this); queueMicrotask(() => { this.readyState = 1; this.onopen?.(); }); }
    send(raw) { const frame = JSON.parse(raw); frames.push(frame); if (frame.method === "hello") queueMicrotask(() => this.onmessage?.({ data: JSON.stringify({ id: frame.id, ok: true, result: { protocol: 2, principal: { id: "p", role: "writer" } } }) })); }
    close(code = 1000) { this.readyState = 3; this.onclose?.({ code }); }
  }
  globalThis.WebSocket = Socket;
  let first, second;
  try {
    const ready = [];
    first = createCollaborationClient({ url: "ws://localhost/ws", token: "private-key", scope: "same", connectionContext: () => ({ tabId: "t", generation: 2 }), onState(state) { ready.push(state); } });
    second = createCollaborationClient({ url: "ws://localhost/ws", token: "private-key", scope: "same", connectionContext: () => ({ tabId: "t", generation: 2 }) });
    first.connect(); second.connect();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(sockets.length, 1); assert.equal(sockets[0].url, "ws://localhost/ws");
    assert.equal(frames[0].method, "hello"); assert.equal(frames[0].params.token, "private-key"); assert.equal(frames[0].params.generation, 2);
    assert.ok(ready.includes("ready"));
    const edit = first.request("edit", { insert: "retained" });
    sockets[0].close(1008);
    await assert.rejects(edit, (error) => error.code === "unconfirmed");
    assert.equal(first.state, "blocked");
    first.connect(); await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(sockets.length, 1); assert.equal(frames.filter((frame) => frame.method === "edit").length, 1);
  } finally { first?.dispose(); second?.dispose(); globalThis.WebSocket = previous; }
});


test("a root identity change blocks reconnect before any document can hydrate", async () => {
  const previous = globalThis.WebSocket;
  class Socket {
    static CONNECTING = 0; static OPEN = 1; readyState = 0; bufferedAmount = 0;
    constructor() { queueMicrotask(() => { this.readyState = 1; this.onopen?.(); }); }
    send(raw) { const frame = JSON.parse(raw); assert.equal(frame.method, "hello"); assert.equal(frame.params.expectedBrainId, "expected"); queueMicrotask(() => this.onmessage?.({ data: JSON.stringify({ id: frame.id, ok: true, result: { protocol: 2, brainId: "other", principal: { id: "p", role: "writer" } } }) })); }
    close() { this.readyState = 3; this.onclose?.({ code: 1000 }); }
  }
  globalThis.WebSocket = Socket;
  let client;
  try {
    const states = [];
    client = createCollaborationClient({ url: "ws://localhost/ws", token: "key", scope: "root-isolation", expectedBrainId: "expected", onState(state, _principal, error) { states.push({ state, code: error?.code }); }, onSnapshot() { assert.fail("a different root must not hydrate"); } });
    client.connect(); await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(client.state, "blocked"); assert.ok(states.some((state) => state.code === "root_changed"));
    await assert.rejects(client.request("open", { documentId: "id" }));
  } finally { client?.dispose(); globalThis.WebSocket = previous; }
});


test("page actor identities are cached by brain without trusting cloned session storage", () => {
  const previous = globalThis.sessionStorage;
  globalThis.sessionStorage = { getItem() { return "copied-from-other-tab"; }, setItem() { assert.fail("page identities must not persist to cloneable session storage"); } };
  try { const first = collaborationClientId("page-identity-a"); assert.notEqual(first, "copied-from-other-tab"); assert.equal(collaborationClientId("page-identity-a"), first); assert.notEqual(collaborationClientId("page-identity-b"), first); }
  finally { globalThis.sessionStorage = previous; }
});


test("a rejected oversized read-only open is explicit and never invents an unpublished draft", async () => {
  const previous = globalThis.WebSocket;
  class Socket {
    static CONNECTING = 0; static OPEN = 1; readyState = 0; bufferedAmount = 0;
    constructor() { queueMicrotask(() => { this.readyState = 1; this.onopen?.(); }); }
    send(raw) { const frame = JSON.parse(raw), result = frame.method === "hello" ? { id: frame.id, ok: true, result: { protocol: 2, principal: { id: "reader", role: "reader" } } } : { id: frame.id, ok: false, error: { code: "document_limit", message: "This note exceeds the live editing limit. Its canonical source is unchanged." } }; queueMicrotask(() => this.onmessage?.({ data: JSON.stringify(result) })); }
    close() { this.readyState = 3; this.onclose?.({ code: 1000 }); }
  }
  globalThis.WebSocket = Socket;
  let editor;
  try {
    let body = "Previously read canonical source";
    editor = createCollaborationEditor({ url: "ws://localhost/ws", scope: "oversized-view", documentId: "note", clientId: "viewer", drafts: createCollaborationDraftStore(memoryStorage()), editor: { getMarkdown: () => body, applyCollaborativeMarkdown(next) { body = next; return { status: "applied" }; } } });
    assert.equal(editor.state.dirty, false); assert.equal(await editor.flush(), true, "clean initial canonical source does not prevent leaving");
    editor.connect(); await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(editor.state.status, "blocked"); assert.match(editor.state.message, /exceeds/); assert.equal(editor.state.dirty, false); assert.equal(editor.body, body); assert.equal(await editor.flush(), true);
  } finally { editor?.dispose(); globalThis.WebSocket = previous; }
});

test("clean offline navigation succeeds while a real offline draft stays unpublished", async () => {
  const previous = globalThis.WebSocket, sockets = [];
  class Socket {
    static CONNECTING = 0; static OPEN = 1; readyState = 0; bufferedAmount = 0;
    constructor() { sockets.push(this); queueMicrotask(() => { this.readyState = 1; this.onopen?.(); }); }
    send(raw) { const frame = JSON.parse(raw), result = frame.method === "hello" ? { protocol: 2, principal: { id: "writer", role: "writer" } } : { documentId: "note", epoch: "epoch", revision: 0, prefix: "", file: "notes/note.md", body: "Canonical body", title: "Note", contentHash: "hash", saved: true }; queueMicrotask(() => this.onmessage?.({ data: JSON.stringify({ id: frame.id, ok: true, result }) })); }
    close(code = 1000) { this.readyState = 3; this.onclose?.({ code }); }
  }
  globalThis.WebSocket = Socket;
  let editor;
  try {
    let body = "Canonical body";
    editor = createCollaborationEditor({ url: "ws://localhost/ws", scope: "offline-navigation", documentId: "note", clientId: "writer", drafts: createCollaborationDraftStore(memoryStorage()), editor: { getMarkdown: () => body, applyCollaborativeMarkdown(next) { body = next; return { status: "applied" }; } } });
    editor.connect(); await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(editor.state.status, "saved"); sockets[0].close(1012);
    assert.equal(editor.state.status, "offline"); assert.equal(await editor.flush(), true, "a saved document can be left while the backend is offline");
    editor.input("Canonical body plus unpublished draft");
    assert.equal(editor.state.dirty, true); assert.equal(editor.state.durableDraft, true); assert.equal(await editor.flush(), false, "an actual offline draft still blocks publication and navigation");
  } finally { editor?.dispose(); globalThis.WebSocket = previous; }
});
