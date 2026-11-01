import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, writeFile, readFile, rm, realpath } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { WebSocket } from "ws";
import { initializeMemoryRoot } from "../dist/index.js";
const documentId = "mem_12345678-1234-1234-1234-123456789abc";
const token = "disposable-crash-test-credential";
async function backend(root) {
  const code = `import {startJumpyBrainHttpServer} from './dist/adapters/http-server/index.js';const server=await startJumpyBrainHttpServer({root:process.env.COLLABORATION_TEST_ROOT,apiKeys:[${JSON.stringify(token)}],port:0,autoIndex:false});process.send({url:server.url});`;
  const child = spawn(process.execPath, ["--input-type=module", "-e", code], {
    cwd: process.cwd(),
    env: { ...process.env, COLLABORATION_TEST_ROOT: root },
    stdio: ["ignore", "ignore", "pipe", "ipc"],
  });
  let errors = "";
  child.stderr.on("data", (data) => {
    errors += data;
  });
  const ready = await Promise.race([
    once(child, "message").then(([message]) => message),
    once(child, "exit").then(() => {
      throw new Error("Backend startup failed: " + errors);
    }),
    new Promise((_, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Backend startup timeout")),
        10000,
      );
      timer.unref();
    }),
  ]);
  return {
    child,
    url: ready.url,
    async kill() {
      if (child.exitCode === null && child.signalCode === null) {
        const exited = once(child, "exit");
        child.kill("SIGKILL");
        await exited;
      }
    },
  };
}
async function connect(url) {
  const ws = new WebSocket(url.replace(/^http/, "ws") + "/ws");
  await once(ws, "open");
  let serial = 0;
  const pending = new Map();
  ws.on("message", (data) => {
    const message = JSON.parse(data.toString());
    const callback = pending.get(message.id);
    if (callback) {
      pending.delete(message.id);
      callback(message);
    }
  });
  const rpc = (method, params = {}) =>
    new Promise((resolve) => {
      const id = String(++serial);
      pending.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });
  assert.equal((await rpc("hello", { token, protocol: 2 })).ok, true);
  return { ws, rpc };
}
test(
  "acknowledged streamed publication survives SIGKILL; restart epochs reject delayed agent chunks",
  { timeout: 15000 },
  async (t) => {
    const root = await realpath(
      await mkdtemp(path.join(os.tmpdir(), "jumpy-live-crash-")),
    );
    await initializeMemoryRoot(root);
    const file = path.join(root, "notes", "live.md");
    await writeFile(
      file,
      `---\nid: ${documentId}\ntype: note\ntitle: Durable\n---\nbase\n`,
    );
    const backends = [],
      clients = [];
    t.after(async () => {
      for (const client of clients) client.ws.terminate();
      await Promise.all(backends.map((server) => server.kill()));
      await rm(root, { recursive: true, force: true });
    });
    const first = await backend(root);
    backends.push(first);
    const agent = await connect(first.url);
    clients.push(agent);
    const opening = { documentId, clientId: "agent", actorKind: "agent" };
    const snapshot = (await agent.rpc("open", opening)).result;
    await agent.rpc("stream.start", {
      ...opening,
      epoch: snapshot.epoch,
      baseRevision: snapshot.revision,
      streamId: "s",
      start: 4,
    });
    const saved = await agent.rpc("stream.chunk", {
      ...opening,
      epoch: snapshot.epoch,
      streamId: "s",
      sequence: 0,
      insert: " durable",
    });
    assert.equal(saved.ok, true);
    assert.equal(saved.result.saved, true);
    const acknowledged = await readFile(file, "utf8");
    await first.kill();
    assert.equal(await readFile(file, "utf8"), acknowledged);
    const second = await backend(root);
    backends.push(second);
    const resumed = await connect(second.url);
    clients.push(resumed);
    const reopened = (await resumed.rpc("open", opening)).result;
    assert.equal(reopened.body, "base durable\n");
    assert.notEqual(reopened.epoch, snapshot.epoch);
    const delayed = await resumed.rpc("stream.chunk", {
      ...opening,
      epoch: snapshot.epoch,
      streamId: "s",
      sequence: 1,
      insert: " delayed",
    });
    assert.equal(delayed.error.code, "epoch_changed");
    assert.equal(await readFile(file, "utf8"), acknowledged);
  },
);
