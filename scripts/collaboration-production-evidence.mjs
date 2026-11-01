// Reproducible production hub/transport workload; uses disposable canonical files.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import {
  mkdtemp,
  writeFile,
  readFile,
  rm,
  realpath,
  statfs,
  readdir,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { WebSocket } from "ws";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { initializeMemoryRoot } from "../dist/index.js";
import {
  createCollaborationHub,
  splitCanonicalContent,
} from "../dist/app/collaboration/index.js";
import { createLiveServer } from "../dist/adapters/live/index.js";
import { AccessStore } from "../dist/adapters/access-control/index.js";
const argumentsMap = new Map(
  process.argv.slice(2).map((value) => value.split("=")),
);
const count = (key, fallback, min, max) => {
  const value = Number(argumentsMap.get(key) ?? fallback);
  assert.ok(Number.isSafeInteger(value) && value >= min && value <= max, key);
  return value;
};
const rounds = count("--rounds", 20, 1, 100),
  notes = count("--notes", 128, 1, 2000),
  actors = count("--actors", 6, 2, 16),
  humans = count("--humans", 2, 1, actors - 1),
  seed = count("--seed", 1592594996, 1, 0xffffffff);
const acceptance = {
  canonicalP95Ms: 1000,
  peakRssBytes: 512 * 1024 * 1024,
  historyBytes: 32 * 1024 * 1024,
  queuedBytes: 32 * 1024 * 1024,
  rpcDeadlineMs: 10000,
};
async function assertFreshBuild() {
  const pkg = JSON.parse(await readFile("package.json", "utf8")),
    feedback = JSON.parse(
      await readFile("dist/adapters/http-server/feedback-config.json", "utf8"),
    );
  const fingerprint = createHash("sha256")
    .update(pkg.version)
    .update(feedback.url);
  for (const name of (await readdir("src", { recursive: true }))
    .filter((name) => name.endsWith(".ts"))
    .sort())
    fingerprint.update(name).update(await readFile(`src/${name}`));
  const digest = fingerprint.digest("hex"),
    actual = JSON.parse(
      await readFile("dist/adapters/diagnostics/build-info.json", "utf8"),
    );
  assert.equal(
    actual.version,
    pkg.version,
    "Runtime version differs from the source package.",
  );
  assert.equal(
    actual.build,
    digest.slice(0, 16),
    "Runtime is stale; rebuild after freezing all TypeScript inputs.",
  );
  return {
    version: actual.version,
    build: actual.build,
    allTypeScriptSha256: digest,
  };
}
const buildBefore = await assertFreshBuild();
let randomState = seed;
const random = () => {
  randomState ^= randomState << 13;
  randomState ^= randomState >>> 17;
  randomState ^= randomState << 5;
  return (randomState >>> 0) / 0x100000000;
};
const id = "mem_12345678-1234-1234-1234-123456789abc",
  largeId = "mem_22345678-1234-1234-1234-123456789abc";
const root = await realpath(
  await mkdtemp(path.join(os.tmpdir(), "jumpybrain-production-evidence-")),
);
await initializeMemoryRoot(root);
const prefix = (documentId) =>
  `---\nid: ${documentId}\ntype: note\ntitle: ${documentId}\n---\n`;
const file = path.join(root, "notes", "live.md");
let expected =
  "# Source\n\n- [ ] task\n\n```js\nretained();\n```\n\n| a | b |\n\n" +
  "paragraph ".repeat(100);
await writeFile(file, prefix(id) + expected);
for (let index = 1; index < notes; index++)
  await writeFile(
    path.join(root, "notes", `fixture-${index}.md`),
    `---\ntitle: Fixture ${index}\n---\nCanonical unrelated body.\n`,
  );
await writeFile(
  path.join(root, "notes", "large.md"),
  prefix(largeId) + "L".repeat(2 * 1024 * 1024 - 2048),
);
const access = new AccessStore(root),
  hub = createCollaborationHub({ root });
const server = createServer((req, res) => res.end()),
  live = createLiveServer({
    server,
    hub,
    authenticate: (token) => access.authenticate(token),
  });
