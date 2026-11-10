import assert from "node:assert/strict";
import test from "node:test";
import { createCollaborationEditor } from "../dist/adapters/http-server/collaboration-editor.js";
import {sourceDifference,applySourceSplices,rebaseSourcePair} from "../dist/core/collaboration/source.js";
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
test("explicit positional transactions keep disjoint edits and insertion ties and merge actual overlap", () => {
  const merge=(base,local,remote)=>applySourceSplices(applySourceSplices(base,remote),rebaseSourcePair(base,local,remote).local);
  assert.equal(merge("one two",[{start:0,deleteCount:3,insert:"ONE"}],[{start:4,deleteCount:3,insert:"TWO"}]),"ONE TWO");
  assert.equal(merge("ab",[{start:1,deleteCount:0,insert:"LOCAL"}],[{start:1,deleteCount:0,insert:"REMOTE"}]),"aLOCALREMOTEb","the later local publication precedes an equal-gap canonical insertion");
  assert.equal(merge("ab",[{start:1,deleteCount:0,insert:"XX"}],[{start:1,deleteCount:0,insert:"XX"}]),"aXXXXb","identical intentional inserts by different writers both survive");
  assert.equal(merge("alpha\nmiddle\nomega\n",[{start:0,deleteCount:5,insert:"ALPHA"},{start:13,deleteCount:5,insert:"OMEGA"}],[{start:6,deleteCount:6,insert:"MIDDLE"}]),"ALPHA\nMIDDLE\nOMEGA\n","first and last source ranges never claim the unchanged middle");
  assert.equal(merge("text",[{start:0,deleteCount:4,insert:"draft"}],[{start:0,deleteCount:4,insert:"saved"}]),"draftsaved","overlapping replacements remove the shared source once and keep both insertions");
  assert.equal(merge("one two three",[{start:4,deleteCount:0,insert:"X"}],[{start:0,deleteCount:13,insert:"new"}]),"Xnew","typing inside a range another writer replaced survives before the replacement");
  assert.equal(merge("foo",[{start:3,deleteCount:0,insert:"X"}],[{start:0,deleteCount:3,insert:"bar"}]),"barX","text typed after a replaced range stays after the replacement");
  assert.equal(merge("foo",[{start:0,deleteCount:0,insert:"X"}],[{start:0,deleteCount:3,insert:"bar"}]),"Xbar","text typed before a replaced range stays before the replacement");
  assert.equal(merge("abcdef",[{start:1,deleteCount:4,insert:""}],[{start:3,deleteCount:0,insert:"PEER"}]),"aPEERf","a deletion never consumes another writer's insertion");
  assert.equal(merge("abcdef",[{start:2,deleteCount:3,insert:""}],[{start:0,deleteCount:4,insert:""}]),"f","source removed by both writers is removed once");
});
function inputIntent(editor, value, operations) {editor.input(value,{before:editor.body,after:value,operations})}
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
    inputIntent(editor,"Canonical body plus unpublished draft",[{start:editor.body.length,deleteCount:0,insert:" plus unpublished draft"}]);
    assert.equal(editor.state.dirty, true); assert.equal(editor.state.durableDraft, true); assert.equal(await editor.flush(), false, "an actual offline draft still blocks publication and navigation");
  } finally { editor?.dispose(); globalThis.WebSocket = previous; }
});


test("blank rename drafts stay editable and durable without publishing or blocking body saves", async () => {
  const previous = globalThis.WebSocket, frames = [];
  let canonicalTitle = "Existing title", canonicalBody = "Canonical body", revision = 0;
  const snapshot = () => ({ documentId: "note", epoch: "epoch", revision, prefix: "", file: "notes/note.md", body: canonicalBody, title: canonicalTitle, contentHash: "hash-" + revision, saved: true });
  class Socket {
    static CONNECTING = 0; static OPEN = 1; readyState = 0; bufferedAmount = 0;
    constructor() { queueMicrotask(() => { this.readyState = 1; this.onopen?.(); }); }
    send(raw) {
      const frame = JSON.parse(raw); frames.push(frame);
      queueMicrotask(() => {
        if (frame.method === "title" && !frame.params.title.trim()) {
          this.onmessage?.({ data: JSON.stringify({ id: frame.id, ok: false, error: { code: "invalid_title", message: "A title is required." } }) }); return;
        }
        let operation;
        if (frame.method === "title" || frame.method === "edit") {
          const splices = frame.method === "edit" ? frame.params.operations : [];
          canonicalBody = applySourceSplices(canonicalBody, splices);
          if (frame.method === "title") canonicalTitle = frame.params.title.trim();
          revision++; operation = { revision, actor: JSON.stringify(["writer", "writer"]), operationId: frame.params.operationId ?? "title-" + revision, splices };
        }
        this.onmessage?.({ data: JSON.stringify({ id: frame.id, ok: true, result: frame.method === "hello" ? { protocol: 2, principal: { id: "writer", role: "writer" } } : { ...snapshot(), ...(operation ? { operation } : {}) } }) });
      });
    }
    close() { this.readyState = 3; this.onclose?.({ code: 1000 }); }
  }
  globalThis.WebSocket = Socket;
  const drafts = createCollaborationDraftStore(memoryStorage()), scope = { scope: "blank-rename", principalId: "writer", documentId: "note", clientId: "writer" };
  let editor, body = canonicalBody;
  const create = () => createCollaborationEditor({ url: "ws://localhost/ws", ...scope, drafts, editor: { getMarkdown: () => body, applyCollaborativeMarkdown(next) { body = next; return { status: "applied" }; } } });
  try {
    editor = create(); editor.connect(); await new Promise(resolve => setTimeout(resolve, 0));
    for (const title of ["", "   "]) {
      editor.inputTitle(title);
      await new Promise(resolve => setTimeout(resolve, 100)); // Exceed the real autosave delay.
      assert.notEqual(editor.state.status, "conflict"); assert.equal(editor.state.canWrite, true);
      assert.equal(await editor.flush(), false, "a blank pending rename cannot pass the navigation barrier");
      assert.equal(editor.title, title); assert.equal(editor.state.dirty, true); assert.equal(editor.state.durableDraft, true);
      assert.equal(drafts.read(scope).value.title, title); assert.equal(editor.snapshot.title, "Existing title");
      assert.equal(frames.filter(frame => frame.method === "title").length, 0, "blank titles never reach the backend");
    }
    inputIntent(editor, "Canonical body plus edit", [{ start: canonicalBody.length, deleteCount: 0, insert: " plus edit" }]);
    assert.equal(await editor.flush(), false, "the title draft still guards navigation after the body saves");
    assert.equal(canonicalBody, "Canonical body plus edit"); assert.equal(editor.snapshot.body, canonicalBody);
    assert.equal(editor.state.canWrite, true); assert.equal(editor.title, "   ");
    editor.dispose(); editor = create(); editor.connect(); await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(editor.title, "   ", "reopening retains the private blank rename"); assert.equal(editor.state.canWrite, true);
    editor.inputTitle("  Replacement title  "); assert.equal(await editor.flush(), true);
    // Surrounding whitespace still in the field is not a pending change and
    // is never replaced mid-typing; the saved title is trimmed.
    assert.equal(editor.title, "  Replacement title  "); assert.equal(editor.snapshot.title, "Replacement title"); assert.equal(editor.state.status, "saved"); assert.equal(editor.state.dirty, false);
    assert.equal(drafts.read(scope).value, null); assert.equal(canonicalBody, "Canonical body plus edit");
    editor.inputTitle(""); assert.equal(await editor.flush(), false);
    editor.inputTitle("Replacement title"); assert.equal(await editor.flush(), true, "restoring the saved title cancels the draft");
  } finally { editor?.dispose(); globalThis.WebSocket = previous; }
});

