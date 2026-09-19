// Disposable daily-capture browser smoke. Only writes to a newly created temp root.
// Build first: npm run build
// Run: JUMPYBRAIN_SMOKE_SCREENSHOT_DIR=/tmp/daily-capture-shots npx --package=playwright node scripts/daily-capture-smoke.mjs
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { indexMemory, initializeMemoryRoot } from "../dist/runtime/index.js";
import { startJumpyBrainHttpServer } from "../dist/server/index.js";
import { loadPlaywrightChromium } from "./playwright-runtime.mjs";

const screenshotDir = process.env.JUMPYBRAIN_SMOKE_SCREENSHOT_DIR;
const apiKey = "daily-capture-disposable-smoke-key";
const fixture = {
  id: "mem_f0000000-0000-4000-8000-000000000001",
  file: "notes/reference-fixture.md",
  title: "Luminous Orchard Exact Reference",
  query: "luminous",
};
const root = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-daily-capture-smoke-"));
const failures = [];
let browser;
let server;
try {
  const chromium = await loadPlaywrightChromium();
  await initializeMemoryRoot(root);
  await mkdir(path.join(root, "notes"), { recursive: true });
  await writeFile(path.join(root, fixture.file), [
    "---", `id: ${JSON.stringify(fixture.id)}`, 'type: "note"',
    `title: ${JSON.stringify(fixture.title)}`, 'created_at: "2026-07-22T00:00:00.000Z"',
    "---", "", `# ${fixture.title}`, "", "Luminous orchard reference fixture for disposable browser tests.", "",
  ].join("\n"));
  assert.equal((await indexMemory(root)).documents, 1, "real disposable QMD fixture indexed");
  server = await startJumpyBrainHttpServer({ root, apiKeys: [apiKey], port: 0, autoIndex: false });
  try { browser = await chromium.launch(); }
  catch (error) {
    if (!String(error?.message || error).includes("Executable doesn't exist")) throw error;
    browser = await chromium.launch({ channel: process.env.JUMPYBRAIN_PLAYWRIGHT_CHANNEL || "chrome" });
  }
  await run("protocol-empty-body-auth", validateProtocol);
  for (const mobile of [false, true]) {
    const label = mobile ? "mobile" : "desktop";
    await run(`${label}-creation-autosave`, (page) => validateCreation(page, label), mobile);
    await run(`${label}-lost-response`, (page) => validateLostResponse(page, label), mobile);
    await run(`${label}-references`, (page) => validateReferences(page, label), mobile);
    await run(`${label}-unsafe-reference-errors`, (page) => validateReferenceErrors(page, label), mobile);
    await run(`${label}-dirty-save-guard`, (page) => validateDirtyGuard(page, label), mobile);
    await run(`${label}-auth-retry`, (page) => validateAuthRetry(page, label), mobile);
  }
  await run("desktop-keyboard-shortcuts", validateShortcuts);
  await run("desktop-capture-search-roundtrip", validateSearchRoundtrip);
  console.log(`daily capture browser smoke: ${failures.length ? `FAIL (${failures.length})` : "PASS"}`);
  if (failures.length) process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (server) await server.close();
  await rm(root, { recursive: true, force: true });
}

async function run(name, test, mobile = false) {
  const context = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 820 },
    ...(mobile ? { isMobile: true, hasTouch: true } : {}),
    timezoneId: "Pacific/Kiritimati", // Explicit browser-local date, independent of server timezone.
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !/^Failed to load resource:|^Access to fetch/.test(message.text())) errors.push(message.text());
  });
  await page.route("**/favicon.ico", (route) => route.fulfill({ status: 204, body: "" }));
  try {
    await test(page);
    assert.deepEqual(errors, [], "unexpected browser JS errors");
    console.log(`  ok - ${name}`);
  } catch (error) {
    failures.push({ name, message: error.message });
    console.error(`  FAIL - ${name}: ${error.stack || error}`);
    await capture(page, `${name}-FAIL.png`).catch(() => {});
  } finally { await context.close(); }
}

