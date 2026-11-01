import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { syncBuiltinESMExports } from "node:module";
import { initializeMemoryRoot } from "../dist/index.js";
import { createCollaborationHub } from "../dist/app/collaboration/index.js";
import { sourceDifferences } from "../dist/core/collaboration/index.js";
const id = "mem_12345678-1234-1234-1234-123456789abc",
  human = { id: "human", name: "Human", role: "writer" },
  peer = { id: "peer", name: "Peer", role: "writer" };
async function fixture(t) {
  const root = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "jb-batch-publication-")),
  );
  await initializeMemoryRoot(root);
  const file = path.join(root, "notes/live.md"),
    body = "alpha\nmiddle\nomega\n";
  await fs.writeFile(
    file,
    `---\nid: ${id}\ntype: note\ntitle: Batch\n---\n${body}`,
  );
  let publications = 0;
  const hub = createCollaborationHub({
    root,
    observeIntervalMs: 0,
    quietMs: 0,
    onWrite: () => {
      publications++;
    },
  });
  t.after(async () => {
    await hub.close();
    await fs.rm(root, { recursive: true, force: true });
  });
  return {
    hub,
    file,
    body,
    get publications() {
      return publications;
    },
  };
}
test("server edit batches publish once, preserve peer middle source, and undo atomically", async (t) => {
  const context = await fixture(t),
    { hub, file, body } = context,
    initial = await hub.open(id, human, { clientId: "human" }),
    events = [];
  hub.subscribe(id, (event) => events.push(event));
  await hub.dispatch(
    "edit",
    {
      documentId: id,
      clientId: "peer",
      epoch: initial.epoch,
      baseRevision: 0,
      operationId: "peer",
      start: 6,
      deleteCount: 6,
      insert: "MIDDLE",
    },
    peer,
  );
  const saved = await hub.dispatch(
    "edit",
    {
      documentId: id,
      clientId: "human",
      epoch: initial.epoch,
      baseRevision: 0,
      operationId: "edges",
      operations: sourceDifferences(body, "ALPHA\nmiddle\nOMEGA\n"),
    },
    human,
  );
  assert.equal(saved.body, "ALPHA\nMIDDLE\nOMEGA\n");
  assert.equal(saved.saved, true);
  assert.equal(saved.revision, 2);
  assert.equal(saved.operation.operationId, "edges");
  assert.ok(saved.operation.operations.length >= 2);
  assert.ok(
    saved.operation.operations.every((operation) => !("removed" in operation)),
  );
  assert.equal(context.publications, 2);
  assert.ok((await fs.readFile(file, "utf8")).endsWith(saved.body));
  const undo = await hub.dispatch(
    "undo",
    {
      documentId: id,
      clientId: "human",
      epoch: initial.epoch,
      operationId: "undo",
    },
    human,
  );
  assert.equal(undo.body, "alpha\nMIDDLE\nomega\n");
  assert.equal(undo.revision, 3);
  assert.equal(context.publications, 3);
  assert.equal(events.at(-1).contentHash, undo.contentHash);
});
test("failed canonical publication commits neither half of a batch nor its receipt", async (t) => {
  const { hub, file, body } = await fixture(t),
    initial = await hub.open(id, human, { clientId: "human" }),
    canonical = await fs.readFile(file, "utf8"),
    request = {
      documentId: id,
      clientId: "human",
      epoch: initial.epoch,
      baseRevision: 0,
      operationId: "retry",
      operations: sourceDifferences(body, "ALPHA\nmiddle\nOMEGA\n"),
    };
  const rename = fs.rename;
  t.mock.method(fs, "rename", async (...args) => {
    if (args[1] === file)
      throw Object.assign(new Error("Injected batch publication failure"), {
        code: "EIO",
      });
    return rename(...args);
  });
  syncBuiltinESMExports();
  t.after(() => {
    t.mock.restoreAll();
    syncBuiltinESMExports();
  });
  await assert.rejects(
    hub.dispatch("edit", request, human),
    (error) => error.code === "EIO",
  );
  assert.equal(await fs.readFile(file, "utf8"), canonical);
  assert.equal((await hub.read(id)).revision, 0);
  t.mock.restoreAll();
  syncBuiltinESMExports();
  const saved = await hub.dispatch("edit", request, human);
  assert.equal(saved.revision, 1);
  assert.equal(saved.body, "ALPHA\nmiddle\nOMEGA\n");
});
test("reviewed whole-note restore checks its exact hash inside serialized admission", async (t) => {
  const { hub, file } = await fixture(t),
    before = await hub.open(id, human, { clientId: "human" });
  await hub.dispatch(
    "title",
    {
      documentId: id,
      clientId: "peer",
      epoch: before.epoch,
      baseRevision: before.revision,
      title: "New saved metadata",
    },
    peer,
  );
  const current = await hub.read(id),
    canonical = await fs.readFile(file, "utf8"),
    request = {
      documentId: id,
      clientId: "human",
      epoch: current.epoch,
      baseRevision: current.revision,
      operationId: "reviewed",
      expectedContentHash: before.contentHash,
      operations: [
        {
          start: 0,
          deleteCount: current.body.length,
          insert: "Reviewed replacement\n",
        },
      ],
    };
  await assert.rejects(
    hub.dispatch("edit", request, human),
    (error) => error.code === "precondition_failed",
  );
  assert.equal(await fs.readFile(file, "utf8"), canonical);
  assert.equal((await hub.read(id)).revision, current.revision);
  const saved = await hub.dispatch(
    "edit",
    { ...request, expectedContentHash: current.contentHash },
    human,
  );
  assert.equal(saved.body, "Reviewed replacement\n");
  assert.equal(saved.title, "New saved metadata");
  assert.ok((await fs.readFile(file, "utf8")).endsWith(saved.body));
});
