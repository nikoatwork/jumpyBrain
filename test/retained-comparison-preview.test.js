import assert from "node:assert/strict";
import test from "node:test";
import { versionChanges, renderVersionChanges } from "../dist/adapters/http-server/document-version-diff.js";

test("version changes show only added or removed bullets instead of unchanged context", () => {
  const original = "# Todos\n\n- Existing\n", added = "# Todos\n\n- Existing\n- Added\n";
  assert.deepEqual(versionChanges(original, added).changes, [{ removed: "", added: "- Added\n" }]);
  assert.deepEqual(versionChanges(added, original).changes, [{ removed: "- Added\n", added: "" }]);
  assert.deepEqual(versionChanges("- Old\n- Keep\n", "- New\n- Keep\n").changes, [{ removed: "- Old\n", added: "- New\n" }]);
});

test("separated changed passages omit unchanged middle and preserve source spellings", () => {
  const saved = "Title\r\n\r\nOld 🐐\r\nUnchanged middle\r\nOld ending\r\n";
  const candidate = "Title\r\n\r\nNew 🐑\r\nUnchanged middle\r\nNew ending\r\n";
  const result = versionChanges(saved, candidate);
  assert.equal(result.equal, false); assert.equal(result.shortened, false); assert.equal(result.changes.length, 2);
  assert.deepEqual(result.changes[0], { removed: "Old 🐐\r\n", added: "New 🐑\r\n" });
  assert.doesNotMatch(JSON.stringify(result.changes), /Unchanged middle/);
  assert.equal(saved, "Title\r\n\r\nOld 🐐\r\nUnchanged middle\r\nOld ending\r\n");
});

test("equal, empty, blank-line and newline-only changes remain explicit", () => {
  assert.deepEqual(versionChanges("same", "same"), { equal: true, shortened: false, changes: [] });
  assert.equal(versionChanges("", "New 🐐").changes[0].added, "New 🐐");
  assert.equal(versionChanges("Old", "").changes[0].removed, "Old");
  assert.deepEqual(versionChanges("a\nb\n", "a\n\nb\n").changes.map(({ removed, added }) => ({ removed, added })), [{ removed: "", added: "\n" }]);
  assert.deepEqual(versionChanges("a\r\n", "a\n").changes.map(({ removed, added }) => ({ removed, added })), [{ removed: "a\r\n", added: "a\n" }]);
});

test("large or complex comparisons bound excerpts and retain whole Unicode pairs", () => {
  for (const [saved, candidate] of [["a".repeat(1_600_000), "b".repeat(1_600_000)], ["prefix" + "🐐".repeat(100_000) + "suffix", "prefix" + "🐑".repeat(100_000) + "suffix"], ["a\n".repeat(100), "b\n".repeat(100)]]) {
    const result = versionChanges(saved, candidate), text = result.changes.map(change => change.removed + change.added).join("");
    assert.equal(result.shortened, true); assert.ok(text.length < 3000); assert.ok(text.isWellFormed()); assert.match(text, /passage shortened/);
    assert.ok(text.split("\n").length < 60);
  }
});

test("many scattered changes and clipping boundaries stay bounded without splitting source characters", () => {
  const saved = Array.from({ length: 20 }, (_, i) => "old " + i + "\nunchanged " + i + "\n").join("");
  const candidate = saved.replaceAll("old", "new");
  const scattered = versionChanges(saved, candidate);
  assert.equal(scattered.shortened, true);
  assert.ok(scattered.changes.map(change => change.removed + change.added).join("\n").split("\n").length < 60);
  const clipped = versionChanges("a".repeat(599) + "🐐\r\n" + "c".repeat(200_000), "b".repeat(599) + "🐑\r\n" + "d".repeat(200_000));
  for (const change of clipped.changes) {
    assert.ok(change.removed.isWellFormed()); assert.ok(change.added.isWellFormed());
    assert.doesNotMatch(change.removed + change.added, /\r(?!\n)/);
  }
});

test("diff rendering uses inert text and readable labels, including equal and shortened cases", () => {
  class Element {
    constructor(tag) { this.tag = tag; this.children = []; this.textContent = ""; this.classList = { add() {} }; }
    append(...children) { this.children.push(...children); }
    replaceChildren() { this.children = []; }
    set innerHTML(_) { throw new Error("Content must never become HTML"); }
  }
  const document = { createElement: tag => new Element(tag) }, container = new Element("div");
  const text = node => node.textContent + node.children.map(text).join("\n");
  renderVersionChanges(document, container, "<img src=x>", "<script>alert(1)</script>");
  assert.match(text(container), /Removed/); assert.match(text(container), /Added/); assert.match(text(container), /<script>alert\(1\)<\/script>/);
  assert.equal(container.children[0].children[1].tag, "del"); assert.equal(container.children[0].children[3].tag, "ins");
  renderVersionChanges(document, container, "same", "same"); assert.equal(text(container).trim(), "No text differences.");
  renderVersionChanges(document, container, "a".repeat(200_000), "b".repeat(200_000)); assert.match(text(container), /Full versions remain available under More options/);
});
