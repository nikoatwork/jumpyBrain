// Disposable control-plane fixture + production nonce shell/Lexical. No native app,
// key files, user folders, real remote targets, or installed companion are touched.
// Each profile is a real disposable backend; the production companion live bridge
// (attachCompanionLive) carries /ws editing, since editor saves are live-only.
// npm run build && npx --package=playwright node scripts/companion-browser-smoke.mjs
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { graphPageHtml } from "../dist/adapters/http-server/graph-page.js";
import { createServerMemoryRuntime, startJumpyBrainHttpServer } from "../dist/server/index.js";
import { attachCompanionLive } from "../integrations/macos-companion/live-gateway.mjs";
import { roleCapabilities } from "../dist/adapters/access-control/index.js";
import { loadPlaywrightChromium, launchPlaywrightChromium } from "./playwright-runtime.mjs";
import { appendEditorText, replaceEditorText, editorMarkdown, selectEditorText } from "./editor-smoke-helpers.mjs";
import { installCollaborationSmokeTransport } from "./collaboration-smoke-transport.mjs";

const root = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-companion-browser-"));
const { version } = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const id = "mem_a0000000-0000-4000-8000-000000000001";
// Navigation search hides the open page, so Search from a note needs a sibling.
const siblingId = "mem_a0000000-0000-4000-8000-000000000002";
const profiles = [
  { id: "a", name: "Fixture A", kind: "local", root: path.join(root, "a") },
  { id: "b", name: "Fixture B", kind: "local", root: path.join(root, "b") },
  { id: "r", name: "Fixture remote", kind: "remote", url: "https://fixture.invalid" },
];
// Canonical Markdown lives in real disposable brains, one backend per profile.
const initialBodies = { a: "Fixture a\n", b: "Fixture b\n", r: "Fixture r\n- [ ] Read-only task\n```js\n[[Inert]]\n```\n" };
const noteFile = (brain, file = "fixture.md") => path.join(root, "brains", brain, "notes", file);
const canonical = (brain, file) => readFileSync(noteFile(brain, file), "utf8");
const canonicalBody = (brain) => canonical(brain).replace(/^---\n[\s\S]*?\n---\n/, "");
const backends = {}, backendKeys = {};
for (const brain of ["a", "b", "r"]) {
  const brainRoot = path.join(root, "brains", brain);
  await createServerMemoryRuntime({ root: brainRoot }).initializeMemoryRoot();
  await writeFile(noteFile(brain), `---\nid: ${id}\ntype: note\ntitle: Fixture ${brain}\n---\n${initialBodies[brain]}`);
  await writeFile(noteFile(brain, "sibling.md"), `---\nid: ${siblingId}\ntype: note\ntitle: Fixture ${brain} sibling\n---\nSibling ${brain}\n`);
  backendKeys[brain] = "disposable-companion-browser-" + brain;
  backends[brain] = await startJumpyBrainHttpServer({ root: brainRoot, apiKeys: [backendKeys[brain]], host: "127.0.0.1", port: 0, autoIndex: false });
}
let activeId = "a", generation = 1, revision = 1, phase = "idle", switchId = null, target = null;
let switchSequence = 0, pendingSwitch = null, failCapture = false, pollDelay = 0;
let failIndex = false, searchDelay = 0;
const tabs = new Map(), requests = [], profileWrites = [], violations = [], pollCounts = new Map(), switchCommits = [];
// Effective access as the real gateway reports it: a local folder is the user's own; the
// fixture remote is reached with a reader key. `accessOverride` stands in for a role change.
const localAccess = { source: "local", role: "admin", capabilities: ["read", "write", "manage_access"] };
const readerAccess = { source: "server", role: "reader", capabilities: ["read"], name: "Fixture reader" };
let accessOverride = null;
const accessFor = (id) => accessOverride ?? (profiles.find((item) => item.id === id)?.kind === "remote" ? readerAccess : localAccess);
const canWrite = (id) => accessFor(id).capabilities.includes("write");
const snapshot = () => ({ profiles, activeId, generation, revision, phase, switchId, target, access: accessFor(activeId),
  extensions: { revision: "fixture-extensions-1" }, health: { status: "connected" }, active: profiles.find((item) => item.id === activeId) });
