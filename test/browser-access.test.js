// The shared role guard of the browser shell (accessGuardScript in src/adapters/http-server/access-keys-view.ts):
// one presentation rule for the app and the hosted browser. It never grants anything.
import { shellFunctions } from "./browser-shell-helpers.js";
import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { graphPageHtml } from "../dist/adapters/http-server/graph-page.js";
import { createFeedbackDiagnostics } from "../dist/adapters/http-server/feedback.js";

const shell = (companion) => [...graphPageHtml("fixture", "home", { companion }).matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].at(-1)[1];
const guard = ["accessState", "accessCan", "accessBlocked", "accessWritable", "accessOffered", "accessExplanation", "accessExplain", "accessExplanationInline", "accessDenied", "accessDeniedIn", "accessObserved", "accessRefresh", "accessRecheck", "accessRefused", "accessOpenSettings"];
function runtime(companion, names, globals) {
  const context = vm.createContext({ companionMode: companion, accessNoticeCount: 0, accessRecheckedAt: 0, hostedAccess: null, feedbackDiagnostics: createFeedbackDiagnostics(), ...globals });
  vm.runInContext(shellFunctions(shell(companion), [...names, ...guard.filter(name => !(name in globals))], context), context);
  return context;
}
const tick = () => new Promise((resolve) => setImmediate(resolve));
const reader = { principal: { id: "p1", name: "Bob", role: "reader" }, capabilities: ["read"] };
const writer = { principal: { id: "p2", name: "Wren", role: "writer" }, capabilities: ["read", "write"] };

test("hosted: an unknown role blocks nothing here, a known reader is stopped with an explanation and a Settings action", () => {
  const messages = [], opened = [];
  const context = runtime(false, [], {
    connectionStatus: "connected", activeApiKey: "browser-session",
    systemMessages: { dispatch: (message) => messages.push(message), clear: (source) => opened.push("clear:" + source) },
    openAccessKeys: () => opened.push("access-keys"),
  });
  // Before /capabilities has answered, the page neither grants nor refuses: the server decides.
  assert.equal(context.accessBlocked(), false); assert.equal(context.accessWritable(), true); assert.equal(context.accessOffered(), true);
  assert.equal(context.accessDenied("Creating a note"), false); assert.equal(messages.length, 0);

  context.accessObserved(reader);
  assert.deepEqual(JSON.parse(JSON.stringify(context.hostedAccess)), { role: "reader", capabilities: ["read"] });
  assert.equal(context.accessCan("read"), true); assert.equal(context.accessCan("write"), false);
  assert.equal(context.accessBlocked(), true); assert.equal(context.accessWritable(), false);
  assert.equal(context.accessOffered(), true, "the control stays available so that using it explains");
  assert.equal(context.accessDenied("Moving this file"), true);
  const explanation = messages.pop();
  assert.equal(explanation.text, "Moving this file needs a writer or admin key. Your key has reader access.");
  assert.equal(explanation.severity, "warning"); assert.equal(explanation.action.label, "Open Settings");
  explanation.action.run();
  assert.deepEqual(opened, ["clear:access", "access-keys"], "hosted Settings is the Access keys dialog");
  assert.equal(context.accessDenied("Moving this file"), true);
  assert.notEqual(messages.pop().revision, explanation.revision, "a repeated attempt is explained again");

  // Inside a modal dialog the same explanation is written where it can be read, with the way to Settings in words.
  const status = { textContent: "" };
  assert.equal(context.accessDeniedIn(status, "Reindexing"), true);
  assert.equal(status.textContent, "Reindexing needs a writer or admin key. Your key has reader access. See Connection settings → Access keys.");
  assert.equal(messages.pop().text, "Reindexing needs a writer or admin key. Your key has reader access.");

  // Not connected is not a role restriction: nothing is explained, the connection state speaks.
  context.connectionStatus = "disconnected";
  assert.equal(context.accessBlocked(), false); assert.equal(context.accessDenied("Moving this file"), false); assert.equal(messages.length, 0);
  context.connectionStatus = "connected";

  context.accessObserved(writer);
  assert.equal(context.accessDenied("Moving this file"), false); assert.equal(messages.length, 0);
  assert.equal(context.accessDenied("Creating a key", "manage_access"), true);
  assert.equal(messages.pop().text, "Creating a key needs an admin key. Your key has writer access.");

  // Only an explicit role and capability list counts.
  for (const packet of [null, {}, { principal: { role: "admin" } }, { principal: { role: "admin" }, capabilities: "write" }, { capabilities: ["write"] }]) {
    context.accessObserved(packet);
    assert.equal(context.hostedAccess, null, JSON.stringify(packet));
    assert.equal(context.accessCan("write"), false);
  }
});

test("hosted: every /capabilities read updates the role for the current key only", async () => {
  let reply = reader;
  const context = runtime(false, ["graphJson"], {
    credentialRevision: 3, connectionStatus: "connected", activeApiKey: "browser-session",
    graphFetch: async () => ({ ok: true, status: 200, json: async () => reply }),
  });
  await context.graphJson("/memories/all/status");
  assert.equal(context.hostedAccess, null, "other routes say nothing about the role");
  await context.graphJson("/capabilities");
  assert.equal(context.hostedAccess.role, "reader");
  reply = writer;
  await context.accessRefresh();
  assert.equal(context.hostedAccess.role, "writer", "a refresh is one more read; nothing else on the page is touched");
  // An answer for a key that has since been replaced is ignored.
  reply = reader;
  context.graphFetch = async () => { context.credentialRevision++; return { ok: true, status: 200, json: async () => reply }; };
  await context.graphJson("/capabilities");
  assert.equal(context.hostedAccess.role, "writer");
});

