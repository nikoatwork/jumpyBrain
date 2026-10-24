import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { createExtensionHost, installExtension } from "../dist/app/extensions/index.js";
import { extensionThemeColors } from "../dist/adapters/http-server/extensions-browser.js";

const examples = fileURLToPath(new URL("../examples/extensions/", import.meta.url));
const context = () => ({
  signal: new AbortController().signal, scope: { generation: 1, brainId: "fixture", tabId: "tab" }, document: null, allowWrites: false,
  memory: Object.fromEntries(["search", "read", "create", "update"].map(name => [name, () => assert.fail(`Example must not call memory.${name}`)])),
});
async function fixture(t, ids = ["pomodoro"]) {
  const directory = await mkdtemp(path.join(tmpdir(), "jb-example-"));
  let host;
  t.after(async () => { await host?.dispose(); await rm(directory, { recursive: true, force: true }); });
  for (const id of ids) await installExtension({ directory, source: path.join(examples, id) });
  host = await createExtensionHost({ directory });
  const control = async (action = "status", extra = {}) => (await host.invoke("pomodoro", "control", { action, ...extra }, context())).panel.data;
  return { directory, host, control };
}

function luminance(hex) {
  const rgb = hex.slice(1).match(/../g).slice(0, 3).map(value => parseInt(value, 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2];
}
const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05);

test("Candy Pink installs/activates with supported semantic colors and readable pink surfaces", async t => {
  const { host } = await fixture(t, ["candy-pink"]);
  const extension = host.snapshot().extensions[0];
  assert.equal(extension.status, "active"); assert.deepEqual(extension.capabilities, []);
  const theme = extension.themes[0];
  assert.equal(theme.id, "strawberry"); assert.equal(theme.appearance, "light");
  assert.equal(extensionThemeColors(theme.colors).length, Object.keys(theme.colors).length);
  assert.equal(theme.colors.surface, "#fff1f7");
  for (const foreground of ["ink", "ink-soft", "ink-faint", "accent"]) {
    for (const background of ["surface", "control-fill", "surface-hover"]) {
      assert.ok(contrast(theme.colors[foreground], theme.colors[background]) >= 4.5, `${foreground}/${background} text contrast`);
    }
  }
  assert.ok(contrast(theme.colors["error-ink"], theme.colors["error-fill"]) >= 4.5);
  assert.ok(contrast(theme.colors["focus-ring"], theme.colors.surface) >= 3);
  await host.setEnabled("candy-pink", false);
  assert.deepEqual(host.snapshot().extensions[0].themes, []);
});

