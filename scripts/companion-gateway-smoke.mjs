// Production gateway + production Chromium shell; disposable roots/credentials only.
// Use existing dist (do not build here):
// npx --package=playwright node scripts/companion-gateway-smoke.mjs
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startCompanionGateway } from "../integrations/macos-companion/gateway.mjs";
import { createServerMemoryRuntime, startJumpyBrainHttpServer } from "../dist/server/index.js";
import { loadPlaywrightChromium, launchPlaywrightChromium } from "./playwright-runtime.mjs";
import { appendEditorText, editorMarkdown } from "./editor-smoke-helpers.mjs";

const runtimeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const controlKey = randomBytes(32).toString("hex");
const remoteKey = "disposable-remote-" + randomBytes(16).toString("hex");
const repairedKey = "disposable-repaired-" + randomBytes(16).toString("hex");
const ids = ["mem_a0000000-0000-4000-8000-000000000001", "mem_a0000000-0000-4000-8000-000000000002"];
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const startedAt = Date.now();
const passed = [], failures = [], errors = [], traffic = [];
let temporary, gateway, remote, browser, context, settings, editor, second;
let stage = "bootstrap";
const keys = new Map();
const roots = {};
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
async function until(predicate, message) {
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) { if (await predicate()) return; await pause(30); }
  throw new Error(message || "condition timed out");
}
function native(route, body) {
  return fetch(gateway.url + route, {
    method: body === undefined ? "GET" : "POST",
    headers: { Authorization: "Bearer " + controlKey, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(15000),
  });
}
async function browserRequest(page, route, body, headers = {}) {
  return page.evaluate(async ({ route, body, headers }) => {
    const response = await fetch(route, { method: body === undefined ? "GET" : "POST", headers: { ...headers, ...(body === undefined ? {} : { "Content-Type": "application/json" }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json() };
  }, { route, body, headers });
}
function row(name) { return settings.locator(".companion-profile").filter({ hasText: name }); }
async function ready(page) {
  await page.waitForFunction(() => companionRegistered && !companionFrozen && companionState.phase === "idle");
}
async function openEditor(page, id, brain) {
  await page.goto(gateway.url + "/?note=" + id + "&brain=" + brain);
  await page.locator("#note-editor").waitFor();
  await ready(page);
}
async function switchUI(name, id) {
  await ready(settings);
  await row(name).getByRole("button", { name: "Use this brain", exact: true }).click();
  await reloaded(id);
}
async function reloaded(id) {
  for (const page of [settings, editor, second].filter((page) => page && !page.isClosed())) {
    await page.waitForURL((url) => url.searchParams.get("brain") === id && !url.searchParams.has("note"));
    await ready(page);
  }
  assert.equal(gateway.state().activeId, id);
}
async function saved(page) {
  await page.waitForFunction(() => document.getElementById("note-save-state").textContent === "Saved");
}
async function delayWrites(page) {
  await page.route("**/memories/all/documents/*", async (route) => {
    if (route.request().method() === "PUT") await pause(1400);
    await route.continue(); // Never synthesize the memory/control response.
  });
}
async function closePage(page) {
  const count = gateway.coordinator.tabs.size;
  page.on("dialog", (dialog) => dialog.accept());
  await page.close();
  await until(() => gateway.coordinator.tabs.size < count, "closed tab did not unregister");
}
async function addProfile(name, kind, destination, key, writes = false) {
  const oldRevision = gateway.state().revision;
  await settings.locator("#companion-name").fill(name);
  await settings.locator("#companion-kind").selectOption(kind);
  if (kind === "local") {
    await settings.locator("#companion-folder").click();
    await settings.waitForFunction((value) => document.getElementById("companion-root").value === value, destination);
  } else {
    await settings.locator("#companion-url").fill(destination);
    assert.equal(await settings.locator("#companion-writes").isChecked(), false);
    await settings.locator("#companion-key").fill(key);
    if (writes) await settings.locator("#companion-writes").check();
  }
  await settings.locator("#companion-form button[type=submit]").click();
  await until(() => gateway.state().revision > oldRevision, "UI profile save did not commit");
  await row(name).locator("strong").waitFor();
  assert.equal(await settings.locator("#companion-key").inputValue(), "");
  return gateway.state().profiles.find((profile) => profile.name === name);
}
async function createInEditor(page, marker) {
  const creation = page.waitForResponse((response) => response.url().endsWith("/memories/all/notes") && response.request().method() === "POST");
  await page.locator("#home-new").click();
  const response = await creation;
  assert.equal(response.status(), 200, await response.text());
  const packet = await response.json();
  await page.waitForURL((url) => url.searchParams.get("note") === packet.id);
  await page.locator("#note-editor").waitFor();
  await appendEditorText(page, marker);
  await saved(page);
  return packet.id;
}
async function noSecrets() {
  const secrets = [controlKey, remoteKey, repairedKey];
  const state = JSON.stringify((await (await native("/companion/state")).json()));
  const persisted = await readFile(path.join(temporary, "support", "connections.json"), "utf8");
  assert.ok(!state.includes("credentialRef"), "public state exposes credential reference");
  for (const page of context.pages()) {
    const visible = await page.evaluate(() => JSON.stringify({ html: document.documentElement.outerHTML, values: [...document.querySelectorAll("input")].map((input) => input.value), local: { ...localStorage }, session: { ...sessionStorage }, state: companionState, token: companionToken }));
    for (const secret of secrets) assert.ok(!visible.includes(secret), "secret in DOM/storage/browser state");
    assert.ok(!page.url().includes(controlKey), "bootstrap fragment not stripped");
    assert.equal(await page.evaluate(() => localStorage.getItem("smoke.unrelated.preference")), "untouched-smoke-browser-key");
  }
  for (const secret of secrets) {
    assert.ok(!state.includes(secret), "secret in public state");
    assert.ok(!persisted.includes(secret), "plaintext secret in connections metadata");
  }
  assert.ok((await context.cookies()).every((cookie) => cookie.httpOnly && cookie.sameSite === "Strict"));
  assert.ok(traffic.filter((item) => item.path.startsWith("/memories/")).every((item) => !item.authorization && item.tab && Number.isSafeInteger(Number(item.generation))), "browser memory request lacks registration fence or sends bearer");
  assert.deepEqual(errors, [], "unexpected browser JavaScript errors");
}

try {
  temporary = await realpath(await mkdtemp(path.join(os.tmpdir(), "jb-real-gateway-smoke-")));
  const directory = path.join(temporary, "support");
  await mkdir(directory, { mode: 0o700 });
  for (const name of ["a", "b", "remote"]) {
    roots[name] = path.join(temporary, name);
    await createServerMemoryRuntime({ root: roots[name] }).initializeMemoryRoot();
    for (const [index, id] of ids.entries()) await writeFile(path.join(roots[name], "notes", "fixture-" + index + ".md"), `---\nid: ${id}\ntype: note\ntitle: Smoke ${name} ${index}\n---\nBody ${name} ${index}\n`);
  }
  remote = await startJumpyBrainHttpServer({ root: roots.remote, apiKeys: [remoteKey, repairedKey], host: "127.0.0.1", port: 0, autoIndex: false });
  gateway = await startCompanionGateway({ runtimeRoot, directory, initialRoot: roots.a, port: 0, controlKey, credentials, switchTimeoutMs: 10000, targetTimeoutMs: 5000 });
  assert.ok(Number.isSafeInteger(gateway.state().generation) && gateway.state().generation > 0);
  const chromium = await loadPlaywrightChromium();
  browser = await launchPlaywrightChromium({ chromium });
  context = await browser.newContext();
  context.setDefaultTimeout(12000);
  await context.addInitScript(() => { try { localStorage.setItem("smoke.unrelated.preference", "untouched-smoke-browser-key"); } catch {} });
  context.on("page", (page) => {
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => {
      const headers = request.headers();
      traffic.push({ path: new URL(request.url()).pathname, method: request.method(), authorization: headers.authorization, tab: headers["x-companion-tab"], generation: headers["x-companion-generation"] });
    });
  });
  settings = await context.newPage();
  const a = gateway.state().activeId;
  let b, r, oldGeneration, oldTabs;
  await check("settings session + UI local/remote profiles", async () => {
    await settings.goto(gateway.url + "/settings#companion=" + controlKey);
    await ready(settings);
    assert.equal(new URL(settings.url()).hash, "");
    assert.equal(traffic.some((item) => item.path.startsWith("/memories/")), false, "settings fetched memories");
    b = await addProfile("Smoke local B", "local", roots.b);
    r = await addProfile("Smoke remote", "remote", remote.url, remoteKey, true);
    await row("Smoke remote").getByRole("button", { name: "Edit", exact: true }).click();
    assert.equal(await settings.locator("#companion-writes").isChecked(), true);
    await settings.locator("#companion-url").fill("https://different-destination.invalid");
    assert.equal(await settings.locator("#companion-writes").isChecked(), false, "URL replacement must require fresh write approval");
    await settings.locator("#companion-cancel").click();
    await noSecrets();
  });
  editor = await context.newPage();
  await editor.goto(gateway.url + "/?brain=" + a);
  await ready(editor);
  await check("local UI note creation + editor write", async () => {
    const id = await createInEditor(editor, "Created through local editor");
    const document = await createServerMemoryRuntime({ root: roots.a }).readMemoryDocument(id);
    assert.match(document.content, /Created through local editor/);
  });
  second = await context.newPage();
  await check("two editor drafts flush A before UI switch; all tabs reload B", async () => {
    await openEditor(editor, ids[0], a);
    await openEditor(second, ids[1], a);
    await delayWrites(editor); await delayWrites(second);
    oldGeneration = gateway.state().generation;
    oldTabs = [...gateway.coordinator.tabs.keys()];
    await appendEditorText(editor, "A first pending draft");
    await appendEditorText(second, "A second pending draft");
    await row("Smoke local B").getByRole("button", { name: "Use this brain", exact: true }).click();
    await editor.waitForFunction(() => document.querySelector("main").inert);
    assert.equal(await editor.locator("#note-name").evaluate((element) => element.readOnly), true);
    assert.equal(gateway.state().activeId, a, "selection changed before draft write settled");
    await reloaded(b.id);
    for (const [index, marker] of ["A first pending draft", "A second pending draft"].entries()) {
      assert.match(await readFile(path.join(roots.a, "notes", "fixture-" + index + ".md"), "utf8"), new RegExp(marker));
      assert.doesNotMatch(await readFile(path.join(roots.b, "notes", "fixture-" + index + ".md"), "utf8"), /pending draft/);
    }
    await editor.unroute("**/memories/all/documents/*"); await second.unroute("**/memories/all/documents/*");
  });
  await check("retired positively acked polls accepted; unknown/stale memory rejected", async () => {
    for (const tabId of oldTabs) {
      const response = await browserRequest(settings, "/companion/poll", { tabId, generation: oldGeneration });
      assert.equal(response.status, 200);
      assert.equal(response.body.activeId, b.id);
    }
    assert.equal((await browserRequest(settings, "/companion/poll", { tabId: randomUUID(), generation: oldGeneration })).status, 409);
    assert.equal((await browserRequest(settings, "/companion/poll", { tabId: randomUUID(), generation: gateway.state().generation })).status, 409);
    assert.equal((await browserRequest(settings, "/memories/all/recent", undefined, { "X-Companion-Tab": oldTabs[0], "X-Companion-Generation": String(oldGeneration) })).status, 409);
  });
  await check("real 412 conflict blocks UI and native switches without overwrite", async () => {
    await openEditor(editor, ids[0], b.id); await openEditor(second, ids[0], b.id);
    await appendEditorText(editor, "Confirmed B first writer"); await saved(editor);
    const conflict = second.waitForResponse((response) => response.request().method() === "PUT" && response.url().includes("/documents/"));
    await appendEditorText(second, "Retained B conflicting draft");
    assert.equal((await conflict).status(), 412, "must exercise real optimistic-concurrency conflict");
    await second.waitForFunction(() => document.getElementById("note-save-state").textContent === "Changes need review");
    const writes = traffic.filter((item) => item.method === "PUT").length;
    await row("Local brain").getByRole("button", { name: "Use this brain", exact: true }).click();
    await settings.waitForFunction(() => document.getElementById("companion-feedback").textContent.includes("unsaved or unconfirmed"));
    await ready(second);
    assert.equal(gateway.state().activeId, b.id);
    const response = await native("/companion/switch", { id: a });
    assert.equal(response.status, 409, await response.text());
    await ready(second);
    assert.equal(gateway.state().activeId, b.id);
    assert.match(await editorMarkdown(second), /Retained B conflicting draft/);
    assert.equal(traffic.filter((item) => item.method === "PUT").length, writes, "barrier retried conflicted write");
    const content = await readFile(path.join(roots.b, "notes", "fixture-0.md"), "utf8");
    assert.match(content, /Confirmed B first writer/); assert.doesNotMatch(content, /Retained B conflicting draft/);
  });
  await closePage(second); second = null;
  await check("native bearer switch flushes old draft through same barrier", async () => {
    await delayWrites(editor);
    await appendEditorText(editor, "Native B barrier draft");
    const operation = native("/companion/switch", { id: r.id });
    await editor.waitForFunction(() => document.querySelector("main").inert);
    assert.equal(gateway.state().activeId, b.id);
    const response = await operation; assert.equal(response.status, 200, await response.text());
    await reloaded(r.id);
    assert.match(await readFile(path.join(roots.b, "notes", "fixture-0.md"), "utf8"), /Native B barrier draft/);
    await editor.unroute("**/memories/all/documents/*");
  });
  await check("remote UI note creation + editor write", async () => {
    const id = await createInEditor(editor, "Created through remote editor");
    const document = await createServerMemoryRuntime({ root: roots.remote }).readMemoryDocument(id);
    assert.match(document.content, /Created through remote editor/);
  });
  await check("failed remote save blocks active key repair without changing credentials", async () => {
    second = await context.newPage();
    await openEditor(editor, ids[0], r.id); await openEditor(second, ids[0], r.id);
    await appendEditorText(editor, "Confirmed remote first writer"); await saved(editor);
    const conflict = second.waitForResponse((response) => response.request().method() === "PUT" && response.url().includes("/documents/"));
    await appendEditorText(second, "Retained remote conflicting draft");
    assert.equal((await conflict).status(), 412);
    await second.waitForFunction(() => document.getElementById("note-save-state").textContent === "Changes need review");
    const before = gateway.state(), beforeCredentials = [...keys.entries()];
    const response = await native("/companion/profiles", {
      profile: { ...r, key: repairedKey }, revision: before.revision,
    });
    assert.equal(response.status, 409, await response.text());
    await ready(second);
    assert.equal(gateway.state().generation, before.generation);
    assert.equal(gateway.state().revision, before.revision);
    assert.deepEqual([...keys.entries()], beforeCredentials);
    assert.match(await editorMarkdown(second), /Retained remote conflicting draft/);
    assert.doesNotMatch(await readFile(path.join(roots.remote, "notes", "fixture-0.md"), "utf8"), /Retained remote conflicting draft/);
    await closePage(second); second = null;
  });
  await check("active remote key repair uses save barrier + generation reload", async () => {
    await openEditor(editor, ids[0], r.id); await delayWrites(editor);
    await appendEditorText(editor, "Remote draft before key repair");
    const generation = gateway.state().generation;
    await row("Smoke remote").getByRole("button", { name: "Edit", exact: true }).click();
    await settings.locator("#companion-key").fill(repairedKey);
    await settings.locator("#companion-form button[type=submit]").click();
    await editor.waitForFunction(() => document.querySelector("main").inert);
    assert.equal(gateway.state().generation, generation);
    await editor.waitForURL((url) => !url.searchParams.has("note"));
    await until(() => gateway.state().generation === generation + 1);
    await reloaded(r.id);
    assert.match(await readFile(path.join(roots.remote, "notes", "fixture-0.md"), "utf8"), /Remote draft before key repair/);
    await editor.unroute("**/memories/all/documents/*");
    await noSecrets();
  });
  await check("read-only remote blocks UI editing and gateway create", async () => {
    const generation = gateway.state().generation;
    await row("Smoke remote").getByRole("button", { name: "Edit", exact: true }).click();
    await settings.locator("#companion-writes").uncheck();
    await settings.locator("#companion-form button[type=submit]").click();
    await until(() => gateway.state().generation === generation + 1);
    await reloaded(r.id);
    await openEditor(editor, ids[0], r.id);
    assert.equal(await editor.locator("#note-editor").getAttribute("contenteditable"), "false");
    assert.equal(await editor.locator("#new-note").isDisabled(), true);
    const headers = await editor.evaluate(() => ({ "X-Companion-Tab": companionTabId, "X-Companion-Generation": String(companionState.generation) }));
    const response = await browserRequest(editor, "/memories/all/notes", { type: "note", title: "Must not create", body: "Denied" }, { ...headers, "Idempotency-Key": randomUUID() });
    assert.equal(response.status, 403); assert.equal(response.body.error.code, "write_not_authorized");
  });
  await check("missing credential stays selected; offline remote stays selected", async () => {
    await switchUI("Smoke local B", b.id);
    keys.clear();
    await switchUI("Smoke remote", r.id);
    assert.equal(gateway.state().health, "credential_unavailable");
    assert.equal(JSON.parse(await readFile(path.join(directory, "connections.json"), "utf8")).activeId, r.id);
    // Restore only the fake credential map; do not touch native Keychain.
    keys.set(gateway.store.get(r.id).credentialRef, repairedKey);
    await switchUI("Smoke local B", b.id);
    await remote.close(); remote = null;
    await switchUI("Smoke remote", r.id);
    assert.equal(gateway.state().health, "offline");
    assert.equal(JSON.parse(await readFile(path.join(directory, "connections.json"), "utf8")).activeId, r.id);
  });
  await check("destination replacement gets a new identity; old note bookmark cannot cross brains", async () => {
    const replacement = path.join(temporary, "replacement");
    await createServerMemoryRuntime({ root: replacement }).initializeMemoryRoot();
    await writeFile(path.join(replacement, "notes", "fixture.md"), `---\nid: ${ids[0]}\ntype: note\ntitle: Replacement brain\n---\nReplacement private body\n`);
    await row("Smoke local B").getByRole("button", { name: "Edit", exact: true }).click();
    await settings.locator("#companion-root").fill(replacement);
    await settings.locator("#companion-form button[type=submit]").click();
    await until(() => gateway.store.snapshot().profiles.some((profile) => profile.root === replacement));
    const changed = gateway.store.snapshot().profiles.find((profile) => profile.root === replacement);
    assert.notEqual(changed.id, b.id);
    await settings.waitForFunction((root) => document.getElementById("companion-profiles").textContent.includes(root), replacement);
    await switchUI("Smoke local B", changed.id);
    await editor.goto(gateway.url + "/?brain=" + b.id + "&note=" + ids[0]);
    await ready(editor);
    assert.equal(new URL(editor.url()).searchParams.has("note"), false);
    assert.match(await editor.locator("#companion-banner").textContent(), /not scoped/);
    assert.doesNotMatch(await editor.locator("body").innerText(), /Replacement private body/);
    b = changed;
  });
  await check("restart fences dirty tabs; clean reconnect leaves no ghost registration", async () => {
    second = await context.newPage();
    await second.goto(gateway.url + "/?brain=" + b.id); await ready(second);
    await openEditor(editor, ids[0], b.id);
    await editor.route("**/memories/all/documents/*", async (route) => {
      if (route.request().method() === "PUT") await route.abort(); else await route.continue();
    });
    await appendEditorText(editor, "Retained restart draft");
    await editor.waitForFunction(() => document.getElementById("note-save-state").textContent === "Save failed");
    const port = new URL(gateway.url).port;
    await gateway.close();
    gateway = await startCompanionGateway({ runtimeRoot, directory, initialRoot: roots.a, port: Number(port), controlKey, credentials, switchTimeoutMs: 10000, targetTimeoutMs: 5000 });
    assert.equal(gateway.state().activeId, b.id, "restart must preserve selected profile");
    await settings.goto(gateway.url + "/settings#companion=" + controlKey); await ready(settings);
    await editor.evaluate(() => startCompanion());
    assert.match(await editorMarkdown(editor), /Retained restart draft/);
    assert.equal(new URL(editor.url()).searchParams.get("note"), ids[0], "dirty tab must not reload into the new process session");
    await second.evaluate(() => startCompanion());
    await ready(second);
    await until(() => gateway.coordinator.tabs.size === 2, "clean reconnect leaked an abandoned registration");
    editor.on("dialog", (dialog) => dialog.accept());
    await editor.close(); editor = null; // Deliberate fixture discard after verifying preservation.
    await switchUI("Local brain", a);
    assert.equal(gateway.coordinator.tabs.size, 2, "subsequent switch/reload must keep exactly the two open pages");
  });
  await check("secrets absent DOM/storage/state; browser requests fenced", noSecrets);
} catch (error) {
  failures.push({ stage, message: error.message });
  console.error("  FAIL - " + stage + ": " + error.message);
  process.exitCode = 1;
} finally {
  // Close browser before coordinator/server: no leftover tabs, Chromium, or roots.
  await browser?.close().catch((error) => { failures.push({ stage: "cleanup browser", message: error.message }); process.exitCode = 1; });
  await gateway?.close().catch((error) => { failures.push({ stage: "cleanup gateway", message: error.message }); process.exitCode = 1; });
  await remote?.close().catch((error) => { failures.push({ stage: "cleanup remote", message: error.message }); process.exitCode = 1; });
  if (temporary) await rm(temporary, { recursive: true, force: true });
  console.log("companion real gateway Chromium smoke: " + (failures.length ? "FAIL" : "PASS") + " (" + passed.length + " checks, " + ((Date.now() - startedAt) / 1000).toFixed(1) + "s; production gateway/shell, disposable Markdown roots, no CLI configuration)");
}
