import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { graphPageHtml } from "../dist/adapters/http-server/graph-page.js";

const html = graphPageHtml("fixture", "settings", { companion: true });
const script = html.match(/<script[^>]*>([\s\S]*?)<\/script>/)[1];
function extract(name) {
  let start = script.indexOf("function " + name + "(");
  assert.ok(start >= 0, name);
  if (script.slice(start - 6, start) === "async ") start -= 6;
  const body = script.indexOf("{", start);
  let depth = 0;
  for (let end = body; end < script.length; end++) {
    if (script[end] === "{") depth++;
    if (script[end] === "}" && --depth === 0) return script.slice(start, end + 1);
  }
  throw new Error("Unterminated " + name);
}
function runtime(names, globals) {
  const context = vm.createContext(globals);
  vm.runInContext(names.map(extract).join("\n"), context);
  return context;
}
function deferred() {
  let resolve;
  const promise = new Promise((yes) => { resolve = yes; });
  return { promise, resolve };
}
const tick = () => new Promise((resolve) => setImmediate(resolve));
const id = "mem_a0000000-0000-4000-8000-000000000001";

test("changing a remote destination clears approval; local read-only profiles cannot be edited", () => {
  const elements = { "companion-url": { value: "https://another.example" }, "companion-writes": { checked: true } };
  const context = runtime(["companionRemoteDestinationChanged", "companionReadOnly"], {
    URL, $: (id) => elements[id], companionRemoteDestination: "https://original.example",
    companionFrozen: false, companionSessionFailed: false, companionRegistered: true,
    companionState: { active: { kind: "local", allowWrites: false } },
  });
  context.companionRemoteDestinationChanged();
  assert.equal(elements["companion-writes"].checked, false);
  elements["companion-writes"].checked = true;
  elements["companion-url"].value = "https://another.example:443/";
  context.companionRemoteDestinationChanged();
  assert.equal(elements["companion-writes"].checked, true, "equivalent normalized origin retains fresh approval");
  assert.equal(context.companionReadOnly(), true);
  context.companionState.active.allowWrites = true;
  assert.equal(context.companionReadOnly(), false);
});

test("clean restart reconnect reloads before registration; dirty reconnect never moves the draft", async () => {
  for (const pending of [false, true]) {
    const routes = [], replacements = [];
    const context = runtime(["startCompanion"], {
      companionStarting: false, companionRegistered: true, companionToken: null,
      companionState: { generation: 1, activeId: "old" }, companionStopped: false,
      companionSessionFailed: true, companionPollTimer: null, companionPolling: false,
      state: { view: "home", editor: { hasPending: () => pending } },
      noteCapture: { hasPending: () => false },
      $: () => ({}), companionMessage() {}, companionLock() {},
      renderCompanionConnection() {}, renderCompanionSettings() {},
      companionControl: async (route) => { routes.push(route); return { generation: 2, activeId: "new" }; },
      location: { replace: (url) => replacements.push(url) }, encodeURIComponent,
    });
    await context.startCompanion();
    assert.deepEqual(routes, ["state"], "the old page must never register the new generation before reloading");
    assert.deepEqual(replacements, pending ? [] : ["/?brain=new"]);
    assert.equal(context.companionRegistered, true, "old generation registration is not repurposed");
  }
});

test("companion settings/scripts are opt-in and both shell variants parse", () => {
  const ordinary = graphPageHtml("fixture");
  assert.doesNotMatch(ordinary, /id="companion-settings"/);
  assert.doesNotMatch(ordinary, /function startCompanion/);
  assert.match(html, /id="companion-key" type="password"/);
  assert.match(html, /id="companion-writes" type="checkbox" \/>/);
  assert.doesNotThrow(() => new vm.Script(script));
  assert.doesNotThrow(() => new vm.Script(ordinary.match(/<script[^>]*>([\s\S]*?)<\/script>/)[1]));
});

test("memory requests wait for registration and send generation/tab, never bearer target keys", async () => {
  const ready = deferred();
  const requests = [];
  const context = runtime(["graphFetch"], {
    companionMode: true, companionReady: ready.promise, companionRegistered: false, companionSessionFailed: false,
    companionState: { generation: 7 }, companionTabId: "fresh-tab", credentialRevision: 0,
    activeApiKey: "companion-session", connectionStatus: "checking", renderConnection() {},
    fetch: async (url, options) => { requests.push({ url, options }); return { status: 200, ok: true }; },
  });
  const pending = context.graphFetch("/memories/all/recent");
  await tick(); assert.equal(requests.length, 0);
  context.companionRegistered = true;
  ready.resolve(); await pending;
  assert.deepEqual(JSON.parse(JSON.stringify(requests[0].options.headers)), {
    "X-Companion-Generation": "7", "X-Companion-Tab": "fresh-tab",
  });
  context.companionSessionFailed = true;
  await assert.rejects(context.graphFetch("/memories/all/recent"), /session unavailable/);
  assert.equal(requests.length, 1);
});