test("Pomodoro public runtime controls use deadlines, preserve pause, and explicitly start each next interval", async t => {
  const { host, control, directory } = await fixture(t);
  let now = Date.now(); t.mock.method(Date, "now", () => now);
  const descriptor = host.snapshot().extensions[0];
  assert.equal(descriptor.status, "active"); assert.deepEqual(descriptor.capabilities, []);
  assert.equal(descriptor.commands.find(command => command.id === "open").slot, "sidebar.actions");
  let timer = (await host.invoke("pomodoro", "open", null, context())).panel.data;
  assert.equal(timer.mode, "focus"); assert.equal(timer.remainingMs, 25 * 60_000); assert.equal(timer.deadline, null);
  timer = await control("start"); const firstDeadline = timer.deadline;
  now += 90_123;
  assert.equal((await control("start")).deadline, firstDeadline, "duplicate start does not extend the interval");
  timer = await control("pause");
  assert.equal(timer.remainingMs, 25 * 60_000 - 90_123); assert.equal(timer.deadline, null);
  now += 2 * 60 * 60_000;
  assert.equal((await control()).remainingMs, timer.remainingMs, "paused time is stable across sleep");
  timer = await control("start"); assert.equal(timer.deadline, now + timer.remainingMs);
  const persisted = JSON.parse(await readFile(path.join(directory, "state/pomodoro.json"), "utf8"))["timer-v1"];
  assert.equal(persisted.deadline, timer.deadline);
  await host.reload(); assert.equal((await control()).deadline, timer.deadline, "reload restores the running deadline");
  now += 4 * 60 * 60_000;
  timer = await control();
  assert.equal(timer.mode, "break"); assert.equal(timer.completed, "focus"); assert.equal(timer.deadline, null); assert.equal(timer.remainingMs, 5 * 60_000);
  assert.equal((await control()).mode, "break", "long absence advances exactly one interval");
  timer = await control("start"); now = timer.deadline;
  timer = await control("pause");
  assert.equal(timer.mode, "focus"); assert.equal(timer.completed, "break"); assert.equal(timer.deadline, null);
  await control("start"); now += 1234;
  timer = await control("reset"); assert.equal(timer.remainingMs, 25 * 60_000); assert.equal(timer.deadline, null);
  timer = await control("mode", { mode: "break" }); assert.equal(timer.remainingMs, 5 * 60_000);
  await assert.rejects(control("mode", { mode: "unknown" }));
  await assert.rejects(control("unknown"));
  assert.equal((await control()).mode, "break", "failed action does not poison the command queue");
  await Promise.all([control("start"), control("pause"), control("mode", { mode: "focus" }), control("start")]);
  timer = await control(); assert.equal(timer.mode, "focus"); assert.equal(timer.deadline, now + 25 * 60_000);
  await host.setEnabled("pomodoro", false);
  await assert.rejects(control(), /disabled|not active|unavailable/i);
  now += 5000;
  await host.setEnabled("pomodoro", true); assert.equal((await control()).deadline, timer.deadline);
  await host.dispose();
  const restarted = await createExtensionHost({ directory }); t.after(() => restarted.dispose());
  const restored = (await restarted.invoke("pomodoro", "open", null, context())).panel.data;
  assert.equal(restored.deadline, timer.deadline, "a fresh host restores the persisted deadline");
});

test("Pomodoro recovers invalid versioned state without interpreting it as a running timer", async t => {
  const { host, control, directory } = await fixture(t);
  await host.setEnabled("pomodoro", false);
  await mkdir(path.join(directory, "state"), { recursive: true });
  await writeFile(path.join(directory, "state/pomodoro.json"), JSON.stringify({ "timer-v1": { version: 999, mode: "focus", remainingMs: -1, deadline: 1 } }));
  await host.setEnabled("pomodoro", true);
  const timer = await control(); assert.equal(timer.mode, "focus"); assert.equal(timer.deadline, null); assert.equal(timer.remainingMs, 25 * 60_000);
});

// Minimal DOM surface for executing the production-compiled UI asset. Virtual ticks
// deliberately jump wall time rather than replaying every missed interval callback.
class Element extends EventTarget {
  constructor(tagName, ownerDocument) { super(); this.tagName = tagName; this.ownerDocument = ownerDocument; this.style = {}; this.attributes = {}; this.children = []; this.textContent = ""; }
  setAttribute(key, value) { this.attributes[key] = value; }
  append(...children) { for (const child of children) { child.parent = this; this.children.push(child); } }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); this.parent = null; }
  click() { if (!this.disabled) this.dispatchEvent(new Event("click")); }
}
class Document extends EventTarget { createElement(tag) { return new Element(tag, this); } }
function find(element, predicate) { if (predicate(element)) return element; for (const child of element.children) { const match = find(child, predicate); if (match) return match; } }
async function uiFixture(t, fixture) {
  const descriptor = fixture.host.snapshot().extensions.find(entry => entry.id === "pomodoro");
  const script = await fixture.host.asset("pomodoro", descriptor.revision);
  let factory; let render; let factoryDispose; let now = Date.now();
  const intervals = new Map(); let nextTimer = 0;
  vm.runInNewContext(script, {
    JumpyBrainExtensions: { register(id, activate) { assert.equal(id, "pomodoro"); factory = activate; } },
    Date: { now: () => now }, setInterval(callback) { intervals.set(++nextTimer, callback); return nextTimer; }, clearInterval(id) { intervals.delete(id); },
  });
  let registered = true;
  factory({ registerPanel(id, renderer) { assert.equal(id, "timer"); render = renderer; return () => { registered = false; }; }, onDispose(dispose) { factoryDispose = dispose; } });
  t.after(() => factoryDispose());
  const doc = new Document(); const container = doc.createElement("div"); const controller = new AbortController(); const calls = [];
  // The production transport serializes browser inputs before the host validates JSON.
  let execute = (command, input) => fixture.host.invoke("pomodoro", command, JSON.parse(JSON.stringify(input)), context());
  const initial = (await fixture.host.invoke("pomodoro", "open", null, context())).panel.data;
  const dispose = render(container, initial, { signal: controller.signal, document: null, execute(command, input) { const result = execute(command, input); calls.push({ command, input, result }); return result; } });
  const tick = () => { for (const callback of intervals.values()) callback(); };
  const button = label => { const node = find(container, element => element.tagName === "button" && element.textContent === label); assert.ok(node, `button ${label}`); return node; };
  const settle = async () => { await calls.at(-1)?.result.catch(() => {}); await new Promise(resolve => setImmediate(resolve)); };
  return { container, controller, intervals, calls, button, settle, tick, dispose, factoryDispose, get registered() { return registered; },
    clock: () => find(container, element => element.attributes.role === "timer"),
    status: () => find(container, element => element.attributes.role === "status"),
    setNow(value) { now = value; }, setExecute(value) { execute = value; } };
}

