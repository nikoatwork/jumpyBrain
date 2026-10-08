// Production integration smoke: real disposable Markdown, QMD index, built server.
// Build first: npm run build
// Run: npx --package=playwright node scripts/page-reference-smoke.mjs
// Optional: JUMPYBRAIN_REFERENCE_SMOKE_FILTER=<regex>, JUMPYBRAIN_REFERENCE_SMOKE_BENCH=1
// Narrow touch Chromium is NOT physical mobile/IME/AT/Safari/Firefox validation.
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { indexMemory, initializeMemoryRoot } from "../dist/runtime/index.js";
import { startJumpyBrainHttpServer } from "../dist/server/index.js";
import { loadPlaywrightChromium } from "./playwright-runtime.mjs";
import { editorMarkdown, editorEnd, selectEditorText, replaceEditorText, appendEditorText, undoEditor } from "./editor-smoke-helpers.mjs";

const apiKey = "page-reference-disposable-smoke-key";
const root = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-page-reference-smoke-"));
const popupSelector = "[data-reference-autocomplete]";
const referenceSelector = "#note-editor [data-page-reference]";
const source = fixture(1, "Page Reference Smoke Source");
const target = fixture(2, "Luminous Orchard Exact Reference");
const duplicate = fixture(3, "Duplicated Garden Title");
const duplicateOther = fixture(4, "duplicated garden title");
const idless = { file: "notes/idless.md", title: "Legacy Garden Without Identity" };
const missing = "Missing Garden Never Created";
const fixtures = [source, target, duplicate, duplicateOther, idless,
  ...Array.from({ length: 10 }, (_, index) => fixture(10 + index, `Luminous Orchard Almanac ${String(index + 1).padStart(2, "0")}`))];
// Select All replacement preserves its first block type; start with a paragraph.
const sourceBody = ["Source paragraph", "", `Paragraph [[${target.title}]] suffix.`, "",
  `## Heading [[${target.title}]]`, `- Bullet [[${target.title}]]`, "",
  `[[${missing}]]`, `[[${duplicate.title}]]`, `[[${idless.title}]]`, "",
  "Keep _original_ spelling and Unicode café 日本語 🐐.", ""].join("\n");
const failures = [];
const metrics = [];
const filter = process.env.JUMPYBRAIN_REFERENCE_SMOKE_FILTER ? new RegExp(process.env.JUMPYBRAIN_REFERENCE_SMOKE_FILTER) : null;
let browser, server, passed = 0;
try {
  const chromium = await loadPlaywrightChromium();
  await initializeMemoryRoot(root);
  await mkdir(path.join(root, "notes"), { recursive: true });
  for (const item of fixtures) await putFixture(item, item === source ? sourceBody : `# ${item.title}\n\n${item.title} canonical target evidence.\n`);
  const indexed = await indexMemory(root);
  assert.equal(indexed.documents, fixtures.length, "actual disposable QMD index contains every fixture");
  server = await startJumpyBrainHttpServer({ root, apiKeys: [apiKey], port: 0, autoIndex: false });
  try { browser = await chromium.launch(); }
  catch (error) {
    if (!String(error.message).includes("Executable doesn't exist")) throw error;
    browser = await chromium.launch({ channel: process.env.JUMPYBRAIN_PLAYWRIGHT_CHANNEL || "chrome" });
  }
  // Fail once and clearly when dist predates the parent integration, not dozens
  // of identical selector timeouts. No prototype installer or fake editor here.
  const preflight = await browser.newPage();
  try {
    await open(preflight);
    assert.equal(await preflight.evaluate(() => typeof window.installReferenceAutocomplete), "function", "rebuild dist: production autocomplete bundle is required");
    assert.equal(await preflight.locator("#reference-message").count(), 1, "rebuild dist: production navigation feedback is required");
    assert.equal(await preflight.locator(popupSelector).count(), 1, "production shell must install autocomplete");
    assert.ok(await preflight.locator(referenceSelector).count(), "production editor must recognize references");
  } finally { await preflight.close(); }
  for (const mobile of [false, true]) {
    const prefix = mobile ? "touch-390" : "desktop-1280";
    for (const [name, test] of [
      ["navigation-bytes-history-keyboard", navigationAndBytes],
      ["failed-save-guard-retry", failedSaveGuard],
      ["canonical-missing-ambiguous-idless", resolutionOutcomes],
      ["delayed-repeated-activation", repeatedActivation],
      ["resolution-modal-cancellation", resolutionCancellation],
      ["target-deleted-before-get", deletedTarget],
      ["typed-pasted-picker-edit-save-reload", persistence],
      ["selection-copy-drag-undo-redo", editing],
      ["inline-real-query-insert-suffix-undo", inlineInsertion],
      ["inline-loading-stale-empty-error-auth", inlineFeedback],
      ["inline-modal-credentials-document-cancel", inlineCancellation],
      ["inline-readonly-save-guard-cancel", readonlyCancellation],
      ["inline-escape-shortcut-composition", shortcuts],
    ]) await run(`${prefix}-${name}`, test, mobile);
    if (mobile) await run(`${prefix}-tap-versus-scroll`, touchScrolling, true);
    if (process.env.JUMPYBRAIN_REFERENCE_SMOKE_BENCH === "1") await run(`${prefix}-performance`, benchmark, mobile);
  }
  console.log(`page reference integration smoke: ${failures.length ? "FAIL" : "PASS"} (${passed} passed, ${failures.length} failed)`);
  if (metrics.length) console.log("metrics (observations, no time thresholds): " + JSON.stringify(metrics));
  if (!passed && !failures.length) throw new Error("Filter selected no scenarios");
  if (failures.length) process.exitCode = 1;
} finally {
  try { if (browser) await browser.close(); }
  finally {
    try { if (server) await server.close(); }
    finally { await rm(root, { recursive: true, force: true }); }
  }
}

