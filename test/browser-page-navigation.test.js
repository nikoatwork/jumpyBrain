import assert from "node:assert/strict";
import test from "node:test";
import { createPageHistory, sidebarPageAge } from "../dist/adapters/http-server/browser-page-navigation.js";

const page = (n, title = `Page ${n}`) => ({ id: `mem_a0000000-0000-4000-8000-${String(n).padStart(12, "0")}`, title });
function harness({ blocked = false, readOnly = false, values = new Map() } = {}) {
  let scope = "brain:a", writes = 0, changes = 0;
  const history = createPageHistory({ scope: () => scope, onChange() { changes++; }, storage: () => ({
    getItem(key) { if (blocked) throw Error("blocked"); return values.get(key) ?? null; },
    setItem(key, value) { if (blocked || readOnly) throw Error("blocked"); values.set(key, value); writes++; },
  }) });
  return { history, values, counts: () => ({ writes, changes }), scope: (next) => { scope = next; } };
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

test("unchanged renames skip persistence and notification but still observe newer stored history", () => {
  const h = harness();
  h.history.visit(page(1));
  const before = h.counts();
  h.history.rename(page(1));
  assert.deepEqual(h.counts(), before);
  const other = harness({ values: h.values });
  other.history.visit(page(2));
  h.history.rename(page(1));
  assert.deepEqual(h.counts(), { writes: before.writes, changes: before.changes + 1 });
  assert.deepEqual(h.history.snapshot().recent, [page(2), page(1)]);
  h.history.rename(page(1, "Renamed"));
  assert.deepEqual(h.counts(), { writes: before.writes + 1, changes: before.changes + 2 });
  assert.deepEqual(h.history.snapshot().recent, [page(2), page(1, "Renamed")]);
});

test("sidebar edit ages use compact units with exact tooltips", () => {
  const now = new Date(2026, 9, 25, 12);
  assert.equal(sidebarPageAge({ updatedAt: "2026-10-22" }, now).label, "3d");
  assert.equal(sidebarPageAge({ updatedAt: "2026-10-28" }, now).label, "in 3d");
  assert.equal(sidebarPageAge({ updatedAt: "2026-10-25" }, now).label, "Today");
  assert.equal(sidebarPageAge({ updatedAt: new Date(now.getTime() - 5 * 60000).toISOString() }, now).label, "5m");
  assert.equal(sidebarPageAge({ updatedAt: new Date(now.getTime() - 3 * 3600000).toISOString() }, now).label, "3h");
  assert.equal(sidebarPageAge({ updatedAt: new Date(now.getTime() + 2 * 60000).toISOString() }, now).label, "in 2m");
  assert.equal(sidebarPageAge({ updatedAt: new Date(now.getTime() - 20000).toISOString() }, now).label, "now");
  assert.equal(sidebarPageAge({}, now).label, "");
  assert.match(sidebarPageAge({ updatedAt: "2026-10-22" }, now).details, /^Last edited /);
  assert.equal(sidebarPageAge({}, now).details, "");
});

test("explicit attention due times label the sidebar row instead of the edit age", () => {
  const now = new Date(2026, 9, 25, 12);
  assert.equal(sidebarPageAge({ updatedAt: "2026-10-01", attentionAt: new Date(now.getTime() - 2 * 3600000).toISOString() }, now).label, "due 2h");
  assert.equal(sidebarPageAge({ attentionAt: new Date(now.getTime() - 20000).toISOString() }, now).label, "due now");
  assert.equal(sidebarPageAge({ attentionAt: new Date(now.getTime() + 10 * 60000).toISOString() }, now).label, "due in 10m");
  assert.equal(sidebarPageAge({ attentionAt: "2026-10-23" }, now).label, "due 2d");
  assert.equal(sidebarPageAge({ attentionAt: "2026-10-26" }, now).label, "due in 1d");
  assert.equal(sidebarPageAge({ attentionAt: "2026-10-25" }, now).label, "due today");
  assert.match(sidebarPageAge({ attentionAt: "2026-10-23" }, now).details, /^Due /);
});

test("invalid or absent attention times fall back to the edit age", () => {
  const now = new Date(2026, 9, 25, 12);
  assert.equal(sidebarPageAge({ attentionAt: "2026-02-30", updatedAt: "2026-10-22" }, now).label, "3d");
  assert.equal(sidebarPageAge({ attentionAt: "not a date", updatedAt: "2026-10-22" }, now).label, "3d");
  assert.match(sidebarPageAge({ attentionAt: "2026-02-30", updatedAt: "2026-10-22" }, now).details, /^Last edited /);
});

test("recency-derived attention times keep the edit age, not a due label", () => {
  const now = new Date(2026, 9, 25, 12);
  assert.equal(sidebarPageAge({ updatedAt: "2026-10-22", attentionAt: "2026-10-22" }, now).label, "3d");
  assert.match(sidebarPageAge({ updatedAt: "2026-10-22", attentionAt: "2026-10-22" }, now).details, /^Last edited /);
  assert.equal(sidebarPageAge({ createdAt: "2026-10-20", attentionAt: "2026-10-20" }, now).label, "", "creation recency still shows no edit age");
});