async function validateProtocol(page) {
  const before = await noteFiles();
  const request = (endpoint, data, key, auth = apiKey) => page.request.post(server.url + endpoint, {
    headers: { Authorization: `Bearer ${auth}`, "Idempotency-Key": key }, data,
  });
  const draft = { type: "note", title: "Blank protocol note", body: "" };
  assert.equal((await request("/memories/all/notes", draft, "protocol-denied", "wrong-key")).status(), 401);
  assert.deepEqual(await noteFiles(), before, "unauthorized blank note must not write");
  for (const type of ["finding", "decision", "preference"]) {
    assert.equal((await request("/memories/all/notes", { ...draft, type }, `protocol-${type}`)).status(), 422,
      `empty ${type} must remain invalid`);
  }
  assert.equal((await request("/memories/all/wrapups", { title: "Blank wrapup", body: "" }, "protocol-wrapup")).status(), 422);
  assert.deepEqual(await noteFiles(), before, "rejected empty non-notes must not create notes");
  const response = await request("/memories/all/notes", draft, "protocol-blank-note");
  assert.equal(response.status(), 200);
  const created = await response.json();
  assert.match(created.id, /^mem_/);
  const markdown = await canonical(created.file);
  assert.match(markdown, /type: ["']?note/);
  assert.match(markdown, /# Blank protocol note/);
  const replay = await request("/memories/all/notes", draft, "protocol-blank-note");
  assert.equal((await replay.json()).id, created.id);
  assert.equal((await noteFiles()).length, before.length + 1);
}

async function home(page, label) {
  const reads = [];
  const listener = (request) => {
    if (/\/memories\/all\/(?:documents\/|graph\.json)/.test(request.url())) reads.push(request.url());
  };
  page.on("request", listener);
  await page.goto(`${server.url}/#apiKey=${encodeURIComponent(apiKey)}`);
  await page.locator("#home-new").waitFor({ state: "visible" });
  await page.waitForLoadState("networkidle");
  page.off("request", listener);
  assert.deepEqual(reads, [], "home does not eagerly load documents or graph");
  assert.equal(new URL(page.url()).hash, "");
  await layout(page, ["#home-new", "#home-search", "#new-note", "#open-connection"]);
  if (label) await capture(page, `${label}-home.png`);
}

function observeCreates(page) {
  const requests = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/memories/all/notes") {
      requests.push({ key: request.headers()["idempotency-key"], auth: request.headers().authorization, draft: request.postDataJSON() });
    }
  });
  return requests;
}

async function create(page, selector = "#home-new") {
  const response = page.waitForResponse((response) => new URL(response.url()).pathname === "/memories/all/notes" && response.request().method() === "POST");
  await page.locator(selector).click();
  const received = await response;
  assert.equal(received.status(), 200);
  const result = await received.json();
  await opened(page, result.id);
  return result;
}

async function opened(page, id) {
  await page.waitForURL((url) => url.searchParams.get("note") === id);
  await page.locator("#note-editor").waitFor({ state: "visible" });
  assert.equal(await page.locator("#capture-message").isVisible(), false);
}