function fixture(number, title) {
  return { id: `mem_a0000000-0000-4000-8000-${String(number).padStart(12, "0")}`, file: `notes/reference-${number}.md`, title };
}
function fixturePath(item) {
  const absolute = path.resolve(root, item.file);
  assert.ok(absolute.startsWith(root + path.sep), "fixture writes must stay within the freshly created temporary root");
  return absolute;
}
async function putFixture(item, body, crlf = false) {
  // One safe frontmatter template for all canonical fixtures, including benchmarks.
  const text = ["---", ...(item.id ? [`id: ${JSON.stringify(item.id)}`] : []), 'type: "note"',
    `title: ${JSON.stringify(item.title)}`, 'created_at: "2026-07-22T00:00:00.000Z"', 'custom: "preserve-reference-smoke"', "---", body].join("\n");
  await writeFile(fixturePath(item), crlf ? text.replace(/\n/g, "\r\n") : text);
}
async function bytes(item = source) { return readFile(fixturePath(item)); }
async function canonical(item = source) { return (await bytes(item)).toString("utf8"); }
function endpoint(request, suffix) { return new URL(request.url()).pathname === `/memories/all/${suffix}`; }
function reference(page, title = target.title) {
  return page.locator(referenceSelector).filter({ hasText: `[[${title}]]` }).first();
}
function popup(page) { return page.locator(popupSelector); }
function options(page) { return popup(page).locator("[role=option]"); }
async function open(page, item = source) {
  await page.goto(`${server.url}/?note=${item.id}#apiKey=${encodeURIComponent(apiKey)}`);
  await opened(page, item);
}
async function opened(page, item = source) {
  await page.waitForURL((url) => url.searchParams.get("note") === item.id);
  await page.locator("#note-editor").waitFor({ state: "visible" });
  await page.waitForFunction((title) => document.querySelector("#note-name")?.value === title, item.title);
}
async function state(page, text) {
  await page.waitForFunction((text) => document.querySelector("#note-save-state")?.textContent === text, text);
}
async function saved(page) { await state(page, "Saved"); }
async function settle(page) {
  // Beyond the actual 750ms autosave debounce; used only for negative assertions.
  await page.waitForTimeout(950);
}
async function markdownIs(page, value) {
  await page.waitForFunction((value) => richEditor.getMarkdown() === value, value);
}
async function feedback(page, pattern = /./) {
  await page.waitForFunction((pattern) => {
    const element = document.querySelector("#reference-message");
    return element && !element.hidden && new RegExp(pattern, "i").test(element.textContent);
  }, pattern.source);
}
async function inlineStatus(page, pattern) {
  await popup(page).waitFor({ state: "visible" });
  await page.waitForFunction(({ selector, pattern }) => new RegExp(pattern, "i").test(document.querySelector(selector + " [role=status]")?.textContent || ""),
    { selector: popupSelector, pattern: pattern.source });
}
async function activate(page, title = target.title, mobile = false) {
  // A caret left inside the preceding reference opens autocomplete over the next
  // link. Start each independent navigation gesture in plain text, and wait for
  // Lexical (not just the DOM selection) before exercising its selection guard.
  if (await page.locator("#note-editor").evaluate((element) => element.isContentEditable)) {
    await selectEditorText(page, 0);
    await page.waitForFunction(() => richEditor.captureSelection()?.isCollapsed() === true);
  }
  await popup(page).waitFor({ state: "hidden" });
  // Chromium combines rapid touch taps into double-tap word selection; this
  // scenario tests independent activations, not that intentionally native edit.
  if (mobile) { await page.waitForTimeout(550); await reference(page, title).tap(); }
  else await reference(page, title).click();
}
async function connection(page, key) {
  await page.locator("#open-connection").click();
  await page.locator("#api-key").fill(key);
  await page.locator("#connection-form button[type=submit]").click();
  await page.locator("#connection").waitFor({ state: "hidden" });
}
async function redo(page) {
  const modifier = await page.evaluate(() => /Mac|iPhone|iPad/.test(navigator.platform) ? "Meta" : "Control");
  await page.locator("#note-editor").focus();
  await page.keyboard.press(modifier + "+Shift+z");
}
function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}
async function hold(page, pattern, matches = () => true) {
  const started = deferred(), fetched = deferred(), released = deferred(), finished = deferred();
  let count = 0;
  const handler = async (route) => {
    if (!matches(route.request())) return route.continue();
    count++; started.resolve();
    try {
      // The server genuinely handles the request, but delivery is held. This
      // also exercises obsolete responses even if AbortController cancels fetch.
      const response = await route.fetch();
      fetched.resolve(response);
      await released.promise;
      await route.fulfill({ response });
    } catch (error) {
      if (!/closed|disposed|aborted|canceled|cancelled/i.test(String(error))) throw error;
    } finally { finished.resolve(); }
  };
  await page.route(pattern, handler);
  return { get started() { return bounded(started.promise, "held request to start"); },
    get fetched() { return bounded(fetched.promise, "real held response"); }, get count() { return count; },
    async release() { released.resolve(); },
    async close() { released.resolve(); if (count) await finished.promise; await page.unroute(pattern, handler); } };
}
async function bounded(promise, description) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timed out waiting for ${description}`)), 15_000);
  })]); } finally { clearTimeout(timer); }
}
async function run(name, test, mobile) {
  if (filter && !filter.test(name)) return;
  await putFixture(source, sourceBody, true);
  const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 },
    ...(mobile ? { isMobile: true, hasTouch: true } : {}) });
  const page = await context.newPage();
  page.setDefaultTimeout(12_000);
  page.setDefaultNavigationTimeout(15_000);
  const errors = [], requests = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !/^Failed to load resource:|^Access to fetch/.test(message.text())) errors.push(message.text());
  });
  page.on("request", (request) => requests.push(request));
  try {
    await open(page);
    await test(page, { mobile, requests, name });
    assert.deepEqual(errors, [], "no uncaught browser errors");
    assert.equal(requests.filter((request) => !request.url().startsWith(server.url)).length, 0, "no external browser requests");
    passed++;
    console.log(`  ok - ${name}`);
  } catch (error) {
    failures.push({ name, message: error.message });
    console.error(`  FAIL - ${name}: ${error.stack || error}`);
    console.error("  browser state: " + JSON.stringify(await page.evaluate(() => ({
      url: location.href, markdown: richEditor.getMarkdown(), selection: getSelection()?.toString(),
      anchor: getSelection()?.anchorNode?.parentElement?.outerHTML,
      active: document.activeElement?.id, popup: { visible: !document.querySelector("[data-reference-autocomplete]")?.hidden,
        text: document.querySelector("[data-reference-autocomplete]")?.textContent },
      feedback: document.querySelector("#reference-message")?.textContent,
      save: document.querySelector("#note-save-state")?.textContent,
    })).catch(() => null)));
    const dir = process.env.JUMPYBRAIN_SMOKE_SCREENSHOT_DIR;
    if (dir) {
      await mkdir(dir, { recursive: true });
      await page.screenshot({ path: path.join(dir, `${name}-FAIL.png`), fullPage: true }).catch(() => {});
    }
  } finally { await context.close(); }
}

async function navigationAndBytes(page, { mobile, requests }) {
  const original = await bytes(), targetOriginal = await bytes(target);
  assert.equal(await editorMarkdown(page), sourceBody);
  assert.equal(await reference(page).getAttribute("role"), "link");
  assert.equal(await reference(page).getAttribute("tabindex"), "0");
  await settle(page);
  assert.equal(requests.filter((request) => request.method() === "PUT").length, 0);
  await activate(page, target.title, mobile);
  await opened(page, target);
  const resolve = requests.filter((request) => endpoint(request, "resolve-title"));
  assert.equal(resolve.length, 1);
  assert.equal(resolve[0].method(), "POST");
  assert.equal(resolve[0].headers().authorization, `Bearer ${apiKey}`);
  assert.deepEqual(resolve[0].postDataJSON(), { title: target.title });
  assert.ok(!resolve[0].url().includes("Luminous"), "title only in POST body");
  await page.goBack(); await opened(page);
  assert.equal(await editorMarkdown(page), sourceBody);
  await page.goForward(); await opened(page, target);
  await page.goBack(); await opened(page);
  // Real sequential keyboard focus, not .focus() + a synthetic Enter callback.
  await page.locator("#note-editor").focus();
  for (let attempt = 0; attempt < 30; attempt++) {
    await page.keyboard.press("Tab");
    if (await reference(page).evaluate((element) => document.activeElement === element)) break;
  }
  assert.equal(await reference(page).evaluate((element) => document.activeElement === element), true, "Tab reaches a reference");
  await page.keyboard.press("Enter");
  await opened(page, target);
  await settle(page);
  assert.equal(requests.filter((request) => request.method() === "PUT").length, 0, "hydration, clicks, keyboard activation and history never dirty Markdown");
  assert.deepEqual(await bytes(), original, "source including CRLF/frontmatter is byte-identical");
  assert.deepEqual(await bytes(target), targetOriginal);
}

async function failedSaveGuard(page, { mobile, requests }) {
  const original = await bytes();
  const pattern = `**/memories/all/documents/${source.id}`;
  const fail = (route) => route.request().method() === "PUT" ? route.fulfill({ status: 500, contentType: "application/json",
    body: JSON.stringify({ error: { code: "smoke_save_failure", message: "Controlled disposable save failure" } }) }) : route.continue();
  await page.route(pattern, fail);
  await appendEditorText(page, "Unsaved guard evidence.");
  const draft = await editorMarkdown(page);
  await state(page, "Save failed");
  await activate(page, target.title, mobile);
  await feedback(page, /save|leave|retry/);
  assert.equal(new URL(page.url()).searchParams.get("note"), source.id);
  assert.equal(await editorMarkdown(page), draft);
  assert.deepEqual(await bytes(), original);
  assert.equal(requests.filter((r) => endpoint(r, `documents/${target.id}`)).length, 0, "failed guard never reads the target");
  await page.unroute(pattern, fail);
  await page.locator("#note-retry").click(); await saved(page);
  assert.ok((await canonical()).replace(/\r\n/g, "\n").endsWith(draft));
  await activate(page, target.title, mobile); await opened(page, target);
  await page.goBack(); await opened(page);
  assert.equal(await editorMarkdown(page), draft, "guarded retry retained and persisted source draft");
}

async function resolutionOutcomes(page, { mobile, requests }) {
  const original = await bytes();
  for (const [title, outcome] of [[missing, "missing"], [duplicate.title, "ambiguous"], [idless.title, "unopenable"]]) {
    const [received] = await Promise.all([
      page.waitForResponse((response) => endpoint(response, "resolve-title")),
      activate(page, title, mobile),
    ]);
    assert.equal(received.status(), 200);
    assert.deepEqual(await received.json(), { status: outcome });
    await feedback(page, outcome === "missing" ? /no |not found|missing/ : outcome === "ambiguous" ? /several|more than|ambiguous/ : /id|open|identity/);
    assert.equal(new URL(page.url()).searchParams.get("note"), source.id);
    assert.equal(await editorMarkdown(page), sourceBody);
  }
  await connection(page, "wrong-reference-key");
  const [rejected] = await Promise.all([
    page.waitForResponse((response) => endpoint(response, "resolve-title")),
    activate(page, target.title, mobile),
  ]);
  assert.equal(rejected.status(), 401, "real authenticated resolution rejects changed credentials");
  await feedback(page, /connect|key|access/);
  assert.equal(await editorMarkdown(page), sourceBody);
  assert.deepEqual(await bytes(), original);
  assert.equal(requests.filter((r) => r.method() === "PUT").length, 0);
}

async function repeatedActivation(page, { mobile }) {
  const gate = await hold(page, "**/memories/all/resolve-title");
  try {
    await activate(page, target.title, mobile); await gate.started;
    await activate(page, target.title, mobile);
    await activate(page, target.title, mobile);
    assert.equal(gate.count, 1, "repeated activation while resolution is in flight is deduplicated");
    assert.equal(new URL(page.url()).searchParams.get("note"), source.id);
    await gate.release(); await opened(page, target);
  } finally { await gate.close(); }
  await page.goBack(); await opened(page);
  assert.equal(await editorMarkdown(page), sourceBody, "one successful activation adds one history entry");
}

async function resolutionCancellation(page, { mobile }) {
  for (const selector of ["#open-search", "#open-connection"]) {
    const gate = await hold(page, "**/memories/all/resolve-title");
    try {
      await activate(page, target.title, mobile); await gate.started;
      await page.locator(selector).click();
      await page.locator(selector === "#open-search" ? "#note-search" : "#connection").waitFor({ state: "visible" });
      await gate.release(); await gate.close(); await settle(page);
      assert.equal(new URL(page.url()).searchParams.get("note"), source.id, "obsolete title resolution cannot navigate behind modal");
      assert.equal(await editorMarkdown(page), sourceBody);
      await page.keyboard.press("Escape");
    } finally { await gate.close(); }
  }
  await activate(page, target.title, mobile); await opened(page, target);
}

async function deletedTarget(page, { mobile, requests }) {
  const original = await bytes(target);
  const gate = await hold(page, "**/memories/all/resolve-title");
  try {
    await appendEditorText(page, "Draft survives deleted target.");
    const draft = await editorMarkdown(page);
    await saved(page);
    await activate(page, target.title, mobile); await gate.started;
    // Wait until the actual resolver has returned found before deleting. Holding
    // the GET instead would let the resolver itself legitimately return missing.
    assert.deepEqual(await (await gate.fetched).json(), { status: "found", id: target.id });
    await rm(fixturePath(target));
    await gate.release();
    await page.waitForFunction(() => /no longer|not found|could not|unavailable/i.test(
      document.querySelector("#reference-message")?.textContent + " " + document.querySelector("#note-message")?.textContent));
    assert.ok(requests.some((request) => request.method() === "GET" && endpoint(request, `documents/${target.id}`)), "deletion is exercised after found and before actual GET");
    if (new URL(page.url()).searchParams.get("note") !== source.id) { await page.goBack(); await opened(page); }
    assert.equal(await editorMarkdown(page), draft, "GET race must not lose the saved source draft");
    assert.ok((await canonical()).replace(/\r\n/g, "\n").endsWith(draft));
  } finally { await gate.close(); await writeFile(fixturePath(target), original); }
}

async function persistence(page, { mobile }) {
  await replaceEditorText(page, "Typed: ");
  await page.keyboard.type(`[[${target.title}]]`);
  await markdownIs(page, `Typed: [[${target.title}]]`);
  await saved(page);
  // Actual clipboard event path through the editor (not get/setMarkdown).
  const pasted = `\n\n## Pasted heading [[${target.title}]]\n- Pasted bullet [[${target.title}]]\nPicker: `;
  await editorEnd(page);
  await paste(page, pasted);
  await saved(page);
  await editorEnd(page);
  const beforePicker = await editorMarkdown(page);
  await page.locator("#insert-reference").click();
  await page.locator("#note-search-input").fill("luminous");
  const row = page.locator("#search-results [role=option]").filter({ hasText: target.title }).first();
  await row.waitFor({ state: "visible" });
  if (mobile) await row.tap(); else await row.click();
  await page.locator("#note-search").waitFor({ state: "hidden" });
  await markdownIs(page, beforePicker + `[[${target.title}]]`);
  await saved(page);
  const draft = await editorMarkdown(page);
  assert.equal(await page.locator(referenceSelector).count(), 4);
  assert.ok((await canonical()).replace(/\r\n/g, "\n").endsWith(draft));
  await page.reload(); await opened(page);
  assert.equal(await editorMarkdown(page), draft);
  assert.equal(await page.locator(referenceSelector).count(), 4);
  // Live title editing must reclassify without navigation or escaping brackets.
  const visible = await page.locator("#note-editor").textContent();
  const start = visible.indexOf(target.title);
  await selectEditorText(page, start, start + target.title.length);
  assert.equal(await page.evaluate(() => getSelection().toString()), target.title);
  await page.waitForFunction((length) => {
    const selection = richEditor.captureSelection();
    return selection?.anchor.key === selection?.focus.key
      && Math.abs(selection.anchor.offset - selection.focus.offset) === length;
  }, target.title.length);
  await page.keyboard.type(missing);
  await saved(page);
  assert.ok((await editorMarkdown(page)).includes(`[[${missing}]]`));
  await page.reload(); await opened(page);
  await activate(page, missing, mobile); await feedback(page, /no |missing|not found/);
}
async function paste(page, text) {
  await page.locator("#note-editor").evaluate((element, value) => {
    const clipboardData = new DataTransfer(); clipboardData.setData("text/plain", value);
    element.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData }));
  }, text);
}