const json = (response, body, status = 200) => {
  response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  response.end(JSON.stringify(body));
};
const error = (response, code, status = 409) => json(response, { error: { code, message: code } }, status);
// Minimal switch coordinator for the production live bridge: generation fence,
// registered tabs, and admitted live writes that a committing switch must drain.
const transitions = new Set();
let liveWritesInFlight = 0;
const coordinator = {
  get generation() { return generation; }, closing: false,
  onTransition(listener) { transitions.add(listener); return () => transitions.delete(listener); },
  enter(tabGeneration, tabId) {
    if (tabGeneration !== generation || !tabs.has(tabId)) throw Object.assign(new Error("This tab belongs to an old brain session."), { code: "stale_generation" });
    liveWritesInFlight++;
    let done = false;
    return () => { if (!done) { done = true; liveWritesInFlight--; commitSwitchWhenDrained(); } };
  },
};
const announceTransition = () => { for (const listener of transitions) listener(); };
function commitSwitchWhenDrained() {
  if (pendingSwitch?.acknowledged && !liveWritesInFlight) finishSwitch(true);
}
function finishSwitch(ok) {
  const pending = pendingSwitch;
  if (!pending) return;
  clearTimeout(pending.timer);
  // Evidence that every acknowledged save reached canonical Markdown before activation.
  if (ok) { switchCommits.push({ from: activeId, to: target, content: canonical(activeId) }); activeId = target; generation++; revision++; }
  phase = "idle"; target = null; switchId = null; pendingSwitch = null;
  if (ok) announceTransition();
  if (ok) json(pending.response, snapshot()); else error(pending.response, "switch_blocked");
}
async function proxy(response, route, method = "GET") {
  const backend = backends[activeId];
  const upstream = await fetch(backend.url + route, { method, headers: { Authorization: "Bearer " + backendKeys[activeId] } });
  response.writeHead(upstream.status, { "Content-Type": upstream.headers.get("content-type") || "application/json", "Cache-Control": "no-store" });
  response.end(Buffer.from(await upstream.arrayBuffer()));
}
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://fixture");
    if (["/", "/settings", "/graph"].includes(url.pathname)) {
      response.writeHead(200, { "Content-Type": "text/html", "Content-Security-Policy": "default-src 'none'; script-src 'nonce-fixture'; style-src 'nonce-fixture'; connect-src 'self'; img-src 'self'; base-uri 'none'" });
      response.end(graphPageHtml("fixture", url.pathname === "/settings" ? "settings" : "home", { companion: true })); return;
    }
    if (url.pathname === "/favicon.svg") { response.writeHead(204); response.end(); return; }
    let raw = ""; for await (const chunk of request) raw += chunk;
    const body = raw ? JSON.parse(raw) : undefined;
    requests.push({ path: url.pathname, method: request.method, body, generation, headers: request.headers });
    if (url.pathname === "/companion/session") {
      if (body?.token !== "fixture-token") { error(response, "session_invalid", 401); return; }
      response.setHeader("Set-Cookie", "fixture-session=ok; HttpOnly; SameSite=Strict; Path=/"); json(response, {}); return;
    }
    if (!request.headers.cookie?.includes("fixture-session=ok")) { error(response, "session_required", 401); return; }
    // The live session handshake: the selected brain's real identity and protocol.
    if (url.pathname === "/capabilities" && request.method === "GET") {
      if (request.headers.authorization) violations.push("browser bearer credential");
      if (Number(request.headers["x-companion-generation"]) !== generation) { error(response, "stale_generation"); return; }
      await proxy(response, "/capabilities"); return;
    }
    if (url.pathname.startsWith("/companion/")) {
      const route = url.pathname.slice(11);
      if (route === "extensions") { json(response, { apiVersion: 1, revision: "fixture-extensions-1", safeMode: false, extensions: [] }); return; }
      if (route === "extensions/event") { json(response, {}); return; }
      if (route === "state") { json(response, snapshot()); return; }
      if (route === "register") { tabs.set(body.tabId, { generation: body.generation }); json(response, snapshot()); return; }
      if (route === "poll") {
        const count = (pollCounts.get(body.tabId) || 0) + 1; pollCounts.set(body.tabId, count);
        if (count > 1) violations.push("overlapping poll");
        await new Promise((resolve) => setTimeout(resolve, pollDelay));
        pollCounts.set(body.tabId, count - 1); json(response, snapshot()); return;
      }
      if (route === "unregister") { if (tabs.get(body.tabId)?.generation === body.generation) tabs.delete(body.tabId); json(response, {}); return; }
      if (route === "select-folder") { json(response, { path: path.join(root, "picked") }); return; }
      if (route === "test") { json(response, { health: { status: "connected" } }); return; }
      if (route === "profiles") {
        profileWrites.push(body);
        if (body.revision !== revision) { error(response, "revision_conflict"); return; }
        const existing = profiles.find((item) => item.id === body.profile.id);
        if (existing) Object.assign(existing, { ...body.profile, key: undefined });
        else profiles.push({ ...body.profile, id: "saved-" + revision, key: undefined });
        revision++; json(response, snapshot()); return;
      }
      if (route === "remove") { error(response, "fixture_remove_not_used"); return; }
      if (route === "switch") {
        if (pendingSwitch) { error(response, "switch_busy"); return; }
        phase = "preparing"; switchId = "s" + ++switchSequence; target = body.id;
        pendingSwitch = { response, waiting: new Set(tabs.keys()), acknowledged: false, timer: setTimeout(() => finishSwitch(false), 7000) };
        if (!pendingSwitch.waiting.size) { pendingSwitch.acknowledged = true; commitSwitchWhenDrained(); }
        return;
      }
      if (route === "ack") {
        json(response, {});
        if (!pendingSwitch || body.switchId !== switchId) return;
        if (!body.ok) finishSwitch(false);
        else { pendingSwitch.waiting.delete(body.tabId); if (!pendingSwitch.waiting.size) { pendingSwitch.acknowledged = true; commitSwitchWhenDrained(); } }
        return;
      }
    }
    if (url.pathname.startsWith("/memories/all/")) {
      const tab = request.headers["x-companion-tab"];
      if (!tabs.has(tab)) violations.push("memory before registration");
      if (request.headers.authorization) violations.push("browser bearer credential");
      if (Number(request.headers["x-companion-generation"]) !== generation) { error(response, "stale_generation"); return; }
      if (url.pathname === "/memories/all/index") {
        assert.equal(request.method, "POST");
        assert.deepEqual(body, {});
        if (!canWrite(activeId)) { error(response, "read_only", 403); return; }
        await new Promise((resolve) => setTimeout(resolve, 1000));
        if (failIndex) error(response, "index_failed", 503); else json(response, { index: { stale: false } });
        return;
      }
      if (url.pathname === "/memories/all/search") {
        await new Promise((resolve) => setTimeout(resolve, searchDelay));
        json(response, { results: [{ provenance: { file: "notes/fixture.md", metadata: { id, title: "Fixture " + activeId } }, snippet: "Synthetic search result" },
          { provenance: { file: "notes/sibling.md", metadata: { id: siblingId, title: "Fixture " + activeId + " sibling" } }, snippet: "Synthetic sibling result" }],
        recognition: { version: 1, candidateLimit: 120, candidates: 2, matched: 2, partial: true, metadataUnavailable: 2 }, index: { stale: false } }); return;
      }
      if (url.pathname === "/memories/all/ensure-title") {
        assert.equal(request.method, "POST");
        if (!canWrite(activeId)) { error(response, "read_only", 403); return; }
        assert.equal(body.title, "Fixture " + activeId);
        json(response, { status: "found", id, created: false }); return;
      }
      if (url.pathname === "/memories/all/recent") { json(response, { notes: [{ id, title: "Fixture " + activeId, createdAt: "2026-01-01" }] }); return; }
      if (url.pathname === "/memories/all/attention") {
        assert.equal(request.method, "GET");
        json(response, { memory: "all", target: "remote", root: "remote:all", notes: [{ id, title: "Fixture " + activeId, file: "notes/fixture.md", createdAt: "2026-01-01", attentionAt: "2026-01-01" }] }); return;
      }
      if (url.pathname === "/memories/all/notes") {
        if (failCapture) { error(response, "fixture_unconfirmed_creation", 503); return; }
        json(response, { id }); return;
      }
      if (url.pathname === "/memories/all/graph.json") { json(response, { nodes: [], edges: [] }); return; }
      if ([id, siblingId].some((documentId) => url.pathname === "/memories/all/documents/" + documentId)) {
        // Saves publish over the live socket only; an HTTP write would bypass it.
        if (request.method !== "GET") { violations.push("HTTP document write " + request.method); error(response, "fixture_live_only", 405); return; }
        await proxy(response, url.pathname); return;
      }
    }
    error(response, "not_found", 404);
  } catch (exception) { violations.push(exception.message); error(response, "fixture_failure", 500); }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = "http://127.0.0.1:" + server.address().port;
const live = attachCompanionLive({ server, coordinator, origin: () => origin, roleCapabilities,
  authenticate: (request) => { if (!request.headers.cookie?.includes("fixture-session=ok")) throw new Error("session_required"); },
  active: () => profiles.find((profile) => profile.id === activeId),
  destination: async (profile) => ({ url: backends[profile.id].url, key: backendKeys[profile.id] }) });