test("a refused request re-checks the role and then explains with what is known", async () => {
  const messages = [];
  let reply = reader;
  const context = runtime(false, ["graphJson"], {
    credentialRevision: 0, connectionStatus: "connected", activeApiKey: "browser-session",
    systemMessages: { dispatch: (message) => messages.push(message), clear() {} }, openAccessKeys() {},
    graphFetch: async () => ({ ok: true, status: 200, json: async () => reply }),
  });
  // The page believed this key could write; the server said read_only.
  context.accessObserved(writer);
  context.accessRefused("read_only"); await tick(); await tick();
  assert.equal(context.hostedAccess.role, "reader", "the stale role was replaced");
  assert.equal(messages.pop().text, "This change needs a writer or admin key. Your key has reader access.");
  // Another refusal right away is explained without asking the server again.
  reply = writer;
  context.accessRefused("admin_required"); await tick(); await tick();
  assert.equal(context.hostedAccess.role, "reader", "re-checks are spaced out");
  assert.equal(messages.pop().text, "Managing access keys needs an admin key. Your key has reader access.");
  // The role still reads as allowed after the re-check: say only what is certain.
  context.accessRecheckedAt = 0;
  context.accessRefused("read_only"); await tick(); await tick();
  assert.equal(messages.pop().text, "This change needs a writer or admin key. The server refused it for your current key.");
  // The re-check itself failed: nothing is claimed about the role.
  context.graphFetch = async () => { throw new Error("offline"); };
  context.hostedAccess = null; context.accessRecheckedAt = 0;
  context.accessRefused("access_unconfirmed"); await tick(); await tick();
  assert.equal(messages.pop().text, "This change is paused: the app could not confirm what your access key may do.");
});

test("app: controls are offered under a role restriction only; frozen, failed and unselected sessions keep their own disabled state", async () => {
  const applied = [], requested = [];
  let snapshot = null;
  const context = runtime(true, ["companionReadOnly", "companionCan", "companionAccessBlocked"], {
    companionFrozen: false, companionSessionFailed: false, companionRegistered: true,
    companionState: { generation: 4, active: { kind: "remote", name: "Team" }, access: { source: "server", role: "reader", capabilities: ["read"] } },
    companionControl: async (route) => { requested.push(route); return snapshot; },
    companionApplyState: (next) => applied.push(next),
  });
  assert.equal(context.accessWritable(), false); assert.equal(context.accessOffered(), true);
  context.companionState.access = { source: "server", role: null, capabilities: [], reason: "offline" };
  assert.equal(context.accessOffered(), true, "an unconfirmed role is explained too");
  context.companionState.access = { source: "server", role: "writer", capabilities: ["read", "write"] };
  assert.equal(context.accessWritable(), true); assert.equal(context.accessOffered(), true);
  for (const key of ["companionFrozen", "companionSessionFailed"]) {
    context[key] = true;
    assert.equal(context.accessWritable(), false, key); assert.equal(context.accessOffered(), false, key);
    assert.equal(context.accessDenied("Moving this card"), true, key);
    const status = { textContent: "unchanged" };
    assert.equal(context.accessDeniedIn(status, "Moving this card"), true, key);
    assert.equal(status.textContent, "unchanged", "a frozen or failed session is not described as a role restriction");
    context[key] = false;
  }
  context.companionRegistered = false; assert.equal(context.accessOffered(), false);
  context.companionRegistered = true; context.companionState.active = null; assert.equal(context.accessOffered(), false);
  context.companionState.active = { kind: "remote", name: "Team" };

  // A re-check asks the gateway for state, which re-reads health and role, and applies it for this generation.
  snapshot = { generation: 4, access: { source: "server", role: "reader", capabilities: ["read"] } };
  await context.accessRefresh();
  assert.deepEqual(requested, ["state"]); assert.equal(applied.length, 1);
  // A new generation belongs to the tab poll and its save barrier, never to this.
  snapshot = { generation: 5 };
  await context.accessRefresh();
  assert.equal(applied.length, 1);
  context.companionSessionFailed = true;
  await context.accessRefresh();
  assert.equal(requested.length, 2, "a failed session is not polled from here");
});

test("app: a role refusal keeps the connection state and is explained; a rejected key asks the gateway to re-check", async () => {
  const refused = [], refreshed = [];
  let next;
  const context = runtime(true, ["graphFetch"], {
    companionReady: Promise.resolve(), companionRegistered: true, companionSessionFailed: false,
    companionState: { generation: 7 }, companionTabId: "tab", credentialRevision: 0,
    activeApiKey: "companion-session", connectionStatus: "connected", renderConnection() {},
    companionFence: () => refused.push("fence"),
    accessRefused: (code) => refused.push(code), accessRecheck: async () => { refreshed.push(true); },
    fetch: async () => next,
  });
  const reply = (status, code) => new Response(JSON.stringify({ error: { code } }), { status });
  next = reply(403, "read_only"); await context.graphFetch("/memories/all/notes", { method: "POST" });
  assert.equal(context.connectionStatus, "connected"); assert.deepEqual(refused, ["read_only"]);
  next = reply(403, "access_unconfirmed"); await context.graphFetch("/memories/all/notes", { method: "POST" });
  assert.equal(context.connectionStatus, "connected"); assert.deepEqual(refused, ["read_only", "access_unconfirmed"]);
  assert.equal(refreshed.length, 0);
  next = reply(401, "invalid_api_key"); await context.graphFetch("/memories/all/notes", { method: "POST" });
  assert.equal(context.connectionStatus, "disconnected"); assert.equal(refreshed.length, 1);
  next = reply(409, "stale_generation"); await context.graphFetch("/memories/all/notes", { method: "POST" });
  assert.deepEqual(refused, ["read_only", "access_unconfirmed", "fence"]);
});