async function editing(page, { requests }) {
  await replaceEditorText(page, `Before [[${target.title}]] after`); await saved(page);
  const baseline = await editorMarkdown(page);
  await selectEditorText(page, 7, 7 + target.title.length + 4);
  assert.equal(await page.evaluate(() => getSelection().toString()), `[[${target.title}]]`);
  const copy = await page.locator("#note-editor").evaluate((element) => {
    const clipboardData = new DataTransfer();
    element.dispatchEvent(new ClipboardEvent("copy", { bubbles: true, cancelable: true, clipboardData }));
    return clipboardData.getData("text/plain");
  });
  assert.equal(copy, `[[${target.title}]]`, "editor clipboard event preserves literal brackets (not OS clipboard coverage)");
  await selectEditorText(page, 0);
  const box = await reference(page).boundingBox();
  await page.mouse.move(box.x + 4, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + Math.min(box.width - 3, 95), box.y + box.height / 2, { steps: 12 });
  await page.mouse.up();
  assert.ok((await page.evaluate(() => getSelection().toString())).length > 0, "native drag selects reference text");
  assert.equal(requests.filter((r) => endpoint(r, "resolve-title")).length, 0, "copy/drag never resolves or navigates");
  assert.equal(await editorMarkdown(page), baseline);
  // Isolate history from the replacement operation by reloading the persisted text.
  await page.reload(); await opened(page);
  await selectEditorText(page, 7 + 2 + target.title.length, 7 + 4 + target.title.length);
  await page.keyboard.press("Backspace");
  await page.waitForFunction((selector) => !document.querySelector(selector), referenceSelector);
  const invalid = await editorMarkdown(page);
  assert.equal(invalid, `Before [[${target.title} after`);
  await undoEditor(page); await markdownIs(page, baseline);
  assert.equal(await page.locator(referenceSelector).count(), 1);
  await redo(page); await markdownIs(page, invalid);
  assert.equal(await page.locator(referenceSelector).count(), 0);
  await undoEditor(page); await markdownIs(page, baseline);
}