async function validateCreation(page, label) {
  await home(page, label);
  const requests = observeCreates(page);
  const before = await noteFiles();
  const dates = [await localDay(page)];
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  await page.route("**/memories/all/notes", async (route) => { await gate; await route.continue(); });
  const response = page.waitForResponse((r) => new URL(r.url()).pathname === "/memories/all/notes");
  try {
    await page.locator("#home-new").dblclick();
    await page.waitForFunction(() => document.querySelector("#home-new").disabled);
    assert.equal(await page.locator("#new-note").isDisabled(), true);
    await page.keyboard.press("Control+n");
    await page.keyboard.press("Control+Shift+Enter");
    assert.equal(requests.length, 1, "double click and shortcuts while creating must issue one POST");
  } finally { release(); }
  const received = await response;
  assert.equal(received.status(), 200);
  const result = await received.json();
  await opened(page, result.id);
  dates.push(await localDay(page));
  assert.equal(requests[0].auth, `Bearer ${apiKey}`);
  assert.ok(requests[0].key, "authenticated creation carries an idempotency key");
  assert.deepEqual(Object.keys(requests[0].draft).sort(), ["body", "title", "type"]);
  assert.equal(requests[0].draft.body, "");
  assert.equal(requests[0].draft.type, "note");
  assert.match(result.title, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}$/);
  assert.ok(dates.includes(result.title.slice(0, 10)), "title uses browser-local date");
  assert.equal(await page.locator("#note-title").innerText(), result.title);
  const markdown = await canonical(result.file);
  assert.ok(markdown.includes(result.id));
  assert.match(markdown, /created_at: ["']?\d{4}-\d{2}-\d{2}T/);
  assert.equal((await noteFiles()).length, before.length + 1);
  const editor = page.locator("#note-editor");
  assert.equal(await editor.evaluate((element) => document.activeElement === element && element.selectionStart === element.value.length), true,
    "new capture focuses the body after the date heading, ready to type");
  const draft = `${await editor.inputValue()}\nSaved from ${label} daily-capture smoke.\n[[${fixture.title}]]\n`;
  await editor.fill(draft);
  await saved(page);
  assert.ok((await canonical(result.file)).includes(`Saved from ${label} daily-capture smoke.`));
  await page.reload();
  await opened(page, result.id);
  assert.equal(await editor.inputValue(), draft, "body survives real PUT and reload");
  await layout(page, ["#new-note", "#insert-reference", "#open-search", "#open-connection"]);
  await capture(page, `${label}-editor.png`);
  assert.equal(requests.length, 1);
}

async function validateSearchRoundtrip(page) {
  await home(page);
  const result = await create(page);
  const editor = page.locator("#note-editor");
  const body = "CaptureRoundtripZephyrDaily saved body. ";
  await editor.fill(body + "[[Luminous Orchard Exact Reference]] tail");
  // Insert from the middle of an existing reference, preserving the suffix and native undo.
  await editor.evaluate((element, offset) => element.setSelectionRange(offset, offset), body.length + 7);
  await page.locator("#insert-reference").click();
  await picker(page);
  await searchRealReference(page);
  await page.keyboard.press("Enter");
  await page.locator("#note-search").waitFor({ state: "hidden" });
  assert.equal(await editor.inputValue(), body + `[[${fixture.title}]] tail`);
  await saved(page);
  await page.reload();
  await opened(page, result.id);
  assert.equal(await editor.inputValue(), body + `[[${fixture.title}]] tail`);
  const indexed = await page.request.post(server.url + "/memories/all/index", { headers: { Authorization: `Bearer ${apiKey}` }, data: {} });
  assert.equal(indexed.status(), 200, "explicit server-local index rebuild succeeds");
  await page.locator("#home-link").click();
  await page.locator("#home-new").waitFor({ state: "visible" });
  await page.keyboard.press("Control+k");
  await page.locator("#note-search-input").fill("CaptureRoundtripZephyrDaily");
  const row = page.locator("#search-results [role='option']").filter({ hasText: result.title }).first();
  await row.waitFor({ state: "visible" });
  await row.click();
  await opened(page, result.id);
  assert.equal(await editor.inputValue(), body + `[[${fixture.title}]] tail`, "new note discoverable through normal search after indexing");
}

async function validateLostResponse(page, label) {
  await home(page);
  const requests = observeCreates(page);
  const before = await noteFiles();
  let committed;
  let lose = true;
  await page.route("**/memories/all/notes", async (route) => {
    if (!lose) { await route.continue(); return; }
    lose = false;
    const response = await route.fetch(); // Actually commit to disposable canonical Markdown first.
    assert.equal(response.status(), 200);
    committed = await response.json();
    await route.abort("failed"); // Browser never receives the committed response.
  });
  await page.locator("#home-new").click();
  await feedback(page, /Could not confirm note creation/);
  assert.ok(committed?.id, "server committed before response was dropped");
  assert.equal((await noteFiles()).length, before.length + 1);
  assert.equal(new URL(page.url()).search, "", "unconfirmed creation must remain home");
  await capture(page, `${label}-lost-response-error.png`);
  const retried = await create(page, "#new-note");
  assert.equal(retried.id, committed.id);
  assert.equal(requests.length, 2);
  assert.deepEqual(requests[1], requests[0], "retry preserves exact idempotency key and payload");
  assert.equal((await noteFiles()).length, before.length + 1, "lost-response retry must not duplicate Markdown");
}

async function validateShortcuts(page) {
  await home(page);
  const requests = observeCreates(page);
  for (const combination of ["Control+n", "Meta+n", "Control+Shift+Enter", "Meta+Shift+Enter"]) {
    const keys = combination.split("+");
    const key = keys.pop();
    const before = requests.length;
    const response = page.waitForResponse((r) => new URL(r.url()).pathname === "/memories/all/notes");
    for (const modifier of keys) await page.keyboard.down(modifier);
    await page.keyboard.down(key);
    const received = await response;
    assert.equal(received.status(), 200);
    await opened(page, (await received.json()).id);
    // A held key remains repeat=true even after the first POST has completed.
    await page.keyboard.down(key);
    await page.keyboard.down(key);
    await page.keyboard.up(key);
    for (const modifier of keys.reverse()) await page.keyboard.up(modifier);
    await page.waitForTimeout(250);
    assert.equal(requests.length, before + 1, `${combination} repeat must not create extra notes`);
    // Explicit second-click detail also tests suppression after a fast completed POST.
    await page.locator("#new-note").dispatchEvent("click", { detail: 2 });
    await page.waitForTimeout(100);
    assert.equal(requests.length, before + 1, "late second click must remain suppressed");
  }
  assert.equal(new Set(requests.map((request) => request.key)).size, 4, "independent captures get fresh keys");
}

async function validateReferences(page, label) {
  await home(page);
  const result = await create(page);
  const editor = page.locator("#note-editor");
  const baseline = `Daily ${label} reference context: `;
  await editor.fill(baseline);
  await saved(page);
  await editor.evaluate((element) => element.setSelectionRange(element.value.length, element.value.length));
  const url = page.url();
  await page.locator("#insert-reference").click();
  await picker(page);
  await searchRealReference(page);
  await layout(page, ["#note-search-input", "#close-search"]);
  await capture(page, `${label}-reference-search.png`);
  await page.keyboard.press("Enter");
  await page.locator("#note-search").waitFor({ state: "hidden" });
  assert.equal(await editor.inputValue(), baseline + `[[${fixture.title}]]`, "button/Enter inserts exact reference");
  assert.equal(page.url(), url, "insertion must not navigate");
  assert.equal(await editor.evaluate((element) => document.activeElement === element), true);
  await nativeUndo(page);
  assert.equal(await editor.inputValue(), baseline, "native undo removes button insertion as one operation");
  // Undoing to the already persisted baseline is clean, not a new save.
  assert.notEqual(await page.locator("#note-save-state").innerText(), "Save failed");

  // Real per-character browser input, not fill(), exercises the [[ input trigger.
  await editor.press("End");
  await page.keyboard.type("[[");
  await picker(page);
  const typed = await editor.inputValue();
  assert.equal(typed, baseline + "[[");
  await page.keyboard.press("Escape");
  await page.locator("#note-search").waitFor({ state: "hidden" });
  assert.equal(await editor.inputValue(), typed, "cancel keeps typed Markdown intact");
  assert.equal(await editor.evaluate((element) => document.activeElement === element), true);
  assert.deepEqual(await editor.evaluate((element) => [element.selectionStart, element.selectionEnd]), [typed.length, typed.length]);
  await nativeUndo(page);
  // Opening a modal may split the two typed characters into separate native
  // undo transactions; only the inserted reference must be one transaction.
  if (await editor.inputValue() === baseline + "[") await nativeUndo(page);
  assert.equal(await editor.inputValue(), baseline, "typed [[ remains natively undoable after cancellation");
  await page.keyboard.type("[[");
  await picker(page);
  await searchRealReference(page);
  await page.keyboard.press("Enter");
  await page.locator("#note-search").waitFor({ state: "hidden" });
  assert.equal(await editor.inputValue(), baseline + `[[${fixture.title}]]`, "trigger replaces opening brackets, no duplication");
  assert.equal(page.url(), url);
  await nativeUndo(page);
  assert.equal(await editor.inputValue(), baseline + "[[", "undo restores exact pre-insertion trigger text");
  // Save a final real reference by pointer, then confirm canonical Markdown and reload.
  await page.locator("#insert-reference").click();
  await picker(page);
  await searchRealReference(page);
  await page.locator("#search-results [role='option']").filter({ hasText: fixture.title }).first().click();
  await saved(page);
  assert.ok((await canonical(result.file)).includes(`[[${fixture.title}]]`));
  await page.reload();
  await opened(page, result.id);
  assert.equal(await editor.inputValue(), baseline + `[[${fixture.title}]]`);
}

async function validateReferenceErrors(page, label) {
  await home(page);
  const result = await create(page);
  const editor = page.locator("#note-editor");
  await editor.fill("Preserve this exact draft.");
  await saved(page);
  const url = page.url();
  let titles = [];
  await page.route("**/memories/all/search", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ index: { stale: false }, results: titles.map((title, index) => ({
      id: `notes/synthetic-${index}.md`, snippet: "Controlled unsafe/ambiguous reference result",
      provenance: { file: `notes/synthetic-${index}.md`, metadata: {
        id: `mem_f0000000-0000-4000-8000-${String(index + 10).padStart(12, "0")}`, title,
      } },
    })) }),
  }));
  for (const [index, list] of [["Duplicate Title", "duplicate title"], ["Unsafe [[title]]"], ["Unsafe|alias"], ["Unsafe#heading"], ["Unsafe/path"], ["Unsafe\\path"], ["Unsafe\nline"], [" Trailing space "]].entries()) {
    titles = list;
    await page.locator("#insert-reference").click();
    await picker(page);
    await page.locator("#note-search-input").fill(`synthetic-${index}`);
    await page.locator("#search-results [role='option']").first().waitFor({ state: "visible" });
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => /Several results share|no safe exact page title/.test(document.querySelector("#search-message").textContent));
    assert.equal(await page.locator("#note-search").isVisible(), true);
    assert.equal(await editor.inputValue(), "Preserve this exact draft.");
    assert.equal(page.url(), url);
    if (index < 2) await capture(page, `${label}-reference-${index === 0 ? "duplicate" : "unsafe"}-error.png`);
    await page.keyboard.press("Escape");
    await page.locator("#note-search").waitFor({ state: "hidden" });
  }
  assert.ok((await canonical(result.file)).includes("Preserve this exact draft."));
}

