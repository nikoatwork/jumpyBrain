import assert from "node:assert/strict";
import test from "node:test";
import { installToast } from "../dist/adapters/http-server/browser-toast.js";

function harness(t) {
  let now = 0, next = 0, scope = "first";
  const timers = new Map();
  t.mock.method(Date, "now", () => now);
  const nodes = Object.fromEntries(["app-toast", "toast-message", "toast-action", "toast-close"].map(id => {
    const element = new EventTarget();
    Object.assign(element, { hidden: true, textContent: "", dataset: {}, isConnected: true, focus() { doc.activeElement = element; } });
    return [id, element];
  }));
  const win = new EventTarget();
  Object.assign(win, {
    setTimeout(run, delay) { timers.set(++next, { run, at: now + delay }); return next; },
    clearTimeout(id) { timers.delete(id); }, queueMicrotask,
  });
  const outside = { isConnected: true, focus() { doc.activeElement = outside; } };
  const doc = { defaultView: win, activeElement: outside, getElementById: id => nodes[id] };
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