async function beginInline(page, prefix = "Query: ", query = "luminous") {
  await replaceEditorText(page, prefix); await saved(page);
  await editorEnd(page);
  await page.keyboard.type("[[" + query);
  await popup(page).waitFor({ state: "visible" });
}
async function chooseInline(page, title = target.title) {
  const row = options(page).filter({ hasText: title }).first();
  await row.waitFor({ state: "visible" });
  for (let index = 0; index < 20; index++) {
    if (await row.getAttribute("aria-selected") === "true") break;
    await page.keyboard.press("ArrowDown");
  }
  assert.equal(await row.getAttribute("aria-selected"), "true");
  await page.keyboard.press("Enter");
  await popup(page).waitFor({ state: "hidden" });
}
async function inlineInsertion(page, { requests, mobile }) {
  const targetOriginal = await bytes(target);
  const started = performance.now();
  await beginInline(page);
  await options(page).filter({ hasText: target.title }).first().waitFor({ state: "visible" });
  metrics.push({ kind: "real-partial-title-query", viewport: mobile ? 390 : 1280,
    query: "luminous", results: await options(page).allTextContents(), elapsedMs: +(performance.now() - started).toFixed(1) });
  const search = requests.filter((r) => endpoint(r, "search"));
  assert.ok(search.length, "inline uses real indexed search");
  for (const request of search) assert.equal(request.headers().authorization, `Bearer ${apiKey}`);
  assert.equal(await page.locator("#note-search").isVisible(), false, "[[ never opens the explicit modal");
  assert.equal(await page.locator("#note-editor").evaluate((element) => document.activeElement === element), true);
  await checkAria(page);
  const typed = await editorMarkdown(page);
  await chooseInline(page);
  await markdownIs(page, `Query: [[${target.title}]]`);
  await undoEditor(page); await markdownIs(page, typed);
  await redo(page); await markdownIs(page, `Query: [[${target.title}]]`);
  await saved(page); await page.reload(); await opened(page);
  assert.equal(await editorMarkdown(page), `Query: [[${target.title}]]`);
  // A complete reference supports replacement from inside; suffix must survive.
  // Unfinished mid-block queries are intentionally unsupported, so don't pretend
  // that this case proves cross-leaf or unfinished mid-block completion.
  const baseline = `Prefix [[luminous]] suffix **bold**`;
  // Load real formatted canonical Markdown: plain-text paste into an existing
  // reference selection intentionally preserves literal asterisks, not bold.
  await putFixture(source, baseline);
  await page.reload(); await opened(page);
  assert.equal(await editorMarkdown(page), baseline);
  await selectEditorText(page, "Prefix [[luminous".length);
  await options(page).filter({ hasText: target.title }).first().waitFor({ state: "visible" });
  await chooseInline(page);
  await markdownIs(page, `Prefix [[${target.title}]] suffix **bold**`);
  await undoEditor(page); await markdownIs(page, baseline);
  assert.equal(new URL(page.url()).searchParams.get("note"), source.id, "suggestions insert, never navigate");
  assert.deepEqual(await bytes(target), targetOriginal, "insertion cannot mutate targets");
}
async function checkAria(page) {
  const aria = await page.locator("#note-editor").evaluate((element) => {
    const active = element.getAttribute("aria-activedescendant");
    const selected = active && document.getElementById(active);
    return { autocomplete: element.getAttribute("aria-autocomplete"), controls: element.getAttribute("aria-controls"),
      list: selected?.parentElement?.id, role: selected?.getAttribute("role"), selected: selected?.getAttribute("aria-selected") };
  });
  assert.equal(aria.autocomplete, "list");
  assert.equal(aria.role, "option");
  assert.equal(aria.selected, "true");
  assert.ok(aria.controls.split(/\s+/).includes(aria.list));
  assert.equal(await popup(page).locator("[role=status]").getAttribute("aria-live"), "polite");
  assert.equal(await popup(page).locator("[role=listbox] [role=status]").count(), 0);
  const box = await popup(page).boundingBox(), viewport = page.viewportSize();
  assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1, "popup remains in viewport");
}