async function validateDirtyGuard(page, label) {
  await home(page);
  const result = await create(page);
  const requests = observeCreates(page);
  const editor = page.locator("#note-editor");
  const url = page.url();
  const baseline = await editor.inputValue();
  const draft = baseline + "\nDirty draft preserved despite failed save.\n";
  let puts = 0;
  const handler = async (route) => {
    if (route.request().method() !== "PUT") { await route.continue(); return; }
    puts++;
    await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: { code: "smoke_put_failure", message: "Controlled dirty-save failure" } }) });
  };
  const pattern = `**/memories/all/documents/${result.id}`;
  await page.route(pattern, handler);
  await editor.fill(draft);
  await saveState(page, "Save failed");
  await page.locator("#new-note").click();
  await feedback(page, /Could not leave the current note/);
  assert.equal(requests.length, 0, "failed dirty save prevents POST creation");
  assert.equal(page.url(), url);
  assert.equal(await editor.inputValue(), draft);
  assert.ok(puts >= 1);
  assert.ok(!(await canonical(result.file)).includes("Dirty draft preserved"), "failed PUT did not persist draft");
  await layout(page, ["#new-note", "#note-retry", "#insert-reference", "#open-connection"]);
  await capture(page, `${label}-dirty-save-error.png`);
  await page.unroute(pattern, handler);
  await page.locator("#note-retry").click();
  await saved(page);
  assert.ok((await canonical(result.file)).includes("Dirty draft preserved"));
  await create(page, "#new-note");
  assert.equal(requests.length, 1);
}

