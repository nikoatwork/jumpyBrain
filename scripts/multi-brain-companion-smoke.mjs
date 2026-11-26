// Multi-brain companion smoke: production gateway + Chromium shell switching among
// two disposable local folders and two real loopback hosted servers.
// Disposable roots, in-memory fake credentials, temp HOME; never touches the
// owner's Mac app profiles, keychain, CLI config or any production host.
// Uses existing dist (does not build):
// npx --package=playwright node scripts/multi-brain-companion-smoke.mjs
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomBytes } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startCompanionGateway } from "../integrations/macos-companion/gateway.mjs";
import { createServerMemoryRuntime, startJumpyBrainHttpServer } from "../dist/server/index.js";
import { stopRootBackend } from "../dist/app/backend-host/index.js";
import { WebSocket } from "../dist/adapters/websocket/index.js";
import { installCollaborationSmokeTransport } from "./collaboration-smoke-transport.mjs";
import { loadPlaywrightChromium, launchPlaywrightChromium } from "./playwright-runtime.mjs";
import { appendEditorText, editorMarkdown } from "./editor-smoke-helpers.mjs";

const runtimeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const controlKey = randomBytes(32).toString("hex");
const hostedKeys = { h1: "disposable-h1-" + randomBytes(16).toString("hex"), h2: "disposable-h2-" + randomBytes(16).toString("hex") };
const ids = ["mem_b0000000-0000-4000-8000-000000000001", "mem_b0000000-0000-4000-8000-000000000002"];
const brainNames = ["a", "b", "h1", "h2", "cli"];
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const run = promisify(execFile);
const startedAt = Date.now();
const passed = [], failures = [], errors = [], evidence = [];
const keys = new Map();
const roots = {};
const servers = {};
let temporary, directory, gateway, browser, context, settings, editor, second, gatewayPort;
let stage = "bootstrap";
const credentials = {
  get: async (ref) => keys.get(ref) ?? null,
  set: async (ref, key) => { keys.set(ref, key); },
  delete: async (ref) => { keys.delete(ref); },
  selectFolder: async () => roots.b,
};
const check = async (name, operation) => {
  stage = name;
  await operation();
  passed.push(name);
  console.log("  ok - " + name);
};
async function until(predicate, message, ms = 12000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) { if (await predicate()) return; await pause(30); }
  throw new Error(message || "condition timed out");
}
const startGateway = (port = 0) => startCompanionGateway({
  runtimeRoot, directory, initialRoot: roots.a, port, controlKey, credentials,
  switchTimeoutMs: 10000, targetTimeoutMs: 5000, identityFile: path.join(temporary, "identity.json"),
});
function native(route, body) {
  return fetch(gateway.url + route, {
    method: body === undefined ? "GET" : "POST",
    headers: { Authorization: "Bearer " + controlKey, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(15000),
  });
}
// Standalone CLI: temp HOME (no owner config/.env), no install manifest (repo
// checkout), and no companion --directory. Only explicit env/flags select a brain.
async function cli(args, env = {}) {
  const clean = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith("JUMPYBRAIN_")));
  const { stdout } = await run(process.execPath, [path.join(runtimeRoot, "dist/cli.js"), ...args, "--json"], {
    env: { ...clean, HOME: path.join(temporary, "cli-home"), ...env }, cwd: path.join(temporary, "cli-home"), timeout: 20000,
  });
  return JSON.parse(stdout);
}
async function browserRequest(page, route, body, headers = {}) {
  return page.evaluate(async ({ route, body, headers }) => {
    const response = await fetch(route, { method: body === undefined ? "GET" : "POST", headers: { ...headers, ...(body === undefined ? {} : { "Content-Type": "application/json" }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json().catch(() => null) };
  }, { route, body, headers });
}
function row(name) { return settings.locator(".companion-profile").filter({ hasText: name }); }
async function ready(page) {
  await page.waitForFunction(() => companionRegistered && !companionFrozen && companionState.phase === "idle");
}
const liveControls = new WeakMap();
async function liveControl(page) {
  if (liveControls.has(page)) return liveControls.get(page);
  const controls = await installCollaborationSmokeTransport(page);
  liveControls.set(page, controls);
  return controls;
}
async function openEditor(page, id, brain) {
  await liveControl(page);
  await page.goto(gateway.url + "/?note=" + id + "&brain=" + brain);
  await page.locator("#note-editor").waitFor();
  await ready(page);
  await page.waitForFunction(() => ["saved", "readonly"].includes(state.editor?.collaboration?.state.status));
}
async function reloaded(id) {
  for (const page of [settings, editor, second].filter((page) => page && !page.isClosed())) {
    await page.waitForURL((url) => url.searchParams.get("brain") === id && !url.searchParams.has("note"));
    await ready(page);
  }
  assert.equal(gateway.state().activeId, id);
}
async function switchUI(name, id) {
  await ready(settings);
  await row(name).getByRole("button", { name: "Use this brain", exact: true }).click();
  await reloaded(id);
}
async function saved(page) {
  await page.waitForFunction(() => document.getElementById("note-save-state").textContent === "Saved");
}
async function closePage(page) {
  const count = gateway.coordinator.tabs.size;
  page.on("dialog", (dialog) => dialog.accept());
  await page.close();
  await until(() => gateway.coordinator.tabs.size < count, "closed tab did not unregister");
}
async function addProfile(name, kind, destination, key) {
  const oldRevision = gateway.state().revision;
  await settings.locator("#companion-add").evaluate((item) => { item.open = true; });
  await settings.locator("#companion-name").fill(name);
  await settings.locator("#companion-kind").selectOption(kind);
  if (kind === "local") {
    await settings.locator("#companion-folder").click();
    await settings.waitForFunction((value) => document.getElementById("companion-root").value === value, destination);
  } else {
    await settings.locator("#companion-url").fill(destination);
    await settings.locator("#companion-key").fill(key);
  }
  await settings.locator("#companion-form button[type=submit]").click();
  await until(() => gateway.state().revision > oldRevision, "UI profile save did not commit");
  await row(name).locator("strong").waitFor();
  assert.equal(await settings.locator("#companion-key").inputValue(), "");
  return gateway.state().profiles.find((profile) => profile.name === name);
}
async function fixture(brain, index = 0) { return readFile(path.join(roots[brain], "notes", "fixture-" + index + ".md"), "utf8"); }
async function onlyIn(brain, marker) {
  for (const other of brainNames) {
    const content = await fixture(other);
    if (other === brain) assert.ok(content.includes(marker), `${marker} missing from ${other}`);
    else assert.ok(!content.includes(marker), `${marker} leaked into ${other}`);
  }
}
// Node-side live client bound to a real browser tab's registration and the cookie
// session. Lets the WS outlive the page reload a switch causes.
async function liveProbe(tabId, generation) {
  const cookie = (await context.cookies(gateway.url)).map((item) => item.name + "=" + item.value).join("; ");
  const socket = new WebSocket(gateway.url.replace(/^http/, "ws") + "/ws", { origin: gateway.url, headers: { Cookie: cookie } });
  const messages = [];
  const closed = new Promise((resolve) => socket.on("close", (code, reason) => resolve({ code, reason: String(reason) })));
  socket.on("message", (raw) => messages.push(JSON.parse(String(raw))));
  await new Promise((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
  socket.send(JSON.stringify({ id: "probe-hello", method: "hello", params: { protocol: 2, token: "companion-session", generation, tabId } }));
  await until(() => messages.some((item) => item.id === "probe-hello") || socket.readyState !== WebSocket.OPEN, "live probe hello unanswered");
  return { socket, messages, closed, hello: messages.find((item) => item.id === "probe-hello") ?? null };
}
async function noSecrets() {
  const secrets = [controlKey, hostedKeys.h1, hostedKeys.h2];
  const state = JSON.stringify(await (await native("/companion/state")).json());
  const persisted = await readFile(path.join(directory, "connections.json"), "utf8");
  for (const page of context.pages()) {
    const visible = await page.evaluate(() => JSON.stringify({ html: document.documentElement.outerHTML, values: [...document.querySelectorAll("input")].map((input) => input.value), local: { ...localStorage }, session: { ...sessionStorage }, state: companionState }));
    for (const secret of secrets) assert.ok(!visible.includes(secret), "secret in DOM/storage/browser state");
  }
  for (const secret of secrets) {
    assert.ok(!state.includes(secret), "secret in public state");
    assert.ok(!persisted.includes(secret), "plaintext secret in connections metadata");
  }
  assert.deepEqual(errors, [], "unexpected browser JavaScript errors");
}
const profileShape = (state) => state.profiles.map(({ id, name, kind, root, url }) => ({ id, name, kind, root, url }));

try {
  temporary = await realpath(await mkdtemp(path.join(os.tmpdir(), "jb-multi-brain-smoke-")));
  directory = path.join(temporary, "support");
  await mkdir(directory, { mode: 0o700 });
  await mkdir(path.join(temporary, "cli-home"), { mode: 0o700 });
  for (const name of brainNames) {
    roots[name] = path.join(temporary, name);
    await createServerMemoryRuntime({ root: roots[name] }).initializeMemoryRoot();
    for (const [index, id] of ids.entries()) await writeFile(path.join(roots[name], "notes", "fixture-" + index + ".md"), `---\nid: ${id}\ntype: note\ntitle: Smoke ${name} ${index}\n---\nBody ${name} ${index}\n`);
  }
  for (const name of ["h1", "h2"]) servers[name] = await startJumpyBrainHttpServer({ root: roots[name], apiKeys: [hostedKeys[name]], host: "127.0.0.1", port: 0, autoIndex: false });
  assert.notEqual(servers.h1.url, servers.h2.url);
  for (const name of ["h1", "h2"]) assert.match(servers[name].url, /^http:\/\/127\.0\.0\.1:\d+/, "hosted servers must be loopback only");
  gateway = await startGateway();
  gatewayPort = Number(new URL(gateway.url).port);
  await writeFile(path.join(directory, "api-key"), controlKey, { mode: 0o600 });
  const chromium = await loadPlaywrightChromium();
  browser = await launchPlaywrightChromium({ chromium });
  context = await browser.newContext();
  context.setDefaultTimeout(12000);
  context.on("page", (page) => page.on("pageerror", (error) => errors.push(error.message)));
  settings = await context.newPage();
  const p = { a: { id: gateway.state().activeId, name: "Local brain" } };
  let cliBaseline;

  await check("settings adds second local folder and two hosted origins", async () => {
    await settings.goto(gateway.url + "/settings#companion=" + controlKey);
    await ready(settings);
    p.b = await addProfile("Smoke local B", "local", roots.b);
    p.h1 = await addProfile("Smoke hosted one", "remote", servers.h1.url, hostedKeys.h1);
    p.h2 = await addProfile("Smoke hosted two", "remote", servers.h2.url, hostedKeys.h2);
    assert.equal(new Set(Object.values(p).map((item) => item.id)).size, 4, "four distinct profile identities");
    assert.equal(gateway.state().profiles.length, 4);
    assert.equal(keys.size, 2, "exactly the two hosted keys went to the fake credential store");
    await noSecrets();
  });

  await check("standalone CLI baseline resolves its own explicit targets", async () => {
    const local = await cli(["show", "--id", ids[0]], { JUMPYBRAIN_MEMORY_ROOT: roots.cli });
    const hosted = await cli(["show", "--target-url", servers.h1.url, "--id", ids[0]], { JUMPYBRAIN_API_KEY: hostedKeys.h1 });
    assert.equal(local.root, roots.cli); assert.match(local.content, /Body cli 0/);
    assert.match(hosted.content, /Body h1 0/);
    cliBaseline = { local: local.contentHash, hosted: hosted.contentHash };
  });

  editor = await context.newPage();
  await liveControl(editor);
  await editor.goto(gateway.url + "/?brain=" + p.a.id);
  await ready(editor);

  await check("Chromium cycles A→B→hosted1→hosted2→A, saving the open draft before each switch", async () => {
    const order = ["a", "b", "h1", "h2", "a"];
    for (let step = 0; step < order.length - 1; step++) {
      const from = order[step], to = order[step + 1];
      await openEditor(editor, ids[0], p[from].id);
      assert.match(await editorMarkdown(editor), new RegExp("Body " + from + " 0"), `editor not scoped to ${from}`);
      const hold = (await liveControl(editor)).holdNextRequest("edit");
      const marker = `Cycle draft step ${step} from ${from}`;
      const generation = gateway.state().generation;
      try {
        await appendEditorText(editor, marker);
        await until(() => hold.used, "draft did not reach the live transport");
        await row(p[to].name).getByRole("button", { name: "Use this brain", exact: true }).click();
        await editor.waitForFunction(() => document.querySelector("main").inert);
        assert.equal(gateway.state().activeId, p[from].id, "selection changed before the draft write settled");
      } finally {
        hold.release();
      }
      await reloaded(p[to].id);
      assert.ok(gateway.state().generation > generation, "switch must start a new generation");
      await onlyIn(from, marker);
    }
    // Two unpaired notes are untouched everywhere.
    for (const name of brainNames) assert.doesNotMatch(await fixture(name, 1), /Cycle draft/);
    evidence.push("cycle: 4 switches, each draft landed only in its source brain");
  });

  await check("stale HTTP request and live WebSocket scoped to old generation are fenced", async () => {
    await openEditor(editor, ids[0], p.a.id);
    const old = await editor.evaluate(() => ({ tabId: companionTabId, generation: companionState.generation }));
    const probe = await liveProbe(old.tabId, old.generation);
    assert.equal(probe.hello?.ok, true, "probe should connect in the current generation: " + JSON.stringify(probe.hello));
    const response = await native("/companion/switch", { id: p.h1.id });
    assert.equal(response.status, 200, await response.text());
    await reloaded(p.h1.id);
    const closed = await Promise.race([probe.closed, pause(3000).then(() => null)]);
    assert.ok(closed, "old-generation live socket stayed open after switch");
    // Either fence may win the race: generation transition (1008) or retirement of
    // the old local backend destination (1012). Both force a resynchronize.
    assert.ok([1008, 1012].includes(closed.code), "unexpected close " + JSON.stringify(closed));
    assert.match(closed.reason, /session changed|backend changed/i);
    const stale = await browserRequest(settings, "/memories/all/recent", undefined, { "X-Companion-Tab": old.tabId, "X-Companion-Generation": String(old.generation) });
    assert.equal(stale.status, 409); assert.equal(stale.body?.error?.code, "stale_generation");
    const read = await browserRequest(settings, "/memories/all/documents/" + ids[0], undefined, { "X-Companion-Tab": old.tabId, "X-Companion-Generation": String(old.generation) });
    assert.equal(read.status, 409, "stale document read must be fenced");
    assert.ok(!JSON.stringify(read.body ?? "").includes("Body h1 0"), "stale tab must not read the new brain's note");
    const late = await liveProbe(old.tabId, old.generation);
    assert.equal(late.hello?.ok, false, "stale hello must be refused");
    assert.equal(late.hello?.error?.code, "stale_generation");
    late.socket.close();
    evidence.push(`fence: old WS closed ${closed.code} "${closed.reason}"; stale HTTP ${stale.status}/${stale.body.error.code}; stale hello refused`);
  });

  await check("unconfirmed hosted draft safely blocks UI and native switches; retained in editor, not written", async () => {
    second = await context.newPage();
    await openEditor(second, ids[0], p.h1.id);
    // Disposable publication failure: the hosted server never confirms this draft.
    (await liveControl(second)).rejectNext("edit", { message: "Disposable publication failure" });
    await second.bringToFront();
    await appendEditorText(second, "Unconfirmed hosted one draft");
    await second.waitForFunction(() => document.getElementById("note-save-state").textContent === "Changes need review");
    const before = gateway.state();
    await settings.bringToFront();
    await row(p.h2.name).getByRole("button", { name: "Use this brain", exact: true }).click();
    await settings.waitForFunction(() => document.getElementById("toast-message").textContent.includes("unsaved or unconfirmed"));
    await ready(second);
    const response = await native("/companion/switch", { id: p.b.id });
    assert.equal(response.status, 409, await response.text());
    await ready(second);
    assert.equal(gateway.state().activeId, p.h1.id); assert.equal(gateway.state().generation, before.generation);
    assert.match(await editorMarkdown(second), /Unconfirmed hosted one draft/);
    for (const name of brainNames) assert.doesNotMatch(await fixture(name), /Unconfirmed hosted one draft/);
    await closePage(second); second = null; // Deliberate fixture discard after verifying retention.
    evidence.push("blocked: UI toast + native 409 while hosted draft unconfirmed; selection/generation unchanged; nothing written");
  });

  await check("standalone CLI target stays independent of companion selection and credentials", async () => {
    const before = gateway.state();
    const persisted = await readFile(path.join(directory, "connections.json"), "utf8");
    const local = await cli(["show", "--id", ids[0]], { JUMPYBRAIN_MEMORY_ROOT: roots.cli });
    assert.equal(local.root, roots.cli); assert.equal(local.contentHash, cliBaseline.local, "CLI default target drifted with companion");
    const hosted = await cli(["show", "--target-url", servers.h2.url, "--id", ids[0]], { JUMPYBRAIN_API_KEY: hostedKeys.h2 });
    assert.match(hosted.content, /Body h2 0/, "CLI reads hosted two while companion has hosted one active");
    // The companion holds h2's key, but the CLI must not borrow it.
    await assert.rejects(cli(["show", "--target-url", servers.h2.url, "--id", ids[0]], { JUMPYBRAIN_API_KEY: hostedKeys.h1 }), "mismatched CLI key must fail");
    await assert.rejects(cli(["show", "--target-url", servers.h2.url, "--id", ids[0]]), "missing CLI key must fail, not use companion's saved key");
    await cli(["brains", "add", "hosted-two", "--target-url", servers.h2.url, "--key-env", "JUMPYBRAIN_SMOKE_HOSTED_KEY"], { JUMPYBRAIN_SMOKE_HOSTED_KEY: hostedKeys.h2 });
    const named = await cli(["show", "--brain", "hosted-two", "--id", ids[0]], { JUMPYBRAIN_API_KEY: hostedKeys.h1 });
    assert.equal(named.contentHash, hosted.contentHash, "alias uses its own key and reads hosted two while the companion is on hosted one");
    const after = gateway.state();
    assert.equal(after.activeId, before.activeId); assert.equal(after.revision, before.revision); assert.equal(after.generation, before.generation);
    assert.equal(await readFile(path.join(directory, "connections.json"), "utf8"), persisted, "CLI touched companion profiles");
    assert.deepEqual((await readdir(path.join(temporary, "cli-home"))).filter((name) => name !== ".config" && name !== "Library"), [], "unexpected CLI home writes");
    evidence.push(`cli: env root=${path.basename(local.root)} stable; direct and named reads from h2 while companion=h1; wrong/missing direct key rejected`);
  });

  let beforeRestart;
  await check("profile selection persists across companion restart", async () => {
    await switchUI(p.h2.name, p.h2.id);
    beforeRestart = gateway.state();
    const persisted = JSON.parse(await readFile(path.join(directory, "connections.json"), "utf8"));
    assert.equal(persisted.activeId, p.h2.id);
    await gateway.close();
    gateway = await startGateway(gatewayPort);
    const restored = gateway.state();
    assert.equal(restored.activeId, p.h2.id, "restart must keep hosted two selected, not initialRoot");
    assert.deepEqual(profileShape(restored), profileShape(beforeRestart));
    await settings.goto(gateway.url + "/settings#companion=" + controlKey); await ready(settings);
    await openEditor(editor, ids[0], p.h2.id);
    assert.match(await editorMarkdown(editor), /Body h2 0/);
    assert.notEqual(gateway.state().health, "credential_unavailable");
    await switchUI(p.b.name, p.b.id);
    await openEditor(editor, ids[0], p.b.id);
    assert.match(await editorMarkdown(editor), /Body b 0/);
    evidence.push(`restart: active ${p.h2.name} restored on port ${gatewayPort}; 4 profiles identical; post-restart switch to B ok`);
  });

  await check("secrets absent from DOM/storage/state; no browser errors", noSecrets);
} catch (error) {
  failures.push({ stage, message: error.message });
  console.error("  FAIL - " + stage + ": " + (error.stack || error.message));
  for (const [label, page] of [["editor", editor], ["second", second]]) if (page && !page.isClosed()) console.error("  " + label + " state: " + JSON.stringify(await page.evaluate(() => ({
    url: location.search, status: document.getElementById("note-save-state")?.textContent,
    editable: document.querySelector("#note-editor")?.isContentEditable, text: document.querySelector("#note-editor")?.textContent.slice(0, 120),
    focused: document.hasFocus(), active: document.activeElement?.id, collapsed: richEditor.captureSelection?.()?.isCollapsed?.(),
    frozen: companionFrozen, dirty: state.editor?.state.dirty,
  })).catch((error) => error.message)));
  process.exitCode = 1;
} finally {
  await browser?.close().catch((error) => { failures.push({ stage: "cleanup browser", message: error.message }); process.exitCode = 1; });
  await gateway?.close().catch((error) => { failures.push({ stage: "cleanup gateway", message: error.message }); process.exitCode = 1; });
  for (const root of [roots.a, roots.b].filter(Boolean)) {
    await stopRootBackend(root).catch((error) => { failures.push({ stage: "cleanup local backend", message: error.message }); process.exitCode = 1; });
  }
  for (const server of Object.values(servers)) await server?.close().catch((error) => { failures.push({ stage: "cleanup hosted", message: error.message }); process.exitCode = 1; });
  if (temporary) await rm(temporary, { recursive: true, force: true });
  for (const line of evidence) console.log("  evidence - " + line);
  console.log("multi-brain companion smoke: " + (failures.length ? "FAIL" : "PASS") + " (" + passed.length + " checks, " + ((Date.now() - startedAt) / 1000).toFixed(1) + "s; 2 local + 2 loopback hosted, fake credentials, temp HOME)");
}