async function inlineFeedback(page) {
  await replaceEditorText(page, "Feedback: "); await saved(page);
  await editorEnd(page); await page.keyboard.type("[[");
  await inlineStatus(page, /type.*title/);
  const gate = await hold(page, "**/memories/all/search");
  try {
    await page.keyboard.type("luminous"); await gate.started;
    await inlineStatus(page, /search|loading/);
    // A real successful PUT, not a mocked stale bit, marks the independent inline
    // search stale even while its original pre-save indexed response is delayed.
    await saved(page);
    await gate.release();
    await options(page).filter({ hasText: target.title }).first().waitFor({ state: "visible" });
    await inlineStatus(page, /stale/);
  } finally { await gate.close(); }
  await page.keyboard.press("Escape");
  await beginInline(page, "Empty: ", "zzqneverindexedreference987654");
  await inlineStatus(page, /no .*match|no .*result|no .*found|nothing/);
  assert.equal(await options(page).count(), 0);
  const beforeEnter = await editorMarkdown(page);
  await page.keyboard.press("Enter");
  assert.notEqual(await editorMarkdown(page), beforeEnter, "ordinary Enter remains an edit when there is no selectable result");
  await page.route("**/memories/all/search", (route) => route.fulfill({ status: 503, contentType: "application/json",
    body: JSON.stringify({ error: { code: "smoke_search_failure", message: "Controlled disposable search outage" } }) }));
  await beginInline(page, "Error: "); await inlineStatus(page, /could not|error|unavailable|failed/);
  await page.keyboard.press("Escape");
  await page.unroute("**/memories/all/search");
  await saved(page);
  await connection(page, "wrong-inline-key");
  await editorEnd(page); await page.keyboard.type("\nAuth: [[luminous");
  await inlineStatus(page, /connect|access|key|auth/);
  const draft = await editorMarkdown(page);
  await state(page, "Save failed");
  await connection(page, apiKey);
  await page.locator("#note-retry").click(); await saved(page);
  assert.equal(await editorMarkdown(page), draft, "auth failure does not consume or rewrite the draft");
}