async function validateAuthRetry(page, label) {
  await home(page);
  const requests = observeCreates(page);
  const before = await noteFiles();
  await connection(page, "wrong-capture-key");
  const response = page.waitForResponse((r) => new URL(r.url()).pathname === "/memories/all/notes");
  await page.locator("#home-new").click();
  assert.equal((await response).status(), 401, "real server enforces auth on empty-body capture");
  await feedback(page, /Connect with an access key/);
  assert.deepEqual(await noteFiles(), before);
  await capture(page, `${label}-capture-auth-error.png`);
  await connection(page, apiKey);
  await create(page, "#new-note");
  assert.equal(requests.length, 2);
  assert.equal(requests[1].key, requests[0].key);
  assert.deepEqual(requests[1].draft, requests[0].draft);
  assert.equal((await noteFiles()).length, before.length + 1);
}

async function connection(page, key) {
  await page.locator("#open-connection").click();
  await page.locator("#api-key").fill(key);
  await page.locator("#connection-form button[type='submit']").click();
  await page.locator("#connection").waitFor({ state: "hidden" });
}
async function picker(page) {
  await page.locator("#note-search").waitFor({ state: "visible" });
  assert.equal(await page.locator("#note-search").getAttribute("aria-label"), "Insert page reference");
  assert.equal(await page.locator("#reference-help").isVisible(), true);
}
async function searchRealReference(page) {
  await page.locator("#note-search-input").fill(fixture.query);
  await page.locator("#search-results [role='option']").filter({ hasText: fixture.title }).first().waitFor({ state: "visible" });
  assert.match(await page.locator("#search-message").innerText(), /Enter to insert/);
}
async function nativeUndo(page) {
  // Linux/macOS Chromium mappings differ; execCommand invokes the native undo
  // stack, and never substitutes programmatic textarea assignment for undo.
  assert.equal(await page.evaluate(() => document.execCommand("undo")), true, "native textarea undo available");
}
async function localDay(page) {
  return page.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; });
}
async function saved(page) { await saveState(page, "Saved"); }
async function saveState(page, expected) {
  await page.waitForFunction((value) => document.querySelector("#note-save-state")?.textContent === value, expected);
}
async function feedback(page, pattern) {
  await page.waitForFunction((source) => {
    const message = document.querySelector("#capture-message");
    return !message.hidden && message.dataset.error === "true" && new RegExp(source).test(message.textContent);
  }, pattern.source);
}
async function layout(page, selectors) {
  const result = await page.evaluate((selectors) => ({
    width: innerWidth, documentWidth: document.documentElement.scrollWidth, bodyWidth: document.body.scrollWidth,
    controls: selectors.map((selector) => {
      const element = document.querySelector(selector);
      const rect = element?.getBoundingClientRect();
      return { selector, visible: Boolean(element?.getClientRects().length), left: rect?.left, right: rect?.right, top: rect?.top, bottom: rect?.bottom, width: rect?.width, height: rect?.height };
    }), height: innerHeight,
  }), selectors);
  assert.ok(result.documentWidth <= result.width && result.bodyWidth <= result.width, `no horizontal overflow: ${JSON.stringify(result)}`);
  for (const control of result.controls) {
    assert.ok(control.visible && control.width > 0 && control.height > 0, `visible ${control.selector}`);
    assert.ok(control.left >= 0 && control.right <= result.width + 1 && control.top >= 0 && control.bottom <= result.height + 1,
      `on-screen ${control.selector}: ${JSON.stringify(control)}`);
  }
}
async function canonical(file) {
  const absolute = path.resolve(root, file);
  assert.ok(absolute.startsWith(root + path.sep), "canonical path stays within disposable root");
  return readFile(absolute, "utf8");
}
async function noteFiles() { return (await readdir(path.join(root, "notes"))).filter((file) => file.endsWith(".md")).sort(); }
async function capture(page, filename) {
  if (!screenshotDir) return;
  await mkdir(screenshotDir, { recursive: true });
  await page.screenshot({ path: path.join(screenshotDir, filename), fullPage: true });
}
