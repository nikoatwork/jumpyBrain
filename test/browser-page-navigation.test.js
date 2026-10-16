import assert from "node:assert/strict";
import test from "node:test";
import { createPageHistory } from "../dist/adapters/http-server/browser-page-navigation.js";

const page = (n, title = `Page ${n}`) => ({ id: `mem_a0000000-0000-4000-8000-${String(n).padStart(12, "0")}`, title });
function harness({ blocked = false, readOnly = false, values = new Map() } = {}) {
  let scope = "brain:a";
  const history = createPageHistory({ scope: () => scope, onChange() {}, storage: () => ({
    getItem(key) { if (blocked) throw Error("blocked"); return values.get(key) ?? null; },
    setItem(key, value) { if (blocked || readOnly) throw Error("blocked"); values.set(key, value); },
  }) });
  return { history, values, scope: (next) => { scope = next; } };
}

test("visits are unique, latest first, bounded, and independent of rename/save order", () => {
  const { history } = harness();
  for (let i = 1; i <= 40; i++) history.visit(page(i));
  assert.deepEqual(history.snapshot().recent.map((p) => p.id), Array.from({ length: 8 }, (_, i) => page(40 - i).id));
  history.visit(page(35)); history.rename(page(40, "Renamed"));
  assert.equal(history.snapshot().recent[0].id, page(35).id);
  assert.equal(history.snapshot().recent[1].title, "Renamed");
  history.visit({ id: "invalid", title: "Invalid" });
  assert.equal(history.snapshot().recent[0].id, page(35).id);
});

test("pins persist, stay out of Recent, track titles and return to history when unpinned", () => {
  const { history, values } = harness();
  history.visit(page(1)); history.visit(page(2)); history.toggle(page(1));
  assert.deepEqual(history.snapshot().pinned, [page(1)]);
  assert.deepEqual(history.snapshot().recent, [page(2)]);
  const restored = harness({ values }).history;
  restored.rename(page(1, "New title"));
  assert.equal(restored.snapshot().pinned[0].title, "New title");
  restored.toggle(page(1));
  assert.deepEqual(restored.snapshot().recent, [page(2), page(1, "New title")]);
  restored.remove(page(1).id);
  assert.deepEqual(restored.snapshot().recent, [page(2)]);
});

test("brain switches and disconnected state isolate history without destroying pins", () => {
  const h = harness();
  h.history.visit(page(1)); h.history.toggle(page(1));
  h.scope("brain:b"); assert.deepEqual(h.history.snapshot(), { pinned: [], recent: [] });
  h.history.visit(page(2));
  h.scope(null); h.history.visit(page(3));
  assert.deepEqual(h.history.snapshot(), { pinned: [], recent: [] });
  h.scope("brain:a"); assert.deepEqual(h.history.snapshot().pinned, [page(1)]);
  h.scope("brain:b"); assert.deepEqual(h.history.snapshot().recent, [page(2)]);
});

test("cross-tab mutations merge with stored visits; corrupt and cleared storage are safe", () => {
  const h = harness(), other = harness({ values: h.values });
  h.history.visit(page(1)); other.history.visit(page(2)); h.history.toggle(page(1));
  assert.deepEqual(h.history.snapshot().recent, [page(2)]);
  const key = "jumpybrain.pageNavigation.v1:brain:a";
  h.history.storageChanged({ key, newValue: JSON.stringify({ pinned: [page(2)], recent: [page(1)] }) });
  assert.deepEqual(h.history.snapshot().pinned, [page(2)]);
  h.history.storageChanged({ key: "another-brain", newValue: "bad" });
  assert.deepEqual(h.history.snapshot().pinned, [page(2)]);
  h.history.storageChanged({ key, newValue: "bad" });
  assert.deepEqual(h.history.snapshot(), { pinned: [], recent: [] });
  h.history.storageChanged({ key: null, newValue: null });
  assert.deepEqual(h.history.snapshot(), { pinned: [], recent: [] });
});

test("unavailable and read-only storage preserve in-tab visits and pins", () => {
  for (const options of [{ blocked: true }, { readOnly: true }]) {
    const { history } = harness(options);
    history.visit(page(1)); history.visit(page(2)); history.toggle(page(1));
    assert.deepEqual(history.snapshot(), { pinned: [page(1)], recent: [page(2)] });
  }
});