test("canonical title normalization preserves later local typing and real foreign conflicts", async () => {
  const previous = globalThis.WebSocket, sockets = [], heldTitles = [];
  let canonicalTitle = "Existing title", revision = 0;
  const snapshot = () => ({ documentId: "note", epoch: "epoch", revision, prefix: "", file: "notes/note.md", body: "Canonical body", title: canonicalTitle, contentHash: "hash-" + revision, saved: true,operation:{revision,start:0,deleteCount:0,splices:[]} });
  const receive = (socket, message) => socket.onmessage?.({ data: JSON.stringify(message) });
  const publish = (socket, title) => { canonicalTitle = title; revision++; receive(socket, { event: "document", documentId: "note", snapshot: snapshot() }); };
  class Socket {
    static CONNECTING = 0; static OPEN = 1; readyState = 0; bufferedAmount = 0;
    constructor() { sockets.push(this); queueMicrotask(() => { this.readyState = 1; this.onopen?.(); }); }
    send(raw) {
      const frame = JSON.parse(raw);
      if (frame.method === "title" && frame.params.title !== "Later local title") { heldTitles.push(frame); return; }
      queueMicrotask(() => {
        if (frame.method === "title") publish(this, frame.params.title.trim());
        receive(this, { id: frame.id, ok: true, result: frame.method === "hello" ? { protocol: 2, principal: { id: "writer", role: "writer" } } : snapshot() });
      });
    }
    close() { this.readyState = 3; this.onclose?.({ code: 1000 }); }
  }
  globalThis.WebSocket = Socket;
  let editor;
  try {
    let body = "Canonical body";
    editor = createCollaborationEditor({ url: "ws://localhost/ws", scope: "title-normalization", documentId: "note", clientId: "writer", drafts: createCollaborationDraftStore(memoryStorage()), editor: { getMarkdown: () => body, applyCollaborativeMarkdown(next) { body = next; return { status: "applied" }; } } });
    editor.connect(); await new Promise((resolve) => setTimeout(resolve, 0));
    editor.inputTitle("  First submitted title  "); const firstFlush = editor.flush();
    assert.equal(heldTitles.length, 1);
    editor.inputTitle("Later local title");
    publish(sockets[0], "First submitted title");await new Promise(resolve=>setTimeout(resolve,0));
    assert.notEqual(editor.state.status, "conflict", "our normalized acknowledgement is not a foreign title conflict");
    assert.equal(editor.title, "Later local title", "an acknowledgement must not replace later local typing");
    receive(sockets[0], { id: heldTitles[0].id, ok: true, result: snapshot() });
    assert.equal(await firstFlush, true); assert.equal(editor.snapshot.title, "Later local title");
    editor.inputTitle("  Submitted before clearing  "); const clearingFlush = editor.flush();
    assert.equal(heldTitles.length, 2); editor.inputTitle("");
    publish(sockets[0], "Submitted before clearing"); await new Promise(resolve => setTimeout(resolve, 0));
    receive(sockets[0], { id: heldTitles[1].id, ok: true, result: snapshot() });
    assert.equal(await clearingFlush, false); assert.equal(editor.title, "", "an older title receipt cannot overwrite a later blank draft");
    assert.equal(editor.state.canWrite, true); assert.notEqual(editor.state.status, "conflict");
    editor.inputTitle("Later local title"); assert.equal(await editor.flush(), true);
    editor.inputTitle("  My pending title  "); const conflictingFlush = editor.flush();
    assert.equal(heldTitles.length, 3);
    publish(sockets[0], "A different writer's title");await new Promise(resolve=>setTimeout(resolve,0));
    // Another writer's rename no longer forces review: the pending local
    // name stays visible and is published next (last writer wins).
    assert.notEqual(editor.state.status, "conflict"); assert.equal(editor.title, "  My pending title  ");
    receive(sockets[0], { id: heldTitles[2].id, ok: false, error: { code: "title_conflict", message: "Another writer changed the title." } });
    assert.equal(await conflictingFlush, false); assert.equal(editor.snapshot.title, "A different writer's title");
    assert.equal(editor.state.durableDraft, true); assert.equal(body, "Canonical body");
  } finally { editor?.dispose(); globalThis.WebSocket = previous; }
});