async function inlineCancellation(page) {
  for (const transition of ["search", "connection", "credentials", "document"]) {
    const gate = await hold(page, "**/memories/all/search");
    try {
      await beginInline(page, `${transition}: `); await gate.started;
      const draft = await editorMarkdown(page);
      if (transition === "search") await page.locator("#open-search").click();
      if (transition === "connection") await page.locator("#open-connection").click();
      if (transition === "credentials") await connection(page, apiKey);
      if (transition === "document") { await page.locator("#home-link").click(); await page.locator("#home-new").waitFor({ state: "visible" }); }
      await popup(page).waitFor({ state: "hidden" });
      await gate.release(); await gate.close(); await settle(page);
      assert.equal(await popup(page).isVisible(), false, `old response cannot reopen after ${transition}`);
      if (transition === "document") { await page.goBack(); await opened(page); }
      else if (transition === "search" || transition === "connection") await page.keyboard.press("Escape");
      assert.equal(await editorMarkdown(page), draft, `cancel ${transition} does not insert`);
    } finally { await gate.close(); }
  }
}

async function readonlyCancellation(page) {
  await replaceEditorText(page, "Read only transition: "); await saved(page);
  const gate = await hold(page, `**/memories/all/documents/${source.id}`, (r) => r.method() === "PUT");
  try {
    await editorEnd(page); await page.keyboard.type("[[luminous");
    await options(page).filter({ hasText: target.title }).first().waitFor({ state: "visible" });
    // Guarded Home navigation locks the actual editor while PUT is pending.
    await page.locator("#home-link").click(); await gate.started;
    await page.waitForFunction(() => document.querySelector("#note-editor").getAttribute("aria-readonly") === "true");
    await popup(page).waitFor({ state: "hidden" });
    await gate.release(); await page.locator("#home-new").waitFor({ state: "visible" });
    assert.equal(await popup(page).isVisible(), false);
    await page.goBack(); await opened(page);
    assert.equal(await editorMarkdown(page), "Read only transition: [[luminous");
  } finally { await gate.close(); }
}

