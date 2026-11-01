import assert from "node:assert/strict";
import test from "node:test";
import { once } from "node:events";
import { mkdtemp, writeFile, readFile, rm, realpath } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { WebSocket } from "ws";
import { initializeMemoryRoot } from "../dist/index.js";
import { startJumpyBrainHttpServer } from "../dist/adapters/http-server/index.js";
const id = "mem_12345678-1234-1234-1234-123456789abc",
  token = "example-http-race-key";
async function fixture(t) {
  const root = await realpath(
    await mkdtemp(path.join(os.tmpdir(), "jumpy-live-http-race-")),
  );
  await initializeMemoryRoot(root);
  const file = path.join(root, "notes", "live.md");
  await writeFile(
    file,
    `---\nid: ${id}\ntype: note\ntitle: Initial\ncustom: retained\n---\nbase\n`,
  );
  const server = await startJumpyBrainHttpServer({
    root,
    apiKeys: [token],
    port: 0,
    autoIndex: false,
  });
  const ws = new WebSocket(server.url.replace(/^http/, "ws") + "/ws");
  await once(ws, "open");
  let serial = 0,
    latest;
  const pending = new Map();
  ws.on("message", (data) => {
    const message = JSON.parse(data.toString());
    if (message.event) {
      latest = message.snapshot;
      return;
    }
    const waiter = pending.get(message.id);
    if (waiter) {
      pending.delete(message.id);
      clearTimeout(waiter.timer);
      waiter.resolve(message);
    }
  });
  const rpc = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = String(++serial),
        timer = setTimeout(
          () => reject(new Error("Timed out: " + method)),
          5000,
        );
      pending.set(id, { resolve, timer });
      ws.send(JSON.stringify({ id, method, params }));
    });
  await rpc("hello", { protocol: 2, token });
  const base = { documentId: id, clientId: "human" };
  const snapshot = (await rpc("open", base)).result;
  const headers = {
      Authorization: "Bearer " + token,
      "content-type": "application/json",
    },
    route = server.url + "/memories/all/documents/" + id;
  t.after(async () => {
    ws.terminate();
    await server.close();
    await rm(root, { recursive: true, force: true });
  });
  const read = async () => {
    const response = await fetch(route, { headers });
    assert.equal(response.status, 200);
    return response.json();
  };
  const put = async (document, content, match = true) => {
    const response = await fetch(route, {
      method: "PUT",
      headers: {
        ...headers,
        ...(match ? { "If-Match": document.contentHash } : {}),
      },
      body: JSON.stringify({ content }),
    });
    return { status: response.status, body: await response.json() };
  };
  return { root, file, rpc, base, snapshot, read, put, latest: () => latest };
}
test("simultaneous metadata HTTP PUT and live source edit cannot silently overwrite one another", async (t) => {
  const { rpc, base, snapshot, read, put, file } = await fixture(t);
  const initial = await read();
  const [http, live] = await Promise.all([
    put(
      initial,
      initial.content.replace(/^title:.*$/m, 'title: "Metadata title"'),
    ),
    rpc("edit", {
      ...base,
      epoch: snapshot.epoch,
      baseRevision: snapshot.revision,
      operationId: "human",
      start: 0,
      deleteCount: 0,
      insert: "H",
    }),
  ]);
  assert.ok(
    http.status === 200 || live.ok,
    "at least one operation must commit; independent metadata may safely rebase",
  );
  let current = await read();
  if (http.status !== 200) {
    assert.equal(http.status, 412);
    assert.equal(current.content.endsWith("Hbase\n"), true);
    assert.equal(
      (
        await put(
          current,
          current.content.replace(/^title:.*$/m, 'title: "Metadata title"'),
        )
      ).status,
      200,
    );
  } else if (!live.ok) {
    assert.ok(
      ["epoch_changed", "precondition_failed"].includes(live.error.code),
    );
    const refreshed = (await rpc("open", base)).result;
    assert.equal(
      (
        await rpc("edit", {
          ...base,
          epoch: refreshed.epoch,
          baseRevision: refreshed.revision,
          operationId: "human-reconciled",
          start: 0,
          deleteCount: 0,
          insert: "H",
        })
      ).ok,
      true,
    );
  }
  current = await read();
  assert.equal(current.title, "Metadata title");
  assert.equal(current.content.endsWith("Hbase\n"), true);
  assert.equal(current.frontmatter.custom, "retained");
  assert.equal(current.id, id);
  assert.equal(await readFile(file, "utf8"), current.content);
});
test("legacy whole-document proposals require a current hash during live editing", async (t) => {
  const { rpc, base, snapshot, read, put } = await fixture(t);
  const old = await read();
  const accepted = await rpc("edit", {
    ...base,
    epoch: snapshot.epoch,
    baseRevision: snapshot.revision,
    operationId: "live",
    start: 0,
    deleteCount: 0,
    insert: "saved ",
  });
  assert.equal(accepted.ok, true);
  assert.equal(
    (await put(old, old.content.replace("base\n", "stale replacement\n")))
      .status,
    412,
  );
  assert.equal((await put(old, old.content, false)).status, 428);
  const current = await read();
  assert.equal(current.content.endsWith("saved base\n"), true);
  const titled = await rpc("title", {
    ...base,
    epoch: accepted.result.epoch,
    baseRevision: accepted.result.revision,
    title: "Live title",
    operationId: "title",
  });
  assert.equal(titled.ok, true);
  assert.equal(titled.result.body, "saved base\n");
  const afterTitle = await read();
  assert.equal(afterTitle.title, "Live title");
  assert.equal(afterTitle.frontmatter.custom, "retained");
});
