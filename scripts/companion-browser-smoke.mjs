// Disposable control-plane fixture + production nonce shell/Lexical. No native app,
// Keychain, user folders, real remote targets, or installed companion are touched.
// npm run build && npx --package=playwright node scripts/companion-browser-smoke.mjs
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { graphPageHtml } from "../dist/adapters/http-server/graph-page.js";
import { loadPlaywrightChromium, launchPlaywrightChromium } from "./playwright-runtime.mjs";
import { appendEditorText, replaceEditorText, editorMarkdown } from "./editor-smoke-helpers.mjs";

const root = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-companion-browser-"));
const { version } = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const id = "mem_a0000000-0000-4000-8000-000000000001";
const profiles = [
  { id: "a", name: "Fixture A", kind: "local", root: path.join(root, "a"), allowWrites: true },
  { id: "b", name: "Fixture B", kind: "local", root: path.join(root, "b"), allowWrites: true },
  { id: "r", name: "Fixture remote", kind: "remote", url: "https://fixture.invalid", allowWrites: false },
];
const documents = new Map(["a", "b", "r"].map((brain) => [brain, { content: `Fixture ${brain}\n`, hash: "h1" }]));
let activeId = "a", generation = 1, revision = 1, phase = "idle", switchId = null, target = null;
let switchSequence = 0, pendingSwitch = null, failWrites = false, failCapture = false, writeDelay = 0, pollDelay = 0;
let failIndex = false, searchDelay = 0;
const tabs = new Map(), requests = [], profileWrites = [], violations = [], pollCounts = new Map();
const snapshot = () => ({ profiles, activeId, generation, revision, phase, switchId, target,
  extensions: { revision: "fixture-extensions-1" }, health: { status: "connected" }, active: profiles.find((item) => item.id === activeId) });
