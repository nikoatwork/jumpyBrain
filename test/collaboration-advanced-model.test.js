import assert from "node:assert/strict";
import test from "node:test";
import * as core from "../dist/core/collaboration/index.js";

const edit = (
  model,
  actor,
  id,
  start,
  deleteCount,
  insert,
  baseRevision = model.revision,
) =>
  model.apply({
    actor,
    operationId: id,
    epoch: model.epoch,
    baseRevision,
    start,
    deleteCount,
    insert,
  });
test("selective repeated replacement Undo/Redo restores exact user intent", () => {
  const model = new core.SourceModel("a", { epoch: "undo" });
  edit(model, "human", "upper", 0, 1, "A");
  edit(model, "human", "second", 0, 1, "B");
  model.undo("human", "undo-second");
  assert.equal(model.body, "A");
  model.undo("human", "undo-upper");
  assert.equal(model.body, "a");
  model.redo("human", "redo-upper");
  assert.equal(model.body, "A");
  model.redo("human", "redo-second");
  assert.equal(model.body, "B");
  model.undo("human", "undo-redo-second");
  model.undo("human", "undo-redo-upper");
  assert.equal(model.body, "a");
});
test("selective undo commutes verified inverse pairs around another actor's text", () => {
  const model = new core.SourceModel("a!", { epoch: "undo" });
  edit(model, "human", "first", 0, 1, "A");
  edit(model, "human", "second", 0, 1, "LONG");
  edit(model, "agent", "keep", 4, 0, "kept");
  model.undo("human", "u2");
  assert.equal(model.body, "Akept!");
  model.undo("human", "u1");
  assert.equal(model.body, "akept!");
  model.redo("human", "r1");
  model.redo("human", "r2");
  assert.equal(model.body, "LONGkept!");
});
test("noncontiguous changes produce exact granular splices and atomically preserve a peer's middle edit", () => {
  assert.equal(typeof core.sourceDifferences, "function");
  const base = "alpha\nmiddle\nomega\n",
    local = "ALPHA\nmiddle\nOMEGA\n",
    remote = "alpha\nMIDDLE\nomega\n";
  const operations = core.sourceDifferences(base, local);
  assert.ok(operations.length >= 2);
  assert.equal(core.applySourceSplices(base, operations), local);
  const model = new core.SourceModel(base, { epoch: "batch" });
  edit(model, "peer", "middle", 6, 6, "MIDDLE");
  const result = model.applyBatch({
    actor: "human",
    operationId: "edges",
    epoch: model.epoch,
    baseRevision: 0,
    operations,
  });
  assert.equal(model.body, "ALPHA\nMIDDLE\nOMEGA\n");
  assert.equal(model.revision, 2);
  assert.equal(result.operation.operationId, "edges");
  model.undo("human", "undo-edges");
  assert.equal(model.body, remote);
  model.redo("human", "redo-edges");
  assert.equal(model.body, "ALPHA\nMIDDLE\nOMEGA\n");
});
test("typing and repeated backspace undo/redo preserve the other actor's suffix exactly", () => {
  const model = new core.SourceModel("|peer", {
    epoch: "history",
    historyLimit: 512,
  });
  let token = "";
  const values = [];
  for (let index = 0; index < 32; index++) {
    const next =
      index % 3 === 0
        ? "🧠" + index
        : index % 3 === 1
          ? "changed-" + index
          : "";
    values.push(token);
    edit(model, "human", "h" + index, 0, token.length, next);
    token = next;
    if (index % 4 === 0)
      edit(model, "peer", "p" + index, model.body.length, 0, "!");
    if (index % 7 === 0) model.checkpoint("metadata", "m" + index);
  }
  const suffix = "|peer" + "!".repeat(8),
    final = token;
  for (let index = values.length - 1; index >= 0; index--) {
    model.undo("human", "u" + index);
    assert.equal(model.body, values[index] + suffix);
  }
  for (let index = 0; index < values.length; index++) {
    model.redo("human", "r" + index);
    const expected = index === values.length - 1 ? final : values[index + 1];
    assert.equal(model.body, expected + suffix);
  }
  const backspace = new core.SourceModel("abcd!", { epoch: "backspace" });
  for (let index = 3; index >= 0; index--)
    edit(backspace, "human", "b" + index, index, 1, "");
  for (let index = 0; index < 4; index++) {
    backspace.undo("human", "ub" + index);
    assert.equal(backspace.body, "abcd".slice(0, index + 1) + "!");
  }
  for (let index = 3; index >= 0; index--) {
    backspace.redo("human", "rb" + index);
    assert.equal(backspace.body, "abcd".slice(0, index) + "!");
  }
});
test("identical text from unverified other-actor replacements is never treated as an inverse", () => {
  const model = new core.SourceModel("a", { epoch: "intent" });
  edit(model, "human", "h", 0, 1, "A");
  edit(model, "peer", "p1", 0, 1, "B");
  edit(model, "peer", "p2", 0, 1, "A");
  const revision = model.revision;
  assert.throws(
    () => model.undo("human", "u"),
    (error) => error.code === "overlapping_edit",
  );
  assert.equal(model.body, "A");
  assert.equal(model.revision, revision);
});
test("batch rejection is atomic, batch receipts are canonical, and one undo covers every splice", () => {
  const base = "alpha\nmiddle\nomega\n",
    model = new core.SourceModel(base, { epoch: "atomic" });
  edit(model, "peer", "p", 6, 6, "MIDDLE");
  const body = model.body,
    revision = model.revision;
  const identity = {
    actor: "human",
    operationId: "batch",
    epoch: model.epoch,
    baseRevision: 0,
  };
  assert.throws(
    () =>
      model.applyBatch({
        ...identity,
        rejectOverlap: true,
        operations: [
          { start: 0, deleteCount: 5, insert: "ALPHA" },
          { start: 6, deleteCount: 6, insert: "wrong" },
        ],
      }),
    (error) => error.code === "overlapping_edit",
  );
  assert.equal(model.body, body);
  assert.equal(model.revision, revision);
  const operations = core.sourceDifferences(base, "ALPHA\nmiddle\nOMEGA\n"),
    result = model.applyBatch({ ...identity, operations });
  assert.equal(model.revision, revision + 1);
  assert.equal(model.undoStacks.get("human").length, 1);
  assert.equal(
    model.applyBatch({
      ...identity,
      operations: operations.map((operation) => ({
        insert: operation.insert,
        deleteCount: operation.deleteCount,
        start: operation.start,
      })),
    }).duplicate,
    true,
  );
  assert.equal(model.revision, revision + 1);
  assert.equal(result.operation.operations.length, operations.length);
  model.undo("human", "undo");
  assert.equal(model.body, body);
  model.redo("human", "redo");
  assert.equal(model.body, "ALPHA\nMIDDLE\nOMEGA\n");
});
test("source positions follow verified inverse pairs and reject removed interiors or stale bases", () => {
  const model = new core.SourceModel("a!", { epoch: "position" });
  edit(model, "human", "a", 0, 1, "LONG");
  const base = model.revision;
  edit(model, "human", "b", 0, 4, "X");
  model.undo("human", "undo-b");
  assert.equal(model.transformPosition(2, base), 2);
  model.undo("human", "undo-a");
  assert.throws(
    () => model.transformPosition(2, base),
    (error) => error.code === "position_deleted",
  );
  assert.throws(
    () => model.transformPosition(0, 999),
    (error) => error.code === "invalid_revision",
  );
  const operations = [{ start: 1, deleteCount: 0, insert: "🧠" }];
  assert.equal(core.transformSourcePosition(1, operations, "left"), 1);
  assert.equal(core.transformSourcePosition(1, operations, "right"), 3);
});
test("seeded Unicode granular diffs reconstruct source without splitting codepoints", () => {
  let seed = 12981;
  const random = () => {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      return (seed >>> 0) / 2 ** 32;
    },
    alphabet = ["a", "b", "c", "\n", "😀", "🧠"];
  for (let sample = 0; sample < 5000; sample++) {
    const text = () =>
        Array.from(
          { length: Math.floor(random() * 24) },
          () => alphabet[Math.floor(random() * alphabet.length)],
        ).join(""),
      before = text(),
      after = text(),
      operations = core.sourceDifferences(before, after);
    assert.equal(
      core.applySourceSplices(before, operations),
      after,
      `seed12981 sample${sample}`,
    );
  }
  assert.throws(
    () => core.sourceDifferences("abcdef", "UVWXYZ", { maxDistance: 1 }),
    (error) => error.code === "diff_limit",
  );
  assert.throws(
    () => core.sourceDifferences("abc!def", "Abc!deF", { maxOperations: 1 }),
    (error) => error.code === "diff_limit",
  );
});
test("repeated multi-splice undo commutes a peer's middle replacement exactly", () => {
  const model = new core.SourceModel("a|b|c", { epoch: "batch-history" });
  model.applyBatch({
    actor: "human",
    operationId: "one",
    epoch: model.epoch,
    baseRevision: model.revision,
    operations: core.sourceDifferences(model.body, "AA|b|CCC"),
  });
  model.applyBatch({
    actor: "human",
    operationId: "two",
    epoch: model.epoch,
    baseRevision: model.revision,
    operations: core.sourceDifferences(model.body, "X|b|Y"),
  });
  edit(model, "peer", "middle", 2, 1, "B");
  model.undo("human", "u2");
  assert.equal(model.body, "AA|B|CCC");
  model.undo("human", "u1");
  assert.equal(model.body, "a|B|c");
  model.redo("human", "r1");
  assert.equal(model.body, "AA|B|CCC");
  model.redo("human", "r2");
  assert.equal(model.body, "X|B|Y");
});
test("a stream in unchanged middle source survives independent edge batches", () => {
  const base = "first\nmiddle\nlast\n",
    model = new core.SourceModel(base, { epoch: "stream-batch" });
  model.startStream("agent", "s", base.indexOf("middle") + 3, 0);
  model.applyBatch({
    actor: "human",
    operationId: "edges",
    epoch: model.epoch,
    baseRevision: 0,
    operations: core.sourceDifferences(base, "New first\nmiddle\nThe last\n"),
  });
  assert.equal(model.streamStatus("agent", "s").state, "active");
  model.chunk("agent", "s", 0, "X");
  assert.equal(model.body, "New first\nmidXdle\nThe last\n");
});
test("Undo splits owned text around an interior peer insertion and Redo restores only that text", () => {
  const model = new core.SourceModel("!", { epoch: "owned" });
  edit(model, "human", "insert", 0, 0, "abcd");
  edit(model, "peer", "inside", 2, 0, "PEER");
  model.undo("human", "undo");
  assert.equal(model.body, "PEER!");
  model.redo("human", "redo");
  assert.equal(model.body, "abPEERcd!");
  model.undo("human", "undo-again");
  assert.equal(model.body, "PEER!");
  edit(model, "reader", "old-base", 0, 1, "X", 0);
  assert.equal(
    model.body,
    "PEERX",
    "Pending base edits preserve the independent peer insertion after inverse-pair reduction",
  );
});
test("Undo and Redo honor another actor's interior deletions and replacements", () => {
  const deletion = new core.SourceModel("!", { epoch: "delete" });
  edit(deletion, "human", "insert", 0, 0, "abcd");
  edit(deletion, "peer", "remove-middle", 1, 2, "");
  deletion.undo("human", "undo");
  assert.equal(deletion.body, "!");
  deletion.redo("human", "redo");
  assert.equal(deletion.body, "ad!");
  const replacement = new core.SourceModel("!", { epoch: "replace" });
  edit(replacement, "human", "insert", 0, 0, "abcd");
  edit(replacement, "peer", "replace-middle", 1, 2, "PEER");
  replacement.undo("human", "undo");
  assert.equal(replacement.body, "PEER!");
  replacement.redo("human", "redo");
  assert.equal(replacement.body, "aPEERd!");
  const ambiguous = new core.SourceModel("old!", { epoch: "ambiguous" });
  edit(ambiguous, "human", "replace", 0, 3, "abcd");
  edit(ambiguous, "peer", "replace-middle", 1, 2, "PEER");
  assert.throws(
    () => ambiguous.undo("human", "undo"),
    (error) => error.code === "overlapping_edit",
  );
  assert.equal(ambiguous.body, "aPEERd!");
});
test("selective inverse boundary bias retains prefix and suffix peers in source order", () => {
  const model = new core.SourceModel("old!", { epoch: "boundaries" });
  edit(model, "human", "replace", 0, 3, "abc");
  edit(model, "left", "prefix", 0, 0, "LEFT");
  edit(model, "right", "suffix", 7, 0, "RIGHT");
  model.undo("human", "undo");
  assert.equal(model.body, "LEFToldRIGHT!");
  model.redo("human", "redo");
  assert.equal(model.body, "LEFTabcRIGHT!");
  const clipped = new core.SourceModel("uv", { epoch: "clipped" });
  edit(clipped, "human", "insert", 1, 0, "ABC");
  edit(clipped, "peer", "delete-prefix", 0, 2, "");
  clipped.undo("human", "undo");
  assert.equal(clipped.body, "v");
  edit(clipped, "pending", "v", 1, 1, "V", 0);
  assert.equal(clipped.body, "V");
});
test("byte-identical selective restoration records a proven logical inverse without resurrecting deletions", () => {
  const model = new core.SourceModel("a", { epoch: "identity" });
  edit(model, "human", "double", 0, 1, "aa");
  edit(model, "peer", "remove-first", 0, 1, "");
  const revision = model.revision;
  model.undo("human", "undo");
  assert.equal(model.body, "a");
  assert.equal(model.revision, revision + 1);
  model.redo("human", "redo");
  assert.equal(model.body, "a");
  model.undo("human", "undo-again");
  assert.equal(model.body, "a");
});
test("nested replacements with interior peer text undo and redo in exact source order", () => {
  const model = new core.SourceModel("!", { epoch: "nested" });
  edit(model, "human", "first", 0, 0, "abcdef");
  edit(model, "human", "second", 2, 2, "CD2");
  edit(model, "peer", "inside", 3, 0, "P");
  assert.equal(model.body, "abCPD2ef!");
  model.undo("human", "u2");
  assert.equal(model.body, "abcdPef!");
  model.undo("human", "u1");
  assert.equal(model.body, "P!");
  model.redo("human", "r1");
  assert.equal(model.body, "abcdPef!");
  model.redo("human", "r2");
  assert.equal(model.body, "abCPD2ef!");
});
test("an inverse cannot resurrect a different actor's retired original source", () => {
  const model = new core.SourceModel("uv", { epoch: "retired" });
  edit(model, "human", "insert", 1, 0, "ABC");
  edit(model, "peer", "delete", 0, 2, "");
  model.undo("human", "undo-human");
  assert.equal(model.body, "v");
  const revision = model.revision;
  assert.throws(
    () => model.undo("peer", "undo-peer"),
    (error) => error.code === "overlapping_edit",
  );
  assert.equal(model.body, "v");
  assert.equal(model.revision, revision);
});
test("expired inverse ancestry rejects Undo rather than resurrecting another actor's source", () => {
  const model = new core.SourceModel("uv", {
    epoch: "expired-ownership",
    historyLimit: 2,
  });
  edit(model, "human", "insert", 1, 0, "ABC");
  edit(model, "peer", "delete", 0, 2, "");
  model.undo("human", "undo-human");
  assert.equal(model.body, "v");
  const revision = model.revision;
  assert.throws(
    () => model.undo("peer", "undo-peer"),
    (error) => error.code === "history_expired",
  );
  assert.equal(model.body, "v");
  assert.equal(model.revision, revision);
});
test("seeded insertion-provenance oracle preserves every peer byte through selective undo and redo", () => {
  let seed = 543921;
  const random = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 2 ** 32;
  };
  for (let trial = 0; trial < 30; trial++) {
    const model = new core.SourceModel("|", {
        epoch: "provenance",
        historyLimit: 512,
      }),
      cells = [{ text: "|", id: "sentinel" }],
      human = [];
    for (let step = 0; step < 8; step++)
      for (const actor of ["human", "peer"]) {
        const position = Math.floor(random() * cells.length),
          id = actor + step,
          text = (actor === "human" ? "h" : "p") + step;
        edit(model, actor, id, position, 0, text);
        cells.splice(
          position,
          0,
          ...Array.from(text, (text) => ({ text, id })),
        );
        if (actor === "human") human.push(id);
      }
    const snapshots = [];
    for (let index = human.length - 1; index >= 0; index--) {
      snapshots.push(model.body);
      for (let cell = cells.length - 1; cell >= 0; cell--)
        if (cells[cell].id === human[index]) cells.splice(cell, 1);
      model.undo("human", "u" + index);
      assert.equal(
        model.body,
        cells.map((cell) => cell.text).join(""),
        `seed543921 trial${trial} undo${index}`,
      );
    }
    for (let index = 0; index < human.length; index++) {
      model.redo("human", "r" + index);
      assert.equal(
        model.body,
        snapshots[snapshots.length - 1 - index],
        `seed543921 trial${trial} redo${index}`,
      );
    }
  }
});