test("production Pomodoro UI controls, delayed wall-clock ticks and abort cleanup", async t => {
  const f = await fixture(t);
  let now = Date.now(); t.mock.method(Date, "now", () => now);
  const ui = await uiFixture(t, f);
  assert.equal(ui.clock().textContent, "25:00"); assert.equal(ui.intervals.size, 1);
  ui.button("Start focus").click(); await ui.settle();
  now += 61_200; ui.setNow(now); ui.tick();
  assert.equal(ui.clock().textContent, "23:59", "countdown is derived from elapsed wall time");
  ui.button("Pause").click(); await ui.settle();
  now += 60_000; ui.setNow(now); ui.tick(); assert.equal(ui.clock().textContent, "23:59");
  ui.button("Resume").click(); await ui.settle();
  now += 25 * 60_000; ui.setNow(now); ui.tick(); await ui.settle();
  assert.equal(ui.clock().textContent, "05:00"); assert.match(ui.status().textContent, /Focus complete/);
  assert.equal(ui.calls.filter(call => call.input.action === "status").length, 1);
  ui.button("Start break").click(); await ui.settle();
  ui.button("Reset").click(); await ui.settle(); assert.equal(ui.clock().textContent, "05:00");
  ui.button("Focus · 25 min").click(); await ui.settle(); assert.equal(ui.clock().textContent, "25:00");
  const detachedButton = ui.button("Start focus");
  const before = ui.calls.length;
  ui.controller.abort(); ui.dispose(); ui.factoryDispose();
  assert.equal(ui.intervals.size, 0); assert.equal(ui.container.children.length, 0); assert.equal(ui.registered, false);
  detachedButton.click(); ui.tick(); assert.equal(ui.calls.length, before);
});

test("Pomodoro UI fences late results and avoids completion retry loops after transport failure", async t => {
  const f = await fixture(t); let now = Date.now(); t.mock.method(Date, "now", () => now);
  await f.control("start");
  const ui = await uiFixture(t, f);
  ui.setExecute(async () => { throw new Error("offline"); });
  now += 26 * 60_000; ui.setNow(now); ui.tick(); await ui.settle();
  for (let i = 0; i < 10; i++) ui.tick();
  assert.equal(ui.calls.length, 1); assert.match(ui.status().textContent, /could not sync/);
  let resolve;
  ui.setExecute(() => new Promise(done => { resolve = done; }));
  ui.button("Pause").click(); assert.ok(resolve);
  const clock = ui.clock(); const before = clock.textContent;
  ui.controller.abort();
  resolve({ panel: { id: "timer", data: { mode: "break", remainingMs: 300_000, deadline: null, durationMs: 300_000, completed: "focus" } } });
  await ui.settle();
  assert.equal(clock.textContent, before); assert.equal(ui.container.children.length, 0); assert.equal(ui.intervals.size, 0);
});