test("older draft adoption preserves unique body/title/uncertainty and fails closed on storage failure", async () => {
  const previous = globalThis.WebSocket, sockets = [];
  class Socket {
    static CONNECTING = 0; static OPEN = 1; readyState = 0; bufferedAmount = 0;
    constructor() { sockets.push(this); queueMicrotask(() => { this.readyState = 1; this.onopen?.(); }); }
    send(raw) { const frame = JSON.parse(raw); if (frame.method === "edit") return; queueMicrotask(() => this.onmessage?.({ data: JSON.stringify({ id: frame.id, ok: true, result: frame.method === "hello" ? { protocol: 2, principal: { id: "writer", role: "writer" } } : { documentId: "note", epoch: "epoch", revision: 0, prefix: "", file: "notes/note.md", body: "Canonical body", title: "Canonical title", contentHash: "hash", saved: true } }) })); }
    close(code = 1000) { this.readyState = 3; this.onclose?.({ code }); }
  }
  const storage = memoryStorage(), originalSet = storage.setItem.bind(storage); let denyWrites = false, denyLiveWrites = false;
  storage.setItem = (key, value) => { if (denyWrites || denyLiveWrites && JSON.parse(value).clientId === "live") throw new Error("quota"); originalSet(key, value); };
  const drafts = createCollaborationDraftStore(storage), scope = { scope: "version-preservation", principalId: "writer", documentId: "note", clientId: "live" };
  const older = { version: 2, ...scope, clientId: "older", epoch: "epoch", baseRevision: 0, baseBody: "Canonical body", baseTitle: "Canonical title", body: "Older unique B body", title: "Older B title", updatedAt: 1, unconfirmed: { operationId: "original-B-operation", submittedBody: "Submitted B source" } };
  drafts.save(older); globalThis.WebSocket = Socket; let editor;
  try {
    let body = "Canonical body";
    editor = createCollaborationEditor({ url: "ws://localhost/ws", ...scope, drafts, editor: { getMarkdown: () => body, applyCollaborativeMarkdown(next) { body = next; return { status: "applied" }; } } });
    editor.connect(); await new Promise((resolve) => setTimeout(resolve, 0));
    body = "Unique current A body"; inputIntent(editor,body,[{start:0,deleteCount:editor.body.length,insert:body}]); editor.inputTitle("Unique current A title");
    const pending = editor.flush(); sockets[0].close(1012); assert.equal(await pending, false);
    const originalA = drafts.read(scope).value; assert.ok(originalA.unconfirmed);
    denyWrites = true;
    assert.equal(editor.recoverDraft(older), false, "archive failure must not adopt another version");
    assert.equal(editor.body, originalA.body); assert.equal(editor.title, originalA.title); assert.equal(body, originalA.body);
    assert.deepEqual(drafts.read(scope).value, originalA); assert.equal(editor.state.durableDraft, false); assert.match(editor.state.message, /could not be stored/);
    denyWrites = false;
    assert.equal(editor.recoverDraft(older), true);
    const archivedA = editor.state.recoveryDrafts.find((record) => record.body === originalA.body);
    assert.ok(archivedA, "the previous unique version remains selectable");
    assert.notEqual(archivedA.clientId, originalA.clientId); assert.equal(archivedA.archivedFromClientId, originalA.clientId);
    const { clientId: _archived, archivedFromClientId: _origin, ...archivedPayload } = archivedA;
    const { clientId: _original, ...originalPayload } = originalA;
    assert.deepEqual(archivedPayload, originalPayload, "the archived version retains exact title, source, base and uncertainty receipt");
    assert.equal(editor.body, older.body); assert.equal(editor.title, older.title); assert.deepEqual(drafts.read(scope).value.unconfirmed, older.unconfirmed);
    denyLiveWrites = true;
    assert.equal(editor.recoverDraft(archivedA), false, "replacement storage failure also leaves the active version intact");
    assert.equal(editor.body, older.body); assert.equal(editor.title, older.title); assert.equal(body, older.body);
    assert.deepEqual(drafts.read(scope).value.unconfirmed, older.unconfirmed);
    assert.ok(drafts.list(scope).value.some((record) => record.body === older.body && record.clientId.startsWith("archive:")), "another live tab record cannot substitute for an immutable preserved version");
    drafts.save({ ...older, body: "Changed by the older live tab" });
    denyLiveWrites = false;
    assert.equal(editor.recoverDraft(archivedA), true); assert.equal(editor.body, originalA.body); assert.equal(editor.title, originalA.title);
    assert.deepEqual(drafts.read(scope).value.unconfirmed, originalA.unconfirmed);
    assert.ok(drafts.list(scope).value.some((record) => record.body === older.body), "adoption never removes the older unique version");
  } finally { editor?.dispose(); globalThis.WebSocket = previous; }
});

test("presence receipts confirm an in-flight batch without duplicating intent and retain dirty peer coordinates", async () => {
  const previous = globalThis.WebSocket, frames = [], snapshots = [];
  let canonical = "alpha\nmiddle\nomega\n", revision = 0, heldOperation;
  const snapshot = () => ({ documentId:"note",epoch:"epoch",revision,prefix:"",body:canonical,title:"Title",contentHash:"hash-"+revision,saved:true,operation:heldOperation,presence:[{actor:'["peer","other"]',principalId:"peer",clientId:"other",name:"Peer",kind:"human",epoch:"epoch",revision,anchor:6,focus:6}] });
  class Socket {
    static CONNECTING=0;static OPEN=1;readyState=0;bufferedAmount=0;
    constructor(){queueMicrotask(()=>{this.readyState=1;this.onopen?.()})}
    send(raw){
      const frame=JSON.parse(raw);frames.push(frame);
      const respond=result=>queueMicrotask(()=>this.onmessage?.({data:JSON.stringify({id:frame.id,ok:true,result})}));
      if(frame.method==='hello'){respond({protocol:2,principal:{id:"writer",role:"writer"}});return}
      if(frame.method==='edit'){
        assert.ok(Array.isArray(frame.params.operations));
        for(const operation of [...frame.params.operations].reverse())canonical=canonical.slice(0,operation.start)+operation.insert+canonical.slice(operation.start+operation.deleteCount);
        revision++;heldOperation={operationId:frame.params.operationId,actor:'["writer","writer"]',revision,start:frame.params.operations[0]?.start??0,deleteCount:frame.params.operations[0]?.deleteCount??0,splices:frame.params.operations};
        if(revision===1)return; // Saved source will arrive through presence RPC.
      }
      respond(snapshot());
    }
    close(){this.readyState=3;this.onclose?.({code:1000})}
  }
  globalThis.WebSocket=Socket;let editor;
  try{
    let body=canonical;
    editor=createCollaborationEditor({url:"ws://localhost/ws",scope:"presence-confirmation",documentId:"note",clientId:"writer",drafts:createCollaborationDraftStore(memoryStorage()),editor:{getMarkdown:()=>body,collaborativeSelection:()=>({anchor:body.indexOf('middle')+2,focus:body.indexOf('middle')+2}),setCollaborativePresence:peers=>snapshots.push(peers),applyCollaborativeMarkdown(value){body=value;return {status:"applied"}}}});
    editor.connect();await new Promise(resolve=>setTimeout(resolve,0));
    body += " local";inputIntent(editor,body,[{start:editor.body.length,deleteCount:0,insert:" local"}]);const publication=editor.flush();
    body=body.replace('alpha','PREFIX ALPHA').replace('omega','OMEGA');inputIntent(editor,body,[{start:0,deleteCount:5,insert:'PREFIX ALPHA'},{start:editor.body.indexOf('omega'),deleteCount:5,insert:'OMEGA'}]);
    assert.ok(snapshots.at(-1).some(peer=>peer.actor==='["peer","other"]'&&peer.anchor===13),'peer presence is not hidden merely because local edits are pending');
    assert.equal(await publication,true);
    assert.equal(body,"PREFIX ALPHA\nmiddle\nOMEGA\n local");assert.equal(editor.snapshot.body,body);
    const presence=frames.find(frame=>frame.method==='presence');assert.ok(presence);assert.equal(presence.params.epoch,'epoch');assert.equal(presence.params.baseRevision,0);assert.ok(presence.params.presenceSequence>0);
    assert.ok(frames.some(frame=>frame.method==='edit'&&frame.params.operations.length>=2));
    assert.equal(editor.state.status,'saved');
  }finally{editor?.dispose();globalThis.WebSocket=previous}
});