const liveEdits = (transport) => transport.observed.filter((message) => message.method === "edit").length;
const saved = (page) => page.waitForFunction(() => document.getElementById("note-save-state").textContent === "Saved");
async function keepMyChanges(page) {
  await page.locator("#note-recover").click();
  await page.waitForFunction(() => document.getElementById("document-recovery").open && !document.getElementById("recovery-publish").disabled);
  await page.getByRole("button", { name: "Keep my changes", exact: true }).click();
  await saved(page);
}
// Count completed production polls rather than relying on an arbitrary sleep.
async function idlePolls(page, count = 3) {
  for (let poll = 0; poll < count; poll++) {
    const response = await page.waitForResponse((response) => response.url() === origin + "/companion/poll" && response.ok());
    assert.equal((await response.json()).phase, "idle");
    await page.evaluate(() => new Promise(requestAnimationFrame));
  }
}
let browser;
try {
  const chromium = await loadPlaywrightChromium();
  browser = await launchPlaywrightChromium({ chromium });
  const context = await browser.newContext();
  await context.addInitScript(() => localStorage.setItem("jumpybrain.graph.apiKey", "untouched-browser-key"));
  const settings = await context.newPage();
  const pageErrors = [];
  settings.on("pageerror", (exception) => pageErrors.push(exception.message));
  await settings.goto(origin + "/settings#companion=fixture-token");
  await settings.locator("#companion-profiles strong").first().waitFor();
  assert.equal(await settings.locator("#companion-settings [data-app-version]").textContent(), "jumpyBrain · Version " + version);
  assert.equal(await settings.locator("#companion-active").getAttribute("data-state"), "connected", "Settings uses confirmed host health before any memory request");
  if (await settings.locator("html").getAttribute("data-theme") !== "dark") await settings.evaluate(() => colorTheme.setPreference(document.documentElement.dataset.theme === "dark" ? "light" : "dark"));
  assert.equal(await settings.locator("body").evaluate((el) => getComputedStyle(el).backgroundColor), "rgb(28, 27, 25)");
  assert.equal(await settings.locator("#companion-kind").evaluate((el) => getComputedStyle(el).color), "rgb(216, 208, 192)");
  // Closed <details> content skips rendering, so its colour transition only settles once shown.
  await settings.evaluate(() => { document.querySelector("#companion-add").open = true; });
  await settings.waitForFunction(() => getComputedStyle(document.querySelector("#companion-name")).backgroundColor === "rgb(28, 27, 25)");
  await settings.evaluate(() => { document.querySelector("#companion-add").open = false; });
  await settings.evaluate(() => colorTheme.setPreference(document.documentElement.dataset.theme === "dark" ? "light" : "dark"));
  assert.equal(await settings.locator("body").evaluate((el) => getComputedStyle(el).backgroundColor), "rgb(230, 218, 196)");
  await settings.evaluate(() => colorTheme.setPreference("system"));
  assert.equal(new URL(settings.url()).hash, "");
  assert.equal(await settings.evaluate(() => localStorage.getItem("jumpybrain.graph.apiKey")), null, "legacy local-server credential must be forgotten");
  // Boards live in the brain (Settings → Boards and the sidebar list them), so the board
  // collection is the only memory read Settings startup may make: no notes, attention or search.
  assert.deepEqual(requests.filter((item) => item.path.startsWith("/memories/") && !(item.path === "/memories/all/boards" && item.method === "GET")).map((item) => item.path), [], "settings startup needs no memory fetch beyond the board collection");
  await settings.waitForFunction(() => document.getElementById("extension-status").textContent === "No extensions installed.");
  assert.equal(await settings.locator(".extension-palette").isVisible(), false, "no palette control without custom themes");
  // Inspect the shipped Settings, including long destinations and touch-sized icon actions.
  const screenshotDir = process.env.JUMPYBRAIN_SMOKE_SCREENSHOT_DIR;
  if (screenshotDir) await mkdir(screenshotDir, { recursive: true });
  assert.equal(await settings.getByRole("list", { name: "Saved brains" }).count(), 1);
  assert.equal(await settings.locator(".companion-header").getByRole("button", { name: "Refresh search index", exact: true }).count(), 1);
  assert.equal(await settings.locator("#companion-add").getAttribute("open"), null);
  await settings.locator(".companion-profile").first().getByRole("button", { name: "Edit", exact: true }).focus();
  await idlePolls(settings);
  assert.equal(await settings.evaluate(() => document.activeElement?.getAttribute("aria-label")), "Edit", "idle polls retain focused row controls");
  // Settings is a modal card over the app: the sidebar stays behind it but inert.
  assert.equal(await settings.locator("#app-sidebar").evaluate(el => el.inert), true);
  assert.equal(await settings.getByRole("dialog", { name: /Settings/ }).isVisible(), true);
  assert.equal(await settings.locator("#settings-back").isVisible(), true);
  await settings.keyboard.press(process.platform === "darwin" ? "Meta+f" : "Control+f");
  assert.equal(await settings.evaluate(() => document.activeElement?.id), "settings-search", "Cmd/Ctrl+F focuses settings search");
  await settings.keyboard.type("ocean");
  await settings.locator("#settings-panel-appearance").waitFor({ state: "visible" });
  assert.equal(await settings.locator("#settings-panel-brains").isHidden(), true);
  assert.equal(await settings.getByRole("radio", { name: "Ocean", exact: true }).isVisible(), true);
  assert.equal(await settings.getByRole("radio", { name: "Dark", exact: true }).isVisible(), false, "search narrows to the matching group");
  await settings.locator("#settings-search").fill("zzzz-no-setting");
  await settings.locator("#settings-search-empty").waitFor({ state: "visible" });
  await settings.keyboard.press("Escape");
  assert.equal(await settings.locator("#settings-search").inputValue(), "", "first Escape clears the search");
  await settings.locator("#settings-panel-brains").waitFor({ state: "visible" });
  assert.equal(await settings.locator("#companion-settings").isVisible(), true);
  await settings.locator('[data-settings-section="appearance"]').click();
  await settings.getByRole("radio", { name: "Dark", exact: true }).check();
  assert.equal(await settings.locator("html").getAttribute("data-theme"), "dark");
  await settings.getByRole("radio", { name: "Light", exact: true }).check();
  assert.equal(await settings.locator("html").getAttribute("data-theme"), "light");
  await settings.getByRole("radio", { name: "System", exact: true }).check();
  await settings.getByRole("radio", { name: "System", exact: true }).focus();
  await settings.keyboard.press("ArrowRight");
  assert.equal(await settings.getByRole("radio", { name: "Light", exact: true }).isChecked(), true);
  await settings.keyboard.press("ArrowRight");
  assert.equal(await settings.getByRole("radio", { name: "Dark", exact: true }).isChecked(), true);
  await settings.getByRole("radio", { name: "Ocean", exact: true }).check();
  assert.equal(await settings.locator("body").evaluate(el => getComputedStyle(el).backgroundColor), "rgb(22, 33, 43)");
  await settings.getByRole("radio", { name: "Mono", exact: true }).focus();
  await settings.keyboard.press("Space");
  assert.equal(await settings.locator("html").getAttribute("data-palette"), "mono");
  await settings.reload();
  await settings.getByRole("radio", { name: "Mono", exact: true }).waitFor();
  assert.equal(await settings.getByRole("radio", { name: "Mono", exact: true }).isChecked(), true);
  assert.equal(await settings.getByRole("radio", { name: "Dark", exact: true }).isChecked(), true);
  const appearancePeer = await context.newPage();
  await appearancePeer.goto(origin + "/settings?section=appearance");
  await appearancePeer.getByRole("radio", { name: "Ocean", exact: true }).check();
  await settings.waitForFunction(() => document.documentElement.dataset.palette === "ocean");
  assert.equal(await settings.getByRole("radio", { name: "Ocean", exact: true }).isChecked(), true);
  await appearancePeer.close();
  await settings.getByRole("radio", { name: "Ember", exact: true }).check();
  await settings.getByRole("radio", { name: "System", exact: true }).check();
  await settings.locator('[data-settings-section="extensions"]').click();
  await settings.locator("#extension-reload").waitFor({ state: "visible" });
  await settings.goBack();
  await settings.locator("#appearance-options").waitFor({ state: "visible" });
  await settings.goForward();
  await settings.locator("#extension-reload").waitFor({ state: "visible" });
  await settings.reload();
  await settings.locator("#extension-reload").waitFor({ state: "visible" });
  await settings.locator("#extension-reload").focus();
  await settings.keyboard.press("Escape");
  await settings.locator("#home").waitFor({ state: "visible" });
  assert.equal(await settings.locator("#companion-settings").isHidden(), true, "Escape closes settings");
  assert.equal(await settings.locator("#app-sidebar").evaluate(el => el.inert), false);
  await settings.locator("#open-connection").click();
  await settings.locator("#settings-back").click();
  await settings.locator("#home").waitFor({ state: "visible" });
  await settings.locator("#open-connection").click();
  await settings.locator("#companion-profiles").waitFor({ state: "visible" });
  for (const theme of ["light", "dark"]) {
    await settings.evaluate((value) => colorTheme.setPreference(value), theme);
    for (const width of [1280, 390, 320]) {
      await settings.setViewportSize({ width, height: 900 });
      const layout = await settings.locator("#companion-settings").evaluate((el) => {
        const controls = [...el.querySelectorAll(".icon-button")].filter(item => item.checkVisibility());
        return { fits: el.scrollWidth <= el.clientWidth && document.documentElement.scrollWidth <= innerWidth, controls: controls.map(item => {
          const box = item.getBoundingClientRect();
          return { width: box.width, height: box.height, text: item.textContent.trim(), label: item.getAttribute("aria-label"), fits: box.left >= 0 && box.right <= innerWidth };
        }) };
      });
      assert.equal(layout.fits, true, theme + " " + width + " Settings overflow");
      for (const control of layout.controls) {
        assert.ok(control.label && !control.text && control.fits, "named, visible icon actions");
        assert.ok(control.width >= (width <= 680 ? 40 : 32) && control.height >= (width <= 680 ? 40 : 32));
      }
      for (const section of ["brains", "appearance", "extensions"]) {
        await settings.locator(`[data-settings-section="${section}"]`).click();
        assert.equal(await settings.locator(`[data-settings-section="${section}"]`).getAttribute("aria-current"), "page");
        assert.equal(await settings.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, section + " " + width + " overflow");
        if (section === "appearance") {
          for (const palette of ["Ember", "Ocean", "Mono", "Pride"]) {
            await settings.getByRole("radio", { name: palette, exact: true }).check();
            assert.equal(await settings.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, palette + " appearance overflow");
            if (screenshotDir) await settings.screenshot({ path: path.join(screenshotDir, `appearance-${palette}-${theme}-${width}.png`), fullPage: true, animations: "disabled" });
          }
          await settings.getByRole("radio", { name: "Ember", exact: true }).check();
        }
        if (screenshotDir) await settings.screenshot({ path: path.join(screenshotDir, "settings-" + section + "-" + theme + "-" + width + ".png"), fullPage: true, animations: "disabled" });
      }
      await settings.locator('[data-settings-section="brains"]').click();
    }
  }
  await settings.setViewportSize({ width: 1280, height: 900 });
  await settings.evaluate(() => colorTheme.setPreference("system"));
  await settings.locator("#companion-refresh-index").click();
  await settings.waitForFunction(() => document.getElementById("companion-refresh-index").disabled);
  assert.equal(await settings.locator("#companion-name").isDisabled(), true);
  await settings.waitForFunction(() => document.getElementById("toast-message").textContent.includes("Search index refreshed"));
  assert.equal(requests.filter((item) => item.path === "/memories/all/index").length, 1);
  failIndex = true;
  await settings.locator("#companion-refresh-index").click();
  await settings.waitForFunction(() => document.getElementById("app-toast").dataset.error === "true");
  await settings.waitForFunction(() => !document.getElementById("companion-refresh-index").disabled);
  failIndex = false;
  await settings.locator("#companion-form-heading").click();
  await settings.locator("#companion-folder").click();
  await settings.waitForFunction((root) => document.getElementById("companion-root").value === root, path.join(root, "picked"));
  await settings.locator("#companion-kind").selectOption("remote");
  assert.equal(await settings.locator("#companion-writes").count(), 0, "no device write toggle");
  assert.match(await settings.locator("#companion-role-help").textContent(), /set by the key’s role on the server/);
  await settings.locator("#companion-name").fill("Disposable remote");
  await settings.locator("#companion-url").fill("https://disposable.invalid");
  await settings.locator("#companion-key").fill("fixture-secret-write-only");
  await settings.locator("#companion-form button[type=submit]").click();
  await settings.waitForFunction(() => document.getElementById("toast-message").textContent.includes("Connection saved"));
  assert.equal("allowWrites" in profileWrites[0].profile, false, "the form sends no device permission");
  assert.equal(await settings.locator("#companion-key").inputValue(), "");
  await settings.waitForFunction(() => document.getElementById("companion-profiles").textContent.includes("Disposable remote"));
  const savedRow = settings.locator(".companion-profile").filter({ hasText: "Disposable remote" });
  await savedRow.getByRole("button", { name: "Edit", exact: true }).click();
  assert.equal(await settings.locator("#companion-key").inputValue(), "");
  await settings.locator("#companion-form button[type=submit]").click();
  await settings.waitForFunction(() => document.getElementById("toast-message").textContent.includes("Connection saved"));
  assert.equal(Object.hasOwn(profileWrites[1].profile, "key"), false, "blank preserves existing key");

  const editor = await context.newPage(); editor.on("pageerror", (exception) => pageErrors.push(exception.message));
  // Editor saves publish over the live socket; inject faults there (before navigation).
  const editorWire = await installCollaborationSmokeTransport(editor);
  const failedSearches = [];
  editor.on("requestfailed", (request) => { if (request.url() === origin + "/memories/all/search") failedSearches.push(request.failure()?.errorText); });
  await editor.goto(origin + "/");
  await editor.locator("#companion-brain-switch").waitFor({ state: "visible" });
  for (const width of [1280, 390, 320]) {
    await editor.setViewportSize({ width, height: 850 });
    for (const theme of ["light", "dark"]) {
      await editor.evaluate(theme => colorTheme.setPreference(theme), theme);
      // Exercise the native header inset without touching an installed app.
      await editor.evaluate(() => { document.documentElement.dataset.nativeMac = "true"; });
      const layout = await editor.evaluate(() => {
        const wrapper = document.getElementById("companion-active");
        const brain = wrapper.getBoundingClientRect();
        const select = document.getElementById("companion-brain-switch");
        const row = select.getBoundingClientRect();
        const dot = wrapper.querySelector(":scope > .status-dot").getBoundingClientRect();
        const icons = document.getElementById("graph-link").getBoundingClientRect();
        const brand = document.getElementById("home-link");
        return { brainBottom: brain.bottom, iconsTop: icons.top, iconsBottom: icons.bottom, iconsLeft: icons.left,
          rowLeft: row.left, rowHeight: row.height, wrapperTitle: wrapper.hasAttribute("title"),
          dotInside: dot.left >= row.left && dot.right <= row.right && dot.top >= row.top && dot.bottom <= row.bottom,
          dotTarget: document.elementFromPoint(dot.left + dot.width / 2, dot.top + dot.height / 2) === select,
          chevron: select.querySelector(".dropdown-chevron path")?.getAttribute("d"),
          brandFits: brand.scrollWidth <= brand.clientWidth, overflow: document.documentElement.scrollWidth > innerWidth };
      });
      assert.ok(layout.brainBottom <= layout.iconsTop, "brain switcher sits above the footer icons");
      // One full-row switcher: the dot overlays the select, so its hover wash and pointer target cover the dot.
      assert.equal(layout.rowHeight, width <= 680 ? 40 : 36, "switcher row is 36px (40px narrow)");
      assert.equal(layout.dotInside && layout.dotTarget, true, "status dot sits inside the switcher's hover target");
      assert.ok(Math.abs(layout.rowLeft - layout.iconsLeft) <= 0.5, "switcher row aligns with the footer icons");
      assert.equal(layout.wrapperTitle, false, "one tooltip source: no native title on the wrapper");
      assert.equal(layout.chevron, "m7 15 5 5 5-5M7 9l5-5 5 5", "switcher uses the shared chevrons-up-down glyph");
      assert.ok(layout.iconsBottom <= 850, "footer remains within the viewport");
      assert.equal(layout.brandFits, true, "wordmark fits beside native traffic-light inset");
      assert.equal(layout.overflow, false, "brain footer fits narrow layouts");
      if (screenshotDir) await editor.screenshot({ path: path.join(screenshotDir, `sidebar-brain-${theme}-${width}.png`), animations: "disabled" });
    }
  }
  await editor.evaluate(() => { delete document.documentElement.dataset.nativeMac; });
  await editor.setViewportSize({ width: 1280, height: 850 });
  await editor.locator("#home-search").click();
  await idlePolls(editor);
  assert.equal(await editor.locator("#note-search").evaluate((dialog) => dialog.open), true, "idle polls preserve Search opened from Home without typing");
  await editor.locator("#note-search-input").fill("Fixture");
  await editor.locator("#search-results [role=option]").first().waitFor();
  await editor.locator("#note-search-input").press("Enter");
  await editor.waitForURL("**/?note=" + id + "&brain=a");
  await editor.locator("#note-editor").waitFor();
  // Editing is locked until the live session through the companion bridge opens.
  await editor.waitForFunction(() => state.editor?.state.liveHasOpened && document.querySelector("#note-editor").isContentEditable);

  // A permission change can hide a focused formatting control. Keep focus on a
  // visible, non-mutating header action, including when the body is read-only.
  await editor.locator('#toggle-note-format').click();
  await editor.locator('[data-format=bold]').focus();
  const beforePermissionChange = canonical('a');
  accessOverride = readerAccess;
  await editor.locator('#toggle-note-format').waitFor({ state: 'hidden' });
  assert.equal(await editor.evaluate(() => document.activeElement.id), 'copy-note-draft');
  assert.equal(await editor.locator('#format-controls').isHidden(), true);
  assert.equal(canonical('a'), beforePermissionChange);
  accessOverride = null;
  await editor.locator('#toggle-note-format').waitFor({ state: 'visible' });

  // Settings entry saves first, replaces note navigation, and Back restores this note.
  // Hold the live edit: Settings must wait until the canonical file has it.
  const settingsSave = editorWire.holdNextRequest("edit");
  await appendEditorText(editor, " Saved before Settings.");
  await settingsSave.arrived;
  await editor.locator("#open-connection").click();
  await editor.waitForFunction(() => state.editor?.state.navigationPending);
  assert.equal(await editor.locator("#settings-navigation").isVisible(), false, "Settings waits for the in-flight save");
  assert.doesNotMatch(canonical("a"), /Saved before Settings/);
  settingsSave.release();
  await editor.locator("#settings-navigation").waitFor({ state: "visible" });
  // Settings is a modal card: note navigation stays behind it, inert.
  const historyInert = () => editor.locator(".workspace-history").evaluate((element) => Boolean(element.closest("[inert]")));
  assert.equal(await historyInert(), true);
  assert.match(canonical("a"), /Saved before Settings\./, "the canonical file has the edit before Settings opens");
  await editor.locator('[data-settings-section="appearance"]').click();
  await editor.locator("#settings-back").click();
  await editor.locator("#note-editor").waitFor({ state: "visible" });
  assert.equal(new URL(editor.url()).searchParams.get("note"), id);
  assert.equal(await editor.locator(".workspace-history").isVisible(), true);
  assert.equal(await historyInert(), false);
  assert.match(await editorMarkdown(editor), /Saved before Settings\./, "the Settings round trip keeps the draft");
  // A failed save keeps the note and its draft; Settings must never take over.
  // A rejected live publication needs explicit review: Review -> Keep my changes.
  const rejectedSave = editorWire.rejectNext("edit", { code: "source_unavailable", message: "Disposable publication failure" });
  await appendEditorText(editor, " Failed Settings draft.");
  await rejectedSave.arrived;
  await editor.locator("#open-connection").click();
  await editor.locator("#note-save-state").filter({ hasText: "Changes need review" }).waitFor();
  assert.equal(await editor.locator("#settings-navigation").isVisible(), false);
  assert.match(await editorMarkdown(editor), /Failed Settings draft/);
  assert.doesNotMatch(canonical("a"), /Failed Settings draft/);
  await keepMyChanges(editor);
  assert.match(canonical("a"), /Failed Settings draft\./, "the kept draft reaches the canonical file");
  // Temporarily reveal Settings when notes navigation is collapsed; restore on exit.
  await editor.locator("#toggle-sidebar").click();
  await editor.evaluate(() => openConnection(false));
  await editor.locator("#settings-back").waitFor({ state: "visible" });
  assert.equal(await editor.evaluate(() => localStorage.getItem("jumpybrain.sidebarCollapsed")), "true");
  await editor.locator("#settings-back").click();
  await editor.locator("#note-editor").waitFor({ state: "visible" });
  assert.equal(await editor.locator("#app-sidebar").isVisible(), false);
  await editor.locator("#toggle-sidebar").click();
  // Graph return retains the app destination too.
  await editor.locator("#graph-link").click();
  await editor.locator("#open-connection").click();
  await editor.locator("#settings-back").click();
  await editor.waitForURL("**/graph?brain=a");
  await editor.locator("#navigate-back").click();
  await editor.waitForFunction(() => state.view === "note" && !navigation.isBusy());
  await editor.locator("#navigate-forward").click();
  await editor.waitForFunction(() => state.view === "graph" && !navigation.isBusy());
  await editor.evaluate((id) => navigation.navigate("/?note=" + id), id);
  await editor.locator("#note-editor").waitFor({ state: "visible" });
  // Guarded graph/Settings transitions intentionally cancel their own requests.
  // Count failures only during the following idle Search/reference sequence.
  failedSearches.length = 0;

  await editor.locator("#open-search").click();
  await idlePolls(editor);
  assert.equal(await editor.locator("#note-search").evaluate((dialog) => dialog.open), true, "idle polls preserve Search opened from navigation");
  searchDelay = 3000;
  const queryStarted = editor.waitForRequest((request) => request.url() === origin + "/memories/all/search");
  await editor.locator("#note-search-input").fill("Fixture a");
  await queryStarted;
  await idlePolls(editor);
  await editor.locator("#search-results [role=option]").first().waitFor();
  assert.equal(await editor.locator("#note-search").evaluate((dialog) => dialog.open), true, "a delayed query completes across idle polls");
  await editor.locator("#note-search-input").press("Enter");
  await editor.locator("#note-search").waitFor({ state: "hidden" });
  await editor.waitForURL("**/?note=" + siblingId + "&brain=a");

  await editor.waitForFunction(() => state.editor?.state.loaded && !state.editor.state.navigationPending && document.querySelector("#note-editor").isContentEditable);
  await Promise.all([
    editor.waitForRequest((request) => request.url() === origin + "/memories/all/search"),
    appendEditorText(editor, " @Fix"),
  ]);
  await idlePolls(editor);
  const suggestion = editor.locator("[data-reference-autocomplete] [role=option][aria-selected=true]");
  await suggestion.waitFor();
  await suggestion.evaluate((row) => { row.dataset.pollContinuity = "retained"; });
  await idlePolls(editor);
  assert.equal(await suggestion.getAttribute("data-poll-continuity"), "retained", "suggestion row and selection survive healthy polls and autosave");
  // This sibling's own confirmed write may rank first; choose the other note.
  for (let step = 0; step < 4 && (await suggestion.locator(":scope > div").first().textContent()) !== "Fixture a"; step++) await editor.keyboard.press("ArrowDown");
  assert.equal(await suggestion.locator(":scope > div").first().textContent(), "Fixture a");
  await editor.keyboard.press("Enter");
  await editor.locator("[data-reference-autocomplete]").waitFor({ state: "hidden" });
  assert.match(await editorMarkdown(editor), /\[\[Fixture a\]\]/, "reference remains insertable after idle polls");
  await editor.waitForFunction(() => document.getElementById("note-save-state").textContent === "Saved");
  assert.ok(canonical("a", "sibling.md").includes("[[Fixture a]]"), "@ selection saves as canonical brackets");
  assert.ok(!canonical("a", "sibling.md").includes("@Fix"), "the transient @ query is replaced");
  assert.equal(await editor.locator("#insert-reference").count(), 0);
  assert.deepEqual(failedSearches, [], "healthy polls must not abort Search or reference queries");
  searchDelay = 0;

  await editor.locator("#graph-link").click();
  await editor.locator("#open-dream").click();
  await idlePolls(editor);
  assert.equal(await editor.locator("#dream-handoff").evaluate((dialog) => dialog.open), true, "idle polls preserve Dream's local-brain explanation");
  assert.match(await editor.locator("#dream-feedback").textContent(), /unavailable for local companion folders/);
  assert.equal(await editor.locator("#dream-preview").inputValue(), "");
  await editor.locator("#dream-close").click();
  await editor.goto(origin + "/?note=" + id + "&brain=a");
  await editor.locator("#note-editor").waitFor();
  // Two-tab switch flush: the live save is still in flight when the switch starts,
  // so the barrier must wait for its canonical confirmation before activating B.
  const switchSave = editorWire.holdNextRequest("edit");
  await replaceEditorText(editor, (await editorMarkdown(editor)) + "\n- [ ] Pending A task\n```js\n[[Inert code]]\n```\nPending A draft");
  await switchSave.arrived;
  await editor.getByRole("checkbox").waitFor();
  assert.equal(await editor.locator("#note-editor pre").count(), 1);
  await editor.locator("#open-search").click();
  const commitsBefore = switchCommits.length;
  const rowB = settings.locator(".companion-profile").filter({ hasText: "Fixture B" });
  await rowB.getByRole("button", { name: "Use this brain", exact: true }).click();
  await editor.waitForFunction(() => document.querySelector("main").inert);
  assert.equal(await editor.locator("#note-search").evaluate((dialog) => dialog.open), false, "a real preparing transition still closes Search");
  assert.equal(await editor.locator("#note-name").evaluate((element) => element.readOnly), true);
  assert.equal(await editor.locator("#new-note").isDisabled(), true);
  assert.equal(await editor.getByRole("checkbox").isDisabled(), true);
  assert.equal(await editor.locator("#insert-reference").count(), 0);
  assert.equal(await editor.locator(".app-nav").evaluate((element) => element.inert), true);
  assert.equal(activeId, "a", "the switch waits for the in-flight save");
  assert.doesNotMatch(canonical("a"), /Pending A draft/);
  switchSave.release();
  await settings.waitForURL("**/settings?brain=b");
  await editor.waitForURL(origin + "/?brain=b");
  assert.equal(switchCommits.length, commitsBefore + 1);
  assert.deepEqual([switchCommits.at(-1).from, switchCommits.at(-1).to], ["a", "b"]);
  assert.match(switchCommits.at(-1).content, /Pending A draft/, "canonical A had the draft before B activated");
  assert.ok(switchCommits.at(-1).content.includes("- [ ] Pending A task\n```js\n[[Inert code]]\n```"));
  assert.ok(canonical("a").includes("- [ ] Pending A task\n```js\n[[Inert code]]\n```\nPending A draft"));
  assert.equal(canonicalBody("b"), "Fixture b\n");
  assert.ok(requests.filter((item) => item.path === "/companion/ack").length >= 2);

  failCapture = true;
  await editor.locator("#home-new").click();
  await editor.waitForFunction(() => document.getElementById("capture-message").textContent.includes("Could not confirm note creation"));
  await settings.locator(".companion-profile").filter({ hasText: "Fixture A" }).getByRole("button", { name: "Use this brain", exact: true }).click();
  await settings.waitForFunction(() => document.getElementById("toast-message").textContent.includes("switch_blocked"));
  assert.equal(activeId, "b", "unconfirmed creation blocks switch");
  failCapture = false;
  await editor.waitForFunction(() => !document.querySelector("main").inert);
  await editor.locator("#home-new").click();
  await editor.waitForURL("**/?note=" + id + "&brain=b");
  const captures = requests.filter((item) => item.path === "/memories/all/notes");
  assert.equal(captures.length, 2);
  assert.equal(captures[0].headers["idempotency-key"], captures[1].headers["idempotency-key"]);
  await editor.goto(origin + "/?note=" + id + "&brain=b");
  await editor.locator("#note-editor").waitFor();
  await editor.waitForFunction(() => state.editor?.state.liveHasOpened);
  const peer = await context.newPage(); peer.on("pageerror", (exception) => pageErrors.push(exception.message));
  const peerWire = await installCollaborationSmokeTransport(peer);
  await peer.goto(origin + "/?note=" + id + "&brain=b");
  await peer.locator("#note-editor").waitFor();
  await peer.waitForFunction(() => state.editor?.state.liveHasOpened);
  await replaceEditorText(editor, "First paragraph\n\nSecond paragraph");
  await saved(editor);
  const converged = (page, text) => page.waitForFunction((text) => richEditor.getMarkdown() === text && document.getElementById("note-save-state").textContent === "Saved", text);
  await converged(peer, "First paragraph\n\nSecond paragraph");
  // Concurrent live writers merge (the old If-Match stop is gone): both tabs edit
  // different paragraphs against the same revision; both edits must land and converge.
  const firstInFlight = editorWire.holdNextRequest("edit"), secondInFlight = peerWire.holdNextRequest("edit");
  await selectEditorText(editor, "First paragraph".length);
  await editor.keyboard.insertText(" alpha");
  await appendEditorText(peer, " omega");
  const [firstEdit, secondEdit] = await Promise.all([firstInFlight.arrived, secondInFlight.arrived]);
  assert.equal(firstEdit.params.baseRevision, secondEdit.params.baseRevision, "both edits are concurrent against one revision");
  firstInFlight.release(); secondInFlight.release();
  const merged = "First paragraph alpha\n\nSecond paragraph omega";
  await converged(editor, merged); await converged(peer, merged);
  assert.equal(canonicalBody("b").trimEnd(), merged, "both concurrent edits reach the canonical file");
  for (const page of [editor, peer]) assert.equal(await page.locator("#note-recover").isVisible(), false, "a merged concurrent edit needs no review");
  // A tab whose save needs review blocks a switch; its draft is retained and never retried.
  const rejectedPeer = peerWire.rejectNext("edit", { code: "source_unavailable", message: "Disposable publication failure" });
  await appendEditorText(peer, " Review retained draft");
  await rejectedPeer.arrived;
  await peer.locator("#note-save-state").filter({ hasText: "Changes need review" }).waitFor();
  const peerEdits = liveEdits(peerWire);
  await settings.locator(".companion-profile").filter({ hasText: "Fixture A" }).getByRole("button", { name: "Use this brain", exact: true }).click();
  await settings.waitForFunction(() => document.getElementById("toast-message").textContent.includes("switch_blocked"));
  await peer.waitForFunction(() => document.getElementById("note-editor").getAttribute("contenteditable") === "true");
  assert.equal(activeId, "b");
  assert.match(await editorMarkdown(peer), /omega Review retained draft/);
  assert.equal(liveEdits(peerWire), peerEdits, "no silent publication retry during the barrier");
  assert.doesNotMatch(canonical("b"), /Review retained draft/);
  assert.equal(await editorMarkdown(editor), merged, "the other tab never receives the unpublished draft");
  assert.equal(await peer.locator("#note-name").evaluate((element) => element.readOnly), false);
  await keepMyChanges(peer);
  assert.match(canonical("b"), /Second paragraph omega Review retained draft/);
  await converged(editor, merged + " Review retained draft");

  for (const page of [peer, editor]) { page.on("dialog", (dialog) => dialog.accept()); await page.close(); }
  await settings.locator(".companion-profile").filter({ hasText: "Fixture remote" }).getByRole("button", { name: "Use this brain", exact: true }).click();
  await settings.waitForURL("**/settings?brain=r");
  await settings.locator("#companion-profiles strong").first().waitFor();
  assert.equal(await settings.locator("#companion-active").getAttribute("data-state"), "connected", "Settings uses confirmed host health before any memory request");
  // Under a role restriction the control stays available and explains itself.
  assert.equal(await settings.locator("#companion-refresh-index").isDisabled(), false);
  assert.match(await settings.locator("#companion-refresh-index").getAttribute("title"), /needs a writer or admin key.*reader access/);
  const indexRequests = requests.filter((item) => item.path === "/memories/all/index").length;
  await settings.locator("#companion-refresh-index").click();
  await settings.waitForFunction(() => /Refreshing the search index needs a writer or admin key/.test(document.getElementById("toast-message").textContent));
  assert.equal(await settings.locator("#toast-action").textContent(), "Open Settings");
  assert.equal(requests.filter((item) => item.path === "/memories/all/index").length, indexRequests, "nothing was sent");
  assert.match(await settings.locator(".companion-profile[aria-current=true]").textContent(), /Reader access/);
  const readOnly = await context.newPage(); readOnly.on("pageerror", (exception) => pageErrors.push(exception.message));
  await readOnly.goto(origin + "/?note=" + id + "&brain=r"); await readOnly.locator("#note-editor").waitFor();
  assert.equal(await readOnly.locator("#note-editor").getAttribute("contenteditable"), "false");
  assert.equal(await readOnly.locator("#new-note").isDisabled(), false, "creation stays visible and explains the role restriction");
  assert.equal(await readOnly.locator("#companion-access-notice").isHidden(), true, "no access banner outside Settings");
  assert.doesNotMatch(await readOnly.locator("#companion-active").textContent(), /read only|reader/i);
  assert.equal(await readOnly.getByRole("checkbox").isDisabled(), true);
  const readOnlyBody = await editorMarkdown(readOnly);
  await readOnly.getByRole("checkbox").dispatchEvent("click");
  assert.equal(await editorMarkdown(readOnly), readOnlyBody);
  await readOnly.locator("#graph-link").click(); await readOnly.locator("#open-dream").click();
  assert.match(await readOnly.locator("#dream-feedback").textContent(), /needs a writer or admin key/);
  assert.equal(await readOnly.locator("#dream-preview").inputValue(), "");
  await readOnly.locator("#dream-close").click();

  await readOnly.goto(origin + "/?note=" + id + "&brain=a");
  await readOnly.locator("#home").waitFor();
  // The active brain's sidebar may hydrate/poll previews on Home. Rejection
  // means the mismatched link never opens an editor, not that all reads stop.
  assert.equal(await readOnly.evaluate(() => state.editor), null);
  assert.equal(new URL(readOnly.url()).searchParams.get("note"), null);
  assert.equal(new URL(readOnly.url()).searchParams.get("brain"), "r");
  assert.match(await readOnly.locator("#toast-message").textContent(), /not scoped/);
  pollDelay = 1100;
  await new Promise((resolve) => setTimeout(resolve, 2600));
  assert.deepEqual(violations, []);
  assert.deepEqual(pageErrors, []);
  // Expire a live session with an actual unsaved disposable draft. Reopen in a
  // separate tab, leaving the original tab and recovered text untouched.
  activeId = "a"; generation++; revision++; announceTransition();
  const expiredContext = await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"] });
  const expired = await expiredContext.newPage();
  const expiredWire = await installCollaborationSmokeTransport(expired);
  await expired.goto(origin + "/?note=" + id + "&brain=a#companion=fixture-token");
  await expired.locator("#note-editor").waitFor({ state: "visible" });
  await expired.waitForFunction(() => state.editor?.state.liveHasOpened);
  // An unpublished draft: its live publication is rejected and awaits review.
  const rejectedExpiry = expiredWire.rejectNext("edit", { code: "source_unavailable", message: "Disposable publication failure" });
  await replaceEditorText(expired, "Session expiry disposable unsaved draft");
  await rejectedExpiry.arrived;
  await expired.locator("#note-save-state").filter({ hasText: "Changes need review" }).waitFor();
  const expiryWrites = liveEdits(expiredWire);
  await expiredContext.clearCookies();
  await expired.locator("#companion-recovery").waitFor({ state: "visible" });
  assert.match(await expired.locator("#toast-message").textContent(), /Your session ended; use Recover draft/);
  assert.doesNotMatch(await expired.locator("#toast-message").textContent(), /fenced|cookie/);
  await expired.locator("#companion-recovery").getByRole("button", { name: "Recover draft", exact: true }).click();
  if (!await expired.locator("#recovery-options").evaluate(element => element.open)) await expired.locator("#recovery-options > summary").click();
  await expired.locator("#recovery-draft").waitFor({ state: "visible" });
  assert.match(await expired.locator("#recovery-draft").inputValue(), /Session expiry disposable unsaved draft/);
  await expired.locator("#recovery-copy").click();
  await expired.locator("#recovery-message").filter({ hasText: "Draft copied" }).waitFor();
  assert.match(await expired.evaluate(() => navigator.clipboard.readText()), /Session expiry disposable unsaved draft/);
  assert.equal(await expired.locator("#recovery-reload").isDisabled(), true);
  if (process.env.JUMPYBRAIN_SMOKE_SCREENSHOT_DIR) await expired.screenshot({ path: path.join(process.env.JUMPYBRAIN_SMOKE_SCREENSHOT_DIR, "session-recovery.png") });
  await expired.locator("#recovery-close").click();
  assert.equal(liveEdits(expiredWire), expiryWrites, "expiry never retries the write");
  assert.doesNotMatch(canonical("a"), /Session expiry disposable unsaved draft/);
  const reopened = await expiredContext.newPage();
  await reopened.goto(origin + "/?note=" + id + "&brain=a#companion=fixture-token");
  await reopened.locator("#note-editor").waitFor({ state: "visible" });
  await reopened.waitForFunction(() => state.editor?.state.liveHasOpened);
  assert.doesNotMatch(await editorMarkdown(reopened), /Session expiry disposable unsaved draft/);
  assert.match(await editorMarkdown(expired), /Session expiry disposable unsaved draft/);
  expired.on("dialog", dialog => dialog.accept()); await expiredContext.close();
  const unauthenticated = await browser.newContext();
  const failure = await unauthenticated.newPage();
  await failure.goto(origin + "/settings#companion=expired-token");
  await failure.locator("#companion-reconnect").waitFor();
  assert.match(await failure.locator("#toast-message").textContent(), /Your session ended/);
  assert.equal(new URL(failure.url()).hash, "");
  await failure.locator("#companion-recovery").waitFor({ state: "visible" });
  assert.match(await failure.locator("#toast-message").textContent(), /use Recover draft to copy your work/);
  assert.equal(await failure.locator("#companion-recovery").getByRole("button", { name: "Retry companion session", exact: true }).isEnabled(), true);
  // Settings is a modal card over the app; its own Retry is the reachable control.
  await failure.locator("#companion-settings").getByRole("button", { name: "Retry companion session", exact: true }).click();
  await failure.waitForFunction(() => !document.getElementById("companion-reconnect").disabled && !document.querySelector("#companion-recovery button").disabled);
  assert.match(await failure.locator("#toast-message").textContent(), /reopening the editor from the app menu/);
  await unauthenticated.close();
  console.log("companion browser smoke: PASS (registration, settings, keys, live save before Settings, rejected-save review, idle Search/query/reference/Dream survival, two-tab freeze/flush, uncertain creation, concurrent writers merge, review-blocked switch, generation reload, read-only, stale links, serialized polls, expired unsaved draft copy/reopen, session failure)");
} finally {
  if (browser) await browser.close();
  if (pendingSwitch) finishSwitch(false);
  await live.close();
  await new Promise((resolve) => server.close(resolve));
  for (const backend of Object.values(backends)) await backend.close();
  await rm(root, { recursive: true, force: true });
}