async function shortcuts(page) {
  await beginInline(page);
  await options(page).first().waitFor({ state: "visible" });
  const draft = await editorMarkdown(page);
  await page.keyboard.press("Escape"); await popup(page).waitFor({ state: "hidden" });
  assert.equal(await editorMarkdown(page), draft);
  await settle(page);
  assert.equal(await popup(page).isVisible(), false, "Escape suppression survives autosave and context refresh");
  await page.keyboard.press("Enter");
  assert.notEqual(await editorMarkdown(page), draft, "Enter after Escape edits normally");
  for (const modifier of ["Control", "Meta"]) {
    await beginInline(page, `${modifier}: `);
    await options(page).first().waitFor({ state: "visible" });
    const before = await editorMarkdown(page);
    await page.keyboard.press(modifier + "+k");
    await page.locator("#note-search").waitFor({ state: "visible" });
    assert.equal(await page.locator("#note-search").getAttribute("aria-label"), "Search notes");
    assert.equal(await popup(page).isVisible(), false);
    assert.equal(await editorMarkdown(page), before);
    await page.keyboard.press("Escape");
  }
  await beginInline(page, "Composition: ");
  await options(page).first().waitFor({ state: "visible" });
  await page.locator("#note-editor").dispatchEvent("compositionstart", { data: "日" });
  await popup(page).waitFor({ state: "hidden" });
  await page.locator("#note-editor").dispatchEvent("compositionend", { data: "日" });
  // Synthetic event guard only: intentionally no physical-IME correctness claim.
}

