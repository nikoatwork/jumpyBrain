// Real-browser drawing checks against the production hosted shell and a disposable brain.
// Run after `npm run build`: npx --package=playwright node scripts/drawings-smoke.mjs
import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { loadPlaywrightChromium, launchPlaywrightChromium } from "./playwright-runtime.mjs";
import { startCompanionGateway } from "../integrations/macos-companion/gateway.mjs";
const { createDrawing } = await import(new URL("../dist/runtime/index.js", import.meta.url).href);
const { startJumpyBrainHttpServer } = await import(new URL("../dist/server/index.js", import.meta.url).href);

const root = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-drawings-smoke-"));
const key = "disposable-drawings-key";
const noteId = "mem_90000000-0000-4000-8000-0000000000d1";
const screenshots = process.env.JUMPYBRAIN_SMOKE_SCREENSHOT_DIR;
const drawingFile = (name) => path.join(root, "drawings", name + ".excalidraw");
const scene = async (name) => JSON.parse(await readFile(drawingFile(name), "utf8"));
const exists = (file) => access(file).then(() => true, () => false);
let server, browser, gateway;

async function waitFor(check, message, timeout = 10_000) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const value = await check().catch(() => false);
    if (value) return value;
    if (Date.now() > deadline) throw new Error("Timed out: " + message);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
const canvas = (page) => page.frameLocator("#drawing-frame").locator("canvas.interactive");
async function ready(page) {
  await page.waitForFunction(() => window.__jumpyBrainDrawingReady === true);
  await canvas(page).waitFor({ state: "visible" });
  await page.waitForTimeout(400);
}
async function drawRectangle(page, x, y) {
  const box = await canvas(page).boundingBox();
  await canvas(page).click({ position: { x: 5, y: box.height - 5 } });
  await page.keyboard.press("r");
  // Fractions of the canvas keep clear of the tool panels at both widths.
  const left = box.x + box.width * x, top = box.y + box.height * y;
  await page.mouse.move(left, top);
  await page.mouse.down();
  await page.mouse.move(left + 80, top + 50, { steps: 4 });
  await page.mouse.up();
}
async function saved(page) {
  // "Saved" is also the resting label, so first see the edit register.
  await page.waitForFunction(() => document.getElementById("drawing-state").textContent !== "Saved", null, { timeout: 5_000 }).catch(() => {});
  await page.waitForFunction(() => document.getElementById("drawing-state").textContent === "Saved");
}

