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
test("explicit positional transactions keep disjoint edits and insertion ties and reject actual overlap", () => {
  const merge=(base,local,remote)=>applySourceSplices(applySourceSplices(base,remote),rebaseSourcePair(base,local,remote).local);
  assert.equal(merge("one two",[{start:0,deleteCount:3,insert:"ONE"}],[{start:4,deleteCount:3,insert:"TWO"}]),"ONE TWO");
  assert.equal(merge("ab",[{start:1,deleteCount:0,insert:"LOCAL"}],[{start:1,deleteCount:0,insert:"REMOTE"}]),"aREMOTELOCALb");
  assert.equal(merge("ab",[{start:1,deleteCount:0,insert:"XX"}],[{start:1,deleteCount:0,insert:"XX"}]),"aXXXXb","identical intentional inserts by different writers both survive");
  assert.equal(merge("alpha\nmiddle\nomega\n",[{start:0,deleteCount:5,insert:"ALPHA"},{start:13,deleteCount:5,insert:"OMEGA"}],[{start:6,deleteCount:6,insert:"MIDDLE"}]),"ALPHA\nMIDDLE\nOMEGA\n","first and last source ranges never claim the unchanged middle");
  assert.throws(()=>merge("text",[{start:0,deleteCount:4,insert:"draft"}],[{start:0,deleteCount:4,insert:"saved"}]),error=>error.code==="overlapping_edit");
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
    editor.inputTitle("  My pending title  "); const conflictingFlush = editor.flush();
    assert.equal(heldTitles.length, 2);
    publish(sockets[0], "A different writer's title");await new Promise(resolve=>setTimeout(resolve,0));
    assert.equal(editor.state.status, "conflict"); assert.equal(editor.title, "  My pending title  ");
    receive(sockets[0], { id: heldTitles[1].id, ok: false, error: { code: "title_conflict", message: "Another writer changed the title." } });
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
  const previous=globalThis.WebSocket,frames=[];
  class Socket{static CONNECTING=0;static OPEN=1;readyState=0;bufferedAmount=0;constructor(){queueMicrotask(()=>{this.readyState=1;this.onopen?.()})}send(raw){const frame=JSON.parse(raw);frames.push(frame);queueMicrotask(()=>this.onmessage?.({data:JSON.stringify({id:frame.id,ok:true,result:frame.method==='hello'?{protocol:2,principal:{id:'writer',role:'writer'}}:{documentId:'note',epoch:'epoch',revision:0,body:'aaaa',title:'Title',contentHash:'hash',saved:true}})}))}close(){this.readyState=3;this.onclose?.({code:1000})}}
  globalThis.WebSocket=Socket;let editor;const drafts=createCollaborationDraftStore(memoryStorage());
  try{
    let body='aaaa';editor=createCollaborationEditor({url:'ws://localhost/ws',scope:'unproven',documentId:'note',clientId:'tab',drafts,editor:{getMarkdown:()=>body,applyCollaborativeMarkdown(value){body=value;return {status:'applied'}}}});editor.connect();await new Promise(resolve=>setTimeout(resolve,0));
    body='aaa';editor.input(body);assert.equal(editor.state.status,'conflict');assert.equal(await editor.flush(),false);assert.equal(editor.state.durableDraft,true);assert.equal(frames.filter(frame=>frame.method==='edit').length,0);assert.equal(drafts.read({scope:'unproven',principalId:'writer',documentId:'note',clientId:'tab'}).value.body,'aaa');assert.match(editor.state.message,/no verified positional edit range/);
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

test("a new epoch with changed source cannot retarget a clean old caret; identical-source reconnect stays clean",async()=>{
  const previous=globalThis.WebSocket;
  try{
    for(const changed of[false,true]){
      let epoch='old-epoch',canonical='aaaa',socket;const frames=[];
      class Socket{static CONNECTING=0;static OPEN=1;readyState=0;bufferedAmount=0;constructor(){socket=this;queueMicrotask(()=>{this.readyState=1;this.onopen?.()})}send(raw){const frame=JSON.parse(raw);frames.push(frame);queueMicrotask(()=>this.onmessage?.({data:JSON.stringify({id:frame.id,ok:true,result:frame.method==='hello'?{protocol:2,principal:{id:'writer',role:'writer'}}:{documentId:'note',epoch,revision:0,body:canonical,title:'Title',contentHash:'hash-'+epoch,saved:true}})}))}close(code=1000){this.readyState=3;this.onclose?.({code})}}
      globalThis.WebSocket=Socket;let editor;
      try{
        let body='aaaa';editor=createCollaborationEditor({url:'ws://localhost/ws',scope:'epoch-source-'+changed,documentId:'note',clientId:'tab',drafts:createCollaborationDraftStore(memoryStorage()),editor:{getMarkdown:()=>body,collaborativeSelection:()=>({anchor:2,focus:2}),applyCollaborativeMarkdown(value){body=value;return {status:'applied'}}}});editor.connect();await new Promise(resolve=>setTimeout(resolve,0));assert.equal(editor.state.status,'saved');
        socket.close(1012);epoch='new-epoch';canonical=changed?'aaaaa':'aaaa';editor.connect();await new Promise(resolve=>setTimeout(resolve,0));
        if(changed){assert.equal(editor.state.status,'conflict');assert.equal(body,'aaaa','unknown epoch history cannot move the old caret by a fabricated replacement');assert.equal(editor.snapshot.body,'aaaaa');body='aaQaa';inputIntent(editor,body,[{start:2,deleteCount:0,insert:'Q'}]);assert.equal(await editor.flush(),false);assert.equal(frames.filter(frame=>frame.method==='edit').length,0);assert.equal(canonical,'aaaaa');assert.equal(editor.state.durableDraft,true)}
        else{assert.equal(editor.state.status,'saved');assert.equal(editor.snapshot.epoch,'new-epoch');assert.equal(body,'aaaa');assert.equal(await editor.flush(),true)}
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