test("reviewed retained restores guard body and title receipts and never relabel a foreign intervening save", async () => {
  const previous=globalThis.WebSocket;
  try{
    for(const mode of ['body-and-title','title-only','foreign-after-body','large-reviewed-body']){
      let canonical=mode==='large-reviewed-body'?'a'.repeat(3000):'Current saved body',title='Current title',revision=0;
      const frames=[],retained={body:mode==='title-only'?canonical:mode==='large-reviewed-body'?'b'.repeat(3000):'Retained body',title:'Retained title'};
      const snapshot=operation=>({documentId:'note',epoch:'epoch',revision,body:canonical,title,contentHash:'hash-'+revision,saved:true,operation});
      class Socket{
        static CONNECTING=0;static OPEN=1;readyState=0;bufferedAmount=0;
        constructor(){queueMicrotask(()=>{this.readyState=1;this.onopen?.()})}
        send(raw){const frame=JSON.parse(raw);frames.push(frame);const emit=value=>this.onmessage?.({data:JSON.stringify(value)});
          queueMicrotask(()=>{
            if(frame.method==='hello'){emit({id:frame.id,ok:true,result:{protocol:2,principal:{id:'writer',role:'writer'}}});return}
            if(['edit','title'].includes(frame.method)){
              assert.equal(frame.params.expectedContentHash,'hash-'+revision,mode+' sends the reviewed hash at every mutation');assert.equal(frame.params.baseRevision,revision);
              if(frame.method==='edit')for(const operation of [...frame.params.operations].reverse())canonical=canonical.slice(0,operation.start)+operation.insert+canonical.slice(operation.start+operation.deleteCount);
              else title=frame.params.title;
              revision++;const committed=snapshot({operationId:frame.params.operationId,actor:'["writer","writer"]',revision,start:0,deleteCount:0,splices:frame.method==='edit'?frame.params.operations:[]});
              emit({event:'document',documentId:'note',snapshot:committed});
              if(mode==='foreign-after-body'&&frame.method==='edit'){canonical='Foreign prefix '+canonical;revision++;emit({event:'document',documentId:'note',snapshot:snapshot({operationId:'foreign-operation',revision,start:0,deleteCount:0,splices:[{start:0,deleteCount:0,insert:'Foreign prefix '}]})})}
              emit({id:frame.id,ok:true,result:committed});return;
            }
            emit({id:frame.id,ok:true,result:snapshot()});
          });
        }
        close(){this.readyState=3;this.onclose?.({code:1000})}
      }
      globalThis.WebSocket=Socket;let editor;
      try{
        let body=canonical;
        editor=createCollaborationEditor({url:'ws://localhost/ws',scope:'strict-restore-'+mode,documentId:'note',clientId:'writer',drafts:createCollaborationDraftStore(memoryStorage()),editor:{getMarkdown:()=>body,applyCollaborativeMarkdown(value){body=value;return {status:'applied'}}}});
        editor.connect();await new Promise(resolve=>setTimeout(resolve,0));
        const restored=await editor.restoreRetainedVersion(retained,'hash-0');
        if(mode==='foreign-after-body'){
          assert.equal(restored,false);assert.equal(title,'Current title','a foreign source receipt cannot authorize restoring metadata');assert.equal(frames.filter(frame=>frame.method==='title').length,0);assert.equal(editor.title,retained.title);assert.equal(editor.state.status,'conflict');assert.match(editor.state.message,/changed after review/);
        }else{
          assert.equal(restored,true,mode);assert.equal(canonical,retained.body);assert.equal(title,retained.title);assert.equal(body,retained.body);assert.equal(editor.state.status,'saved');
          const mutations=frames.filter(frame=>['edit','title'].includes(frame.method));
          assert.deepEqual(mutations.map(frame=>frame.method),mode==='title-only'?['title']:['edit','title']);
          if(mode==='large-reviewed-body')assert.deepEqual(mutations[0].params.operations,[{start:0,deleteCount:3000,insert:retained.body}],'only explicitly reviewed replacement may exceed the granular alignment budget');
        }
      }finally{editor?.dispose()}
    }
  }finally{globalThis.WebSocket=previous}
});

test("same-byte positional input is published once and its delivered receipt cannot replay at composition end",async()=>{
  const previous=globalThis.WebSocket,frames=[];let revision=0,last,compositionEnd;
  const snapshot=operation=>({documentId:'note',epoch:'epoch',revision,body:'aaaa',title:'Title',contentHash:'hash-'+revision,saved:true,operation});
  class Socket{static CONNECTING=0;static OPEN=1;readyState=0;bufferedAmount=0;constructor(){queueMicrotask(()=>{this.readyState=1;this.onopen?.()})}send(raw){const frame=JSON.parse(raw);frames.push(frame);queueMicrotask(()=>{const result=frame.method==='hello'?{protocol:2,principal:{id:'writer',role:'writer'}}:frame.method==='edit'?(revision++,snapshot({actor:'["writer","tab"]',operationId:frame.params.operationId,revision,start:0,deleteCount:1,splices:frame.params.operations})):snapshot();this.onmessage?.({data:JSON.stringify({id:frame.id,ok:true,result})})})}close(){this.readyState=3;this.onclose?.({code:1000})}}
  globalThis.WebSocket=Socket;let editor;
  try{
    editor=createCollaborationEditor({url:'ws://localhost/ws',scope:'same-byte-once',documentId:'note',clientId:'tab',drafts:createCollaborationDraftStore(memoryStorage()),editor:{getMarkdown:()=> 'aaaa',applyCollaborativeMarkdown(){return {status:'unchanged'}},takeCollaborativeIntent(){const receipt=last;last=undefined;return receipt??null},subscribeCompositionEnd(listener){compositionEnd=listener;return()=>{}}}});
    editor.connect();await new Promise(resolve=>setTimeout(resolve,0));
    last={before:'aaaa',after:'aaaa',operations:[{start:0,deleteCount:1,insert:'a'}]};editor.input('aaaa',last);
    assert.equal(last,undefined,'supplied metadata still consumes the single editor receipt');assert.equal(editor.state.dirty,true,'equal bytes do not erase a logical replacement');
    assert.equal(await editor.flush(),true);assert.equal(revision,1);compositionEnd();assert.equal(await editor.flush(),true);assert.equal(frames.filter(frame=>frame.method==='edit').length,1);
  }finally{editor?.dispose();globalThis.WebSocket=previous}
});

