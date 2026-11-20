// The server role alone decides what a remote connection may do in the Mac app.
// A production server and gateway with disposable roots and keys: an admin
// connection that an older build had restricted on the device, then reader,
// writer, revoked and unreachable keys, and a local folder.
// Use existing dist (do not build here):
// npx --package=playwright node scripts/server-role-access-smoke.mjs [--shots <directory>]
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startCompanionGateway } from "../integrations/macos-companion/gateway.mjs";
import { startJumpyBrainHttpServer } from "../dist/server/index.js";
import { initializeMemoryRoot } from "../dist/runtime/index.js";
import { loadPlaywrightChromium, launchPlaywrightChromium } from "./playwright-runtime.mjs";

const runtimeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const shots = process.argv.includes("--shots") ? path.resolve(process.argv[process.argv.indexOf("--shots") + 1]) : null;
const setupKey = "disposable-setup-" + randomBytes(16).toString("hex");
const controlKey = randomBytes(32).toString("hex");
const noteId = "mem_a0000000-0000-4000-8000-00000000000a";
const errors = [];
let temporary, remote, gateway, browser, stage = "bootstrap";
const check = async (name, operation) => { stage = name; await operation(); console.log("  ok - " + name); };
const shot = async (page, name) => { if (shots) { await mkdir(shots, { recursive: true }); await page.screenshot({ path: path.join(shots, name + ".png") }); } };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(probe, label, timeout = 12000) {
  const deadline = Date.now() + timeout; let last;
  while (Date.now() < deadline) { last = await probe(); if (last) return last; await pause(50); }
  throw new Error("Timed out waiting for " + label);
}

