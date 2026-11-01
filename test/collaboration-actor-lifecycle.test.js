import assert from "node:assert/strict";
import test from "node:test";
import { SourceModel } from "../dist/core/collaboration/index.js";
const edit = (
  model,
  actor,
  id,
  insert,
  start = model.body.length,
  deleteCount = 0,
  baseRevision = model.revision,
) => {
  const request = {
    actor,
    operationId: id,
    epoch: model.epoch,
    baseRevision,
    start,
    deleteCount,
    insert,
  };
  return { request, result: model.apply(request) };
};
const owners = (model) =>
  new Set([...model.undoStacks.keys(), ...model.redoStacks.keys()]);
const expired = (error) => error.code === "history_expired";

test("sequential fresh actors never exhaust admission and retained lifecycle metadata stays bounded", () => {
  const model = new SourceModel("|", { epoch: "churn", maxActors: 4 }),
    parts = [];
  edit(model, "browser", "initial", "H;");
  parts.push("H;");
  for (let index = 0; index < 300; index++) {
    model.setActiveActors(new Set(["browser"]));
    const token = `x${index};`;
    edit(model, `cli-${index}`, `e${index}`, token);
    parts.push(token);
    if (index % 32 === 0) {
      const token = `H${index};`;
      edit(model, "browser", `h${index}`, token);
      parts.push(token);
    }
    assert.ok(owners(model).size <= 4);
    assert.equal(model.historyOwners.size, owners(model).size);
    assert.ok(model.activeHistoryActors.size <= 4);
    assert.ok(model.retiredHistoryActors.size <= 128);
    assert.ok(model.history.length <= 128);
    assert.ok(model.receipts.size <= 128);
    assert.ok(model.retainedBytes <= model.maxHistoryBytes);
  }
  assert.equal(model.body, "|" + parts.join(""));
  const before = model.body,
    revision = model.revision;
  assert.throws(() => model.undo("cli-0", "expired"), expired);
  assert.equal(model.body, before);
  assert.equal(model.revision, revision);
  model.undo("browser", "undo-recent");
  parts.splice(parts.lastIndexOf("H288;"), 1);
  assert.equal(model.body, "|" + parts.join(""));
  assert.ok(
    !model.retiredHistoryActors.has("cli-0"),
    "Oldest retirement ID was bounded away, generic history-unavailable remains explicit",
  );
});
test("Undo and Redo share one owner budget and inactive histories retire before live owners", () => {
  const model = new SourceModel("|", { epoch: "redo-owner", maxActors: 2 });
  edit(model, "A", "a", "A");
  model.undo("A", "u-a");
  assert.ok(!model.undoStacks.has("A") && model.redoStacks.has("A"));
  edit(model, "B", "b", "B");
  model.setActiveActors(new Set(["A"]));
  edit(model, "C", "c", "C");
  assert.deepEqual([...owners(model)].sort(), ["A", "C"]);
  assert.throws(() => model.undo("B", "old-b"), expired);
  model.redo("A", "r-a");
  assert.equal(model.body, "|BCA");
  assert.equal(owners(model).size, 2);
});
test("all live histories fall back to bounded LRU retirement instead of rejecting a writer", () => {
  const model = new SourceModel("|", { epoch: "all-active", maxActors: 2 });
  edit(model, "A", "a", "A");
  edit(model, "B", "b", "B");
  model.setActiveActors(new Set(["A", "B"]));
  edit(model, "C", "c", "C");
  assert.equal(model.body, "|ABC");
  assert.deepEqual([...owners(model)].sort(), ["B", "C"]);
  assert.throws(() => model.undo("A", "expired-a"), expired);
});
test("invalid, overlapping, duplicate and no-op edits do not retire or refresh history owners", () => {
  const model = new SourceModel("a", { epoch: "non-admission", maxActors: 2 });
  const first = edit(model, "A", "a", "A", 0, 1);
  edit(model, "B", "b", "B");
  const order = [...model.historyOwners],
    history = structuredClone(model.history),
    body = model.body;
  assert.throws(
    () => edit(model, "C", "bad", "X", 999),
    (error) => error.code === "invalid_base_range",
  );
  assert.throws(
    () => edit(model, "C", "overlap", "X", 0, 1, 0),
    (error) => error.code === "overlapping_edit",
  );
  assert.equal(model.apply(first.request).duplicate, true);
  for (let index = 0; index < 300; index++)
    model.applyBatch({
      actor: `empty-${index}`,
      operationId: `n${index}`,
      epoch: model.epoch,
      baseRevision: model.revision,
      operations: [],
    });
  assert.deepEqual([...model.historyOwners], order);
  assert.deepEqual(model.history, history);
  assert.equal(model.body, body);
  assert.equal(model.retiredHistoryActors.size, 0);
  assert.ok(model.receipts.size <= 128);
  edit(model, "C", "c", "C");
  assert.throws(() => model.undo("A", "expired-a"), expired);
});
test("evicted owners cannot regain Undo by replaying retained successful receipts", () => {
  const model = new SourceModel("|", { epoch: "receipt", maxActors: 2 }),
    first = edit(model, "A", "a", "A");
  model.undo("A", "undo-a");
  edit(model, "B", "b", "B");
  edit(model, "C", "c", "C");
  const body = model.body,
    revision = model.revision,
    history = structuredClone(model.history);
  assert.equal(model.apply(first.request).duplicate, true);
  assert.equal(model.undo("A", "undo-a").duplicate, true);
  assert.equal(model.body, body);
  assert.equal(model.revision, revision);
  assert.deepEqual(model.history, history);
  assert.ok(!owners(model).has("A"));
  assert.throws(() => model.redo("A", "new-redo"), expired);
});
test("retiring another owner's cache preserves canonical provenance and surviving selective Undo ancestry", () => {
  const model = new SourceModel("a", { epoch: "ancestry", maxActors: 2 });
  edit(model, "A", "one", "A", 0, 1);
  edit(model, "A", "two", "B", 0, 1);
  const peer = edit(model, "peer", "p", "!");
  model.setActiveActors(new Set(["A"]));
  edit(model, "new", "n", "?");
  assert.ok(!owners(model).has("peer"));
  assert.equal(model.apply(peer.request).duplicate, true);
  assert.equal(model.history.length, 4);
  assert.equal(model.changesSince(0).length, 4);
  model.undo("A", "u2");
  assert.equal(model.body, "A!?");
  model.undo("A", "u1");
  assert.equal(model.body, "a!?");
  model.redo("A", "r1");
  model.redo("A", "r2");
  assert.equal(model.body, "B!?");
});
test("forks isolate owner retirement and detached stable actors keep recent Undo absent pressure", () => {
  const model = new SourceModel("|", { epoch: "fork", maxActors: 2 });
  edit(model, "stable", "a", "A");
  edit(model, "peer", "b", "B");
  model.setActiveActors(new Set(["stable"]));
  const before = model.retainedBytes,
    candidate = model.fork();
  candidate.setActiveActors([]);
  edit(candidate, "new", "c", "C");
  assert.ok(owners(model).has("stable"));
  assert.ok(!owners(candidate).has("stable"));
  assert.equal(model.retiredHistoryActors.size, 0);
  assert.ok(candidate.retiredHistoryActors.has("stable"));
  assert.equal(model.retainedBytes, before);
  model.setActiveActors([]);
  model.undo("stable", "after-reconnect");
  assert.equal(model.body, "|B");
  const tiny = new SourceModel("|", {
    epoch: "byte-budget",
    maxActors: 2,
    maxHistoryBytes: 512,
  });
  for (let index = 0; index < 100; index++)
    edit(tiny, "long-" + index + "a".repeat(200), "id" + index, "x");
  tiny.setActiveActors(
    new Set(Array.from({ length: 10000 }, (_, i) => "unknown" + i)),
  );
  assert.ok(tiny.historyOwners.size <= 2);
  assert.ok(tiny.activeHistoryActors.size <= 2);
  assert.ok(tiny.retainedBytes <= 512);
  assert.ok(tiny.retiredHistoryActors.size <= 128);
  assert.throws(
    () => tiny.undo("long-0" + "a".repeat(200), "expired"),
    expired,
  );
  const tight = new SourceModel("|", {
    epoch: "hint-budget",
    maxHistoryBytes: 1021,
  });
  edit(tight, "a".repeat(100), "a", "x");
  const stacks = structuredClone(tight.undoStacks);
  tight.setActiveActors(new Set(["a".repeat(100)]));
  assert.ok(tight.retainedBytes <= 1021);
  assert.deepEqual(
    tight.undoStacks,
    stacks,
    "An advisory hint cannot retire Undo to make room for itself",
  );
});
