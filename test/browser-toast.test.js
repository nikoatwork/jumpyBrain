import assert from "node:assert/strict";
import test from "node:test";
import { installToast } from "../dist/adapters/http-server/browser-toast.js";

function harness(t) {
  let now = 0, next = 0, scope = "first";
  const timers = new Map();
  t.mock.method(Date, "now", () => now);
  const nodes = Object.fromEntries(["app-toast", "toast-message", "toast-action", "toast-close"].map(id => {
    const element = new EventTarget();
    Object.assign(element, { hidden: true, textContent: "", dataset: {}, setAttribute(name, value) { this[name] = value; }, isConnected: true, focus() { doc.activeElement = element; } });
    return [id, element];
  }));
  const win = new EventTarget();
  Object.assign(win, {
    setTimeout(run, delay) { timers.set(++next, { run, at: now + delay }); return next; },
    clearTimeout(id) { timers.delete(id); }, queueMicrotask,
  });
  const outside = { isConnected: true, focus() { doc.activeElement = outside; } };
  const doc = new EventTarget();
  Object.assign(doc, { defaultView: win, activeElement: outside, getElementById: id => nodes[id] });
  const root = nodes["app-toast"], action = nodes["toast-action"];
  root.contains = value => Object.values(nodes).includes(value);
  const toast = installToast(doc, () => scope);
  function advance(ms) {
    now += ms;
    for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.run(); }
  }
  return { toast, root, action, doc, outside, nodes, timers, advance, scope(value) { scope = value; } };
}

test("confirmation expires, replacement owns its full deadline and dismissed Undo is released", t => {
  const h = harness(t);
  let calls = 0;
  h.toast.show("attention", "Snoozed", { action: { label: "Undo", run() { calls++; } } });
  h.advance(7_999); assert.equal(h.root.hidden, false);
  h.toast.show("draft", "Draft copied.");
  h.advance(1); assert.equal(h.root.hidden, false);
  h.action.dispatchEvent(new Event("click")); assert.equal(calls, 0);
  h.advance(3_999); assert.equal(h.root.hidden, true);
  assert.equal(h.nodes["toast-message"].textContent, "");
  assert.equal(h.timers.size, 0);
});

test("hover and keyboard focus pause expiry; leaving resumes the remaining time", async t => {
  const h = harness(t);
  h.toast.show("draft", "Draft copied.");
  h.advance(1_000); h.root.dispatchEvent(new Event("mouseenter"));
  h.advance(20_000); assert.equal(h.root.hidden, false);
  h.root.dispatchEvent(new Event("mouseleave"));
  h.advance(2_999); assert.equal(h.root.hidden, false);
  h.doc.activeElement = h.action; h.root.dispatchEvent(new Event("focusin"));
  h.advance(20_000); assert.equal(h.root.hidden, false);
  h.doc.activeElement = h.outside; h.root.dispatchEvent(new Event("focusout"));
  await Promise.resolve(); h.advance(1); assert.equal(h.root.hidden, true);
});

test("Undo is gated while busy and cannot run in a different brain", t => {
  const h = harness(t);
  let calls = 0;
  const show = () => h.toast.show("attention", "Settled", { action: { label: "Undo", run() { calls++; } } });
  show(); h.toast.disableAction(true); h.action.dispatchEvent(new Event("click"));
  assert.equal(calls, 0);
  h.toast.disableAction(false); h.action.dispatchEvent(new Event("click"));
  assert.equal(calls, 1);
  show(); h.scope("second"); h.action.dispatchEvent(new Event("click"));
  assert.equal(calls, 1); assert.equal(h.root.hidden, true); assert.equal(h.timers.size, 0);
});

test("manual dismissal restores keyboard focus, errors expire, and clearing another source is inert", t => {
  const h = harness(t);
  h.toast.show("reference", "Could not open page", { error: true });
  h.toast.clear("attention"); assert.equal(h.root.hidden, false);
  h.doc.activeElement = h.nodes["toast-close"];
  h.nodes["toast-close"].dispatchEvent(new Event("click"));
  assert.equal(h.root.hidden, true); assert.equal(h.doc.activeElement, h.outside);
  h.toast.show("reference", "Could not open page", { error: true });
  h.advance(8_000); assert.equal(h.root.hidden, true);
});