test("unproven input remains a durable private draft and never becomes a guessed mutation",async()=>{
  const previous=globalThis.WebSocket,frames=[], reasons=[];
  class Socket{static CONNECTING=0;static OPEN=1;readyState=0;bufferedAmount=0;constructor(){queueMicrotask(()=>{this.readyState=1;this.onopen?.()})}send(raw){const frame=JSON.parse(raw);frames.push(frame);queueMicrotask(()=>this.onmessage?.({data:JSON.stringify({id:frame.id,ok:true,result:frame.method==='hello'?{protocol:2,principal:{id:'writer',role:'writer'}}:{documentId:'note',epoch:'epoch',revision:0,body:'aaaa',title:'Title',contentHash:'hash',saved:true}})}))}close(){this.readyState=3;this.onclose?.({code:1000})}}
  globalThis.WebSocket=Socket;let editor;const drafts=createCollaborationDraftStore(memoryStorage());
  try{
    let body='aaaa';editor=createCollaborationEditor({url:'ws://localhost/ws',scope:'unproven',documentId:'note',clientId:'tab',drafts,onRecovery: code => reasons.push(code),editor:{getMarkdown:()=>body,applyCollaborativeMarkdown(value){body=value;return {status:'applied'}}}});editor.connect();await new Promise(resolve=>setTimeout(resolve,0));
    body='aaa';editor.input(body);assert.equal(editor.state.status,'conflict');assert.equal(await editor.flush(),false);assert.equal(editor.state.durableDraft,true);assert.equal(frames.filter(frame=>frame.method==='edit').length,0);assert.equal(drafts.read({scope:'unproven',principalId:'writer',documentId:'note',clientId:'tab'}).value.body,'aaa');assert.match(editor.state.message,/no verified positional edit range/);assert.deepEqual(reasons,['unproven_input']);
    assert.equal(await editor.resolveConflict('saved'),true);assert.equal(body,'aaaa');assert.equal(editor.state.status,'saved');
  }finally{editor?.dispose();globalThis.WebSocket=previous}
});

test("private Undo and Redo retain their actual ranges across a disjoint peer edit",async()=>{
  const previous=globalThis.WebSocket,frames=[];let socket,canonical='aa',revision=0;
  const snapshot=operation=>({documentId:'note',epoch:'epoch',revision,body:canonical,title:'Title',contentHash:'hash-'+revision,saved:true,operation});
  class Socket{static CONNECTING=0;static OPEN=1;readyState=0;bufferedAmount=0;constructor(){socket=this;queueMicrotask(()=>{this.readyState=1;this.onopen?.()})}send(raw){const frame=JSON.parse(raw);frames.push(frame);queueMicrotask(()=>{let operation;if(frame.method==='edit'){for(const op of [...frame.params.operations].reverse())canonical=canonical.slice(0,op.start)+op.insert+canonical.slice(op.start+op.deleteCount);revision++;operation={actor:'["writer","tab"]',operationId:frame.params.operationId,revision,start:0,deleteCount:0,splices:frame.params.operations}}this.onmessage?.({data:JSON.stringify({id:frame.id,ok:true,result:frame.method==='hello'?{protocol:2,principal:{id:'writer',role:'writer'}}:snapshot(operation)})})})}close(){this.readyState=3;this.onclose?.({code:1000})}}
  globalThis.WebSocket=Socket;let editor;
  try{
    let body='aa';editor=createCollaborationEditor({url:'ws://localhost/ws',scope:'private-history',documentId:'note',clientId:'tab',drafts:createCollaborationDraftStore(memoryStorage()),editor:{getMarkdown:()=>body,applyCollaborativeMarkdown(value){body=value;return {status:'applied'}}}});editor.connect();await new Promise(resolve=>setTimeout(resolve,0));
    body='aQa';inputIntent(editor,body,[{start:1,deleteCount:0,insert:'Q'}]);await editor.undo();assert.equal(body,'aa');assert.equal(frames.filter(frame=>frame.method==='edit').length,0,'the pending input was undone before publication');
    canonical='Xaa';revision++;socket.onmessage({data:JSON.stringify({event:'document',documentId:'note',snapshot:snapshot({actor:'peer',operationId:'peer-prefix',revision,start:0,deleteCount:0,splices:[{start:0,deleteCount:0,insert:'X'}]})})});await new Promise(resolve=>setTimeout(resolve,0));assert.equal(body,'Xaa');
    await editor.redo();assert.equal(body,'XaQa');assert.equal(await editor.flush(),true);assert.equal(canonical,'XaQa');assert.deepEqual(frames.find(frame=>frame.method==='edit').params.operations,[{start:2,deleteCount:0,insert:'Q'}]);assert.equal(frames.filter(frame=>frame.method==='redo').length,0,'a private Redo cannot accidentally target older server history');
  }finally{editor?.dispose();globalThis.WebSocket=previous}
});

test("clean changed-epoch reconnect adopts saved source with an explicit selection reset",async()=>{
  const previous=globalThis.WebSocket;
  try{
    for(const changed of[false,true]){
      let epoch='old-epoch',canonical='aaaa',socket;const frames=[],presentations=[];
      class Socket{static CONNECTING=0;static OPEN=1;readyState=0;bufferedAmount=0;constructor(){socket=this;queueMicrotask(()=>{this.readyState=1;this.onopen?.()})}send(raw){const frame=JSON.parse(raw);frames.push(frame);queueMicrotask(()=>this.onmessage?.({data:JSON.stringify({id:frame.id,ok:true,result:frame.method==='hello'?{protocol:2,principal:{id:'writer',role:'writer'}}:{documentId:'note',epoch,revision:0,body:canonical,title:'Title',contentHash:'hash-'+epoch,saved:true}})}))}close(code=1000){this.readyState=3;this.onclose?.({code})}}
      globalThis.WebSocket=Socket;let editor;
      try{
        let body='aaaa';editor=createCollaborationEditor({url:'ws://localhost/ws',scope:'epoch-source-'+changed,documentId:'note',clientId:'tab',drafts:createCollaborationDraftStore(memoryStorage()),editor:{getMarkdown:()=>body,collaborativeSelection:()=>({anchor:4,focus:4}),applyCollaborativeMarkdown(value,presentation){presentations.push(presentation);body=value;return {status:'applied'}}}});editor.connect();await new Promise(resolve=>setTimeout(resolve,0));assert.equal(editor.state.status,'saved');presentations.length=0;
        socket.close(1012);epoch='new-epoch';canonical=changed?'aaaaa':'aaaa';editor.connect();await new Promise(resolve=>setTimeout(resolve,0));
        assert.equal(editor.state.status,'saved');assert.equal(editor.snapshot.epoch,'new-epoch');assert.equal(body,canonical);assert.equal(await editor.flush(),true);
        assert.equal(Boolean(presentations.at(-1).resetSelection),changed,'unknown epoch history never projects an old caret through an invented replacement');
        assert.equal(frames.filter(frame=>['edit','title','resync'].includes(frame.method)).length,0,'clean adoption is observational');
      }finally{editor?.dispose()}
    }
  }finally{globalThis.WebSocket=previous}
});