server.listen(0, "127.0.0.1");
await once(server, "listening");
const url = `ws://127.0.0.1:${server.address().port}/ws`,
  clients = [],
  latencies = [],
  canonicalLatencies = [];
let serial = 0,
  confirmedEdits = 0,
  reconnects = 0;
const memoryBefore = process.memoryUsage(),
  started = performance.now();
let peakHistoryBytes = 0,
  peakQueuedBytes = 0;
const sample = () => {
  peakHistoryBytes = Math.max(
    peakHistoryBytes,
    hub.resourceUsage().historyBytes,
  );
  peakQueuedBytes = Math.max(peakQueuedBytes, live.resourceUsage().queuedBytes);
};
const sampler = setInterval(sample, 10);
sampler.unref();
const wait = async (predicate, message) => {
  const end = Date.now() + 10000;
  while (!predicate()) {
    if (Date.now() > end) throw new Error(message);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};
async function connect(index, token) {
  const ws = new WebSocket(url),
    latest = new Map(),
    pending = new Map();
  await once(ws, "open");
  ws.on("message", (data) => {
    const message = JSON.parse(data.toString());
    if (message.event) {
      const previous = latest.get(message.documentId);
      if (
        !previous ||
        previous.epoch !== message.snapshot.epoch ||
        previous.revision <= message.snapshot.revision
      )
        latest.set(message.documentId, message.snapshot);
      return;
    }
    const waiter = pending.get(message.id);
    if (waiter) {
      pending.delete(message.id);
      clearTimeout(waiter.timer);
      const latency = performance.now() - waiter.started;
      latencies.push(latency);
      if (
        message.ok &&
        ["edit", "title", "undo", "redo", "stream.chunk"].includes(
          waiter.method,
        )
      )
        canonicalLatencies.push(latency);
      sample();
      waiter.resolve(message);
    }
  });
  ws.on("close", () => {
    for (const waiter of pending.values()) {
      clearTimeout(waiter.timer);
      waiter.reject(new Error("Disconnected with an unconfirmed request"));
    }
    pending.clear();
  });
  const rpc = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const requestId = String(++serial),
        timer = setTimeout(() => {
          pending.delete(requestId);
          reject(new Error("RPC timeout: " + method));
        }, acceptance.rpcDeadlineMs);
      pending.set(requestId, {
        method,
        resolve,
        reject,
        timer,
        started: performance.now(),
      });
      ws.send(JSON.stringify({ id: requestId, method, params }));
    });
  assert.equal((await rpc("hello", { token, protocol: 2 })).ok, true);
  const base = {
    documentId: id,
    clientId: "actor-" + index,
    actorKind: index < humans ? "human" : "agent",
  };
  const opened = await rpc("open", base);
  assert.equal(opened.ok, true);
  latest.set(id, opened.result);
  return { ws, rpc, latest, base, token, index };
}
try {
  for (let index = 0; index < actors; index++) {
    const issued = await access.issue({
      name: index < humans ? "Human " + index : "Agent " + index,
      role: "writer",
    });
    clients.push(await connect(index, issued.token));
  }
  for (let round = 0; round < rounds; round++) {
    const body = expected,
      snapshot = clients[0].latest.get(id),
      requests = clients.map((client, index) => ({
        client,
        start: Math.floor((body.length * (index + 1)) / (actors + 1)),
        insert: `[${round}:${index}]`,
      }));
    expected = requests
      .toSorted((a, b) => b.start - a.start)
      .reduce(
        (source, request) =>
          source.slice(0, request.start) +
          request.insert +
          source.slice(request.start + 1),
        body,
      );
    // Seeded independent dispatch order; the expected result does not use server-transformed positions.
    const arrival = requests
      .map((request) => ({ ...request, order: random() }))
      .sort((a, b) => a.order - b.order);
    const replies = await Promise.all(
      arrival.map(({ client, start, insert }) =>
        client.rpc("edit", {
          ...client.base,
          epoch: snapshot.epoch,
          baseRevision: snapshot.revision,
          operationId: `round-${round}-${client.index}`,
          start,
          deleteCount: 1,
          insert,
        }),
      ),
    );
    for (const reply of replies) {
      assert.equal(reply.ok, true, JSON.stringify(reply.error));
      confirmedEdits++;
    }
    await wait(
      () => clients.every((client) => client.latest.get(id)?.body === expected),
      "Concurrent sources did not converge",
    );
    assert.equal(
      splitCanonicalContent(await readFile(file, "utf8")).body,
      expected,
    );
    if (round % 5 === 4) {
      const old = clients[0],
        closed = once(old.ws, "close");
      old.ws.close();
      await closed;
      clients[0] = await connect(old.index, old.token);
      assert.equal(clients[0].latest.get(id).body, expected);
      reconnects++;
    }
  }
  const agent = clients.at(-1),
    snapshot = agent.latest.get(id),
    streamId = "evidence-stream";
  assert.equal(
    (
      await agent.rpc("stream.start", {
        ...agent.base,
        epoch: snapshot.epoch,
        baseRevision: snapshot.revision,
        streamId,
        start: expected.length,
      })
    ).ok,
    true,
  );
  const chunkParams = {
    ...agent.base,
    epoch: snapshot.epoch,
    streamId,
    sequence: 0,
    insert: " streamed",
  };
  assert.equal((await agent.rpc("stream.chunk", chunkParams)).ok, true);
  expected += " streamed";
  assert.equal((await agent.rpc("stream.chunk", chunkParams)).ok, true);
  assert.equal(
    (
      await agent.rpc("stream.chunk", {
        ...chunkParams,
        sequence: 2,
        insert: "gap",
      })
    ).error.code,
    "stream_gap",
  );
  assert.equal(
    (
      await agent.rpc("stream.chunk", {
        ...chunkParams,
        sequence: 1,
        insert: " accepted",
      })
    ).ok,
    true,
  );
  expected += " accepted";
  assert.equal(
    (
      await agent.rpc("stream.cancel", {
        ...agent.base,
        epoch: snapshot.epoch,
        streamId,
      })
    ).result.stream.state,
    "cancelled",
  );
  assert.equal(
    (
      await agent.rpc("stream.chunk", {
        ...chunkParams,
        sequence: 2,
        insert: "late",
      })
    ).error.code,
    "stream_inactive",
  );
  await wait(
    () => clients.every((client) => client.latest.get(id)?.body === expected),
    "Agent stream did not converge",
  );
  const raw = await readFile(file, "utf8");
  expected += "\nExternal writer retained.\n";
  await writeFile(file, splitCanonicalContent(raw).prefix + expected);
  await wait(
    () => clients.every((client) => client.latest.get(id)?.body === expected),
    "Missed-event scanner did not reconcile the external write",
  );
  // A near-limit canonical source opens and publishes through the same production path.
  const largeBase = { ...clients[0].base, documentId: largeId },
    large = (await clients[0].rpc("open", largeBase)).result;
  const largeEdit = await clients[0].rpc("edit", {
    ...largeBase,
    epoch: large.epoch,
    baseRevision: large.revision,
    operationId: "near-limit",
    start: 100,
    deleteCount: 1,
    insert: "M",
  });
  assert.equal(largeEdit.ok, true);
  assert.equal(largeEdit.result.saved, true);
  assert.equal(largeEdit.result.body[100], "M");
  const resources = {
    hub: hub.resourceUsage(),
    transport: live.resourceUsage(),
    peaks: { historyBytes: peakHistoryBytes, queuedBytes: peakQueuedBytes },
  };
  assert.ok(resources.hub.historyBytes <= 32 * 1024 * 1024);
  assert.equal(resources.transport.queuedBytes, 0);
  const sorted = latencies.toSorted((a, b) => a - b),
    percentile = (value) =>
      Math.round(
        sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * value))] *
          100,
      ) / 100;
  const canonicalSorted = canonicalLatencies.toSorted((a, b) => a - b),
    canonicalP95 =
      Math.round(
        canonicalSorted[
          Math.min(
            canonicalSorted.length - 1,
            Math.floor(canonicalSorted.length * 0.95),
          )
        ] * 100,
      ) / 100;
  const peakRssBytes = process.resourceUsage().maxRSS * 1024;
  const checks = {
    canonicalP95: canonicalP95 <= acceptance.canonicalP95Ms,
    peakRss: peakRssBytes <= acceptance.peakRssBytes,
    history: peakHistoryBytes <= acceptance.historyBytes,
    queue: peakQueuedBytes <= acceptance.queuedBytes,
  };
  const passed = Object.values(checks).every(Boolean),
    filesystem = await statfs(root);
  assert.deepEqual(
    await assertFreshBuild(),
    buildBefore,
    "Source/build changed during the workload.",
  );
  const sourceHash = createHash("sha256"),
    runtimeHash = createHash("sha256");
  const inputs = [
    "src/core/collaboration/model.ts",
    "src/core/canonical/markdown-store.ts",
    "src/app/local-memory/index.ts",
    "src/app/collaboration/index.ts",
    "src/adapters/live/index.ts",
    "src/adapters/websocket/index.ts",
    "src/adapters/access-control/index.ts",
    "src/core/document-update.ts",
    "src/core/contribution.ts",
    "src/core/frontmatter.ts",
    "scripts/collaboration-production-evidence.mjs",
    "package.json",
    "package-lock.json",
  ];
  for (const source of inputs) {
    sourceHash.update(source);
    sourceHash.update(await readFile(source));
    if (source.startsWith("src/")) {
      const runtime = source.replace(/^src\//, "dist/").replace(/\.ts$/, ".js");
      runtimeHash.update(runtime);
      runtimeHash.update(await readFile(runtime));
    }
  }
  console.log(
    JSON.stringify(
      {
        version: 1,
        environment: {
          node: process.version,
          platform: process.platform,
          architecture: process.arch,
          os: os.release(),
          cpu: os.cpus()[0]?.model,
          filesystem: { type: filesystem.type, blockSize: filesystem.bsize },
          indexing: "disabled; derived staleness markers only",
          publication:
            "real canonical publisher: file fsync, guarded rename, best-effort directory fsync",
          concurrency: argumentsMap.get("--concurrency") ?? "unreported",
          head: execFileSync("git", ["rev-parse", "HEAD"], {
            encoding: "utf8",
          }).trim(),
          sourceSha256: sourceHash.digest("hex"),
          verifiedBuild: buildBefore,
          runtimeSha256: runtimeHash.digest("hex"),
          sourceInputs: inputs,
        },
        seed,
        rounds,
        actors,
        humans,
        agents: actors - humans,
        canonicalNotes: notes + 1,
        confirmedEdits,
        streamChecks: ["duplicate", "gap", "cancel"],
        reconnects,
        externalReconciliation: true,
        nearLimitSourceBytes: Buffer.byteLength(large.prefix + large.body),
        resources,
        acceptance,
        checks,
        passed,
        observations: {
          elapsedMs: Math.round(performance.now() - started),
          rpcCount: latencies.length,
          rpcP50Ms: percentile(0.5),
          rpcP95Ms: percentile(0.95),
          canonicalRpcCount: canonicalLatencies.length,
          canonicalP95Ms: canonicalP95,
          rssBefore: memoryBefore.rss,
          rssAfter: process.memoryUsage().rss,
          heapUsedAfter: process.memoryUsage().heapUsed,
          maxRssKiB: process.resourceUsage().maxRSS,
        },
        claims:
          "Observed on this machine with these inputs; no universal latency or RSS guarantee.",
      },
      null,
      2,
    ),
  );
  assert.ok(passed, "Declared production workload acceptance budget failed.");
} finally {
  clearInterval(sampler);
  for (const client of clients) client.ws.terminate();
  await live.close();
  await new Promise((resolve) => server.close(resolve));
  await hub.close();
  access.close();
  await rm(root, { recursive: true, force: true });
}
