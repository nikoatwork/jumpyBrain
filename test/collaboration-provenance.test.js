import assert from "node:assert/strict";
import test from "node:test";
import {
  SourceModel,
  applySourceSplices,
  composeCausalSourceHistory,
  composeSourceSplices,
  operationSplices,
  rawSourceDifferences,
  rebaseSourcePair,
  transformSourcePosition,
} from "../dist/core/collaboration/index.js";
const publicHistory = (model, from = 0) =>
  model.changesSince(from).map((operation) => ({
    actor: operation.actor,
    operationId: operation.operationId,
    revision: operation.revision,
    splices: operationSplices(operation).map(
      ({ start, deleteCount, insert, ambiguous }) => ({
        start,
        deleteCount,
        insert,
        ...(ambiguous ? { ambiguous } : {}),
      }),
    ),
    ...(operation.inverseOf ? { inverseOf: operation.inverseOf } : {}),
  }));
test("causal projection accepts held edits across a peer's proven replacement and Undo", () => {
  const base = "aaaa",
    model = new SourceModel(base, { epoch: "causal" });
  model.apply({
    actor: "peer",
    operationId: "replace",
    epoch: model.epoch,
    baseRevision: 0,
    start: 0,
    deleteCount: 1,
    insert: "X",
  });
  model.undo("peer", "undo");
  const remote = composeCausalSourceHistory(base, publicHistory(model));
  assert.deepEqual(remote, []);
  const local = [{ start: 0, deleteCount: 1, insert: "" }],
    pair = rebaseSourcePair(base, local, remote);
  assert.equal(applySourceSplices(model.body, pair.local), "aaa");
  assert.equal(transformSourcePosition(2, remote), 2);
});
test("causal projection commutes a surviving peer insertion and restores source anchors", () => {
  const model = new SourceModel("a!", { epoch: "commute" });
  model.apply({
    actor: "peer",
    operationId: "replace",
    epoch: model.epoch,
    baseRevision: 0,
    start: 0,
    deleteCount: 1,
    insert: "LONG",
  });
  model.apply({
    actor: "other",
    operationId: "keep",
    epoch: model.epoch,
    baseRevision: 1,
    start: 4,
    deleteCount: 0,
    insert: "X",
  });
  model.undo("peer", "undo");
  const remote = composeCausalSourceHistory("a!", publicHistory(model));
  assert.deepEqual(remote, [{ start: 1, deleteCount: 0, insert: "X" }]);
  assert.equal(transformSourcePosition(1, remote), 2);
  assert.equal(applySourceSplices("a!", remote), "aX!");
});
test("causal history never cancels equal bytes without a proven inverse receipt", () => {
  const same = [
    {
      actor: "peer",
      operationId: "same",
      revision: 1,
      splices: [{ start: 0, deleteCount: 1, insert: "a" }],
    },
  ];
  assert.deepEqual(composeCausalSourceHistory("aaaa", same), same[0].splices);
  const ordinary = [
    {
      actor: "peer",
      operationId: "one",
      revision: 1,
      splices: [{ start: 0, deleteCount: 1, insert: "X" }],
    },
    {
      actor: "peer",
      operationId: "two",
      revision: 2,
      splices: [{ start: 0, deleteCount: 1, insert: "a" }],
    },
  ];
  assert.deepEqual(composeCausalSourceHistory("aaaa", ordinary), [
    { start: 0, deleteCount: 1, insert: "a" },
  ]);
  assert.throws(
    () =>
      composeCausalSourceHistory("aaaa", [
        ordinary[0],
        {
          ...ordinary[1],
          splices: [{ start: 0, deleteCount: 1, insert: "Y" }],
          inverseOf: { actor: "peer", operationId: "one", revision: 1 },
        },
      ]),
    (error) => error.code === "history_expired",
  );
  assert.throws(
    () =>
      composeCausalSourceHistory("aaaa", [
        { ...same[0], revision: 2 },
        { ...same[0], revision: 4 },
      ]),
    (error) => error.code === "history_expired",
  );
  assert.deepEqual(
    composeCausalSourceHistory("Xaaa", [
      {
        ...ordinary[1],
        inverseOf: { actor: "peer", operationId: "one", revision: 1 },
      },
    ]),
    [{ start: 0, deleteCount: 1, insert: "a" }],
  );
});