async function touchScrolling(page) {
  await beginInline(page, "Touch: ");
  await options(page).filter({ hasText: target.title }).first().waitFor({ state: "visible" });
  const draft = await editorMarkdown(page);
  assert.ok(await options(page).count() > 4, "real indexed fixtures provide a scrollable list");
  const box = await popup(page).boundingBox();
  const session = await page.context().newCDPSession(page);
  try {
    const x = box.x + box.width / 2, y = box.y + box.height - 30;
    const start = await popup(page).evaluate((element) => element.scrollTop);
    await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    for (let step = 1; step <= 8; step++) {
      await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y - step * 14 }] });
      await page.waitForTimeout(25);
    }
    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.waitForTimeout(300);
    assert.equal(await editorMarkdown(page), draft, "touch scrolling must not choose the initial option");
    assert.equal(await popup(page).isVisible(), true);
    assert.ok(await popup(page).evaluate((element, start) => element.scrollTop > start, start), "Chromium native touch gesture actually scrolled the popup");
    const row = options(page).last(), title = await row.textContent();
    await row.scrollIntoViewIfNeeded(); await row.tap();
    await popup(page).waitFor({ state: "hidden" });
    await markdownIs(page, `Touch: [[${title}]]`);
    assert.equal(await page.locator("#note-editor").evaluate((element) => document.activeElement === element), true);
    await saved(page);
  } finally { await session.detach(); }
}

async function benchmark(page, { mobile }) {
  for (const lines of [100, 1000]) {
    const body = Array.from({ length: lines }, (_, index) => `Line ${index}: [[${target.title}]] [[${missing}]] [[${idless.title}]]`).join("\n") + "\n\nBench: ";
    // Reopen server-loaded canonical Markdown; don't benchmark a prototype or a
    // DOM rewrite. Includes HTTP/navigation/layout overhead and warm filesystem.
    await putFixture(source, body);
    const start = performance.now();
    await page.reload(); await opened(page);
    await page.waitForFunction(({ selector, count }) => document.querySelectorAll(selector).length === count, { selector: referenceSelector, count: lines * 3 });
    const hydrationMs = performance.now() - start;
    const samples = [];
    for (let sample = 0; sample < 3; sample++) {
      await editorEnd(page);
      const began = performance.now();
      await page.keyboard.type("[[luminous");
      await options(page).filter({ hasText: target.title }).first().waitFor({ state: "visible" });
      samples.push(+(performance.now() - began).toFixed(1));
      await page.keyboard.press("Escape");
      for (let char = 0; char < "[[luminous".length; char++) await page.keyboard.press("Backspace");
    }
    metrics.push({ kind: "production-large-note", viewport: mobile ? 390 : 1280, lines, references: lines * 3,
      hydrationMs: +hydrationMs.toFixed(1), autocompleteActivationMs: samples });
    await page.locator("#note-name").focus();
    await page.waitForFunction(() => !state.editor.state.dirty && state.editor.state.saveStatus !== "saving");
  }
}
