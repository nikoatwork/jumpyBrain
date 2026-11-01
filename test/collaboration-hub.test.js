import assert from "node:assert/strict";
import test from "node:test";
import {
  mkdtemp,
  readFile,
  writeFile,
  rename,
  rm,
  readdir,
  realpath,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { initializeMemoryRoot } from "../dist/index.js";
import { createCollaborationHub } from "../dist/app/collaboration/index.js";
const id = "mem_12345678-1234-1234-1234-123456789abc";
const principal = { id: "human", name: "Human", role: "writer" };
const content = (body, title = "Live") =>
  `---\nid: ${id}\ntype: note\ntitle: ${JSON.stringify(title)}\ncreated_at: "2026-01-01T00:00:00Z"\n---\n${body}`;
async function fixture(t, options = {}) {
  const root = await realpath(
    await mkdtemp(path.join(os.tmpdir(), "jumpy-collaboration-")),
  );
  await initializeMemoryRoot(root);
  const file = path.join(root, "notes", "live.md");
  await writeFile(file, content("abc\n"));
  const hub = createCollaborationHub({
    root,
    observeIntervalMs: 0,
    quietMs: 0,
    ...options,
  });
  t.after(async () => {
    await hub.close();
    await rm(root, { recursive: true, force: true });
  });
  return { root, file, hub };
}
const params = (s) => ({
  documentId: id,
  clientId: "tab",
  epoch: s.epoch,
  baseRevision: s.revision,
});
test("canonical publication precedes reply; independent actors and guarded legacy writes preserve source", async (t) => {
  const { hub, file } = await fixture(t);
  const start = await hub.open(id, principal, { clientId: "tab" });
  const events = [];
  hub.subscribe(id, (s) => events.push(s));
  const saved = await hub.dispatch(
    "edit",
    {
      ...params(start),
      operationId: "a",
      start: 1,
      deleteCount: 0,
      insert: "H",
    },
    principal,
  );
  assert.equal(saved.saved, true);
  assert.equal(saved.body, "aHbc\n");
  assert.equal(saved.operation.operationId, "a");
  assert.ok((await readFile(file, "utf8")).endsWith(saved.body));
  const agent = await hub.dispatch(
    "edit",
    {
      ...params(start),
      clientId: "agent",
      actorKind: "agent",
      operationId: "b",
      start: 3,
      deleteCount: 0,
      insert: "A",
    },
    { id: "agent", name: "Agent", role: "writer" },
  );
  assert.equal(agent.body, "aHbcA\n");
  assert.equal(events.at(-1).contentHash, agent.contentHash);
  await assert.rejects(
    hub.beforeLegacyWrite(id, start.contentHash),
    (e) => e.code === "precondition_failed",
  );
  await assert.rejects(
    hub.dispatch(
      "edit",
      {
        ...params(agent),
        operationId: "reader",
        start: 0,
        deleteCount: 0,
        insert: "X",
      },
      { id: "reader", name: "Reader", role: "reader" },
    ),
    (e) => e.code === "forbidden",
  );
});
test("external writes and renames reconcile; metadata title updates preserve the live body", async (t) => {
  const { hub, file, root } = await fixture(t);
  let snapshot = await hub.open(id, principal, { clientId: "tab" });
  await writeFile(file, content("abc external\n"));
  await hub.observe();
  snapshot = await hub.read(id);
  assert.equal(snapshot.body, "abc external\n");
  const moved = path.join(root, "notes", "moved.md");
  await rename(file, moved);
  await hub.observe();
  snapshot = await hub.read(id);
  assert.equal(snapshot.file, "notes/moved.md");
  const titled = await hub.dispatch(
    "title",
    { ...params(snapshot), title: "Renamed" },
    principal,
  );
  assert.equal(titled.title, "Renamed");
  assert.equal(titled.body, "abc external\n");
  assert.equal(titled.epoch, snapshot.epoch);
  assert.ok(titled.revision > snapshot.revision);
  await assert.rejects(
    hub.dispatch(
      "title",
      { ...params(snapshot), title: "Stale title" },
      principal,
    ),
    (e) => e.code === "title_conflict",
  );
  assert.equal(
    (
      await hub.dispatch(
        "edit",
        {
          ...params(snapshot),
          operationId: "stale-body",
          start: 0,
          deleteCount: 0,
          insert: "X",
        },
        principal,
      )
    ).body,
    "Xabc external\n",
  );
});
test("partial file writes stabilize, deletion preserves recovery and explicit resync restores canonical source", async (t) => {
  const { hub, file, root } = await fixture(t, { maxWaitMs: 30 });
  await hub.open(id, principal, { clientId: "tab" });
  await writeFile(file, "---\nid:");
  await hub.observe();
  await writeFile(file, content("finished\n"));
  await hub.observe();
  assert.equal((await hub.read(id)).body, "finished\n");
  await rm(file);
  await hub.observe();
  const conflict = await hub.read(id);
  assert.equal(conflict.saved, false);
  assert.equal(conflict.conflict.code, "source_deleted");
  assert.ok(
    (await readdir(path.join(root, ".jumpybrain", "recovery", id))).length > 0,
  );
  await writeFile(file, content("restored\n"));
  const restored = await hub.dispatch(
    "resync",
    { documentId: id, clientId: "tab" },
    principal,
  );
  assert.equal(restored.saved, true);
  assert.equal(restored.body, "restored\n");
});
test("publication failure retains canonical body and does not acknowledge the rejected draft", async (t) => {
  const { hub, file } = await fixture(t);
  const initial = await hub.open(id, principal, { clientId: "tab" });
  await writeFile(file, "---\nid:");
  await assert.rejects(
    hub.dispatch(
      "edit",
      {
        ...params(initial),
        operationId: "lost",
        start: 0,
        deleteCount: 0,
        insert: "draft",
      },
      principal,
    ),
  );
  assert.equal(await readFile(file, "utf8"), "---\nid:");
  await writeFile(file, content("abc\n"));
  assert.equal((await hub.read(id)).body, "abc\n");
});
test("raw deletion during streamed agent output is not resurrected by later chunks", async (t) => {
  const { hub, file } = await fixture(t);
  const initial = await hub.open(id, principal, { clientId: "tab" });
  await hub.dispatch(
    "stream.start",
    { ...params(initial), streamId: "s", start: 3 },
    principal,
  );
  await hub.dispatch(
    "stream.chunk",
    { ...params(initial), streamId: "s", sequence: 0, insert: "deleted" },
    principal,
  );
  const canonical = await readFile(file, "utf8");
  await writeFile(file, canonical.replace("abcdeleted\n", "abc\n"));
  await hub.observe();
  const next = await hub.dispatch(
    "stream.chunk",
    { ...params(initial), streamId: "s", sequence: 1, insert: "kept" },
    principal,
  );
  assert.equal(next.body, "abckept\n");
  assert.equal(next.body.includes("deleted"), false);
});
test("live source reads bound malformed metadata without changing ordinary canonical reads", async (t) => {
  const { hub, file } = await fixture(t);
  await writeFile(file, "---\nid: " + id + "\n" + "unfinished: ".repeat(10000));
  await assert.rejects(
    hub.open(id, principal, { clientId: "tab" }),
    (e) => e.code === "document_limit",
  );
});
for (const boundary of ["fsync", "rename"]) {
  test(`real canonical ${boundary} failure never commits live model, receipt or Saved event`, async (t) => {
    const { hub, file } = await fixture(t);
    const initial = await hub.open(id, principal, { clientId: "tab" }),
      canonical = await readFile(file, "utf8"),
      events = [];
    hub.subscribe(id, (event) => events.push(event));
    if (boundary === "rename")
      t.mock.method(fs, "rename", async () => {
        throw Object.assign(new Error("Injected publication error"), {
          code: "EIO",
        });
      });
    else {
      const originalOpen = fs.open;
      t.mock.method(fs, "open", async (...args) => {
        const handle = await originalOpen(...args);
        if (String(args[0]).endsWith(".tmp"))
          handle.sync = async () => {
            throw Object.assign(new Error("Injected fsync error"), {
              code: "EIO",
            });
          };
        return handle;
      });
    }
    syncBuiltinESMExports();
    t.after(() => {
      t.mock.restoreAll();
      syncBuiltinESMExports();
    });
    await assert.rejects(
      hub.dispatch(
        "edit",
        {
          ...params(initial),
          operationId: "retry",
          start: 0,
          deleteCount: 0,
          insert: "rejected",
        },
        principal,
      ),
      (e) => e.code === "EIO",
    );
    assert.equal(await readFile(file, "utf8"), canonical);
    assert.deepEqual(events, []);
    assert.equal((await hub.read(id)).revision, initial.revision);
    assert.deepEqual(await readdir(path.dirname(file)), ["live.md"]);
    t.mock.restoreAll();
    syncBuiltinESMExports();
    const accepted = await hub.dispatch(
      "edit",
      {
        ...params(initial),
        operationId: "retry",
        start: 0,
        deleteCount: 0,
        insert: "accepted",
      },
      principal,
    );
    assert.equal(accepted.body, "acceptedabc\n");
    assert.equal(accepted.saved, true);
  });
}
test("escaped wire budget and canonical metadata growth reject edits before publication", async (t) => {
  const { hub, file } = await fixture(t);
  const initial = await hub.open(id, principal, { clientId: "tab" }),
    canonical = await readFile(file, "utf8");
  const controls = "\u0001".repeat(600000);
  await assert.rejects(
    hub.dispatch(
      "edit",
      {
        ...params(initial),
        operationId: "wire",
        start: 0,
        deleteCount: 0,
        insert: controls,
      },
      principal,
    ),
    (e) => e.code === "document_limit",
  );
  assert.equal(await readFile(file, "utf8"), canonical);
  assert.equal((await hub.read(id)).revision, initial.revision);
  const nearLimit = "a".repeat(
    2 * 1024 * 1024 - Buffer.byteLength(canonical) - 8,
  );
  await assert.rejects(
    hub.dispatch(
      "edit",
      {
        ...params(initial),
        operationId: "metadata",
        start: 0,
        deleteCount: 0,
        insert: nearLimit,
      },
      principal,
    ),
    (e) => e.code === "document_limit",
  );
  assert.equal(await readFile(file, "utf8"), canonical);
});
test("total open sessions, idle eviction and retained history have explicit resource gauges", async (t) => {
  const { hub, root } = await fixture(t, { maxSessions: 1 });
  await hub.open(id, principal, { clientId: "tab" });
  const dispose = hub.subscribe(id, () => {});
  const second = "mem_22345678-1234-1234-1234-123456789abc";
  await writeFile(
    path.join(root, "notes", "second.md"),
    content("second\n").replace(id, second),
  );
  await assert.rejects(hub.open(second), (e) => e.code === "session_capacity");
  assert.equal(hub.resourceUsage().sessions, 1);
  assert.equal(hub.resourceUsage().subscriptions, 1);
  dispose();
  await hub.open(second);
  assert.equal(hub.resourceUsage().sessions, 1);
  assert.ok(hub.resourceUsage().historyBytes <= 32 * 1024 * 1024);
});
test("streamed newlines preserve canonical CRLF and keep stream anchors across metadata publications", async (t) => {
  const { hub, file } = await fixture(t);
  await writeFile(file, content("a\nb\n").replace(/\n/g, "\r\n"));
  const initial = await hub.open(id, principal, { clientId: "tab" });
  assert.equal(initial.body, "a\r\nb\r\n");
  await hub.dispatch(
    "stream.start",
    { ...params(initial), streamId: "crlf", start: initial.body.length },
    principal,
  );
  const first = await hub.dispatch(
    "stream.chunk",
    {
      ...params(initial),
      streamId: "crlf",
      sequence: 0,
      insert: "first\nsecond",
    },
    principal,
  );
  assert.equal(first.epoch, initial.epoch);
  assert.equal(first.body, "a\r\nb\r\nfirst\r\nsecond");
  const title = await hub.dispatch(
    "title",
    { ...params(first), title: "While streaming" },
    principal,
  );
  assert.equal(title.epoch, initial.epoch);
  const next = await hub.dispatch(
    "stream.chunk",
    { ...params(initial), streamId: "crlf", sequence: 1, insert: "\nthird" },
    principal,
  );
  assert.equal(next.body, "a\r\nb\r\nfirst\r\nsecond\r\nthird");
  assert.equal(
    (
      await hub.dispatch(
        "stream.finish",
        { ...params(initial), streamId: "crlf" },
        principal,
      )
    ).stream.state,
    "finished",
  );
  assert.ok((await readFile(file, "utf8")).endsWith(next.body));
});
test("canonical whitespace delimiters retain their actual protected source boundary", async (t) => {
  const { hub, file } = await fixture(t);
  await writeFile(file, content("body\n").replace(/^---$/gm, "  ---  "));
  const snapshot = await hub.open(id, principal, { clientId: "tab" });
  assert.equal(snapshot.body, "body\n");
  assert.ok(snapshot.prefix.startsWith("  ---  \n"));
});
test("reopening awaits external settlement before acknowledging its Saved snapshot", async (t) => {
  const { hub, file } = await fixture(t, { quietMs: 30, maxWaitMs: 200 });
  await hub.open(id, principal, { clientId: "tab" });
  await writeFile(file, content("replacement\n"));
  const reopened = await hub.open(id, principal, { clientId: "other" });
  assert.equal(reopened.body, "replacement\n");
  assert.equal(reopened.saved, true);
});
test("an immediate local patch rebases over a safe raw append before publication", async (t) => {
  const { hub, file } = await fixture(t, { quietMs: 30, maxWaitMs: 200 });
  const initial = await hub.open(id, principal, { clientId: "tab" });
  await writeFile(file, content("abc\nexternal append\n"));
  const saved = await hub.dispatch(
    "edit",
    {
      ...params(initial),
      operationId: "after-raw",
      start: 0,
      deleteCount: 0,
      insert: "local ",
    },
    principal,
  );
  assert.equal(saved.saved, true);
  assert.equal(saved.epoch, initial.epoch);
  assert.equal(saved.body, "local abc\nexternal append\n");
  assert.ok((await readFile(file, "utf8")).endsWith(saved.body));
});
test("legacy guards settle observed raw bytes before comparing a current canonical hash", async (t) => {
  const { hub, file } = await fixture(t, { quietMs: 30, maxWaitMs: 200 });
  const initial = await hub.open(id, principal, { clientId: "tab" });
  const raw = content("abc\nexternal append\n");
  await writeFile(file, raw);
  const { createHash } = await import("node:crypto"),
    currentHash = "sha256:" + createHash("sha256").update(raw).digest("hex");
  await hub.beforeLegacyWrite(id, currentHash);
  assert.equal((await hub.read(id)).body, "abc\nexternal append\n");
  await assert.rejects(
    hub.beforeLegacyWrite(id, initial.contentHash),
    (error) => error.code === "precondition_failed",
  );
});