try {
  if (screenshots) await mkdir(screenshots, { recursive: true });
  await mkdir(path.join(root, "notes"));
  const mentionFixture = `---\nid: ${noteId}\ntype: note\ntitle: Mention fixture\n---\n\nSee [[System map.excalidraw]] for the picture.\n`;
  await writeFile(path.join(root, "notes/mention.md"), mentionFixture);
  server = await startJumpyBrainHttpServer({ root, apiKeys: [key], port: 0, autoIndex: false });
  browser = await launchPlaywrightChromium({ chromium: await loadPlaywrightChromium() });
  {
    const { drawingsScript, drawingsSidebarMarkup, drawingsNavigationControl, drawingsMarkup, drawingsDialogMarkup } = await import("../dist/adapters/http-server/drawings-view.js");
    const proof = await browser.newPage();
    await proof.setContent(drawingsNavigationControl + drawingsSidebarMarkup + drawingsMarkup + drawingsDialogMarkup);
    await proof.addScriptTag({ content: drawingsScript });
    await proof.evaluate(() => {
      window.fixtureScope = "old"; window.fixtureConnected = true; window.fixtureRole = "writer"; window.listReplies = [];
      window.ui = createDrawingsUI({ scope: () => fixtureScope, connected: () => fixtureConnected, readOnly: () => false,
        json: route => route === "/capabilities" ? Promise.resolve({ principal: { role: fixtureRole } }) : new Promise(resolve => listReplies.push(resolve)),
        scopeUrl: url => url, icon: "", revealSidebar() {}, ready() {}, theme: () => "light" });
      document.getElementById("open-drawings").click();
    });
    await proof.locator("#drawings-list-state", { hasText: "Loading drawings" }).waitFor();
    await proof.evaluate(() => { fixtureScope = "new"; ui.connectionChanged(); });
    assert.equal(await proof.locator("#drawings-list").isHidden(), true, "scope changes start collapsed");
    await proof.evaluate(async () => { listReplies[1]({ drawings: [{ name: "New brain" }] }); await Promise.resolve(); });
    await proof.locator("#sidebar-drawings a", { hasText: "New brain" }).waitFor({ state: "attached" });
    await proof.evaluate(async () => { listReplies[0]({ drawings: [{ name: "Old brain" }] }); await Promise.resolve(); });
    assert.equal(await proof.locator("#sidebar-drawings").textContent(), "New brain", "late old responses never replace current rows");
    await proof.evaluate(() => { document.getElementById("open-drawings").click(); document.getElementById("drawings-disclosure").click(); ui.refreshList(true); });
    await proof.evaluate(async () => { listReplies[2]({ drawings: [{ name: "Refreshed" }] }); await Promise.resolve(); });
    await proof.locator("#sidebar-drawings a", { hasText: "Refreshed" }).waitFor({ state: "attached" });
    assert.equal(await proof.locator("#drawings-list").isHidden(), true, "refresh does not reopen a collapsed section");
    await proof.evaluate(() => { fixtureConnected = false; ui.connectionChanged(); document.getElementById("open-drawings").click(); });
    await proof.locator("#drawings-list-state", { hasText: "Connect to browse" }).waitFor();
    assert.equal(await proof.locator("#new-drawing").isDisabled(), true);
    assert.equal(await proof.locator("#sidebar-drawings a").count(), 0);
    await proof.evaluate(() => { fixtureConnected = true; fixtureRole = "reader"; ui.connectionChanged(); });
    await proof.evaluate(async () => { listReplies[3]({ drawings: [{ name: "Readable" }] }); await Promise.resolve(); });
    await proof.locator("#sidebar-drawings a", { hasText: "Readable" }).waitFor();
    assert.equal(await proof.locator("#new-drawing").isDisabled(), true, "hosted reader capability disables creation");
    await proof.locator("#drawing-create-reason", { hasText: "read only" }).waitFor();
    await proof.evaluate(() => { ui.refreshList(true); fixtureRole = "writer"; ui.connectionChanged(); });
    await proof.evaluate(async () => { listReplies[5]({ drawings: [{ name: "Current credential" }] }); await Promise.resolve(); });
    await proof.locator("#sidebar-drawings a", { hasText: "Current credential" }).waitFor();
    await proof.evaluate(async () => { listReplies[4]({ drawings: [{ name: "Stale credential" }] }); await Promise.resolve(); });
    assert.equal(await proof.locator("#sidebar-drawings").textContent(), "Current credential", "same-scope invalidation also fences late responses");
    assert.equal(await proof.locator("#new-drawing").isEnabled(), true, "a stale reader response cannot change current permissions");
    await proof.close();
    console.log("drawing navigation scope/loading/disconnection/reader proof passed");
  }

  for (const width of [1280, 390]) {
    await rm(path.join(root, "drawings"), { recursive: true, force: true });
    await writeFile(path.join(root, "notes/mention.md"), mentionFixture);
    const context = await browser.newContext({ viewport: { width, height: 860 }, colorScheme: width === 390 ? "dark" : "light" });
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: server.url });
    const page = await context.newPage();
    page.setDefaultTimeout(15_000);
    const errors = [], external = [], failures = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    page.on("request", (request) => { if (!request.url().startsWith(server.url) && !/^(data|blob):/.test(request.url())) external.push(request.url()); });
    page.on("response", (response) => { if (response.status() >= 400) failures.push(response.status() + " " + new URL(response.url()).pathname); });

    try {
    // Opening the app must not load the drawing editor.
    const assets = [];
    page.on("request", (request) => { if (new URL(request.url()).pathname.startsWith("/drawing-")) assets.push(request.url()); });
    await page.goto(`${server.url}/#apiKey=${key}`);
    await page.locator("#home-new").waitFor({ state: "visible" });
    assert.equal(assets.length, 0, "home does not load the drawing editor");
    if (await page.locator("#open-drawings").isHidden()) await page.locator("#toggle-sidebar").click();
    assert.equal(await page.locator("#drawings-list").isHidden(), true, "fresh sessions keep drawings collapsed");
    let creates = 0;
    page.on("request", request => { if (request.method() === "POST" && new URL(request.url()).pathname === "/memories/all/drawings") creates++; });
    await page.locator("#open-drawings").click();
    await page.locator("#drawings-list-state", { hasText: "No drawings yet" }).waitFor();
    await page.locator("#open-drawings").click();
    assert.equal(await exists(path.join(root, "drawings")), false, "browsing an empty brain creates no directory");
    assert.equal(creates, 0);
    assert.equal(assets.length, 0, "browsing never loads Excalidraw");
    assert.equal(await page.locator("#drawings-disclosure").evaluate(node => node === document.activeElement), true);
    await page.locator("#drawings-disclosure").press("Enter");
    assert.equal(await page.locator("#drawings-list").isHidden(), true);
    await page.locator("#drawings-disclosure").press("Space");
    await page.locator("#drawings-list").waitFor({ state: "visible" });

    // Failed listings are not an empty collection; Retry recovers.
    const listing = "**/memories/all/drawings";
    await page.route(listing, route => route.fulfill({ status: 503, contentType: "application/json", body: '{"error":{"code":"unavailable"}}' }));
    await page.evaluate(() => drawingsUI.refreshList(true));
    await page.locator("#drawings-list-state", { hasText: "Could not load drawings" }).waitFor();
    await page.unroute(listing);
    await page.locator("#drawings-list-retry").click();
    await page.locator("#drawings-list-state", { hasText: "No drawings yet" }).waitFor();

    for (let i = 1; i <= 7; i++) await createDrawing(root, "Existing " + i);
    await page.evaluate(() => drawingsUI.refreshList(true));
    assert.equal(await page.locator("#sidebar-drawings a").count(), 5);
    for (const scheme of ["light", "dark"]) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.waitForFunction(expected => document.documentElement.dataset.theme === expected, scheme);
      for (const selector of ["#drawings-disclosure", "#new-drawing", "#sidebar-drawings a"]) {
        for (const control of await page.locator(selector).all()) {
          const box = await control.boundingBox();
          assert.ok(box && box.x >= 0 && box.x + box.width <= width, selector + " fits the viewport in " + scheme);
        }
      }
      const action = await page.locator("#new-drawing").boundingBox(), scroll = await page.locator(".sidebar-attention-scroll").boundingBox();
      assert.ok(action.y >= scroll.y && action.y + action.height <= scroll.y + scroll.height, "create action stays visible above the list");
      if (screenshots) await page.screenshot({ path: path.join(screenshots, `drawings-browser-${width}-${scheme}.png`) });
    }
    await page.emulateMedia({ colorScheme: width === 390 ? "dark" : "light" });
    await page.locator("#sidebar-drawings-more").click();
    assert.equal(await page.locator("#sidebar-drawings a").count(), 7);
    const existing = await readFile(drawingFile("Existing 1"), "utf8");
    await page.locator("#sidebar-drawings a", { hasText: "Existing 1" }).click();
    await ready(page);
    assert.equal(await readFile(drawingFile("Existing 1"), "utf8"), existing, "opening existing drawings never writes them");
    assert.equal(creates, 0);
    await page.locator("#notes-link").click();
    await page.locator("#home-new").waitFor();

    // Create is separate and repeated activation cannot create duplicate files.
    await page.route(listing, async route => { await new Promise(resolve => setTimeout(resolve, 200)); await route.continue(); });
    await page.locator("#new-drawing").evaluate(button => { button.click(); button.click(); });
    await ready(page);
    await page.unroute(listing);
    assert.equal(creates, 1, "only the explicit creation action writes, once");
    assert.equal(new URL(page.url()).searchParams.get("drawing"), "Untitled drawing");
    assert.equal(await page.locator("#drawing-name").inputValue(), "Untitled drawing");
    assert.deepEqual((await scene("Untitled drawing")).elements, []);
    const created = await readFile(drawingFile("Untitled drawing"), "utf8");
    await page.waitForTimeout(1500);
    assert.equal(await readFile(drawingFile("Untitled drawing"), "utf8"), created, "opening never rewrites a drawing");
    await drawRectangle(page, 0.55, 0.3);
    await saved(page);
    await waitFor(async () => (await scene("Untitled drawing")).elements.some((item) => item.type === "rectangle"), "rectangle saved to the canonical file");
    assert.equal((await scene("Untitled drawing")).type, "excalidraw");
    assert.equal(await page.frameLocator("#drawing-frame").locator(".excalidraw").evaluate((node) => node.classList.contains("theme--dark")), width === 390, "frame follows the app theme");
    if (screenshots) await page.screenshot({ path: path.join(screenshots, `drawing-${width}.png`) });

    // Rename moves the file and keeps the scene.
    await page.locator("#drawing-name").fill("System map");
    await page.locator("#drawing-name").press("Enter");
    await waitFor(() => exists(drawingFile("System map")), "renamed file");
    assert.equal(await exists(drawingFile("Untitled drawing")), false);
    await page.waitForFunction(() => new URL(location.href).searchParams.get("drawing") === "System map");
    assert.deepEqual((await readdir(path.join(root, "drawings"))).filter((name) => !name.endsWith(".excalidraw")), [], "no lock or temporary files remain");

    // An invalid name is refused without touching the file.
    await page.locator("#drawing-name").fill("bad/name");
    await page.locator("#drawing-name").press("Enter");
    await page.waitForFunction(() => document.getElementById("drawing-name").value === "System map");

    // The sidebar lists it; a mention can be copied.
    await page.locator("#sidebar-drawings a", { hasText: "System map" }).waitFor({ state: "attached" });
    await page.locator("#drawing-copy-mention").click();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), "[[System map.excalidraw]]");

    // Leaving immediately after an edit saves it first.
    await drawRectangle(page, 0.6, 0.45);
    await page.locator("#notes-link").click();
    await page.locator("#home-new").waitFor({ state: "visible" });
    assert.equal((await scene("System map")).elements.filter((item) => item.type === "rectangle").length, 2, "navigation waits for the pending drawing save");
    assert.equal(await page.locator("#drawing-frame").count(), 0, "leaving releases the editor frame");

    // Search finds drawings by file name without an index.
    const modifier = await page.evaluate(() => /Mac|iPhone|iPad/.test(navigator.platform) ? "Meta" : "Control");
    await page.keyboard.press(`${modifier}+k`);
    await page.locator("#note-search-input").fill("system");
    await page.locator('.search-result[data-kind="drawing"]', { hasText: "System map" }).waitFor({ state: "visible" });
    await page.keyboard.press("Enter");
    await ready(page);
    assert.equal(new URL(page.url()).searchParams.get("drawing"), "System map");

    // A mention in a note opens the drawing and never creates a note for it.
    await page.goto(`${server.url}/?note=${noteId}#apiKey=${key}`);
    await page.locator("#note-editor").waitFor({ state: "visible" });
    await page.locator("#note-editor", { hasText: "System map.excalidraw" }).waitFor();
    await page.locator("#note-editor .editor-page-reference, #note-editor [data-page-reference]").first().click();
    await ready(page);
    assert.equal(new URL(page.url()).searchParams.get("drawing"), "System map");
    assert.deepEqual(await readdir(path.join(root, "notes")), ["mention.md"], "a drawing mention creates no note");

    // Renaming rewrites mentions in notes and says so; renaming back restores them.
    for (const [from, to] of [["System map", "System sketch"], ["System sketch", "System map"]]) {
      await page.locator("#drawing-name").fill(to);
      await page.locator("#drawing-name").press("Enter");
      await page.locator("#toast-message").filter({ hasText: "Renamed. Updated mentions in 1 note." }).waitFor();
      await waitFor(async () => (await readFile(path.join(root, "notes/mention.md"), "utf8")).includes(`See [[${to}.excalidraw]] for`), "note mention follows the rename");
      assert.equal((await readFile(path.join(root, "notes/mention.md"), "utf8")).includes(`[[${from}.excalidraw]]`), false);
    }

    // The inline [[ picker offers drawing names and inserts a drawing mention.
    await page.goto(`${server.url}/?note=${noteId}#apiKey=${key}`);
    await page.locator("#note-editor", { hasText: "System map.excalidraw" }).waitFor();
    await page.locator("#note-editor").click();
    await page.keyboard.press(`${modifier}+End`);
    await page.keyboard.type(" [[system");
    await page.locator('[data-reference-autocomplete] [role=option]', { hasText: "System map" }).first().waitFor({ state: "visible" });
    await page.keyboard.press("Enter");
    await waitFor(async () => (await readFile(path.join(root, "notes/mention.md"), "utf8")).split("[[System map.excalidraw]]").length === 3, "picker inserted a drawing mention");
    await page.goto(`${server.url}/?drawing=${encodeURIComponent("System map")}#apiKey=${key}`);
    await ready(page);

    // An unopened item beyond the preview is revealed by a direct link.
    await page.goto(`${server.url}/?drawing=Existing%201#apiKey=${key}`);
    await ready(page);
    if (await page.locator("#open-drawings").isHidden()) await page.locator("#toggle-sidebar").click();
    await page.locator('#sidebar-drawings a[aria-current="page"]', { hasText: "Existing 1" }).waitFor({ state: "visible" });
    await page.goto(`${server.url}/?drawing=System%20map#apiKey=${key}`);
    await ready(page);

    // Browsing stays usable with unsaved work; selecting another drawing is guarded.
    await page.route("**/memories/all/drawings/System%20map", route => route.request().method() === "PUT"
      ? route.fulfill({ status: 503, contentType: "application/json", body: '{"error":{"code":"unavailable"}}' }) : route.continue());
    await drawRectangle(page, 0.45, 0.65);
    if (await page.locator("#open-drawings").isHidden()) await page.locator("#toggle-sidebar").click();
    await page.locator("#open-drawings").click();
    await page.locator("#sidebar-drawings a", { hasText: "Existing 7" }).click();
    await page.locator("#drawing-retry").waitFor({ state: "visible" });
    assert.equal(new URL(page.url()).searchParams.get("drawing"), "System map", "failed save blocks navigation");
    assert.equal(await page.evaluate(() => drawingsUI.hasPending()), true);
    await page.unroute("**/memories/all/drawings/System%20map");
    await page.locator("#drawing-retry").click();
    await saved(page);

    // A newer version on disk is never overwritten silently.
    const newer = await scene("System map");
    newer.elements = newer.elements.slice(0, 1);
    await writeFile(drawingFile("System map"), JSON.stringify(newer, null, 2) + "\n");
    await drawRectangle(page, 0.5, 0.55);
    await page.locator("#drawing-reload").waitFor({ state: "visible" });
    assert.equal((await scene("System map")).elements.length, 1, "conflicting save left the newer file intact");
    await page.locator("#drawing-reload").click();
    await saved(page);
    await drawRectangle(page, 0.5, 0.55);
    await saved(page);
    await waitFor(async () => (await scene("System map")).elements.length === 2, "edit after loading the newer version");

    // Keep mine replaces the other version explicitly.
    await writeFile(drawingFile("System map"), JSON.stringify({ ...newer, elements: [] }, null, 2) + "\n");
    await drawRectangle(page, 0.65, 0.6);
    await page.locator("#drawing-overwrite").waitFor({ state: "visible" });
    await page.locator("#drawing-overwrite").click();
    await saved(page);
    await waitFor(async () => (await scene("System map")).elements.length === 3, "kept local version");

    // Reload restores the saved scene; delete removes only the drawing.
    await page.reload();
    await ready(page);
    assert.equal((await scene("System map")).elements.length, 3);
    await page.locator("#drawing-delete").click();
    await page.locator("#drawing-delete-confirm").click();
    await page.locator("#home-new").waitFor({ state: "visible" });
    assert.equal(await exists(drawingFile("System map")), false);
    assert.equal(await exists(path.join(root, "notes/mention.md")), true);

    // A missing drawing explains itself.
    await page.goto(`${server.url}/?drawing=Nope#apiKey=${key}`);
    await page.locator("#drawing-empty", { hasText: "does not exist" }).waitFor({ state: "visible" });

    assert.deepEqual(external, [], "the app and drawing editor request nothing outside this server");
    // This fixture has no search index: note search fails while drawing names still match.
    assert.deepEqual(errors.filter((text) => !/status of (404|409|500|503)/.test(text)), [], "no page errors");
    assert.deepEqual(failures.filter((entry) => !/^(404|409|503) \/memories\/all\/drawings(?:\/|$)/.test(entry) && entry !== "500 /memories/all/search"), [],
      "only the expected conflict, missing-drawing and unindexed note-search responses fail");
    } catch (error) {
      if (screenshots) await page.screenshot({ path: path.join(screenshots, `drawing-failure-${width}.png`) }).catch(() => {});
      console.error({ errors, failures, external, state: await page.locator("#drawing-state").textContent().catch(() => null), notice: await page.locator("#drawing-notice-text").textContent().catch(() => null) });
      throw error;
    }
    await context.close();
    console.log(`drawings smoke passed at ${width}px`);
  }

  // The Mac app shell: the real gateway serves the frame and proxies the same routes.
  {
    const local = path.join(root, "local-brain"), support = path.join(root, "support"), controlKey = randomBytes(32).toString("hex");
    await mkdir(path.join(local, "notes"), { recursive: true });
    await mkdir(support, { mode: 0o700 });
    const { initializeMemoryRoot, createDrawing } = await import(new URL("../dist/runtime/index.js", import.meta.url).href);
    await initializeMemoryRoot(local);
    await createDrawing(root, "Shared sketch", { type: "excalidraw", version: 2, source: "fixture", elements: [{ id: "r1", type: "rectangle", x: 10, y: 10, width: 80, height: 50, angle: 0, strokeColor: "#1e1e1e", backgroundColor: "transparent", fillStyle: "solid", strokeWidth: 2, strokeStyle: "solid", roughness: 1, opacity: 100, groupIds: [], frameId: null, roundness: null, seed: 1, version: 1, versionNonce: 1, isDeleted: false, boundElements: null, updated: 1, link: null, locked: false, index: "a0" }], appState: {}, files: {} });
    const keys = new Map();
    gateway = await startCompanionGateway({ runtimeRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), directory: support, initialRoot: local, port: 0, controlKey,
      credentials: { get: async (ref) => keys.get(ref) ?? null, set: async (ref, value) => { keys.set(ref, value); }, delete: async (ref) => { keys.delete(ref); } } });
    const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    const page = await context.newPage();
    page.setDefaultTimeout(15_000);
    const errors = [], outside = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => { if (!request.url().startsWith(gateway.url) && !/^(data|blob|ws):/.test(request.url())) outside.push(request.url()); });
    const idle = () => page.waitForFunction(() => companionRegistered && !companionFrozen && companionState.phase === "idle");
    try {
      await page.goto(gateway.url + "/#companion=" + controlKey);
      await idle();
      await page.locator("#open-drawings").click();
      await page.locator("#drawings-list-state", { hasText: "No drawings yet" }).waitFor();
      assert.equal(await exists(path.join(local, "drawings")), false);
      await page.locator("#new-drawing").click();
      await ready(page);
      const localId = gateway.state().activeId;
      assert.equal(new URL(page.url()).searchParams.get("brain"), localId, "drawing links are scoped to the active brain");
      await drawRectangle(page, 0.55, 0.3);
      await saved(page);
      const stored = JSON.parse(await readFile(path.join(local, "drawings", "Untitled drawing.excalidraw"), "utf8"));
      assert.equal(stored.elements.filter((item) => item.type === "rectangle").length, 1, "the Mac shell saves into the selected local brain");
      if (screenshots) await page.screenshot({ path: path.join(screenshots, "drawing-companion.png") });

      // On the Mac, @ offers drawing names too and inserts the same mention.
      const localNote = "mem_90000000-0000-4000-8000-0000000000d2", localNoteFile = path.join(local, "notes", "at.md");
      await writeFile(localNoteFile, `---\nid: ${localNote}\ntype: note\ntitle: At fixture\n---\n\nSketch:\n`);
      await page.goto(gateway.url + "/?brain=" + localId + "&note=" + localNote);
      await idle();
      await page.locator("#note-editor", { hasText: "Sketch:" }).waitFor();
      await page.locator('#note-editor[contenteditable="true"]').waitFor({ state: "visible" });
      await page.locator("#note-editor").click();
      await page.keyboard.press((await page.evaluate(() => /Mac/.test(navigator.platform))) ? "Meta+End" : "Control+End");
      await page.keyboard.type(" @untitled");
      await page.locator('[data-reference-autocomplete] [role=option]', { hasText: "Untitled drawing" }).first().waitFor({ state: "visible" });
      await page.keyboard.press("Enter");
      await waitFor(async () => (await readFile(localNoteFile, "utf8")).includes("[[Untitled drawing.excalidraw]]"), "@ inserted a drawing mention in the local brain");

      // A remote brain without editing approval opens drawings view-only and saves nothing.
      const control = (route, body) => fetch(gateway.url + route, { method: "POST", headers: { Authorization: "Bearer " + controlKey, "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const added = await (await control("/companion/profiles", { revision: gateway.state().revision, profile: { name: "Shared", kind: "remote", url: server.url, key, allowWrites: false } })).json();
      const remote = added.profiles.find((profile) => profile.kind === "remote");
      await page.goto(gateway.url + "/settings");
      await idle();
      await page.locator(".companion-profile").filter({ hasText: "Shared" }).getByRole("button", { name: "Use this brain", exact: true }).click();
      await page.waitForURL((url) => url.searchParams.get("brain") === remote.id);
      await idle();
      assert.equal(gateway.state().activeId, remote.id);
      const before = await readFile(drawingFile("Shared sketch"), "utf8");
      await page.goto(gateway.url + "/?brain=" + remote.id + "&drawing=" + encodeURIComponent("Shared sketch"));
      await idle();
      await ready(page);
      await page.waitForFunction(() => document.getElementById("drawing-state").textContent === "Read only");
      assert.equal(await page.locator("#drawing-delete").isDisabled(), true);
      assert.equal(await page.locator("#drawing-name").evaluate((input) => input.readOnly), true);
      assert.equal(await page.locator("#drawings-list").isHidden(), false);
      await page.locator("#drawings-disclosure").click();
      await page.locator("#open-drawings").click();
      assert.equal(await page.locator("#new-drawing").isDisabled(), true);
      await page.locator("#drawing-create-reason", { hasText: "read only" }).waitFor();
      assert.equal(await page.locator("#sidebar-drawings").textContent().then(text => text.includes("Untitled drawing")), false, "old brain rows never leak into the new brain");
      assert.equal(new URL(page.url()).searchParams.get("drawing"), "Shared sketch", "a read-only brain creates nothing");
      assert.equal(await readFile(drawingFile("Shared sketch"), "utf8"), before, "a read-only brain is never rewritten");
      // The old brain's drawing link is refused on the new brain.
      await page.goto(gateway.url + "/?brain=" + localId + "&drawing=" + encodeURIComponent("Untitled drawing"));
      await idle();
      await page.waitForFunction(() => !new URL(location.href).searchParams.has("drawing"));
      assert.deepEqual(errors, [], "no page errors in the Mac shell");
      assert.deepEqual(outside, [], "the Mac shell requests nothing outside its gateway");
    } catch (error) {
      if (screenshots) await page.screenshot({ path: path.join(screenshots, "drawing-companion-failure.png") }).catch(() => {});
      console.error({ errors, outside, url: page.url(), state: await page.locator("#drawing-state").textContent().catch(() => null),
        editor: await page.evaluate(() => ({ markdown: richEditor.getMarkdown(), range: richEditor.autocompleteRange(),
          focused: document.activeElement?.id, text: document.getSelection()?.anchorNode?.textContent,
          offset: document.getSelection()?.anchorOffset, popup: document.querySelector('[data-reference-autocomplete]')?.textContent })).catch(() => null) });
      throw error;
    }
    await context.close();
    console.log("drawings smoke passed in the Mac app shell (real gateway, local and read-only remote brain)");
  }
} finally {
  await browser?.close();
  await gateway?.close?.();
  await server?.close?.();
  await rm(root, { recursive: true, force: true });
}
