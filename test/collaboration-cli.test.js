import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm, realpath } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import { once } from "node:events";
import { WebSocket, WebSocketServer } from "ws";
import { initializeMemoryRoot } from "../dist/runtime/index.js";
import {
  ensureRootBackend,
  stopRootBackend,
} from "../dist/app/backend-host/index.js";

const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
const id = "mem_48888888-8888-4888-8888-888888888888";
function command(args, options = {}) {
  const process = spawn(
    globalThis.process.execPath,
    [...(options.nodeArgs ?? []), cli, ...args],
    {
      env: { ...globalThis.process.env, ...options.env },
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  let stdout = "",
    stderr = "";
  process.stdout.on("data", (data) => {
    stdout += data;
  });
  process.stderr.on("data", (data) => {
    stderr += data;
  });
  const result = new Promise((resolve) =>
    process.once("close", (code) => resolve({ code, stdout, stderr })),
  );
  if (options.input !== undefined) process.stdin.end(options.input);
  return { process, result };
}
async function until(predicate) {
  const deadline = Date.now() + 10000;
  while (!(await predicate())) {
    if (Date.now() > deadline)
      throw new Error("Canonical streaming state did not arrive");
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
}
async function fixture(t) {
  const root = await realpath(
    await mkdtemp(path.join(os.tmpdir(), "jb-live-cli-")),
  );
  await initializeMemoryRoot(root);
  const file = path.join(root, "notes/live.md");
  await writeFile(
    file,
    `---\nid: ${id}\ntype: note\ntitle: CLI stream\n---\nHuman baseline\n`,
  );
  t.after(async () => {
    await stopRootBackend(root).catch(() => {});
    await rm(root, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 50,
    });
  });
  return { root, file };
}
test(
  "shipped CLI streams before EOF, preserves a concurrent human save, and finishes explicitly",
  { timeout: 30000 },
  async (t) => {
    const { root, file } = await fixture(t),
      backend = await ensureRootBackend(root);
    const child = command([
      "collaborate",
      "stream",
      "--root",
      root,
      "--id",
      id,
      "--client-id",
      "agent-one",
      "--stream-id",
      "generated-test",
      "--json",
    ]);
    t.after(() => child.process.kill());
    child.process.stdin.write("Agent first");
    await until(async () =>
      (await readFile(file, "utf8")).includes("Agent first"),
    );
    assert.equal(
      child.process.exitCode,
      null,
      "generated chunks reach Markdown while the producer is still running",
    );
    const status = await command(
      [
        "collaborate",
        "status",
        "--root",
        root,
        "--id",
        id,
        "--client-id",
        "agent-one",
        "--stream-id",
        "generated-test",
        "--json",
      ],
      { input: "" },
    ).result;
    assert.equal(status.code, 0, status.stderr);
    assert.equal(JSON.parse(status.stdout).stream.state, "active");
    const headers = {
      Authorization: "Bearer " + backend.token,
      "content-type": "application/json",
    };
    const document = await (
      await fetch(backend.url + "/memories/all/documents/" + id, { headers })
    ).json();
    const update = await fetch(backend.url + "/memories/all/documents/" + id, {
      method: "PUT",
      headers: { ...headers, "If-Match": document.contentHash },
      body: JSON.stringify({
        content: document.content.replace(
          "Human baseline",
          "Human concurrent edit",
        ),
      }),
    });
    assert.equal(update.status, 200);
    await new Promise((resolve) => setTimeout(resolve, 500));
    const emoji = Buffer.from(" 🧠");
    child.process.stdin.write(emoji.subarray(0, 3));
    await new Promise((resolve) => setTimeout(resolve, 20));
    child.process.stdin.end(emoji.subarray(3));
    const result = await child.result;
    assert.equal(result.code, 0, result.stderr);
    const packet = JSON.parse(result.stdout);
    assert.equal(packet.saved, true);
    assert.equal(packet.clientId, "agent-one");
    assert.equal(packet.stream.state, "finished");
    const canonical = await readFile(file, "utf8");
    assert.match(canonical, /Human concurrent edit\nAgent first 🧠$/);
    const undo = command(
      [
        "collaborate",
        "undo",
        "--root",
        root,
        "--id",
        id,
        "--client-id",
        "agent-one",
        "--json",
      ],
      { input: "" },
    );
    const undone = await undo.result;
    assert.equal(undone.code, 0, undone.stderr);
    assert.match(
      await readFile(file, "utf8"),
      /Human concurrent edit/,
      "agent undo retains human content",
    );
  },
);
test(
  "one actor finishing a shared stream ID does not stop another actor's producer",
  { timeout: 20000 },
  async (t) => {
    const { root, file } = await fixture(t);
    await ensureRootBackend(root);
    const first = command([
      "collaborate",
      "stream",
      "--root",
      root,
      "--id",
      id,
      "--client-id",
      "actor-a",
      "--stream-id",
      "common",
      "--json",
    ]);
    t.after(() => first.process.kill("SIGKILL"));
    first.process.stdin.write("Agent A");
    await until(async () => (await readFile(file, "utf8")).includes("Agent A"));
    const second = command([
      "collaborate",
      "stream",
      "--root",
      root,
      "--id",
      id,
      "--client-id",
      "actor-b",
      "--stream-id",
      "common",
      "--json",
    ]);
    t.after(() => second.process.kill("SIGKILL"));
    second.process.stdin.write("Agent B");
    await until(async () => (await readFile(file, "utf8")).includes("Agent B"));
    first.process.stdin.end();
    const a = await first.result;
    assert.equal(a.code, 0, a.stderr);
    assert.equal(JSON.parse(a.stdout).stream.state, "finished");
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.equal(
      second.process.exitCode,
      null,
      "Foreign terminal event must not cancel this actor",
    );
    second.process.stdin.write(" more B");
    await until(async () =>
      (await readFile(file, "utf8")).includes("Agent B more B"),
    );
    second.process.stdin.end();
    const b = await second.result;
    assert.equal(b.code, 0, b.stderr);
    assert.equal(JSON.parse(b.stdout).stream.state, "finished");
    assert.match(await readFile(file, "utf8"), /Agent AAgent B more B/);
  },
);
test(
  "SIGINT while a published chunk acknowledgement is held admits no remaining producer buffer",
  { timeout: 20000 },
  async (t) => {
    const { root, file } = await fixture(t),
      backend = await ensureRootBackend(root),
      server = createServer(),
      wss = new WebSocketServer({ server }),
      peers = new Set();
    let front, held, firstChunkId;
    const chunks = [];
    wss.on("connection", (socket) => {
      front = socket;
      const remote = new WebSocket(backend.url.replace(/^http/, "ws") + "/ws");
      peers.add(remote);
      const ready = once(remote, "open").then(
        () => true,
        () => false,
      );
      socket.on("message", async (data) => {
        const packet = JSON.parse(data.toString());
        if (packet.method === "stream.chunk") {
          chunks.push(packet.params.sequence);
          firstChunkId ??= packet.id;
        }
        if ((await ready) && remote.readyState === WebSocket.OPEN)
          remote.send(data, { binary: false });
      });
      remote.on("message", (data) => {
        const packet = JSON.parse(data.toString());
        if (firstChunkId && packet.id === firstChunkId) {
          held = data;
          return;
        }
        if (socket.readyState === WebSocket.OPEN)
          socket.send(data, { binary: false });
      });
      socket.on("close", () => remote.terminate());
      remote.on("close", () => {
        peers.delete(remote);
        socket.terminate();
      });
      remote.on("error", () => socket.terminate());
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const child = command(
      [
        "collaborate",
        "stream",
        "--target-url",
        `http://127.0.0.1:${server.address().port}`,
        "--id",
        id,
        "--client-id",
        "buffered-agent",
        "--stream-id",
        "buffered",
        "--json",
      ],
      { env: { JUMPYBRAIN_API_KEY: backend.token } },
    );
    child.process.stdin.on("error", () => {});
    t.after(async () => {
      child.process.kill("SIGKILL");
      for (const socket of wss.clients) socket.terminate();
      for (const peer of peers) peer.terminate();
      await new Promise((resolve) => wss.close(resolve));
      await new Promise((resolve) => server.close(resolve));
    });
    child.process.stdin.write("A".repeat(80_000));
    await until(
      async () =>
        held && (await readFile(file, "utf8")).includes("A".repeat(8192)),
    );
    child.process.kill("SIGINT");
    await new Promise((resolve) => setTimeout(resolve, 100));
    front.send(held, { binary: false });
    const result = await child.result;
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /SIGINT/);
    assert.deepEqual(
      chunks,
      [0],
      "Only the already admitted chunk may be published",
    );
    const canonical = await readFile(file, "utf8");
    assert.ok(canonical.endsWith("Human baseline\n" + "A".repeat(8192)));
    assert.equal(result.stdout, "");
  },
);
test("malformed collaboration flags fail before a backend is started", async (t) => {
  const { root } = await fixture(t);
  const result = await command(
    ["collaborate", "stream", "--root", root, "--id", id, "--start", "invalid"],
    { input: "" },
  ).result;
  assert.equal(result.code, 1);
  assert.match(result.stderr, /nonnegative integer/);
  await assert.rejects(
    readFile(path.join(root, ".jumpybrain/backend/owner.json")),
    { code: "ENOENT" },
  );
});
for (const signal of ["SIGINT", "SIGTERM"]) {
  test(
    `stream ${signal} cancels and exits with stdin still open while preserving saved human and agent text`,
    { timeout: 15000 },
    async (t) => {
      const { root, file } = await fixture(t),
        backend = await ensureRootBackend(root),
        clientId = "signal-agent",
        streamId = "signal-" + signal;
      const child = command([
        "collaborate",
        "stream",
        "--root",
        root,
        "--id",
        id,
        "--client-id",
        clientId,
        "--stream-id",
        streamId,
        "--json",
      ]);
      t.after(() => child.process.kill("SIGKILL"));
      child.process.stdin.write("Agent committed");
      await until(async () =>
        (await readFile(file, "utf8")).includes("Agent committed"),
      );
      const headers = {
          Authorization: "Bearer " + backend.token,
          "content-type": "application/json",
        },
        route = backend.url + "/memories/all/documents/" + id;
      const current = await (await fetch(route, { headers })).json();
      const response = await fetch(route, {
        method: "PUT",
        headers: { ...headers, "If-Match": current.contentHash },
        body: JSON.stringify({
          content: current.content.replace("Human baseline", "Human preserved"),
        }),
      });
      assert.equal(response.status, 200);
      const canonical = await readFile(file, "utf8");
      child.process.kill(signal);
      const result = await Promise.race([
        child.result,
        new Promise((_, reject) => {
          const timer = setTimeout(
            () =>
              reject(new Error("Interrupted stream remained blocked on stdin")),
            4000,
          );
          timer.unref();
        }),
      ]);
      assert.notEqual(result.code, 0);
      assert.match(result.stderr, new RegExp(signal));
      assert.equal(result.stdout, "");
      assert.equal(await readFile(file, "utf8"), canonical);
      const status = await command(
        [
          "collaborate",
          "status",
          "--root",
          root,
          "--id",
          id,
          "--client-id",
          clientId,
          "--stream-id",
          streamId,
          "--json",
        ],
        { input: "" },
      ).result;
      assert.equal(status.code, 0, status.stderr);
      assert.equal(JSON.parse(status.stdout).stream.state, "cancelled");
    },
  );
}
test(
  "stream heartbeat failures stop an idle producer without overlapping heartbeats",
  { timeout: 10000 },
  async (t) => {
    const root = await realpath(
        await mkdtemp(path.join(os.tmpdir(), "jb-cli-heartbeat-")),
      ),
      preload = path.join(root, "clock.mjs");
    // Only accelerate the CLI's15s heartbeat, not request deadlines or server time.
    await writeFile(
      preload,
      "const original=globalThis.setInterval;globalThis.setInterval=(fn,ms,...args)=>original(fn,ms===15000?25:ms,...args);",
    );
    const server = createServer(),
      wss = new WebSocketServer({ server }),
      methods = [];
    let concurrent = 0,
      peak = 0;
    const snapshot = {
      documentId: id,
      epoch: "heartbeat",
      revision: 0,
      body: "base",
      prefix: "",
      saved: true,
      contentHash: "sha256:" + "a".repeat(64),
      title: "Heartbeat",
    };
    wss.on("connection", (socket) =>
      socket.on("message", (data) => {
        const packet = JSON.parse(data.toString());
        methods.push(packet.method);
        const send = (result) =>
          socket.send(JSON.stringify({ id: packet.id, ok: true, result }));
        if (packet.method === "hello")
          send({ protocol: 2, principal: { id: "agent", role: "writer" } });
        else if (packet.method === "open") send(snapshot);
        else if (packet.method === "stream.start")
          send({
            ...snapshot,
            stream: { streamId: "s", sequence: 0, state: "active" },
          });
        else if (packet.method === "stream.status") {
          peak = Math.max(peak, ++concurrent);
          setTimeout(() => {
            concurrent--;
            socket.send(
              JSON.stringify({
                id: packet.id,
                ok: false,
                error: {
                  code: "stream_inactive",
                  message: "Injected heartbeat failure",
                },
              }),
            );
          }, 90);
        } else if (packet.method === "stream.cancel")
          send({
            ...snapshot,
            stream: { streamId: "s", sequence: 0, state: "cancelled" },
          });
      }),
    );
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const child = command(
      [
        "collaborate",
        "stream",
        "--target-url",
        `http://127.0.0.1:${server.address().port}`,
        "--id",
        id,
        "--client-id",
        "agent",
        "--stream-id",
        "s",
        "--json",
      ],
      {
        env: { JUMPYBRAIN_API_KEY: "disposable-heartbeat-key" },
        nodeArgs: ["--import", preload],
      },
    );
    t.after(async () => {
      child.process.kill("SIGKILL");
      for (const socket of wss.clients) socket.terminate();
      await new Promise((resolve) => wss.close(resolve));
      await new Promise((resolve) => server.close(resolve));
      await rm(root, { recursive: true, force: true });
    });
    const result = await child.result;
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /Injected heartbeat failure/);
    assert.ok(methods.includes("stream.status"));
    assert.ok(methods.includes("stream.cancel"));
    assert.equal(
      peak,
      1,
      "An idle producer cannot queue overlapping heartbeat requests",
    );
    assert.equal(result.stdout, "");
  },
);