test("readers can load a healthy saved version without a privileged resync, while unsafe source keeps their draft",async()=>{
  const previous=globalThis.WebSocket;
  try{
    for(const unsafe of[false,true]){
      const frames=[];let recovery=false;
      const snapshot=()=>({documentId:'note',epoch:'epoch',revision:0,body:'Canonical body',title:'Title',contentHash:'hash',saved:!(recovery&&unsafe),...(recovery&&unsafe?{conflict:{message:'Unsafe external source'}}:{})});
      class Socket{static CONNECTING=0;static OPEN=1;readyState=0;bufferedAmount=0;constructor(){queueMicrotask(()=>{this.readyState=1;this.onopen?.()})}send(raw){const frame=JSON.parse(raw);frames.push(frame);queueMicrotask(()=>this.onmessage?.({data:JSON.stringify({id:frame.id,ok:true,result:frame.method==='hello'?{protocol:2,principal:{id:'reader',role:'reader'}}:snapshot()})}))}close(){this.readyState=3;this.onclose?.({code:1000})}}
      globalThis.WebSocket=Socket;let editor;
      try{
        let body='';const scope='reader-recovery-'+unsafe;
        editor=createCollaborationEditor({url:'ws://localhost/ws',scope,documentId:'note',clientId:'reader-tab',drafts:createCollaborationDraftStore(memoryStorage()),editor:{getMarkdown:()=>body,applyCollaborativeMarkdown(value){body=value;return {status:'applied'}}}});editor.connect();await new Promise(resolve=>setTimeout(resolve,0));assert.equal(editor.state.status,'readonly');
        assert.equal(editor.recoverDraft({version:2,scope,principalId:'reader',documentId:'note',clientId:'older-tab',epoch:'epoch',baseRevision:0,baseBody:'Canonical body',body:'Private recovered draft',updatedAt:1}),true);assert.equal(body,'Private recovered draft');recovery=true;
        assert.equal(await editor.resolveConflict('saved'),!unsafe);
        if(unsafe){assert.equal(body,'Private recovered draft');assert.equal(editor.state.status,'conflict');assert.match(editor.state.message,/writer must resolve/);assert.equal(editor.state.durableDraft,true)}
        else{assert.equal(body,'Canonical body');assert.equal(editor.state.status,'readonly')}
        assert.equal(frames.filter(frame=>['resync','edit','title','undo','redo'].includes(frame.method)).length,0,'read-only recovery makes no privileged or canonical mutation request');
        assert.ok(frames.filter(frame=>frame.method==='open').length>=2,'the reader explicitly rereads the current saved version');
      }finally{editor?.dispose()}
    }
  }finally{globalThis.WebSocket=previous}
});

test("expired Undo/Redo shows a nonblocking notice; an unconfirmed history action still preserves recovery",async()=>{
  const previous=globalThis.WebSocket;
  try{
    for(const code of['history_expired','unconfirmed']){
      let canonical='body',revision=0;const frames=[],drafts=createCollaborationDraftStore(memoryStorage());
      const snapshot=operation=>({documentId:'note',epoch:'epoch',revision,body:canonical,title:'Title',contentHash:'hash-'+revision,saved:true,operation});
      class Socket{static CONNECTING=0;static OPEN=1;readyState=0;bufferedAmount=0;constructor(){queueMicrotask(()=>{this.readyState=1;this.onopen?.()})}send(raw){const frame=JSON.parse(raw);frames.push(frame);queueMicrotask(()=>{
        if(['undo','redo'].includes(frame.method)){this.onmessage?.({data:JSON.stringify({id:frame.id,ok:false,error:{code,message:'History action rejected'}})});return}
        let operation;if(frame.method==='edit'){for(const op of [...frame.params.operations].reverse())canonical=canonical.slice(0,op.start)+op.insert+canonical.slice(op.start+op.deleteCount);revision++;operation={actor:'["writer","tab"]',operationId:frame.params.operationId,revision,start:4,deleteCount:0,splices:frame.params.operations}}
        this.onmessage?.({data:JSON.stringify({id:frame.id,ok:true,result:frame.method==='hello'?{protocol:2,principal:{id:'writer',role:'writer'}}:snapshot(operation)})});
      })}close(){this.readyState=3;this.onclose?.({code:1000})}}
      globalThis.WebSocket=Socket;let editor;
      try{
        let body='body';const scope='history-notice-'+code;editor=createCollaborationEditor({url:'ws://localhost/ws',scope,documentId:'note',clientId:'tab',drafts,editor:{getMarkdown:()=>body,applyCollaborativeMarkdown(value){body=value;return {status:'applied'}}}});editor.connect();await new Promise(resolve=>setTimeout(resolve,0));
        await editor.undo();assert.equal(canonical,'body');assert.equal(body,'body');
        if(code==='history_expired'){
          assert.equal(editor.state.status,'saved');assert.equal(editor.state.dirty,false);assert.equal(editor.state.canWrite,true);assert.match(editor.state.historyNotice.text,/Undo history is unavailable/);const sequence=editor.state.historyNotice.sequence;
          await editor.redo();assert.equal(editor.state.status,'saved');assert.match(editor.state.historyNotice.text,/Redo history is unavailable/);assert.ok(editor.state.historyNotice.sequence>sequence);
          body='bodyQ';inputIntent(editor,body,[{start:4,deleteCount:0,insert:'Q'}]);assert.equal(await editor.flush(),true);assert.equal(canonical,'bodyQ');assert.equal(editor.state.status,'saved');assert.equal(frames.filter(frame=>frame.method==='edit').length,1);
        }else{
          assert.equal(editor.state.status,'conflict');assert.equal(await editor.flush(),false);assert.equal(editor.state.historyNotice,undefined);assert.equal(frames.filter(frame=>frame.method==='edit').length,0);assert.ok(drafts.read({scope,principalId:'writer',documentId:'note',clientId:'tab'}).value.unconfirmed,'unknown history outcome is still retained before any further publication');
        }
      }finally{editor?.dispose()}
    }
  }finally{globalThis.WebSocket=previous}
});

test("initial live hydration is quiet while later external changes still notify", async () => {
  const previous = globalThis.WebSocket, sockets = [];
  let canonical = { documentId: "note", epoch: "epoch", revision: 0, prefix: "", file: "notes/note.md", body: "Canonical body", title: "Note", contentHash: "hash-0", saved: true };
  class Socket {
    static CONNECTING = 0; static OPEN = 1; readyState = 0; bufferedAmount = 0;
    constructor() { sockets.push(this); queueMicrotask(() => { this.readyState = 1; this.onopen?.(); }); }
    send(raw) {
      const frame = JSON.parse(raw);
      const result = frame.method === "hello" ? { protocol: 2, principal: { id: "writer", role: "writer" } } : canonical;
      queueMicrotask(() => this.onmessage?.({ data: JSON.stringify({ id: frame.id, ok: true, result }) }));
    }
    close() { this.readyState = 3; this.onclose?.({ code: 1000 }); }
  }
  globalThis.WebSocket = Socket;
  try {
    for (const initial of ["Canonical body", "Previous HTTP snapshot"]) {
      let body = initial;
      const events = [];
      const editor = createCollaborationEditor({
        url: "ws://localhost/ws", scope: "quiet-hydration-" + initial, documentId: "note", clientId: "tab",
        drafts: createCollaborationDraftStore(memoryStorage()),
        editor: { getMarkdown: () => body, applyCollaborativeMarkdown(next) { body = next; return { status: "applied" }; } },
        onSnapshot: (snapshot, view) => events.push({ revision: snapshot.revision, remote: view.remote }),
      });
      try {
        editor.connect(); await new Promise(resolve => setTimeout(resolve, 0));
        assert.equal(editor.state.status, "saved"); assert.equal(body, canonical.body);
        assert.ok(events.length); assert.ok(events.every(event => !event.remote), "opening is not another writer's update");
        const send = snapshot => sockets.at(-1).onmessage?.({ data: JSON.stringify({ event: "document", documentId: "note", snapshot }) });
        canonical = { ...canonical, revision: canonical.revision + 1, body: canonical.body + " externally added", operation: { revision: canonical.revision + 1, start: canonical.body.length, deleteCount: 0, insert: " externally added", splices: [{ start: canonical.body.length, deleteCount: 0, insert: " externally added" }], actor: "other-writer" } };
        send(canonical); await new Promise(resolve => setTimeout(resolve, 0));
        assert.equal(body, canonical.body); assert.equal(events.at(-1).remote, true);
        send(canonical); await new Promise(resolve => setTimeout(resolve, 0));
        assert.equal(events.at(-1).remote, false, "repeated presence snapshots do not replay the notice");
      } finally { editor.dispose(); }
    }
  } finally { globalThis.WebSocket = previous; }
});

