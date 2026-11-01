import assert from "node:assert/strict";
import test from "node:test";
import {
  SourceModel,
  sourceDifference,
} from "../dist/core/collaboration/index.js";

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
const code = (expected) => (error) => error.code === expected;
test("source operations preserve structures, merge independent stale edits and protect overlap", () => {
  const model = new SourceModel(
    "# Heading\n\n- [ ] first\n- second\n\n| a | b |\n",
    { epoch: "one" },
  );
  edit(model, "human", "a", 2, 7, "Title");
  edit(model, "agent", "b", 22, 0, "nested\n", 0);
  assert.match(model.body, /^# Title/);
  assert.match(model.body, /nested/);
  assert.match(model.body, /\| a \| b \|/);
  assert.throws(
    () => edit(model, "other", "c", 2, 7, "different", 0),
    code("overlapping_edit"),
  );
  assert.throws(
    () => edit(model, "other", "d", 999, 1, "", 0),
    code("invalid_base_range"),
  );
});
test("duplicate publication and actor undo are idempotent and preserve other actors", () => {
  const model = new SourceModel("abc", { epoch: "one" });
  const first = edit(model, "human", "a", 1, 0, "H");
  edit(model, "agent", "b", 3, 0, "A");
  assert.equal(edit(model, "human", "a", 1, 0, "H", 0).duplicate, true);
  assert.equal(model.body, "aHbAc");
  assert.equal(model.revision, 2);
  assert.throws(
    () => edit(model, "human", "a", 1, 0, "X", 0),
    code("operation_identity_reused"),
  );
  model.undo("human", "undo");
  assert.equal(model.body, "abAc");
  assert.equal(model.undo("human", "undo").duplicate, true);
  assert.equal(model.body, "abAc");
  edit(model, "agent", "c", model.body.length, 0, "!");
  model.redo("human", "redo");
  assert.equal(model.body, "aHbAc!");
  assert.equal(model.redo("human", "redo").duplicate, true);
  assert.equal(model.body, "aHbAc!");
  assert.equal(first.operation.operationId, "a");
});
test("seeded concurrent source replacements match an independent base-offset oracle", () => {
  let seed = 0x5eed1234;
  const random = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 0x100000000;
  };
  const model = new SourceModel(
    "# Header\n\n- [ ] item\n\n```js\nsource();\n```\n\n| a | b |\n\n" +
      "text ".repeat(100),
    { epoch: "seeded" },
  );
  for (let round = 0; round < 100; round++) {
    const base = model.body,
      revision = model.revision;
    const requests = Array.from({ length: 4 }, (_, index) => ({
      actor: index % 2 ? "agent-" + index : "human-" + index,
      operationId: round + ":" + index,
      start: Math.floor((base.length * (index + 1)) / 5),
      deleteCount: 1,
      insert: `[${index}:${round}]`,
    }));
    const expected = requests
      .toSorted((a, b) => b.start - a.start)
      .reduce(
        (body, request) =>
          body.slice(0, request.start) +
          request.insert +
          body.slice(request.start + request.deleteCount),
        base,
      );
    const arrival = [...requests];
    for (let index = arrival.length - 1; index > 0; index--) {
      const other = Math.floor(random() * (index + 1));
      [arrival[index], arrival[other]] = [arrival[other], arrival[index]];
    }
    for (const request of arrival)
      edit(
        model,
        request.actor,
        request.operationId,
        request.start,
        request.deleteCount,
        request.insert,
        revision,
      );
    assert.equal(model.body, expected, `seed5eed1234 round${round}`);
    assert.ok(model.retainedBytes <= model.maxHistoryBytes);
  }
});
test("near-limit source models retain bounded history without silently accepting expired edits", () => {
  const model = new SourceModel("a".repeat(2 * 1024 * 1024 - 64), {
    epoch: "large",
    maxHistoryBytes: 8 * 1024 * 1024,
  });
  for (let index = 0; index < 12; index++)
    edit(model, "human", String(index), index, 1, index % 2 ? "b" : "c");
  assert.equal(model.body.length, 2 * 1024 * 1024 - 64);
  assert.ok(model.retainedBytes <= 8 * 1024 * 1024);
  assert.throws(
    () => edit(model, "agent", "expired", 100, 0, "x", 0),
    code("history_expired"),
  );
});
test("streamed chunks merge human text, reject gaps and stop after cancellation", () => {
  const model = new SourceModel("abc", { epoch: "one" });
  model.startStream("agent", "s", 1, 0);
  model.chunk("agent", "s", 0, "x");
  edit(model, "human", "h", 4, 0, "!");
  model.chunk("agent", "s", 1, "y");
  assert.equal(model.body, "axybc!");
  assert.equal(model.chunk("agent", "s", 1, "y").duplicate, true);
  assert.throws(() => model.chunk("agent", "s", 3, "z"), code("stream_gap"));
  model.cancelStream("agent", "s");
  assert.equal(model.streamStatus("agent", "s").state, "cancelled");
  assert.throws(
    () => model.chunk("agent", "s", 2, "z"),
    code("stream_inactive"),
  );
  model.startStream("agent", "empty", 0, model.revision);
  model.chunk("agent", "empty", 0, "");
  assert.equal(model.chunk("agent", "empty", 0, "").duplicate, true);
  model.finishStream("agent", "empty");
  assert.equal(model.finishStream("agent", "empty").state, "finished");
  assert.equal(model.cancelStream("agent", "empty").state, "finished");
  assert.throws(
    () => model.chunk("agent", "empty", 1, "late"),
    code("stream_inactive"),
  );
});
test("Unicode boundaries, expired history and epoch changes require reconciliation", () => {
  const model = new SourceModel("😀abc", {
    epoch: "one",
    maxHistoryBytes: 16,
    historyLimit: 2,
  });
  assert.throws(
    () => edit(model, "a", "bad", 1, 0, "x"),
    code("invalid_base_range"),
  );
  assert.throws(
    () => edit(model, "a", "surrogate", 2, 0, "\ud800"),
    code("invalid_patch"),
  );
  for (let i = 0; i < 8; i++)
    edit(model, "a", String(i), model.body.length, 0, "x");
  assert.ok(model.retainedBytes <= 16);
  assert.throws(
    () => edit(model, "b", "expired", 2, 0, "b", 0),
    code("history_expired"),
  );
  assert.throws(
    () =>
      model.apply({
        actor: "a",
        operationId: "wrong",
        epoch: "old",
        baseRevision: model.revision,
        start: 2,
        deleteCount: 0,
        insert: "x",
      }),
    code("epoch_changed"),
  );
  const before = "😀 x 😀",
    after = "😁 x 😁",
    difference = sourceDifference(before, after);
  const unicode = new SourceModel(before, { epoch: "u" });
  edit(
    unicode,
    "a",
    "u",
    difference.start,
    difference.deleteCount,
    difference.insert,
  );
  assert.equal(unicode.body, after);
});