test("composing actual repeated-source deletions preserves the selected occurrences", () => {
  assert.deepEqual(
    composeSourceSplices("aaaa", [[{ start: 0, deleteCount: 1, insert: "" }]]),
    [{ start: 0, deleteCount: 1, insert: "" }],
  );
  assert.deepEqual(
    composeSourceSplices("aaaa", [
      [{ start: 0, deleteCount: 1, insert: "" }],
      [{ start: 2, deleteCount: 1, insert: "" }],
    ]),
    [
      { start: 0, deleteCount: 1, insert: "" },
      { start: 3, deleteCount: 1, insert: "" },
    ],
  );
});
test("composition edits inserted source and retains equal-byte original replacement provenance", () => {
  assert.deepEqual(
    composeSourceSplices("aaaa", [
      [{ start: 1, deleteCount: 0, insert: "XY" }],
      [{ start: 1, deleteCount: 2, insert: "Z" }],
    ]),
    [{ start: 1, deleteCount: 0, insert: "Z" }],
  );
  assert.deepEqual(
    composeSourceSplices("aaaa", [
      [{ start: 0, deleteCount: 1, insert: "" }],
      [{ start: 0, deleteCount: 0, insert: "a" }],
    ]),
    [{ start: 0, deleteCount: 1, insert: "a" }],
  );
  assert.deepEqual(
    composeSourceSplices("aaaa", [
      [{ start: 1, deleteCount: 0, insert: "a" }],
      [{ start: 1, deleteCount: 1, insert: "" }],
    ]),
    [],
  );
});
test("actual repeated-source transactions rebase both branches without retargeting carets", () => {
  const base = "aaaa",
    local = [{ start: 0, deleteCount: 1, insert: "" }],
    remote = [{ start: 2, deleteCount: 0, insert: "X" }],
    pair = rebaseSourcePair(base, local, remote);
  assert.deepEqual(pair.local, local);
  assert.deepEqual(pair.remote, [{ start: 1, deleteCount: 0, insert: "X" }]);
  assert.equal(
    applySourceSplices(applySourceSplices(base, remote), pair.local),
    "aXaa",
  );
  assert.equal(
    applySourceSplices(applySourceSplices(base, local), pair.remote),
    "aXaa",
  );
  const insertion = [{ start: 0, deleteCount: 0, insert: "a" }];
  assert.equal(transformSourcePosition(2, insertion), 3);
  assert.equal(transformSourcePosition(1, insertion), 2);
  assert.equal(transformSourcePosition(3, insertion), 4);
});
test("same-position paired inserts use canonical remote order and preserve identical payloads", () => {
  for (const [left, right] of [
    ["L", "R"],
    ["a", "a"],
  ]) {
    const local = [{ start: 1, deleteCount: 0, insert: left }],
      remote = [{ start: 1, deleteCount: 0, insert: right }],
      pair = rebaseSourcePair("aa", local, remote);
    assert.equal(pair.local[0].start, 1 + right.length);
    assert.equal(pair.remote[0].start, 1);
    assert.equal(
      applySourceSplices(applySourceSplices("aa", local), pair.remote),
      "a" + right + left + "a",
    );
  }
});
test("provenance composition has explicit UTF16, source, piece and work bounds", () => {
  assert.throws(
    () =>
      composeSourceSplices("😀a", [
        [{ start: 1, deleteCount: 0, insert: "x" }],
      ]),
    (error) => error.code === "invalid_base_range",
  );
  assert.throws(
    () =>
      composeSourceSplices(
        "a",
        [[{ start: 0, deleteCount: 0, insert: "long" }]],
        { maxBytes: 2 },
      ),
    (error) => error.code === "provenance_limit",
  );
  assert.throws(
    () =>
      composeSourceSplices(
        "aaa",
        [[{ start: 1, deleteCount: 0, insert: "x" }]],
        { maxPieces: 1 },
      ),
    (error) => error.code === "provenance_limit",
  );
  assert.throws(
    () =>
      composeSourceSplices(
        "aaa",
        [[{ start: 1, deleteCount: 0, insert: "x" }]],
        { maxWork: 1 },
      ),
    (error) => error.code === "provenance_limit",
  );
  assert.throws(
    () =>
      rebaseSourcePair(
        "aaaa",
        [{ start: 0, deleteCount: 2, insert: "L" }],
        [{ start: 1, deleteCount: 2, insert: "R" }],
      ),
    (error) => error.code === "overlapping_edit",
  );
});
test("byte-identical explicit edits remain logical revisions with actual position history", () => {
  const model = new SourceModel("aaaa", { epoch: "provenance" });
  model.apply({
    actor: "human",
    operationId: "same",
    epoch: model.epoch,
    baseRevision: 0,
    start: 0,
    deleteCount: 1,
    insert: "a",
  });
  assert.equal(model.body, "aaaa");
  assert.equal(model.revision, 1);
  assert.deepEqual(operationSplices(model.changesSince(0)[0]), [
    { start: 0, deleteCount: 1, insert: "a", removed: "a" },
  ]);
  model.undo("human", "undo");
  model.redo("human", "redo");
  assert.equal(model.body, "aaaa");
  assert.equal(model.revision, 3);
  assert.equal(model.changesSince(0).length, 3);
  const detached = model.changesSince(0);
  detached[0].insert = "mutated";
  assert.equal(model.changesSince(0)[0].insert, "a");
  assert.throws(
    () => model.changesSince(3, 1),
    (error) => error.code === "invalid_revision",
  );
  model.checkpoint("metadata", "title");
  assert.equal(model.revision, 4);
  assert.deepEqual(operationSplices(model.changesSince(3)[0]), []);
  const unchanged = model.applyBatch({
    actor: "human",
    operationId: "empty",
    epoch: model.epoch,
    baseRevision: 4,
    operations: [],
  });
  assert.equal(unchanged.unchanged, true);
  assert.equal(model.revision, 4);
  assert.deepEqual(model.changesSince(4), []);
});
test("logical equal-byte replacements still protect their actual source from stale overlap", () => {
  const model = new SourceModel("aaaa", { epoch: "logical-overlap" });
  model.apply({
    actor: "human",
    operationId: "same",
    epoch: model.epoch,
    baseRevision: 0,
    start: 0,
    deleteCount: 1,
    insert: "a",
  });
  assert.throws(
    () =>
      model.apply({
        actor: "peer",
        operationId: "wrong",
        epoch: model.epoch,
        baseRevision: 0,
        start: 0,
        deleteCount: 1,
        insert: "",
      }),
    (error) => error.code === "overlapping_edit",
  );
  model.apply({
    actor: "peer",
    operationId: "middle",
    epoch: model.epoch,
    baseRevision: 0,
    start: 2,
    deleteCount: 0,
    insert: "X",
  });
  model.undo("human", "undo");
  assert.equal(model.body, "aaXaa");
  model.redo("human", "redo");
  assert.equal(model.body, "aaXaa");
});
test("seeded composition agrees with an independent per-character origin oracle", () => {
  let seed = 35171;
  const random = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 2 ** 32;
  };
  for (let sample = 0; sample < 1000; sample++) {
    const base = "aaaaabbbbb",
      cells = Array.from(base, (text, origin) => ({ text, origin })),
      transactions = [];
    for (let step = 0; step < 12; step++) {
      const start = Math.floor(random() * (cells.length + 1)),
        count = Math.floor(random() * Math.min(4, cells.length - start + 1)),
        insert = ["", "a", "bb", "Xa"][Math.floor(random() * 4)];
      transactions.push([{ start, deleteCount: count, insert }]);
      cells.splice(
        start,
        count,
        ...Array.from(insert, (text) => ({ text, origin: null })),
      );
    }
    const expected = [];
    let cursor = 0,
      insert = "";
    for (const cell of cells) {
      if (cell.origin === null) insert += cell.text;
      else {
        if (cell.origin > cursor || insert)
          expected.push({
            start: cursor,
            deleteCount: cell.origin - cursor,
            insert,
          });
        cursor = cell.origin + 1;
        insert = "";
      }
    }
    if (cursor < base.length || insert)
      expected.push({
        start: cursor,
        deleteCount: base.length - cursor,
        insert,
      });
    const actual = composeSourceSplices(base, transactions);
    assert.deepEqual(actual, expected, `seed35171 sample${sample}`);
    assert.equal(
      applySourceSplices(base, actual),
      cells.map((cell) => cell.text).join(""),
    );
  }
});
test("raw repeated insertions and deletions invalidate uncertain source origins", () => {
  for (const [before, after] of [
    ["aaaa", "aaaaa"],
    ["aaaa", "aaa"],
    ["abab", "ababab"],
    ["ababa", "babab"],
    ["🙂🙂", "🙂🙂🙂"],
  ]) {
    const operations = rawSourceDifferences(before, after);
    assert.equal(applySourceSplices(before, operations), after);
    assert.ok(operations.some((operation) => operation.ambiguous));
    assert.equal(operations[0].start, 0);
    assert.equal(
      operations.at(-1).start + operations.at(-1).deleteCount,
      before.length,
    );
    assert.throws(
      () => transformSourcePosition(0, operations),
      (error) => error.code === "ambiguous_source",
    );
    assert.throws(
      () => transformSourcePosition(before.includes("🙂") ? 2 : 1, operations),
      (error) => error.code === "ambiguous_source",
    );
    assert.equal(
      transformSourcePosition(before.length, operations),
      after.length,
    );
    assert.equal(transformSourcePosition(0, operations, "left"), 0);
    assert.throws(
      () => transformSourcePosition(before.length, operations, "left"),
      (error) => error.code === "ambiguous_source",
    );
  }
});
test("raw ambiguity remains local to repeated paragraphs and preserves unique outside anchors", () => {
  const before = "head\nsame\nsame\ntail\n",
    after = "head\nsame\nsame\nsame\ntail\n",
    operations = rawSourceDifferences(before, after);
  assert.equal(applySourceSplices(before, operations), after);
  assert.equal(transformSourcePosition(2, operations), 2);
  assert.equal(
    transformSourcePosition(before.indexOf("tail") + 2, operations),
    after.indexOf("tail") + 2,
  );
  assert.throws(
    () => transformSourcePosition(before.indexOf("same") + 2, operations),
    (error) => error.code === "ambiguous_source",
  );
});
test("raw newline ambiguity preserves a provably ordered append at old EOF", () => {
  const before = "unique\n",
    after = "unique\n\n",
    operations = rawSourceDifferences(before, after),
    model = new SourceModel(before, { epoch: "raw-eof" });
  model.applyBatch({
    actor: "external",
    operationId: "raw",
    epoch: model.epoch,
    baseRevision: 0,
    operations,
  });
  model.apply({
    actor: "human",
    operationId: "append",
    epoch: model.epoch,
    baseRevision: 0,
    start: before.length,
    deleteCount: 0,
    insert: "LOCAL",
  });
  assert.equal(model.body, after + "LOCAL");
  assert.equal(
    transformSourcePosition(before.length, operations),
    after.length,
  );
  assert.throws(
    () =>
      model.apply({
        actor: "human",
        operationId: "uncertain",
        epoch: model.epoch,
        baseRevision: 0,
        start: before.length - 1,
        deleteCount: 0,
        insert: "X",
      }),
    (error) => error.code === "ambiguous_source",
  );
});
test("raw unique appends stay granular and preserve disjoint earlier edits", () => {
  const before = "first\nsecond",
    after = before + "\nagent",
    operations = rawSourceDifferences(before, after);
  assert.deepEqual(operations, [
    { start: before.length, deleteCount: 0, insert: "\nagent" },
  ]);
  const model = new SourceModel(before, { epoch: "raw-unique" });
  model.applyBatch({
    actor: "external",
    operationId: "raw",
    epoch: model.epoch,
    baseRevision: 0,
    operations,
  });
  model.apply({
    actor: "human",
    operationId: "first",
    epoch: model.epoch,
    baseRevision: 0,
    start: 0,
    deleteCount: 5,
    insert: "FIRST",
  });
  assert.equal(model.body, "FIRST\nsecond\nagent");
});
test("raw ambiguity survives model, composition, causal history and paired rebasing", () => {
  const base = "L:aaaa:R",
    model = new SourceModel(base, { epoch: "raw-projection" }),
    operations = rawSourceDifferences(base, "L:aaaaa:R");
  model.applyBatch({
    actor: "external",
    operationId: "raw",
    epoch: model.epoch,
    baseRevision: 0,
    operations,
  });
  assert.equal(operationSplices(model.history[0])[0].ambiguous, true);
  assert.throws(
    () => model.transformPosition(2, 0),
    (error) => error.code === "ambiguous_source",
  );
  assert.throws(
    () =>
      model.apply({
        actor: "human",
        operationId: "inside",
        epoch: model.epoch,
        baseRevision: 0,
        start: 2,
        deleteCount: 0,
        insert: "X",
      }),
    (error) => error.code === "ambiguous_source",
  );
  for (const remote of [
    composeSourceSplices(base, [operations]),
    composeCausalSourceHistory(base, publicHistory(model)),
  ]) {
    assert.equal(remote[0].ambiguous, true);
    assert.throws(
      () =>
        rebaseSourcePair(
          base,
          [{ start: 2, deleteCount: 0, insert: "X" }],
          remote,
        ),
      (error) => error.code === "ambiguous_source",
    );
    const pair = rebaseSourcePair(
      base,
      [{ start: 0, deleteCount: 1, insert: "l" }],
      remote,
    );
    assert.equal(pair.remote[0].ambiguous, true);
    assert.equal(applySourceSplices(model.body, pair.local), "l:aaaaa:R");
  }
});
test("seeded raw alignments reconstruct exact observed bytes under bounded conservative envelopes", () => {
  let seed = 99151;
  const random = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 2 ** 32;
  };
  const alphabet = ["a", "b", "\n", "🙂"];
  for (let sample = 0; sample < 2000; sample++) {
    const text = () =>
      Array.from(
        { length: Math.floor(random() * 20) },
        () => alphabet[Math.floor(random() * alphabet.length)],
      ).join("");
    const before = text(),
      after = text();
    assert.equal(
      applySourceSplices(before, rawSourceDifferences(before, after)),
      after,
      `seed99151 sample${sample}`,
    );
  }
});