test("only a proven clean saved source may retire an ambiguous external selection", async () => {
  const previous = globalThis.WebSocket;
  try {
    for (const mode of ["clean", "title-draft", "unreported-source", "composing", "history-pending"]) {
      let socket, body = "aaaa", composing = false, revision = 0;
      const presentations = [], frames = [];
      const snapshot = () => ({ documentId: "note", epoch: "epoch", revision, body: revision ? "aaaaa" : "aaaa", title: "Title", contentHash: "hash-" + revision, saved: true,
        ...(revision ? { operation: { revision, actor: "external", operationId: "raw-write", start: 0, deleteCount: 4, splices: [{ start: 0, deleteCount: 4, insert: "aaaaa", ambiguous: true }] } } : {}) });
      class Socket {
        static CONNECTING = 0; static OPEN = 1; readyState = 0; bufferedAmount = 0;
        constructor() { socket = this; queueMicrotask(() => { this.readyState = 1; this.onopen?.(); }); }
        send(raw) { const frame = JSON.parse(raw); frames.push(frame); if (frame.method === "undo") return; queueMicrotask(() => this.onmessage?.({ data: JSON.stringify({ id: frame.id, ok: true, result: frame.method === "hello" ? { protocol: 2, principal: { id: "writer", role: "writer" } } : snapshot() }) })); }
        close() { this.readyState = 3; this.onclose?.({ code: 1000 }); }
      }
      globalThis.WebSocket = Socket;
      const editor = createCollaborationEditor({ url: "ws://localhost/ws", scope: "clean-selection-" + mode, documentId: "note", clientId: "tab", drafts: createCollaborationDraftStore(memoryStorage()), editor: {
        getMarkdown: () => body, isComposing: () => composing,
        applyCollaborativeMarkdown(value, presentation) {
          presentations.push(presentation);
          if (composing) return { status: "deferred" };
          if (presentation.operationSequence?.some(operations => operations.some(operation => operation.ambiguous)) && !presentation.retireUnprovenSelection) return { status: "recovery", reason: "The selected raw-file alignment is ambiguous" };
          body = value; return { status: "applied" };
        },
      } });
      try {
        editor.connect(); await new Promise(resolve => setTimeout(resolve, 0));
        assert.equal(editor.state.status, "saved"); presentations.length = 0;
        if (mode === "title-draft") editor.inputTitle("Private title");
        if (mode === "unreported-source") body = "Unreported private source";
        if (mode === "composing") composing = true;
        if (mode === "history-pending") { void editor.undo(); await new Promise(resolve => setTimeout(resolve, 0)); assert.equal(frames.at(-1).method, "undo"); }
        revision = 1; socket.onmessage({ data: JSON.stringify({ event: "document", documentId: "note", snapshot: snapshot() }) });
        await new Promise(resolve => setTimeout(resolve, 0));
        assert.ok(presentations.length, mode);
        assert.equal(presentations.at(-1).retireUnprovenSelection, mode === "clean", mode + " eligibility");
        if (mode === "clean") { assert.equal(body, "aaaaa"); assert.equal(editor.state.status, "saved"); assert.equal(editor.state.dirty, false); assert.equal(await editor.flush(), true); }
        else if (mode === "composing") { assert.equal(body, "aaaa"); assert.equal(await editor.flush(), false); }
        else { assert.equal(editor.state.status, "conflict"); assert.equal(await editor.flush(), false); if (mode === "unreported-source") assert.equal(body, "Unreported private source"); }
      } finally { editor.dispose(); }
    }
  } finally { globalThis.WebSocket = previous; }
});


test("changed epochs preserve private body/title drafts and unconfirmed receipts", async () => {
  const previous = globalThis.WebSocket;
  try {
    for (const mode of ["body", "title", "uncertain", "unreported"]) {
      let socket, epoch = "old", canonical = "aaaa", rendered = canonical;
      const frames = [], drafts = createCollaborationDraftStore(memoryStorage());
      class Socket {
        static CONNECTING = 0; static OPEN = 1; readyState = 0; bufferedAmount = 0;
        constructor() { socket = this; queueMicrotask(() => { this.readyState = 1; this.onopen?.(); }); }
        send(raw) {
          const frame = JSON.parse(raw); frames.push(frame);
          if (frame.method === "edit") { if (mode === "uncertain") queueMicrotask(() => this.close(1012)); return; }
          queueMicrotask(() => this.onmessage?.({ data: JSON.stringify({ id: frame.id, ok: true, result: frame.method === "hello" ? { protocol: 2, principal: { id: "writer", role: "writer" } } : { documentId: "note", epoch, revision: 0, body: canonical, title: "Title", contentHash: "hash-" + epoch, saved: true } }) }));
        }
        close(code = 1000) { this.readyState = 3; this.onclose?.({ code }); }
      }
      globalThis.WebSocket = Socket;
      const scope = { scope: "epoch-private-" + mode, principalId: "writer", documentId: "note", clientId: "tab" };
      const editor = createCollaborationEditor({ url: "ws://localhost/ws", ...scope, drafts, editor: { getMarkdown: () => rendered, applyCollaborativeMarkdown(value) { rendered = value; return { status: "applied" }; } } });
      try {
        editor.connect(); await new Promise(resolve => setTimeout(resolve, 0));
        if (mode !== "uncertain") socket.close(1012);
        if (mode === "title") editor.inputTitle("Private title");
        else if (mode === "unreported") rendered = "Unreported private source";
        else { rendered = "aaQaa"; inputIntent(editor, rendered, [{ start: 2, deleteCount: 0, insert: "Q" }]); }
        if (mode === "uncertain") { assert.equal(await editor.flush(), false); assert.equal(editor.state.status, "conflict"); }
        epoch = "new"; canonical = "aaaaa"; editor.connect(); await new Promise(resolve => setTimeout(resolve, 0));
        assert.equal(editor.state.status, "conflict", mode); assert.equal(await editor.flush(), false);
        assert.equal(editor.body, mode === "title" ? "aaaa" : mode === "unreported" ? "Unreported private source" : "aaQaa");
        assert.equal(editor.title, mode === "title" ? "Private title" : "Title");
        assert.equal(drafts.read(scope).value.body, editor.body); assert.equal(editor.state.durableDraft, true);
        assert.equal(frames.filter(frame => ["edit", "title"].includes(frame.method)).length, mode === "uncertain" ? 1 : 0);
      } finally { editor.dispose(); }
    }
  } finally { globalThis.WebSocket = previous; }
});