test("overlapping sources preserve persistent warnings and dedupe repeated/dismissed polling outcomes", t => {
  const h = harness(t);
  const warning = { source: "index", text: "Search is unavailable", severity: "warning" };
  h.toast.dispatch(warning);
  h.toast.dispatch({ source: "update", text: "Update installed", severity: "success", scope: "app" });
  assert.equal(h.root.dataset.source, "index");
  h.toast.show("draft", "Copied");
  assert.equal(h.root.dataset.source, "index", "ordinary confirmations cannot overwrite warnings");
  h.nodes["toast-close"].dispatchEvent(new Event("click"));
  assert.equal(h.root.dataset.source, "draft");
  h.advance(4_000);
  assert.equal(h.root.dataset.source, "update", "queued results receive their visible deadline");
  h.advance(2_000);
  h.toast.dispatch({ source: "update", text: "Update installed", severity: "success", scope: "app" });
  h.advance(2_000);
  assert.equal(h.root.hidden, true, "identical polls never extend expiry");
  h.toast.dispatch(warning);
  assert.equal(h.root.hidden, true, "a dismissed warning stays dismissed through identical polls");
  h.toast.clear("index"); h.toast.dispatch(warning);
  assert.equal(h.root.hidden, false, "resolution allows the same issue to recur");
});

test("scope changes discard queued brain messages and callbacks but preserve app outcomes", t => {
  const h = harness(t);
  let calls = 0;
  h.toast.dispatch({ source: "update", text: "Updated", scope: "app", duration: 4_000, action: { label: "Relaunch", run() { calls += 100; } } });
  h.toast.dispatch({ source: "old-brain", text: "Recover", severity: "error", duration: 0, action: { label: "Retry", run() { calls++; } } });
  h.toast.dispatch({ source: "queued", text: "Old result" });
  h.scope("second"); h.action.dispatchEvent(new Event("click"));
  assert.equal(calls, 0);
  assert.equal(h.root.dataset.source, "update");
  h.advance(4_000); assert.equal(h.root.hidden, true);
  h.toast.dispatch({ source: "old-brain", text: "Recover", severity: "error" });
  assert.equal(h.root.hidden, false, "deduplication is also scoped");
});

test("data dispatch validates payloads, renders text, and cannot smuggle actions", t => {
  const h = harness(t);
  const send = detail => { const event = new Event("jumpybrain-system-message"); event.detail = detail; h.doc.dispatchEvent(event); };
  for (const value of [null, {}, { source: "x", text: 7 }, { source: "<script>", text: "x" },
    { source: "x", text: "x", severity: "urgent" }, { source: "x", text: "x", duration: NaN },
    { source: "x", text: "x", duration: -1 }, { source: "x", text: "x", scope: "global" },
    { source: "x", text: "x".repeat(4097) }]) send(value);
  assert.equal(h.root.hidden, true);
  send({ source: "native", text: '<img onerror="bad()">', severity: "error", action: { label: "Run", run() { assert.fail("data-only bridge cannot run actions"); } } });
  assert.equal(h.nodes["toast-message"].textContent, '<img onerror="bad()">');
  assert.equal(h.nodes["toast-message"].role, "alert");
  assert.equal(h.action.hidden, true);
  h.action.dispatchEvent(new Event("click"));
  h.toast.stop();
  assert.equal(h.timers.size, 0);
  send({ source: "native", text: "Late event" });
  assert.equal(h.root.hidden, true);
});

test("bounded messages and action failures release safely across disposal and scope changes", async t => {
  const h = harness(t);
  for (let i = 0; i < 100; i++) h.toast.dispatch({ source: `warning-${i}`, text: `Warning ${i}`, severity: "warning" });
  let displayed = 0;
  while (!h.root.hidden) { displayed++; h.nodes["toast-close"].dispatchEvent(new Event("click")); }
  assert.equal(displayed, 16);
  let reject;
  h.toast.dispatch({ source: "action", text: "Retry", action: { label: "Retry", run: () => new Promise((_resolve, fail) => { reject = fail; }) } });
  h.action.dispatchEvent(new Event("click"));
  h.scope("new-brain"); h.toast.sync(); reject(new Error("private detail"));
  await Promise.resolve(); await Promise.resolve();
  assert.equal(h.root.hidden, true, "late failed actions cannot warn on another brain");
  h.toast.dispatch({ source: "action", text: "Retry", action: { label: "Retry", run() { throw new Error("secret"); } } });
  h.action.dispatchEvent(new Event("click"));
  assert.equal(h.nodes["toast-message"].textContent, "Action failed. Check the connection and try again.");
  h.toast.stop(); assert.equal(h.timers.size, 0);
});


test("distinct operation revisions can repeat identical completion text", t => {
  const h = harness(t);
  h.toast.dispatch({ source: "update", text: "Updated", revision: "first" });
  h.advance(4_000); assert.equal(h.root.hidden, true);
  h.toast.dispatch({ source: "update", text: "Updated", revision: "first" });
  assert.equal(h.root.hidden, true);
  h.toast.dispatch({ source: "update", text: "Updated", revision: "second" });
  assert.equal(h.root.hidden, false);
});
