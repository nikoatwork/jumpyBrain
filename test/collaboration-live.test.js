import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { once } from "node:events";
import { mkdtemp, writeFile, readFile, rm, realpath } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { WebSocket } from "ws";
import { initializeMemoryRoot } from "../dist/index.js";
import { createCollaborationHub } from "../dist/app/collaboration/index.js";
import { createLiveServer } from "../dist/adapters/live/index.js";
import { AccessStore } from "../dist/adapters/access-control/index.js";
import { startJumpyBrainHttpServer } from "../dist/adapters/http-server/index.js";
const documentId = "mem_12345678-1234-1234-1234-123456789abc";
async function setup(t, options = {}) {
  const root = await realpath(
    await mkdtemp(path.join(os.tmpdir(), "jumpy-live-")),
  );
  await initializeMemoryRoot(root);
  const file = path.join(root, "notes", "live.md");
  await writeFile(
    file,
    `---\nid: ${documentId}\ntype: note\ntitle: Live\n---\nabc\n`,
  );
  const credentials = new Map([
    ["writer", { id: "writer", name: "Writer", role: "writer" }],
    ["reader", { id: "reader", name: "Reader", role: "reader" }],
  ]);
  const hub = createCollaborationHub({ root, observeIntervalMs: 0 });
  const server = createServer((req, res) => res.end());
  const live = createLiveServer({
    server,
    hub,
    authenticate: async (token) => credentials.get(token),
    revalidateIntervalMs: 20,
    ...options,
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const url = `ws://127.0.0.1:${server.address().port}/ws`;
  const clients = [];
  t.after(async () => {
    for (const client of clients) client.terminate();
    await live.close();
    await new Promise((resolve) => server.close(resolve));
    await hub.close();
    await rm(root, { recursive: true, force: true });
  });
  async function client(token = "writer") {
    const ws = new WebSocket(url);
    clients.push(ws);
    await once(ws, "open");
    let serial = 0;
    const pending = new Map(),
      events = [];
    ws.on("message", (data) => {
      const message = JSON.parse(data.toString());
      if (message.event) {
        events.push(message);
        return;
      }
      const wait = pending.get(message.id);
      if (wait) {
        clearTimeout(wait.timer);
        pending.delete(message.id);
        wait.resolve(message);
      }
    });
    const rpc = (method, params = {}) =>
      new Promise((resolve, reject) => {
        const id = String(++serial);
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error("RPC timed out: " + method));
        }, 1500);
        pending.set(id, { resolve, timer });
        ws.send(JSON.stringify({ id, method, params }));
      });
    const hello = await rpc("hello", { token, protocol: 2 });
    assert.equal(hello.ok, true);
    return { ws, rpc, events };
  }
  return { url, credentials, hub, file, client };
}
const openParams = (clientId) => ({ documentId, clientId });
const patch = (snapshot, clientId, operationId, start, insert) => ({
  ...openParams(clientId),
  epoch: snapshot.epoch,
  baseRevision: snapshot.revision,
  operationId,
  start,
  deleteCount: 0,
  insert,
});
test("real WS publishes source operations, subscriptions, streamed agent text and scoped undo", async (t) => {
  const { client, file } = await setup(t);
  const human = await client(),
    agent = await client();
  const first = (await human.rpc("open", openParams("human"))).result;
  await agent.rpc("open", { ...openParams("agent"), actorKind: "agent" });
  const humanEdit = await human.rpc("edit", patch(first, "human", "h", 1, "H"));
  assert.equal(humanEdit.ok, true);
  assert.equal(humanEdit.result.saved, true);
  const second = (await agent.rpc("open", openParams("agent"))).result;
  assert.equal(
    (
      await agent.rpc("stream.start", {
        ...openParams("agent"),
        epoch: second.epoch,
        baseRevision: second.revision,
        streamId: "stream",
        start: 4,
      })
    ).ok,
    true,
  );
  const chunk = await agent.rpc("stream.chunk", {
    ...openParams("agent"),
    epoch: second.epoch,
    streamId: "stream",
    sequence: 0,
    insert: " agent",
    actorKind: "agent",
  });
  assert.equal(chunk.ok, true);
  assert.equal(chunk.result.body, "aHbc agent\n");
  assert.equal(chunk.result.stream.sequence, 1);
  const undone = await human.rpc("undo", {
    ...openParams("human"),
    epoch: second.epoch,
    operationId: "undo",
  });
  assert.equal(undone.result.body, "abc agent\n");
  assert.ok((await readFile(file, "utf8")).endsWith(undone.result.body));
  assert.equal(human.events.at(-1).snapshot.body, undone.result.body);
  assert.ok(
    agent.events.some((event) => event.snapshot.operation?.operationId === "h"),
  );
});
test("reader denial, per-message credential revocation and idle socket revocation", async (t) => {
  const { client, credentials } = await setup(t);
  const reader = await client("reader");
  const snapshot = (await reader.rpc("open", openParams("r"))).result;
  const refused = await reader.rpc("edit", patch(snapshot, "r", "bad", 0, "x"));
  assert.equal(refused.error.code, "forbidden");
  const closed = once(reader.ws, "close");
  credentials.delete("reader");
  const [closeCode] = await closed;
  assert.equal(closeCode, 1008);
  const writer = await client();
  await writer.rpc("open", openParams("w"));
  credentials.delete("writer");
  const writerClosed = once(writer.ws, "close");
  writer.ws.send(JSON.stringify({ id: "revoked", method: "ping", params: {} }));
  assert.equal((await writerClosed)[0], 1008);
});
test("cross-origin and token-in-URL handshakes are rejected", async (t) => {
  const { url } = await setup(t);
  for (const [target, headers] of [
    [url, { Origin: "https://attacker.invalid" }],
    [url + "?token=writer", {}],
  ]) {
    const ws = new WebSocket(target, { headers });
    const error = await once(ws, "error");
    assert.match(error[0].message, /403|400/);
    ws.terminate();
  }
});
test("authentication deadline and bounded incoming frames disconnect incomplete clients", async (t) => {
  const { url, client } = await setup(t, {
    authenticationTimeoutMs: 30,
    maxFrameBytes: 1024,
  });
  const unauthenticated = new WebSocket(url);
  await once(unauthenticated, "open");
  assert.equal((await once(unauthenticated, "close"))[0], 1008);
  const active = await client();
  const close = once(active.ws, "close");
  active.ws.send("x".repeat(2048));
  assert.equal((await close)[0], 1009);
});
test(
  "production HTTP and WS share persistent reader authorization and idle revocation",
  { timeout: 10000 },
  async (t) => {
    const root = await realpath(
      await mkdtemp(path.join(os.tmpdir(), "jumpy-live-access-")),
    );
    await initializeMemoryRoot(root);
    const file = path.join(root, "notes", "live.md"),
      canonical = `---\nid: ${documentId}\ntype: note\ntitle: Live\n---\nabc\n`;
    await writeFile(file, canonical);
    const access = new AccessStore(root);
    const { credential, token } = await access.issue({
      name: "Read only",
      role: "reader",
    });
    const server = await startJumpyBrainHttpServer({
      root,
      apiKeys: [],
      accessStore: access,
      port: 0,
      autoIndex: false,
    });
    let ws;
    t.after(async () => {
      ws?.terminate();
      await server.close();
      access.close();
      await rm(root, { recursive: true, force: true });
    });
    const headers = {
      Authorization: "Bearer " + token,
      "content-type": "application/json",
    };
    assert.equal(
      (await fetch(server.url + "/capabilities", { headers })).status,
      200,
    );
    for (const [method, route] of [
      ["POST", "/memories/all/notes"],
      ["PUT", "/memories/all/documents/" + documentId],
      ["DELETE", "/memories/all/documents/" + documentId],
      ["POST", "/memories/all/index"],
      ["POST", "/access"],
      ["POST", "/_backend/call"],
    ]) {
      const response = await fetch(server.url + route, {
        method,
        headers,
        body: "{}",
      });
      assert.equal(response.status, 403, method + " " + route);
      await response.arrayBuffer();
    }
    ws = new WebSocket(server.url.replace(/^http/, "ws") + "/ws");
    await once(ws, "open");
    let serial = 0;
    const pending = new Map();
    ws.on("message", (data) => {
      const message = JSON.parse(data.toString());
      const resolve = pending.get(message.id);
      if (resolve) {
        pending.delete(message.id);
        resolve(message);
      }
    });
    const rpc = (method, params = {}) =>
      new Promise((resolve) => {
        const id = String(++serial);
        pending.set(id, resolve);
        ws.send(JSON.stringify({ id, method, params }));
      });
    assert.equal((await rpc("hello", { token, protocol: 2 })).ok, true);
    const snapshot = (await rpc("open", openParams("reader"))).result;
    assert.equal(
      (await rpc("edit", patch(snapshot, "reader", "denied", 0, "x"))).error
        .code,
      "forbidden",
    );
    const closed = once(ws, "close");
    await new AccessStore(root).revoke(credential.id);
    assert.equal((await closed)[0], 1008);
    const response = await fetch(server.url + "/capabilities", { headers });
    assert.equal(response.status, 401);
    await response.arrayBuffer();
    assert.equal(await readFile(file, "utf8"), canonical);
    assert.equal(
      (
        await readFile(path.join(root, ".jumpybrain/access.json"), "utf8")
      ).includes(token),
      false,
    );
  },
);
test(
  "pending request queue budgets disconnect excessive clients",
  { timeout: 2500 },
  async (t) => {
    const { client } = await setup(t, {
      maxQueuedBytes: 512,
      maxTotalQueuedBytes: 1024,
    });
    const active = await client();
    const closed = once(active.ws, "close");
    for (let i = 0; i < 20; i++)
      active.ws.send(
        JSON.stringify({
          id: "flood-" + i,
          method: "ping",
          params: { padding: "x".repeat(100) },
        }),
      );
    assert.equal((await closed)[0], 1013);
  },
);

test("obsolete protocol is rejected with upgrade guidance before opening a document", async t => {
  const {url,hub,file}=await setup(t);
  const before=await readFile(file,"utf8");
  const socket=new WebSocket(url);await once(socket,"open");t.after(()=>socket.terminate());
  const reply=once(socket,"message");
  socket.send(JSON.stringify({id:"old-client",method:"hello",params:{protocol:1,token:"writer"}}));
  const packet=JSON.parse(String((await reply)[0]));
  assert.equal(packet.ok,false);assert.equal(packet.error.code,"invalid_protocol");assert.match(packet.error.message,/Update all clients/);
  assert.equal(hub.resourceUsage().sessions,0);assert.equal(await readFile(file,"utf8"),before);
});