test("observational refresh confirms live metadata and refuses intervening private state", async () => {
  const previous = globalThis.WebSocket;
  try {
    for (const mode of ["metadata", "input", "title", "composing", "history", "flight", "dispose", "malformed"]) {
      let socket, rendered = "aaaa", composing = false, reply, opens = 0;
      const frames = [], drafts = createCollaborationDraftStore(memoryStorage());
      const snapshot = revision => ({ documentId: "note", epoch: "epoch", revision, body: "aaaa", title: "Title", prefix: revision ? "---\nattention_at: null\n---\n" : "", contentHash: "hash-" + revision, saved: true,
        ...(revision ? { operation: { revision, actor: "metadata", operationId: "metadata", start: 0, deleteCount: 0, splices: [] } } : {}) });
      class Socket {
        static CONNECTING = 0; static OPEN = 1; readyState = 0; bufferedAmount = 0;
        constructor() { socket = this; queueMicrotask(() => { this.readyState = 1; this.onopen?.(); }); }
        send(raw) {
          const frame = JSON.parse(raw); frames.push(frame);
          if (["undo", "edit", "title"].includes(frame.method)) return;
          if (frame.method === "open" && ++opens === 2) { reply = result => this.onmessage?.({ data: JSON.stringify({ id: frame.id, ok: true, result }) }); return; }
          queueMicrotask(() => this.onmessage?.({ data: JSON.stringify({ id: frame.id, ok: true, result: frame.method === "hello" ? { protocol: 2, principal: { id: "writer", role: "writer" } } : snapshot(0) }) }));
        }
        close() { this.readyState = 3; this.onclose?.({ code: 1000 }); }
      }
      globalThis.WebSocket = Socket;
      const scope = { scope: "refresh-" + mode, principalId: "writer", documentId: "note", clientId: "tab" };
      const editor = createCollaborationEditor({ url: "ws://localhost/ws", ...scope, drafts, editor: { getMarkdown: () => rendered, isComposing: () => composing, applyCollaborativeMarkdown(value) { rendered = value; return { status: "applied" }; } } });
      try {
        editor.connect(); await new Promise(resolve => setTimeout(resolve, 0));
        const pending = editor.refresh(); assert.equal(typeof reply, "function");
        if (["input", "flight"].includes(mode)) { rendered = "aaaaX"; inputIntent(editor, rendered, [{ start: 4, deleteCount: 0, insert: "X" }]); }
        if (mode === "title") editor.inputTitle("Private title");
        if (mode === "composing") composing = true;
        if (mode === "history") void editor.undo();
        if (mode === "flight") void editor.flush();
        if (mode === "dispose") editor.dispose();
        reply(mode === "malformed" ? { ...snapshot(1), revision: "invalid" } : snapshot(1));
        assert.equal(await pending, mode === "metadata", mode);
        assert.equal(editor.snapshot.contentHash, mode === "metadata" ? "hash-1" : "hash-0", mode + " acknowledgement");
        if (["input", "flight"].includes(mode)) { assert.equal(editor.body, "aaaaX"); assert.equal(drafts.read(scope).value.body, "aaaaX"); }
        if (mode === "title") assert.equal(editor.title, "Private title");
        assert.equal(frames.filter(frame => ["resync", "edit", "title", "undo", "redo"].includes(frame.method)).length, ["history", "flight"].includes(mode) ? 1 : 0, "refresh itself is observational");
      } finally { editor.dispose(); }
    }
  } finally { globalThis.WebSocket = previous; }
});


test("changed-epoch adoption defers composition and refuses a captured-input selection reset", async () => {
  const previous = globalThis.WebSocket;
  try {
    for (const mode of ["composing", "captured"]) {
      let socket, epoch = "old", rendered = "aaaa", composing = false, finishComposition;
      const presentations = [], drafts = createCollaborationDraftStore(memoryStorage());
      class Socket {
        static CONNECTING = 0; static OPEN = 1; readyState = 0; bufferedAmount = 0;
        constructor() { socket = this; queueMicrotask(() => { this.readyState = 1; this.onopen?.(); }); }
        send(raw) { const frame = JSON.parse(raw); queueMicrotask(() => this.onmessage?.({ data: JSON.stringify({ id: frame.id, ok: true, result: frame.method === "hello" ? { protocol: 2, principal: { id: "writer", role: "writer" } } : { documentId: "note", epoch, revision: 0, body: epoch === "old" ? "aaaa" : "aaaaa", title: "Title", contentHash: epoch, saved: true } }) })); }
        close(code = 1000) { this.readyState = 3; this.onclose?.({ code }); }
      }
      globalThis.WebSocket = Socket;
      const editor = createCollaborationEditor({ url: "ws://localhost/ws", scope: "epoch-binding-" + mode, documentId: "note", clientId: "tab", drafts, editor: {
        getMarkdown: () => rendered, isComposing: () => composing,
        subscribeCompositionEnd(listener) { finishComposition = listener; return () => {}; },
        applyCollaborativeMarkdown(value, presentation) {
          presentations.push(presentation);
          if (mode === "captured" && presentation.resetSelection) return { status: "recovery", reason: "Captured input must remain private" };
          rendered = value; return { status: "applied" };
        },
      } });
      try {
        editor.connect(); await new Promise(resolve => setTimeout(resolve, 0)); presentations.length = 0;
        socket.close(1012); epoch = "new"; composing = mode === "composing"; editor.connect(); await new Promise(resolve => setTimeout(resolve, 0));
        assert.equal(rendered, "aaaa");
        if (mode === "composing") {
          assert.equal(presentations.length, 0, "active composition is not painted or moved"); assert.equal(await editor.flush(), false);
          composing = false; finishComposition(); await new Promise(resolve => setTimeout(resolve, 0));
          assert.equal(rendered, "aaaaa"); assert.equal(editor.state.status, "saved"); assert.equal(presentations.at(-1).resetSelection, true);
        } else { assert.equal(editor.state.status, "conflict"); assert.equal(editor.state.durableDraft, true); assert.equal(await editor.flush(), false); }
      } finally { editor.dispose(); }
    }
  } finally { globalThis.WebSocket = previous; }
});