test("companion document conflicts stop without refreshing/overwriting; draft remains pending", async () => {
  let writes = 0, reads = 0;
  const context = runtime(["createDocumentEditor", "splitEditableDocument", "composeEditableDocument"], {});
  const editor = context.createDocumentEditor({
    generation: 1, documentId: id, conflictRetry: false, persistentEditing: true,
    setTimer: () => 1, clearTimer() {}, debounceMs: 750, onChange() {}, isCurrent: () => true,
    splitDocument: context.splitEditableDocument, composeDocument: context.composeEditableDocument,
    writeDocument: async () => { writes++; throw Object.assign(new Error("Conflict: draft retained"), { status: 412 }); },
    readDocument: async () => { reads++; throw new Error("must not read latest for overwrite"); },
  });
  editor.hydrate({ content: "Original", contentHash: "old", title: "Fixture" });
  editor.input("Unsaved draft");
  assert.equal(await editor.flush(), false);
  assert.equal(writes, 1); assert.equal(reads, 0);
  assert.equal(editor.state.draft, "Unsaved draft"); assert.equal(editor.hasPending(), true);
  assert.equal(editor.state.saveStatus, "failed");
});

test("lost-response creation is visible to the switch barrier", async () => {
  const context = runtime(["createNoteCapture", "datedNoteDraft", "isValidMemoryDocumentId"], {});
  let fail = true;
  const capture = context.createNoteCapture({ now: () => new Date("2026-01-01"), key: () => "same-key",
    write: async () => { if (fail) throw new Error("lost response"); return { id }; },
  });
  assert.equal(capture.hasPending(), false);
  await assert.rejects(capture.create());
  assert.equal(capture.hasPending(), true);
  assert.equal(capture.isInFlight(), false);
  fail = false; await capture.create();
  assert.equal(capture.hasPending(), true, "successful creation still must be applied to navigation");
  capture.complete(); assert.equal(capture.hasPending(), false);
});

function barrierHarness(overrides = {}) {
  const acknowledgements = [], flush = deferred();
  const editor = { setNavigationPending() {}, flush: () => flush.promise, hasPending: () => false };
  const context = runtime(["companionBarrier"], {
    companionState: { phase: "preparing", switchId: "switch-1" }, companionTabId: "tab",
    creatingNote: false, navigation: { isBusy: () => false }, companionNoteLoading: 0,
    noteCapture: { isInFlight: () => false, hasPending: () => false }, state: { editor },
    companionMessage() {}, setTimeout, Date,
    companionControl: async (route, body) => { acknowledgements.push({ route, body }); }, ...overrides,
  });
  return { context, acknowledgements, flush };
}
test("switch acknowledgement waits for flush and reports failures without discarding", async () => {
  for (const result of [true, false]) {
    const h = barrierHarness();
    const pending = h.context.companionBarrier("switch-1");
    await tick(); assert.equal(h.acknowledgements.length, 0);
    h.flush.resolve(result); await pending;
    assert.equal(h.acknowledgements[0].body.ok, result);
    assert.equal(h.acknowledgements[0].body.switchId, "switch-1");
  }
  const h = barrierHarness({ noteCapture: { isInFlight: () => false, hasPending: () => true } });
  await h.context.companionBarrier("switch-1");
  assert.equal(h.acknowledgements[0].body.ok, false);
});

test("acknowledgement from an expired switch is never sent", async () => {
  const h = barrierHarness();
  const pending = h.context.companionBarrier("switch-1");
  h.context.companionState = { phase: "idle", switchId: null };
  h.flush.resolve(true); await pending;
  assert.equal(h.acknowledgements.length, 0);
});

test("polling has no overlapping async requests and reschedules only after settlement", async () => {
  const result = deferred(); const timers = []; let calls = 0;
  const context = runtime(["companionPoll"], {
    companionStopped: false, companionPolling: false, companionRegistered: true,
    companionState: { generation: 1 }, companionTabId: "tab", companionPollTimer: null,
    companionControl: () => { calls++; return result.promise; }, companionApplyState() {}, companionFence() {},
    setTimeout: (run, delay) => { timers.push({ run, delay }); return 1; },
  });
  const first = context.companionPoll(); await context.companionPoll();
  assert.equal(calls, 1); assert.equal(timers.length, 0);
  result.resolve({}); await first;
  assert.equal(timers.length, 1); assert.equal(timers[0].delay, 750);
});

test("generation change reloads to target-scoped home/settings before replacing old state", () => {
  for (const view of ["note", "settings"]) {
    const destinations = [];
    const original = { generation: 1 };
    const context = runtime(["companionApplyState"], {
      companionState: original, companionStopped: false, state: { view }, companionLock() {},
      location: { replace: (url) => destinations.push(url) },
    });
    context.companionApplyState({ profiles: [], generation: 2, activeId: "brain-b", phase: "idle" });
    assert.equal(destinations[0], (view === "settings" ? "/settings" : "/") + "?brain=brain-b");
    assert.equal(context.companionState, original);
    assert.equal(context.companionStopped, true);
  }
});

test("note URLs are scoped and mismatched brain links are rejected", () => {
  const { companionScopeUrl } = runtime(["companionScopeUrl"], {
    URL, location: { origin: "http://127.0.0.1:1234" }, companionState: { activeId: "local-a" },
  });
  assert.equal(companionScopeUrl("/?note=" + id), "/?note=" + id + "&brain=local-a");
  assert.throws(() => companionScopeUrl("/?note=" + id + "&brain=remote-b"), /another brain/);
});

test("Dream uses the actual authorized remote URL, never the gateway/local folder", () => {
  const context = runtime(["companionDreamTarget"], { companionState: { active: { kind: "local", root: "/fixture" } } });
  assert.throws(context.companionDreamTarget, /gateway is not an agent endpoint/);
  context.companionState.active = { kind: "remote", url: "https://fixture.example", allowWrites: false };
  assert.throws(context.companionDreamTarget, /read only/);
  context.companionState.active.allowWrites = true;
  assert.equal(context.companionDreamTarget(), "https://fixture.example");
});