try {
  temporary = await realpath(await mkdtemp(path.join(os.tmpdir(), "jb-role-access-smoke-")));
  const roots = { local: path.join(temporary, "local"), remote: path.join(temporary, "remote") };
  for (const root of Object.values(roots)) { await mkdir(root); await initializeMemoryRoot(root); }
  const noteFile = path.join(roots.remote, "notes", "shared-plan.md");
  await writeFile(noteFile, `---\nid: ${noteId}\ntype: note\ntitle: Shared plan\n---\nOriginal line\n`);
  const remoteNotes = async () => (await readdir(path.join(roots.remote, "notes"), { recursive: true })).sort();
  remote = await startJumpyBrainHttpServer({ root: roots.remote, apiKeys: [setupKey], host: "127.0.0.1", port: 0, autoIndex: false });
  const server = async (route, method = "GET", body, key = setupKey) => fetch(remote.url + route, { method, headers: { Authorization: "Bearer " + key, ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const issue = async (name, role) => { const packet = await (await server("/access", "POST", { name, role })).json(); return { token: packet.token, id: packet.credential.id }; };
  const ada = await issue("Ada", "admin"), bob = await issue("Bob", "reader"), wren = await issue("Wren", "writer");

  // What an older build left on this Mac: the admin connection is selected, with the device write flag off.
  const support = path.join(temporary, "support"); await mkdir(support, { mode: 0o700 });
  const localId = randomUUID(), remoteId = randomUUID(), credentialRef = "jumpybrain-companion:" + randomUUID();
  const legacy = JSON.stringify({ version: 1, revision: 3, activeId: remoteId, profiles: [
    { id: localId, name: "Local brain", kind: "local", root: roots.local, allowWrites: true },
    { id: remoteId, name: "Team brain", kind: "remote", url: new URL(remote.url).origin, credentialRef, allowWrites: false },
  ] }, null, 2) + "\n";
  const connections = path.join(support, "connections.json");
  await writeFile(connections, legacy, { mode: 0o600 });
  const keys = new Map([[credentialRef, ada.token]]);
  gateway = await startCompanionGateway({ runtimeRoot, directory: support, initialRoot: roots.local, port: 0, controlKey,
    credentials: { get: async ref => keys.get(ref) ?? null, set: async (ref, key) => { keys.set(ref, key); }, delete: async ref => { keys.delete(ref); }, selectFolder: async () => roots.local },
    switchTimeoutMs: 10000, targetTimeoutMs: 5000, identityFile: path.join(temporary, "identity.json") });
  const native = async (route, body) => {
    const response = await fetch(gateway.url + route, { method: body === undefined ? "GET" : "POST", headers: { Authorization: "Bearer " + controlKey, ...(body === undefined ? {} : { "Content-Type": "application/json" }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    assert.equal(response.status, 200, route + " " + await response.clone().text()); return response.json();
  };
  // The app shell polls state every few seconds; that is what refreshes health and the role.
  const appPoll = async () => { await pause(2100); return native("/companion/state"); };

  browser = await launchPlaywrightChromium({ chromium: await loadPlaywrightChromium() });
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  context.setDefaultTimeout(12000);
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  const ready = generation => page.waitForFunction(expected => typeof companionState !== "undefined" && companionRegistered && !companionFrozen && companionState?.phase === "idle" && (expected === null || companionState.generation === expected), generation ?? null);
  const access = () => page.evaluate(() => companionState.access);
  const toast = async () => { await page.locator("#app-toast").waitFor({ state: "visible" }); return { text: await page.locator("#toast-message").textContent(), action: await page.locator("#toast-action").textContent() }; };
  const dismissToast = async () => { if (await page.locator("#app-toast").isVisible()) await page.locator("#toast-close").click(); };
  const openNote = async () => { await page.goto(`${gateway.url}/?note=${noteId}&brain=${remoteId}`); await ready(); await page.locator("#note-editor").waitFor({ state: "visible" }); await page.waitForFunction(() => state.editor?.state.loaded && state.editor.state.liveHasOpened); };
  const typeInNote = async text => { await page.locator("#note-editor").click(); await page.keyboard.press("Meta+ArrowUp"); await page.keyboard.type(text); };
  const effective = async () => ({
    summary: await page.locator("#access-effective-summary").textContent(),
    rows: await page.locator("#access-effective-list li").evaluateAll(items => Object.fromEntries(items.map(item => [item.dataset.capability, item.dataset.allowed + ":" + item.firstElementChild.textContent]))),
  });
  const openAccessSettings = async () => { await page.goto(`${gateway.url}/settings?section=access&brain=${remoteId}`); await ready(); await page.waitForFunction(() => !document.getElementById("access-effective").hidden); };
  // Replacing the key is the only way a connection's role changes; open tabs restart in a new generation.
  const useKey = async token => {
    const before = gateway.state().generation;
    await native("/companion/profiles", { profile: { id: remoteId, name: "Team brain", kind: "remote", url: remote.url, key: token }, revision: gateway.state().revision });
    assert.notEqual(gateway.state().generation, before);
    await ready(gateway.state().generation);
  };
  // Requests the page itself can make through the gateway: HTTP and the live socket.
  const pageWrite = (route, method, body) => page.evaluate(async ([route, method, body]) => {
    try { await graphJson(route, { method, headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() }, ...(body ? { body: JSON.stringify(body) } : {}) }); return { ok: true }; }
    catch (error) { return { ok: false, status: error.status, code: error.code }; }
  }, [route, method, body]);
  const liveEdit = () => page.evaluate(([documentId]) => new Promise((resolve, reject) => {
    const socket = new WebSocket(location.origin.replace(/^http/, "ws") + "/ws"), replies = new Map(); let serial = 0;
    const rpc = (method, params) => new Promise(done => { const id = "smoke-" + (++serial); replies.set(id, done); socket.send(JSON.stringify({ id, method, params })); });
    socket.onmessage = event => { const packet = JSON.parse(event.data); replies.get(packet.id)?.(packet); };
    socket.onerror = () => reject(new Error("live socket failed")); setTimeout(() => reject(new Error("live socket timed out")), 8000);
    socket.onopen = async () => {
      const hello = await rpc("hello", { protocol: 2, token: "companion-session", generation: companionState.generation, tabId: companionTabId });
      const opened = await rpc("open", { documentId, clientId: "smoke-direct" });
      const edit = await rpc("edit", { documentId, clientId: "smoke-direct", epoch: opened.result?.epoch, baseRevision: opened.result?.revision, operationId: crypto.randomUUID(), start: 0, deleteCount: 0, insert: "LIVE " });
      socket.close(); resolve({ role: hello.result?.principal?.role, opened: opened.ok, edit: edit.ok ? "ok" : edit.error?.code });
    };
  }), [noteId]);

  await check("an admin connection the old build had made read-only opens writable; keys and the old file are kept", async () => {
    await page.goto(`${gateway.url}/?brain=${remoteId}#companion=${controlKey}`); await ready();
    assert.deepEqual(await access(), { source: "server", role: "admin", capabilities: ["read", "write", "manage_access"], name: "Ada" });
    assert.equal(await page.evaluate(() => "allowWrites" in companionState.active), false);
    assert.equal(await readFile(connections, "utf8"), legacy, "opening the upgraded app does not rewrite the old file");
    assert.equal(keys.get(credentialRef), ada.token); assert.equal(keys.size, 1);
    assert.equal(await page.locator("#companion-access-notice").isHidden(), true, "no access banner in the workspace");
    assert.doesNotMatch(await page.locator("#companion-active").getAttribute("aria-label"), /read only|admin|access/i, "the footer shows no access detail");
    await openNote();
    assert.equal(await page.locator("#note-editor").getAttribute("contenteditable"), "true");
    await typeInNote("Admin wrote this. ");
    await until(async () => (await readFile(noteFile, "utf8")).includes("Admin wrote this. Original line"), "the admin edit on the server");
    assert.equal((await liveEdit()).edit, "ok");
    await until(async () => (await readFile(noteFile, "utf8")).includes("LIVE Admin wrote this."), "the direct live edit on the server");
  });
  await check("Settings alone shows effective access; an admin manages keys with no device approval", async () => {
    await openAccessSettings();
    const shown = await effective();
    assert.match(shown.summary, /^Admin · key “Ada”\. Set by the server from this key’s role, not on this device\.$/);
    assert.deepEqual(shown.rows, { read: "true:Allowed", write: "true:Allowed", manage_access: "true:Allowed" });
    await page.locator("#access-keys-form").waitFor();
    assert.equal(await page.locator("#access-keys-name").isDisabled(), false);
    await page.locator("#access-keys-name").fill("Laptop agent"); await page.locator("#access-keys-create").click();
    await page.locator("#access-keys-new").waitFor();
    assert.match(await page.locator("#access-keys-secret").inputValue(), /^jb_/);
    await page.locator("#access-keys-done").click();
    await shot(page, "admin-access");
    await page.locator('[data-settings-section="brains"]').click();
    await page.waitForFunction(() => document.body.dataset.settingsPage === "brains");
    const row = page.locator(".companion-profile[aria-current=true]");
    assert.match(await row.textContent(), /Admin access/); assert.doesNotMatch(await row.textContent(), /Read only/);
    await row.getByRole("button", { name: "Edit" }).click();
    assert.equal(await page.locator("#companion-writes").count(), 0, "no device write toggle");
    assert.match(await page.locator("#companion-role-help").textContent(), /set by the key’s role on the server/);
    await shot(page, "admin-connection-form");
    await page.locator("#companion-cancel").click();
    assert.equal(await readFile(connections, "utf8"), legacy, "viewing Settings is not a save");
  });

  await check("a reader key keeps every action visible, explains the restriction with a Settings action, and changes nothing", async () => {
    await openNote();
    const before = await readFile(noteFile, "utf8"), files = await remoteNotes();
    await useKey(bob.token);
    assert.equal((await readFile(connections, "utf8")).includes("allowWrites"), false, "the deliberate key change dropped the old flag from disk");
    assert.equal(keys.size, 1, "the replaced key was the only one removed"); assert.equal([...keys.values()][0], bob.token);
    assert.deepEqual(await access(), { source: "server", role: "reader", capabilities: ["read"], name: "Bob" });
    assert.equal(await page.locator("#companion-access-notice").isHidden(), true);
    assert.doesNotMatch(await page.locator("#companion-active").textContent(), /read only|reader/i);
    // New note stays available and explains itself.
    assert.equal(await page.locator("#new-note").isVisible(), true); assert.equal(await page.locator("#new-note").isDisabled(), false);
    await page.locator("#new-note").click();
    const explained = await toast();
    assert.equal(explained.text, "Creating a note needs a writer or admin key. Your key for “Team brain” has reader access."); assert.equal(explained.action, "Open Settings");
    await shot(page, "reader-blocked-new-note");
    assert.deepEqual(await remoteNotes(), files);
    // Creating a drawing explains itself the same way.
    await dismissToast();
    if (await page.locator("#new-drawing").isHidden()) await page.locator("#drawings-disclosure").click();
    await page.waitForFunction(() => { const control = document.getElementById("new-drawing"); return control.offsetParent !== null && !control.disabled; });
    assert.equal(await page.locator("#drawing-create-reason").isHidden(), true);
    await page.locator("#new-drawing").click();
    assert.equal((await toast()).text, "Creating a drawing needs a writer or admin key. Your key for “Team brain” has reader access.");
    // The note is readable; trying to edit it explains too.
    await dismissToast(); await openNote();
    assert.notEqual(await page.locator("#note-editor").getAttribute("contenteditable"), "true");
    assert.match(await page.locator("#note-editor").textContent(), /Admin wrote this\. Original line/);
    await page.locator("#note-editor").click({ force: true }); await page.keyboard.type("x");
    assert.match((await toast()).text, /^Editing this note needs a writer or admin key\. Your key for “Team brain” has reader access\.$/);
    // Refused over HTTP and over the live socket, by the gateway and by the server.
    assert.deepEqual(await pageWrite("/memories/all/notes", "POST", { type: "note", body: "", dailyDate: "2026-05-01" }), { ok: false, status: 403, code: "read_only" });
    assert.deepEqual(await pageWrite("/memories/all/index", "POST", {}), { ok: false, status: 403, code: "read_only" });
    assert.deepEqual(await pageWrite("/access", "POST", { name: "Mine", role: "admin" }), { ok: false, status: 403, code: "admin_required" });
    assert.deepEqual(await liveEdit(), { role: "reader", opened: true, edit: "read_only" });
    assert.equal((await server("/memories/all/notes", "POST", { type: "note", body: "", dailyDate: "2026-05-02" }, bob.token)).status, 403, "the server refuses the same key without the app");
    assert.equal(await readFile(noteFile, "utf8"), before); assert.deepEqual(await remoteNotes(), files);
    // The explanation's action opens the access details in Settings.
    await page.locator("#toast-action").click();
    await page.waitForFunction(() => state.view === "settings" && document.body.dataset.settingsPage === "access" && !document.getElementById("access-effective").hidden);
    assert.equal(await page.locator("#app-toast").isHidden(), true, "using the action dismisses the explanation");
    const shown = await effective();
    assert.match(shown.summary, /^Reader · key “Bob”\./);
    assert.deepEqual(shown.rows, { read: "true:Allowed", write: "false:Not allowed", manage_access: "false:Not allowed" });
    assert.equal(await page.locator("#access-keys-form").isVisible(), true, "key creation stays visible");
    assert.equal(await page.locator("#access-keys-name").isDisabled(), true); assert.equal(await page.locator("#access-keys-create").isDisabled(), true);
    assert.match(await page.locator("#access-keys-role-hint").textContent(), /needs an admin key\. Yours has reader access\./);
    assert.equal(await page.locator("#access-keys-list").isHidden(), true, "a reader is shown no keys");
    await shot(page, "reader-access");
    await page.setViewportSize({ width: 390, height: 780 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, "the access details fit a narrow window");
    assert.equal(await page.locator("#access-effective-list li").last().isVisible(), true);
    await shot(page, "reader-access-narrow");
    await page.setViewportSize({ width: 1280, height: 860 });
    // Refresh index in Settings stays available and explains.
    await page.locator('[data-settings-section="brains"]').click(); await page.waitForFunction(() => document.body.dataset.settingsPage === "brains");
    assert.match(await page.locator(".companion-profile[aria-current=true]").textContent(), /Reader access/);
    assert.equal(await page.locator("#companion-refresh-index").isDisabled(), false);
    await dismissToast(); await page.locator("#companion-refresh-index").click();
    assert.match((await toast()).text, /^Refreshing the search index needs a writer or admin key\./);
    assert.equal(await readFile(noteFile, "utf8"), before);
  });

  await check("a writer key edits but cannot manage access; its unsaved typing is saved before the key changes", async () => {
    await dismissToast(); await useKey(wren.token);
    assert.deepEqual(await access(), { source: "server", role: "writer", capabilities: ["read", "write"], name: "Wren" });
    assert.deepEqual(await pageWrite("/access", "POST", { name: "Mine", role: "admin" }), { ok: false, status: 403, code: "admin_required" });
    assert.equal((await server("/access", "GET", undefined, wren.token)).status, 403);
    await openAccessSettings();
    const shown = await effective();
    assert.match(shown.summary, /^Writer · key “Wren”\./);
    assert.deepEqual(shown.rows, { read: "true:Allowed", write: "true:Allowed", manage_access: "false:Not allowed" });
    assert.equal(await page.locator("#access-keys-create").isDisabled(), true);
    assert.match(await page.locator("#access-keys-role-hint").textContent(), /Yours has writer access/);
    await shot(page, "writer-access");
    await openNote();
    assert.equal(await page.locator("#note-editor").getAttribute("contenteditable"), "true");
    // Type, then change the key at once: the tab's save barrier publishes the draft under the writer key first.
    await typeInNote("Writer draft kept. ");
    await useKey(bob.token);
    assert.match(await readFile(noteFile, "utf8"), /Writer draft kept\. LIVE Admin wrote this\./, "the draft reached the server before the role changed");
    assert.equal((await access()).role, "reader");
    await openNote();
    assert.match(await page.locator("#note-editor").textContent(), /Writer draft kept\./);
    assert.notEqual(await page.locator("#note-editor").getAttribute("contenteditable"), "true");
    assert.equal((await liveEdit()).edit, "read_only");
  });

  await check("a revoked key and an unreachable server pause changes with an explanation; nothing is granted from memory", async () => {
    await useKey(wren.token);
    const before = await readFile(noteFile, "utf8"), files = await remoteNotes();
    assert.deepEqual(await (await server("/access/" + wren.id, "DELETE")).json(), { revoked: true });
    // Before the app notices, the remembered role still grants nothing: the server refuses.
    assert.deepEqual(await pageWrite("/memories/all/notes", "POST", { type: "note", body: "", dailyDate: "2026-05-03" }), { ok: false, status: 401, code: "invalid_api_key" });
    assert.equal((await appPoll()).health, "authentication_failed");
    await page.waitForFunction(() => companionState.access?.role === null && companionState.access.reason === "authentication_failed");
    assert.equal(await page.locator("#new-note").isDisabled(), false);
    await dismissToast(); await page.locator("#new-note").click();
    assert.equal((await toast()).text, "Creating a note is paused: the app could not confirm what your access key may do on “Team brain”.");
    assert.deepEqual(await pageWrite("/memories/all/notes", "POST", { type: "note", body: "", dailyDate: "2026-05-04" }), { ok: false, status: 403, code: "access_unconfirmed" });
    await dismissToast(); await openAccessSettings();
    const shown = await effective();
    assert.match(shown.summary, /^Not confirmed\./);
    assert.deepEqual(shown.rows, { read: "false:Not allowed", write: "false:Not allowed", manage_access: "false:Not allowed" });
    await shot(page, "revoked-access");
    assert.equal(await readFile(noteFile, "utf8"), before); assert.deepEqual(await remoteNotes(), files);
    // A good key again, then the server goes away.
    await useKey(ada.token);
    assert.equal((await access()).role, "admin");
    await remote.close(); remote = null;
    assert.notEqual((await appPoll()).health, "connected");
    await page.waitForFunction(() => companionState.access?.role === null);
    await page.goto(`${gateway.url}/?brain=${remoteId}`); await ready();
    await page.waitForFunction(() => companionState.access?.role === null);
    await dismissToast(); await page.locator("#new-note").click();
    assert.match((await toast()).text, /^Creating a note is paused: the app could not confirm/);
    assert.equal((await pageWrite("/memories/all/notes", "POST", { type: "note", body: "", dailyDate: "2026-05-05" })).ok, false);
    assert.deepEqual(await remoteNotes(), files);
  });

  await check("a local folder stays fully the user's own, with no server role involved", async () => {
    const before = gateway.state().generation;
    await native("/companion/switch", { id: localId });
    assert.notEqual(gateway.state().generation, before);
    await ready(gateway.state().generation);
    assert.deepEqual(await access(), { source: "local", role: "admin", capabilities: ["read", "write", "manage_access"] });
    await page.goto(`${gateway.url}/settings?section=access&brain=${localId}`); await ready();
    await page.waitForFunction(() => !document.getElementById("access-effective").hidden);
    assert.match((await effective()).summary, /^Full access\. This brain is a folder on this device/);
    assert.match(await page.locator("#access-keys-intro").textContent(), /needs no access keys/);
    assert.equal(await page.locator("#access-keys-form").isHidden(), true);
    await shot(page, "local-access");
    await page.goto(`${gateway.url}/?brain=${localId}`); await ready();
    assert.equal(await page.locator("#new-note").isDisabled(), false);
    await dismissToast(); await page.locator("#new-note").click();
    await page.waitForFunction(() => state.view === "note" && state.editor?.state.loaded);
    assert.equal((await readdir(path.join(roots.local, "notes"), { recursive: true })).some(name => name.endsWith(".md")), true, "the local note was created");
    assert.equal(await page.locator("#app-toast").isVisible() && /writer or admin key|paused/.test(await page.locator("#toast-message").textContent()), false);
  });
  assert.deepEqual(errors, [], "page errors");
  console.log("PASS: server roles decide app access; old device restrictions are gone, keys kept, blocked actions explain themselves.");
} catch (error) {
  console.error("FAIL at: " + stage); console.error(error); if (errors.length) console.error("page errors:", errors); process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {}); await gateway?.close().catch(() => {}); await remote?.close().catch(() => {});
  if (temporary) await rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
}