const json = (response, body, status = 200) => {
  response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  response.end(JSON.stringify(body));
};
const error = (response, code, status = 409) => json(response, { error: { code, message: code } }, status);
function finishSwitch(ok) {
  const pending = pendingSwitch;
  if (!pending) return;
  clearTimeout(pending.timer);
  if (ok) { activeId = target; generation++; revision++; }
  phase = "idle"; target = null; switchId = null; pendingSwitch = null;
  if (ok) json(pending.response, snapshot()); else error(pending.response, "switch_blocked");
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
    requests.push({ path: url.pathname, body, generation, headers: request.headers });
    if (url.pathname === "/companion/session") {
      if (body?.token !== "fixture-token") { error(response, "session_invalid", 401); return; }
      response.setHeader("Set-Cookie", "fixture-session=ok; HttpOnly; SameSite=Strict; Path=/"); json(response, {}); return;
    }
    if (!request.headers.cookie?.includes("fixture-session=ok")) { error(response, "session_required", 401); return; }
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
        pendingSwitch = { response, waiting: new Set(tabs.keys()), timer: setTimeout(() => finishSwitch(false), 7000) };
        if (!pendingSwitch.waiting.size) finishSwitch(true);
        return;
      }
      if (route === "ack") {
        json(response, {});
        if (!pendingSwitch || body.switchId !== switchId) return;
        if (!body.ok) finishSwitch(false);
        else { pendingSwitch.waiting.delete(body.tabId); if (!pendingSwitch.waiting.size) finishSwitch(true); }
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
        if (!profiles.find((profile) => profile.id === activeId).allowWrites) { error(response, "read_only", 403); return; }
        await new Promise((resolve) => setTimeout(resolve, 1000));
        if (failIndex) error(response, "index_failed", 503); else json(response, { index: { stale: false } });
        return;
      }
      if (url.pathname === "/memories/all/search") {
        await new Promise((resolve) => setTimeout(resolve, searchDelay));
        json(response, { results: [{ provenance: { file: "notes/fixture.md", metadata: { id, title: "Fixture " + activeId } }, snippet: "Synthetic search result" }], recognition: { version: 1, candidateLimit: 120, candidates: 1, matched: 1, partial: true, metadataUnavailable: 1 }, index: { stale: false } }); return;
      }
      if (url.pathname === "/memories/all/ensure-title") {
        assert.equal(request.method, "POST");
        if (!profiles.find((profile) => profile.id === activeId).allowWrites) { error(response, "read_only", 403); return; }
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
      if (url.pathname === "/memories/all/documents/" + id) {
        const doc = documents.get(activeId);
        if (request.method === "PUT") {
          await new Promise((resolve) => setTimeout(resolve, writeDelay));
          if (failWrites || request.headers["if-match"] !== doc.hash) { error(response, "fixture_conflict", 412); return; }
          doc.content = body.content; doc.hash = "h" + (Number(doc.hash.slice(1)) + 1);
          json(response, { newContentHash: doc.hash }); return;
        }
        json(response, { content: doc.content, contentHash: doc.hash, title: "Fixture " + activeId, file: "notes/fixture.md", frontmatter: { id } }); return;
      }
    }
    error(response, "not_found", 404);
  } catch (exception) { violations.push(exception.message); error(response, "fixture_failure", 500); }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = "http://127.0.0.1:" + server.address().port;
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
  if (await settings.locator("html").getAttribute("data-theme") !== "dark") await settings.locator("#color-theme").click();
  assert.equal(await settings.locator("body").evaluate((el) => getComputedStyle(el).backgroundColor), "rgb(28, 27, 25)");
  assert.equal(await settings.locator("#companion-kind").evaluate((el) => getComputedStyle(el).color), "rgb(216, 208, 192)");
  await settings.waitForFunction(() => getComputedStyle(document.querySelector("#companion-name")).backgroundColor === "rgb(28, 27, 25)");
  await settings.locator("#color-theme").click();
  assert.equal(await settings.locator("body").evaluate((el) => getComputedStyle(el).backgroundColor), "rgb(230, 218, 196)");
  await settings.evaluate(() => colorTheme.setPreference("system"));
  assert.equal(new URL(settings.url()).hash, "");
  assert.equal(await settings.evaluate(() => localStorage.getItem("jumpybrain.graph.apiKey")), null, "legacy local-server credential must be forgotten");
  assert.equal(requests.some((item) => item.path.startsWith("/memories/")), false, "settings startup needs no memory fetch");
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
  for (const theme of ["light", "dark"]) {
    await settings.evaluate((value) => colorTheme.setPreference(value), theme);
    for (const width of [1280, 390, 320]) {
      await settings.setViewportSize({ width, height: 900 });
      const layout = await settings.locator("#companion-settings").evaluate((el) => {
        const controls = [...el.querySelectorAll(".note-icon")];
        return { fits: el.scrollWidth <= el.clientWidth, controls: controls.map(item => {
          const box = item.getBoundingClientRect();
          return { width: box.width, height: box.height, text: item.textContent.trim(), label: item.getAttribute("aria-label"), fits: box.left >= 0 && box.right <= innerWidth };
        }) };
      });
      assert.equal(layout.fits, true, theme + " " + width + " Settings overflow");
      for (const control of layout.controls) {
        assert.ok(control.label && !control.text && control.fits, "named, visible icon actions");
        assert.ok(control.width >= (width <= 680 ? 40 : 32) && control.height >= (width <= 680 ? 40 : 32));
      }
      if (screenshotDir) await settings.screenshot({ path: path.join(screenshotDir, "settings-" + theme + "-" + width + ".png"), fullPage: true });
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
  assert.equal(await settings.locator("#companion-writes").isChecked(), false);
  await settings.locator("#companion-name").fill("Disposable remote");
  await settings.locator("#companion-url").fill("https://disposable.invalid");
  await settings.locator("#companion-key").fill("fixture-secret-write-only");
  await settings.locator("#companion-form button[type=submit]").click();
  await settings.waitForFunction(() => document.getElementById("toast-message").textContent.includes("Connection saved"));
  assert.equal(profileWrites[0].profile.allowWrites, false);
  assert.equal(await settings.locator("#companion-key").inputValue(), "");
  await settings.waitForFunction(() => document.getElementById("companion-profiles").textContent.includes("Disposable remote"));
  const savedRow = settings.locator(".companion-profile").filter({ hasText: "Disposable remote" });
  await savedRow.getByRole("button", { name: "Edit", exact: true }).click();
  assert.equal(await settings.locator("#companion-key").inputValue(), "");
  await settings.locator("#companion-form button[type=submit]").click();
  await settings.waitForFunction(() => document.getElementById("toast-message").textContent.includes("Connection saved"));
  assert.equal(Object.hasOwn(profileWrites[1].profile, "key"), false, "blank preserves existing key");

  const editor = await context.newPage(); editor.on("pageerror", (exception) => pageErrors.push(exception.message));
  const failedSearches = [];
  editor.on("requestfailed", (request) => { if (request.url() === origin + "/memories/all/search") failedSearches.push(request.failure()?.errorText); });
  await editor.goto(origin + "/");
  await editor.locator("#home-search").click();
  await idlePolls(editor);
  assert.equal(await editor.locator("#note-search").evaluate((dialog) => dialog.open), true, "idle polls preserve Search opened from Home without typing");
  await editor.locator("#note-search-input").fill("Fixture");
  await editor.locator("#search-results [role=option]").first().waitFor();
  await editor.locator("#note-search-input").press("Enter");
  await editor.waitForURL("**/?note=" + id + "&brain=a");
  await editor.locator("#note-editor").waitFor();

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
  await editor.keyboard.press("Enter");
  await editor.locator("[data-reference-autocomplete]").waitFor({ state: "hidden" });
  assert.match(await editorMarkdown(editor), /\[\[Fixture a\]\]/, "reference remains insertable after idle polls");
  await editor.waitForFunction(() => document.getElementById("note-save-state").textContent === "Saved");
  assert.ok(documents.get("a").content.includes("[[Fixture a]]"), "@ selection saves as canonical brackets");
  assert.ok(!documents.get("a").content.includes("@Fix"), "the transient @ query is replaced");
  assert.match(await editor.locator("#insert-reference").getAttribute("title"), /type @/);
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
  await appendEditorText(editor, "Pending A draft");
  await editor.locator("#open-search").click();
  writeDelay = 1300;
  const rowB = settings.locator(".companion-profile").filter({ hasText: "Fixture B" });
  await rowB.getByRole("button", { name: "Use this brain", exact: true }).click();
  await editor.waitForFunction(() => document.querySelector("main").inert);
  assert.equal(await editor.locator("#note-search").evaluate((dialog) => dialog.open), false, "a real preparing transition still closes Search");
  assert.equal(await editor.locator("#note-name").evaluate((element) => element.readOnly), true);
  assert.equal(await editor.locator("#new-note").isDisabled(), true);
  assert.equal(await editor.locator("#insert-reference").isDisabled(), true);
  assert.equal(await editor.locator(".app-nav").evaluate((element) => element.inert), true);
  await settings.waitForURL("**/settings?brain=b");
  writeDelay = 0;
  await editor.waitForURL(origin + "/?brain=b");
  assert.match(documents.get("a").content, /Pending A draft/);
  assert.equal(documents.get("b").content, "Fixture b\n");
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
  const conflictEditor = await context.newPage(); conflictEditor.on("pageerror", (exception) => pageErrors.push(exception.message));
  await conflictEditor.goto(origin + "/?note=" + id + "&brain=b");
  await conflictEditor.locator("#note-editor").waitFor();
  await replaceEditorText(editor, "First writer confirmed");
  await editor.waitForFunction(() => document.getElementById("note-save-state").textContent === "Saved");
  await replaceEditorText(conflictEditor, "Conflict retained draft");
  await conflictEditor.waitForFunction(() => document.getElementById("note-save-state").textContent === "Changes need review");
  const writesBefore = requests.filter((item) => item.headers["if-match"]).length;
  await settings.locator(".companion-profile").filter({ hasText: "Fixture A" }).getByRole("button", { name: "Use this brain", exact: true }).click();
  await settings.waitForFunction(() => document.getElementById("toast-message").textContent.includes("switch_blocked"));
  await conflictEditor.waitForFunction(() => document.getElementById("note-editor").getAttribute("contenteditable") === "true");
  assert.equal(activeId, "b");
  assert.match(await editorMarkdown(conflictEditor), /Conflict retained draft/);
  assert.equal(requests.filter((item) => item.headers["if-match"]).length, writesBefore, "no 412 overwrite retry during barrier");
  assert.match(documents.get("b").content, /First writer confirmed/);
  assert.doesNotMatch(documents.get("b").content, /Conflict retained draft/);
  assert.equal(await conflictEditor.locator("#note-name").evaluate((element) => element.readOnly), false);

  // Explicitly discard only this disposable test draft on close, not as switch policy.
  conflictEditor.on("dialog", (dialog) => dialog.accept()); await conflictEditor.close();
  await editor.close();
  await settings.locator(".companion-profile").filter({ hasText: "Fixture remote" }).getByRole("button", { name: "Use this brain", exact: true }).click();
  await settings.waitForURL("**/settings?brain=r");
  await settings.locator("#companion-profiles strong").first().waitFor();
  assert.equal(await settings.locator("#companion-active").getAttribute("data-state"), "connected", "Settings uses confirmed host health before any memory request");
  assert.equal(await settings.locator("#companion-refresh-index").isDisabled(), true);
  assert.match(await settings.locator("#companion-refresh-index").getAttribute("title"), /read only/);
  const readOnly = await context.newPage(); readOnly.on("pageerror", (exception) => pageErrors.push(exception.message));
  await readOnly.goto(origin + "/?note=" + id + "&brain=r"); await readOnly.locator("#note-editor").waitFor();
  assert.equal(await readOnly.locator("#note-editor").getAttribute("contenteditable"), "false");
  assert.equal(await readOnly.locator("#new-note").isDisabled(), true);
  await readOnly.locator("#graph-link").click(); await readOnly.locator("#open-dream").click();
  assert.match(await readOnly.locator("#dream-feedback").textContent(), /read only/);
  assert.equal(await readOnly.locator("#dream-preview").inputValue(), "");
  await readOnly.locator("#dream-close").click();

  const readsBefore = requests.filter((item) => item.path.includes("/documents/")).length;
  await readOnly.goto(origin + "/?note=" + id + "&brain=a");
  await readOnly.locator("#home").waitFor();
  assert.equal(requests.filter((item) => item.path.includes("/documents/")).length, readsBefore);
  assert.match(await readOnly.locator("#toast-message").textContent(), /not scoped/);
  pollDelay = 1100;
  await new Promise((resolve) => setTimeout(resolve, 2600));
  assert.deepEqual(violations, []);
  assert.deepEqual(pageErrors, []);
  const unauthenticated = await browser.newContext();
  const failure = await unauthenticated.newPage();
  await failure.goto(origin + "/settings#companion=expired-token");
  await failure.locator("#companion-reconnect").waitFor();
  assert.match(await failure.locator("#toast-message").textContent(), /session unavailable/);
  assert.equal(new URL(failure.url()).hash, "");
  await failure.locator("#companion-recovery").waitFor({ state: "visible" });
  assert.match(await failure.locator("#toast-message").textContent(), /Retry only works if the existing session cookie is still valid/);
  assert.equal(await failure.locator("#companion-recovery").getByRole("button", { name: "Retry companion session", exact: true }).isEnabled(), true);
  await failure.locator("#companion-recovery").getByRole("button", { name: "Retry companion session", exact: true }).click();
  await failure.waitForFunction(() => !document.querySelector("#companion-recovery button").disabled);
  assert.match(await failure.locator("#toast-message").textContent(), /Reopen the editor from the companion menu/);
  await unauthenticated.close();
  console.log("companion browser smoke: PASS (registration, settings, keys, idle Search/query/reference/Dream survival, two-tab freeze/flush, uncertain creation, conflict block, generation reload, read-only, stale links, serialized polls, session failure)");
} finally {
  if (browser) await browser.close();
  if (pendingSwitch) finishSwitch(false);
  await new Promise((resolve) => server.close(resolve));
  await rm(root, { recursive: true, force: true });
}
